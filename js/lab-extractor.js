/**
 * 研究室候補の抽出エンジン
 *   1. ページ（HTML / テキスト）を「見出し・リスト項目・表の行・本文」の行構造に変換
 *   2. ルールで研究室らしさをスコアリング（「〇〇研究室」が無く教員名だけが列挙されたページにも対応）
 *   3. ローカルSLMに番号付きの行を読ませ、文脈から研究室を判定（行番号で根拠を固定し、捏造を検証で排除）
 *   4. クローラー用に、たどるべきリンクをスコアリング
 */

class LabExtractor {
  constructor(parser, insights) {
    this.parser = parser;
    this.insights = insights;

    this.titles = '特任教授|特任准教授|特任講師|特任助教|名誉教授|客員教授|客員准教授|准教授|教授|専任講師|講師|助教|Professor|Associate Professor|Assistant Professor|Lecturer|Prof\\.';
    this.titleRe = new RegExp(`^(?:${this.titles})$`, 'i');

    // 研究室・教員一覧のセクションを示す見出し
    this.labSectionRe = /研究室|ラボ|教員|スタッフ|メンバー|研究者|研究分野|研究グループ|講座|分野|部門|領域|Faculty|Staff|Members?|People|Labs?\b|Laborator|Research Groups?/i;
    // 分野グループ見出しとして採用しない汎用見出し
    this.genericHeadingRe = /^(研究室一覧|研究室紹介|研究室|研究室・教員紹介|教員一覧|教員紹介|教員|スタッフ|メンバー|研究者一覧|研究紹介|研究内容|Faculty|Staff|Members|People|Labs?|Laboratories|Research|一覧|トップ|ホーム|Home|ページ本文)$/i;
    // 分野見出しらしい語
    this.fieldHeadingRe = /分野|講座|コース|部門|領域|系$|専攻|学科|グループ|プログラム|Division|Area|Course|Department|Group|Field/i;
    // ナビゲーション・事務系の行
    this.navRe = /ニュース|お知らせ|新着|トピックス|イベント|アクセス|サイトマップ|お問い合わせ|問合せ|プライバシー|個人情報|著作権|Copyright|ログイン|English|日本語|ホーム|トップページ|ページの先頭|メニュー|シラバス|時間割|就職支援|採用情報|寄附|寄付|一覧へ|もっと見る|詳しく見る|Read more|More/i;
    // 姓に使われにくい文字（「研究 内容」「情報 科学」などの誤検出防止）
    this.nonNameCharRe = /[学科究情報論系部室試験術際的性化用業法理工能覧概要紹介入術算機器報育論析門野域類方式等内容一覧集募担当演習授業講義課程期日年月時号館階]/;

    this.blockTags = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'DL', 'DT', 'DD', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'FIGURE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FORM', 'CAPTION', 'FIGCAPTION', 'ADDRESS', 'PRE']);
  }

  // =========================================================
  // 1. 行構造化
  // =========================================================

  /**
   * HTMLドキュメントを行の配列に変換
   * @returns {Array<{kind: string, text: string, href: string, headings: string[], parent: number, cells?: string[], columns?: string[]}>}
   */
  linesFromDocument(doc, baseUrl) {
    const source = doc.querySelector('main, [role="main"], #main, #contents, #content, .main, .contents, .l-main') || doc.body;
    if (!source) return [];
    const root = source.cloneNode(true);
    root.querySelectorAll('script, style, noscript, svg, iframe, canvas, nav, header, footer, aside, form, button, [role="navigation"], [role="banner"], [role="contentinfo"], .breadcrumb, .breadcrumbs, .pankuzu, .topicpath, .sns, .share, .pagetop').forEach(el => el.remove());

    const lines = [];
    const headings = [];
    const parentIds = new WeakMap();
    let nextParentId = 1;
    const parentId = (el) => {
      if (!el) return 0;
      if (!parentIds.has(el)) parentIds.set(el, nextParentId++);
      return parentIds.get(el);
    };
    const tableColumns = new WeakMap();

    const resolveHref = (el) => {
      const a = el.tagName === 'A' ? el : el.querySelector('a[href]');
      const raw = a && a.getAttribute('href');
      if (!raw || /^(#|javascript:|mailto:|tel:)/i.test(raw)) return '';
      try {
        return new URL(raw, baseUrl).href;
      } catch {
        return '';
      }
    };
    const push = (kind, text, el, extra = {}) => {
      const cleaned = this.cleanText(text);
      if (!cleaned) return;
      lines.push({
        kind,
        text: cleaned.length > 300 ? cleaned.slice(0, 300) + '…' : cleaned,
        href: el ? resolveHref(el) : '',
        headings: headings.map(h => h.text),
        parent: parentId(el && el.parentElement),
        ...extra
      });
    };
    const hasBlockChild = (el) => Array.from(el.children).some(c => this.blockTags.has(c.tagName));
    const textWithBreaks = (el) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      return clone.textContent || '';
    };

    const walk = (el) => {
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        const text = this.cleanText(el.textContent);
        if (!text) return;
        while (headings.length && headings[headings.length - 1].level >= level) headings.pop();
        push('heading', text, el, { level });
        headings.push({ level, text });
        return;
      }
      if (tag === 'DT' || tag === 'CAPTION') {
        const text = this.cleanText(el.textContent);
        if (!text) return;
        while (headings.length && headings[headings.length - 1].level >= 7) headings.pop();
        push('heading', text, el, { level: 7 });
        headings.push({ level: 7, text });
        return;
      }
      if (tag === 'TR') {
        const cells = Array.from(el.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
        const texts = cells.map(c => this.cleanText(textWithBreaks(c).replace(/\n+/g, ' / ')));
        const table = el.closest('table');
        // 表の見出し行（すべてTH）→ 列名として記憶
        if (cells.length > 1 && cells.every(c => c.tagName === 'TH') && table && !tableColumns.has(table)) {
          tableColumns.set(table, texts);
          return;
        }
        if (texts.some(Boolean)) {
          push('row', texts.filter(Boolean).join(' | '), el, { cells: texts, columns: (table && tableColumns.get(table)) || null });
        }
        return;
      }
      if (tag === 'LI') {
        const nested = Array.from(el.children).filter(c => c.tagName === 'UL' || c.tagName === 'OL');
        if (nested.length) {
          const own = el.cloneNode(true);
          own.querySelectorAll('ul, ol').forEach(l => l.remove());
          push('item', own.textContent, el);
          // 入れ子リストは親項目を見出しとして扱う（「知能情報講座」→ 配下の研究室）
          const label = this.cleanText(own.textContent);
          if (label) headings.push({ level: 8, text: label });
          nested.forEach(walk);
          if (label) headings.pop();
          return;
        }
        if (hasBlockChild(el)) {
          Array.from(el.children).forEach(walk);
          return;
        }
        textWithBreaks(el).split('\n').forEach((part, i) => push('item', part, i === 0 ? el : null));
        return;
      }
      if (tag === 'A' && !el.closest('li, tr')) {
        push('link', el.textContent, el);
        return;
      }
      if (this.blockTags.has(tag) && !hasBlockChild(el)) {
        const kind = tag === 'DD' ? 'item' : 'text';
        textWithBreaks(el).split('\n').forEach((part, i) => push(kind, part, i === 0 ? el : null));
        return;
      }
      // ブロック要素の中に混在するテキストノード
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3) {
          if (node.textContent.trim()) push('text', node.textContent, el);
        } else if (node.nodeType === 1) {
          walk(node);
        }
      }
    };

    walk(root);
    return lines;
  }

  /**
   * 貼り付けテキストを行の配列に変換（Markdown・記号見出し・箇条書き・表に対応）
   */
  linesFromText(text) {
    const raw = String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .split('\n')
      .map(l => l.trim());
    const lines = [];
    const headings = [];
    let parent = 1;
    let columns = null;

    const isShortPlain = (l) => l && l.length <= 24 && !/[。、,，:：|｜]/.test(l) && !/^[・\-*•]/.test(l);

    for (let i = 0; i < raw.length; i++) {
      const l = raw[i];
      if (!l) {
        parent++;
        columns = null;
        continue;
      }
      if (/^\|?\s*:?-{2,}/.test(l)) continue;

      let kind = 'text';
      let level = 0;
      let body = l;
      let cells = null;
      const md = l.match(/^(#{1,6})\s+(.+)$/);
      if (md) {
        kind = 'heading';
        level = md[1].length;
        body = md[2];
      } else if (/^[【■□▼◆◇●★☆◎▶►]/.test(l) && l.length <= 40 && !this.findPerson(l)) {
        kind = 'heading';
        level = 3;
        body = l.replace(/^[【■□▼◆◇●○★☆◎▶►\s]+/, '').replace(/[】\s]+$/, '');
      } else if (/\|/.test(l) && l.split('|').filter(s => s.trim()).length >= 2) {
        cells = l.replace(/^\||\|$/g, '').split('|').map(s => s.trim());
        if (!columns && cells.every(c => c.length <= 12) && cells.some(c => /研究室|教員|氏名|職|分野|テーマ|研究|Name|Lab/i.test(c))) {
          columns = cells;
          continue;
        }
        kind = 'row';
        body = cells.filter(Boolean).join(' | ');
      } else if (/\t/.test(l)) {
        cells = l.split(/\t+/).map(s => s.trim());
        kind = 'row';
        body = cells.filter(Boolean).join(' | ');
      } else if (/^([・\-*•]|[0-9]{1,2}[.．)）])\s*/.test(l)) {
        kind = 'item';
        body = l.replace(/^([・\-*•]|[0-9]{1,2}[.．)）])\s*/, '');
      } else if (isShortPlain(l) && !this.findPerson(l) && !this.findLabName(l)) {
        // 「知能情報学分野」の直後に短い行が続く → 見出し
        const next = raw.slice(i + 1, i + 4).filter(Boolean);
        if (next.length >= 2 && next.every(n => n.length <= 60)) {
          kind = 'heading';
          level = 4;
        }
      }

      if (kind === 'heading') {
        while (headings.length && headings[headings.length - 1].level >= level) headings.pop();
        lines.push({ kind, text: this.cleanText(body), href: '', headings: headings.map(h => h.text), parent, level });
        headings.push({ level, text: this.cleanText(body) });
        parent++;
        continue;
      }
      const urlMatch = body.match(/https?:\/\/[^\s|）)」]+/);
      lines.push({
        kind,
        text: this.cleanText(body),
        href: urlMatch ? urlMatch[0] : '',
        headings: headings.map(h => h.text),
        parent,
        cells,
        columns: cells ? columns : null
      });
    }
    return lines;
  }

  cleanText(str) {
    return String(str || '').replace(/[\s　]+/g, ' ').trim();
  }

  // =========================================================
  // 2. ルールによる候補スコアリング
  // =========================================================

  /**
   * 文字列中の研究室名（「〇〇研究室」「〇〇ラボ」「XXX Lab」）
   */
  findLabName(text) {
    const jp = /([^\s、,，|｜/／()（）「」『』【】:：・]{1,20}?)\s?(研究室|ラボラトリー|ラボ|研究グループ)/g;
    let m;
    while ((m = jp.exec(text)) !== null) {
      const base = m[1];
      if (/^(本|当|同|各|全|この|その|他|所属|希望|志望|配属|おすすめ|人気|オープン|主な|関連|附属|学内|学外|情報系の?|研究|各種|全)$/.test(base)) continue;
      if (/(訪問|見学|紹介|一覧|案内|について|選び|決め|生活|探し|公開|説明|配属先|の)$/.test(base)) continue;
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 4);
      if (/^(一覧|紹介|訪問|見学|配属|案内|公開|では|には|の|を|が|は|で|に|と)/.test(after)) continue;
      return { name: base + m[2], index: m.index, length: m[0].length };
    }
    const en = text.match(/((?:[A-Z][\w&+\-]*\.?\s+){0,4}[A-Z][\w&+\-]*)\s+(Lab(?:oratory)?|Research Group|Group)\b/);
    if (en && !/^(The|Our|Research|Joint|Open)$/i.test(en[1])) {
      return { name: `${en[1]} ${en[2]}`, index: en.index, length: en[0].length };
    }
    return null;
  }

  /**
   * 教員名（職位つき / 名前のみ）の検出
   * @returns {{name: string, family: string, title: string}|null}
   */
  findPerson(text, cells = null) {
    // 表の行: 「山田 太郎 | 教授 | …」のように職位が別セル
    if (cells) {
      const titleCell = cells.find(c => this.titleRe.test(c));
      const nameCell = cells.find(c => this.isPersonName(c));
      if (nameCell) return { ...this.splitName(nameCell), title: titleCell || '' };
    }

    const H = '[一-龥々ヶ]';
    const jpTitles = '特任教授|特任准教授|特任講師|特任助教|名誉教授|客員教授|客員准教授|准教授|教授|専任講師|講師|助教';
    // 「山田 太郎 教授」「山田太郎教授」（名前→職位の順を優先）
    const reB = new RegExp(`(?:^|[\\s、,・/（(|｜])(${H}{1,4}\\s?${H}{1,4})\\s*(${jpTitles})`);
    const b = text.match(reB);
    if (b && this.isPlausibleName(b[1])) return { ...this.splitName(b[1]), title: b[2] };
    // 「教授 山田 太郎」（職位→名前。空白区切りの氏名、または4文字以内の氏名のみ）
    const reA = new RegExp(`(${jpTitles})[\\s:：・]*(${H}{1,4}\\s${H}{1,4}|${H}{2,4})(?![一-龥々])`);
    const a = text.match(reA);
    if (a && this.isPlausibleName(a[2])) return { ...this.splitName(a[2]), title: a[1] };

    const en = text.match(/(?:^|\b)(?:Prof\.|Professor|Associate Professor|Assistant Professor|Dr\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-zA-Z]+)+)/);
    if (en) return { ...this.splitName(en[1]), title: 'Professor' };

    // 名前のみ（行頭の「山田 太郎」の後に区切り・空白が続く）
    const head = text.split(/[|｜/／(（:：,，、]/)[0].trim();
    if (this.isPersonName(head)) return { ...this.splitName(head), title: '' };
    const lead = head.match(new RegExp(`^(${H}{1,4}\\s(?:${H}{1,4}|[ぁ-ん]{2,4}))(?:\\s|$)`));
    if (lead && this.isPersonName(lead[1])) return { ...this.splitName(lead[1]), title: '' };
    return null;
  }

  isPlausibleName(name) {
    const clean = this.cleanText(name);
    const parts = clean.split(' ');
    if (parts.length >= 2) return !this.nonNameCharRe.test(parts[0]) && !/[学科究情報論系部室試験術際的性化用業法工能覧概要紹介]/.test(parts[1]);
    return clean.length >= 2 && clean.length <= 4 && !this.nonNameCharRe.test(clean);
  }

  isPersonName(str) {
    const s = (str || '').trim();
    const jp = s.match(/^([一-龥々ヶ]{1,4})[\s　]+([一-龥々ヶぁ-んァ-ヶー]{1,5})$/);
    if (jp) return this.isPlausibleName(`${jp[1]} ${jp[2]}`);
    // ローマ字表記（Taro YAMADA / Yamada Taro）
    return /^[A-Z][a-z]+\s+[A-Z][A-Z]+$|^[A-Z][A-Z]+\s+[A-Z][a-z]+$/.test(s);
  }

  splitName(name) {
    const clean = this.cleanText(name).replace(/(先生|氏|様)$/, '');
    const parts = clean.split(' ');
    let family;
    if (parts.length >= 2) {
      // ローマ字は大文字の方を姓とみなす
      const upper = parts.find(p => /^[A-Z]{2,}$/.test(p));
      family = upper ? upper[0] + upper.slice(1).toLowerCase() : (/^[A-Za-z]/.test(parts[0]) ? parts[parts.length - 1] : parts[0]);
    } else {
      // 区切りなしの漢字氏名は先頭2文字を姓と推定（「山田太郎」→「山田」）
      family = clean.length >= 3 ? clean.slice(0, 2) : clean.slice(0, 1);
    }
    return { name: clean, family };
  }

  /**
   * 全行をスコアリングし、研究室候補を返す
   */
  scoreLines(lines) {
    // 同じ親要素（同じリスト・表）にある行のまとまり
    const groups = new Map();
    lines.forEach((line, idx) => {
      if (line.kind === 'heading') return;
      if (!groups.has(line.parent)) groups.set(line.parent, []);
      groups.get(line.parent).push(idx);
    });

    const features = lines.map(line => this.lineFeatures(line));
    // カード型（<h3>伊藤 恵</h3><p>准教授</p>）: 職位が次の行にある人名を職位つきとして扱う
    features.forEach((f, idx) => {
      if (f && f.person && !f.person.title) {
        const next = lines[idx + 1];
        if (next && this.titleRe.test(next.text.trim())) f.person.title = next.text.trim();
      }
    });
    const candidates = [];

    lines.forEach((line, idx) => {
      const f = features[idx];
      if (!f) return;
      let score = 0;
      const reasons = [];
      if (f.lab) {
        score += 4;
        reasons.push('研究室名');
      }
      if (f.person && f.person.title) {
        score += 3;
        reasons.push('職位つき教員名');
      } else if (f.person) {
        score += 1.2;
        reasons.push('人名');
      }
      if (!f.lab && !f.person) return;

      const context = [...line.headings, ...(line.columns || [])].join(' ');
      if (this.labSectionRe.test(context)) {
        score += 1.5;
        reasons.push('研究室/教員セクション');
      }
      if (line.href && /lab|labo|~|people|staff|faculty|member|kyoin|researcher|teacher|prof/i.test(line.href)) {
        score += 1;
        reasons.push('研究室らしいリンク');
      }
      if (['item', 'row', 'link'].includes(line.kind)) score += 0.5;
      if (line.kind === 'heading' && f.lab) score += 0.5;

      // 同じリスト内に人名/研究室名が並んでいる → 一覧である可能性が高い
      const siblings = groups.get(line.parent) || [];
      const similar = siblings.filter(i => features[i] && (features[i].lab || features[i].person)).length;
      if (siblings.length >= 3 && similar / siblings.length >= 0.5) {
        score += 1;
        reasons.push(`一覧(${similar}件)`);
      } else if (siblings.length === 2 && similar === 2) {
        score += 0.8;
        reasons.push('一覧(2件)');
      }

      if (this.navRe.test(line.text)) score -= 4;
      if (/(20[0-9]{2}|令和)\s*[年/.]\s*[0-9]{1,2}/.test(line.text)) score -= 2;
      if (line.text.length > 90) score -= 1.5;
      if (/。$/.test(line.text) && !f.lab) score -= 1.5;

      if (score >= 2.5) {
        candidates.push({ line: idx, score, reasons, ...this.describeCandidate(lines, idx, f) });
      }
    });
    return candidates;
  }

  lineFeatures(line) {
    const text = line.text;
    if (!text || text.length < 2 || text.length > 200) return null;
    // 表の行: 列名から研究室名・教員の列を特定
    let lab = null;
    if (line.cells && line.columns) {
      const labCol = line.columns.findIndex(c => /研究室|Lab/i.test(c || ''));
      const cell = labCol >= 0 ? (line.cells[labCol] || '').trim() : '';
      // 「研究室」列の値はそのまま研究室名として扱う（「山田研」「知能システム」など）
      if (cell && cell.length <= 30) {
        const name = /(研究室|研|ラボ|Lab|Laboratory|Group)$/i.test(cell) ? cell : `${cell}研究室`;
        lab = this.findLabName(cell) || { name, index: 0, length: cell.length };
      }
    }
    if (!lab) lab = this.findLabName(text);
    const person = this.findPerson(text, line.cells);
    if (!lab && !person) return null;
    return { lab, person };
  }

  /**
   * 候補行から研究室名・教員・テーマ・分野を組み立てる
   */
  describeCandidate(lines, idx, f) {
    const line = lines[idx];
    let name = f.lab ? f.lab.name : '';
    let derived = false;
    const professor = f.person ? `${f.person.title ? f.person.title + ' ' : ''}${f.person.name}`.trim() : '';
    if (!name && f.person) {
      name = /^[A-Za-z]/.test(f.person.family) ? `${f.person.family} Lab` : `${f.person.family}研究室`;
      derived = true;
    }

    // テーマ: 行から名前・職位を除いた残り（表は列名でテーマ列を優先）
    let topic = '';
    let field = '';
    if (line.cells && line.columns) {
      const pick = (re) => {
        const i = line.columns.findIndex(c => re.test(c || ''));
        return i >= 0 ? line.cells[i] || '' : '';
      };
      topic = pick(/テーマ|研究内容|研究分野|キーワード|Research|Topic/i);
      field = pick(/^(分野|講座|部門|領域|コース|専攻|系|Division|Area|Group)$/i);
    }
    if (!topic) {
      topic = line.text;
      if (f.lab) topic = topic.replace(f.lab.name, '');
      if (f.person) topic = topic.replace(f.person.name, '').replace(new RegExp(this.titles, 'g'), '');
      topic = topic.replace(/^[\s|｜/／:：\-–—・、,()（）]+|[\s|｜/／:：\-–—・、,()（）]+$/g, '').replace(/^[()（）\s]+|[()（）\s]+$/g, '');
      if (topic.length < 2 || this.isPersonName(topic)) topic = '';
    }

    // カード型レイアウト: 見出しの直後の数行（次の見出しまで）を補足情報として拾う
    const extra = [];
    for (let j = idx + 1; j < Math.min(lines.length, idx + 5); j++) {
      const next = lines[j];
      if (next.kind === 'heading' || (next.parent !== line.parent && line.kind !== 'heading')) break;
      if (this.lineFeatures(next)?.lab) break;
      if (line.kind === 'heading' || next.kind === 'text') extra.push(next.text);
    }
    let prof = professor;
    if (!prof && extra.length) prof = this.parser.extractProfessors(extra.join(' '));
    const extraTopic = extra.filter(t => !this.parser.extractProfessors(t) && t.length >= 4).slice(0, 2).join(' ');
    if (!topic && extraTopic) topic = extraTopic;

    return {
      name,
      derived,
      professor: prof,
      topic: topic.slice(0, 160),
      field: field || this.pickFieldHeading(line, name),
      href: line.href || ''
    };
  }

  /**
   * 分野グループ名: 近くの見出しのうち「〇〇分野」「〇〇講座」などを優先
   */
  pickFieldHeading(line, name) {
    const hs = line.headings.filter(h => h && h !== name && !this.genericHeadingRe.test(h) && h.length <= 40 && !/[|｜]/.test(h) && !this.findLabName(h));
    const fieldLike = [...hs].reverse().find(h => this.fieldHeadingRe.test(h));
    return fieldLike || hs[hs.length - 1] || '';
  }

  // =========================================================
  // 3. ローカルSLMによる文脈判定
  // =========================================================

  /**
   * 番号付きの行をSLMに読ませ、研究室を抽出する
   * @returns {Promise<Array<{line: number, name: string, professor: string, field: string, topic: string}>>}
   */
  async refineWithSlm(lines, slm, meta = {}, onProgress = () => {}) {
    // CPU実行などの遅いエンジンでは1回の入力を小さくし、1ページあたりの呼び出し回数も絞る
    if (slm.ensureReady) await slm.ensureReady();
    const profile = slm.profile ? slm.profile() : { chunkChars: 1400, maxChunksPerPage: 12 };
    const maxChunks = meta.maxChunks || profile.maxChunksPerPage;
    const usable = lines
      .map((l, i) => ({ i, l }))
      .filter(({ l }) => l.text.length >= 2 && !(this.navRe.test(l.text) && l.text.length < 20));
    if (usable.length === 0) return [];

    // 1回の入力が小さなモデルの文脈長（4kトークン）に収まるよう分割
    const chunks = [];
    let current = [];
    let size = 0;
    for (const item of usable) {
      const rendered = this.renderLineForSlm(item.i, item.l);
      if (size + rendered.length > profile.chunkChars && current.length) {
        chunks.push(current);
        current = [];
        size = 0;
      }
      current.push({ ...item, rendered });
      size += rendered.length;
    }
    if (current.length) chunks.push(current);

    // 上限を超える場合は、研究室・教員らしい行や研究室系の見出しが多い範囲を優先して判定
    if (chunks.length > maxChunks) {
      const weight = (chunk) => chunk.reduce((sum, { l }) => {
        const f = this.lineFeatures(l);
        return sum + (f ? 2 : 0) + (l.kind === 'heading' && this.labSectionRe.test(l.text) ? 1 : 0) + (/研究室|ラボ|Lab\b/.test(l.text) ? 1 : 0);
      }, 0);
      const keep = new Set(chunks.map((chunk, idx) => ({ idx, w: weight(chunk) }))
        .sort((a, b) => b.w - a.w || a.idx - b.idx)
        .slice(0, maxChunks)
        .map(x => x.idx));
      chunks.splice(0, chunks.length, ...chunks.filter((_, idx) => keep.has(idx)));
    }

    const schema = {
      type: 'object',
      properties: {
        labs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line: { type: 'integer' },
              name: { type: 'string' },
              professor: { type: 'string' },
              field: { type: 'string' },
              topic: { type: 'string' }
            },
            required: ['line', 'name', 'professor', 'field', 'topic']
          }
        }
      },
      required: ['labs']
    };

    const results = [];
    for (let c = 0; c < chunks.length; c++) {
      onProgress(c, chunks.length);
      const chunk = chunks[c];
      const firstLine = lines[chunk[0].i];
      const context = firstLine.headings.length ? `（この範囲の直前の見出し: ${firstLine.headings.join(' > ')}）\n` : '';
      const user = `ページ: ${meta.title || '(不明)'}
次の番号付きの行から「研究室」を表す行をすべて抜き出してください。
- 「〇〇研究室」「〇〇ラボ」「〇〇 Lab」のほか、研究室を主宰する教員（教授・准教授・講師など）の名前が並んでいる行も研究室として扱います。
- name: 行に研究室名があればそのまま。無ければ教員の姓＋「研究室」（例: 山田 太郎 → 山田研究室）。
- professor: 行にある教員の職位と氏名。無ければ空文字。
- field: その行が属する分野・講座・コースの見出し。無ければ空文字。
- topic: 行に書かれた研究テーマ。無ければ空文字。
- ニュース・メニュー・授業・入試・事務の行は含めないでください。行に書かれていない情報は作らないでください。
- 研究室が無ければ {"labs": []} を返してください。
${context}行:
${chunk.map(x => x.rendered).join('\n')}`;

      try {
        const res = await slm.chatJson({
          system: 'あなたは大学のWebページから研究室の一覧を抜き出す情報抽出器です。JSONのみを出力します。',
          user,
          schema,
          maxTokens: 900
        });
        const allowed = new Set(chunk.map(x => x.i));
        const chunkText = chunk.map(x => lines[x.i].text).join('\n');
        for (const item of (res.labs || [])) {
          const validated = this.validateSlmItem(item, lines, allowed, chunkText);
          if (validated) results.push(validated);
        }
      } catch (e) {
        console.warn('[SLM] chunk failed:', e);
        if (c === 0) throw e;
      }
    }
    onProgress(chunks.length, chunks.length);
    return results;
  }

  renderLineForSlm(i, line) {
    const prefix = line.kind === 'heading' ? '## ' : line.kind === 'item' ? '・' : '';
    let text = line.text;
    if (line.kind === 'row' && line.columns) {
      text = line.cells.map((c, k) => (c ? `${line.columns[k] ? line.columns[k] + ':' : ''}${c}` : '')).filter(Boolean).join(' | ');
    }
    return `[${i}] ${prefix}${text.length > 160 ? text.slice(0, 160) + '…' : text}`;
  }

  /**
   * SLM出力の検証（行に根拠が無い名前・分野は採用しない）
   */
  validateSlmItem(item, lines, allowed, chunkText) {
    const idx = Number(item && item.line);
    if (!Number.isInteger(idx) || !allowed.has(idx)) return null;
    const line = lines[idx];
    const squash = (s) => String(s || '').replace(/[\s　]/g, '');
    const lineText = squash(line.text);
    let name = this.cleanText(item.name);
    let professor = this.cleanText(item.professor);
    if (!name) return null;

    // 教員名は行に含まれている場合のみ採用
    if (professor) {
      const nameOnly = professor.replace(new RegExp(this.titles, 'g'), '').trim();
      if (!lineText.includes(squash(nameOnly))) professor = '';
    }
    // 研究室名: 行に含まれる / 「姓＋研究室」で姓が行に含まれる / ルールで人名が検出できる行のみ
    if (!lineText.includes(squash(name))) {
      const base = name.replace(/\s*(研究室|ラボ|Lab|Laboratory)$/i, '');
      const person = this.findPerson(line.text, line.cells);
      if (base && lineText.includes(squash(base)) && base.length <= 6) {
        // ok: 姓から作った研究室名
      } else if (person) {
        name = /^[A-Za-z]/.test(person.family) ? `${person.family} Lab` : `${person.family}研究室`;
      } else {
        return null;
      }
    }
    // 名前が汎用語だけのものは除外
    if (/^(研究室|ラボ|Lab|研究室一覧|教員)$/i.test(name)) return null;

    const field = squash(item.field) && squash(chunkText + line.headings.join('')).includes(squash(item.field)) ? this.cleanText(item.field) : '';
    const topic = squash(item.topic) && lineText.includes(squash(item.topic).slice(0, 6)) ? this.cleanText(item.topic) : '';
    return { line: idx, name, professor, field, topic };
  }

  // =========================================================
  // 4. 候補の確定
  // =========================================================

  /**
   * ルール候補とSLM結果を統合して研究室リストを確定
   * @param {object} opts { useSlm: boolean, pageUrl: string }
   */
  finalize(lines, candidates, slmLabs = [], opts = {}) {
    const byLine = new Map();
    candidates.forEach(c => byLine.set(c.line, { ...c, sources: ['rule'] }));

    slmLabs.forEach(s => {
      const existing = byLine.get(s.line);
      if (existing) {
        existing.sources.push('slm');
        if (existing.derived && s.name && !/研究室$|Lab$/.test(existing.name)) existing.name = s.name;
        if (!existing.professor && s.professor) existing.professor = s.professor;
        if (!existing.topic && s.topic) existing.topic = s.topic;
        if (!existing.field && s.field) existing.field = s.field;
      } else {
        const line = lines[s.line];
        byLine.set(s.line, {
          line: s.line,
          score: 2.5,
          reasons: ['SLMが文脈から判定'],
          name: s.name,
          derived: !line.text.replace(/\s/g, '').includes(s.name.replace(/\s/g, '')),
          professor: s.professor,
          topic: s.topic,
          field: s.field || this.pickFieldHeading(line, s.name),
          href: line.href || '',
          sources: ['slm']
        });
      }
    });

    // まずは取りこぼさないことを優先し、ルール候補(3.5以上)とSLMの判定を合わせて採用する
    // （SLMが選ばなかった中程度スコアのルール候補は信頼度を下げ、一覧で未選択の状態にする）
    const slmUsed = !!opts.useSlm;
    const accepted = [...byLine.values()].filter(c => c.sources.includes('slm') || c.score >= 3.5);
    if (slmUsed) {
      accepted.forEach(c => {
        if (!c.sources.includes('slm') && c.score < 4.5) c.penalty = 0.8;
      });
    }

    // 同名（または同じ教員）の研究室を統合
    const merged = [];
    for (const c of accepted.sort((a, b) => a.line - b.line)) {
      const key = this.labKey(c.name);
      const same = merged.find(m => this.labKey(m.name) === key || (c.professor && m.professor && this.squash(m.professor) === this.squash(c.professor)));
      if (same) {
        ['professor', 'topic', 'field', 'href'].forEach(k => { if (!same[k] && c[k]) same[k] = c[k]; });
        same.sources = [...new Set([...same.sources, ...c.sources])];
        same.score = Math.max(same.score, c.score);
        if (same.derived && !c.derived) {
          same.name = c.name;
          same.derived = false;
        }
        continue;
      }
      merged.push({ ...c, page: opts.pageUrl || '' });
    }

    return merged.map(c => ({
      name: c.name,
      derived: !!c.derived,
      professor: c.professor || '',
      topic: c.topic || '',
      field: c.field || '',
      url: c.href || '',
      page: c.page,
      sources: c.sources,
      confidence: Math.min(1, (c.sources.includes('slm') ? 0.35 : 0) + c.score / 8) * (c.penalty || 1),
      reasons: c.reasons
    }));
  }

  squash(s) {
    return String(s || '').replace(/[\s　]/g, '').toLowerCase();
  }

  labKey(name) {
    return this.squash(name).replace(/(研究室|ラボラトリー|ラボ|研|laboratory|lab|researchgroup|group)$/i, '');
  }

  /**
   * テキスト／ページから研究室を抽出する一括処理
   */
  async extract(lines, { slm = null, title = '', pageUrl = '', maxChunks = 0, onProgress } = {}) {
    const candidates = this.scoreLines(lines);
    let slmLabs = [];
    let slmError = null;
    const useSlm = !!(slm && slm.isEnabled());
    if (useSlm) {
      try {
        slmLabs = await this.refineWithSlm(lines, slm, { title, maxChunks }, onProgress);
      } catch (e) {
        slmError = e;
      }
    }
    return {
      labs: this.finalize(lines, candidates, slmLabs, { useSlm: useSlm && !slmError, pageUrl }),
      candidates,
      slmError
    };
  }

  // =========================================================
  // 5. クローラー用リンク解析
  // =========================================================

  extractLinks(doc, baseUrl) {
    const links = [];
    const seen = new Set();
    doc.querySelectorAll('a[href]').forEach(a => {
      const raw = a.getAttribute('href');
      if (!raw || /^(#|javascript:|mailto:|tel:)/i.test(raw)) return;
      let url;
      try {
        url = new URL(raw, baseUrl);
      } catch {
        return;
      }
      if (!/^https?:$/.test(url.protocol)) return;
      url.hash = '';
      if (/\.(pdf|docx?|xlsx?|pptx?|zip|jpe?g|png|gif|svg|mp4|mp3|webp|ics|csv)$/i.test(url.pathname)) return;
      const href = url.href;
      if (seen.has(href)) return;
      seen.add(href);
      const text = this.cleanText(a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || a.querySelector('img')?.getAttribute('alt') || '');
      const inNav = !!a.closest('nav, header, footer, [role="navigation"]');
      links.push({ url: href, text: text.slice(0, 80), inNav });
    });
    return links;
  }

  /**
   * リンクが「情報系の研究室一覧・教員一覧・入試情報」に近づくかをスコアリング
   */
  scoreLink(link, { infoOnly = true, findAdmissions = true } = {}) {
    let path = '';
    try {
      const u = new URL(link.url);
      path = decodeURIComponent(u.pathname + u.search);
    } catch {
      path = link.url;
    }
    const hay = `${link.text} ${path}`.toLowerCase();
    let s = 0;
    const reasons = [];
    const add = (re, pts, label) => {
      if (re.test(hay)) {
        s += pts;
        reasons.push(label);
        return true;
      }
      return false;
    };

    add(/研究室|ラボ|labs?\b|laborator|研究グループ|research.?groups?/, 4, '研究室');
    add(/教員|スタッフ|staff|faculty|people|members?|メンバー|研究者|kyoin|teachers?/, 3, '教員');
    add(/研究分野|研究紹介|研究内容|research|講座|分野|領域|部門/, 2, '研究');
    add(/研究科|大学院|graduate|専攻|学科|department|学部|school|学域|学系|学環|学府|course|コース|学類/, 1.5, '組織');
    const isInfo = add(/(?<!入試|採用|公開|最新|新着|学生|大学|受験|イベント)情報(?!公開|センター)|知能|計算機|コンピュータ|computer|informatics|information|ソフトウェア|データ|(^|[^a-z])ai([^a-z]|$)|(^|[/._-])(ist|ics|cs|is|ie|ci)([/._-]|$)|メディア|通信|サイバー/, infoOnly ? 2 : 0.5, '情報系');
    if (findAdmissions) add(/入試|入学|募集要項|編入|admission|exam|受験|学生募集/, 2, '入試');

    if (/ニュース|news|お知らせ|topics|イベント|event|アクセス|access|地図|サイトマップ|sitemap|採用|求人|寄付|寄附|privacy|プライバシー|login|ログイン|お問い合わせ|contact|facebook|twitter|x\.com|youtube|instagram|line\.me|calendar|カレンダー|図書館|library|病院|hospital|同窓|alumni|press|ダウンロード|download|archive|アーカイブ/.test(hay)) {
      s -= 4;
      reasons.push('対象外');
    }
    if (infoOnly && !isInfo && /医学|看護|薬学|法学|文学|経済|経営|教育学|農学|歯学|獣医|芸術|体育|人文|社会学|心理|国際関係|medicine|medical|nursing|law|economics|literature|agricultur|pharma/.test(hay)) {
      s -= 3;
      reasons.push('他分野');
    }
    if (/\/en(\/|$)|english|[?&]lang=en/.test(hay)) s -= 1.5;
    if ((path.match(/[?&]/g) || []).length >= 2) s -= 1;
    if (link.inNav && s > 0) s += 0.3;
    return { score: s, reasons };
  }

  /**
   * ローカルSLMに、たどるべきリンクを選ばせる（トップページなど入口ページ用）
   * @returns {Promise<Set<string>>} 選ばれたURL
   */
  async rankLinksWithSlm(links, slm, meta = {}) {
    const list = links.slice(0, slm.profile ? slm.profile().maxLinks : 60);
    if (list.length === 0) return new Set();
    let path = '';
    const rendered = list.map((l, i) => {
      try {
        path = decodeURIComponent(new URL(l.url).pathname);
      } catch {
        path = l.url;
      }
      return `[${i}] ${l.text || '(テキストなし)'}  ${path.slice(0, 60)}`;
    }).join('\n');

    const res = await slm.chatJson({
      system: 'あなたは大学Webサイトを探索するアシスタントです。JSONのみを出力します。',
      user: `ページ: ${meta.title || ''}
目的: 情報系（情報科学・情報工学・コンピュータサイエンス）の「研究室一覧」「教員一覧」「研究科・専攻・学科のページ」「入試・編入学の情報」にたどり着くこと。
次のリンクのうち、目的に近づくものの番号を最大10個、近い順に選んでください。ニュースや事務手続きのリンクは選ばないでください。
${rendered}`,
      schema: {
        type: 'object',
        properties: { links: { type: 'array', items: { type: 'integer' } } },
        required: ['links']
      },
      maxTokens: 120
    });
    const picked = new Set();
    (res.links || []).forEach(i => {
      if (Number.isInteger(i) && list[i]) picked.add(list[i].url);
    });
    return picked;
  }
}

window.labExtractor = new LabExtractor(window.universityParser, window.labInsights);
