/**
 * AI求人抽出エンジン (Google Gemini API連携)
 * オプショナル設定: APIキーがある場合、複雑な自由文から高精度にJSON化
 */

class GeminiJobParser {
  constructor() {
    this.apiKey = localStorage.getItem('gemini_api_key') || '';
    const savedModel = localStorage.getItem('gemini_model');
    // 廃止モデル(2.5/2.0/1.5)や503高負荷モデルが保存されている場合は、API推奨の最新 gemini-3.5-flash-lite に自動更新
    const validCurrentModels = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
    if (!savedModel || !validCurrentModels.includes(savedModel) || savedModel === 'gemini-3.1-flash-lite' || savedModel === 'gemini-3.8-flash') {
      this.model = 'gemini-3.5-flash-lite';
      localStorage.setItem('gemini_model', 'gemini-3.5-flash-lite');
    } else {
      this.model = savedModel;
    }
    this.autoParse = localStorage.getItem('gemini_autoparse') !== 'false';
  }

  isConfigured() {
    return !!this.apiKey;
  }

  saveConfig(apiKey, model, autoParse) {
    this.apiKey = apiKey.trim();
    this.model = model || 'gemini-3.5-flash-lite';
    this.autoParse = !!autoParse;
    localStorage.setItem('gemini_api_key', this.apiKey);
    localStorage.setItem('gemini_model', this.model);
    localStorage.setItem('gemini_autoparse', this.autoParse ? 'true' : 'false');
  }

  /**
   * 優先順位付きの現行3.x候補モデルリストを取得（廃止済みの2.5/2.0は404防止のため除外）
   */
  getCandidateModels(preferredModel) {
    const base = [
      preferredModel || this.model,
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite'
    ];
    return base.filter((v, i, a) => v && a.indexOf(v) === i);
  }

  /**
   * APIから現在利用可能な3.x系モデル一覧を動的取得（404を出さずに疎通可能なモデルを探す）
   */
  async fetchAvailableModels(key) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data.models)) return [];
      return data.models
        .filter(m =>
          m.name &&
          !m.name.includes('1.5') &&
          !m.name.includes('2.0') &&
          !m.name.includes('2.5') &&
          (m.name.includes('flash') || m.name.includes('pro')) &&
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent')
        )
        .map(m => m.name.replace(/^models\//, ''));
    } catch {
      return [];
    }
  }

  /**
   * Gemini APIを直接呼び出して構造化JSONを抽出
   * @param {string} rawText 
   * @returns {Promise<Object>}
   */
  async parseWithAi(rawText) {
    if (!this.apiKey) {
      throw new Error('Gemini APIキーが設定されていません。AI設定からAPIキーを入力してください。');
    }

    const prompt = `あなたは日本の求人票・採用情報の専門解析AIです。
以下の求人テキストを読み込み、指定されたJSONスキーマに従って情報を正確に抽出・正規化してください。

【抽出ルール】
- 表現の揺らぎ（「給与」「賃金」「年俸」「月給」「初任給」「諸手当」「想定年収」、「勤務地」「就業場所」「就業エリア」「配属先」、「必須スキル」「応募資格」「対象となる方」「募集学科」など）を適切に解釈し各項目に振り分けてください。
- 該当する情報がテキストに記載されていない場合は、空文字 "" にしてください。
- 項目内に不要な見出し記号（【】や■など）は含めず、内容だけを抽出してください。
- JSONフォーマットのみを出力してください（プレーンなJSONオブジェクト）。

【JSON出力フォーマット】
{
  "companyName": "会社名・企業名",
  "jobTitle": "募集職種・ポジション名・採用コース",
  "employmentType": "雇用形態（正社員/契約社員/新卒採用/高専卒採用など）",
  "salary": "給与・初任給・諸手当・賞与など",
  "location": "勤務地・就業場所・勤務エリア",
  "jobDescription": "仕事内容・業務内容の詳細",
  "requirements": "応募資格・必須要件・募集学科",
  "preferred": "歓迎要件・歓迎スキル",
  "workHours": "勤務時間・労働制・交替制など",
  "holidays": "休日・休暇制度",
  "benefits": "福利厚生・諸手当・社内制度・寮社宅",
  "selectionProcess": "選考フロー・選考方法・応募手順",
  "sourceUrl": "URLまたは空"
}

【対象求人テキスト】
${rawText}
`;

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const candidateModels = this.getCandidateModels(this.model);
    const triedModels = new Set();
    let lastError = null;

    const tryModel = async (modelName) => {
      triedModels.add(modelName);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const msg = errData.error?.message || `HTTP ${response.status}`;

          if (response.status === 400 && msg.toLowerCase().includes('api key')) {
            throw new Error(`APIキーが無効です: ${msg}`);
          }

          console.warn(`[Gemini Fallback] ${modelName} returned ${response.status} (${msg}), switching to next model...`);
          lastError = new Error(`Gemini API (${modelName}): ${msg}`);
          return null;
        }

        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) {
          lastError = new Error('AIからの応答が空でした。');
          return null;
        }

        if (this.model !== modelName) {
          this.model = modelName;
          localStorage.setItem('gemini_model', modelName);
        }

        const cleanedJson = candidateText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedJson);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.message && err.message.startsWith('APIキーが無効です')) {
          throw err;
        }
        if (err.name === 'AbortError') {
          console.warn(`[Gemini Fallback] ${modelName} timed out, trying next...`);
          lastError = new Error('AI解析がタイムアウトしました。');
          return null;
        }
        console.warn(`[Gemini Fallback] Error on ${modelName}:`, err.message);
        lastError = err;
        return null;
      }
    };

    // 1. 現行3.x候補モデル（gemini-3.5-flash-lite 最優先）を試行
    for (const modelName of candidateModels) {
      const result = await tryModel(modelName);
      if (result) return result;
    }

    // 2. 混雑等で失敗した場合、APIから利用可能な現行モデル一覧を動的取得して試行
    const dynamicModels = await this.fetchAvailableModels(this.apiKey);
    for (const modelName of dynamicModels) {
      if (triedModels.has(modelName)) continue;
      const result = await tryModel(modelName);
      if (result) return result;
    }

    // 3. 一時的な503スパイクの場合、1.5秒待って最優先モデル(gemini-3.5-flash-lite)を1回リトライ
    await new Promise(r => setTimeout(r, 1500));
    const retryResult = await tryModel('gemini-3.5-flash-lite');
    if (retryResult) return retryResult;

    throw lastError || new Error('現在Gemini APIが混雑しています。しばらく待ってから再試行してください。');
  }

  /**
   * 疎通テスト用
   */
  async testConnection(apiKey, model) {
    const key = (apiKey || this.apiKey || '').trim();
    const candidates = this.getCandidateModels(model || this.model);
    let lastErr = null;

    for (const m of candidates) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "ping: return 'ok'" }] }]
          })
        });

        if (res.ok) {
          this.model = m;
          localStorage.setItem('gemini_model', m);
          return m;
        }

        const err = await res.json().catch(() => ({}));
        const msg = err.error?.message || `Status: ${res.status}`;
        if (res.status === 400 && msg.toLowerCase().includes('api key')) {
          throw new Error(msg);
        }
        lastErr = new Error(msg);
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error('接続に失敗しました');
  }
}

window.geminiJobParser = new GeminiJobParser();
