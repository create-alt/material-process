/**
 * ローカルSLM CPU実行エンジン（Transformers.js + ONNX Runtime Web / WebAssembly）
 * WebGPUが使えない環境でも、CPUだけで小規模言語モデルを動かします。
 *
 * index.html を直接開いた場合（file://）はファイルURLからWorkerを作れないため、
 * このファイルは通常の <script> として読み込み、本体の関数を Blob URL のWorkerとして起動します。
 * Workerを作れない環境では、同じ関数を画面側（メインスレッド）で動かします。
 *
 * メッセージ:
 *   { id, type: 'load', model, dtypes }                       → progress / done({ model, dtype, threads, cache })
 *   { id, type: 'generate', messages, prefix, maxTokens }     → done(text)
 */

(function () {
  const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

  /**
   * Worker本体。Workerの中では scope = self、画面側で動かす場合は擬似的な scope を渡す。
   * ※ Blob化のため toString() で文字列にするので、外側の変数は参照しないこと
   */
  function slmWorkerMain(scope, transformers) {
    const { pipeline, env } = transformers;
    let generator = null;
    let loadedKey = '';

    // 複数スレッド実行には cross-origin isolation（server.py が COOP/COEP ヘッダーを付与）が必要
    const threads = scope.crossOriginIsolated
      ? Math.min(4, Math.max(1, ((scope.navigator && scope.navigator.hardwareConcurrency) || 2) - 1))
      : 1;
    env.backends.onnx.wasm.numThreads = threads;
    env.allowLocalModels = false;

    const post = (msg) => scope.postMessage(msg);

    // file:// から開いた場合など、ブラウザのキャッシュ領域が使えない環境では毎回ダウンロードになる
    async function checkCache() {
      try {
        if (typeof caches === 'undefined') throw new Error('no caches');
        await caches.open('labhub-cache-check');
        return true;
      } catch (e) {
        env.useBrowserCache = false;
        return false;
      }
    }

    async function load(id, model, dtypes) {
      const cache = await checkCache();
      let lastError = null;
      for (const dtype of dtypes) {
        const key = `${model}:${dtype}`;
        if (generator && loadedKey === key) {
          post({ id, type: 'done', result: { model, dtype, threads, cache } });
          return;
        }
        try {
          if (generator) {
            if (generator.dispose) await generator.dispose();
            generator = null;
          }
          generator = await pipeline('text-generation', model, {
            device: 'wasm',
            dtype,
            progress_callback: (info) => {
              if (info.status === 'progress_total') {
                post({ id, type: 'progress', progress: (info.progress || 0) / 100, text: `モデルをダウンロード中 (${dtype}) ${Math.round(info.progress || 0)}%` });
              } else if (info.status === 'ready') {
                post({ id, type: 'progress', progress: 1, text: 'モデルを初期化しました' });
              }
            }
          });
          loadedKey = key;
          post({ id, type: 'done', result: { model, dtype, threads, cache } });
          return;
        } catch (e) {
          // 指定の量子化ファイルが無いモデルもあるため、次の形式で再試行
          lastError = e;
          generator = null;
        }
      }
      throw lastError || new Error('モデルを読み込めませんでした');
    }

    async function generate(id, messages, prefix, maxTokens) {
      if (!generator) throw new Error('モデルが読み込まれていません');
      // 思考モード（Qwen3）を無効化し、回答の先頭（JSONの書き出し）を固定して出力形式を安定させる
      const prompt = generator.tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
        enable_thinking: false
      }) + (prefix || '');
      const output = await generator(prompt, {
        max_new_tokens: maxTokens || 512,
        do_sample: false,
        return_full_text: false,
        add_special_tokens: false
      });
      const first = Array.isArray(output) ? output[0] : output;
      const text = first && typeof first.generated_text === 'string' ? first.generated_text : '';
      post({ id, type: 'done', result: (prefix || '') + text });
    }

    scope.onmessage = async (e) => {
      const data = e.data || {};
      const { id, type } = data;
      try {
        if (type === 'load') {
          await load(id, data.model, data.dtypes || ['q4', 'q8']);
        } else if (type === 'generate') {
          await generate(id, data.messages, data.prefix, data.maxTokens);
        } else {
          throw new Error(`unknown message: ${type}`);
        }
      } catch (err) {
        post({ id, type: 'error', error: err && err.message ? err.message : String(err) });
      }
    };
  }

  /**
   * Blob URL のWorkerとして起動（file:// でも作成可能）
   * file:// ではモジュールWorkerが起動できないため、通常のWorkerから動的 import() でライブラリを読み込む。
   * 読み込み完了までに届いたメッセージは溜めておき、準備ができてから処理する。
   */
  function createWorker() {
    const source = `
      const queued = [];
      self.onmessage = (e) => queued.push(e);
      import(${JSON.stringify(TRANSFORMERS_URL)}).then(
        (transformers) => {
          (${slmWorkerMain.toString()})(self, transformers);
          queued.forEach((e) => self.onmessage(e));
        },
        (err) => self.postMessage({ type: 'fatal', error: (err && err.message) || String(err) })
      );
    `;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    // Worker側でスクリプトの読み込みが終われば Blob URL は不要
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return worker;
  }

  /**
   * Workerが使えない環境向け: 同じ処理を画面側で動かし、Workerと同じ形で扱えるようにする
   * （推論中は画面の操作が重くなります）
   */
  function createInPageWorker() {
    const listeners = { message: null };
    let ready = null;
    const scope = {
      crossOriginIsolated: !!window.crossOriginIsolated,
      navigator: window.navigator,
      postMessage: (msg) => setTimeout(() => listeners.message && listeners.message({ data: msg }), 0),
      onmessage: null
    };
    const fake = {
      inPage: true,
      set onmessage(fn) { listeners.message = fn; },
      get onmessage() { return listeners.message; },
      onerror: null,
      postMessage(msg) {
        if (!ready) {
          ready = import(TRANSFORMERS_URL).then((transformers) => slmWorkerMain(scope, transformers));
        }
        ready
          .then(() => scope.onmessage({ data: msg }))
          .catch((e) => scope.postMessage({ id: msg.id, type: 'error', error: `CPU実行エンジンを読み込めませんでした: ${e.message}` }));
      },
      terminate() {
        listeners.message = null;
      }
    };
    return fake;
  }

  window.LabHubSlmWorker = { createWorker, createInPageWorker, TRANSFORMERS_URL };
})();
