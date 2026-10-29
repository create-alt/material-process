#!/usr/bin/env python3
"""
研究室リサーチHub ローカルサーバー
  - /api/fetch-url : CORS回避のページ取得プロキシ（サイト自動探索で使用）
  - /api/slm       : PC上のローカルLLMサーバー（Ollama / LM Studio / llama.cpp）への中継
Usage: python server.py [port]
"""

import sys
import json
import urllib.request
import urllib.parse
import urllib.error
import ssl
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# /api/slm で中継してよい宛先（このPC上のLLMサーバーのみ）とAPIパス
SLM_ALLOWED_HOSTS = {'localhost', '127.0.0.1', '::1'}
SLM_ALLOWED_PATHS = ('/api/chat', '/api/tags', '/v1/chat/completions', '/v1/models')


class LabHubRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/fetch-url':
            self.handle_fetch_url(parsed.query)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/slm':
            self.handle_slm_proxy()
            return
        self.send_json(404, {'error': 'not found'})

    def handle_slm_proxy(self):
        """ブラウザからローカルLLMサーバーへのリクエストを中継（CORS回避）"""
        try:
            length = int(self.headers.get('Content-Length', '0'))
            req = json.loads(self.rfile.read(length) or b'{}')
        except Exception:
            self.send_json(400, {'error': 'リクエストが不正です'}, slm=True)
            return

        base = urllib.parse.urlparse(str(req.get('base', '')))
        path = str(req.get('path', ''))
        method = 'GET' if req.get('method') == 'GET' else 'POST'
        if base.scheme not in ('http', 'https') or base.hostname not in SLM_ALLOWED_HOSTS:
            self.send_json(400, {'error': 'ローカルLLMサーバーは localhost / 127.0.0.1 のみ指定できます'}, slm=True)
            return
        if not path.startswith(SLM_ALLOWED_PATHS):
            self.send_json(400, {'error': '許可されていないAPIパスです'}, slm=True)
            return

        url = f'{base.scheme}://{base.netloc}{path}'
        data = None if method == 'GET' else json.dumps(req.get('payload') or {}).encode('utf-8')
        upstream = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json'})
        # localhost 宛てなので環境変数のプロキシ設定は使わない
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(upstream, timeout=300) as resp:
                body = resp.read()
                self.send_raw(resp.status, body)
        except urllib.error.HTTPError as e:
            self.send_raw(e.code, e.read() or json.dumps({'error': f'HTTP {e.code}'}).encode('utf-8'))
        except Exception as e:
            self.send_json(502, {'error': f'ローカルLLMサーバー({base.netloc})に接続できません: {e}'}, slm=True)

    def send_raw(self, status_code, body):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('X-LabHub-Proxy', '1')
        self.end_headers()
        self.wfile.write(body)

    def handle_fetch_url(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        target_url = params.get('url', [''])[0].strip()

        if not target_url or not (target_url.startswith('http://') or target_url.startswith('https://')):
            self.send_json(400, {'error': '有効なURL (http:// または https://) を指定してください。'})
            return

        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            req = urllib.request.Request(
                target_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 LabResearchHub/1.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                }
            )

            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                raw_bytes = resp.read()
                content_type = resp.headers.get('Content-Type', '')
                final_url = resp.geturl()

            html_text = self.decode_bytes(raw_bytes, content_type)
            self.send_json(200, {
                'ok': True,
                'url': final_url,
                'contentType': content_type,
                'html': html_text
            })
        except urllib.error.HTTPError as e:
            self.send_json(e.code, {'error': f'対象ページが HTTP {e.code} を返しました。'})
        except Exception as e:
            self.send_json(500, {'error': f'URLの取得に失敗しました: {str(e)}'})

    @staticmethod
    def decode_bytes(raw_bytes, content_type):
        # Content-Type から charset を検出
        lower_ct = content_type.lower()
        encodings = []
        if 'charset=' in lower_ct:
            charset = lower_ct.split('charset=')[-1].split(';')[0].strip().strip('"\'')
            if charset:
                encodings.append(charset)

        encodings.extend(['utf-8', 'cp932', 'shift_jis', 'euc_jp', 'iso-2022-jp'])
        for enc in encodings:
            try:
                return raw_bytes.decode(enc)
            except Exception:
                continue
        return raw_bytes.decode('utf-8', errors='replace')

    def send_json(self, status_code, payload, slm=False):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        if slm:
            self.send_header('X-LabHub-Proxy', '1')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(('0.0.0.0', port), LabHubRequestHandler)
    print(f'Serving Lab Research Hub at http://localhost:{port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

