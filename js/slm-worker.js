/**
 * ローカルSLM CPU実行ワーカー（Transformers.js + ONNX Runtime Web / WebAssembly）
 * WebGPUが使えない環境でも、CPUだけで小規模言語モデルを動かします。
 * 推論は時間がかかるため、画面が固まらないようWeb Worker上で実行します。
 *
 * メッセージ:
 *   { id, type: 'load', model, dtypes }                       → progress / done({ model, dtype, threads })
 *   { id, type: 'generate', messages, prefix, maxTokens }     → done(text)
 */

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

let generator = null;
let loadedKey = '';

// 複数スレッド実行には cross-origin isolation（server.py が COOP/COEP ヘッダーを付与）が必要
const threads = self.crossOriginIsolated
  ? Math.min(4, Math.max(1, (self.navigator?.hardwareConcurrency || 2) - 1))
  : 1;
env.backends.onnx.wasm.numThreads = threads;
env.allowLocalModels = false;

const post = (msg) => self.postMessage(msg);

async function load(id, model, dtypes) {
  let lastError = null;
  for (const dtype of dtypes) {
    const key = `${model}:${dtype}`;
    if (generator && loadedKey === key) {
      post({ id, type: 'done', result: { model, dtype, threads } });
      return;
    }
    try {
      if (generator) {
        await generator.dispose?.();
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
      post({ id, type: 'done', result: { model, dtype, threads } });
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
  const text = Array.isArray(output) ? output[0]?.generated_text : output?.generated_text;
  post({ id, type: 'done', result: (prefix || '') + (typeof text === 'string' ? text : '') });
}

self.onmessage = async (e) => {
  const { id, type } = e.data || {};
  try {
    if (type === 'load') {
      await load(id, e.data.model, e.data.dtypes || ['q4', 'q8']);
    } else if (type === 'generate') {
      await generate(id, e.data.messages, e.data.prefix, e.data.maxTokens);
    } else {
      throw new Error(`unknown message: ${type}`);
    }
  } catch (err) {
    post({ id, type: 'error', error: err && err.message ? err.message : String(err) });
  }
};
