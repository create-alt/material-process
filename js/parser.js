/**
 * 大学・研究室情報 表現揺らぎ吸収パーサー (Heuristic Parser)
 * 情報系の大学・大学院・研究室紹介ページや入試要項のテキストを解析し、
 *   1. 大学情報（大学名・学部/研究科・学科/専攻・所在地など）
 *   2. 入試情報（編入学 / 大学院入試 / 学部入試 ごとの方式・出願資格・試験科目・英語・日程・募集人員）
 *   3. 研究室ごとの特徴（教員・研究分野・研究内容・雰囲気・実績・進路・研究室訪問など）
 * に構造化します。
 */

class UniversityTextParser {
  constructor() {
    // 大学・学部レベルの項目
    this.universityFields = {
      name: {
        label: '大学名',
        headers: ['大学名', '学校名', '機関名', '大学', 'University', 'University Name']
      },
      faculty: {
        label: '学部・研究科',
        headers: ['学部', '研究科', '学部・研究科', '研究科名', '学部名', '学府', '学環', '学院', '所属', '部局', 'Graduate School', 'Faculty', 'School']
      },
      department: {
        label: '学科・専攻',
        headers: ['学科', '専攻', '学科・専攻', '専攻名', '学科名', '学系', 'コース', 'プログラム', 'Department', 'Major']
      },
      type: {
        label: '設置区分',
        headers: ['設置区分', '設置者', '国公私立', '区分']
      },
      location: {
        label: '所在地・キャンパス',
        headers: ['所在地', 'キャンパス', '住所', 'アクセス', '最寄駅', 'キャンパス所在地', '交通アクセス', 'Location', 'Campus', 'Address', 'Access']
      },
      overview: {
        label: '特色・概要',
        headers: ['概要', '特色', '特徴', '研究科の特色', '学科の特色', '専攻の特色', '学部紹介', '研究科紹介', '専攻紹介', '学科紹介', '教育理念', '理念', '教育目標', 'アドミッションポリシー', 'アドミッション・ポリシー', '求める学生像', 'ページ本文', 'About', 'Overview']
      },
      tuition: {
        label: '学費・奨学金',
        headers: ['学費', '入学金', '入学料', '授業料', '奨学金', '経済支援', '経済的支援', '学費・奨学金', '授業料免除', '支援制度', 'Tuition', 'Scholarship']
      },
      career: {
        label: '進路・就職',
        headers: ['進路', '就職', '就職先', '主な就職先', '進路状況', '修了生の進路', '卒業後の進路', '卒業生の進路', '就職実績', '進学率', '就職率', 'Career']
      },
      url: {
        label: '参照URL',
        headers: ['URL', '参照URL', 'Webサイト', 'ウェブサイト', 'ホームページ', 'HP', 'Link', 'Website']
      }
    };

    // 研究室レベルの項目
    this.labFields = {
      professor: {
        label: '教員',
        headers: ['教員', '指導教員', '担当教員', '教員名', '構成教員', 'スタッフ', '教授', '准教授', '講師', '助教', '主宰', 'PI', 'Faculty', 'Staff', 'Supervisor', 'Professor']
      },
      area: {
        label: '研究分野',
        headers: ['研究分野', '専門分野', '研究領域', '分野', '領域', '専門', '講座', 'Research Area', 'Field']
      },
      description: {
        label: '研究内容',
        headers: ['研究内容', '研究テーマ', '主な研究テーマ', '研究概要', '主な研究', '研究紹介', '研究室紹介', '研究室概要', '研究対象', 'テーマ', '概要', 'Research', 'Research Topics', 'Research Interests', 'Overview']
      },
      keywords: {
        label: 'キーワード',
        headers: ['キーワード', '研究キーワード', 'タグ', 'Keywords', 'Keyword']
      },
      features: {
        label: '特色・雰囲気',
        headers: ['特色', '特徴', '雰囲気', '研究室の特徴', '研究室の特色', '研究室の雰囲気', '研究室生活', '指導方針', '指導体制', 'ゼミ', 'ミーティング', 'コアタイム', '活動', '一週間', 'Culture', 'Features']
      },
      achievements: {
        label: '主な業績・発表',
        headers: ['業績', '主な業績', '研究業績', '論文', '主な論文', '発表', '学会発表', '発表実績', '受賞', '受賞歴', '実績', '成果', '研究成果', 'Publications', 'Awards']
      },
      collaboration: {
        label: '共同研究・連携',
        headers: ['共同研究', '産学連携', '企業連携', '連携', '共同研究先', '連携企業', 'プロジェクト', '外部資金', 'Collaboration', 'Projects']
      },
      members: {
        label: 'メンバー構成',
        headers: ['メンバー', 'メンバー構成', '構成', '学生数', '在籍者', '在籍学生', '研究室構成', '人数', 'Members']
      },
      career: {
        label: '修了生の進路',
        headers: ['進路', '就職先', '主な就職先', '修了生の進路', '卒業生の進路', 'OB・OG', '卒業生', 'Alumni', 'Career']
      },
      contact: {
        label: '研究室訪問・連絡先',
        headers: ['研究室訪問', '研究室見学', '見学', '訪問', '問い合わせ', '問合せ', 'お問い合わせ', '連絡先', 'メール', 'E-mail', 'Email', 'Contact', 'オープンラボ', '受け入れ', '受入れ', '学生募集', '配属']
      },
      url: {
        label: '研究室URL',
        headers: ['URL', 'HP', 'ホームページ', 'Webサイト', 'ウェブサイト', '研究室HP', '研究室URL', 'Website', 'Link']
      }
    };

    // 入試区分（トラック）
    this.admissionTracks = {
      transfer: { label: '編入学', icon: '🔁' },
      graduate: { label: '大学院入試', icon: '🎓' },
      undergrad: { label: '学部入試', icon: '🏫' }
    };

    // 入試トラック内の項目
    this.admissionFields = {
      summary: {
        label: '方式・概要',
        headers: ['概要', '方式', '入試方式', '選抜区分', '入試区分', '募集区分', '実施方式', '入試概要', '選抜の種類']
      },
      eligibility: {
        label: '出願資格・条件',
        headers: ['出願資格', '応募資格', '出願要件', '受験資格', '出願条件', '入学資格', '出願できる者', '対象者', 'Eligibility']
      },
      subjects: {
        label: '試験科目・選抜方法',
        headers: ['試験科目', '選抜方法', '試験内容', '学力検査', '筆記試験', '専門科目', '口頭試問', '口述試験', '面接試験', '小論文', '選考方法', '入試科目', '出題範囲', '試験方法', 'Exam Subjects']
      },
      english: {
        label: '英語・外部試験',
        headers: ['英語', '外国語', 'TOEIC', 'TOEFL', 'TOEFL iBT', 'IELTS', '英語外部試験', '外部英語試験', '外国語試験', '英語試験', 'English']
      },
      schedule: {
        label: '日程',
        headers: ['日程', '入試日程', '試験日', '試験日程', '試験日時', '出願期間', '出願期限', '合格発表', '合格発表日', '入試説明会', '説明会', 'オープンキャンパス', 'スケジュール', '募集期間', 'Schedule']
      },
      quota: {
        label: '募集人員・倍率',
        headers: ['募集人員', '募集人数', '定員', '入学定員', '倍率', '競争率', '志願者数', '合格者数', '受験者数', '入試結果', '入試状況', '実施状況']
      },
      notes: {
        label: '備考',
        headers: ['備考', '注意事項', '留意事項', '過去問', '過去問題', '過去の試験問題', '提出書類', '出願書類', '検定料', '入学検定料', '事前相談', '指導教員との事前相談', '研究計画書']
      }
    };

    // 研究室外でも見出しとして扱ってよい入試項目（「備考」等の汎用語は入試文脈内のみ）
    this.globalAdmissionKeys = ['eligibility', 'subjects', 'english', 'schedule', 'quota'];

    // 装飾記号なしの単独行では見出しとみなさない曖昧語（試験科目の列挙などと衝突するため）
    this.ambiguousPlainWords = ['英語', '論文', '発表', '受賞', '専門', '大学', '学部', '学科', '専攻', 'コース', '見学', '訪問', '連携', '領域', '分野', '構成', '活動', 'ゼミ', '配属', 'テーマ', '学院', 'プログラム', '区分', '方式', '定員', 'タグ'];

    // トラック見出しのうち汎用的すぎて「方式」として記録する価値のないもの
    this.genericTrackHeaders = ['編入', '編入学', '編入学試験', '編入試験', '大学院入試', '院試', '入試', '入試情報', '入学試験', '大学院入学試験', '学部入試', '入試案内', '入学者選抜', '募集要項', '学生募集要項', '入試・編入情報'];

    // 見出し装飾（先頭）: 【 ■ ▼ ◆ # 1. (1) ① など
    this.headerPrefix = /^(?:[【\[＜《〔「『■□▼▽◆◇●○★☆◎▶▷►・#*＊+\-–—\s]|[0-9]{1,2}[.．)）]\s*|[（(][0-9]{1,2}[)）]|[①-⑳])+/;
    // 見出し装飾（末尾）
    this.headerSuffix = /[】\]＞》〕」』:：*＊\s]+$/;
  }

  /**
   * テキスト全体を解析し、構造化オブジェクトを返す
   * @param {string} text 生テキスト
   */
  parse(text) {
    const result = this.getEmptyResult();
    if (!text || typeof text !== 'string') return result;

    const normalized = this.normalizeText(text);
    const lines = normalized.split('\n');
    const defaultTrack = this.guessDefaultTrack(normalized);
    const ctx = { mode: 'univ', lab: null, track: null, target: null, division: '' };

    const append = (obj, key, value) => {
      if (!value) return;
      obj[key] = obj[key] ? `${obj[key]}\n${value}` : value;
    };
    const setTarget = (obj, key) => {
      ctx.target = { obj, key };
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // 1. 研究室見出し（「〇〇研究室（教授 山田太郎）」「Yamada Lab」など）
      const labHead = ctx.targetId === 'ignore' ? null : this.detectLabHeader(line);
      if (labHead) {
        const lab = this.createLab(labHead.name);
        if (labHead.professor) lab.professor = labHead.professor;
        if (labHead.area) lab.area = labHead.area;
        if (!lab.area && ctx.division) lab.area = ctx.division;
        result.labs.push(lab);
        ctx.mode = 'lab';
        ctx.lab = lab;
        ctx.track = null;
        setTarget(lab, 'description');
        ctx.targetId = `lab:${lab.id}:description`;
        continue;
      }

      // 2. 項目見出し
      const head = this.detectHeader(line, ctx, defaultTrack);
      if (head) {
        const isSameTarget = ctx.target && this.resolveTarget(head, ctx, result, true) === ctx.targetId;
        if (isSameTarget) {
          // 試験科目の列挙中に出てくる「口頭試問」「1. 専門科目（…）」などは本文として扱う
          // （見出し語そのものだけの重複見出しは読み飛ばす）
          if (head.kind === 'labField' && head.key === 'description' && head.inlineValue) {
            append(ctx.target.obj, ctx.target.key, head.inlineValue);
          } else if (head.inlineValue || !this.isExactHeaderWord(head.cleaned)) {
            append(ctx.target.obj, ctx.target.key, line.replace(/^[■□▼▽◆◇●○★☆◎▶▷►#\s]+/, ''));
          }
          continue;
        }
        this.applyHeader(head, ctx, result, append, setTarget);
        continue;
      }

      // 3. 研究室内で教員行（「教授 山田 太郎」）が単独で出てきた場合は教員欄へ
      if (ctx.mode === 'lab' && ctx.lab && !ctx.lab.professor && line.length <= 40) {
        const prof = this.extractProfessors(line);
        if (prof && /^(?:[・\-\s]*)(?:特任|名誉|客員)?(?:准?教授|講師|助教|専任講師)|(?:准?教授|講師|助教)$/.test(line)) {
          ctx.lab.professor = prof;
          continue;
        }
      }

      // 4. 本文
      if (ctx.target) {
        append(ctx.target.obj, ctx.target.key, line);
      } else {
        append(result, '_preface', line);
      }
    }

    this.fallbackExtraction(normalized, result, defaultTrack);
    return this.finalize(result, normalized);
  }

  /**
   * 空の結果オブジェクト
   */
  getEmptyResult() {
    const admissions = {};
    for (const track of Object.keys(this.admissionTracks)) {
      admissions[track] = this.createAdmissionTrack();
    }
    return {
      university: {
        name: '', faculty: '', department: '', type: '', location: '',
        overview: '', tuition: '', career: '', url: ''
      },
      admissions,
      labs: [],
      events: [],
      _preface: ''
    };
  }

  createAdmissionTrack() {
    const track = {};
    for (const key of Object.keys(this.admissionFields)) track[key] = '';
    return track;
  }

  createLab(name = '') {
    return {
      id: 'lab_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8),
      name,
      professor: '',
      area: '',
      description: '',
      keywords: '',
      features: '',
      achievements: '',
      collaboration: '',
      members: '',
      career: '',
      contact: '',
      url: '',
      // ユーザー管理項目
      favorite: false,
      status: '',
      priority: 0,
      memo: '',
      checklist: {}
    };
  }

  /**
   * 全角英数・空白の正規化
   */
  normalizeText(text) {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      // Markdown表: 区切り行と「| 項目 | 内容 |」の見出し行を除去し、「| 教員 | 山田 |」→「教員：山田」
      .replace(/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
      .replace(/^\|\s*(項目|見出し|区分|Item|Key)\s*\|\s*(内容|詳細|説明|Value|Description)\s*\|?\s*$/gim, '')
      .replace(/^\|\s*([^|\n]{1,30}?)\s*\|\s*(.+?)\s*\|?\s*$/gm, '$1：$2');
  }

  /**
   * 見出しテキストから装飾記号を取り除く
   * @param {boolean} keepParen true の場合は（）内を残す
   */
  cleanHeaderText(text, keepParen = false) {
    if (!text) return '';
    let cleaned = text.replace(this.headerPrefix, '').replace(this.headerSuffix, '');
    if (!keepParen) cleaned = cleaned.replace(/[（(][^）)]*[）)]/g, '');
    return cleaned.trim();
  }

  isDecorated(line) {
    return /^[【\[＜《〔■□▼▽◆◇●○★☆◎▶▷►#]|^\*\*.+\*\*$|^[0-9]{1,2}[.．)）]\s*\S|^[（(][0-9]{1,2}[)）]|^[①-⑳]|[】]$|[^:：\s][:：]$/.test(line);
  }

  /**
   * 辞書から見出し語に一致する項目キーを探す
   * @param {boolean} allowPartial 部分一致（「主な研究テーマ例」→ 研究テーマ）を許可するか
   */
  matchDict(dict, cleaned, allowPartial) {
    if (!cleaned) return null;
    const lower = cleaned.toLowerCase();
    for (const [key, config] of Object.entries(dict)) {
      if (config.headers.some(h => h.toLowerCase() === lower)) return key;
    }
    if (!allowPartial || cleaned.length > 30) return null;

    let best = null;
    let bestLen = 0;
    for (const [key, config] of Object.entries(dict)) {
      for (const h of config.headers) {
        const hl = h.toLowerCase();
        // 英字の短い略語（HP, PI, OB など）は完全一致のみ
        if (/^[a-z]{1,3}$/i.test(h)) continue;
        // 2文字の汎用語（「大学」「専門」など）は短い見出しの中でのみ部分一致を許可
        if (hl.length === 2 && lower.length > 6) continue;
        if (hl.length >= 2 && lower.includes(hl) && hl.length > bestLen) {
          best = key;
          bestLen = hl.length;
        }
      }
    }
    return best;
  }

  isExactHeaderWord(cleaned) {
    const lower = (cleaned || '').toLowerCase();
    return [this.universityFields, this.labFields, this.admissionFields].some(dict =>
      Object.values(dict).some(cfg => cfg.headers.some(h => h.toLowerCase() === lower))
    );
  }

  /**
   * 行が見出しかどうかを判定し、見出し情報を返す
   * 「研究内容：〜」のような同一行の値（inlineValue）にも対応
   */
  detectHeader(line, ctx, defaultTrack) {
    if (line.length > 80) return null;
    const decorated = this.isDecorated(line) && line.length <= 50;
    // 「・推薦選抜：書類審査」のような箇条書きは、辞書語と完全一致する場合のみ見出し扱い
    const bullet = /^[・･\-–]\s*/.test(line);
    const candidates = [];

    const colon = line.match(/^(.{1,24}?)\s*[：:]\s*(.+)$/);
    if (colon && !/^https?$/i.test(colon[1].trim())) {
      candidates.push({ text: colon[1], inline: colon[2].trim(), plain: false });
    }
    const tabbed = line.match(/^([^\s:：\t]{2,16})(?:\t|\s{2,}|　+)(.+)$/);
    if (tabbed) {
      candidates.push({ text: tabbed[1], inline: tabbed[2].trim(), plain: false });
    }
    // 「研究室一覧 | 情報理工学部 | 〇〇大学」のようなページタイトル行は見出しにしない
    if (!/\s[|｜]\s|｜/.test(line)) {
      candidates.push({ text: line, inline: '', plain: !decorated });
    }

    for (const cand of candidates) {
      const cleaned = this.cleanHeaderText(cand.text);
      const cleanedFull = this.cleanHeaderText(cand.text, true);
      if (!cleaned || cleaned.length > 30) continue;

      if (bullet && !this.isExactHeaderWord(cleaned)) continue;
      const isWholeLine = cand.inline === '';
      if (isWholeLine && !decorated) {
        // 装飾なしの単独行は「辞書語と完全一致」かつ曖昧語でない場合のみ見出し扱い
        if (line.length > 20 || this.ambiguousPlainWords.includes(cleaned)) continue;
      }
      const allowPartial = decorated || (!isWholeLine && cleaned.length <= 14);
      const resolved = this.resolveHeader(cleaned, cleanedFull, ctx, defaultTrack, allowPartial);
      if (resolved) {
        return { ...resolved, inlineValue: cand.inline, cleaned, cleanedFull, plain: cand.plain };
      }
    }
    return null;
  }

  /**
   * 見出し語 → どの項目に割り当てるかを文脈（研究室内 / 入試内 / 大学全般）に応じて判定
   */
  resolveHeader(cleaned, cleanedFull, ctx, defaultTrack, allowPartial) {
    const lower = cleaned.toLowerCase();
    if (['ページタイトル', 'page title', 'title'].includes(lower)) {
      return { kind: 'ignore' };
    }

    // 講座・部門（複数研究室をまとめる見出し）
    if (allowPartial && /(講座|研究部門|部門)$/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 24) {
      return { kind: 'division' };
    }

    // 研究室内: 研究室項目を最優先
    if (ctx.mode === 'lab') {
      const labKey = this.matchDict(this.labFields, cleaned, allowPartial);
      if (labKey) return { kind: 'labField', key: labKey };
    }

    // 入試トラック・入試項目
    const adm = this.resolveAdmission(cleaned, cleanedFull, ctx, defaultTrack, allowPartial);
    if (adm) return adm;

    // 大学全般の項目
    const univKey = this.matchDict(this.universityFields, cleaned, allowPartial);
    if (univKey) return { kind: 'univField', key: univKey };

    // 研究室外で「研究内容」等が出た場合は大学の特色として扱う
    if (ctx.mode !== 'lab') {
      const labKey = this.matchDict(this.labFields, cleaned, allowPartial);
      if (labKey === 'description') return { kind: 'univField', key: 'overview' };
    }
    return null;
  }

  /**
   * 入試関連の見出し判定（編入学 / 大学院入試 / 学部入試 と、その中の項目）
   */
  resolveAdmission(cleaned, cleanedFull, ctx, defaultTrack, allowPartial) {
    const h = cleanedFull || cleaned;
    const inAdmission = ctx.mode === 'admission';
    const examWord = /入試|入学試験|入学者選抜|選抜|募集要項|学生募集|出願|試験|受験|入学案内/;

    let explicitTrack = null;
    if (/編入/.test(h)) {
      explicitTrack = 'transfer';
    } else if (/大学院|院試|修士|博士|前期課程|後期課程|専門職学位/.test(h) && (examWord.test(h) || /院試/.test(h) || inAdmission)) {
      explicitTrack = 'graduate';
    } else if (/学部入試|総合型選抜|学校推薦型選抜|共通テスト|AO入試|一般入試/.test(h)) {
      explicitTrack = 'undergrad';
    }

    let field = this.matchDict(this.admissionFields, cleaned, allowPartial);
    if (field === 'summary' && !inAdmission && !explicitTrack) field = null;

    if (explicitTrack) {
      return { kind: 'admission', track: explicitTrack, key: field || 'summary', isTrackHeader: !field };
    }
    if (field) {
      if (inAdmission || this.globalAdmissionKeys.includes(field)) {
        return { kind: 'admission', track: ctx.track || defaultTrack, key: field, isTrackHeader: false };
      }
      return null;
    }
    // 入試文脈内の「推薦入試」「一般選抜」「社会人特別選抜」などは同一トラック内の方式見出し
    if (inAdmission && /選抜|推薦|入試|特別|社会人|留学生|一般/.test(h) && h.length <= 24) {
      return { kind: 'admission', track: ctx.track || defaultTrack, key: 'summary', isTrackHeader: true };
    }
    if (examWord.test(h) && h.length <= 16 && allowPartial) {
      return { kind: 'admission', track: ctx.track || defaultTrack, key: 'summary', isTrackHeader: true };
    }
    return null;
  }

  /**
   * 見出しの割り当て先を表すID（同じ割り当て先が続く場合の判定用）
   */
  resolveTarget(head, ctx, result, dryRun) {
    if (head.kind === 'labField' && ctx.lab) return `lab:${ctx.lab.id}:${head.key}`;
    if (head.kind === 'admission') return `adm:${head.track}:${head.key}`;
    if (head.kind === 'univField') return `univ:${head.key}`;
    return dryRun ? `other:${head.kind}` : null;
  }

  applyHeader(head, ctx, result, append, setTarget) {
    // 入試項目は「出願期間：〜」「大学院入試説明会：〜」のように見出し語自体が情報を持つため見出しごと残す
    // （「出願資格」「日程」など項目名そのものの見出しは値のみ）
    const isCanonical = head.kind === 'admission' && this.admissionFields[head.key].headers.slice(0, 2).includes(head.cleaned);
    const inline = head.inlineValue && head.kind === 'admission' && !head.isTrackHeader && !isCanonical
      ? `${head.cleanedFull}：${head.inlineValue}`
      : head.inlineValue;
    switch (head.kind) {
      case 'ignore':
        ctx.target = { obj: result, key: '_ignored' };
        ctx.targetId = 'ignore';
        return;
      case 'division':
        ctx.division = head.cleaned;
        ctx.mode = 'univ';
        ctx.lab = null;
        ctx.target = null;
        ctx.targetId = '';
        return;
      case 'labField':
        setTarget(ctx.lab, head.key);
        append(ctx.lab, head.key, inline);
        break;
      case 'admission': {
        ctx.mode = 'admission';
        ctx.lab = null;
        ctx.track = head.track;
        const trackObj = result.admissions[head.track];
        setTarget(trackObj, head.key);
        if (head.isTrackHeader && (!this.genericTrackHeaders.includes(head.cleaned) || head.cleanedFull !== head.cleaned)) {
          append(trackObj, 'summary', `【${head.cleanedFull}】`);
        }
        append(trackObj, head.key, inline);
        break;
      }
      case 'univField':
        ctx.mode = 'univ';
        ctx.lab = null;
        ctx.track = null;
        setTarget(result.university, head.key);
        append(result.university, head.key, inline);
        break;
      default:
        return;
    }
    ctx.targetId = this.resolveTarget(head, ctx, result, false);
  }

  /**
   * 研究室見出しの判定
   * 例: 「■ 山田研究室（教授 山田 太郎）」「知能情報学講座 佐藤研究室」「Yamada Lab - NLP」
   */
  detectLabHeader(line) {
    if (line.length > 70 || /。/.test(line)) return null;
    const body = line.replace(this.headerPrefix, '').replace(/[】\]＞》〕」』*＊\s]+$/, '');
    const m = body.match(/^(.{1,30}?)[\s　]*(研究室|ラボラトリー|ラボ|研究グループ|Laboratory|Lab)(?![a-z])\.?(.*)$/i);
    if (!m) return null;

    let base = m[1].trim();
    const suffix = m[2];
    const rest = m[3].trim();

    if (!base || /[：:、，,。]/.test(base)) return null;
    if (/^(本|当|同|各|全|この|その|他|我々の|私たちの|所属|希望|志望|配属|おすすめ|人気|オープン|主な|関連|附属|学内|学外|情報系の?)$/.test(base)) return null;
    if (/の$|(訪問|見学|紹介|一覧|案内|について|選び|決め|生活|探し|公開|説明|配属先)/.test(base)) return null;
    // 「山田研究室では…」のような文章は除外（後続は括弧書き・区切り記号のみ許可）
    if (rest && !/^([（(【\[].*|[-–—:：|｜/／].*)$/.test(rest)) return null;

    // 「知能情報学講座 山田研究室」→ 講座名は研究分野として扱う
    let area = '';
    const isAscii = /^[\x20-\x7e]+$/.test(base);
    if (!isAscii) {
      const tokens = base.split(/[\s　]+/);
      if (tokens.length > 1) {
        base = tokens.pop();
        area = tokens.join(' ');
      }
    }
    const name = isAscii ? `${base} ${suffix}` : `${base}${suffix}`;

    let professor = '';
    if (rest) {
      const restBody = rest.replace(/^[-–—:：|｜/／\s]+/, '').replace(/^[（(【\[]|[）)】\]]$/g, '').trim();
      professor = this.extractProfessors(restBody);
      if (!professor && restBody) area = area ? `${area} / ${restBody}` : restBody;
    }
    return { name, professor, area };
  }

  /**
   * 教員名の抽出（「教授 山田 太郎」「山田 太郎 准教授」など）
   */
  extractProfessors(text) {
    if (!text) return '';
    const titles = '特任教授|特任准教授|特任講師|特任助教|名誉教授|客員教授|客員准教授|准教授|教授|専任講師|講師|助教';
    const han = '[一-龥々〆ヶ]';
    const found = [];

    const reA = new RegExp(`(${titles})[\\s　:：・]*(${han}{1,4}[\\s　]?${han}{1,4}|[ァ-ヶー]{2,10}[\\s　・][ァ-ヶー]{2,10})`, 'g');
    let m;
    while ((m = reA.exec(text)) !== null) {
      const name = m[2].trim().replace(/(先生|氏|様|さん)$/, '');
      if (name.replace(/[\s　・]/g, '').length >= 2) found.push(`${m[1]} ${name}`);
    }
    if (found.length === 0) {
      const reB = new RegExp(`(?:^|[\\s　、,・/（(])(${han}{1,4}[\\s　]${han}{1,4})[\\s　]*(${titles})`, 'g');
      while ((m = reB.exec(text)) !== null) {
        found.push(`${m[2]} ${m[1].trim()}`);
      }
    }
    return [...new Set(found)].slice(0, 4).join('、');
  }

  /**
   * 本文中の「編入」「大学院」の出現頻度から既定の入試トラックを推定
   */
  guessDefaultTrack(text) {
    const transfer = (text.match(/編入/g) || []).length;
    const graduate = (text.match(/大学院|院試|博士前期|修士/g) || []).length;
    return transfer > graduate ? 'transfer' : 'graduate';
  }

  /**
   * 見出しで取れなかった項目のフォールバック・インライン抽出
   */
  fallbackExtraction(text, result, defaultTrack) {
    const uni = result.university;
    const headText = text.split('\n').slice(0, 10).join('\n');

    if (!uni.name) uni.name = this.extractUniversityName(text);
    if (!uni.faculty) uni.faculty = this.extractFaculty(headText) || this.extractFaculty(text);
    if (!uni.department) uni.department = this.extractDepartment(headText) || this.extractDepartment(text);
    if (!uni.type) uni.type = this.inferUniversityType(uni.name, text);

    if (!uni.location) {
      const locLine = text.split('\n').find(l => /所在地|キャンパス|住所|〒/.test(l) && /(東京都|北海道|京都府|大阪府|[一-龥]{2,3}県)/.test(l));
      const m = (locLine || '').match(/(?:東京都|北海道|(?:京都|大阪)府|[一-龥]{2,3}県)[一-龥々ぁ-んァ-ヶー0-9\-−丁目番地号]{2,30}/);
      if (m) uni.location = m[0];
    }

    if (!uni.url) {
      const urlMatch = text.match(/https?:\/\/[^\s）)」』>]+/);
      if (urlMatch) uni.url = urlMatch[0];
    }

    // 研究室見出しが無い自由文 → 「〇〇研究室」の出現からまとめて救済
    if (result.labs.length === 0) {
      result.labs = this.extractInlineLabs(text);
    }

    // 研究室ごとの補完（教員・URL）
    for (const lab of result.labs) {
      const labText = [lab.description, lab.features, lab.contact, lab.members].filter(Boolean).join('\n');
      if (!lab.professor) lab.professor = this.extractProfessors(labText);
      if (!lab.url) {
        const u = labText.match(/https?:\/\/[^\s）)」』>]+/);
        if (u) lab.url = u[0];
      }
    }

    // 入試情報: 見出しが無くても「編入」「院試」「TOEIC」を含む文を拾う
    const sentences = text
      .split(/\n|(?<=。)/)
      .map(s => s.trim().replace(/^[・\-\s]+/, ''))
      .filter(s => s.length >= 6 && s.length <= 200);
    const isTrackEmpty = (t) => Object.values(result.admissions[t]).every(v => !v);

    // 起点となる文と、それに続く入試関連の文をまとめて取り出す
    const admissionLike = /入試|試験|選抜|出願|募集|面接|英語|TOEIC|TOEFL|専門科目|過去問|研究計画書|口頭試問|受験/;
    const collectFrom = (isStart) => {
      const picked = [];
      for (let i = 0; i < sentences.length && picked.length < 8; i++) {
        if (!isStart(sentences[i])) continue;
        let j = i;
        while (j < sentences.length && (j === i || admissionLike.test(sentences[j])) && picked.length < 8) {
          if (!picked.includes(sentences[j])) picked.push(sentences[j]);
          j++;
        }
        i = j - 1;
      }
      return picked;
    };
    const transferHits = isTrackEmpty('transfer') ? collectFrom(s => /編入/.test(s)) : [];
    const graduateHits = isTrackEmpty('graduate')
      ? collectFrom(s => /(大学院|院試|博士前期|博士後期|修士)/.test(s) && /(入試|試験|選抜|出願|募集|入学)/.test(s))
      : [];
    if (transferHits.length) result.admissions.transfer.summary = transferHits.join('\n');
    if (graduateHits.length) result.admissions.graduate.summary = graduateHits.join('\n');
    for (const [track, hits] of [['transfer', transferHits], ['graduate', graduateHits]]) {
      const subj = hits.filter(s => /専門科目|数学|面接|筆記|口頭試問|口述|小論文|研究計画書/.test(s));
      if (subj.length && !result.admissions[track].subjects) result.admissions[track].subjects = subj.join('\n');
    }
    for (const track of Object.keys(result.admissions)) {
      const adm = result.admissions[track];
      if (!adm.english) {
        const trackText = Object.values(adm).join('\n');
        const eng = [...new Set(trackText.split('\n').filter(s => /TOEIC|TOEFL|IELTS|英検/.test(s)))];
        if (eng.length) adm.english = eng.join('\n');
      }
    }
    // 英語外部試験の記述がトラック外にある場合は既定トラックへ
    const defaultAdm = result.admissions[defaultTrack];
    if (!defaultAdm.english && !isTrackEmpty(defaultTrack)) {
      const eng = sentences.filter(s => /TOEIC|TOEFL|IELTS/.test(s) && /(スコア|点|提出|換算|利用)/.test(s)).slice(0, 3);
      if (eng.length) defaultAdm.english = eng.join('\n');
    }
  }

  /**
   * 大学名の推定（冒頭行を優先、頻度・長さで決定）
   */
  extractUniversityName(text) {
    const stop = /^(大学|大学院大学|短期大学|高等専門学校・短期大学|本大学|他大学|各大学|国立大学|公立大学|私立大学|出身大学|同大学|当大学|志望大学|総合大学|単科大学|外部大学|研究大学|指定国立大学|他の大学|海外の大学|海外大学|一般大学|有名大学|理系大学|情報系大学|工業大学|技術大学|情報大学)$/;
    const collect = (src) => {
      const set = new Set();
      const reA = /[一-龥々ァ-ヶーA-Za-z・]{1,16}?(?:大学院大学|大学)(?!院)/g;
      const reB = /(?:^|[\s　【「『（(・|｜:：])([ぁ-んァ-ヶー一-龥々A-Za-z・]{1,14}?(?:大学院大学|大学))(?!院)/gm;
      let m;
      while ((m = reA.exec(src)) !== null) set.add(m[0]);
      while ((m = reB.exec(src)) !== null) {
        if (!/(の|では|には|について|として|から|より|を|が|へ)/.test(m[1])) set.add(m[1]);
      }
      return [...set]
        .map(c => c.replace(/^(国立大学法人|公立大学法人|独立行政法人|学校法人|法人)/, '').trim())
        .filter(c => c && !stop.test(c));
    };

    const head = text.split('\n').slice(0, 6).join('\n');
    let cands = collect(head);
    if (cands.length === 0) cands = collect(text);
    if (cands.length === 0) return '';

    // 他候補の末尾部分にすぎない候補（「情報大学」⊂「みなと情報大学」）や列挙（「高専・短期大学」）は除外
    cands = cands.filter(c => !cands.some(o => o !== c && o.endsWith(c)) && !/・(短期大学|大学)$/.test(c));
    if (cands.length === 0) return '';
    // 出現回数が多いもの、同数なら文書の先頭に近いもの（タイトル行）を優先
    const count = (c) => text.split(c).length - 1;
    cands.sort((a, b) => count(b) - count(a) || text.indexOf(a) - text.indexOf(b));
    return cands[0];
  }

  extractFaculty(text) {
    const stop = /^(他|各|本|当|同|全|他の|各)(学部|研究科|学府|学院)$/;
    const re = /[一-龥々ァ-ヶー・]{1,24}?(?:研究科|学府|学部|学環|学院|学群)/g;
    const counts = new Map();
    let m;
    while ((m = re.exec(text)) !== null) {
      const cand = m[0].replace(/^.*(?:大学院大学|大学院|大学)/, '');
      if (cand.length < 3 || stop.test(cand) || /^(学部|研究科|学院)$/.test(cand)) continue;
      counts.set(cand, (counts.get(cand) || 0) + 1);
    }
    return this.pickMostFrequent(counts);
  }

  extractDepartment(text) {
    const stop = /^(他|各|本|当|同|全)(学科|専攻|コース|プログラム)$/;
    const re = /[一-龥々ァ-ヶー・]{2,24}?(?:専攻|学科|学系|コース|プログラム)/g;
    const counts = new Map();
    let m;
    while ((m = re.exec(text)) !== null) {
      const cand = m[0].replace(/^.*(?:研究科|学府|学部|学環|学院|学群|大学)/, '');
      if (cand.length < 3 || stop.test(cand) || /(課程|入試|選抜|編入|博士|修士)/.test(cand)) continue;
      counts.set(cand, (counts.get(cand) || 0) + 1);
    }
    return this.pickMostFrequent(counts);
  }

  pickMostFrequent(counts) {
    let best = '';
    let bestCount = 0;
    for (const [cand, n] of counts) {
      if (n > bestCount || (n === bestCount && cand.length > best.length)) {
        best = cand;
        bestCount = n;
      }
    }
    return best;
  }

  inferUniversityType(name, text) {
    if (/(県立|市立|府立|都立|公立)/.test(name || '')) return '公立';
    if (/国立大学法人|国立大学/.test(text)) return '国立';
    if (/公立大学法人|公立大学/.test(text)) return '公立';
    if (/学校法人|私立大学|私立/.test(text)) return '私立';
    return '';
  }

  /**
   * 研究室見出しがない文章から「〇〇研究室」を拾い、言及している文をまとめる
   */
  extractInlineLabs(text) {
    const labs = [];
    const re = /([一-龥々ァ-ヶーA-Za-z]{1,10})(研究室|ラボ)/g;
    const stopBase = /^(本|当|同|各|全|他|所属|希望|志望|配属|オープン|主な|関連|附属|学内|学外|情報系|研究|人気)$/;
    const byName = new Map();
    const findNames = (str) => {
      const names = [];
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(str)) !== null) {
        const base = m[1];
        if (stopBase.test(base) || /(訪問|見学|紹介|一覧)$/.test(base)) continue;
        names.push(base + m[2]);
      }
      return names;
    };

    // 行単位で処理し、研究室名が出てきた文以降の同じ行の文はその研究室の説明として扱う
    for (const line of text.split('\n')) {
      let current = null;
      for (const sentence of line.split(/(?<=。)/).map(s => s.trim()).filter(Boolean)) {
        const names = findNames(sentence);
        if (names.length > 0) {
          current = names[0];
          if (!byName.has(current) && byName.size < 20) byName.set(current, this.createLab(current));
        }
        const lab = current && byName.get(current);
        if (lab) lab.description = lab.description ? `${lab.description}\n${sentence}` : sentence;
      }
    }
    for (const lab of byName.values()) labs.push(lab);
    return labs;
  }

  /**
   * 選択テキストを1つ以上の研究室として解析（テキスト選択マッピング用）
   */
  parseLabBlock(text) {
    const parsed = this.parse(text);
    if (parsed.labs.length > 0 && parsed.labs.some(l => l.description || l.professor || l.area)) {
      return parsed.labs;
    }
    const normalized = this.normalizeText(text).trim();
    const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    const lab = this.createLab();
    if (lines.length > 1 && lines[0].length <= 30) {
      lab.name = this.cleanHeaderText(lines.shift(), true);
    } else {
      lab.name = parsed.labs[0]?.name || '（研究室名未設定）';
    }
    lab.description = lines.join('\n');
    lab.professor = this.extractProfessors(normalized);
    return [lab];
  }

  /**
   * 日付と行事（出願・試験・説明会など）を抽出してタイムライン化
   * @returns {{date: string, label: string, yearGuessed: boolean}[]}
   */
  extractEvents(text, baseDate = new Date()) {
    if (!text) return [];
    const normalized = this.normalizeText(text);
    const eventWord = /出願|試験|選抜|発表|説明会|オープン|締切|期限|面接|受付|見学|公開|入学|手続|募集|入試|口述|口頭|筆記|事前相談|ガイダンス/;
    const events = [];
    let contextYear = null;

    const pad = n => String(n).padStart(2, '0');
    for (const rawLine of normalized.split('\n')) {
      const line = rawLine.trim().replace(/^[・\-■▼◆●\s]+/, '');
      if (!line) continue;

      const yearOnly = line.match(/(20[0-9]{2})\s*年度?/);
      const reiwa = line.match(/令和\s*([0-9]{1,2}|元)\s*年/);

      let m = line.match(/(20[0-9]{2})\s*[年/.\-]\s*([0-9]{1,2})\s*[月/.\-]\s*([0-9]{1,2})/);
      let year;
      let month;
      let day;
      let guessed = false;
      if (m) {
        [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
      } else if ((m = line.match(/令和\s*([0-9]{1,2}|元)\s*年\s*([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日/))) {
        year = 2018 + (m[1] === '元' ? 1 : Number(m[1]));
        [month, day] = [Number(m[2]), Number(m[3])];
      } else if ((m = line.match(/(?<![0-9])([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*日/)) || (m = line.match(/(?<![0-9/])([0-9]{1,2})\/([0-9]{1,2})(?![0-9/])/))) {
        [month, day] = [Number(m[1]), Number(m[2])];
        year = contextYear || baseDate.getFullYear();
        guessed = !contextYear;
      }

      if (yearOnly) contextYear = Number(yearOnly[1]);
      else if (reiwa) contextYear = 2018 + (reiwa[1] === '元' ? 1 : Number(reiwa[1]));

      if (!month || month < 1 || month > 12 || day < 1 || day > 31) continue;
      if (!eventWord.test(line)) continue;

      const label = line.length > 70 ? line.slice(0, 70) + '…' : line;
      const date = `${year}-${pad(month)}-${pad(day)}`;
      if (!events.some(e => e.date === date && e.label === label)) {
        events.push({ date, label, yearGuessed: guessed });
      }
    }
    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * 入試情報から日程タイムラインを作る（トラック名つき）
   */
  buildAdmissionEvents(admissions) {
    const events = [];
    for (const [track, adm] of Object.entries(admissions || {})) {
      const text = Object.values(adm).filter(Boolean).join('\n');
      this.extractEvents(text).forEach(ev => events.push({ ...ev, track }));
    }
    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * テキストの整形と最終調整
   */
  finalize(result, normalizedText) {
    const clean = (s) => (s || '')
      .trim()
      .replace(/^[:：\-・\s]+/, '')
      .replace(/[:：\s]+$/, '');

    for (const key of Object.keys(result.university)) {
      result.university[key] = clean(result.university[key]);
    }
    for (const adm of Object.values(result.admissions)) {
      for (const key of Object.keys(adm)) adm[key] = clean(adm[key]);
    }
    result.labs = result.labs
      .map(lab => {
        for (const key of Object.keys(lab)) {
          if (typeof lab[key] === 'string' && key !== 'id') lab[key] = clean(lab[key]);
        }
        return lab;
      })
      .filter(lab => lab.name);

    // 同名研究室の統合
    const merged = [];
    for (const lab of result.labs) {
      const existing = merged.find(l => l.name === lab.name);
      if (!existing) {
        merged.push(lab);
        continue;
      }
      for (const key of Object.keys(lab)) {
        if (typeof lab[key] === 'string' && lab[key] && key !== 'id') {
          existing[key] = existing[key] && !existing[key].includes(lab[key]) ? `${existing[key]}\n${lab[key]}` : (existing[key] || lab[key]);
        }
      }
    }
    result.labs = merged;

    result.events = this.buildAdmissionEvents(result.admissions);
    // 研究室公開・オープンキャンパス等、入試欄以外の日程も拾う
    this.extractEvents(normalizedText).forEach(ev => {
      if (!result.events.some(e => e.date === ev.date)) {
        result.events.push({ ...ev, track: 'general' });
      }
    });
    result.events.sort((a, b) => a.date.localeCompare(b.date));

    delete result._preface;
    delete result._ignored;
    return result;
  }

  /**
   * AI出力など外部から来たデータを正しい形に整える（欠損補完・型の正規化）
   */
  normalizeResult(data, rawText = '') {
    const base = this.getEmptyResult();
    const toText = (v) => {
      if (v == null) return '';
      if (Array.isArray(v)) return v.map(toText).filter(Boolean).join('\n');
      if (typeof v === 'object') return Object.values(v).map(toText).filter(Boolean).join('\n');
      return String(v).trim();
    };

    const src = data || {};
    const uniSrc = src.university || {};
    for (const key of Object.keys(base.university)) base.university[key] = toText(uniSrc[key]);

    const admSrc = src.admissions || {};
    for (const track of Object.keys(base.admissions)) {
      const t = admSrc[track] || {};
      for (const key of Object.keys(base.admissions[track])) base.admissions[track][key] = toText(t[key]);
    }

    const labsSrc = Array.isArray(src.labs) ? src.labs : [];
    base.labs = labsSrc.map(l => {
      const lab = this.createLab();
      for (const key of Object.keys(lab)) {
        if (typeof lab[key] === 'string' && key !== 'id' && l && l[key] !== undefined) lab[key] = toText(l[key]);
      }
      return lab;
    }).filter(l => l.name);

    base.events = this.buildAdmissionEvents(base.admissions);
    if (rawText) {
      this.extractEvents(rawText).forEach(ev => {
        if (!base.events.some(e => e.date === ev.date)) base.events.push({ ...ev, track: 'general' });
      });
      base.events.sort((a, b) => a.date.localeCompare(b.date));
    }
    delete base._preface;
    return base;
  }

  /**
   * 2つの解析結果をマージ（AI結果の空欄を内蔵パーサーの結果で補完）
   */
  mergeResults(primary, secondary) {
    const out = JSON.parse(JSON.stringify(primary));
    for (const key of Object.keys(out.university)) {
      if (!out.university[key] && secondary.university[key]) out.university[key] = secondary.university[key];
    }
    for (const track of Object.keys(out.admissions)) {
      for (const key of Object.keys(out.admissions[track])) {
        if (!out.admissions[track][key] && secondary.admissions[track][key]) {
          out.admissions[track][key] = secondary.admissions[track][key];
        }
      }
    }
    if (out.labs.length === 0) out.labs = secondary.labs;
    const seen = new Set(out.events.map(e => e.date + e.label));
    secondary.events.forEach(e => {
      if (!seen.has(e.date + e.label)) out.events.push(e);
    });
    out.events.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }
}

// グローバルスコープにインスタンスを公開
window.universityParser = new UniversityTextParser();
