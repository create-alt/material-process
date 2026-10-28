/**
 * 情報系 研究分野インテリジェンス
 * 研究分野タグの自動判定、研究室の「特徴」抽出、興味分野とのマッチ度計算、
 * 研究室訪問チェックリストなど、研究室比較のための補助ロジックをまとめています。
 */

class LabInsights {
  constructor() {
    // 情報系の研究分野辞書（同義語・英語表記・略称を吸収）
    this.researchAreas = [
      { key: 'ai', label: 'AI・機械学習', icon: '🤖', words: ['機械学習', '深層学習', 'ディープラーニング', '人工知能', 'AI', '強化学習', 'ニューラルネット', 'LLM', '大規模言語モデル', '生成AI', '生成モデル', 'データマイニング', 'パターン認識', 'Machine Learning', 'Deep Learning'] },
      { key: 'nlp', label: '自然言語処理', icon: '💬', words: ['自然言語', '言語処理', 'NLP', '対話システム', '機械翻訳', 'テキストマイニング', '言語モデル', '情報検索', '質問応答', '文書要約'] },
      { key: 'cv', label: '画像・映像/CV', icon: '📷', words: ['画像処理', '画像認識', 'コンピュータビジョン', 'Computer Vision', '映像', '物体検出', '3次元復元', '三次元計測', '動画像', 'CV'] },
      { key: 'hci', label: 'HCI・インタラクション', icon: '🖐️', words: ['HCI', 'ヒューマンコンピュータ', 'インタラクション', 'ユーザインタフェース', 'ユーザーインターフェース', 'UI', 'UX', '可視化', '人間中心', 'ウェアラブル', 'ユビキタス'] },
      { key: 'cg', label: 'CG・VR/AR', icon: '🥽', words: ['VR', 'AR', 'MR', 'xR', 'バーチャルリアリティ', '仮想現実', '拡張現実', 'CG', 'コンピュータグラフィックス', 'メタバース', 'ゲーム'] },
      { key: 'security', label: 'セキュリティ', icon: '🔐', words: ['セキュリティ', '暗号', 'プライバシー', 'マルウェア', '認証', 'ブロックチェーン', 'サイバー', '脆弱性'] },
      { key: 'network', label: 'ネットワーク・IoT', icon: '📡', words: ['ネットワーク', '通信', '無線', 'インターネット', '5G', '6G', 'SDN', 'IoT', 'センサネットワーク', 'モバイル'] },
      { key: 'systems', label: 'OS・分散/クラウド/HPC', icon: '🖥️', words: ['オペレーティングシステム', 'OS', '分散システム', '分散処理', 'クラウド', '仮想化', '並列', 'HPC', '高性能計算', 'スーパーコンピュータ', 'エッジコンピューティング'] },
      { key: 'arch', label: 'アーキテクチャ・ハードウェア', icon: '🔌', words: ['コンピュータアーキテクチャ', 'アーキテクチャ', 'プロセッサ', 'FPGA', 'LSI', '集積回路', '回路', '組込み', '組み込み', 'ハードウェア', 'アクセラレータ'] },
      { key: 'se', label: 'ソフトウェア工学', icon: '🛠️', words: ['ソフトウェア工学', 'ソフトウェア開発', 'ソフトウェアテスト', '要求工学', '開発プロセス', 'リポジトリマイニング', 'プログラム解析', 'バグ', 'リファクタリング', 'オープンソース'] },
      { key: 'pl', label: 'プログラミング言語・検証', icon: '🧩', words: ['プログラミング言語', 'コンパイラ', '型システム', '形式検証', '形式手法', 'プログラム検証', '関数型', 'モデル検査'] },
      { key: 'theory', label: '理論・アルゴリズム', icon: '📐', words: ['アルゴリズム', '計算量', 'グラフ理論', '離散数学', '組合せ最適化', '最適化', '計算理論', '数理', 'オートマトン', '情報理論'] },
      { key: 'data', label: 'データ科学・DB', icon: '📊', words: ['データベース', 'データサイエンス', 'ビッグデータ', '統計', 'データ分析', '知識グラフ', 'データ工学', '推薦システム'] },
      { key: 'robot', label: 'ロボティクス・制御', icon: '🦾', words: ['ロボット', 'ロボティクス', '制御', '自動運転', 'ドローン', 'センシング', 'マニピュレーション'] },
      { key: 'audio', label: '音声・音響・音楽', icon: '🎧', words: ['音声', '音響', '音楽情報', '音声認識', '音声合成', '聴覚'] },
      { key: 'bio', label: 'バイオ・医療・脳情報', icon: '🧬', words: ['バイオインフォマティクス', '生命情報', '医療', 'ヘルスケア', '脳', 'ゲノム', '生体信号', '医用画像'] },
      { key: 'quantum', label: '量子情報・量子計算', icon: '⚛️', words: ['量子'] },
      { key: 'social', label: '教育・社会情報', icon: '🌐', words: ['教育工学', '学習支援', 'eラーニング', 'e-learning', '社会情報', '情報社会', '行動変容', '防災', 'ソーシャルメディア', '計算社会科学'] }
    ];

    // 研究室ステータス（志望度管理）
    this.statuses = [
      { key: '', label: '未設定' },
      { key: 'researching', label: '調査中' },
      { key: 'contacted', label: '問い合わせ済' },
      { key: 'visit_planned', label: '訪問予定' },
      { key: 'visited', label: '訪問済' },
      { key: 'first_choice', label: '第一志望' },
      { key: 'applied', label: '出願済' },
      { key: 'excluded', label: '候補外' }
    ];

    // 研究室訪問・問い合わせ時に確認したい質問テンプレート
    this.visitQuestions = [
      { key: 'coretime', text: 'コアタイムの有無・研究室にいる時間の目安' },
      { key: 'meeting', text: 'ゼミ・ミーティングの頻度と形式（進捗報告・輪講など）' },
      { key: 'theme', text: '研究テーマの決め方（自分で提案 / 先生から提示）' },
      { key: 'guidance', text: '指導スタイル・先生と話せる頻度' },
      { key: 'conference', text: '学会発表・論文投稿の機会（国際会議を含む）' },
      { key: 'resource', text: 'GPU・計算機サーバなどの研究環境' },
      { key: 'external', text: '外部生・編入生の在籍状況、受け入れ方針' },
      { key: 'exam', text: '院試・編入試験の対策方法、過去問の入手方法' },
      { key: 'career', text: '修了生の進路・就職先・博士進学者の有無' },
      { key: 'members', text: '学生の人数・学年構成・雰囲気' },
      { key: 'support', text: 'RA/TAや奨学金などの経済的支援' },
      { key: 'collab', text: '企業との共同研究・インターンの機会' }
    ];

    this.areaRegexCache = new Map();
  }

  getArea(key) {
    return this.researchAreas.find(a => a.key === key);
  }

  getStatusLabel(key) {
    return (this.statuses.find(s => s.key === key) || this.statuses[0]).label;
  }

  /**
   * 研究室データを検索・判定用の1つのテキストに連結
   */
  getLabText(lab) {
    if (!lab) return '';
    return [
      lab.name, lab.area, lab.description, lab.keywords, lab.features,
      lab.achievements, lab.collaboration, lab.members, lab.career, lab.contact
    ].filter(Boolean).join('\n');
  }

  /**
   * 単語ごとのマッチ用正規表現（英字略語は単語境界つき）
   */
  wordRegex(word) {
    if (this.areaRegexCache.has(word)) return this.areaRegexCache.get(word);
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = /^[A-Za-z0-9\- ]+$/.test(word)
      ? new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, 'i')
      : new RegExp(escaped);
    this.areaRegexCache.set(word, re);
    return re;
  }

  /**
   * テキストから情報系の研究分野タグを判定（出現語数の多い順）
   * @returns {string[]} 分野キーの配列
   */
  detectAreas(text) {
    if (!text) return [];
    const scored = [];
    for (const area of this.researchAreas) {
      const hits = area.words.filter(w => this.wordRegex(w).test(text)).length;
      if (hits > 0) scored.push({ key: area.key, hits });
    }
    return scored.sort((a, b) => b.hits - a.hits).map(s => s.key);
  }

  getLabTags(lab) {
    return this.detectAreas(this.getLabText(lab));
  }

  /**
   * 文章の先頭1文を要約として取り出す
   */
  summarize(text, max = 80) {
    if (!text) return '';
    const flat = text.replace(/^[・\-\s]+/gm, '').replace(/\s*\n\s*/g, ' ').trim();
    const first = flat.split(/(?<=。)/)[0] || flat;
    return first.length > max ? first.slice(0, max) + '…' : first;
  }

  /**
   * 研究室の本文から「特徴」を箇条書きで抽出
   * @returns {{icon: string, text: string}[]}
   */
  buildHighlights(lab) {
    const text = this.getLabText(lab);
    const out = [];
    const add = (icon, value) => {
      if (value && !out.some(o => o.text === value)) out.push({ icon, text: value });
    };

    if (/コアタイム(?:は|：|:)?\s*(?:なし|無し|ありません|特になし|自由|設けていません|設けない)/.test(text)) {
      add('🕊️', 'コアタイムなし（自由な研究スタイル）');
    } else {
      const core = text.match(/コアタイム(?:は|：|:)?\s*([0-9]{1,2}[:：時][0-9]{0,2}[^\n。、]{0,12})/);
      if (core) add('⏰', `コアタイムあり（${core[1].trim()}）`);
    }

    const meeting = text.match(/(週\s*[0-9一二三]\s*回|隔週|毎週[^\n。、]{0,4}|月\s*[0-9一二]\s*回)[^\n。]{0,8}?(ゼミ|ミーティング|輪講|進捗報告|勉強会)/);
    if (meeting) add('📅', `${meeting[1].trim()}の${meeting[2]}`);

    if (/国際会議|国際学会|トップカンファレンス|IEEE|ACM|CVPR|ICCV|ECCV|NeurIPS|ICML|ICLR|ACL|EMNLP|NAACL|CHI|UIST|AAAI|IJCAI|SIGGRAPH|USENIX|ISCA|SIGMOD|VLDB|KDD|ICSE/.test(text)) {
      add('🌏', '国際会議・トップ会議での発表実績あり');
    }
    if (/受賞|賞を|Award|表彰/.test(text)) add('🏆', '受賞実績あり');
    if (/企業との|企業と共同|産学連携|共同研究|企業連携|民間企業/.test(text)) add('🏢', '企業・外部機関との共同研究あり');
    if (/留学|海外派遣|海外インターン|インターンシップ|海外の大学/.test(text)) add('✈️', '留学・インターンの機会あり');
    if (/博士(?:後期)?課程(?:の学生|学生|へ進学|に進学|進学)|博士進学|ドクター/.test(text)) add('🎓', '博士課程の学生・進学実績あり');
    if (/GPU|計算機サーバ|計算サーバ|スパコン|スーパーコンピュータ|クラスタ/.test(text)) add('🖥️', '計算資源（GPU等）あり');
    if (/外部生|外部からの|他大学|編入生|編入学生|高専出身|高専から/.test(text)) add('🚪', '外部生・編入生の在籍/受け入れあり');
    if (/(?<![A-Za-z])RA(?![A-Za-z])|リサーチアシスタント|TA雇用|経済支援|給付/.test(text)) add('💴', 'RA等の経済的支援あり');

    if (lab.members) {
      // 「博士3名、修士12名、学部生6名」→ 合計21名
      const nums = [...lab.members.matchAll(/([0-9]{1,3})\s*(?:名|人)(?!中)/g)].map(m => Number(m[1]));
      const total = nums.length > 1 && /うち/.test(lab.members) ? nums.slice(0, -1).reduce((a, b) => a + b, 0) : nums.reduce((a, b) => a + b, 0);
      add('👥', total ? `メンバー約${total}名` : this.summarize(lab.members, 30));
    }
    if (lab.career) add('💼', `進路: ${this.summarize(lab.career, 34)}`);
    if (lab.contact) add('🤝', `研究室訪問: ${this.summarize(lab.contact, 30)}`);

    return out;
  }

  /**
   * 興味プロファイルとのマッチ度 (0-100)
   * 一致1件で50%、2件で75%…と飽和的に上昇（多くの興味を登録しても極端に低くならない）
   */
  computeMatch(lab, profile) {
    if (!profile || ((!profile.areas || !profile.areas.length) && (!profile.keywords || !profile.keywords.length))) {
      return null;
    }
    const text = this.getLabText(lab);
    const tags = this.detectAreas(text);
    const areaHits = (profile.areas || []).filter(a => tags.includes(a));
    const kwHits = (profile.keywords || []).filter(k => k && this.wordRegex(k).test(text));
    const hitCount = areaHits.length + kwHits.length;
    const score = hitCount === 0 ? 0 : Math.round(100 * (1 - Math.pow(0.5, hitCount)));
    const labels = [
      ...areaHits.map(a => this.getArea(a)?.label || a),
      ...kwHits
    ];
    return { score, hits: labels };
  }
}

window.labInsights = new LabInsights();
