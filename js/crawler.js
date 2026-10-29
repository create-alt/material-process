/**
 * 大学サイト自動探索クローラー
 * 大学・研究科のトップページなどから、関連しそうなリンク(aタグ)を優先度順にたどり、
 * 研究室一覧・教員一覧・入試情報のページを見つけて、分野別の研究室リストを作ります。
 *
 * - 同じサイト（同じ登録ドメイン。例: *.example.ac.jp）の中だけを探索
 * - robots.txt の Disallow を守り、1ページごとに待機してサーバーに負荷をかけない
 * - リンクの優先度はルールで計算し、ローカルSLMが有効なら入口ページで「どのリンクが目的に近いか」も判断させる
 */

class SiteCrawler {
  constructor({ fetcher, extractor, parser, insights }) {
    this.fetcher = fetcher;
    this.extractor = extractor;
    this.parser = parser;
    this.insights = insights;
    this.robotsCache = new Map();
    this.secondLevelJp = /\.(ac|co|go|or|ne|ed|lg|gr|ad)\.jp$|\.(ac|co|gov|org)\.uk$|\.(edu|com|org|gov)\.(au|cn|tw|kr|sg)$/;
  }

  registrableDomain(host) {
    const parts = host.toLowerCase().split('.');
    const keep = this.secondLevelJp.test(host.toLowerCase()) ? 3 : 2;
    return parts.slice(-keep).join('.');
  }

  normalizeUrl(raw) {
    try {
      const u = new URL(raw);
      u.hash = '';
      const path = u.pathname.replace(/\/index\.(html?|php|aspx?)$/i, '/').replace(/\/+$/, '');
      return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
    } catch {
      return raw;
    }
  }

  // ---------------------------------------------------------
  // robots.txt
  // ---------------------------------------------------------
  async loadRobots(origin) {
    if (this.robotsCache.has(origin)) return this.robotsCache.get(origin);
    let rules = [];
    try {
      const res = await this.fetcher.fetchRawHtml(`${origin}/robots.txt`);
      let text = res.html || '';
      if (/<html|<pre/i.test(text)) {
        text = new DOMParser().parseFromString(text, 'text/html').body?.textContent || '';
      }
      rules = this.parseRobots(text);
    } catch {
      rules = [];
    }
    this.robotsCache.set(origin, rules);
    return rules;
  }

  parseRobots(text) {
    const rules = [];
    let applies = false;
    let lastWasAgent = false;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, '').trim();
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      if (key === 'user-agent') {
        // 連続する User-agent 行は同じグループ
        applies = (lastWasAgent && applies) || value === '*';
        lastWasAgent = true;
        continue;
      }
      lastWasAgent = false;
      if (!applies) continue;
      if ((key === 'disallow' || key === 'allow') && value) {
        const pattern = value.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        rules.push({ allow: key === 'allow', length: value.length, re: new RegExp('^' + pattern) });
      }
    }
    return rules;
  }

  isAllowed(rules, url) {
    let path;
    try {
      const u = new URL(url);
      path = u.pathname + u.search;
    } catch {
      return false;
    }
    let best = null;
    for (const r of rules) {
      if (r.re.test(path) && (!best || r.length > best.length)) best = r;
    }
    return !best || best.allow;
  }

  // ---------------------------------------------------------
  // 探索本体
  // ---------------------------------------------------------
  /**
   * @param {string} startUrl
   * @param {object} opts { maxPages, maxDepth, infoOnly, findAdmissions, followLabPages, labPageLimit, slm, delayMs }
   * @param {object} hooks { onLog(entry), onProgress(state), isCancelled() }
   */
  async crawl(startUrl, opts = {}, hooks = {}) {
    const o = {
      maxPages: 25,
      maxDepth: 3,
      infoOnly: true,
      findAdmissions: true,
      followLabPages: true,
      labPageLimit: 10,
      slm: null,
      delayMs: 600,
      ...opts
    };
    const onLog = hooks.onLog || (() => {});
    const onProgress = hooks.onProgress || (() => {});
    const isCancelled = hooks.isCancelled || (() => false);
    const useSlm = !!(o.slm && o.slm.isEnabled());

    const start = new URL(startUrl);
    const site = this.registrableDomain(start.hostname);
    const visited = new Set();
    const queued = new Set([this.normalizeUrl(start.href)]);
    const queue = [{ url: start.href, depth: 0, priority: 100, reason: '開始ページ' }];
    const labMap = new Map();
    const pages = [];
    const admissionTexts = [];
    let university = { name: '', faculty: '', url: start.href };
    let slmLinkFailures = 0;
    let slmExtractFailures = 0;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const progress = (extra) => onProgress({
      visited: pages.length,
      maxPages: o.maxPages,
      queued: queue.length,
      labs: labMap.size,
      ...extra
    });

    while (queue.length && pages.length < o.maxPages && !isCancelled()) {
      queue.sort((a, b) => b.priority - a.priority);
      const item = queue.shift();
      const key = this.normalizeUrl(item.url);
      if (visited.has(key)) continue;
      visited.add(key);

      const target = new URL(item.url);
      const rules = await this.loadRobots(target.origin);
      if (!this.isAllowed(rules, item.url)) {
        onLog({ url: item.url, status: 'skip', message: 'robots.txtで禁止されているためスキップ' });
        continue;
      }

      progress({ phase: 'crawl', current: item.url });
      let fetched;
      try {
        fetched = await this.fetcher.fetchRawHtml(item.url);
      } catch (e) {
        onLog({ url: item.url, status: 'error', message: e.message, depth: item.depth });
        continue;
      }
      const finalUrl = fetched.finalUrl || item.url;
      visited.add(this.normalizeUrl(finalUrl));

      const doc = new DOMParser().parseFromString(fetched.html, 'text/html');
      const title = this.extractor.cleanText(doc.querySelector('title')?.textContent || '');
      if (pages.length === 0) {
        const ogSite = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
        university.name = this.fetcher.inferMetadata(title, ogSite, finalUrl).university
          || this.parser.extractUniversityName(`${title}\n${ogSite}`);
      }

      // --- 研究室の抽出 ---
      const lines = this.extractor.linesFromDocument(doc, finalUrl);
      const candidates = this.extractor.scoreLines(lines);
      // 研究室候補がある・研究室系のページ・本文に「研究室」等の言及があるページはSLMにも読ませる
      const bodyText = lines.map(l => l.text).join('\n');
      const looksLabPage = candidates.length >= 1
        || this.extractor.labSectionRe.test(`${title} ${decodeURIComponent(target.pathname)}`)
        || /研究室|ラボ|Lab\b|Laboratory/.test(bodyText);
      let slmLabs = [];
      let slmOk = false;
      let slmNote = '';
      if (useSlm && looksLabPage && slmExtractFailures < 3) {
        try {
          slmLabs = await this.extractor.refineWithSlm(lines.slice(0, 320), o.slm, { title }, (done, total) => {
            progress({ phase: 'slm', current: finalUrl, slmDone: done, slmTotal: total });
          });
          slmOk = true;
          slmNote = `SLM判定 ${slmLabs.length}件`;
        } catch (e) {
          slmExtractFailures++;
          slmNote = `SLMエラー: ${e.message}`;
        }
      }
      const labs = this.extractor.finalize(lines, candidates, slmLabs, { useSlm: slmOk, pageUrl: finalUrl });
      labs.forEach(lab => this.mergeLab(labMap, lab));

      if (!university.faculty && labs.length >= 3) {
        university.faculty = this.parser.extractFaculty(title) || '';
      }

      // --- 入試・編入ページ ---
      const isAdmission = /入試|入学者選抜|募集要項|編入|学生募集|admission/i.test(`${title} ${decodeURIComponent(target.pathname)}`);
      if (o.findAdmissions && isAdmission) {
        admissionTexts.push(this.fetcher.extractTextFromHtml(fetched.html, finalUrl));
      }

      const kind = labs.length >= 3 ? 'lab-list'
        : isAdmission ? 'admission'
        : labs.length > 0 ? 'lab'
        : /研究科|学部|学科|専攻|学域|学府|学環|department|school/i.test(title) ? 'org' : 'other';

      // --- 次にたどるリンク ---
      const labUrls = new Set(labs.map(l => l.url).filter(Boolean).map(u => this.normalizeUrl(u)));
      let queuedCount = 0;
      if (item.depth < o.maxDepth) {
        const links = this.extractor.extractLinks(doc, finalUrl)
          .filter(l => {
            try {
              return this.registrableDomain(new URL(l.url).hostname) === site;
            } catch {
              return false;
            }
          })
          .filter(l => !labUrls.has(this.normalizeUrl(l.url)))
          .filter(l => !visited.has(this.normalizeUrl(l.url)) && !queued.has(this.normalizeUrl(l.url)))
          .map(l => ({ ...l, ...this.extractor.scoreLink(l, o) }));

        // 入口に近いページでは、SLMに文脈から目的に近いリンクを選ばせる
        if (useSlm && item.depth <= 1 && slmLinkFailures < 2 && links.length) {
          try {
            const pool = links.filter(l => l.score > -2).sort((a, b) => b.score - a.score);
            const picked = await this.extractor.rankLinksWithSlm(pool, o.slm, { title });
            links.forEach(l => {
              if (picked.has(l.url)) {
                l.score += 3;
                l.reasons.push('SLM推薦');
              }
            });
          } catch (e) {
            slmLinkFailures++;
          }
        }

        // 入口に近いページでは「学部・大学院」のような組織リンクもたどる
        const threshold = item.depth <= 1 ? 1.5 : 2;
        links
          .filter(l => l.score >= threshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)
          .forEach(l => {
            const nkey = this.normalizeUrl(l.url);
            queued.add(nkey);
            queue.push({
              url: l.url,
              depth: item.depth + 1,
              priority: l.score - (item.depth + 1) * 0.8,
              reason: `${l.text || ''} (${l.reasons.join('・')})`
            });
            queuedCount++;
          });
      }

      const page = { url: finalUrl, title, depth: item.depth, kind, labs: labs.length, reason: item.reason };
      pages.push(page);
      onLog({ ...page, status: 'ok', queued: queuedCount, message: slmNote });
      progress({ phase: 'crawl', current: finalUrl });
      if (queue.length && pages.length < o.maxPages) await sleep(o.delayMs);
    }

    // --- 研究室ページをたどって概要を補完 ---
    if (o.followLabPages && !isCancelled()) {
      const targets = [...labMap.values()]
        .filter(l => l.url && !visited.has(this.normalizeUrl(l.url)))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, o.labPageLimit);
      for (let i = 0; i < targets.length && !isCancelled(); i++) {
        const lab = targets[i];
        progress({ phase: 'details', current: lab.url, detailDone: i, detailTotal: targets.length });
        try {
          const origin = new URL(lab.url).origin;
          if (!this.isAllowed(await this.loadRobots(origin), lab.url)) continue;
          const fetched = await this.fetcher.fetchRawHtml(lab.url);
          const doc = new DOMParser().parseFromString(fetched.html, 'text/html');
          const summary = this.summarizeLabPage(doc, fetched.finalUrl || lab.url);
          if (summary.description) lab.description = summary.description;
          if (!lab.professor && summary.professor) lab.professor = summary.professor;
          if (summary.keywords) lab.keywords = summary.keywords;
          onLog({ url: lab.url, status: 'ok', kind: 'lab-detail', title: summary.title || lab.name, labs: 0, queued: 0, message: `「${lab.name}」の概要を取得` });
        } catch (e) {
          onLog({ url: lab.url, status: 'error', message: `「${lab.name}」: ${e.message}` });
        }
        await sleep(o.delayMs);
      }
    }

    // --- 入試情報の統合 ---
    const admissions = this.parser.getEmptyResult().admissions;
    let events = [];
    admissionTexts.forEach(text => {
      const parsed = this.parser.parse(text);
      Object.keys(admissions).forEach(track => {
        Object.keys(admissions[track]).forEach(k => {
          const v = parsed.admissions[track][k];
          if (!v) return;
          if (!admissions[track][k]) admissions[track][k] = v;
          else if (!admissions[track][k].includes(v)) admissions[track][k] += `\n${v}`;
        });
      });
      events = events.concat(parsed.events);
      if (!university.name && parsed.university.name) university.name = parsed.university.name;
    });

    const labs = [...labMap.values()].map(l => this.annotateLab(l, o));
    progress({ phase: 'done' });
    return {
      university,
      labs,
      admissions,
      events,
      pages,
      cancelled: isCancelled()
    };
  }

  mergeLab(map, lab) {
    const key = this.extractor.labKey(lab.name);
    // 同じ教員の研究室は別ページで名前の表記が違っても統合（「山田研究室」「山田研」）
    const profKey = (p) => this.extractor.squash((p || '').replace(new RegExp(this.extractor.titles, 'gi'), ''));
    const byProf = lab.professor
      ? [...map.values()].find(l => l.professor && profKey(l.professor) === profKey(lab.professor))
      : null;
    const existing = map.get(key) || byProf;
    if (!existing) {
      map.set(key, { ...lab, pages: [lab.page] });
      return;
    }
    ['professor', 'topic', 'field', 'url'].forEach(k => { if (!existing[k] && lab[k]) existing[k] = lab[k]; });
    existing.sources = [...new Set([...existing.sources, ...lab.sources])];
    existing.confidence = Math.max(existing.confidence, lab.confidence);
    if (!existing.pages.includes(lab.page)) existing.pages.push(lab.page);
    if (existing.derived && !lab.derived) {
      existing.name = lab.name;
      existing.derived = false;
    }
  }

  /**
   * 情報系かどうかの判定と分野タグ付け
   */
  annotateLab(lab, o) {
    const text = [lab.name, lab.topic, lab.field, lab.description, lab.keywords].filter(Boolean).join(' ');
    const tags = this.insights.detectAreas(text);
    const infoLike = tags.length > 0 || /情報|知能|計算|コンピュータ|ソフトウェア|データ|通信|メディア|システム|Comput|Inform/i.test(`${lab.field} ${lab.page}`);
    const otherField = /医学|看護|薬学|法学|文学|経済|農学|歯学|獣医|芸術|体育|心理|史学|哲学/.test(lab.field || '');
    return { ...lab, tags, offField: !!o.infoOnly && otherField && !infoLike };
  }

  /**
   * 研究室の個別ページから概要を作る
   */
  summarizeLabPage(doc, url) {
    const meta = doc.querySelector('meta[name="description"]')?.getAttribute('content')
      || doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const lines = this.extractor.linesFromDocument(doc, url);
    const research = lines
      .filter(l => (l.kind === 'text' || l.kind === 'item') && l.text.length >= 15 && /研究|research|開発|解析|モデル|システム|手法|提案|実現/i.test(l.text) && !this.extractor.navRe.test(l.text))
      .slice(0, 3)
      .map(l => l.text);
    const description = [...new Set([meta.trim(), ...research].filter(Boolean))].join('\n').slice(0, 500);

    let professor = '';
    for (const l of lines.slice(0, 150)) {
      const p = this.extractor.findPerson(l.text, l.cells);
      if (p && p.title) {
        professor = `${p.title} ${p.name}`;
        break;
      }
    }

    let keywords = '';
    const kwIdx = lines.findIndex(l => /^(キーワード|Keywords?)\s*[:：]?/i.test(l.text));
    if (kwIdx >= 0) {
      const inline = lines[kwIdx].text.replace(/^(キーワード|Keywords?)\s*[:：]?\s*/i, '');
      keywords = (inline || lines[kwIdx + 1]?.text || '').slice(0, 200);
    }
    return { description, professor, keywords, title: this.extractor.cleanText(doc.querySelector('title')?.textContent || '') };
  }
}

window.siteCrawler = new SiteCrawler({
  fetcher: window.pageUrlFetcher,
  extractor: window.labExtractor,
  parser: window.universityParser,
  insights: window.labInsights
});
