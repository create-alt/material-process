/**
 * ローカルSLM（小規模言語モデル）連携モジュール
 * 外部のクラウドAPIを使わず、手元のPCだけで動く言語モデルで
 * 「どの行が研究室か」「どのリンクをたどるべきか」を文脈から判定します。
 *
 * バックエンド:
 *   - browser : ブラウザ内で実行。初回のみモデルをダウンロードしブラウザにキャッシュ
 *               ・GPU: WebLLM（WebGPU）… 高速
 *               ・CPU: Transformers.js（WebAssembly）… WebGPUが無いPCでも動作（Web Workerで実行）
 *               エンジン「自動」ではWebGPUが使えればGPU、使えなければCPUで動かす
 *   - server  : PC上のローカルLLMサーバー（Ollama / LM Studio / llama.cpp など。GPUが無くてもCPUで動作）
 *   - none    : SLMを使わずルール（ヒューリスティック）のみ
 */

const WEBLLM_MODULE_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.85';
const CPU_WORKER_URL = 'js/slm-worker.js?v=12';

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
    // CPU（WebAssembly）で動かすモデル（Transformers.js 用ONNXモデル。4bit量子化で軽量化）
    this.cpuModels = [
      { id: 'onnx-community/Qwen3-0.6B-ONNX', label: 'Qwen3 0.6B（推奨・約0.5GB）' },
      { id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B（最軽量・高速）' },
      { id: 'onnx-community/gemma-3-1b-it-ONNX', label: 'Gemma 3 1B（日本語◎・約1GB）' },
      { id: 'onnx-community/Qwen3-1.7B-ONNX', label: 'Qwen3 1.7B（高精度・低速、メモリ8GB以上推奨）' }
    ];
    // ローカルサーバー向けのおすすめモデル（Ollamaのモデル名）
    this.serverModelHints = ['qwen2.5:3b', 'qwen3:4b', 'gemma3:4b', 'qwen2.5:7b'];

    const saved = this.loadConfig();
    // 旧設定（backend: 'webllm'）からの移行
    if (saved.backend === 'webllm') saved.backend = 'browser';
    this.config = {
      backend: 'none',
      browserEngine: 'auto',
      webllmModel: this.webllmModels[0].id,
      cpuModel: this.cpuModels[0].id,
      serverFlavor: 'ollama',
      serverUrl: 'http://127.0.0.1:11434',
      serverModel: 'qwen2.5:3b',
      ...saved
    };
    this.engine = null;
    this.engineModel = null;
    this.activeEngine = null; // 'webgpu' | 'cpu'（読み込み済みのエンジン）
    this.engineNote = '';
    this.worker = null;
    this.workerModel = null;
    this.workerSeq = 0;
    this.workerPending = new Map();
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
    const prev = this.config;
    this.config = { ...this.config, ...patch };
    localStorage.setItem('labhub_slm_config', JSON.stringify(this.config));
    // エンジン・モデルを変えたらブラウザ内エンジンは読み直し
    if (prev.browserEngine !== this.config.browserEngine
      || (this.engineModel && this.engineModel !== this.config.webllmModel)
      || (this.workerModel && this.workerModel !== this.config.cpuModel)
      || this.config.backend !== 'browser') {
      this.unload();
    }
  }

  isEnabled() {
    return this.config.backend === 'browser' || this.config.backend === 'server';
  }

  isLoaded() {
    if (this.config.backend === 'server') return true;
    if (this.activeEngine === 'webgpu') return !!this.engine && this.engineModel === this.config.webllmModel;
    if (this.activeEngine === 'cpu') return !!this.worker && this.workerModel === this.config.cpuModel;
    return false;
  }

  modelLabel(engine = this.activeEngine) {
    if (engine === 'cpu') return this.config.cpuModel.replace(/^onnx-community\//, '').replace(/-ONNX$/, '');
    return this.config.webllmModel.replace(/-q4f\d+_1-MLC$/, '');
  }

  describe() {
    if (this.config.backend === 'browser') {
      if (this.activeEngine) return `ブラウザ内(${this.activeEngine === 'cpu' ? 'CPU' : 'GPU'}): ${this.modelLabel()}`;
      const pref = { auto: '自動', webgpu: 'GPU優先', cpu: 'CPU' }[this.config.browserEngine] || '自動';
      return `ブラウザ内(${pref})`;
    }
    if (this.config.backend === 'server') return `ローカルサーバー: ${this.config.serverModel}`;
    return 'OFF（ルールのみ）';
  }

  hasWebGpu() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
  }

  /**
   * 実際に使うエンジンを決める（WebGPUが使えなければCPUで実行）
   * @returns {Promise<{engine: 'webgpu'|'cpu', note: string}>}
   */
  async resolveBrowserEngine() {
    const pref = this.config.browserEngine || 'auto';
    if (pref === 'cpu') return { engine: 'cpu', note: 'CPU（WebAssembly）で実行します' };
    const adapter = this.hasWebGpu() ? await navigator.gpu.requestAdapter().catch(() => null) : null;
    if (adapter) return { engine: 'webgpu', note: 'WebGPU（GPU）で実行します' };
    return { engine: 'cpu', note: 'WebGPUが使えないため、CPU（WebAssembly）で実行します' };
  }

  /**
   * 速度に応じた1回あたりの入力量（CPUは遅いため小さく区切り、1ページあたりの回数も制限）
   */
  profile() {
    const cpu = this.config.backend === 'browser' && this.activeEngine === 'cpu';
    return cpu
      ? { chunkChars: 800, maxChunksPerPage: 4, maxLinks: 30, slow: true }
      : { chunkChars: 1400, maxChunksPerPage: 12, maxLinks: 60, slow: false };
  }

  /**
   * 推論できる状態にする（ブラウザ内モデルはここでダウンロード・初期化）
   * @param {(progress: number, text: string) => void} onProgress
   */
  async ensureReady(onProgress = () => {}) {
    if (this.config.backend === 'server') return;
    if (this.config.backend !== 'browser') throw new Error('ローカルSLMが無効です');
    if (this.isLoaded()) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const { engine, note } = await this.resolveBrowserEngine();
      this.engineNote = note;
      onProgress(0, note);
      if (engine === 'webgpu') {
        try {
          await this.loadWebLlm(onProgress);
          this.activeEngine = 'webgpu';
          return;
        } catch (e) {
          // GPUでの初期化に失敗した場合（ドライバ・VRAM不足など）もCPUで続行
          console.warn('[SLM] WebGPU init failed, falling back to CPU:', e);
          this.engineNote = `GPUで初期化できなかったため、CPU（WebAssembly）で実行します（${e.message}）`;
          onProgress(0, this.engineNote);
        }
      }
      await this.loadCpu(onProgress);
      this.activeEngine = 'cpu';
    })();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  async loadWebLlm(onProgress) {
    onProgress(0, 'WebLLM（GPU）を読み込み中...');
    const webllm = await import(WEBLLM_MODULE_URL);
    const model = this.config.webllmModel;
    this.engine = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (report) => onProgress(report.progress || 0, report.text || '')
    });
    this.engineModel = model;
    onProgress(1, 'モデルの準備ができました（GPU）');
  }

  async loadCpu(onProgress) {
    if (typeof Worker === 'undefined') throw new Error('このブラウザはWeb Workerに対応していません');
    if (!this.worker) {
      this.worker = new Worker(CPU_WORKER_URL, { type: 'module' });
      this.worker.onmessage = (e) => this.onWorkerMessage(e.data);
      this.worker.onerror = (e) => {
        const err = new Error(`CPU実行ワーカーでエラーが発生しました: ${e.message || 'モジュールを読み込めません'}`);
        this.workerPending.forEach(p => p.reject(err));
        this.workerPending.clear();
        this.terminateWorker();
      };
    }
    onProgress(0, 'CPU用モデル（WebAssembly）を準備中...');
    const result = await this.callWorker({ type: 'load', model: this.config.cpuModel, dtypes: ['q4', 'q8'] }, onProgress, 30 * 60 * 1000);
    this.workerModel = this.config.cpuModel;
    onProgress(1, `モデルの準備ができました（CPU・${result.dtype}・${result.threads}スレッド）`);
  }

  callWorker(message, onProgress = () => {}, timeoutMs = 5 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      const id = ++this.workerSeq;
      const timer = setTimeout(() => {
        this.workerPending.delete(id);
        reject(new Error('ローカルSLM（CPU）の応答がタイムアウトしました'));
      }, timeoutMs);
      this.workerPending.set(id, {
        onProgress,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      this.worker.postMessage({ id, ...message });
    });
  }

  onWorkerMessage(msg) {
    const pending = this.workerPending.get(msg.id);
    if (!pending) return;
    if (msg.type === 'progress') {
      pending.onProgress(msg.progress, msg.text);
      return;
    }
    this.workerPending.delete(msg.id);
    if (msg.type === 'done') pending.resolve(msg.result);
    else pending.reject(new Error(msg.error || 'ローカルSLM（CPU）でエラーが発生しました'));
  }

  terminateWorker() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.workerModel = null;
    if (this.activeEngine === 'cpu') this.activeEngine = null;
  }

  async unload() {
    const engine = this.engine;
    this.engine = null;
    this.engineModel = null;
    this.terminateWorker();
    this.activeEngine = null;
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
    if (this.config.backend === 'browser') {
      await this.ensureReady();
    }
    if (this.config.backend === 'browser' && this.activeEngine === 'cpu') {
      // CPU実行では出力形式を制約できないため、回答の書き出しを固定して崩れにくくする
      const firstKey = (schema.required && schema.required[0]) || Object.keys(schema.properties || {})[0] || 'result';
      const isArray = schema.properties?.[firstKey]?.type === 'array';
      const prefix = `{"${firstKey}": ${isArray ? '[' : ''}`;
      content = await this.callWorker({ type: 'generate', messages, prefix, maxTokens });
    } else if (this.config.backend === 'browser') {
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
    const tryParse = (s) => {
      try {
        return JSON.parse(s);
      } catch {
        return undefined;
      }
    };

    let parsed = tryParse(cleaned);
    if (parsed !== undefined) return parsed;

    const start = cleaned.indexOf('{');
    if (start !== -1) {
      const body = cleaned.slice(start);
      const end = body.lastIndexOf('}');
      if (end > 0) {
        parsed = tryParse(body.slice(0, end + 1));
        if (parsed !== undefined) return parsed;
      }
      // 出力が途中で切れた場合（max_tokens到達・小さなモデルの書き損じ）は閉じ括弧を補って復元
      const repaired = this.repairJson(body);
      if (repaired !== undefined) return repaired;
    }
    throw new Error('SLMの出力をJSONとして読み取れませんでした');
  }

  /**
   * 途中で切れたJSONを、最後に完結している要素までで閉じて読み取る
   * 例: {"labs": [{"line": 1, ...}, {"line": 4, "na  →  {"labs": [{"line": 1, ...}]}
   */
  repairJson(text) {
    let truncatedString = null;
    for (let cut = text.length; cut > 0; cut = text.lastIndexOf('}', cut - 1)) {
      const head = text.slice(0, cut === text.length ? cut : cut + 1).replace(/,\s*$/, '');
      const stack = [];
      let inString = false;
      let escaped = false;
      for (const ch of head) {
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') stack.pop();
      }
      const closing = stack.reverse().map(c => (c === '{' ? '}' : ']')).join('');
      if (inString) {
        // 文字列の途中で切れた値は不完全なので、完結した要素が無い場合の最後の手段にする
        if (truncatedString === null) truncatedString = head + '"' + closing;
        continue;
      }
      try {
        return JSON.parse(head + closing);
      } catch {
        // さらに手前の要素で再試行
      }
    }
    if (truncatedString !== null) {
      try {
        return JSON.parse(truncatedString);
      } catch {
        // 復元不能
      }
    }
    return undefined;
  }
}

window.localSlm = new LocalSlm();
