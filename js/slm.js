/**
 * ローカルSLM（小規模言語モデル）連携モジュール
 * 外部のクラウドAPIを使わず、手元のPCだけで動く言語モデルで
 * 「どの行が研究室か」「どのリンクをたどるべきか」を文脈から判定します。
 *
 * バックエンド:
 *   - webllm : ブラウザ内で実行（WebLLM / WebGPU）。初回のみモデルをダウンロードしブラウザにキャッシュ
 *   - server : PC上のローカルLLMサーバー（Ollama / LM Studio / llama.cpp など）
 *   - none   : SLMを使わずルール（ヒューリスティック）のみ
 */

const WEBLLM_MODULE_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.85';

class LocalSlm {
  constructor() {
    // WebLLMの事前ビルド済みモデル（必要VRAMは WebLLM 0.2.85 の定義値）
    this.webllmModels = [
      { id: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Qwen3.5 2B（推奨・日本語◎・約2.2GB）' },
      { id: 'Qwen3.5-0.8B-q4f16_1-MLC', label: 'Qwen3.5 0.8B（最軽量・低スペックPC向け）' },
      { id: 'gemma-2-2b-jpn-it-q4f16_1-MLC', label: 'Gemma 2 2B 日本語版（約1.9GB）' },
      { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 3B（高精度・約2.5GB）' },
      { id: 'Qwen3.5-4B-q4f16_1-MLC', label: 'Qwen3.5 4B（最高精度・約3.9GB）' }
    ];
    // ローカルサーバー向けのおすすめモデル（Ollamaのモデル名）
    this.serverModelHints = ['qwen2.5:3b', 'qwen3:4b', 'gemma3:4b', 'qwen2.5:7b'];

    this.config = {
      backend: 'none',
      webllmModel: this.webllmModels[0].id,
      serverFlavor: 'ollama',
      serverUrl: 'http://127.0.0.1:11434',
      serverModel: 'qwen2.5:3b',
      ...this.loadConfig()
    };
    this.engine = null;
    this.engineModel = null;
    this.loadingPromise = null;
  }

  loadConfig() {
    try {
      return JSON.parse(localStorage.getItem('labhub_slm_config') || '{}');
    } catch {
      return {};
    }
  }

  saveConfig(patch) {
    this.config = { ...this.config, ...patch };
    localStorage.setItem('labhub_slm_config', JSON.stringify(this.config));
    // モデルを変えたらブラウザ内エンジンは読み直し
    if (this.engineModel && this.engineModel !== this.config.webllmModel) this.unload();
  }

  isEnabled() {
    return this.config.backend === 'webllm' || this.config.backend === 'server';
  }

  isLoaded() {
    return this.config.backend === 'server' || (!!this.engine && this.engineModel === this.config.webllmModel);
  }

  describe() {
    if (this.config.backend === 'webllm') return `ブラウザ内: ${this.config.webllmModel.replace(/-q4f\d+_1-MLC$/, '')}`;
    if (this.config.backend === 'server') return `ローカルサーバー: ${this.config.serverModel}`;
    return 'OFF（ルールのみ）';
  }

  hasWebGpu() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }

  /**
   * 推論できる状態にする（ブラウザ内モデルはここでダウンロード・初期化）
   * @param {(progress: number, text: string) => void} onProgress
   */
  async ensureReady(onProgress = () => {}) {
    if (this.config.backend === 'server') return;
    if (this.config.backend !== 'webllm') throw new Error('ローカルSLMが無効です');
    if (this.isLoaded()) return;
    if (this.loadingPromise) return this.loadingPromise;

    const adapter = this.hasWebGpu() ? await navigator.gpu.requestAdapter().catch(() => null) : null;
    if (!adapter) {
      throw new Error('このブラウザ/PCではWebGPUが使えません。最新のChrome/Edgeを使うか「ローカルLLMサーバー（Ollama等）」を選んでください。');
    }
    this.loadingPromise = (async () => {
      onProgress(0, 'WebLLMを読み込み中...');
      const webllm = await import(WEBLLM_MODULE_URL);
      const model = this.config.webllmModel;
      this.engine = await webllm.CreateMLCEngine(model, {
        initProgressCallback: (report) => onProgress(report.progress || 0, report.text || '')
      });
      this.engineModel = model;
      onProgress(1, 'モデルの準備ができました');
    })();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  async unload() {
    const engine = this.engine;
    this.engine = null;
    this.engineModel = null;
    if (engine && engine.unload) await engine.unload().catch(() => {});
  }

  /**
   * JSONで回答させる（スキーマで出力形式を制約し、小さなモデルでも崩れにくくする）
   * @param {{system: string, user: string, schema: object, maxTokens?: number}} req
   * @returns {Promise<object>}
   */
  async chatJson({ system, user, schema, maxTokens = 800 }) {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];

    let content = '';
    if (this.config.backend === 'webllm') {
      await this.ensureReady();
      const reply = await this.engine.chat.completions.create({
        messages,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object', schema: JSON.stringify(schema) },
        extra_body: { enable_thinking: false }
      });
      content = reply.choices?.[0]?.message?.content || '';
    } else if (this.config.backend === 'server') {
      content = await this.chatServer(messages, schema, maxTokens);
    } else {
      throw new Error('ローカルSLMが無効です');
    }
    return this.parseJson(content);
  }

  async chatServer(messages, schema, maxTokens) {
    const { serverFlavor, serverModel } = this.config;
    if (serverFlavor === 'ollama') {
      const data = await this.requestServer('/api/chat', {
        model: serverModel,
        messages,
        stream: false,
        format: schema,
        options: { temperature: 0, num_predict: maxTokens, num_ctx: 8192 }
      });
      return data.message?.content || '';
    }

    // OpenAI互換API（LM Studio / llama.cpp server / Ollama の /v1）
    const body = {
      model: serverModel,
      messages,
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: 'json_schema', json_schema: { name: 'result', schema } }
    };
    let data;
    try {
      data = await this.requestServer('/v1/chat/completions', body);
    } catch (e) {
      // json_schema 非対応サーバー向けのフォールバック
      data = await this.requestServer('/v1/chat/completions', { ...body, response_format: { type: 'json_object' } });
    }
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * ローカルLLMサーバーへのリクエスト
   * server.py 経由（CORS回避）を優先し、使えなければ直接アクセス
   */
  async requestServer(path, payload, method = 'POST', timeoutMs = 180000) {
    const base = this.config.serverUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const handle = async (res) => {
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (!res.ok) throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
      return data;
    };

    try {
      if (window.location.protocol.startsWith('http')) {
        const res = await fetch('/api/slm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base, path, method, payload }),
          signal: controller.signal
        }).catch(() => null);
        // server.py 以外で配信されている場合（404等）は直接アクセスへ
        if (res && res.headers.get('x-labhub-proxy') === '1') return await handle(res);
      }
      const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(payload) : undefined,
        signal: controller.signal
      });
      return await handle(res);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('ローカルSLMの応答がタイムアウトしました');
      if (e instanceof TypeError) throw new Error(`ローカルLLMサーバー(${base})に接続できません。起動しているか確認してください`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async listServerModels() {
    if (this.config.serverFlavor === 'ollama') {
      const data = await this.requestServer('/api/tags', null, 'GET', 15000);
      return (data.models || []).map(m => m.name);
    }
    const data = await this.requestServer('/v1/models', null, 'GET', 15000);
    return (data.data || []).map(m => m.id);
  }

  /**
   * 接続・推論テスト（短い問いでJSONが返るか確認）
   */
  async test(onProgress) {
    await this.ensureReady(onProgress);
    const started = performance.now();
    const result = await this.chatJson({
      system: 'あなたは情報抽出器です。JSONのみを出力します。',
      user: '次の行から研究室名を抜き出してください: 「山田 太郎 教授（自然言語処理）」',
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      },
      maxTokens: 60
    });
    return { result, ms: Math.round(performance.now() - started) };
  }

  /**
   * モデル出力からJSONを取り出す（思考タグやコードブロックを除去）
   */
  parseJson(content) {
    const cleaned = String(content || '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/```(?:json)?/g, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          // fallthrough
        }
      }
      throw new Error('SLMの出力をJSONとして読み取れませんでした');
    }
  }
}

window.localSlm = new LocalSlm();
