/**
 * 大学・研究室ページURL取得＆構造化テキスト変換エンジン
 * ローカルサーバープロキシ -> Jina Reader -> 公開CORSプロキシ のマルチフォールバック構成
 */

class PageUrlFetcher {
  constructor() {
    // ドメインから正式な大学名を補完する辞書（略称・英語ドメイン対策）
    this.domainUniversityMap = {
      'u-tokyo.ac.jp': '東京大学',
      'kyoto-u.ac.jp': '京都大学',
      'osaka-u.ac.jp': '大阪大学',
      'tohoku.ac.jp': '東北大学',
      'nagoya-u.ac.jp': '名古屋大学',
      'kyushu-u.ac.jp': '九州大学',
      'hokudai.ac.jp': '北海道大学',
      'isct.ac.jp': '東京科学大学',
      'titech.ac.jp': '東京科学大学（旧 東京工業大学）',
      'tsukuba.ac.jp': '筑波大学',
      'kobe-u.ac.jp': '神戸大学',
      'hiroshima-u.ac.jp': '広島大学',
      'naist.jp': '奈良先端科学技術大学院大学',
      'jaist.ac.jp': '北陸先端科学技術大学院大学',
      'uec.ac.jp': '電気通信大学',
      'kyutech.ac.jp': '九州工業大学',
      'nitech.ac.jp': '名古屋工業大学',
      'tut.ac.jp': '豊橋技術科学大学',
      'nagaokaut.ac.jp': '長岡技術科学大学',
      'u-aizu.ac.jp': '会津大学',
      'keio.ac.jp': '慶應義塾大学',
      'waseda.jp': '早稲田大学'
    };
  }

  /**
   * 指定URLから研究室紹介・入試要項ページのテキストを取得して整形する
   * @param {string} rawUrl
   * @returns {Promise<{ text: string, finalUrl: string, source: string }>}
   */
  async fetchPage(rawUrl) {
    const url = (rawUrl || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('有効なURL（http:// または https://）を入力してください。');
    }

    let lastError = null;

    // ルート1: ローカルサーバー内蔵プロキシ (/api/fetch-url)
    if (window.location.protocol.startsWith('http')) {
      try {
        const res = await this.fetchWithTimeout(
          `/api/fetch-url?url=${encodeURIComponent(url)}`,
          {},
          12000
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.html) {
            const extracted = this.extractTextFromHtml(data.html, data.url || url);
            if (extracted.length >= 40) {
              return { text: extracted, finalUrl: data.url || url, source: 'local-proxy' };
            }
          }
        }
      } catch (e) {
        lastError = e;
      }
    }

    // ルート2: Jina Reader API (SPAやWAF保護サイトにも強くCORS対応)
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const res = await this.fetchWithTimeout(
        jinaUrl,
        {
          headers: {
            'Accept': 'text/plain',
            'X-Return-Format': 'markdown'
          }
        },
        15000
      );
      if (res.ok) {
        const mdText = await res.text();
        const cleaned = this.cleanMarkdownToText(mdText, url);
        if (cleaned.length >= 40) {
          return { text: cleaned, finalUrl: url, source: 'jina-reader' };
        }
      }
    } catch (e) {
      lastError = e;
    }

    // ルート3: AllOrigins CORSプロキシ
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const res = await this.fetchWithTimeout(proxyUrl, {}, 12000);
      if (res.ok) {
        const data = await res.json();
        if (data && data.contents) {
          const extracted = this.extractTextFromHtml(data.contents, url);
          if (extracted.length >= 40) {
            return { text: extracted, finalUrl: url, source: 'allorigins' };
          }
        }
      }
    } catch (e) {
      lastError = e;
    }

    // ルート4: CodeTabs CORSプロキシ
    try {
      const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
      const res = await this.fetchWithTimeout(proxyUrl, {}, 12000);
      if (res.ok) {
        const html = await res.text();
        const extracted = this.extractTextFromHtml(html, url);
        if (extracted.length >= 40) {
          return { text: extracted, finalUrl: url, source: 'codetabs' };
        }
      }
    } catch (e) {
      lastError = e;
    }

    throw new Error(
      lastError?.message ||
      'ページの取得に失敗しました。アクセス制限があるページの場合はテキストを直接コピー＆ペーストしてください。'
    );
  }

  async fetchWithTimeout(resource, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  /**
   * ドメインやページタイトルから大学名を推定
   */
  inferMetadata(titleStr, ogSiteName, url) {
    let university = '';
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      for (const [domain, name] of Object.entries(this.domainUniversityMap)) {
        if (host === domain || host.endsWith('.' + domain)) {
          university = name;
          break;
        }
      }
    } catch {
      // ignore URL parse error
    }

    if (!university) {
      // 「研究室一覧 | 情報科学研究科 | 〇〇大学」のように区切られたタイトルから大学名を探す
      const parts = [ogSiteName, ...(titleStr || '').split(/[|｜\-－―—:：]/)]
        .map(s => (s || '').trim())
        .filter(Boolean);
      const uniPart = parts.find(p => /(大学院大学|大学)$/.test(p)) || parts.find(p => /大学/.test(p));
      if (uniPart) {
        const m = uniPart.match(/[^\s　]*?(?:大学院大学|大学)(?!院)/);
        university = m ? m[0] : uniPart;
      }
    }
    return { university };
  }

  /**
   * HTML文字列から研究室紹介・入試要項のテーブル・見出しを解析しやすいテキストに変換
   */
  extractTextFromHtml(html, url) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const lines = [];

    // 1. ページタイトル・OGP情報の抽出
    const pageTitle = (doc.querySelector('title')?.textContent || '').trim();
    const ogSiteName = (doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '').trim();
    const ogTitle = (doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').trim();
    const fullTitle = ogTitle || pageTitle;

    // 2. JSON-LD (Schema.org CollegeOrUniversity 等) に大学名があれば優先
    let schemaName = '';
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const raw = JSON.parse(script.textContent);
        const items = Array.isArray(raw) ? raw : (raw['@graph'] ? raw['@graph'] : [raw]);
        items.forEach(item => {
          const types = [].concat(item?.['@type'] || []);
          if (!schemaName && types.some(t => /CollegeOrUniversity|EducationalOrganization/.test(t)) && item.name) {
            schemaName = String(item.name);
          }
        });
      } catch {
        // ignore invalid JSON-LD
      }
    });

    const meta = this.inferMetadata(fullTitle, ogSiteName, url);
    const university = schemaName || meta.university;
    if (university) lines.push(`【大学名】\n${university}`);
    if (fullTitle) lines.push(`【ページタイトル】\n${fullTitle}`);
    lines.push(`【URL】\n${url}`);
    lines.push('【ページ本文】\n');

    // 3. 不要なノイズ要素を除去
    const removeSelectors = [
      'script', 'style', 'noscript', 'svg', 'iframe', 'canvas',
      'nav', 'footer', 'header', 'aside',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '.cookie-banner', '#cookie-banner', '.breadcrumb', '.topicpath'
    ];
    doc.querySelectorAll(removeSelectors.join(',')).forEach(el => el.remove());

    // メインコンテンツ領域があればそこに絞る
    const mainRoot =
      doc.querySelector('main, [role="main"], #main, #contents, .main-content, .l-main, .c-main') ||
      doc.body;

    if (!mainRoot) return lines.join('\n').trim();

    // 4. 募集要項で頻出する <dl><dt><dd> と <table><tr><th><td> を【見出し】形式に整形
    mainRoot.querySelectorAll('tr').forEach(tr => {
      const cells = Array.from(tr.children).filter(el => el.tagName === 'TH' || el.tagName === 'TD');
      if (cells.length >= 2) {
        const label = this.cleanInlineText(cells[0].textContent);
        const val = cells.slice(1).map(td => this.cleanBlockText(td)).filter(Boolean).join('\n');
        if (label && val && label.length <= 35) {
          tr.replaceWith(doc.createTextNode(`\n【${label}】\n${val}\n`));
        }
      }
    });

    mainRoot.querySelectorAll('dl').forEach(dl => {
      const dts = dl.querySelectorAll('dt');
      const dds = dl.querySelectorAll('dd');
      if (dts.length > 0 && dds.length > 0) {
        let formatted = '\n';
        // dtとddがラッパーdivの中にあるケースにも対応
        const allItems = dl.querySelectorAll('dt, dd');
        allItems.forEach(item => {
          if (item.tagName === 'DT') {
            const label = this.cleanInlineText(item.textContent);
            if (label) formatted += `\n【${label}】\n`;
          } else if (item.tagName === 'DD') {
            const val = this.cleanBlockText(item);
            if (val) formatted += `${val}\n`;
          }
        });
        if (formatted.trim()) {
          dl.replaceWith(doc.createTextNode(formatted));
        }
      }
    });

    // 見出しタグを【見出し】に変換
    mainRoot.querySelectorAll('h1, h2, h3, h4').forEach(h => {
      const text = this.cleanInlineText(h.textContent);
      if (text && text.length <= 45) {
        h.replaceWith(doc.createTextNode(`\n【${text}】\n`));
      }
    });

    // リスト項目・改行の整形
    mainRoot.querySelectorAll('li').forEach(li => {
      const text = this.cleanInlineText(li.textContent);
      if (text) {
        li.replaceWith(doc.createTextNode(`・${text}\n`));
      }
    });

    mainRoot.querySelectorAll('br').forEach(br => br.replaceWith(doc.createTextNode('\n')));
    mainRoot.querySelectorAll('p, div, section, article').forEach(block => {
      block.appendChild(doc.createTextNode('\n'));
    });

    const bodyText = (mainRoot.textContent || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    lines.push(bodyText);
    return lines.join('\n').trim();
  }

  /**
   * Jina Reader等のMarkdownテキストをパーサー向けに整形
   */
  cleanMarkdownToText(md, url) {
    let title = '';
    const titleMatch = md.match(/^Title:\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // Jina Readerのヘッダーメタデータ以降を取り出す
    let content = md;
    const mdMarker = content.indexOf('Markdown Content:');
    if (mdMarker !== -1) {
      content = content.substring(mdMarker + 'Markdown Content:'.length);
    }

    content = content
      .replace(/\r/g, '')
      // 画像リンクを除去
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // 通常リンク [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Markdownテーブル行 | 項目 | 内容 | -> 【項目】\n内容
      .replace(/^\|\s*([^|]{1,30}?)\s*\|\s*([^|]+?)\s*\|$/gm, (m, k, v) => {
        if (/^[-:\s]+$/.test(k) || /^[-:\s]+$/.test(v) || /^(項目|見出し)$/.test(k.trim())) return '';
        return `\n【${k.trim()}】\n${v.trim()}`;
      })
      // Markdown見出し ### Heading -> 【Heading】
      .replace(/^#{1,4}\s+(.+)$/gm, '\n【$1】')
      // 単独行の太字 **見出し** -> 【見出し】
      .replace(/^\*\*([^*]{2,30})\*\*$/gm, '\n【$1】')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const meta = this.inferMetadata(title, '', url);
    const headerLines = [];
    if (meta.university) headerLines.push(`【大学名】\n${meta.university}`);
    if (title) headerLines.push(`【ページタイトル】\n${title}`);
    headerLines.push(`【URL】\n${url}`);
    headerLines.push('【ページ本文】');

    return `${headerLines.join('\n')}\n\n${content}`;
  }

  cleanInlineText(str) {
    return (str || '').replace(/\s+/g, ' ').trim();
  }

  cleanBlockText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith(el.ownerDocument.createTextNode('\n')));
    clone.querySelectorAll('li').forEach(li => {
      li.prepend(el.ownerDocument.createTextNode('・'));
      li.appendChild(el.ownerDocument.createTextNode('\n'));
    });
    return (clone.textContent || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join('\n');
  }
}

window.pageUrlFetcher = new PageUrlFetcher();
