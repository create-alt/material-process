/**
 * 研究室リサーチHub - メインアプリケーションロジック
 * 大学（学部・研究科）→ 研究室 の階層でデータを管理し、
 * 気になる研究室のチェック・保存・比較・詳細表示、入試日程の一覧化を行います。
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- 定義・設定 ---
  const STORAGE_KEY_UNIVERSITIES = 'labhub_universities';
  const STORAGE_KEY_COLUMNS = 'labhub_export_columns';
  const STORAGE_KEY_INTEREST = 'labhub_interest_profile';
  const STORAGE_KEY_COMPARE = 'labhub_compare_ids';
  const STORAGE_KEY_EXPORT_FAV = 'labhub_export_fav_only';
  const MAX_COMPARE = 6;
  const TYPE_CLASS = { '国立': 'national', '公立': 'public', '私立': 'private' };

  const parser = window.universityParser;
  const insights = window.labInsights;
  const slm = window.localSlm;

  const UNI_FIELDS = ['name', 'faculty', 'department', 'type', 'location', 'url', 'overview', 'tuition', 'career'];
  const TRACKS = Object.entries(parser.admissionTracks).map(([key, v]) => ({ key, ...v }));
  const ADM_FIELDS = Object.entries(parser.admissionFields).map(([key, v]) => ({ key, label: v.label }));
  const LAB_MAIN_FIELDS = [
    { key: 'name', label: '研究室名', placeholder: '例: 山田研究室' },
    { key: 'professor', label: '教員', placeholder: '例: 教授 山田 太郎' },
    { key: 'area', label: '研究分野', placeholder: '例: 自然言語処理' }
  ];
  const LAB_TEXT_FIELDS = [
    { key: 'description', label: '研究内容', rows: 2 },
    { key: 'features', label: '特色・雰囲気（コアタイム・ゼミ等）', rows: 2 },
    { key: 'keywords', label: 'キーワード', rows: 1 },
    { key: 'achievements', label: '主な業績・発表', rows: 2 },
    { key: 'collaboration', label: '共同研究・連携', rows: 1 },
    { key: 'members', label: 'メンバー構成', rows: 1 },
    { key: 'career', label: '修了生の進路', rows: 1 },
    { key: 'contact', label: '研究室訪問・連絡先', rows: 1 },
    { key: 'url', label: '研究室URL', rows: 1 }
  ];
  const LAB_DETAIL_FIELDS = [
    { key: 'professor', label: '教員' },
    { key: 'area', label: '研究分野' },
    { key: 'description', label: '研究内容' },
    { key: 'keywords', label: 'キーワード' },
    { key: 'features', label: '特色・雰囲気' },
    { key: 'achievements', label: '主な業績・発表' },
    { key: 'collaboration', label: '共同研究・連携' },
    { key: 'members', label: 'メンバー構成' },
    { key: 'career', label: '修了生の進路' },
    { key: 'contact', label: '研究室訪問・連絡先' },
    { key: 'url', label: '研究室URL' }
  ];

  // CSV出力列（1研究室 = 1行）
  const ALL_FIELDS = [
    { key: 'uni.name', label: '大学名', defaultSelected: true },
    { key: 'uni.faculty', label: '学部・研究科', defaultSelected: true },
    { key: 'uni.department', label: '学科・専攻', defaultSelected: true },
    { key: 'uni.type', label: '設置区分', defaultSelected: false },
    { key: 'uni.location', label: '所在地', defaultSelected: false },
    { key: 'lab.name', label: '研究室名', defaultSelected: true },
    { key: 'lab.professor', label: '教員', defaultSelected: true },
    { key: 'lab.tags', label: '研究分野タグ(自動)', defaultSelected: true },
    { key: 'lab.area', label: '研究分野', defaultSelected: false },
    { key: 'lab.description', label: '研究内容', defaultSelected: true },
    { key: 'lab.highlights', label: '特徴まとめ(自動)', defaultSelected: true },
    { key: 'lab.keywords', label: 'キーワード', defaultSelected: false },
    { key: 'lab.features', label: '特色・雰囲気', defaultSelected: true },
    { key: 'lab.achievements', label: '主な業績・発表', defaultSelected: false },
    { key: 'lab.collaboration', label: '共同研究・連携', defaultSelected: false },
    { key: 'lab.members', label: 'メンバー構成', defaultSelected: false },
    { key: 'lab.career', label: '修了生の進路', defaultSelected: false },
    { key: 'lab.contact', label: '研究室訪問・連絡先', defaultSelected: true },
    { key: 'lab.url', label: '研究室URL', defaultSelected: false },
    { key: 'lab.favorite', label: '★気になる', defaultSelected: true },
    { key: 'lab.priority', label: '志望度', defaultSelected: true },
    { key: 'lab.status', label: 'ステータス', defaultSelected: true },
    { key: 'lab.match', label: 'マッチ度', defaultSelected: false },
    { key: 'lab.checklist', label: '訪問チェック進捗', defaultSelected: false },
    { key: 'lab.memo', label: 'メモ', defaultSelected: true },
    { key: 'adm.transfer', label: '編入学（まとめ）', defaultSelected: true },
    { key: 'adm.graduate', label: '大学院入試（まとめ）', defaultSelected: true },
    { key: 'adm.undergrad', label: '学部入試（まとめ）', defaultSelected: false },
    { key: 'adm.english', label: '英語試験（全区分）', defaultSelected: false },
    { key: 'uni.events', label: '重要日程', defaultSelected: false },
    { key: 'uni.tuition', label: '学費・奨学金', defaultSelected: false },
    { key: 'uni.career', label: '進路・就職(大学)', defaultSelected: false },
    { key: 'uni.url', label: '参照URL', defaultSelected: true }
  ];

  // --- 状態 ---
  let universities = loadJson(STORAGE_KEY_UNIVERSITIES, []);
  let selectedColumns = loadJson(STORAGE_KEY_COLUMNS, ALL_FIELDS.filter(f => f.defaultSelected).map(f => f.key));
  let interestProfile = loadJson(STORAGE_KEY_INTEREST, { areas: [], keywords: [] });
  let compareIds = loadJson(STORAGE_KEY_COMPARE, []);
  let draftLabs = [];
  let draftGeneralEvents = [];
  let editingUniId = null;
  let activeTrack = 'graduate';
  let openLabId = null;
  let openUniId = null;

  // --- DOM要素 ---
  const $ = (id) => document.getElementById(id);
  const pageUrlInput = $('pageUrlInput');
  const btnFetchUrl = $('btnFetchUrl');
  const rawPageText = $('rawPageText');
  const charCount = $('charCount');
  const btnParseText = $('btnParseText');
  const btnSaveUniversity = $('btnSaveUniversity');
  const labEditorList = $('labEditorList');
  const universityList = $('universityList');
  const listFilterInput = $('listFilterInput');
  const areaFilter = $('areaFilter');
  const statusFilter = $('statusFilter');
  const sortSelect = $('sortSelect');
  const favOnlyToggle = $('favOnlyToggle');
  const btnClearAllRecords = $('btnClearAllRecords');
  const compareTray = $('compareTray');

  const uniInputs = {};
  UNI_FIELDS.forEach(k => { uniInputs[k] = $(`u_${k}`); });

  const parseButtonHtml = btnParseText.innerHTML;
  const saveButtonHtml = btnSaveUniversity.innerHTML;

  // --- 初期化 ---
  buildStaticUi();
  updateAiBadge();
  updateSlmBadge();
  updateInterestBadge();
  renderLabEditor();
  renderAll();

  function buildStaticUi() {
    // 研究分野タグ（左ペイン）
    $('intelTags').innerHTML = insights.researchAreas
      .map(a => `<span title="${escapeHtml(a.words.join('・'))}">${a.icon} ${escapeHtml(a.label)}</span>`)
      .join('');

    // 分野・ステータスフィルタ
    areaFilter.innerHTML += insights.researchAreas
      .map(a => `<option value="${a.key}">${a.icon} ${escapeHtml(a.label)}</option>`)
      .join('');
    statusFilter.innerHTML += `<option value="__none">未設定</option>` + insights.statuses
      .filter(s => s.key)
      .map(s => `<option value="${s.key}">${escapeHtml(s.label)}</option>`)
      .join('');

    // 入試トラックのタブとパネル
    $('trackTabs').innerHTML = TRACKS.map(t => `
      <button type="button" class="track-tab${t.key === activeTrack ? ' active' : ''}" data-track="${t.key}">
        ${t.icon} ${escapeHtml(t.label)} <span class="track-dot"></span>
      </button>`).join('');

    $('trackPanels').innerHTML = TRACKS.map(t => `
      <div class="track-panel${t.key === activeTrack ? '' : ' hidden'}" data-track="${t.key}">
        <div class="form-row-2">
          ${admField(t.key, 'summary', 2, '例: 一般選抜（夏・冬）、推薦選抜、社会人特別選抜')}
          ${admField(t.key, 'eligibility', 2, '例: 高専卒業見込み者 / 大学卒業見込み者')}
        </div>
        <div class="form-row-2">
          ${admField(t.key, 'subjects', 2, '例: 数学（線形代数・微積分）、専門科目、口頭試問')}
          ${admField(t.key, 'english', 2, '例: TOEIC/TOEFLスコア提出（600点目安）')}
        </div>
        <div class="form-row-3">
          ${admField(t.key, 'schedule', 3, '例: 出願期間 2026年7月1日〜7月8日')}
          ${admField(t.key, 'quota', 3, '例: 42名（倍率2.3倍）')}
          ${admField(t.key, 'notes', 3, '例: 事前に指導教員と相談、過去問公開')}
        </div>
      </div>`).join('');
  }

  function admField(track, key, rows, placeholder) {
    const label = parser.admissionFields[key].label;
    return `
      <div class="form-group">
        <label for="adm_${track}_${key}">${escapeHtml(label)}</label>
        <textarea id="adm_${track}_${key}" data-track="${track}" data-key="${key}" rows="${rows}" placeholder="${escapeHtml(placeholder)}"></textarea>
      </div>`;
  }

  function renderAll() {
    renderUniversityList();
    renderSchedule();
    renderCompareTray();
  }

  // =========================================================
  // 1. 入力・解析
  // =========================================================
  rawPageText.addEventListener('input', () => {
    charCount.textContent = rawPageText.value.length.toLocaleString();
  });

  document.querySelectorAll('.btn-chip[data-sample]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sample');
      if (window.SAMPLE_UNIVERSITY_TEXTS && window.SAMPLE_UNIVERSITY_TEXTS[key]) {
        rawPageText.value = window.SAMPLE_UNIVERSITY_TEXTS[key];
        charCount.textContent = rawPageText.value.length.toLocaleString();
        showToast('サンプル（架空の大学）を読み込みました', 'info');
        executeParse();
      }
    });
  });

  $('btnClearRaw').addEventListener('click', () => {
    rawPageText.value = '';
    charCount.textContent = '0';
  });

  async function handleFetchUrl() {
    const url = pageUrlInput.value.trim();
    if (!url) {
      showToast('研究室紹介・入試要項ページのURLを入力してください', 'warning');
      pageUrlInput.focus();
      return;
    }
    if (!window.pageUrlFetcher) {
      showToast('URL取得モジュールが読み込まれていません', 'warning');
      return;
    }

    const originalBtnHtml = btnFetchUrl.innerHTML;
    try {
      btnFetchUrl.disabled = true;
      btnFetchUrl.innerHTML = '<span>取得中...</span>';
      showToast('URLからページを取得しています...', 'info');

      const result = await window.pageUrlFetcher.fetchPage(url);
      rawPageText.value = result.text;
      charCount.textContent = rawPageText.value.length.toLocaleString();
      await executeParse(true);

      if (!uniInputs.url.value) uniInputs.url.value = result.finalUrl || url;
      showToast('ページを読み込み、研究室・入試情報を抽出しました！', 'success');
    } catch (err) {
      console.warn('URL fetch error:', err);
      showToast(err.message || 'URLからの取得に失敗しました', 'warning');
    } finally {
      btnFetchUrl.disabled = false;
      btnFetchUrl.innerHTML = originalBtnHtml;
    }
  }

  btnFetchUrl.addEventListener('click', () => handleFetchUrl());
  pageUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFetchUrl();
    }
  });

  btnParseText.addEventListener('click', () => executeParse());

  // 解析実行（AIと内蔵ヒューリスティックのハイブリッド）
  async function executeParse(fromUrlFetch = false) {
    const text = rawPageText.value.trim();
    if (!text) {
      showToast('テキストが入力されていません', 'warning');
      rawPageText.focus();
      return;
    }

    // URLだけが貼り付けられた場合はURL取得ルートへ
    if (!fromUrlFetch && /^https?:\/\/\S+$/i.test(text)) {
      pageUrlInput.value = text;
      await handleFetchUrl();
      return;
    }

    const heuristic = parser.parse(text);
    const ai = window.geminiLabParser;
    if (ai && ai.isConfigured() && ai.autoParse) {
      try {
        btnParseText.disabled = true;
        btnParseText.innerHTML = '<span>解析中 (Gemini AI)...</span>';
        const aiRaw = await ai.parseWithAi(text);
        const merged = parser.mergeResults(parser.normalizeResult(aiRaw, text), heuristic);
        await enrichLabsFromText(merged, text, false);
        fillForm(merged);
        showToast(`AIで抽出しました: ${describeResult(merged)}`, 'success');
        return;
      } catch (err) {
        console.warn('AI parse failed, fallback to heuristic:', err);
        showToast(`AI解析失敗 (${err.message})。内蔵パーサーで解析します`, 'warning');
      } finally {
        btnParseText.disabled = false;
        btnParseText.innerHTML = parseButtonHtml;
      }
    }

    const { added, slmUsed } = await enrichLabsFromText(heuristic, text, true);
    fillForm(heuristic);
    const via = slmUsed ? '（ローカルSLM併用）' : '';
    showToast(`抽出しました${via}: ${describeResult(heuristic)}${added ? `（一覧・文脈から +${added}件）` : ''}`, 'success');
  }

  /**
   * 「〇〇研究室」と書かれていない教員名の列挙や表・文章中の研究室を、
   * 研究室候補抽出エンジン（＋ローカルSLM）で拾って解析結果に追加する
   * @returns {Promise<{added: number, slmUsed: boolean}>} 追加した研究室数とSLMを使えたか
   */
  async function enrichLabsFromText(result, text, allowSlm) {
    const extractor = window.labExtractor;
    const useSlm = allowSlm && slm.isEnabled();
    const lines = extractor.linesFromText(text);

    let found;
    let slmUsed = useSlm;
    try {
      btnParseText.disabled = true;
      if (useSlm && !slm.isLoaded()) {
        await slm.ensureReady((p, msg) => {
          btnParseText.innerHTML = `<span>SLMを準備中 ${Math.round(p * 100)}%</span>`;
          if (msg) btnParseText.title = msg;
        });
      }
      found = await extractor.extract(lines, {
        slm: useSlm ? slm : null,
        title: result.university.name,
        onProgress: (done, total) => {
          btnParseText.innerHTML = `<span>ローカルSLMで研究室を判定中 (${done}/${total})</span>`;
        }
      });
    } catch (e) {
      showToast(`ローカルSLMを使えませんでした: ${e.message}`, 'warning');
      found = await extractor.extract(lines, {});
      slmUsed = false;
    } finally {
      btnParseText.disabled = false;
      btnParseText.innerHTML = parseButtonHtml;
    }
    if (found.slmError) {
      showToast(`ローカルSLMエラー（ルールのみで抽出）: ${found.slmError.message}`, 'warning');
      slmUsed = false;
    }

    let added = 0;
    found.labs.forEach(item => {
      const same = result.labs.find(l =>
        extractor.labKey(l.name) === extractor.labKey(item.name) ||
        (item.professor && l.professor && extractor.squash(l.professor).includes(extractor.squash(item.professor).replace(/^.*?(教授|講師|助教)/, '')))
      );
      if (same) {
        if (!same.professor && item.professor) same.professor = item.professor;
        if (!same.area && item.field) same.area = item.field;
        if (!same.url && item.url) same.url = item.url;
        return;
      }
      result.labs.push(crawlItemToLab(item));
      added++;
    });
    return { added, slmUsed };
  }

  function crawlItemToLab(item) {
    const lab = parser.createLab(item.name);
    lab.professor = item.professor || '';
    lab.area = item.field || '';
    lab.description = [item.topic, item.description].filter(Boolean).join('\n');
    lab.keywords = item.keywords || '';
    lab.url = item.url || '';
    return lab;
  }

  function describeResult(result) {
    const tracks = TRACKS.filter(t => isTrackFilled(result.admissions[t.key])).map(t => t.label);
    return [
      result.university.name ? `「${result.university.name}」` : '大学名なし',
      `研究室${result.labs.length}件`,
      tracks.length ? `入試: ${tracks.join('・')}` : '入試情報なし'
    ].join(' / ');
  }

  // =========================================================
  // 2. 解析結果フォーム
  // =========================================================
  function fillForm(data) {
    const uni = data.university || data;
    UNI_FIELDS.forEach(k => { uniInputs[k].value = uni[k] || ''; });

    TRACKS.forEach(t => {
      ADM_FIELDS.forEach(f => {
        $(`adm_${t.key}_${f.key}`).value = data.admissions?.[t.key]?.[f.key] || '';
      });
    });

    draftLabs = (data.labs || []).map(l => ({ ...parser.createLab(), ...JSON.parse(JSON.stringify(l)) }));
    draftGeneralEvents = (data.events || []).filter(e => e.track === 'general');

    // 情報がある入試タブを自動で開く
    const firstFilled = TRACKS.find(t => isTrackFilled(data.admissions?.[t.key]));
    if (firstFilled) setActiveTrack(firstFilled.key);

    refreshTrackIndicators();
    renderEventsPreview();
    renderLabEditor();
  }

  function getAdmissionsFromForm() {
    const admissions = {};
    TRACKS.forEach(t => {
      admissions[t.key] = {};
      ADM_FIELDS.forEach(f => {
        admissions[t.key][f.key] = $(`adm_${t.key}_${f.key}`).value.trim();
      });
    });
    return admissions;
  }

  function collectForm() {
    const data = {};
    UNI_FIELDS.forEach(k => { data[k] = uniInputs[k].value.trim(); });
    data.admissions = getAdmissionsFromForm();
    data.labs = draftLabs
      .map(l => ({ ...l, name: (l.name || '').trim() }))
      .filter(l => l.name);
    data.events = buildEvents(data.admissions, draftGeneralEvents);
    return data;
  }

  function buildEvents(admissions, generalEvents) {
    const events = parser.buildAdmissionEvents(admissions);
    (generalEvents || []).forEach(ev => {
      if (!events.some(e => e.date === ev.date)) events.push(ev);
    });
    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  function isTrackFilled(adm) {
    return !!adm && Object.values(adm).some(v => v && String(v).trim());
  }

  function setActiveTrack(track) {
    activeTrack = track;
    document.querySelectorAll('.track-tab').forEach(b => b.classList.toggle('active', b.dataset.track === track));
    document.querySelectorAll('.track-panel').forEach(p => p.classList.toggle('hidden', p.dataset.track !== track));
  }

  function refreshTrackIndicators() {
    const admissions = getAdmissionsFromForm();
    document.querySelectorAll('.track-tab').forEach(b => {
      b.classList.toggle('has-data', isTrackFilled(admissions[b.dataset.track]));
    });
  }

  function renderEventsPreview() {
    const events = buildEvents(getAdmissionsFromForm(), draftGeneralEvents);
    $('eventsPreview').innerHTML = events.length === 0
      ? '<span class="events-empty">📅 日付つきの日程（出願期間・試験日・説明会など）が見つかると、ここに一覧表示されます</span>'
      : `<span class="events-title">📅 抽出された日程:</span>` + events.map(e => `
          <span class="event-chip" title="${escapeHtml(e.label)}">
            <strong>${formatDateShort(e.date)}${e.yearGuessed ? '?' : ''}</strong> ${escapeHtml(trackLabel(e.track))} ${escapeHtml(truncate(e.label, 22))}
          </span>`).join('');
  }

  $('trackTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.track-tab');
    if (tab) setActiveTrack(tab.dataset.track);
  });

  $('trackPanels').addEventListener('input', debounce(() => {
    refreshTrackIndicators();
    renderEventsPreview();
  }, 300));

  // 研究室エディタ
  function renderLabEditor() {
    $('draftLabCount').textContent = draftLabs.length;
    if (draftLabs.length === 0) {
      labEditorList.innerHTML = `
        <div class="lab-editor-empty">
          研究室はまだありません。テキストを解析するか、左のテキストを選択して「＋ 研究室として追加」を押してください。
        </div>`;
      return;
    }

    labEditorList.innerHTML = draftLabs.map((lab, idx) => `
      <div class="lab-edit-card" data-idx="${idx}">
        <div class="lab-edit-head">
          <span class="lab-index">#${idx + 1}</span>
          ${LAB_MAIN_FIELDS.map(f => `
            <input type="text" data-k="${f.key}" value="${escapeHtml(lab[f.key] || '')}" placeholder="${escapeHtml(f.placeholder)}" title="${escapeHtml(f.label)}" class="lab-input-${f.key}">
          `).join('')}
          <button type="button" class="btn-icon btn-icon-danger" data-action="remove-lab" title="この研究室を削除">✕</button>
        </div>
        <div class="lab-tags-preview">${renderTagChips(lab)}</div>
        <div class="form-group">
          <textarea data-k="description" rows="2" placeholder="研究内容・研究テーマ">${escapeHtml(lab.description || '')}</textarea>
        </div>
        <details class="lab-edit-more">
          <summary>特色・実績・進路・研究室訪問などの詳細項目 (${countFilled(lab)}項目入力済)</summary>
          <div class="lab-edit-grid">
            ${LAB_TEXT_FIELDS.filter(f => f.key !== 'description').map(f => `
              <div class="form-group">
                <label>${escapeHtml(f.label)}</label>
                <textarea data-k="${f.key}" rows="${f.rows}">${escapeHtml(lab[f.key] || '')}</textarea>
              </div>`).join('')}
          </div>
        </details>
      </div>`).join('');
  }

  function countFilled(lab) {
    return LAB_TEXT_FIELDS.filter(f => f.key !== 'description' && lab[f.key]).length;
  }

  labEditorList.addEventListener('input', (e) => {
    const card = e.target.closest('.lab-edit-card');
    const key = e.target.dataset.k;
    if (!card || !key) return;
    const lab = draftLabs[Number(card.dataset.idx)];
    if (!lab) return;
    lab[key] = e.target.value;
    card.querySelector('.lab-tags-preview').innerHTML = renderTagChips(lab);
  });

  labEditorList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-lab"]');
    if (!btn) return;
    const idx = Number(btn.closest('.lab-edit-card').dataset.idx);
    const [removed] = draftLabs.splice(idx, 1);
    renderLabEditor();
    showToast(`「${removed?.name || '研究室'}」を解析結果から外しました`, 'info');
  });

  $('btnAddLabManual').addEventListener('click', () => {
    draftLabs.push(parser.createLab(''));
    renderLabEditor();
    const inputs = labEditorList.querySelectorAll('.lab-input-name');
    inputs[inputs.length - 1]?.focus();
  });

  // テキスト選択マッピング
  document.querySelectorAll('.chip-assign').forEach(chip => {
    chip.addEventListener('click', () => {
      const target = chip.getAttribute('data-target');
      const selected = rawPageText.value.substring(rawPageText.selectionStart, rawPageText.selectionEnd).trim();
      if (!selected) {
        showToast('左のテキストエリアで文字を選択してから押してください', 'warning');
        return;
      }

      const [scope, key] = target.split(':');
      if (scope === 'lab') {
        const labs = parser.parseLabBlock(selected);
        draftLabs.push(...labs);
        renderLabEditor();
        showToast(`研究室「${labs.map(l => l.name).join('、')}」を追加しました`, 'success');
        return;
      }

      const input = scope === 'u' ? uniInputs[key] : $(`adm_${activeTrack}_${key}`);
      if (!input) return;
      // 入試欄は複数箇所から集めやすいよう追記、大学情報は置き換え
      input.value = scope === 'a' && input.value.trim() ? `${input.value.trim()}\n${selected}` : selected;
      input.classList.add('flash-highlight');
      setTimeout(() => input.classList.remove('flash-highlight'), 600);
      refreshTrackIndicators();
      renderEventsPreview();

      const label = scope === 'u'
        ? parser.universityFields[key].label
        : `${parser.admissionTracks[activeTrack].label} / ${parser.admissionFields[key].label}`;
      showToast(`選択したテキストを「${label}」にセットしました`, 'info');
    });
  });

  // リセット
  $('btnResetForm').addEventListener('click', () => {
    resetForm();
    showToast('フォームをクリアしました', 'info');
  });

  function resetForm() {
    $('parsedDataForm').reset();
    draftLabs = [];
    draftGeneralEvents = [];
    editingUniId = null;
    btnSaveUniversity.innerHTML = saveButtonHtml;
    refreshTrackIndicators();
    renderEventsPreview();
    renderLabEditor();
  }

  // 保存（新規 / 既存大学への統合 / 編集の反映）
  btnSaveUniversity.addEventListener('click', (e) => {
    e.preventDefault();
    const data = collectForm();
    if (!data.name) {
      showToast('大学名を入力してください', 'warning');
      uniInputs.name.focus();
      return;
    }

    const now = new Date().toISOString();
    if (editingUniId) {
      const idx = universities.findIndex(u => u.id === editingUniId);
      if (idx !== -1) {
        universities[idx] = { ...universities[idx], ...data, updatedAt: now };
        showToast(`「${data.name}」を更新しました`, 'success');
      }
    } else {
      const existing = universities.find(u => isSameUniversity(u, data));
      if (existing) {
        const added = mergeUniversity(existing, data);
        existing.updatedAt = now;
        showToast(`既存の「${existing.name}」に統合しました（研究室 +${added}件）`, 'success');
      } else {
        universities.unshift({
          id: 'uni_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
          ...data,
          memo: '',
          createdAt: now
        });
        showToast(`「${data.name}」と研究室${data.labs.length}件を保存しました`, 'success');
      }
    }

    // 比較リストから消えた研究室を除外
    pruneCompareIds();
    saveUniversities();
    renderAll();
    resetForm();
  });

  function normalizeName(s) {
    return (s || '').replace(/[\s　]/g, '').replace(/^大学院/, '');
  }

  function isSameUniversity(a, b) {
    if (normalizeName(a.name) !== normalizeName(b.name)) return false;
    if (!a.faculty || !b.faculty) return true;
    const fa = normalizeName(a.faculty);
    const fb = normalizeName(b.faculty);
    return fa.includes(fb) || fb.includes(fa);
  }

  function mergeUniversity(target, data) {
    UNI_FIELDS.forEach(k => {
      if (!target[k] && data[k]) target[k] = data[k];
    });
    target.admissions = target.admissions || {};
    TRACKS.forEach(t => {
      const dst = target.admissions[t.key] = target.admissions[t.key] || parser.createAdmissionTrack();
      const src = data.admissions[t.key] || {};
      ADM_FIELDS.forEach(f => {
        if (!src[f.key]) return;
        if (!dst[f.key]) dst[f.key] = src[f.key];
        else if (!dst[f.key].includes(src[f.key])) dst[f.key] += `\n${src[f.key]}`;
      });
    });

    let added = 0;
    target.labs = target.labs || [];
    data.labs.forEach(lab => {
      const same = target.labs.find(l => normalizeName(l.name) === normalizeName(lab.name));
      if (same) {
        Object.keys(lab).forEach(k => {
          if (typeof lab[k] === 'string' && lab[k] && !same[k]) same[k] = lab[k];
        });
      } else {
        target.labs.push(lab);
        added++;
      }
    });

    const events = target.events || [];
    (data.events || []).forEach(ev => {
      if (!events.some(e => e.date === ev.date && e.label === ev.label)) events.push(ev);
    });
    target.events = events.sort((a, b) => a.date.localeCompare(b.date));
    return added;
  }

  // =========================================================
  // 3. 保存済みリスト
  // =========================================================
  [listFilterInput, areaFilter, statusFilter, sortSelect, favOnlyToggle].forEach(el => {
    el.addEventListener(el === listFilterInput ? 'input' : 'change', () => renderUniversityList());
  });

  function getMatch(lab) {
    return insights.computeMatch(lab, interestProfile);
  }

  function filterAndSortLabs(uni) {
    const q = listFilterInput.value.trim().toLowerCase();
    const area = areaFilter.value;
    const status = statusFilter.value;
    const favOnly = favOnlyToggle.checked;
    const uniText = [uni.name, uni.faculty, uni.department, uni.location].join(' ').toLowerCase();
    const uniMatchesQ = !!q && uniText.includes(q);

    let labs = (uni.labs || []).filter(lab => {
      if (favOnly && !lab.favorite) return false;
      if (status === '__none' && lab.status) return false;
      if (status && status !== '__none' && lab.status !== status) return false;
      if (area && !insights.getLabTags(lab).includes(area)) return false;
      if (q && !uniMatchesQ) {
        const tagLabels = insights.getLabTags(lab).map(k => insights.getArea(k)?.label || '').join(' ');
        const text = [insights.getLabText(lab), lab.professor, lab.memo, tagLabels].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    const sort = sortSelect.value;
    if (sort === 'match') {
      labs = labs.slice().sort((a, b) => (getMatch(b)?.score || 0) - (getMatch(a)?.score || 0));
    } else if (sort === 'priority') {
      labs = labs.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0) || Number(!!b.favorite) - Number(!!a.favorite));
    } else if (sort === 'name') {
      labs = labs.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    const hasLabFilter = favOnly || !!status || !!area;
    const visible = labs.length > 0 || (!hasLabFilter && (!q || uniMatchesQ));
    return { labs, visible };
  }

  function renderUniversityList() {
    const allLabs = universities.flatMap(u => u.labs || []);
    $('uniCount').textContent = universities.length;
    $('labCount').textContent = allLabs.length;
    $('favCount').textContent = allLabs.filter(l => l.favorite).length;
    $('exportCountBadge').textContent = allLabs.length;

    if (universities.length === 0) {
      universityList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏫</div>
          <div class="empty-text">まだ保存された大学・研究室がありません</div>
          <div class="empty-subtext">左上のサンプルボタンを押すか、研究室紹介ページのテキストを貼り付けて解析し、「大学・研究室を保存」を押してください。</div>
        </div>`;
      return;
    }

    const cards = universities
      .map(uni => ({ uni, ...filterAndSortLabs(uni) }))
      .filter(x => x.visible);

    if (cards.length === 0) {
      universityList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-text">条件に一致する研究室が見つかりません</div>
          <div class="empty-subtext">検索キーワードや絞り込み条件を変更してください。</div>
        </div>`;
      return;
    }

    universityList.innerHTML = cards.map(({ uni, labs }) => renderUniversityCard(uni, labs)).join('');
  }

  function renderUniversityCard(uni, labs) {
    const totalLabs = (uni.labs || []).length;
    const nextEvent = getUpcomingEvents([uni])[0];
    const admBadges = TRACKS.map(t => {
      const filled = isTrackFilled(uni.admissions?.[t.key]);
      return filled ? `<span class="adm-badge on" title="${escapeHtml(formatTrack(uni.admissions[t.key]))}">${t.icon} ${escapeHtml(t.label)}情報あり</span>` : '';
    }).join('');
    const english = TRACKS.map(t => uni.admissions?.[t.key]?.english).find(Boolean);

    return `
      <article class="uni-card" data-uni-id="${uni.id}">
        <div class="uni-card-head">
          <div class="uni-card-title">
            <span class="uni-icon">🏫</span>
            <div>
              <h3>${escapeHtml(uni.name)} ${uni.type ? `<span class="type-badge type-${TYPE_CLASS[uni.type] || 'other'}">${escapeHtml(uni.type)}</span>` : ''}</h3>
              <div class="uni-sub">${escapeHtml([uni.faculty, uni.department].filter(Boolean).join(' ／ ') || '学部・研究科 未設定')}</div>
            </div>
          </div>
          <div class="uni-card-actions">
            <button class="btn btn-sm btn-outline" data-action="uni-detail">📝 入試・大学詳細</button>
            <button class="btn btn-sm btn-ghost" data-action="uni-edit">✏️ 編集</button>
            <button class="btn-icon btn-icon-danger" data-action="uni-delete" title="この大学を削除">🗑️</button>
          </div>
        </div>
        <div class="uni-badges">
          ${uni.location ? `<span class="info-chip">📍 ${escapeHtml(truncate(uni.location, 24))}</span>` : ''}
          <span class="info-chip">🔬 研究室 ${totalLabs}件</span>
          ${admBadges || '<span class="adm-badge">入試情報 未登録</span>'}
          ${english ? `<span class="info-chip" title="${escapeHtml(english)}">🗣️ ${escapeHtml(truncate(english, 26))}</span>` : ''}
          ${nextEvent ? `<span class="event-badge" title="${escapeHtml(nextEvent.label)}">⏳ ${formatDateShort(nextEvent.date)} ${escapeHtml(truncate(nextEvent.label, 18))}（${daysLeftLabel(nextEvent.date)}）</span>` : ''}
        </div>
        ${labs.length === 0 ? '<div class="lab-table-empty">表示できる研究室がありません（「編集」から追加できます）</div>' : `
        <div class="lab-table-wrap">
          <table class="lab-table">
            <thead>
              <tr>
                <th class="col-star" title="気になる研究室">★</th>
                <th>研究室・教員</th>
                <th>研究分野</th>
                <th>特徴</th>
                <th title="興味分野とのマッチ度">マッチ</th>
                <th>志望度</th>
                <th>ステータス</th>
                <th>比較</th>
              </tr>
            </thead>
            <tbody>${labs.map(lab => renderLabRow(uni, lab)).join('')}</tbody>
          </table>
        </div>`}
      </article>`;
  }

  function renderLabRow(uni, lab) {
    const highlights = insights.buildHighlights(lab).slice(0, 3);
    const summary = insights.summarize(lab.description, 60);
    const inCompare = compareIds.includes(lab.id);
    return `
      <tr class="lab-row${lab.favorite ? ' is-fav' : ''}" data-lab-id="${lab.id}" data-uni-id="${uni.id}">
        <td class="col-star"><button class="star-btn${lab.favorite ? ' on' : ''}" data-action="fav" title="${lab.favorite ? 'チェックを外す' : '気になる研究室としてチェック'}">${lab.favorite ? '★' : '☆'}</button></td>
        <td class="col-name">
          <button class="lab-name-link" data-action="lab-detail" title="詳細を表示">${escapeHtml(lab.name)}</button>
          <div class="lab-prof">${escapeHtml(lab.professor || '教員 未記載')}</div>
        </td>
        <td class="col-tags">${renderTagChips(lab, 3)}</td>
        <td class="col-features">
          ${summary ? `<div class="lab-summary">${escapeHtml(summary)}</div>` : ''}
          ${highlights.length ? `<ul class="hl-list">${highlights.map(h => `<li>${h.icon} ${escapeHtml(h.text)}</li>`).join('')}</ul>` : ''}
          ${!summary && !highlights.length ? '<span class="text-dim">特徴の記載なし</span>' : ''}
        </td>
        <td>${renderMatchPill(lab)}</td>
        <td>${renderPriority(lab.priority)}</td>
        <td>${renderStatusSelect(lab.status)}</td>
        <td><label class="compare-check" title="比較リストに追加"><input type="checkbox" data-action="compare" ${inCompare ? 'checked' : ''}> 比較</label></td>
      </tr>`;
  }

  function renderTagChips(lab, max = 6) {
    const tags = insights.getLabTags(lab);
    if (tags.length === 0) return '<span class="text-dim">分野未判定</span>';
    const shown = tags.slice(0, max).map(k => {
      const a = insights.getArea(k);
      return `<span class="tag-chip" data-area="${k}">${a.icon} ${escapeHtml(a.label)}</span>`;
    }).join('');
    return shown + (tags.length > max ? `<span class="tag-chip tag-more">+${tags.length - max}</span>` : '');
  }

  function renderMatchPill(lab) {
    const m = getMatch(lab);
    if (!m) return '<span class="text-dim" title="ヘッダーの「興味分野」を設定すると表示されます">-</span>';
    const level = m.score >= 75 ? 'high' : m.score >= 50 ? 'mid' : m.score > 0 ? 'low' : 'none';
    return `<span class="match-pill match-${level}" title="${escapeHtml(m.hits.join('、') || '一致なし')}">${m.score}%</span>`;
  }

  function renderPriority(priority = 0) {
    return `<span class="priority-stars" title="志望度">${[1, 2, 3, 4, 5].map(n =>
      `<button class="prio-star${n <= priority ? ' on' : ''}" data-action="priority" data-value="${n}" title="志望度 ${n}">●</button>`
    ).join('')}</span>`;
  }

  function renderStatusSelect(status = '') {
    return `<select class="status-select status-${status || 'none'}" data-action="status">${insights.statuses.map(s =>
      `<option value="${s.key}"${s.key === (status || '') ? ' selected' : ''}>${escapeHtml(s.label)}</option>`
    ).join('')}</select>`;
  }

  // リスト内の操作（イベント委譲）
  universityList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const card = btn.closest('.uni-card');
    const row = btn.closest('.lab-row');
    const uni = card && universities.find(u => u.id === card.dataset.uniId);
    if (!uni) return;
    const lab = row && (uni.labs || []).find(l => l.id === row.dataset.labId);

    switch (action) {
      case 'fav':
        updateLab(lab, { favorite: !lab.favorite });
        showToast(lab.favorite ? `「${lab.name}」を★チェックしました` : `「${lab.name}」のチェックを外しました`, 'info');
        break;
      case 'priority': {
        const value = Number(btn.dataset.value);
        updateLab(lab, { priority: lab.priority === value ? 0 : value });
        break;
      }
      case 'lab-detail':
        openLabModal(lab.id);
        break;
      case 'uni-detail':
        openUniModal(uni.id);
        break;
      case 'uni-edit':
        startEditUniversity(uni.id);
        break;
      case 'uni-delete':
        confirmThen(btn, () => deleteUniversity(uni.id));
        break;
      default:
        break;
    }
  });

  universityList.addEventListener('change', (e) => {
    const el = e.target;
    const row = el.closest('.lab-row');
    if (!row) return;
    const found = findLab(row.dataset.labId);
    if (!found) return;
    if (el.dataset.action === 'status') {
      updateLab(found.lab, { status: el.value });
    } else if (el.dataset.action === 'compare') {
      toggleCompare(found.lab.id, el.checked);
    }
  });

  function findLab(labId) {
    for (const uni of universities) {
      const lab = (uni.labs || []).find(l => l.id === labId);
      if (lab) return { uni, lab };
    }
    return null;
  }

  function updateLab(lab, patch) {
    if (!lab) return;
    Object.assign(lab, patch);
    saveUniversities();
    renderUniversityList();
    renderCompareTray();
    if (openLabId === lab.id && !$('labModal').classList.contains('hidden')) {
      renderLabModal();
    }
  }

  function startEditUniversity(uniId) {
    const uni = universities.find(u => u.id === uniId);
    if (!uni) return;
    fillForm({
      university: uni,
      admissions: uni.admissions,
      labs: uni.labs,
      events: uni.events
    });
    editingUniId = uni.id;
    btnSaveUniversity.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      変更を保存`;
    closeAllModals();
    showToast(`「${uni.name}」を編集モードで開きました`, 'info');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteUniversity(uniId) {
    const idx = universities.findIndex(u => u.id === uniId);
    if (idx === -1) return;
    const [removed] = universities.splice(idx, 1);
    if (editingUniId === uniId) resetForm();
    pruneCompareIds();
    saveUniversities();
    renderAll();
    showToast(`「${removed.name}」を削除しました`, 'info');
  }

  function deleteLab(labId) {
    const found = findLab(labId);
    if (!found) return;
    found.uni.labs = found.uni.labs.filter(l => l.id !== labId);
    pruneCompareIds();
    saveUniversities();
    renderAll();
    closeAllModals();
    showToast(`「${found.lab.name}」を削除しました`, 'info');
  }

  // 2段階確認ボタン
  function confirmThen(btn, action) {
    if (btn.classList.contains('confirming-delete')) {
      action();
      return;
    }
    const original = btn.innerHTML;
    btn.classList.add('confirming-delete');
    btn.innerHTML = '本当に削除？';
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.classList.remove('confirming-delete');
      btn.innerHTML = original;
    }, 3000);
  }

  // 全件クリア（2段階確認）
  btnClearAllRecords.addEventListener('click', () => {
    if (universities.length === 0) return;
    if (!btnClearAllRecords.classList.contains('confirming-clear')) {
      btnClearAllRecords.classList.add('confirming-clear', 'btn-danger');
      btnClearAllRecords.classList.remove('btn-outline-danger');
      btnClearAllRecords.textContent = '本当に全件削除？';
      setTimeout(() => {
        btnClearAllRecords.classList.remove('confirming-clear', 'btn-danger');
        btnClearAllRecords.classList.add('btn-outline-danger');
        btnClearAllRecords.textContent = 'すべて削除';
      }, 4000);
      return;
    }
    universities = [];
    compareIds = [];
    saveUniversities();
    saveCompare();
    renderAll();
    btnClearAllRecords.classList.remove('confirming-clear', 'btn-danger');
    btnClearAllRecords.classList.add('btn-outline-danger');
    btnClearAllRecords.textContent = 'すべて削除';
    showToast('すべての大学・研究室データを削除しました', 'info');
  });

  // =========================================================
  // 4. 重要日程
  // =========================================================
  $('showPastEvents').addEventListener('change', () => renderSchedule());

  function getUpcomingEvents(unis, includePast = false) {
    const today = todayStr();
    return unis
      .flatMap(u => (u.events || []).map(e => ({ ...e, uniId: u.id, uniName: u.name })))
      .filter(e => includePast || e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderSchedule() {
    const includePast = $('showPastEvents').checked;
    const events = getUpcomingEvents(universities, includePast);
    const list = $('scheduleList');
    if (events.length === 0) {
      list.innerHTML = `<div class="schedule-empty">${universities.length === 0
        ? '大学を保存すると、入試の出願期間・試験日・説明会・研究室公開などの日程がここに時系列で並びます。'
        : '今後の日程はありません（「過去の日程も表示」で終了した日程を確認できます）。'}</div>`;
      return;
    }
    const MAX = 12;
    list.innerHTML = events.slice(0, MAX).map(e => {
      const d = new Date(`${e.date}T00:00:00`);
      const left = daysLeft(e.date);
      const urgency = left < 0 ? 'past' : left <= 7 ? 'urgent' : left <= 30 ? 'soon' : 'later';
      return `
        <div class="schedule-item schedule-${urgency}" data-uni-id="${e.uniId}" title="クリックで大学詳細を表示">
          <div class="schedule-date">
            <span class="schedule-md">${d.getMonth() + 1}/${d.getDate()}</span>
            <span class="schedule-wd">${d.getFullYear()} (${'日月火水木金土'[d.getDay()]})${e.yearGuessed ? ' 年推定' : ''}</span>
          </div>
          <div class="schedule-body">
            <div class="schedule-uni">${escapeHtml(e.uniName)} <span class="track-chip track-${e.track}">${escapeHtml(trackLabel(e.track))}</span></div>
            <div class="schedule-label">${escapeHtml(e.label)}</div>
          </div>
          <span class="days-left">${daysLeftLabel(e.date)}</span>
        </div>`;
    }).join('') + (events.length > MAX ? `<div class="schedule-more">ほか ${events.length - MAX} 件</div>` : '');
  }

  $('scheduleList').addEventListener('click', (e) => {
    const item = e.target.closest('.schedule-item');
    if (item) openUniModal(item.dataset.uniId);
  });

  // =========================================================
  // 5. 比較
  // =========================================================
  function toggleCompare(labId, on) {
    if (on && !compareIds.includes(labId)) {
      if (compareIds.length >= MAX_COMPARE) {
        showToast(`比較できるのは最大${MAX_COMPARE}件までです`, 'warning');
        renderUniversityList();
        return;
      }
      compareIds.push(labId);
    } else if (!on) {
      compareIds = compareIds.filter(id => id !== labId);
    }
    saveCompare();
    renderCompareTray();
    renderUniversityList();
    if (openLabId === labId && !$('labModal').classList.contains('hidden')) renderLabModal();
    if (!$('compareModal').classList.contains('hidden')) renderCompareTable();
  }

  function pruneCompareIds() {
    compareIds = compareIds.filter(id => findLab(id));
    saveCompare();
  }

  function renderCompareTray() {
    pruneCompareIds();
    if (compareIds.length === 0) {
      compareTray.classList.add('hidden');
      return;
    }
    compareTray.classList.remove('hidden');
    $('compareTrayItems').innerHTML = compareIds.map(id => {
      const { lab, uni } = findLab(id);
      return `<span class="compare-chip" title="${escapeHtml(uni.name)}">${escapeHtml(lab.name)} <button data-remove="${id}" title="外す">×</button></span>`;
    }).join('') + `<span class="compare-count">${compareIds.length}/${MAX_COMPARE}</span>`;
  }

  $('compareTrayItems').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (btn) toggleCompare(btn.dataset.remove, false);
  });

  $('btnClearCompare').addEventListener('click', () => {
    compareIds = [];
    saveCompare();
    renderCompareTray();
    renderUniversityList();
  });

  $('btnOpenCompare').addEventListener('click', () => openCompareModal());

  $('btnCompareFavorites').addEventListener('click', () => {
    const favs = universities.flatMap(u => (u.labs || []).filter(l => l.favorite).map(l => l.id));
    if (favs.length < 2) {
      showToast('比較するには★チェックした研究室が2件以上必要です', 'warning');
      return;
    }
    compareIds = favs.slice(0, MAX_COMPARE);
    saveCompare();
    renderCompareTray();
    renderUniversityList();
    if (favs.length > MAX_COMPARE) showToast(`★が多いため先頭の${MAX_COMPARE}件を比較します`, 'info');
    openCompareModal();
  });

  $('compareDiffOnly').addEventListener('change', () => renderCompareTable());

  const COMPARE_ROWS = [
    { label: '大学', text: (u) => [u.name, u.faculty, u.department].filter(Boolean).join('\n') },
    { label: '教員', text: (u, l) => l.professor },
    { label: '研究分野', html: (u, l, common) => renderTagChipsWithCommon(l, common), text: (u, l) => tagLabels(l) },
    { label: '研究内容', text: (u, l) => [l.area, l.description].filter(Boolean).join('\n') },
    { label: '特徴まとめ', html: (u, l) => listHtml(insights.buildHighlights(l).map(h => `${h.icon} ${h.text}`)), text: (u, l) => insights.buildHighlights(l).map(h => h.text).join(' / ') },
    { label: '特色・雰囲気', text: (u, l) => l.features },
    { label: '主な業績・発表', text: (u, l) => l.achievements },
    { label: '共同研究・連携', text: (u, l) => l.collaboration },
    { label: 'メンバー構成', text: (u, l) => l.members },
    { label: '修了生の進路', text: (u, l) => l.career },
    { label: '研究室訪問', text: (u, l) => l.contact },
    { label: 'マッチ度', html: (u, l) => renderMatchPill(l), text: (u, l) => { const m = getMatch(l); return m ? `${m.score}%` : ''; } },
    { label: '志望度', text: (u, l) => (l.priority ? '●'.repeat(l.priority) + '○'.repeat(5 - l.priority) : '') },
    { label: 'ステータス', text: (u, l) => (l.status ? insights.getStatusLabel(l.status) : '') },
    { label: '訪問チェック', text: (u, l) => checklistProgress(l) },
    { label: '編入学', text: (u) => formatTrack(u.admissions?.transfer) },
    { label: '大学院入試', text: (u) => formatTrack(u.admissions?.graduate) },
    { label: '英語試験', text: (u) => TRACKS.map(t => u.admissions?.[t.key]?.english ? `[${t.label}] ${u.admissions[t.key].english}` : '').filter(Boolean).join('\n') },
    { label: '次の日程', text: (u) => { const ev = getUpcomingEvents([u])[0]; return ev ? `${ev.date} ${ev.label}（${daysLeftLabel(ev.date)}）` : ''; } },
    { label: '学費・支援', text: (u) => u.tuition },
    { label: 'メモ', text: (u, l) => l.memo }
  ];

  function tagLabels(lab) {
    return insights.getLabTags(lab).map(k => insights.getArea(k).label).join(' / ');
  }

  function renderTagChipsWithCommon(lab, common) {
    const tags = insights.getLabTags(lab);
    if (!tags.length) return '<span class="text-dim">-</span>';
    return tags.map(k => {
      const a = insights.getArea(k);
      return `<span class="tag-chip${common.includes(k) ? ' tag-common' : ''}" title="${common.includes(k) ? '全研究室に共通の分野' : ''}">${a.icon} ${escapeHtml(a.label)}</span>`;
    }).join('');
  }

  function listHtml(items) {
    return items.length ? `<ul class="hl-list">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '';
  }

  function openCompareModal() {
    if (compareIds.length === 0) {
      showToast('比較リストに研究室を追加してください', 'warning');
      return;
    }
    renderCompareTable();
    openModal('compareModal');
  }

  function getCompareItems() {
    return compareIds.map(id => findLab(id)).filter(Boolean);
  }

  function renderCompareTable() {
    const items = getCompareItems();
    const wrap = $('compareTableWrap');
    if (items.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-text">比較する研究室がありません</div></div>';
      return;
    }
    const tagSets = items.map(({ lab }) => insights.getLabTags(lab));
    const common = items.length > 1 ? tagSets[0].filter(t => tagSets.every(s => s.includes(t))) : [];
    const diffOnly = $('compareDiffOnly').checked;

    const rows = COMPARE_ROWS.map(row => {
      const texts = items.map(({ uni, lab }) => (row.text(uni, lab) || '').trim());
      if (diffOnly && items.length > 1 && texts.every(t => t === texts[0])) return '';
      const cells = items.map(({ uni, lab }, i) => {
        const content = row.html ? row.html(uni, lab, common) : (texts[i] ? escapeHtml(texts[i]) : '<span class="text-dim">-</span>');
        return `<td>${content || '<span class="text-dim">-</span>'}</td>`;
      }).join('');
      return `<tr><th>${escapeHtml(row.label)}</th>${cells}</tr>`;
    }).join('');

    wrap.innerHTML = `
      <table class="compare-table">
        <thead>
          <tr>
            <th></th>
            ${items.map(({ lab }) => `
              <th>
                <div class="compare-head">
                  <button class="star-btn${lab.favorite ? ' on' : ''}" data-cmp-fav="${lab.id}">${lab.favorite ? '★' : '☆'}</button>
                  <button class="lab-name-link" data-cmp-open="${lab.id}">${escapeHtml(lab.name)}</button>
                  <button class="btn-icon" data-cmp-remove="${lab.id}" title="比較から外す">×</button>
                </div>
              </th>`).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  $('compareTableWrap').addEventListener('click', (e) => {
    const t = e.target.closest('[data-cmp-fav], [data-cmp-open], [data-cmp-remove]');
    if (!t) return;
    if (t.dataset.cmpRemove) {
      toggleCompare(t.dataset.cmpRemove, false);
      if (compareIds.length === 0) closeModal('compareModal');
    } else if (t.dataset.cmpOpen) {
      closeModal('compareModal');
      openLabModal(t.dataset.cmpOpen);
    } else if (t.dataset.cmpFav) {
      const found = findLab(t.dataset.cmpFav);
      if (found) {
        updateLab(found.lab, { favorite: !found.lab.favorite });
        renderCompareTable();
      }
    }
  });

  $('btnExportCompareCsv').addEventListener('click', () => {
    const items = getCompareItems();
    if (items.length === 0) return;
    const header = ['項目', ...items.map(({ lab }) => lab.name)];
    const rows = COMPARE_ROWS.map(row => [row.label, ...items.map(({ uni, lab }) => row.text(uni, lab) || '')]);
    downloadCsv([header, ...rows], `研究室比較_${dateStamp()}.csv`);
    showToast('比較表をCSVで保存しました', 'success');
  });

  // =========================================================
  // 6. 研究室詳細モーダル
  // =========================================================
  function openLabModal(labId) {
    openLabId = labId;
    if (!findLab(labId)) return;
    renderLabModal();
    openModal('labModal');
  }

  function renderLabModal() {
    const found = findLab(openLabId);
    if (!found) {
      closeModal('labModal');
      return;
    }
    const { uni, lab } = found;
    $('labModalTitle').innerHTML = `🔬 ${escapeHtml(lab.name)} <span class="modal-sub">${escapeHtml(uni.name)}${uni.faculty ? ' ' + escapeHtml(uni.faculty) : ''}</span>`;

    const highlights = insights.buildHighlights(lab);
    const match = getMatch(lab);
    const filled = LAB_DETAIL_FIELDS.filter(f => lab[f.key]);
    const missing = LAB_DETAIL_FIELDS.filter(f => !lab[f.key] && ['professor', 'features', 'career', 'contact', 'members'].includes(f.key));
    const checklist = lab.checklist || {};
    const doneCount = insights.visitQuestions.filter(q => checklist[q.key]).length;

    const admSummary = TRACKS.filter(t => isTrackFilled(uni.admissions?.[t.key])).map(t => {
      const adm = uni.admissions[t.key];
      const lines = ['summary', 'eligibility', 'subjects', 'english'].filter(k => adm[k]).map(k => `<div><span class="kv-key">${escapeHtml(parser.admissionFields[k].label)}</span> ${escapeHtml(truncate(adm[k], 90))}</div>`);
      return `<div class="adm-mini"><div class="adm-mini-title">${t.icon} ${escapeHtml(t.label)}</div>${lines.join('')}</div>`;
    }).join('');

    $('labModalBody').innerHTML = `
      <div class="detail-top">
        <div class="detail-tags">${renderTagChips(lab, 10)}</div>
        <div class="detail-controls">
          <button class="btn btn-sm ${lab.favorite ? 'btn-warning' : 'btn-outline'}" data-modal-action="fav">${lab.favorite ? '★ チェック済み' : '☆ 気になる'}</button>
          <span class="control-label">志望度</span>${renderPriority(lab.priority)}
          ${renderStatusSelect(lab.status)}
        </div>
      </div>

      ${match ? `
        <div class="match-bar-wrap">
          <span>🎯 興味マッチ度</span>
          <div class="match-bar"><div class="match-bar-fill" style="width:${match.score}%"></div></div>
          <strong>${match.score}%</strong>
          <span class="text-dim">${escapeHtml(match.hits.join('、') || '一致する分野なし')}</span>
        </div>` : ''}

      ${highlights.length ? `<div class="hl-chips">${highlights.map(h => `<span class="hl-chip">${h.icon} ${escapeHtml(h.text)}</span>`).join('')}</div>` : ''}

      <div class="detail-grid">
        ${filled.map(f => `
          <div class="detail-item${['description', 'features'].includes(f.key) ? ' detail-wide' : ''}">
            <div class="detail-label">${escapeHtml(f.label)}</div>
            <div class="detail-value">${f.key === 'url' ? linkify(lab[f.key]) : escapeHtml(lab[f.key])}</div>
          </div>`).join('')}
      </div>
      ${missing.length ? `<div class="missing-note">💡 未取得: ${missing.map(f => escapeHtml(f.label)).join('、')} — 研究室訪問や問い合わせで確認しましょう</div>` : ''}

      <div class="detail-section">
        <div class="detail-section-head">
          <h4>📝 この大学の入学・編入情報</h4>
          <button class="btn btn-sm btn-ghost" data-modal-action="open-uni">詳細を見る →</button>
        </div>
        ${admSummary || '<div class="text-dim">入試情報は未登録です（大学の「編集」から追加できます）</div>'}
      </div>

      <div class="detail-section">
        <div class="detail-section-head">
          <h4>🤝 研究室訪問・問い合わせチェックリスト <span class="checklist-progress">${doneCount}/${insights.visitQuestions.length}</span></h4>
        </div>
        <div class="checklist">
          ${insights.visitQuestions.map(q => `
            <label class="checkbox-label checklist-item${checklist[q.key] ? ' done' : ''}">
              <input type="checkbox" data-check="${q.key}" ${checklist[q.key] ? 'checked' : ''}>
              <span>${escapeHtml(q.text)}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="detail-section">
        <h4>🗒️ メモ（訪問で聞いたこと・気になった点など）</h4>
        <textarea id="labMemoInput" rows="4" placeholder="例: 先生は学生の自主性を重視。院試の専門科目はアルゴリズム中心。">${escapeHtml(lab.memo || '')}</textarea>
        <span class="field-help" id="memoSavedHint">入力内容は自動保存されます</span>
      </div>`;

    const inCompare = compareIds.includes(lab.id);
    $('labModalFooter').innerHTML = `
      <button class="btn btn-sm btn-outline-danger" data-modal-action="delete-lab">この研究室を削除</button>
      <span class="footer-spacer"></span>
      <button class="btn btn-outline" data-modal-action="edit-uni">大学ごと編集</button>
      <button class="btn ${inCompare ? 'btn-outline' : 'btn-accent'}" data-modal-action="compare">${inCompare ? '比較から外す' : '⚖️ 比較に追加'}</button>
      <button class="btn btn-primary" data-close-modal>閉じる</button>`;
  }

  function handleLabModalAction(e) {
    const el = e.target.closest('[data-modal-action], [data-action="priority"]');
    if (!el) return;
    const found = findLab(openLabId);
    if (!found) return;
    const { uni, lab } = found;
    const action = el.dataset.modalAction || el.dataset.action;

    switch (action) {
      case 'fav':
        updateLab(lab, { favorite: !lab.favorite });
        break;
      case 'priority': {
        const value = Number(el.dataset.value);
        updateLab(lab, { priority: lab.priority === value ? 0 : value });
        break;
      }
      case 'open-uni':
        closeModal('labModal');
        openUniModal(uni.id);
        break;
      case 'edit-uni':
        startEditUniversity(uni.id);
        break;
      case 'compare':
        toggleCompare(lab.id, !compareIds.includes(lab.id));
        break;
      case 'delete-lab':
        confirmThen(el, () => deleteLab(lab.id));
        break;
      default:
        break;
    }
  }

  $('labModalBody').addEventListener('click', handleLabModalAction);
  $('labModalFooter').addEventListener('click', handleLabModalAction);

  $('labModalBody').addEventListener('change', (e) => {
    const found = findLab(openLabId);
    if (!found) return;
    if (e.target.dataset.action === 'status') {
      updateLab(found.lab, { status: e.target.value });
    } else if (e.target.dataset.check) {
      const checklist = { ...(found.lab.checklist || {}), [e.target.dataset.check]: e.target.checked };
      updateLab(found.lab, { checklist });
    }
  });

  const saveMemo = debounce((labId, value) => {
    const found = findLab(labId);
    if (!found) return;
    found.lab.memo = value;
    saveUniversities();
    renderUniversityList();
    const hint = $('memoSavedHint');
    if (hint) hint.textContent = `保存しました（${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`;
  }, 500);

  $('labModalBody').addEventListener('input', (e) => {
    if (e.target.id === 'labMemoInput') saveMemo(openLabId, e.target.value);
  });

  // =========================================================
  // 7. 大学詳細モーダル
  // =========================================================
  function openUniModal(uniId) {
    const uni = universities.find(u => u.id === uniId);
    if (!uni) return;
    openUniId = uniId;

    $('uniModalTitle').innerHTML = `🏫 ${escapeHtml(uni.name)} <span class="modal-sub">${escapeHtml([uni.faculty, uni.department].filter(Boolean).join(' ／ '))}</span>`;

    const info = [
      ['設置区分', uni.type], ['所在地・キャンパス', uni.location], ['特色・概要', uni.overview],
      ['学費・奨学金', uni.tuition], ['進路・就職', uni.career]
    ].filter(([, v]) => v);

    const admSections = TRACKS.map(t => {
      const adm = uni.admissions?.[t.key];
      if (!isTrackFilled(adm)) return '';
      return `
        <div class="adm-section">
          <div class="adm-section-title">${t.icon} ${escapeHtml(t.label)}</div>
          <div class="detail-grid">
            ${ADM_FIELDS.filter(f => adm[f.key]).map(f => `
              <div class="detail-item${f.key === 'summary' ? ' detail-wide' : ''}">
                <div class="detail-label">${escapeHtml(f.label)}</div>
                <div class="detail-value">${escapeHtml(adm[f.key])}</div>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');

    const events = uni.events || [];
    $('uniModalBody').innerHTML = `
      ${info.length ? `<div class="detail-grid">${info.map(([k, v]) => `
        <div class="detail-item${k === '特色・概要' ? ' detail-wide' : ''}">
          <div class="detail-label">${escapeHtml(k)}</div>
          <div class="detail-value">${escapeHtml(v)}</div>
        </div>`).join('')}</div>` : ''}
      ${uni.url ? `<div class="detail-link">🔗 ${linkify(uni.url)}</div>` : ''}

      <div class="detail-section">
        <h4>📝 入学・編入の条件と方式</h4>
        ${admSections || '<div class="text-dim">入試情報は未登録です。入試要項ページのテキストを解析して「保存」すると、この大学に統合されます。</div>'}
      </div>

      <div class="detail-section">
        <h4>📅 日程</h4>
        ${events.length ? `<ul class="event-list">${events.map(e => `
          <li><strong>${escapeHtml(e.date)}${e.yearGuessed ? '（年推定）' : ''}</strong>
          <span class="track-chip track-${e.track}">${escapeHtml(trackLabel(e.track))}</span>
          ${escapeHtml(e.label)} <span class="days-left">${daysLeftLabel(e.date)}</span></li>`).join('')}</ul>`
          : '<div class="text-dim">日付つきの日程は見つかっていません</div>'}
      </div>

      <div class="detail-section">
        <h4>🔬 研究室 (${(uni.labs || []).length})</h4>
        <div class="uni-lab-chips">
          ${(uni.labs || []).map(l => `<button class="lab-chip${l.favorite ? ' is-fav' : ''}" data-open-lab="${l.id}">${l.favorite ? '★ ' : ''}${escapeHtml(l.name)}</button>`).join('') || '<span class="text-dim">研究室は未登録です</span>'}
        </div>
      </div>`;

    $('uniModalFooter').innerHTML = `
      <button class="btn btn-outline" data-uni-action="edit">✏️ 編集</button>
      <button class="btn btn-primary" data-close-modal>閉じる</button>`;
    openModal('uniModal');
  }

  $('uniModalBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-lab]');
    if (!btn) return;
    closeModal('uniModal');
    openLabModal(btn.dataset.openLab);
  });

  $('uniModalFooter').addEventListener('click', (e) => {
    if (e.target.closest('[data-uni-action="edit"]') && openUniId) startEditUniversity(openUniId);
  });

  // =========================================================
  // 8. 興味分野
  // =========================================================
  $('btnInterest').addEventListener('click', () => {
    $('interestAreaCheckboxes').innerHTML = insights.researchAreas.map(a => `
      <label class="checkbox-label option-box">
        <input type="checkbox" value="${a.key}" ${interestProfile.areas.includes(a.key) ? 'checked' : ''}>
        <span>${a.icon} ${escapeHtml(a.label)}</span>
      </label>`).join('');
    $('interestKeywords').value = (interestProfile.keywords || []).join(', ');
    openModal('interestModal');
  });

  $('btnClearInterest').addEventListener('click', () => {
    $('interestAreaCheckboxes').querySelectorAll('input').forEach(cb => { cb.checked = false; });
    $('interestKeywords').value = '';
  });

  $('btnSaveInterest').addEventListener('click', () => {
    const areas = [...$('interestAreaCheckboxes').querySelectorAll('input:checked')].map(cb => cb.value);
    const keywords = $('interestKeywords').value.split(/[,、，\s]+/).map(s => s.trim()).filter(Boolean);
    interestProfile = { areas, keywords };
    localStorage.setItem(STORAGE_KEY_INTEREST, JSON.stringify(interestProfile));
    updateInterestBadge();
    if (areas.length || keywords.length) sortSelect.value = 'match';
    renderUniversityList();
    closeModal('interestModal');
    showToast('興味分野を保存しました。研究室のマッチ度を表示します', 'success');
  });

  function updateInterestBadge() {
    const count = (interestProfile.areas || []).length + (interestProfile.keywords || []).length;
    const badge = $('interestBadge');
    badge.textContent = count ? `${count}件` : '未設定';
    badge.className = count ? 'ai-status-on' : 'ai-status-off';
  }

  // =========================================================
  // 9. CSV / JSON 入出力
  // =========================================================
  $('btnExportCsv').addEventListener('click', () => {
    const favOnly = localStorage.getItem(STORAGE_KEY_EXPORT_FAV) === 'true';
    const cols = ALL_FIELDS.filter(f => selectedColumns.includes(f.key));
    if (cols.length === 0) {
      showToast('出力するカラムが選択されていません', 'warning');
      return;
    }

    const rows = [];
    universities.forEach(uni => {
      const labs = (uni.labs || []).filter(l => !favOnly || l.favorite);
      if (labs.length === 0 && !favOnly) {
        rows.push(cols.map(c => getCellValue(uni, null, c.key)));
      }
      labs.forEach(lab => rows.push(cols.map(c => getCellValue(uni, lab, c.key))));
    });

    if (rows.length === 0) {
      showToast(favOnly ? '★をつけた研究室がありません' : 'エクスポートするデータがありません', 'warning');
      return;
    }
    downloadCsv([cols.map(c => c.label), ...rows], `研究室リスト_${dateStamp()}_${rows.length}件.csv`);
    showToast(`CSVファイル (${rows.length}行) をダウンロードしました`, 'success');
  });

  function getCellValue(uni, lab, key) {
    const [scope, field] = key.split('.');
    if (scope === 'uni') {
      if (field === 'events') return (uni.events || []).map(e => `${e.date} ${e.label}`).join('\n');
      return uni[field] || '';
    }
    if (scope === 'adm') {
      if (field === 'english') {
        return TRACKS.map(t => uni.admissions?.[t.key]?.english ? `[${t.label}] ${uni.admissions[t.key].english}` : '').filter(Boolean).join('\n');
      }
      return formatTrack(uni.admissions?.[field]);
    }
    if (!lab) return '';
    switch (field) {
      case 'tags': return tagLabels(lab);
      case 'highlights': return insights.buildHighlights(lab).map(h => h.text).join(' / ');
      case 'favorite': return lab.favorite ? '★' : '';
      case 'priority': return lab.priority ? String(lab.priority) : '';
      case 'status': return lab.status ? insights.getStatusLabel(lab.status) : '';
      case 'match': { const m = getMatch(lab); return m ? `${m.score}%` : ''; }
      case 'checklist': return checklistProgress(lab);
      default: return lab[field] || '';
    }
  }

  function downloadCsv(rows, filename) {
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    // UTF-8 BOM を付与（Excel文字化け防止）
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    downloadBlob(new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' }), filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  $('btnExportJson').addEventListener('click', () => {
    if (universities.length === 0) {
      showToast('バックアップするデータがありません', 'warning');
      return;
    }
    const payload = {
      app: 'labhub',
      version: 1,
      exportedAt: new Date().toISOString(),
      universities,
      interestProfile
    };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `研究室リサーチHub_backup_${dateStamp()}.json`);
    showToast('JSONバックアップをダウンロードしました', 'success');
  });

  $('btnImportJson').addEventListener('click', () => $('importFileInput').click());

  $('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.universities;
      if (!Array.isArray(incoming)) throw new Error('形式が正しくありません');

      let added = 0;
      let updated = 0;
      incoming.forEach(u => {
        if (!u || !u.name) return;
        const normalized = {
          ...u,
          id: u.id || 'uni_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
          admissions: u.admissions || {},
          labs: (u.labs || []).map(l => ({ ...parser.createLab(), ...l })),
          events: u.events || []
        };
        const idx = universities.findIndex(x => x.id === normalized.id);
        if (idx !== -1) {
          universities[idx] = normalized;
          updated++;
        } else {
          universities.push(normalized);
          added++;
        }
      });
      if (data.interestProfile && !(interestProfile.areas || []).length && !(interestProfile.keywords || []).length) {
        interestProfile = data.interestProfile;
        localStorage.setItem(STORAGE_KEY_INTEREST, JSON.stringify(interestProfile));
        updateInterestBadge();
      }
      saveUniversities();
      renderAll();
      showToast(`JSONを読み込みました（追加${added}校 / 更新${updated}校）`, 'success');
    } catch (err) {
      showToast(`読み込みに失敗しました: ${err.message}`, 'warning');
    }
  });

  // --- 列設定モーダル ---
  $('btnColumnSettings').addEventListener('click', () => {
    $('columnCheckboxes').innerHTML = ALL_FIELDS.map(f => `
      <label class="checkbox-label option-box">
        <input type="checkbox" value="${f.key}" ${selectedColumns.includes(f.key) ? 'checked' : ''}>
        <span>${escapeHtml(f.label)}</span>
      </label>`).join('');
    $('exportFavOnly').checked = localStorage.getItem(STORAGE_KEY_EXPORT_FAV) === 'true';
    openModal('colModal');
  });

  $('btnSelectAllCols').addEventListener('click', () => {
    $('columnCheckboxes').querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
  });

  $('btnSaveCols').addEventListener('click', () => {
    const checked = [...$('columnCheckboxes').querySelectorAll('input:checked')].map(cb => cb.value);
    if (checked.length === 0) {
      showToast('少なくとも1つの列を選択してください', 'warning');
      return;
    }
    selectedColumns = checked;
    localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(selectedColumns));
    localStorage.setItem(STORAGE_KEY_EXPORT_FAV, $('exportFavOnly').checked ? 'true' : 'false');
    closeModal('colModal');
    showToast('CSV出力の設定を保存しました', 'success');
  });

  // =========================================================
  // 10. AI設定モーダル
  // =========================================================
  const geminiApiKey = $('geminiApiKey');
  const geminiModel = $('geminiModel');
  const aiAutoParseCheck = $('aiAutoParseCheck');

  $('btnAiSettings').addEventListener('click', () => {
    const ai = window.geminiLabParser;
    if (ai) {
      geminiApiKey.value = ai.apiKey;
      geminiModel.value = ai.model;
      aiAutoParseCheck.checked = ai.autoParse;
    }
    updateAiKeyStatus();
    openModal('aiModal');
  });

  function updateAiKeyStatus() {
    const ai = window.geminiLabParser;
    const status = $('aiKeyStatus');
    const saved = ai && ai.isConfigured();
    status.textContent = saved ? `🔑 保存済みのAPIキー: ${ai.maskedKey()}` : '🔓 このブラウザに保存されたAPIキーはありません';
    status.className = `api-key-status ${saved ? 'is-saved' : ''}`;
    $('btnDeleteApiKey').disabled = !saved && !geminiApiKey.value;
  }

  geminiApiKey.addEventListener('input', () => {
    $('btnDeleteApiKey').disabled = !window.geminiLabParser?.isConfigured() && !geminiApiKey.value;
  });

  // APIキーの削除（2段階確認）: メモリ・LocalStorage・SessionStorage・Cache Storage・入力欄から消去
  $('btnDeleteApiKey').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    confirmThen(btn, async () => {
      btn.classList.remove('confirming-delete');
      btn.innerHTML = '🗑️ APIキーを削除';
      const ai = window.geminiLabParser;
      const report = ai ? await ai.clearApiKey() : { storageKeys: [], cacheEntries: 0 };
      geminiApiKey.value = '';
      geminiModel.value = ai ? ai.model : geminiModel.value;
      aiAutoParseCheck.checked = true;
      updateAiBadge();
      updateAiKeyStatus();
      showToast(`APIキーを削除しました（保存領域 ${report.storageKeys.length}件・キャッシュ ${report.cacheEntries}件を消去）`, 'success');
    });
  });

  $('btnSaveAiSettings').addEventListener('click', () => {
    if (!window.geminiLabParser) return;
    window.geminiLabParser.saveConfig(geminiApiKey.value, geminiModel.value, aiAutoParseCheck.checked);
    updateAiBadge();
    updateAiKeyStatus();
    closeModal('aiModal');
    showToast('AI設定を保存しました', 'success');
  });

  const btnTestAi = $('btnTestAi');
  btnTestAi.addEventListener('click', async () => {
    const key = geminiApiKey.value.trim();
    if (!key) {
      showToast('APIキーを入力してください', 'warning');
      return;
    }
    btnTestAi.disabled = true;
    btnTestAi.textContent = '接続中...';
    try {
      const workingModel = await window.geminiLabParser.testConnection(key, geminiModel.value);
      if (workingModel && geminiModel.value !== workingModel) geminiModel.value = workingModel;
      showToast(`Gemini API (${workingModel}) との接続テストに成功しました！`, 'success');
    } catch (err) {
      showToast(`接続失敗: ${err.message}`, 'warning');
    } finally {
      btnTestAi.disabled = false;
      btnTestAi.textContent = '接続テスト';
    }
  });

  function updateAiBadge() {
    const badge = $('aiStatusBadge');
    const on = window.geminiLabParser && window.geminiLabParser.isConfigured();
    badge.textContent = on ? 'ON' : 'OFF';
    badge.className = on ? 'ai-status-on' : 'ai-status-off';
  }

  // =========================================================
  // 11. ローカルSLM設定
  // =========================================================

  function updateSlmBadge() {
    const badge = $('slmStatusBadge');
    const backend = slm.config.backend;
    badge.textContent = backend === 'webllm' ? 'ブラウザ' : backend === 'server' ? 'サーバー' : 'OFF';
    badge.className = slm.isEnabled() ? 'ai-status-on' : 'ai-status-off';
    $('btnSlmSettings').title = `ローカルSLM: ${slm.describe()}`;
  }

  function selectedSlmBackend() {
    return document.querySelector('input[name="slmBackend"]:checked')?.value || 'none';
  }

  function toggleSlmSections() {
    const backend = selectedSlmBackend();
    $('slmWebllmSection').classList.toggle('hidden', backend !== 'webllm');
    $('slmServerSection').classList.toggle('hidden', backend !== 'server');
  }

  function readSlmForm() {
    return {
      backend: selectedSlmBackend(),
      webllmModel: $('slmWebllmModel').value,
      serverFlavor: $('slmServerFlavor').value,
      serverUrl: $('slmServerUrl').value.trim() || 'http://127.0.0.1:11434',
      serverModel: $('slmServerModel').value.trim()
    };
  }

  function setSlmProgress(ratio, text) {
    $('slmProgressFill').style.width = `${Math.round((ratio || 0) * 100)}%`;
    $('slmStatusText').textContent = text || '';
  }

  $('btnSlmSettings').addEventListener('click', () => {
    const c = slm.config;
    document.querySelectorAll('input[name="slmBackend"]').forEach(r => { r.checked = r.value === c.backend; });
    $('slmWebllmModel').innerHTML = slm.webllmModels
      .map(m => `<option value="${m.id}"${m.id === c.webllmModel ? ' selected' : ''}>${escapeHtml(m.label)}</option>`)
      .join('');
    $('slmWebGpuStatus').innerHTML = slm.hasWebGpu()
      ? '<span class="gpu-ok">✅ このブラウザはWebGPUに対応しています</span>'
      : '<span class="gpu-ng">⚠️ WebGPU非対応です。最新のChrome/Edgeを使うか「ローカルLLMサーバー」を選んでください</span>';
    $('slmServerFlavor').value = c.serverFlavor;
    $('slmServerUrl').value = c.serverUrl;
    $('slmServerModel').value = c.serverModel;
    $('slmServerModelList').innerHTML = slm.serverModelHints.map(m => `<option value="${m}">`).join('');
    setSlmProgress(slm.isLoaded() && slm.isEnabled() ? 1 : 0, slm.isEnabled() ? `現在: ${slm.describe()}${c.backend === 'webllm' && !slm.isLoaded() ? '（未読み込み）' : ''}` : '');
    toggleSlmSections();
    openModal('slmModal');
  });

  document.querySelectorAll('input[name="slmBackend"]').forEach(r => r.addEventListener('change', toggleSlmSections));

  $('slmServerFlavor').addEventListener('change', () => {
    const url = $('slmServerUrl');
    // よく使うポートの自動切替（Ollama: 11434 / LM Studio: 1234）
    if ($('slmServerFlavor').value === 'openai' && /:11434\/?$/.test(url.value)) url.value = 'http://127.0.0.1:1234';
    if ($('slmServerFlavor').value === 'ollama' && /:1234\/?$/.test(url.value)) url.value = 'http://127.0.0.1:11434';
  });

  $('btnSlmListModels').addEventListener('click', async () => {
    slm.saveConfig(readSlmForm());
    try {
      const models = await slm.listServerModels();
      $('slmServerModelList').innerHTML = [...new Set([...models, ...slm.serverModelHints])].map(m => `<option value="${escapeHtml(m)}">`).join('');
      if (models.length && !models.includes($('slmServerModel').value)) $('slmServerModel').value = models[0];
      showToast(models.length ? `モデル ${models.length}件 を取得しました` : 'インストール済みのモデルがありません（例: ollama pull qwen2.5:3b）', models.length ? 'success' : 'warning');
    } catch (e) {
      showToast(e.message, 'warning');
    }
  });

  $('btnSlmSave').addEventListener('click', () => {
    slm.saveConfig(readSlmForm());
    updateSlmBadge();
    closeModal('slmModal');
    showToast(`ローカルSLM: ${slm.describe()}`, 'success');
  });

  $('btnSlmTest').addEventListener('click', async () => {
    slm.saveConfig(readSlmForm());
    updateSlmBadge();
    if (!slm.isEnabled()) {
      showToast('「ブラウザ内で実行」または「ローカルLLMサーバー」を選んでください', 'warning');
      return;
    }
    const btn = $('btnSlmTest');
    btn.disabled = true;
    try {
      setSlmProgress(0, '準備中...');
      const { result, ms } = await slm.test((p, text) => setSlmProgress(p, text));
      setSlmProgress(1, `✅ 動作OK（${(ms / 1000).toFixed(1)}秒）: ${JSON.stringify(result)}`);
      showToast('ローカルSLMの動作を確認しました', 'success');
    } catch (e) {
      setSlmProgress(0, `❌ ${e.message}`);
      showToast(e.message, 'warning');
    } finally {
      btn.disabled = false;
    }
  });

  // =========================================================
  // 12. サイト自動探索（クローラー）
  // =========================================================
  const crawlState = { running: false, cancelled: false, result: null, selected: new Set() };
  const PAGE_KIND_LABELS = { 'lab-list': '研究室一覧', lab: '研究室', 'lab-detail': '研究室ページ', admission: '入試', org: '研究科・学科', other: 'その他' };

  $('btnOpenCrawler').addEventListener('click', () => {
    const url = pageUrlInput.value.trim() || uniInputs.url.value.trim();
    if (url && !$('crawlStartUrl').value) $('crawlStartUrl').value = url;
    const useSlm = $('crawlUseSlm');
    useSlm.disabled = !slm.isEnabled();
    if (!crawlState.running) useSlm.checked = slm.isEnabled();
    $('crawlSlmLabel').textContent = slm.isEnabled()
      ? `ローカルSLMで文脈判定（${slm.describe()}）`
      : 'ローカルSLMで文脈判定（未設定: ヘッダーの「🧠 ローカルSLM」から設定）';
    openModal('crawlModal');
    $('crawlStartUrl').focus();
  });

  $('crawlStartUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      startCrawl();
    }
  });
  $('btnStartCrawl').addEventListener('click', () => startCrawl());
  $('btnStopCrawl').addEventListener('click', () => {
    crawlState.cancelled = true;
    $('crawlStatus').textContent = '停止しています...（処理中のページが終わり次第停止）';
  });

  function setCrawlRunning(running) {
    crawlState.running = running;
    $('btnStartCrawl').classList.toggle('hidden', running);
    $('btnStopCrawl').classList.toggle('hidden', !running);
    $('crawlStartUrl').disabled = running;
  }

  async function startCrawl() {
    if (crawlState.running) return;
    let url = $('crawlStartUrl').value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      new URL(url);
    } catch {
      showToast('探索を開始するURLを入力してください', 'warning');
      return;
    }
    $('crawlStartUrl').value = url;

    const num = (id, def, min, max) => Math.min(max, Math.max(min, Number($(id).value) || def));
    const useSlm = $('crawlUseSlm').checked && slm.isEnabled();
    const opts = {
      maxPages: num('crawlMaxPages', 25, 3, 150),
      maxDepth: num('crawlMaxDepth', 3, 1, 6),
      infoOnly: $('crawlInfoOnly').checked,
      findAdmissions: $('crawlAdmissions').checked,
      followLabPages: $('crawlFollowLabs').checked,
      labPageLimit: num('crawlLabPageLimit', 10, 0, 60),
      slm: useSlm ? slm : null
    };

    crawlState.cancelled = false;
    crawlState.result = null;
    crawlState.selected = new Set();
    setCrawlRunning(true);
    $('crawlLog').innerHTML = '';
    $('crawlResults').innerHTML = '<div class="text-dim">探索中です。終わると分野別の研究室一覧が表示されます。</div>';
    $('crawlLabCount').textContent = '0';
    $('crawlAdmissionNote').textContent = '';
    $('btnImportCrawl').disabled = true;

    try {
      if (useSlm && !slm.isLoaded()) {
        $('crawlStatus').textContent = 'ローカルSLMを準備しています...';
        await slm.ensureReady((p, text) => {
          $('crawlProgressFill').style.width = `${Math.round(p * 100)}%`;
          $('crawlStatus').textContent = `SLM準備中: ${text}`;
        });
      }

      const result = await window.siteCrawler.crawl(url, opts, {
        isCancelled: () => crawlState.cancelled,
        onLog: appendCrawlLog,
        onProgress: (st) => {
          let ratio = st.visited / st.maxPages;
          let text = `${st.visited}/${st.maxPages}ページ・研究室候補 ${st.labs}件・待機中リンク ${st.queued}件`;
          if (st.phase === 'slm') text = `ローカルSLMで判定中 (${st.slmDone}/${st.slmTotal}) — ${shortUrl(st.current)}`;
          else if (st.phase === 'details') {
            ratio = (st.detailDone + 1) / st.detailTotal;
            text = `研究室ページの概要を取得中 (${st.detailDone + 1}/${st.detailTotal}) — ${shortUrl(st.current)}`;
          } else if (st.phase === 'done') {
            ratio = 1;
          } else if (st.current) {
            text += ` — ${shortUrl(st.current)}`;
          }
          $('crawlProgressFill').style.width = `${Math.round(Math.min(1, ratio) * 100)}%`;
          $('crawlStatus').textContent = text;
        }
      });

      crawlState.result = result;
      result.labs.forEach((lab, i) => {
        if (!lab.offField && lab.confidence >= 0.45) crawlState.selected.add(i);
      });
      renderCrawlResults();

      const tracks = TRACKS.filter(t => isTrackFilled(result.admissions[t.key])).map(t => t.label);
      $('crawlAdmissionNote').textContent = tracks.length ? `📝 入試情報: ${tracks.join('・')}` : '';
      $('crawlStatus').textContent = `${result.cancelled ? '停止しました' : '完了'}: ${result.pages.length}ページを探索し、研究室 ${result.labs.length}件を見つけました${result.university.name ? `（${result.university.name}）` : ''}`;
      $('crawlProgressFill').style.width = '100%';
      if (result.labs.length === 0) {
        showToast('研究室が見つかりませんでした。研究科・専攻のページから開始するか、最大ページ数を増やしてください', 'warning');
      }
    } catch (e) {
      $('crawlStatus').textContent = `❌ ${e.message}`;
      showToast(e.message, 'warning');
    } finally {
      setCrawlRunning(false);
    }
  }

  function shortUrl(u) {
    try {
      const x = new URL(u);
      return truncate(decodeURIComponent(x.host + x.pathname), 60);
    } catch {
      return truncate(u || '', 60);
    }
  }

  function appendCrawlLog(entry) {
    const li = document.createElement('li');
    li.className = `crawl-log-item log-${entry.status}`;
    const icon = entry.status === 'ok' ? (entry.labs ? '🔬' : '📄') : entry.status === 'skip' ? '⏭️' : '⚠️';
    const kind = entry.kind ? `<span class="kind-badge kind-${entry.kind}">${escapeHtml(PAGE_KIND_LABELS[entry.kind] || entry.kind)}</span>` : '';
    li.innerHTML = `
      <div class="crawl-log-main">${icon} ${kind}
        <a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener" title="${escapeHtml(entry.url)}">${escapeHtml(truncate(entry.title || shortUrl(entry.url), 48))}</a>
      </div>
      <div class="crawl-log-sub">
        ${entry.status === 'ok' && entry.kind !== 'lab-detail' ? `研究室 ${entry.labs}件 / 次のリンク ${entry.queued}件` : ''}
        ${entry.message ? ` ${escapeHtml(entry.message)}` : ''}
        ${entry.reason && entry.depth ? `<span class="text-dim">← ${escapeHtml(truncate(entry.reason, 50))}</span>` : ''}
      </div>`;
    const log = $('crawlLog');
    log.prepend(li);
    while (log.children.length > 200) log.lastChild.remove();
  }

  function crawlGroupKey(lab) {
    if ($('crawlGroupBy').value === 'tag') {
      return lab.tags && lab.tags.length ? `${insights.getArea(lab.tags[0]).icon} ${insights.getArea(lab.tags[0]).label}` : '分野タグなし';
    }
    return lab.field || 'その他（分野の見出しなし）';
  }

  function renderCrawlResults() {
    const result = crawlState.result;
    const wrap = $('crawlResults');
    if (!result) return;
    $('crawlLabCount').textContent = result.labs.length;
    $('btnImportCrawl').disabled = crawlState.selected.size === 0;
    $('btnImportCrawl').textContent = `選択した研究室（${crawlState.selected.size}件）を解析結果に読み込む`;
    if (result.labs.length === 0) {
      wrap.innerHTML = '<div class="text-dim">研究室は見つかりませんでした。</div>';
      return;
    }

    const groups = new Map();
    result.labs.forEach((lab, i) => {
      const key = crawlGroupKey(lab);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    const ordered = [...groups.entries()].sort((a, b) => {
      const other = (k) => /^その他|なし$/.test(k);
      return other(a[0]) - other(b[0]) || b[1].length - a[1].length;
    });

    wrap.innerHTML = ordered.map(([key, idxs]) => {
      const allOn = idxs.every(i => crawlState.selected.has(i));
      return `
        <div class="crawl-group">
          <label class="crawl-group-head">
            <input type="checkbox" data-group="${escapeHtml(key)}" ${allOn ? 'checked' : ''}>
            <strong>${escapeHtml(key)}</strong> <span class="text-dim">${idxs.length}件</span>
          </label>
          ${idxs.map(i => renderCrawlLab(result.labs[i], i)).join('')}
        </div>`;
    }).join('');
  }

  function renderCrawlLab(lab, i) {
    const sources = lab.sources.map(s => `<span class="src-badge src-${s}">${s === 'slm' ? 'SLM' : 'ルール'}</span>`).join('');
    const tags = (lab.tags || []).slice(0, 3).map(k => {
      const a = insights.getArea(k);
      return `<span class="tag-chip">${a.icon} ${escapeHtml(a.label)}</span>`;
    }).join('');
    const sub = [lab.professor, lab.topic].filter(Boolean).join(' ・ ');
    return `
      <label class="crawl-lab${lab.offField ? ' off-field' : ''}" title="${escapeHtml((lab.reasons || []).join('、'))}">
        <input type="checkbox" data-lab-idx="${i}" ${crawlState.selected.has(i) ? 'checked' : ''}>
        <div class="crawl-lab-body">
          <div class="crawl-lab-title">
            <strong>${escapeHtml(lab.name)}</strong>
            ${lab.derived ? '<span class="mini-badge">教員名から推定</span>' : ''}
            ${lab.offField ? '<span class="mini-badge mini-warn">情報系以外?</span>' : ''}
            ${sources}
            <span class="conf">${Math.round(lab.confidence * 100)}%</span>
            ${lab.url ? `<a href="${escapeHtml(lab.url)}" target="_blank" rel="noopener" title="${escapeHtml(lab.url)}">🔗</a>` : ''}
          </div>
          ${sub ? `<div class="crawl-lab-sub">${escapeHtml(truncate(sub, 110))}</div>` : ''}
          ${lab.description ? `<div class="crawl-lab-desc">${escapeHtml(truncate(lab.description, 120))}</div>` : ''}
          ${tags ? `<div>${tags}</div>` : ''}
        </div>
      </label>`;
  }

  $('crawlResults').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.labIdx !== undefined) {
      const i = Number(t.dataset.labIdx);
      if (t.checked) crawlState.selected.add(i);
      else crawlState.selected.delete(i);
      renderCrawlResults();
    } else if (t.dataset.group !== undefined) {
      crawlState.result.labs.forEach((lab, i) => {
        if (crawlGroupKey(lab) !== t.dataset.group) return;
        if (t.checked) crawlState.selected.add(i);
        else crawlState.selected.delete(i);
      });
      renderCrawlResults();
    }
  });

  $('crawlGroupBy').addEventListener('change', () => renderCrawlResults());
  $('btnCrawlSelectAll').addEventListener('click', () => {
    if (!crawlState.result) return;
    crawlState.result.labs.forEach((_, i) => crawlState.selected.add(i));
    renderCrawlResults();
  });
  $('btnCrawlSelectNone').addEventListener('click', () => {
    crawlState.selected.clear();
    renderCrawlResults();
  });

  $('btnImportCrawl').addEventListener('click', () => {
    const result = crawlState.result;
    if (!result || crawlState.selected.size === 0) return;
    const labs = [...crawlState.selected].sort((a, b) => a - b).map(i => crawlItemToLab(result.labs[i]));
    const university = { ...parser.getEmptyResult().university, ...result.university };
    fillForm({ university, admissions: result.admissions, labs, events: result.events });
    if (!university.url) uniInputs.url.value = $('crawlStartUrl').value;
    closeModal('crawlModal');
    showToast(`研究室 ${labs.length}件 を読み込みました。内容を確認して「大学・研究室を保存」を押してください`, 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // =========================================================
  // モーダル共通
  // =========================================================
  function openModal(id) {
    $(id).classList.remove('hidden');
  }

  function closeModal(id) {
    $(id).classList.add('hidden');
    if (id === 'labModal') openLabId = null;
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => closeModal(m.id));
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-modal]')) {
      closeModal(e.target.closest('.modal-overlay').id);
    } else if (e.target.classList.contains('modal-overlay')) {
      closeModal(e.target.id);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  // =========================================================
  // ユーティリティ
  // =========================================================
  function formatTrack(adm) {
    if (!adm) return '';
    return ADM_FIELDS.filter(f => adm[f.key]).map(f => `【${f.label}】${adm[f.key]}`).join('\n');
  }

  function checklistProgress(lab) {
    const done = insights.visitQuestions.filter(q => (lab.checklist || {})[q.key]).length;
    return done ? `${done}/${insights.visitQuestions.length}` : '';
  }

  function trackLabel(track) {
    return parser.admissionTracks[track]?.label || 'その他';
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysLeft(dateStr) {
    const target = new Date(`${dateStr}T00:00:00`);
    const today = new Date(`${todayStr()}T00:00:00`);
    return Math.round((target - today) / 86400000);
  }

  function daysLeftLabel(dateStr) {
    const n = daysLeft(dateStr);
    if (n < 0) return '終了';
    if (n === 0) return '今日';
    return `あと${n}日`;
  }

  function formatDateShort(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `${m}/${d}`;
  }

  function dateStamp() {
    return todayStr().replace(/-/g, '');
  }

  function truncate(str, max) {
    const s = String(str || '').replace(/\s*\n\s*/g, ' ');
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function linkify(str) {
    return escapeHtml(str).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // --- 永続化 (LocalStorage) ---
  function loadJson(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveUniversities() {
    localStorage.setItem(STORAGE_KEY_UNIVERSITIES, JSON.stringify(universities));
  }

  function saveCompare() {
    localStorage.setItem(STORAGE_KEY_COMPARE, JSON.stringify(compareIds));
  }

  // --- トースト通知 ---
  function showToast(message, type = 'info') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
