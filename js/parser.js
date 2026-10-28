/**
 * 求人票 表現揺らぎ吸収パーサー (Heuristic Parser)
 * 日本の採用情報における見出し記号・同義語・フォーマットの違いを網羅的に解析し正規化します。
 */

class JobTextParser {
  constructor() {
    // 項目ごとの同義語・見出しパターン辞書
    this.fieldPatterns = {
      companyName: {
        label: '会社名',
        headers: [
          '会社名', '企業名', '法人名', '商号', '募集企業', '社名', '募集会社', 
          '企業概要', '会社概要', '法人名称', 'Client Name', 'Company Name', 'Company',
          '採用企業', '募集会社名'
        ],
        inlinePatterns: [
          /(?:三菱重工業|三菱重工|川崎重工業|三菱電機|日立製作所|日本製鉄|西日本旅客鉄道|東日本旅客鉄道|東海旅客鉄道|九州旅客鉄道|北海道旅客鉄道|四国旅客鉄道)(?:株式会社)?/,
          /(?:株式会社|合同会社|有限会社|一般社団法人|特定非営利活動法人|弁護士法人|税理士法人|監査法人)[\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fffー・]{2,30}/,
          /[\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fffー・]{2,30}(?:株式会社|合同会社|有限会社)/
        ]
      },
      jobTitle: {
        label: '職種・ポジション',
        headers: [
          '募集職種', '職種', 'ポジション', '募集ポジション', '担当業務名', '求人タイトル',
          '募集職種名', '採用職種', '職種名', '職務名', '募集職種／業務内容', '採用コース',
          '募集分野', '採用区分', '募集コース', '募集職種・分野',
          'Role', 'Position', 'Job Title', 'Job'
        ]
      },
      employmentType: {
        label: '雇用形態',
        headers: [
          '雇用形態', '契約種別', '採用形態', '契約形態', '身分', '雇用区分', '採用区分',
          'Employment Type', 'Employment Status', 'Type'
        ],
        inlineKeywords: [
          '正社員（高専卒採用）', '正社員（高専生採用）', '正社員（新卒採用）', '正社員（キャリア採用）',
          '正社員', '契約社員', '業務委託', '派遣社員', 'パート・アルバイト', 'アルバイト', 'パート',
          '嘱託社員', 'インターン', '正社員（中途）', '正社員(新卒)', '正社員（試用期間あり）',
          '高専生採用', '高専卒採用', '新卒採用', '高卒採用'
        ]
      },
      salary: {
        label: '給与・想定年収',
        headers: [
          '給与', '想定年収', '年収', '月給', '月額', '賃金', '報酬', '基本給', '給料',
          '年俸', '給与形態', '給与詳細', '賞与・昇給', '賃金・給与', '賃金形態', '想定理論年収',
          '初任給', '基本給・初任給', '賃金・手当', '給与・諸手当', '諸手当', '昇給・賞与', '賞与', '昇給',
          'Compensation', 'Salary', 'Income', 'Pay'
        ],
        inlinePatterns: [
          /(?:初任給|基本給|月給|月額)[：:\s]*[0-9０-９,、~〜\-–\s]+(?:万)?(?:円)?(?:[~〜\-–\s]*[0-9０-９,、]+(?:万)?(?:円)?)?/,
          /(?:想定)?(?:理論)?年収[：:\s]*[0-9０-９,、~〜\-–\s]+万(?:円)?(?:[~〜\-–\s]*[0-9０-９,、]+万(?:円)?)?/,
          /年俸[：:\s]*[0-9０-９,、~〜\-–\s]+万(?:円)?(?:[~〜\-–\s]*[0-9０-９,、]+万(?:円)?)?/,
          /時給[：:\s]*[0-9０-９,、~–\-–\s]+円(?:[~〜\-–\s]*[0-9０-９,、]+円)?/
        ]
      },
      location: {
        label: '勤務地・就業場所',
        headers: [
          '勤務地', '就業場所', '就業地', '勤務エリア', '勤務場所', '配属地', '所在地',
          '本社', '勤務地詳細', '勤務地・アクセス', 'アクセス', '最寄駅', '就業先', '配属先', '勤務エリア・配属',
          'Location', 'Workplace', 'Office', 'Place'
        ],
        inlinePatterns: [
          /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)[\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fffー・0-9０-９\-丁目番地\s]+/
        ]
      },
      jobDescription: {
        label: '仕事内容・業務内容',
        headers: [
          '仕事内容', '職務内容', '業務内容', '担当業務', '主な仕事', '募集背景・業務内容',
          '具体的な業務', '業務詳細', '仕事概要', '具体的な仕事内容', '業務概要', '事業内容', '職務概要',
          '勤務内容', '担当職務', '仕事の内容',
          'Job Description', 'Responsibilities', 'Job Summary', 'Description'
        ]
      },
      requirements: {
        label: '応募資格・必須要件',
        headers: [
          '応募資格', '必須要件', '応募条件', '応募要件', '求める人物像', '対象となる方',
          '必要条件', '必須スキル', '応募資格（MUST）', '応募資格(MUST)', 'MUST要件',
          '必要とされる経験', '必須経験', '求めるスキル', '必須スキル・経験', '応募対象',
          '募集学科', '募集対象', '採用予定人数', '採用人数', '推薦区分', '応募対象者',
          'Requirements', 'Must Have', 'Qualification', 'Qualifications', 'Must'
        ]
      },
      preferred: {
        label: '歓迎要件・歓迎スキル',
        headers: [
          '歓迎要件', '歓迎スキル', '歓迎条件', 'あれば望ましい経験', '望ましいスキル',
          'プラスとなる経験', '優遇されるスキル', 'WANT要件', '歓迎スキル（WANT）',
          'あれば尚可', '歓迎するスキル・経験', '望ましい経験', '歓迎する経験', '活かせるスキル',
          'Nice to have', 'Preferred', 'Want', 'Desired'
        ]
      },
      workHours: {
        label: '勤務時間・労働制',
        headers: [
          '勤務時間', '就業時間', '所定労働時間', '労働時間', '始業・終業時刻', '勤務形態',
          '労働制', '勤務時間・労働制', '就労時間', 'フレックスタイム制', '裁量労働制', '交替制',
          'Working Hours', 'Hours', 'Schedule'
        ]
      },
      holidays: {
        label: '休日・休暇',
        headers: [
          '休日・休暇', '年間休日', '休日', '休暇制度', '有給休暇', '休日休暇',
          '週休2日制', '休日・休日制度', '休暇', '年次有給休暇', '休日・休暇等',
          'Holidays', 'Vacation', 'Days Off'
        ]
      },
      benefits: {
        label: '福利厚生・待遇',
        headers: [
          '福利厚生', '待遇・福利厚生', '各種保険', '諸手当', '制度', '福利厚生・諸手当',
          '待遇', '社内制度', '待遇・諸手当', '福利厚生制度', '加入保険', '福利厚生・社内制度',
          '寮・社宅', '保険',
          'Benefits', 'Perks', 'Welfare'
        ]
      },
      selectionProcess: {
        label: '選考フロー',
        headers: [
          '選考フロー', '選考プロセス', '選考方法', '選考手順', '応募から内定まで',
          '選考の流れ', '採用プロセス', '選考基準', '選考ステップ', '応募方法', '提出書類', '試験内容',
          '応募手続き', '応募・選考フロー', '選考要領', '応募手続',
          'Selection Process', 'Interview Process', 'Selection', 'Process'
        ]
      },
      sourceUrl: {
        label: '求人URL / メモ',
        headers: [
          '求人URL', '掲載URL', 'URL', 'Link', '参照URL', 'Webサイト'
        ]
      }
    };

    // 見出しを検出するための装飾文字・記号のパターン
    this.headerDecorators = /^[【\[＜《〔「『■▼◆●★☆◎※◇▶▷#*+\-–\d\.\s]+/g;
    this.headerClosingDecorators = /[】\]＞》〕」』:：\s]+$/g;
  }

  /**
   * テキスト全体を解析し、正規化されたオブジェクトを返す
   * @param {string} text 生の求人テキスト
   * @returns {Object} 抽出結果オブジェクト
   */
  parse(text) {
    if (!text || typeof text !== 'string') {
      return this.getEmptyResult();
    }

    const lines = text.split(/\r?\n/);
    const sections = this.splitIntoSections(lines);
    const result = this.getEmptyResult();

    // 1. 各セクションのヘッダーからフィールドをマッピング
    for (const section of sections) {
      const fieldKey = this.matchHeaderToField(section.header);
      if (fieldKey) {
        const content = section.content.trim();
        // すでに内容がある場合は連結するか、空ならセット
        if (!result[fieldKey]) {
          result[fieldKey] = content;
        } else {
          result[fieldKey] += '\n' + content;
        }
      }
    }

    // 2. フォールバック処理: 見出しで取れなかった項目のインライン救済
    this.fallbackExtraction(text, result);

    // 3. テキストの整形・トリミング
    for (const key of Object.keys(result)) {
      result[key] = this.cleanFieldText(result[key]);
    }

    return result;
  }

  /**
   * 空の結果オブジェクト
   */
  getEmptyResult() {
    return {
      companyName: '',
      jobTitle: '',
      employmentType: '',
      salary: '',
      location: '',
      jobDescription: '',
      requirements: '',
      preferred: '',
      workHours: '',
      holidays: '',
      benefits: '',
      selectionProcess: '',
      sourceUrl: ''
    };
  }

  /**
   * 行を行単位でスキャンして、[見出し, 本文...] のセクション単位に分割
   */
  splitIntoSections(lines) {
    const sections = [];
    let currentHeader = null;
    let currentLines = [];

    // 見出し行かどうかを判定する補助関数
    const isHeaderLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 50) return false;

      // 典型的な見出し囲み: 【...】, [ ... ], ■..., ▼...
      const hasHeaderDecorators = /^[【\[＜《〔「■▼◆●★◎※◇▶].+[】\]＞》〕」]?$|^[#]{1,4}\s+|^■|^▼|^◆|^●|^・/.test(trimmed);
      
      // コロン区切りの場合: 「給与: 400万」などの場合は短く切る
      const isColonHeader = /^[^\s:：]{2,15}[：:]/.test(trimmed);

      // 辞書のヘッダーキーワードにマッチするか
      const cleanedText = this.cleanHeaderText(trimmed);
      const isKnownKeyword = this.isKnownHeaderWord(cleanedText);

      return (hasHeaderDecorators || isColonHeader || isKnownKeyword);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isHeaderLine(line)) {
        // コロン、タブ、または連続空白で同一行に値が入っているパターン:
        // 例: 「勤務地: 東京都千代田区」「初任給\t月給200,000円」「初任給　220,000円」
        const inlineTableMatch = trimmed.match(/^([^\s:：\t]{2,15})(?:[：:]|\t|\s{2,}|\u3000+)(.+)$/);
        if (inlineTableMatch && this.isKnownHeaderWord(this.cleanHeaderText(inlineTableMatch[1]))) {
          if (currentHeader !== null || currentLines.length > 0) {
            sections.push({
              header: currentHeader || 'PREFACE',
              content: currentLines.join('\n')
            });
          }
          currentHeader = inlineTableMatch[1];
          currentLines = [inlineTableMatch[2].trim()];
          continue;
        }

        // 通常の見出し行
        if (currentHeader !== null || currentLines.length > 0) {
          sections.push({
            header: currentHeader || 'PREFACE',
            content: currentLines.join('\n')
          });
        }
        currentHeader = trimmed;
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    if (currentHeader !== null || currentLines.length > 0) {
      sections.push({
        header: currentHeader || 'PREFACE',
        content: currentLines.join('\n')
      });
    }

    return sections;
  }

  /**
   * 見出しテキストから装飾記号を取り除いて正規化
   */
  cleanHeaderText(text) {
    if (!text) return '';
    return text
      .replace(this.headerDecorators, '')
      .replace(this.headerClosingDecorators, '')
      .replace(/[（\(].*?[）\)]/g, '') // （MUST）などを一旦外して判定
      .trim();
  }

  /**
   * 見出しキーワードが辞書に含まれているか
   */
  isKnownHeaderWord(cleaned) {
    const lower = cleaned.toLowerCase();
    for (const fieldKey of Object.keys(this.fieldPatterns)) {
      for (const h of this.fieldPatterns[fieldKey].headers) {
        if (lower === h.toLowerCase()) return true;
      }
    }
    return false;
  }

  /**
   * 見出し文字列がどのフィールドに該当するか判定（揺らぎを吸収）
   */
  matchHeaderToField(rawHeader) {
    if (!rawHeader || rawHeader === 'PREFACE') return null;

    const cleaned = this.cleanHeaderText(rawHeader).toLowerCase();
    if (!cleaned || cleaned.length < 2) return null;
    const rawLower = rawHeader.toLowerCase();

    // 1. 完全一致・直接マッチ
    for (const [key, config] of Object.entries(this.fieldPatterns)) {
      for (const h of config.headers) {
        const hLower = h.toLowerCase();
        if (cleaned === hLower) return key;
      }
    }

    // 2. 部分一致（包含関係・優先度順）
    // 選考・応募手続き系を先に判定（「応募手続き」が「応募資格」に誤判定されるのを防ぐ）
    if (/選考|手続き|手続|フロー|提出書類|適性検査/.test(rawLower)) {
      return 'selectionProcess';
    }
    // MUST/WANTの特別優先
    if (/must|必須|資格|対象となる方|条件|募集学科/.test(rawLower) && !/歓迎|want|あれば/.test(rawLower)) {
      return 'requirements';
    }
    if (/want|歓迎|あれば|尚可|プラス|優遇/.test(rawLower)) {
      return 'preferred';
    }

    for (const [key, config] of Object.entries(this.fieldPatterns)) {
      for (const h of config.headers) {
        const hLower = h.toLowerCase();
        if (cleaned.length >= 2 && hLower.length >= 2 && (cleaned.includes(hLower) || hLower.includes(cleaned))) {
          return key;
        }
      }
    }

    return null;
  }

  /**
   * 見出しだけでは拾えなかった項目のフォールバック・インライン抽出
   */
  fallbackExtraction(fullText, result) {
    // 1. 会社名フォールバック
    if (!result.companyName) {
      // 本文から「株式会社〇〇」等を検索
      for (const pattern of this.fieldPatterns.companyName.inlinePatterns) {
        const match = fullText.match(pattern);
        if (match) {
          result.companyName = match[0].trim();
          break;
        }
      }
    }

    // 2. 雇用形態フォールバック
    if (!result.employmentType) {
      for (const kw of this.fieldPatterns.employmentType.inlineKeywords) {
        if (fullText.includes(kw)) {
          result.employmentType = kw;
          break;
        }
      }
    }

    // 3. 給与フォールバック
    if (!result.salary) {
      for (const pattern of this.fieldPatterns.salary.inlinePatterns) {
        const match = fullText.match(pattern);
        if (match) {
          result.salary = match[0].trim();
          break;
        }
      }
    }

    // 4. 勤務地（都道府県＋市区町村）フォールバック
    if (!result.location) {
      for (const pattern of this.fieldPatterns.location.inlinePatterns) {
        const match = fullText.match(pattern);
        if (match) {
          // 最長でも1行または改行前まで
          const firstLine = match[0].split('\n')[0].trim();
          if (firstLine.length < 50) {
            result.location = firstLine;
            break;
          }
        }
      }
      if (!result.location && /(フルリモート|在宅勤務|リモートワーク可)/.test(fullText)) {
        result.location = 'リモート勤務可';
      }
    }

    // 5. URLフォールバック
    if (!result.sourceUrl) {
      const urlMatch = fullText.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        result.sourceUrl = urlMatch[0];
      }
    }
  }

  /**
   * フィールドテキストの整形
   */
  cleanFieldText(text) {
    if (!text) return '';
    return text
      .trim()
      // 先頭の余分なコロンや記号を除去
      .replace(/^[:：\-・\s]+/, '')
      .replace(/[:：\s]+$/, '');
  }
}

// グローバルスコープにインスタンスを公開
window.jobTextParser = new JobTextParser();
