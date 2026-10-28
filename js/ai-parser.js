/**
 * AI大学・研究室情報抽出エンジン (Google Gemini API連携)
 * オプショナル設定: APIキーがある場合、研究室紹介ページや入試要項の自由文から高精度にJSON化
 */

class GeminiLabParser {
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

    const prompt = `あなたは日本の大学・大学院（情報系：情報科学・情報工学・コンピュータサイエンス）の研究室調査を支援する専門解析AIです。
以下のテキスト（研究室紹介ページ・入試要項・募集要項・メモなど）を読み込み、指定されたJSONスキーマに従って情報を正確に抽出・正規化してください。

【抽出ルール】
- university には大学そのものの情報を入れてください（大学名は正式名称。「大学院」は faculty 側に含めてください）。
- labs には研究室ごとに1要素を作り、本文に記載がある研究室をすべて列挙してください（「〇〇研究室」「〇〇ラボ」「〇〇Lab」など）。
- 研究室の特徴（コアタイム、ゼミ頻度、学会発表、共同研究、学生数、外部生の受け入れ、研究室訪問の可否など）は features / achievements / collaboration / members / contact に振り分けてください。
- admissions には入試情報を区分ごとに入れてください。
  - transfer: 編入学（高専・短大からの3年次編入など）
  - graduate: 大学院入試（博士前期/修士・博士後期、一般選抜・推薦・社会人・留学生など）
  - undergrad: 学部入試（一般選抜・総合型・学校推薦型など）
  各区分は summary(方式・概要), eligibility(出願資格), subjects(試験科目・選抜方法), english(TOEIC/TOEFL等の英語試験), schedule(出願期間・試験日・合格発表・説明会。日付はできるだけ「2026年8月25日」の形式), quota(募集人員・倍率・志願者数), notes(過去問・事前相談・提出書類などの備考) です。
- テキストに記載がない項目は空文字 "" にしてください。推測で情報を補わないでください。
- 項目内に不要な見出し記号（【】や■など）は含めず、内容だけを抽出してください。
- JSONフォーマットのみを出力してください（プレーンなJSONオブジェクト）。

【JSON出力フォーマット】
{
  "university": {
    "name": "大学名",
    "faculty": "学部・研究科（例: 大学院情報科学研究科）",
    "department": "学科・専攻・コース",
    "type": "国立 / 公立 / 私立 のいずれか（不明なら空）",
    "location": "所在地・キャンパス",
    "overview": "大学・研究科の特色",
    "tuition": "学費・奨学金・経済支援",
    "career": "進路・就職実績",
    "url": "参照URL"
  },
  "admissions": {
    "transfer": {"summary": "", "eligibility": "", "subjects": "", "english": "", "schedule": "", "quota": "", "notes": ""},
    "graduate": {"summary": "", "eligibility": "", "subjects": "", "english": "", "schedule": "", "quota": "", "notes": ""},
    "undergrad": {"summary": "", "eligibility": "", "subjects": "", "english": "", "schedule": "", "quota": "", "notes": ""}
  },
  "labs": [
    {
      "name": "研究室名（例: 山田研究室）",
      "professor": "教員（職位＋氏名、複数可）",
      "area": "研究分野",
      "description": "研究内容・研究テーマ",
      "keywords": "キーワード（カンマ区切り）",
      "features": "特色・雰囲気（コアタイム、ゼミ、指導方針など）",
      "achievements": "主な業績・学会発表・受賞",
      "collaboration": "共同研究・企業連携",
      "members": "メンバー構成・学生数",
      "career": "修了生の進路",
      "contact": "研究室訪問・連絡先",
      "url": "研究室URL"
    }
  ]
}

【対象テキスト】
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
      // 研究室が多いページは出力が長くなるため長めに待つ
      const timeoutId = setTimeout(() => controller.abort(), 30000);

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

window.geminiLabParser = new GeminiLabParser();
