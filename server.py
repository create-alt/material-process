#!/usr/bin/env python3
"""
研究室リサーチHub ローカルサーバー (CORS回避URL取得プロキシ内蔵)
Usage: python server.py [port]
"""

import sys
import json
import urllib.request
import urllib.parse
import urllib.error
import ssl
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class LabHubRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/fetch-url':
            self.handle_fetch_url(parsed.query)
            return
        super().do_GET()

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
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
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

    def send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
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

