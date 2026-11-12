/* 高専コマナビ — ui: 画面の枠・共通部品・科目詳細 */
'use strict';

const UI = {
  page: 'home',
  pick: null,              // 時間割で選択中: {sid} または {cell:'曜-限'}
  attDate: todayYmd(),
  subjQuery: '', subjScope: 'grade', subjView: 'eval',
  taskFilter: 'open', taskSubject: '',
  gradeScope: 'term',
  compDraft: null,
  itemDraft: null,
};
const ACT = {};   // data-act   (click)
const CHG = {};   // data-chg   (change)
const PAGES = {}; // ページ描画関数

const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M9 8h6"/>',
  att: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 11h6M9 15h4"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16l4-5 3 3 4-7"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="M9 13l-2 8 5-3 5 3-2-8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.5a7 7 0 0 0-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  stop: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8M16 8l-8 8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  down: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  move: '<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
function icon(n) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';
}
const STATUS_ICON = { good: 'ok', warning: 'alert', serious: 'alert', critical: 'stop', neutral: 'info' };
function statusHtml(cls, label, wrap) {
  return `<span class="status ${cls}${wrap ? ' wrap' : ''}">${icon(STATUS_ICON[cls] || 'info')}${esc(label)}</span>`;
}

const NAV = [
  ['home', 'ホーム', 'home'], ['timetable', '時間割', 'grid'], ['subjects', '科目・評価', 'book'], ['attendance', '出席', 'att'],
  ['tasks', '課題・試験', 'task'], ['grades', '成績予測', 'chart'], ['credits', '単位・進級', 'award'], ['settings', '設定', 'gear'],
];

/* ---------------------------------------------------------------- shell */
function renderShell() {
  const p = state.profile;
  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
  $('#appbar').innerHTML = `
    <div class="brand">
      <div class="brand-mark">${icon('grid')}</div>
      <div><div class="brand-name">高専コマナビ</div><div class="brand-sub">大阪公立大学高専 2026年度シラバス対応</div></div>
    </div>
    <div class="ctx">
      <select data-chg="grade" aria-label="学年">${[1, 2, 3, 4, 5].map(g => opt(g, g + '年', p.grade)).join('')}</select>
      ${p.grade >= 2 ? `<select data-chg="course" aria-label="コース">${opt('', 'コース未選択', p.course)}${Object.entries(COURSES).map(([k, v]) => opt(k, v, p.course)).join('')}</select>` : ''}
      ${p.grade >= 4 ? `<select data-chg="area" aria-label="応用専門の領域">${opt('', '領域未選択', p.area)}${Object.keys(AREAS).map(a => opt(a, a + '領域', p.area)).join('')}</select>` : ''}
      <div class="seg" role="group" aria-label="学期">${TERMS.map(t => `<button data-act="term" data-v="${t}" aria-pressed="${p.term === t}">${t}</button>`).join('')}</div>
    </div>`;
  const over = state.items.filter(i => i.type === 'task' && isOpenTask(i) && i.due && i.due < todayYmd()).length;
  $('#nav').innerHTML = NAV.map(([id, label, ic]) =>
    `<button data-act="nav" data-v="${id}" ${UI.page === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${id === 'tasks' && over ? `<span class="badge count">${over}</span>` : ''}</button>`).join('');
}
function renderPage() {
  const fn = PAGES[UI.page] || PAGES.home;
  $('#page').innerHTML = fn();
  if (PAGES[UI.page + ':after']) PAGES[UI.page + ':after']();
}
function renderAll() { applyTheme(); renderShell(); renderPage(); }
function commit(msg) {
  const ok = saveState();
  renderAll();
  if (!ok) toast('保存できませんでした（ブラウザの保存容量を確認してください）');
  else if (msg) toast(msg);
}
function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
function go(page) { UI.page = page; UI.pick = null; renderAll(); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + page); } catch (e) { /* file:// でも動くように無視 */ } }

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------------------------------------------------------------- modal */
let modalOnClose = null;
function openModal({ title, sub, body, foot, wide, onClose }) {
  modalOnClose = onClose || null;
  $('#modal-root').innerHTML = `
    <div class="modal-back" data-act="modal-back">
      <div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><div class="grow"><h3>${esc(title)}</h3>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>
          <button class="btn ghost icon" data-act="modal-close" aria-label="閉じる">${icon('x')}</button></div>
        <div class="modal-body">${body}</div>
        ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
      </div>
    </div>`;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  const f = modalOnClose; modalOnClose = null;
  if (f) f();
}
function modalOpen() { return !!$('#modal-root').firstElementChild; }
ACT['modal-close'] = () => closeModal();
ACT['modal-back'] = (el, e) => { if (e.target === el) closeModal(); };

/* ---------------------------------------------------------------- 共通部品 */
function subjName(s, cls) {
  return `<span class="subj-name c-${catOf(s)}"><span class="dot"></span><button class="linklike ${cls || ''}" data-act="subject" data-sid="${esc(s.id)}">${esc(s.name)}</button></span>`;
}
function evalBar(s, opts) {
  opts = opts || {};
  const comps = compsOf(s);
  const sum = comps.reduce((a, c) => a + (Number(c.w) || 0), 0) || 1;
  const bar = `<div class="stackbar${opts.thin ? ' thin' : ''}" role="img" aria-label="評価配分: ${esc(comps.map(c => c.label + ' ' + fmtNum(c.w) + '%').join('、'))}">${comps.map(c =>
    `<span class="k-${c.kind || 'other'}" style="flex:${c.w / sum}" title="${esc(c.label)} ${fmtNum(c.w)}%"></span>`).join('')}</div>`;
  if (opts.noLegend) return bar;
  return bar + `<div class="legend" style="margin-top:6px">${comps.map(c =>
    `<span class="k-${c.kind || 'other'}"><i class="dot"></i>${esc(c.label)} <b>${fmtNum(c.w)}%</b></span>`).join('')}</div>`;
}
function examBadges(s) {
  if (s.custom) return '';
  if (s.passfail) return '<span class="badge outline">合否判定</span>';
  const comps = compsOf(s);
  const hasExam = comps.some(c => c.kind === 'exam') || s.exam.any;
  if (!hasExam) return '<span class="badge outline">試験なし</span>';
  const out = [];
  if (s.exam.mid) out.push('<span class="badge accent">中間試験</span>');
  if (s.exam.final) out.push('<span class="badge accent">定期試験</span>');
  if (!out.length) out.push('<span class="badge accent">試験あり</span>');
  return out.join(' ');
}
function subjBadges(s) {
  if (s.custom) return '<span class="badge">自作科目</span>';
  const b = [];
  b.push(`<span class="badge">${s.credits}単位</span>`);
  b.push(`<span class="badge${s.req === 'R' ? '' : ' outline'}">${reqLabel(s)}</span>`);
  if (s.must) b.push('<span class="badge accent" title="進級・卒業には必ず単位取得が必要な科目">必修得</span>');
  b.push(`<span class="badge outline">${esc(s.term)}</span>`);
  b.push(`<span class="badge outline">${esc(s.ctype)}</span>`);
  b.push(`<span class="badge outline">${esc(s.form)}</span>`);
  if (s.dp) b.push(`<span class="badge outline">${esc(s.dp)}</span>`);
  if (s.sdgs) b.push('<span class="badge outline">SDGs科目</span>');
  return b.join(' ');
}
function meter(ratio, cls, extra) {
  return `<div class="meter ${cls || 'm-accent'} ${extra || ''}"><i style="width:${clamp(ratio, 0, 1) * 100}%"></i></div>`;
}
function attSummaryHtml(a) {
  const lv = ATT_LEVEL[a.level];
  const msg = a.level === 'fail' ? `上限を ${a.absentSlots - a.maxAbsSlots} コマ超過`
    : a.remainSlots <= 0 ? 'これ以上休めません' : `あと ${a.remainSlots} コマ休める`;
  return `<div class="row" style="gap:6px 12px">${statusHtml(lv.cls, lv.label)}<span class="small muted num">欠課 ${a.absentSlots} / 上限 ${a.maxAbsSlots} コマ・${msg}</span></div>`;
}
function isOpenTask(i) { return i.status === 'todo' || i.status === 'doing'; }
const TASK_STATUS = { todo: '未着手', doing: '作業中', done: '提出済み', late: '遅れて提出', missed: '未提出（0点扱い）' };
const ITEM_TYPES = { task: '課題・レポート', quiz: '小テスト', exam: '試験' };

/* ---------------------------------------------------------------- 科目詳細 */
function showSubject(sid) {
  const s = subj(sid);
  if (!s) return;
  const g = state.profile.grade;
  const a = attStats(s);
  const unit = state.settings.unit;
  const offered = s.custom || isOffered(s, g);
  const enrolled = offered && isEnrolled(s, g);
  const self = selfStudyWeekly(s);
  const left = enrolled ? remainingSlots(s, g) : 0;
  const sec = (title, text) => text ? `<details><summary>${title}</summary><div class="prose">${nl2br(text)}</div></details>` : '';
  const plan = s.plan && s.plan.length ? `<details><summary>授業の内容（${s.plan.length}項目）</summary><div class="table-wrap"><table class="tbl">
      <thead><tr><th>項目</th><th class="r">時間</th><th>授業内容</th></tr></thead><tbody>${s.plan.map(r =>
    `<tr><td>${esc(r[0])}</td><td class="r">${r[1] || ''}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  const recs = Object.entries(attOf(s.id)).sort((x, y) => x[0] < y[0] ? 1 : -1);
  const body = `
    <div class="badges">${subjBadges(s)}</div>
    ${s.custom ? '' : `<dl class="kv">
      <dt>担当教員</dt><dd>${esc(s.teachers.join('、')) || '—'}</dd>
      <dt>対象</dt><dd>${s.grades.join('・')}年 ${s.course ? COURSES[s.course] + 'コース' : '総合工学システム学科（共通）'}${s.area ? ' / ' + s.area + '領域' : s.domain ? ' / ' + s.domain + '分野' : ''}</dd>
      <dt>科目コード</dt><dd>${esc(s.code)} ・ ${esc(s.field)}</dd>
    </dl>`}
    ${offered && s.req !== 'R' && !s.custom ? `<label class="check"><input type="checkbox" data-chg="enroll" data-sid="${esc(s.id)}" ${enrolled ? 'checked' : ''}> ${g}年で履修する（${reqLabel(s)}科目）</label>` : ''}
    <div class="card" style="padding:12px">
      <h3>成績のつけ方 <span class="grow"></span>${examBadges(s)}</h3>
      ${evalBar(s)}
      ${s.evalText ? `<div class="prose muted" style="margin-top:8px">${nl2br(s.evalText)}</div>` : ''}
      <div class="row" style="margin-top:8px">
        <span class="hint grow">${state.comps[s.id] ? '配分を自分で編集しています。' : s.compsSrc === 'manual' ? 'シラバスの文章から読み取って整理した配分です。' : s.compsSrc === 'none' ? 'シラバスに配分の記載がないため「総合評価100%」としています。' : 'シラバスの記載から自動で抽出した配分です。'}</span>
        <button class="btn sm" data-act="edit-comps" data-sid="${esc(s.id)}">${icon('edit')}配分を編集</button>
      </div>
    </div>
    <div class="card" style="padding:12px">
      <h3>出席の条件</h3>
      <div class="prose">総授業時間数 <b class="num">${fmtNum(a.total)}</b> 単位時間（${fmtNum(a.totalSlots)} コマ）。
      2/3 以上の出席が必要なので、欠課できるのは <b class="num">${a.maxAbsH}</b> 単位時間（${a.maxAbsSlots} コマ）までです。</div>
      <div style="margin:8px 0 6px">${meter(a.used, 'm-' + ATT_LEVEL[a.level].cls)}</div>
      ${attSummaryHtml(a)}
      ${left ? `<div class="hint" style="margin-top:4px">時間割と学年暦から数えると、明日以降の授業は あと約 ${left} コマです。</div>` : ''}
      <div class="row" style="margin-top:8px"><label class="check small">総授業時間数を修正 <input type="number" min="1" max="400" value="${fmtNum(a.total)}" data-chg="hours" data-sid="${esc(s.id)}"> 単位時間</label>
      ${s.planHours && s.planHours !== s.hours ? `<span class="hint">※シラバスの授業計画の合計は ${s.planHours} 時間</span>` : ''}</div>
      ${self > 0 ? `<div class="note" style="margin-top:8px">学修単位の科目です。1単位＝45時間の学修が前提なので、授業外学習の目安は <b>週 約${fmtNum(round1(self))}時間</b> です。</div>` : ''}
    </div>
    ${sec('授業概要', s.overview)}${sec('授業の進め方', s.method)}${sec('科目の達成目標', s.goals)}${plan}
    ${sec('授業時間外の学習', s.outside)}${sec('履修上の注意点', s.notes)}
    ${sec('教科書・参考書・関連科目', [s.books && '【教科書等】' + s.books, s.refs && '【参考書】' + s.refs, s.related && '【関連科目】' + s.related].filter(Boolean).join('\n'))}
    ${recs.length ? `<details><summary>出席の記録（${recs.length}件）</summary><div class="list">${recs.map(([k, v]) => {
    const [d, p] = k.split('#');
    return `<div class="li"><div class="grow"><span class="num">${fmtDate(d, true)}</span> <span class="muted">${Number(p) + 1}限</span></div><span class="badge">${ATT[v].label}</span>
          <button class="btn ghost icon sm" data-act="att-del" data-sid="${esc(s.id)}" data-key="${esc(k)}" aria-label="削除">${icon('trash')}</button></div>`;
  }).join('')}</div></details>` : ''}
    <label class="field">メモ（先生のコメント、持ち物など）<textarea data-chg="memo" data-sid="${esc(s.id)}" placeholder="自由にメモできます">${esc(state.memo[s.id] || '')}</textarea></label>`;
  openModal({
    title: s.name, sub: esc(s.en || ''), body, wide: true,
    foot: `${s.custom ? `<button class="btn danger" data-act="custom-del" data-sid="${esc(s.id)}">${icon('trash')}この科目を削除</button>` : ''}<span class="grow"></span>
      <button class="btn" data-act="item-new" data-sid="${esc(s.id)}">${icon('plus')}課題・試験を追加</button>
      <button class="btn primary" data-act="modal-close">閉じる</button>`,
    onClose: () => renderAll(),
  });
}
ACT.subject = el => showSubject(el.dataset.sid);
CHG.enroll = el => { const s = subj(el.dataset.sid); setEnrolled(s, state.profile.grade, el.checked); saveState(); toast(el.checked ? '履修科目に追加しました' : '履修科目から外しました'); };
CHG.memo = el => { const v = el.value.trim(); if (v) state.memo[el.dataset.sid] = v; else delete state.memo[el.dataset.sid]; saveState(); };
CHG.hours = el => {
  const s = subj(el.dataset.sid), v = Number(el.value);
  if (!(v > 0)) return;
  if (v === s.hours && !s.custom) delete state.hoursOv[s.id]; else state.hoursOv[s.id] = v;
  saveState(); showSubject(s.id);
};
ACT['att-del'] = el => { setAtt(el.dataset.sid, el.dataset.key, null); saveState(); showSubject(el.dataset.sid); };

/* ---------------------------------------------------------------- 評価配分の編集 */
function editComps(sid) {
  const s = subj(sid);
  UI.compDraft = { sid, rows: compsOf(s).map(c => ({ label: c.label, w: c.w, kind: c.kind || 'other' })) };
  renderCompEditor();
}
function renderCompEditor() {
  const d = UI.compDraft, s = subj(d.sid);
  const sum = d.rows.reduce((a, r) => a + (Number(r.w) || 0), 0);
  const body = `
    <p class="hint">先生から配分の変更や詳しい内訳を聞いたら、ここで直せます。課題・試験の記録はこの項目に紐づけて集計します。</p>
    <div class="stack" style="gap:6px">${d.rows.map((r, i) => `
      <div class="comp-edit">
        <input type="text" value="${esc(r.label)}" data-chg="comp-f" data-i="${i}" data-f="label" aria-label="項目名">
        <input type="number" min="0" max="100" step="0.5" value="${esc(r.w)}" data-chg="comp-f" data-i="${i}" data-f="w" aria-label="配分(%)">
        <select data-chg="comp-f" data-i="${i}" data-f="kind" aria-label="種別">${KIND_ORDER.map(k => `<option value="${k}"${r.kind === k ? ' selected' : ''}>${KINDS[k]}</option>`).join('')}</select>
        <button class="btn ghost icon" data-act="comp-del" data-i="${i}" aria-label="削除">${icon('trash')}</button>
      </div>`).join('')}</div>
    <div class="row"><button class="btn sm" data-act="comp-add">${icon('plus')}項目を追加</button><span class="grow"></span>
      ${Math.abs(sum - 100) < 0.01 ? statusHtml('good', '合計 100%') : statusHtml('warning', '合計 ' + fmtNum(sum) + '%（100%に換算して計算します）')}</div>`;
  openModal({
    title: '評価配分の編集', sub: esc(s.name), body,
    foot: `<button class="btn" data-act="comp-reset">シラバスの配分に戻す</button><span class="grow"></span>
      <button class="btn" data-act="comp-cancel">キャンセル</button><button class="btn primary" data-act="comp-save">保存</button>`,
  });
}
ACT['edit-comps'] = el => editComps(el.dataset.sid);
CHG['comp-f'] = el => { const r = UI.compDraft.rows[Number(el.dataset.i)]; r[el.dataset.f] = el.dataset.f === 'w' ? Number(el.value) || 0 : el.value; renderCompEditor(); };
ACT['comp-add'] = () => { UI.compDraft.rows.push({ label: '新しい項目', w: 0, kind: 'task' }); renderCompEditor(); };
ACT['comp-del'] = el => { UI.compDraft.rows.splice(Number(el.dataset.i), 1); renderCompEditor(); };
ACT['comp-cancel'] = () => showSubject(UI.compDraft.sid);
ACT['comp-reset'] = () => { const sid = UI.compDraft.sid; delete state.comps[sid]; saveState(); toast('シラバスの配分に戻しました'); showSubject(sid); };
ACT['comp-save'] = () => {
  const d = UI.compDraft;
  const rows = d.rows.filter(r => r.label.trim() && r.w > 0);
  if (!rows.length) return toast('配分が1つも入力されていません');
  state.comps[d.sid] = rows;
  saveState(); toast('評価配分を保存しました'); showSubject(d.sid);
};

/* ---------------------------------------------------------------- グローバル操作 */
ACT.nav = el => go(el.dataset.v);
ACT.go = el => go(el.dataset.v);
ACT.term = el => { state.profile.term = el.dataset.v; UI.pick = null; commit(); };
CHG.grade = el => { state.profile.grade = Number(el.value); UI.pick = null; commit(); };
CHG.course = el => { state.profile.course = el.value; commit(); };
CHG.area = el => { state.profile.area = el.value; commit(); };
