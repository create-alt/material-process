/* 高専コマナビ — 時間割 / 科目・評価 */
'use strict';

const CAT_ORDER = ['sci', 'lang', 'hum', 'pe', 'art', 'com', 'base', 'app', 'custom'];
function sortSubjects(list) {
  return list.slice().sort((a, b) => CAT_ORDER.indexOf(catOf(a)) - CAT_ORDER.indexOf(catOf(b)) || a.code.localeCompare(b.code));
}
function shortTeachers(s) {
  if (!s.teachers || !s.teachers.length) return '';
  const fam = s.teachers.map(t => t.split(/[\s　]/)[0]);
  return fam.slice(0, 2).join('・') + (fam.length > 2 ? ' ほか' : '');
}
function paletteSubjects() {
  const { grade, term } = state.profile;
  return sortSubjects(offeredSubjects(grade).filter(s => inTerm(s, term)));
}

/* ---------------------------------------------------------------- 時間割 */
PAGES.timetable = () => {
  const { grade, term, course } = state.profile;
  const tt = ttPeek(grade, term);
  const { days, periods, times } = state.settings;
  const today = todayYmd();
  const todayDow = termOfDate(today) === term ? dowIndex(today) : -1;
  const subs = paletteSubjects();
  const enrolled = subs.filter(s => isEnrolled(s, grade));
  const others = subs.filter(s => !isEnrolled(s, grade));

  let grid = '<div class="tt-head"></div>' + DAY_NAMES.slice(0, days).map((d, i) => `<div class="tt-head${i === todayDow ? ' today' : ''}">${d}</div>`).join('');
  for (let p = 0; p < periods; p++) {
    const t = times[p] || ['', ''];
    grid += `<div class="tt-time"><b>${p + 1}</b><span>${esc(t[0])}</span><span>${esc(t[1])}</span></div>`;
    for (let d = 0; d < days; d++) {
      const k = d + '-' + p, c = tt[k], s = c && subj(c.sid);
      const picked = UI.pick && UI.pick.cell === k;
      if (s) {
        grid += `<button class="cell filled c-${catOf(s)}${picked ? ' picked' : ''}" draggable="true" data-act="cell" data-k="${k}" title="${esc(s.name)}（ドラッグで移動・クリックで詳細）">
          <span class="nm">${esc(s.name)}</span><span class="sub">${esc(c.room || shortTeachers(s))}</span>${c.note ? `<span class="sub">${esc(c.note)}</span>` : ''}</button>`;
      } else {
        grid += `<button class="cell empty-cell${UI.pick ? ' target' : ''}" data-act="cell" data-k="${k}" aria-label="${DAY_NAMES[d]}曜${p + 1}限（空き）">＋</button>`;
      }
    }
  }

  const chip = s => {
    const n = placedCount(grade, term, s.id), exp = weeklySlots(s);
    const on = isEnrolled(s, grade);
    const cls = n === 0 ? '' : Math.abs(n - exp) < 0.51 ? 'done' : n > exp ? 'over' : '';
    return `<button class="chip c-${catOf(s)}${UI.pick && UI.pick.sid === s.id ? ' picked' : ''}${on ? '' : ' off'}" draggable="true" data-act="pal-pick" data-sid="${esc(s.id)}">
      <span class="nm">${esc(s.name)}</span>
      <span class="cnt ${cls}" title="配置したコマ数 / 週あたりの目安">${n} / ${fmtNum(round1(exp))}</span>
      <span class="sub">${s.custom ? '自作科目' : `${s.credits}単位・${s.term}・${reqLabel(s)}${s.must ? '・必修得' : ''}`}</span></button>`;
  };
  const placedTotal = Object.keys(tt).length;
  const unplaced = enrolled.filter(s => placedCount(grade, term, s.id) === 0);
  const pickS = UI.pick && UI.pick.sid ? subj(UI.pick.sid) : null;
  const pickC = UI.pick && UI.pick.cell ? subj((tt[UI.pick.cell] || {}).sid) : null;
  const banner = UI.pick ? `<div class="pick-banner"><span class="grow">${pickS ? `「${esc(pickS.name)}」を置くコマをタップしてください（続けて複数置けます）` : `「${esc(pickC ? pickC.name : '')}」の移動先のコマをタップしてください（入れ替えもできます）`}</span>
      <button class="btn sm" data-act="pick-cancel">${pickS ? '完了' : 'キャンセル'}</button></div>` : '';

  return `
    <div class="page-head">
      <div class="grow"><h2>${grade}年 ${term}の時間割</h2>
        <p>右の科目をドラッグ（スマホは科目をタップ→コマをタップ）して並べます。学年・学期ごとに自動保存されます。</p></div>
      <div class="actions">
        <button class="btn" data-act="tt-copy" title="もう一方の学期の時間割から通年科目を写します">${icon('copy')}${term === '前期' ? '後期' : '前期'}から通年科目をコピー</button>
        <button class="btn" data-act="tt-print">${icon('print')}印刷</button>
        <button class="btn danger" data-act="tt-clear">${icon('trash')}クリア</button>
      </div>
    </div>
    ${grade >= 2 && !course ? `<div class="note" style="margin-bottom:12px">${statusHtml('warning', 'コースが未選択です')} 画面上部でコースを選ぶと、コースの基盤専門科目が表示されます。</div>` : ''}
    ${grade === 1 && !offeredSubjects(1).some(s => catOf(s) === 'art' && isEnrolled(s, 1)) ? `<div class="note" style="margin-bottom:12px">${statusHtml('neutral', '芸術（音楽・美術・書道）は1科目を選ぶ選択必履修です')} 履修する科目を時間割に置くか、「科目・評価」でチェックを入れてください。</div>` : ''}
    ${grade >= 4 && !state.profile.area ? `<div class="note" style="margin-bottom:12px">${statusHtml('neutral', '応用専門の領域が未選択です')} 画面上部で領域を選ぶと、その領域の科目が履修科目に入ります。</div>` : ''}
    ${banner}
    <div class="tt-layout">
      <div class="stack">
        <div class="card tt-card"><div class="tt-grid" style="--days:${days}">${grid}</div></div>
        <div class="hint">配置済み ${placedTotal} コマ${unplaced.length ? ` ・ まだ置いていない履修科目: ${unplaced.map(s => esc(s.name)).join('、')}` : placedTotal ? ' ・ 履修科目はすべて配置済みです' : ''}</div>
      </div>
      <aside class="card palette" id="palette" aria-label="科目リスト">
        <h3>科目リスト <span class="grow"></span><button class="btn sm" data-act="custom-new">${icon('plus')}自作科目</button></h3>
        <div class="hint">右の数字は「配置コマ数 / 週あたりの目安（単位数から計算）」です。</div>
        <div class="pal-group"><h4>履修する科目 <span class="badge">${enrolled.length}</span></h4>${enrolled.map(chip).join('') || '<div class="empty">この学期の科目がありません</div>'}</div>
        ${others.length ? `<div class="pal-group"><h4>選択科目（未履修）<span class="badge">${others.length}</span></h4>
          <div class="hint" style="margin-bottom:6px">時間割に置くと履修科目に入ります。</div>${others.map(chip).join('')}</div>` : ''}
        <div class="cat-legend">${CAT_ORDER.filter(c => subs.some(s => catOf(s) === c)).map(c => `<span class="c-${c}"><i class="dot"></i>${CATS[c]}</span>`).join('')}</div>
      </aside>
    </div>`;
};

function placeSubject(sid, k) {
  const { grade, term } = state.profile;
  const s = subj(sid);
  if (!s) return;
  const tt = ttOf(grade, term);
  const same = Object.values(tt).find(c => c.sid === sid && c.room);
  tt[k] = { sid, room: same ? same.room : '', note: '' };
  if (!s.custom && !isEnrolled(s, grade)) setEnrolled(s, grade, true);
}
function moveCell(from, to) {
  if (from === to) return;
  const { grade, term } = state.profile;
  const tt = ttOf(grade, term);
  const a = tt[from], b = tt[to];
  if (a) tt[to] = a; else delete tt[to];
  if (b) tt[from] = b; else delete tt[from];
}
ACT['pal-pick'] = el => {
  const sid = el.dataset.sid;
  UI.pick = UI.pick && UI.pick.sid === sid ? null : { sid };
  renderPage();
};
ACT['pick-cancel'] = () => { UI.pick = null; renderPage(); };
ACT.cell = el => {
  const k = el.dataset.k;
  const { grade, term } = state.profile;
  const tt = ttPeek(grade, term);
  if (UI.pick && UI.pick.sid) { placeSubject(UI.pick.sid, k); commit(); return; }
  if (UI.pick && UI.pick.cell) { moveCell(UI.pick.cell, k); UI.pick = null; commit(); return; }
  if (tt[k] && subj(tt[k].sid)) return cellModal(k);
  pickerModal(k);
};
function cellLabel(k) { const [d, p] = k.split('-').map(Number); return `${DAY_NAMES[d]}曜 ${p + 1}限`; }
function cellModal(k) {
  const { grade, term } = state.profile;
  const c = ttPeek(grade, term)[k], s = subj(c.sid);
  openModal({
    title: s.name, sub: `${grade}年 ${term}・${cellLabel(k)}`,
    body: `<div class="badges">${subjBadges(s)}</div>
      <div>${evalBar(s)}</div>
      <div class="form-grid">
        <label class="field">教室<input type="text" value="${esc(c.room || '')}" data-chg="cell-f" data-k="${k}" data-f="room" placeholder="例: 2-1教室、実習工場"></label>
        <label class="field">メモ<input type="text" value="${esc(c.note || '')}" data-chg="cell-f" data-k="${k}" data-f="note" placeholder="例: 隔週、持ち物"></label>
      </div>`,
    foot: `<button class="btn danger" data-act="cell-del" data-k="${k}">${icon('trash')}このコマを空にする</button><span class="grow"></span>
      <button class="btn" data-act="cell-move" data-k="${k}">${icon('move')}移動する</button>
      <button class="btn primary" data-act="subject" data-sid="${esc(s.id)}">${icon('book')}シラバス・評価を見る</button>`,
    onClose: () => renderPage(),
  });
}
function pickerModal(k) {
  const { grade } = state.profile;
  const subs = paletteSubjects();
  const row = s => `<button class="chip c-${catOf(s)}${isEnrolled(s, grade) ? '' : ' off'}" data-act="pick-into" data-k="${k}" data-sid="${esc(s.id)}">
      <span class="nm">${esc(s.name)}</span><span class="cnt">${placedCount(grade, state.profile.term, s.id)} / ${fmtNum(round1(weeklySlots(s)))}</span>
      <span class="sub">${s.custom ? '自作科目' : `${s.credits}単位・${s.term}・${reqLabel(s)}`}</span></button>`;
  openModal({
    title: cellLabel(k) + ' に置く科目', sub: `${grade}年 ${state.profile.term}`,
    body: subs.length ? `<div>${subs.map(row).join('')}</div>` : '<div class="empty"><b>科目がありません</b>学年・コースの設定を確認してください。</div>',
  });
}
ACT['pick-into'] = el => { placeSubject(el.dataset.sid, el.dataset.k); closeModal(); commit(); };
CHG['cell-f'] = el => {
  const { grade, term } = state.profile;
  const c = ttOf(grade, term)[el.dataset.k];
  if (!c) return;
  c[el.dataset.f] = el.value.trim();
  if (el.dataset.f === 'room') for (const o of Object.values(ttOf(grade, term))) if (o.sid === c.sid && !o.room) o.room = c.room;
  saveState();
};
ACT['cell-del'] = el => { const { grade, term } = state.profile; delete ttOf(grade, term)[el.dataset.k]; modalOnClose = null; closeModal(); commit('コマを空にしました'); };
ACT['cell-move'] = el => { UI.pick = { cell: el.dataset.k }; modalOnClose = null; closeModal(); renderPage(); };
ACT['tt-print'] = () => window.print();
ACT['tt-clear'] = () => {
  const { grade, term } = state.profile;
  if (!Object.keys(ttPeek(grade, term)).length) return toast('時間割は空です');
  if (!confirm(`${grade}年 ${term}の時間割をすべて空にしますか？（出席や課題の記録は消えません）`)) return;
  state.tt[ttKey(grade, term)] = {};
  commit('時間割をクリアしました');
};
ACT['tt-copy'] = () => {
  const { grade, term } = state.profile;
  const other = term === '前期' ? '後期' : '前期';
  const src = ttPeek(grade, other), dst = ttOf(grade, term);
  let n = 0;
  for (const [k, c] of Object.entries(src)) {
    const s = subj(c.sid);
    if (!s || !inTerm(s, term) || s.term === other) continue;
    if (s.term !== '通年' && !s.custom) continue;
    if (!dst[k]) { dst[k] = Object.assign({}, c); n++; }
  }
  commit(n ? `${other}から ${n} コマをコピーしました` : `${other}の時間割にコピーできる通年科目がありません`);
};

/* 自作科目 */
ACT['custom-new'] = () => {
  openModal({
    title: '自作科目を追加', sub: 'HR・特別活動・補習・部活など、シラバスにない予定を時間割に置けます',
    body: `<div class="form-grid">
        <label class="field full">名前<input type="text" id="cu-name" placeholder="例: HR、特別活動"></label>
        <label class="field">期間<select id="cu-term"><option>通年</option><option>前期</option><option>後期</option></select></label>
        <label class="field">総授業時間数（単位時間）<input type="number" id="cu-hours" value="30" min="1" max="400"></label>
      </div><p class="hint">自作科目は単位の集計には含めません（出席の記録はできます）。</p>`,
    foot: '<button class="btn" data-act="modal-close">キャンセル</button><button class="btn primary" data-act="custom-save">追加</button>',
  });
  setTimeout(() => { const e = $('#cu-name'); if (e) e.focus(); }, 30);
};
ACT['custom-save'] = () => {
  const name = $('#cu-name').value.trim();
  if (!name) return toast('名前を入力してください');
  state.custom.push({ id: uid('c-'), name, grades: [state.profile.grade], term: $('#cu-term').value, hours: Number($('#cu-hours').value) || 30 });
  registerCustom(); closeModal(); commit('自作科目を追加しました');
};
ACT['custom-del'] = el => {
  const sid = el.dataset.sid;
  if (!confirm('この自作科目と、その時間割・出席・課題の記録を削除しますか？')) return;
  state.custom = state.custom.filter(c => c.id !== sid);
  for (const tt of Object.values(state.tt)) for (const [k, c] of Object.entries(tt)) if (c.sid === sid) delete tt[k];
  delete state.att[sid]; delete state.memo[sid]; delete state.hoursOv[sid]; delete state.comps[sid];
  state.items = state.items.filter(i => i.sid !== sid);
  registerCustom(); modalOnClose = null; closeModal(); commit('削除しました');
};

/* ドラッグ＆ドロップ（マウス操作） */
function initDnD() {
  let drag = null;
  document.addEventListener('dragstart', e => {
    const chip = e.target.closest && e.target.closest('.chip[data-sid]');
    const cell = e.target.closest && e.target.closest('.cell.filled[data-k]');
    if (UI.page !== 'timetable' || (!chip && !cell)) return;
    drag = chip ? { sid: chip.dataset.sid } : { cell: cell.dataset.k };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', JSON.stringify(drag)); } catch (err) { /* noop */ }
    if (cell) setTimeout(() => cell.classList.add('dragging'), 0);
  });
  document.addEventListener('dragover', e => {
    if (!drag) return;
    const cell = e.target.closest && e.target.closest('.cell[data-k]');
    const pal = e.target.closest && e.target.closest('#palette');
    if (cell || (pal && drag.cell)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    $$('.cell.drop-ok').forEach(c => { if (c !== cell) c.classList.remove('drop-ok'); });
    if (cell) cell.classList.add('drop-ok');
  });
  document.addEventListener('drop', e => {
    if (!drag) return;
    const cell = e.target.closest && e.target.closest('.cell[data-k]');
    const pal = e.target.closest && e.target.closest('#palette');
    if (cell) {
      e.preventDefault();
      if (drag.sid) placeSubject(drag.sid, cell.dataset.k); else moveCell(drag.cell, cell.dataset.k);
      drag = null; UI.pick = null; commit();
    } else if (pal && drag.cell) {
      e.preventDefault();
      const { grade, term } = state.profile;
      delete ttOf(grade, term)[drag.cell];
      drag = null; commit('コマを空にしました');
    }
  });
  document.addEventListener('dragend', () => { drag = null; $$('.cell.drop-ok, .cell.dragging').forEach(c => c.classList.remove('drop-ok', 'dragging')); });
}

/* ---------------------------------------------------------------- 科目・評価 */
function subjectRows() {
  const g = state.profile.grade;
  const q = UI.subjQuery.trim().toLowerCase();
  let list;
  if (UI.subjScope === 'all') list = allSubjects().filter(s => !s.custom);
  else if (UI.subjScope === 'enrolled') list = enrolledSubjects(g);
  else list = offeredSubjects(g);
  if (q) list = list.filter(s => (s.name + ' ' + s.en + ' ' + s.teachers.join(' ') + ' ' + s.code + ' ' + s.field).toLowerCase().includes(q));
  list = list.slice().sort((a, b) => a.grades[0] - b.grades[0] || CAT_ORDER.indexOf(catOf(a)) - CAT_ORDER.indexOf(catOf(b)) || a.code.localeCompare(b.code) || (a.course || '').localeCompare(b.course || ''));
  if (!list.length) return '<div class="empty"><b>該当する科目がありません</b>検索語や表示範囲を変えてみてください。</div>';
  const showGrade = UI.subjScope === 'all';
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr>${showGrade ? '<th>学年</th>' : '<th>履修</th>'}<th>科目</th><th class="r">単位</th><th>期間</th><th>試験</th><th style="min-width:260px">成績のつけ方（配分）</th><th>担当</th></tr></thead>
    <tbody>${list.map(s => {
    const comps = compsOf(s);
    const can = !showGrade && isOffered(s, g) && s.req !== 'R' && !s.custom;
    const first = showGrade
      ? `<td class="nowrap">${s.grades.join('・')}年${s.course ? `<div class="small muted">${COURSES[s.course]}</div>` : s.area ? `<div class="small muted">${s.area}</div>` : ''}</td>`
      : `<td>${can ? `<input type="checkbox" data-chg="enroll-row" data-sid="${esc(s.id)}" ${isEnrolled(s, g) ? 'checked' : ''} aria-label="履修する">` : '<span class="faint small">必</span>'}</td>`;
    return `<tr>${first}
        <td>${subjName(s)}<div class="small muted">${reqLabel(s)}${s.must ? '・<b>必修得</b>' : ''}・${esc(s.ctype || '')}・${esc(s.form || '')}</div></td>
        <td class="r">${s.credits || '—'}</td><td class="nowrap">${esc(s.term)}</td>
        <td><div class="badges">${examBadges(s)}</div></td>
        <td>${evalBar(s, { thin: true, noLegend: true })}<div class="small muted" style="margin-top:3px">${comps.map(c => `${esc(c.label)} ${fmtNum(c.w)}%`).join(' ／ ')}</div></td>
        <td class="small">${esc(shortTeachers(s))}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
PAGES.subjects = () => {
  const g = state.profile.grade;
  const seg = (v, label) => `<button data-act="subj-scope" data-v="${v}" aria-pressed="${UI.subjScope === v}">${label}</button>`;
  return `
    <div class="page-head">
      <div class="grow"><h2>科目・成績のつけ方</h2><p>試験の有無と評価配分を一覧で確認できます。科目名を押すとシラバスの全文が開きます。</p></div>
      <div class="actions">
        <input type="search" id="subj-q" placeholder="科目名・教員名で検索" value="${esc(UI.subjQuery)}" aria-label="科目を検索">
        <div class="seg">${seg('grade', g + '年の全科目')}${seg('enrolled', '履修中')}${seg('all', '全学年')}</div>
      </div>
    </div>
    <div class="card">
      <div class="legend" style="margin-bottom:10px">${KIND_ORDER.map(k => `<span class="k-${k}"><i class="dot"></i>${KINDS[k]}</span>`).join('')}</div>
      <div id="subj-table">${subjectRows()}</div>
    </div>
    <p class="hint" style="margin-top:10px">出典: <a href="${esc(window.SYLLABUS_META.source)}" target="_blank" rel="noopener">2026年度シラバス（本科）</a> の PDF から ${window.SYLLABUS_META.count} 科目を抽出。配分は授業で先生が示す内容を優先し、違っていたら科目詳細の「配分を編集」で直してください。</p>`;
};
ACT['subj-scope'] = el => { UI.subjScope = el.dataset.v; renderPage(); };
CHG['enroll-row'] = el => { setEnrolled(subj(el.dataset.sid), state.profile.grade, el.checked); saveState(); toast(el.checked ? '履修科目に追加しました' : '履修科目から外しました'); };
