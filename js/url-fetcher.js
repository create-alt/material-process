/**
 * 募集要項URL取得＆構造化テキスト変換エンジン
 * ローカルサーバープロキシ -> Jina Reader -> 公開CORSプロキシ のマルチフォールバック構成
 */

class JobUrlFetcher {
  constructor() {
    // ドメインから正式社名を補完する辞書（表記揺れ・略称対策）
    this.domainCompanyMap = {
      'mhi.com': '三菱重工業株式会社（三菱重工）',
      'westjr.co.jp': '西日本旅客鉄道株式会社（JR西日本）',
      'jreast.co.jp': '東日本旅客鉄道株式会社（JR東日本）',
      'jr-central.co.jp': '東海旅客鉄道株式会社（JR東海）',
      'hitachi.co.jp': '株式会社日立製作所',
      'toshiba.co.jp': '株式会社東芝',
      'mitsubishielectric.co.jp': '三菱電機株式会社',
      'kawasaki.co.jp': '川崎重工業株式会社',
      'ihi.co.jp': '株式会社IHI',
      'sony.co.jp': 'ソニーグループ株式会社',
      'panasonic.com': 'パナソニック ホールディングス株式会社',
      'toyota.co.jp': 'トヨタ自動車株式会社',
      'honda.co.jp': '本田技研工業株式会社',
      'ntt.com': 'NTTコミュニケーションズ株式会社'
    };
  }

  /**
   * 指定URLから求人・募集要項テキストを取得して整形する
   * @param {string} rawUrl
   * @returns {Promise<{ text: string, finalUrl: string, source: string }>}
   */
  async fetchJobPage(rawUrl) {
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
            const extracted = this.extractJobTextFromHtml(data.html, data.url || url);
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
        const cleaned = this.cleanMarkdownToJobText(mdText, url);
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
          const extracted = this.extractJobTextFromHtml(data.contents, url);
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
        const extracted = this.extractJobTextFromHtml(html, url);
        if (extracted.length >= 40) {
          return { text: extracted, finalUrl: url, source: 'codetabs' };
        }
      }
    } catch (e) {
      lastError = e;
    }

    throw new Error(
      lastError?.message ||
      '募集要項ページの取得に失敗しました。アクセス制限があるページの場合はテキストを直接コピー＆ペーストしてください。'
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
   * ドメインやページタイトルから企業名・採用種別を推定
   */
  inferMetadata(titleStr, ogSiteName, url) {
    let company = ogSiteName || '';
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      for (const [domain, name] of Object.entries(this.domainCompanyMap)) {
        if (host === domain || host.endsWith('.' + domain)) {
          company = name;
          break;
        }
      }
    } catch {
      // ignore URL parse error
    }

    if (!company && titleStr) {
      // 「募集要項 | 高専生採用 | 三菱重工」のように区切られている場合の末尾または先頭から企業名を推定
      const parts = titleStr.split(/[|｜\-－―—:：]/).map(s => s.trim()).filter(Boolean);
      const corpPart = parts.find(p => /(?:株式会社|工業|製作所|重工|電機|鉄道|グループ|ホールディングス)/.test(p));
      if (corpPart) {
        company = corpPart;
      } else if (parts.length >= 2) {
        company = parts[parts.length - 1];
      }
    }

    let employmentType = '';
    const combined = `${titleStr} ${url}`;
    if (/kosen|高専/i.test(combined)) {
      employmentType = '正社員（高専卒採用）';
    } else if (/newgrad|新卒/i.test(combined)) {
      employmentType = '正社員（新卒採用）';
    } else if (/career|中途|キャリア採用/i.test(combined)) {
      employmentType = '正社員（キャリア採用）';
    }

    return { company, employmentType };
  }

  /**
   * HTML文字列から募集要項のテーブル・見出し・JSON-LDを解析しやすいテキストに変換
   */
  extractJobTextFromHtml(html, url) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const lines = [];

    // 1. ページタイトル・OGP情報の抽出
    const pageTitle = (doc.querySelector('title')?.textContent || '').trim();
    const ogSiteName = (doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '').trim();
    const ogTitle = (doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '').trim();
    const fullTitle = ogTitle || pageTitle;

    const meta = this.inferMetadata(fullTitle, ogSiteName, url);
    if (meta.company) {
      lines.push(`【会社名】\n${meta.company}`);
    }
    if (meta.employmentType) {
      lines.push(`【雇用形態】\n${meta.employmentType}`);
    }
    if (fullTitle) {
      lines.push(`【求人タイトル】\n${fullTitle}`);
    }
    lines.push(`【求人URL】\n${url}\n`);

    // 2. JSON-LD (Schema.org JobPosting) が埋め込まれていれば優先抽出
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    jsonLdScripts.forEach(script => {
      try {
        const raw = JSON.parse(script.textContent);
        const items = Array.isArray(raw) ? raw : (raw['@graph'] ? raw['@graph'] : [raw]);
        items.forEach(item => {
          if (item && (item['@type'] === 'JobPosting' || (Array.isArray(item['@type']) && item['@type'].includes('JobPosting')))) {
            lines.push(this.formatJobPostingSchema(item));
          }
        });
      } catch {
        // ignore invalid JSON-LD
      }
    });

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
   * Schema.org JobPosting オブジェクトを【見出し】付きテキストに変換
   */
  formatJobPostingSchema(job) {
    const out = [];
    const stripHtml = (str) => {
      if (!str) return '';
      const tmp = new DOMParser().parseFromString(String(str), 'text/html');
      return (tmp.body?.textContent || '').trim();
    };

    if (job.hiringOrganization?.name) {
      out.push(`【会社名】\n${job.hiringOrganization.name}`);
    }
    if (job.title) {
      out.push(`【募集職種】\n${job.title}`);
    }
    if (job.employmentType) {
      const emp = Array.isArray(job.employmentType) ? job.employmentType.join(' / ') : job.employmentType;
      out.push(`【雇用形態】\n${emp}`);
    }
    if (job.baseSalary) {
      const val = job.baseSalary.value;
      const currency = job.baseSalary.currency || 'JPY';
      if (val) {
        const min = val.minValue || val.value || '';
        const max = val.maxValue ? `〜${val.maxValue}` : '';
        const unit = val.unitText || '';
        out.push(`【給与】\n${min}${max} ${currency} ${unit}`.trim());
      }
    }
    if (job.jobLocation) {
      const locs = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
      const addrStrs = locs.map(l => {
        const a = l?.address;
        if (!a) return '';
        if (typeof a === 'string') return a;
        return [a.addressRegion, a.addressLocality, a.streetAddress].filter(Boolean).join(' ');
      }).filter(Boolean);
      if (addrStrs.length) {
        out.push(`【勤務地】\n${addrStrs.join(' / ')}`);
      }
    }
    if (job.description) {
      out.push(`【仕事内容】\n${stripHtml(job.description)}`);
    }
    if (job.qualifications || job.skills || job.experienceRequirements) {
      const reqs = [job.qualifications, job.skills, job.experienceRequirements]
        .map(stripHtml)
        .filter(Boolean)
        .join('\n');
      if (reqs) out.push(`【応募資格】\n${reqs}`);
    }
    if (job.workHours) {
      out.push(`【勤務時間】\n${stripHtml(job.workHours)}`);
    }
    if (job.jobBenefits) {
      out.push(`【福利厚生】\n${stripHtml(job.jobBenefits)}`);
    }
    return out.join('\n\n');
  }

  /**
   * Jina Reader等のMarkdownテキストをパーサー向けに整形
   */
  cleanMarkdownToJobText(md, url) {
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
        if (/^[-:\s]+$/.test(k) || /^[-:\s]+$/.test(v)) return '';
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
    if (meta.company) headerLines.push(`【会社名】\n${meta.company}`);
    if (meta.employmentType) headerLines.push(`【雇用形態】\n${meta.employmentType}`);
    if (title) headerLines.push(`【求人タイトル】\n${title}`);
    headerLines.push(`【求人URL】\n${url}`);

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

window.jobUrlFetcher = new JobUrlFetcher();
