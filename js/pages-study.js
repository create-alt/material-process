/* 高専コマナビ — ホーム / 出席 / 課題・試験 / 成績予測 */
'use strict';

/* ---------------------------------------------------------------- 共通: 1日の授業リスト */
function slotRow(sl) {
  const st = attOf(sl.s.id)[sl.key];
  const t = state.settings.times[sl.p] || ['', ''];
  return `<div class="slot-row">
    <div class="pno">${sl.p + 1}</div>
    <div class="grow">${subjName(sl.s)}<div class="small muted">${esc(t[0])}–${esc(t[1])}${sl.cell && sl.cell.room ? ' ・ ' + esc(sl.cell.room) : ''}${sl.extra ? ' ・ 追加の記録' : ''}</div></div>
    <div class="att-btns" role="group" aria-label="${esc(sl.s.name)}の出欠">${Object.keys(ATT).map(k =>
    `<button data-act="att-set" data-sid="${esc(sl.s.id)}" data-key="${esc(sl.key)}" data-st="${k}" aria-pressed="${st === k}">${ATT[k].label}</button>`).join('')}</div>
  </div>`;
}
/* 時間割のコマ + その日に個別に追加した記録 */
function daySlots(d) {
  const slots = slotsOn(d);
  const keys = new Set(slots.map(s => s.s.id + '|' + s.key));
  for (const [sid, recs] of Object.entries(state.att)) {
    const s = subj(sid);
    if (!s) continue;
    for (const k of Object.keys(recs)) {
      if (!k.startsWith(d + '#') || keys.has(sid + '|' + k)) continue;
      slots.push({ p: Number(k.split('#')[1]), cell: null, s, key: k, extra: true });
    }
  }
  return slots.sort((a, b) => a.p - b.p);
}
ACT['att-set'] = el => {
  const { sid, key, st } = el.dataset;
  setAtt(sid, key, attOf(sid)[key] === st ? null : st);
  commit();
};

function upcomingItems(days) {
  const t = todayYmd(), lim = addDays(t, days);
  return state.items.filter(i => subj(i.sid) && i.due && ((i.type === 'task' && isOpenTask(i) && i.due <= lim) || (i.type !== 'task' && i.due >= t && i.due <= lim && i.score == null)))
    .sort((a, b) => a.due < b.due ? -1 : 1);
}
function dueHtml(i) {
  if (!i.due) return '<span class="faint">期限なし</span>';
  const n = diffDays(i.due, todayYmd());
  const open = i.type !== 'task' || isOpenTask(i);
  const cls = open && n < 0 && i.type === 'task' ? 'due-over' : open && n >= 0 && n <= 2 ? 'due-soon' : '';
  return `<span class="${cls} num">${fmtDate(i.due)}・${relDay(i.due)}</span>`;
}
function itemRow(i) {
  const s = subj(i.sid);
  const comp = i.comp >= 0 ? compsOf(s)[i.comp] : null;
  const done = i.type === 'task' && (i.status === 'done' || i.status === 'late');
  const tick = i.type === 'task'
    ? `<button class="tick ${done ? 'on' : i.status === 'missed' ? 'missed' : i.status === 'doing' ? 'doing' : ''}" data-act="item-toggle" data-id="${esc(i.id)}" aria-label="${done ? '未提出に戻す' : '提出済みにする'}" title="${TASK_STATUS[i.status]}">${icon(i.status === 'missed' ? 'x' : 'check')}</button>`
    : `<span class="badge ${i.type === 'exam' ? 'accent' : ''}">${i.type === 'exam' ? '試験' : '小テ'}</span>`;
  const links = (i.links || []).map(safeUrl).filter(Boolean);
  return `<div class="li${done ? ' done' : ''}">${tick}
    <div class="grow"><button class="linklike t" data-act="item-edit" data-id="${esc(i.id)}">${esc(i.title || '(無題)')}</button>
      <div class="m"><span class="c-${catOf(s)}" style="display:inline-flex;align-items:center;gap:5px"><i class="dot"></i>${esc(s.name)}</span>${dueHtml(i)}
        ${comp ? `<span>${esc(comp.label)}</span>` : ''}${i.type === 'task' && i.status !== 'todo' ? `<span>${TASK_STATUS[i.status]}</span>` : ''}
        ${i.score != null ? `<b class="num">${fmtNum(i.score)} / ${fmtNum(i.max)}点</b>` : ''}</div></div>
    ${links.length ? `<a class="btn ghost icon sm" href="${esc(links[0])}" target="_blank" rel="noopener" title="リンクを開く（${links.length}件）">${icon('link')}</a>` : ''}
    ${(i.photos || []).length ? `<span class="badge" title="写真 ${i.photos.length}枚">${icon('camera').replace('<svg', '<svg width="12" height="12" stroke="currentColor"')}${i.photos.length}</span>` : ''}
  </div>`;
}

/* ---------------------------------------------------------------- ホーム */
PAGES.home = () => {
  const t = todayYmd(), g = state.profile.grade, term = termOfDate(t);
  const info = dayInfo(t);
  const slots = daySlots(t);
  const subs = enrolledSubjects(g);
  const hasTT = Object.values(state.tt).some(x => Object.keys(x).length);
  const up = upcomingItems(7);
  const overdue = state.items.filter(i => subj(i.sid) && i.type === 'task' && isOpenTask(i) && i.due && i.due < t);
  const sum = creditSummary();
  const row = sum.byGrade[g];
  const risky = subs.map(s => ({ s, a: attStats(s), gs: gradeStats(s) }))
    .filter(x => x.a.level !== 'ok' || (!x.gs.fixed && x.gs.hasData && x.gs.level !== 'good') || (x.gs.fixed && x.gs.passed === false))
    .sort((a, b) => a.gs.pPass - b.gs.pPass);
  const self = subs.filter(s => inTerm(s, term)).reduce((a, s) => a + selfStudyWeekly(s), 0);
  const exams = state.settings.cal.exams.filter(x => x.from && x.to >= t).sort((a, b) => a.from < b.from ? -1 : 1);
  const nextExam = exams[0];

  const onboarding = hasTT ? '' : `<div class="card" style="margin-bottom:14px">
      <h3>はじめに</h3>
      <div class="prose">1. 画面上部で <b>学年</b>（2年以上は <b>コース</b>、4年以上は <b>領域</b>）を選びます。<br>
      2. <b>時間割</b> で科目をコマに並べます（学年・前期/後期ごとに保存されます）。<br>
      3. 毎日の <b>出席</b> と <b>課題・試験</b> を記録すると、単位取得の可能性と成績の見込みが出ます。</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-act="go" data-v="timetable">${icon('grid')}時間割を作る</button>
      <button class="btn" data-act="go" data-v="subjects">${icon('book')}科目と評価方法を見る</button></div></div>`;

  return `
    <div class="page-head"><div class="grow"><h2>${fmtDate(t, true)}</h2><p>${g}年 ${term}${info.cls ? '' : ' ・ ' + esc(info.why)}</p></div></div>
    ${onboarding}
    <div class="tiles" style="margin-bottom:14px">
      <button class="tile" data-act="go" data-v="attendance"><span class="k">今日の授業</span><span class="v">${slots.length}<small>コマ</small></span><span class="d">${slots.length ? '出欠を記録できます' : esc(info.why || (hasTT ? '授業はありません' : '時間割が未設定です'))}</span></button>
      <button class="tile" data-act="go" data-v="tasks"><span class="k">7日以内の締切・試験</span><span class="v">${up.length}<small>件</small></span><span class="d">${overdue.length ? `期限切れ ${overdue.length} 件` : '期限切れはありません'}</span></button>
      <button class="tile" data-act="go" data-v="grades"><span class="k">${g}年の単位取得見込み</span><span class="v">${fmtNum(round1(row.expect))}<small>/ ${row.plan} 単位</small></span><span class="d">確定 ${row.earned} 単位${row.assumed ? '・記録なしは取得と仮定' : ''}</span></button>
      <button class="tile" data-act="go" data-v="credits"><span class="k">${sum.need ? '進級に必要な累計' : '卒業に必要な累計'}</span><span class="v">${fmtNum(round1(sum.expect.total))}<small>/ ${sum.need || RULES.grad.total} 単位</small></span><span class="d">見込みを含む累計</span></button>
    </div>
    <div class="grid cols-2">
      <div class="card"><h3>今日の授業 <span class="grow"></span><button class="btn sm" data-act="go" data-v="attendance">出席ページへ</button></h3>
        ${slots.length ? slots.map(slotRow).join('') : `<div class="empty"><b>${info.cls ? (hasTT ? '今日の授業はありません' : '時間割がまだありません') : esc(info.why)}</b>${hasTT ? '' : '時間割を作ると、ここに今日の授業が並びます。'}</div>`}
      </div>
      <div class="card"><h3>締切・試験 <span class="grow"></span><button class="btn sm" data-act="item-new">${icon('plus')}追加</button></h3>
        ${nextExam ? `<div class="note" style="margin-bottom:6px">${icon('clock').replace('<svg', '<svg width="14" height="14" stroke="currentColor" style="vertical-align:-2px"')} ${esc(nextExam.name)}：${fmtDate(nextExam.from)}〜${fmtDate(nextExam.to)}（${nextExam.from <= t ? '実施中' : relDay(nextExam.from)}）</div>` : ''}
        ${overdue.length || up.length ? `<div class="list">${overdue.concat(up.filter(i => !overdue.includes(i))).slice(0, 8).map(itemRow).join('')}</div>` : '<div class="empty"><b>近い締切はありません</b>課題や小テストを登録すると、ここに期限順で並びます。</div>'}
      </div>
      <div class="card"><h3>注意が必要な科目</h3>
        ${risky.length ? `<div class="list">${risky.slice(0, 8).map(x => `<div class="li"><div class="grow">${subjName(x.s)}
            <div class="m">${x.a.level !== 'ok' ? statusHtml(ATT_LEVEL[x.a.level].cls, '出席: ' + ATT_LEVEL[x.a.level].label + '（欠課 ' + x.a.absentSlots + '/' + x.a.maxAbsSlots + 'コマ）') : ''}
            ${x.gs.hasData || x.gs.fixed ? statusHtml(PASS_LEVEL[x.gs.level].cls, '成績: ' + (x.gs.fixed ? (x.gs.passed ? '合格' : '不合格') : '見込み ' + Math.round(x.gs.pred) + '点')) : ''}</div></div>
            <span class="num small muted">${x.gs.noData ? '' : '可能性 ' + Math.round(x.gs.pPass * 100) + '%'}</span></div>`).join('')}</div>`
      : '<div class="empty"><b>今のところ注意が必要な科目はありません</b>出席と点数を記録すると、危ない科目を早めに知らせます。</div>'}
      </div>
      <div class="card"><h3>今学期の目安</h3>
        <dl class="kv">
          <dt>履修科目</dt><dd>${subs.filter(s => inTerm(s, term)).length} 科目（${g}年・${term}）</dd>
          <dt>授業外学習</dt><dd>${self > 0 ? `学修単位科目だけで 週 約 <b class="num">${fmtNum(round1(self))}</b> 時間` : '学修単位の科目はありません'}</dd>
          <dt>必修得科目</dt><dd>${subs.filter(s => s.must).length} 科目（落とすと進級できません）</dd>
        </dl>
        <p class="hint" style="margin-top:8px">学修単位は 1単位＝45時間の学修（授業15単位時間＋授業外学習）で計算されています。</p>
      </div>
    </div>`;
};

/* ---------------------------------------------------------------- 出席 */
PAGES.attendance = () => {
  const d = UI.attDate, g = state.profile.grade;
  const info = dayInfo(d);
  const slots = daySlots(d);
  const subs = enrolledSubjects(g);
  const ids = new Set(subs.map(s => s.id));
  for (const sid of Object.keys(state.att)) { const s = subj(sid); if (s && !ids.has(sid) && s.grades.includes(g)) { subs.push(s); ids.add(sid); } }
  const rows = sortSubjects(subs).map(s => {
    const a = attStats(s), lv = ATT_LEVEL[a.level];
    return `<tr><td>${subjName(s)}<div class="small muted">${fmtNum(a.totalSlots)}コマ（${fmtNum(a.total)}単位時間）・${esc(s.term)}</div></td>
      <td class="r">${a.cnt.P}</td><td class="r">${a.cnt.A}</td><td class="r">${a.cnt.L + a.cnt.E}</td><td class="r">${a.cnt.O}</td>
      <td style="min-width:150px"><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="grow">${meter(a.used, 'm-' + lv.cls)}</div><span class="num small nowrap">${a.absentSlots} / ${a.maxAbsSlots}</span></div></td>
      <td class="r num">${a.level === 'fail' ? '—' : Math.max(0, a.remainSlots)}</td>
      <td>${statusHtml(lv.cls, lv.label)}</td></tr>`;
  }).join('');
  return `
    <div class="page-head"><div class="grow"><h2>出席</h2><p>総授業時間数の 2/3 以上出席しないと、試験の点数にかかわらず原則 0 点になります。</p></div>
      <div class="actions"><button class="btn" data-act="att-extra">${icon('plus')}授業を追加で記録</button></div></div>
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <h3><button class="btn icon sm" data-act="att-day" data-v="-1" aria-label="前の日">${icon('left')}</button>
          <input type="date" value="${d}" data-chg="att-date" aria-label="日付">
          <button class="btn icon sm" data-act="att-day" data-v="1" aria-label="次の日">${icon('right')}</button>
          <button class="btn sm" data-act="att-day" data-v="0">今日</button><span class="grow"></span>
          ${slots.length ? `<button class="btn sm primary" data-act="att-all">${icon('check')}すべて出席</button>` : ''}</h3>
        <div class="small muted" style="margin-bottom:4px">${fmtDate(d, true)}・${g}年 ${termOfDate(d)}の時間割${info.cls ? '' : ' ・ ' + esc(info.why)}</div>
        ${slots.length ? slots.map(slotRow).join('') : `<div class="empty"><b>${dowIndex(d) >= state.settings.days ? '休日です' : 'この日の授業は時間割にありません'}</b>補講や振替授業は「授業を追加で記録」から記録できます。</div>`}
      </div>
      <div class="card">
        <h3>まとめて記録</h3>
        <p class="hint">時間割どおりに授業があった日について、まだ記録していないコマを「出席」で埋めます（土日・祝日・休業期間・試験期間は除きます）。休んだ日だけ後から直すと早く記録できます。</p>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="att-fill">${icon('check')}今日までの未記録を「出席」にする</button></div>
        <hr class="sep">
        <div class="legend">${Object.entries(ATT).map(([k, v]) => `<span><b>${v.label}</b>${k === 'A' ? '＝欠課に数える' : k === 'O' ? '＝出席扱い' : k === 'C' ? '＝数えない' : k === 'P' ? '' : state.settings.lateRatio ? `＝${state.settings.lateRatio}回で欠課1コマ` : '＝出席扱い（設定で変更可）'}</span>`).join('')}</div>
      </div>
    </div>
    <div class="card" style="margin-top:14px"><h3>科目ごとの出席状況</h3>
      ${rows ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>科目</th><th class="r">出席</th><th class="r">欠席</th><th class="r">遅刻・早退</th><th class="r">公欠</th><th>欠課 / 上限（コマ）</th><th class="r">あと休める</th><th>状態</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<div class="empty"><b>履修科目がありません</b>学年とコースを選ぶと科目が表示されます。</div>'}
    </div>`;
};
ACT['att-day'] = el => { const v = Number(el.dataset.v); UI.attDate = v === 0 ? todayYmd() : addDays(UI.attDate, v); renderPage(); };
CHG['att-date'] = el => { if (el.value) { UI.attDate = el.value; renderPage(); } };
ACT['att-all'] = () => {
  let n = 0;
  for (const sl of daySlots(UI.attDate)) if (!attOf(sl.s.id)[sl.key]) { setAtt(sl.s.id, sl.key, 'P'); n++; }
  commit(n ? n + ' コマを出席にしました' : 'すべて記録済みです');
};
ACT['att-fill'] = () => {
  const cal = state.settings.cal, t = todayYmd();
  const todo = [];
  eachDay(cal.firstStart, t < cal.secondEnd ? t : cal.secondEnd, d => {
    if (!dayInfo(d).cls) return;
    for (const sl of slotsOn(d)) if (!attOf(sl.s.id)[sl.key]) todo.push(sl);
  });
  if (!todo.length) return toast('未記録のコマはありません（時間割を先に作ってください）');
  if (!confirm(`${fmtDate(cal.firstStart, true)}〜今日の未記録 ${todo.length} コマを「出席」として記録します。よろしいですか？`)) return;
  for (const sl of todo) setAtt(sl.s.id, sl.key, 'P');
  commit(todo.length + ' コマを出席で記録しました');
};
ACT['att-extra'] = () => {
  const subs = sortSubjects(enrolledSubjects(state.profile.grade));
  if (!subs.length) return toast('履修科目がありません');
  openModal({
    title: '授業を追加で記録', sub: '補講・振替授業など、時間割にないコマの出欠を記録します',
    body: `<div class="form-grid">
      <label class="field full">科目<select id="ax-sid">${subs.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
      <label class="field">日付<input type="date" id="ax-date" value="${UI.attDate}"></label>
      <label class="field">時限<select id="ax-p">${Array.from({ length: Math.max(state.settings.periods, 6) }, (_, i) => `<option value="${i}">${i + 1}限</option>`).join('')}</select></label>
      <label class="field">出欠<select id="ax-st">${Object.entries(ATT).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label></div>`,
    foot: '<button class="btn" data-act="modal-close">キャンセル</button><button class="btn primary" data-act="att-extra-save">記録する</button>',
  });
};
ACT['att-extra-save'] = () => {
  const d = $('#ax-date').value;
  if (!d) return toast('日付を入力してください');
  setAtt($('#ax-sid').value, d + '#' + $('#ax-p').value, $('#ax-st').value);
  UI.attDate = d; closeModal(); commit('記録しました');
};

/* ---------------------------------------------------------------- 課題・試験 */
PAGES.tasks = () => {
  const t = todayYmd();
  const valid = state.items.filter(i => subj(i.sid));
  const bySub = i => !UI.taskSubject || i.sid === UI.taskSubject;
  const tasks = valid.filter(i => i.type === 'task' && bySub(i)).filter(i => UI.taskFilter === 'all' ? true : UI.taskFilter === 'open' ? isOpenTask(i) : !isOpenTask(i))
    .sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
  const exams = valid.filter(i => i.type !== 'task' && bySub(i)).filter(i => UI.taskFilter === 'all' ? true : UI.taskFilter === 'open' ? i.score == null : i.score != null)
    .sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
  const subs = Array.from(new Set(valid.map(i => i.sid))).map(subj);
  const seg = (v, label) => `<button data-act="task-filter" data-v="${v}" aria-pressed="${UI.taskFilter === v}">${label}</button>`;
  const allTasks = valid.filter(i => i.type === 'task');
  const submitted = allTasks.filter(i => i.status === 'done' || i.status === 'late').length;
  const closed = allTasks.filter(i => !isOpenTask(i)).length;
  const cal = state.settings.cal.exams.filter(x => x.from);
  return `
    <div class="page-head"><div class="grow"><h2>課題・試験</h2><p>提出の有無、提出物のリンクや写真、点数を科目の評価項目に紐づけて保存します。</p></div>
      <div class="actions">
        <select data-chg="task-subject" aria-label="科目で絞り込み"><option value="">すべての科目</option>${subs.map(s => `<option value="${esc(s.id)}"${UI.taskSubject === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <div class="seg">${seg('open', '未完了')}${seg('closed', '完了')}${seg('all', 'すべて')}</div>
        <button class="btn primary" data-act="item-new">${icon('plus')}追加</button>
      </div></div>
    <div class="tiles" style="margin-bottom:14px">
      <div class="tile"><span class="k">未完了の課題</span><span class="v">${allTasks.filter(isOpenTask).length}<small>件</small></span><span class="d">期限切れ ${allTasks.filter(i => isOpenTask(i) && i.due && i.due < t).length} 件</span></div>
      <div class="tile"><span class="k">提出率</span><span class="v">${closed ? Math.round(submitted / closed * 100) : '—'}<small>${closed ? '%' : ''}</small></span><span class="d">提出 ${submitted} / 締切済み ${closed} 件</span></div>
      <div class="tile"><span class="k">点数待ちの試験・小テスト</span><span class="v">${valid.filter(i => i.type !== 'task' && i.score == null).length}<small>件</small></span><span class="d">点数を入れると予測に反映</span></div>
    </div>
    <div class="grid cols-2" style="align-items:start">
      <div class="card"><h3>課題・提出物 <span class="badge">${tasks.length}</span></h3>
        ${tasks.length ? `<div class="list">${tasks.map(itemRow).join('')}</div>` : `<div class="empty"><b>${UI.taskFilter === 'open' ? '未完了の課題はありません' : '課題はありません'}</b>「追加」から課題を登録できます。丸いボタンで提出済みにできます。</div>`}
      </div>
      <div class="card"><h3>試験・小テスト <span class="badge">${exams.length}</span></h3>
        ${cal.length ? `<div class="note" style="margin-bottom:6px">${cal.map(x => `${esc(x.name)} ${fmtDate(x.from)}〜${fmtDate(x.to)}`).join(' ／ ')}</div>` : ''}
        ${exams.length ? `<div class="list">${exams.map(itemRow).join('')}</div>` : '<div class="empty"><b>登録された試験はありません</b>試験や小テストの日程と点数を記録すると、成績予測に使われます。</div>'}
      </div>
    </div>`;
};
ACT['task-filter'] = el => { UI.taskFilter = el.dataset.v; renderPage(); };
CHG['task-subject'] = el => { UI.taskSubject = el.value; renderPage(); };
ACT['item-toggle'] = el => {
  const i = state.items.find(x => x.id === el.dataset.id);
  if (!i) return;
  if (i.status === 'done' || i.status === 'late' || i.status === 'missed') i.status = 'todo';
  else i.status = i.due && todayYmd() > i.due ? 'late' : 'done';
  commit(i.status === 'todo' ? '未提出に戻しました' : '提出済みにしました');
};

function suggestComp(s, type) {
  const comps = compsOf(s);
  const pref = { exam: ['exam'], quiz: ['quiz', 'exam'], task: ['task', 'present', 'practice', 'other'] }[type];
  for (const k of pref) { const i = comps.findIndex(c => c.kind === k); if (i >= 0) return i; }
  return comps.length === 1 ? 0 : -1;
}
function openItem(item, sid) {
  const g = state.profile.grade;
  const first = sid || UI.taskSubject || (enrolledSubjects(g)[0] || {}).id || '';
  UI.itemDraft = item ? JSON.parse(JSON.stringify(item)) : {
    id: null, sid: first, type: 'task', title: '', due: '', comp: first ? suggestComp(subj(first), 'task') : -1,
    status: 'todo', score: null, max: 100, memo: '', links: [], photos: [],
  };
  UI.itemDraft.newPhotos = []; UI.itemDraft.delPhotos = [];
  renderItemModal();
}
function renderItemModal() {
  const d = UI.itemDraft, g = state.profile.grade;
  const pool = sortSubjects(enrolledSubjects(g));
  if (d.sid && !pool.some(s => s.id === d.sid) && subj(d.sid)) pool.unshift(subj(d.sid));
  if (!pool.length) { toast('先に学年・コースを選んで履修科目を表示してください'); return; }
  if (!d.sid) d.sid = pool[0].id;
  const s = subj(d.sid);
  const comps = compsOf(s);
  const links = (d.links || []).map(safeUrl).filter(Boolean);
  const seg = (v, label) => `<button data-act="item-type" data-v="${v}" aria-pressed="${d.type === v}">${label}</button>`;
  const body = `
    <div class="seg" role="group" aria-label="種類">${Object.entries(ITEM_TYPES).map(([k, v]) => seg(k, v)).join('')}</div>
    <div class="form-grid">
      <label class="field full">科目<select id="it-sid" data-chg="item-sid">${pool.map(x => `<option value="${esc(x.id)}"${x.id === d.sid ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label class="field full">タイトル<input type="text" id="it-title" value="${esc(d.title)}" list="it-titles" placeholder="${d.type === 'task' ? '例: 第3回レポート、問題集 p.20-25' : d.type === 'exam' ? '例: 前期中間試験' : '例: 漢字小テスト 第2回'}">
        <datalist id="it-titles">${(d.type === 'exam' ? ['前期中間試験', '前期末試験', '後期中間試験', '学年末試験', '追試験', '再認定試験'] : []).map(x => `<option value="${x}">`).join('')}</datalist></label>
      <label class="field">${d.type === 'task' ? '提出期限' : '実施日'}<input type="date" id="it-due" value="${esc(d.due || '')}"></label>
      <label class="field">成績の評価項目<select id="it-comp"><option value="-1"${d.comp < 0 ? ' selected' : ''}>成績に含めない</option>${comps.map((c, i) => `<option value="${i}"${d.comp === i ? ' selected' : ''}>${esc(c.label)}（${fmtNum(c.w)}%）</option>`).join('')}</select></label>
      ${d.type === 'task' ? `<label class="field">提出状況<select id="it-status">${Object.entries(TASK_STATUS).map(([k, v]) => `<option value="${k}"${d.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      <label class="field">点数（返却後に入力）<span class="row" style="flex-wrap:nowrap"><input type="number" id="it-score" value="${d.score == null ? '' : esc(d.score)}" min="0" step="0.5" placeholder="—"> / <input type="number" id="it-max" value="${esc(d.max)}" min="1" step="1"> 点</span></label>
      <label class="field full">提出物・資料のリンク（1行に1つ）<textarea id="it-links" placeholder="https://… （Google ドライブ、Teams、GitHub など）">${esc((d.links || []).join('\n'))}</textarea></label>
      ${links.length ? `<div class="full row">${links.map(u => `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">${icon('link')}${esc(u.replace(/^https?:\/\//, '').slice(0, 34))}</a>`).join('')}</div>` : ''}
      <div class="full"><div class="small muted" style="font-weight:600;margin-bottom:4px">提出物の写真</div>
        <div class="thumbs" id="it-thumbs">${(d.photos || []).map(id => `<div class="thumb" data-ph="${esc(id)}"><a target="_blank" rel="noopener"><img alt="提出物の写真"></a><button data-act="ph-del" data-id="${esc(id)}" aria-label="写真を削除">×</button></div>`).join('')}
          <label class="btn" style="height:84px;flex-direction:column">${icon('camera')}写真を追加<input type="file" accept="image/*" multiple class="hide" data-chg="ph-add"></label></div>
        <p class="hint" style="margin-top:4px">写真はこのブラウザ内（IndexedDB）に縮小して保存します。</p></div>
      <label class="field full">メモ<textarea id="it-memo" placeholder="出題範囲、先生のコメント、反省など">${esc(d.memo || '')}</textarea></label>
    </div>`;
  openModal({
    title: d.id ? '記録を編集' : '課題・試験を追加', sub: esc(s.name), body,
    foot: `${d.id ? `<button class="btn danger" data-act="item-del">${icon('trash')}削除</button>` : ''}<span class="grow"></span>
      <button class="btn" data-act="item-cancel">キャンセル</button><button class="btn primary" data-act="item-save">保存</button>`,
    onClose: discardItemDraft,
  });
  fillThumbs();
}
function fillThumbs() {
  $$('#it-thumbs .thumb[data-ph]').forEach(el => {
    Photos.url(el.dataset.ph).then(u => { if (!u) return; $('img', el).src = u; $('a', el).href = u; }).catch(() => { /* 表示できない写真は無視 */ });
  });
}
function readItemForm() {
  const d = UI.itemDraft;
  if (!d || !$('#it-title')) return;
  d.title = $('#it-title').value.trim();
  d.due = $('#it-due').value;
  d.comp = Number($('#it-comp').value);
  if ($('#it-status')) d.status = $('#it-status').value;
  const sc = $('#it-score').value;
  d.score = sc === '' ? null : Number(sc);
  d.max = Number($('#it-max').value) || 100;
  d.links = $('#it-links').value.split('\n').map(x => x.trim()).filter(Boolean);
  d.memo = $('#it-memo').value.trim();
}
function discardItemDraft() {
  const d = UI.itemDraft;
  if (d) for (const id of d.newPhotos || []) Photos.del(id).catch(() => { /* noop */ });
  UI.itemDraft = null;
}
ACT['item-new'] = el => openItem(null, el.dataset.sid);
ACT['item-edit'] = el => { const i = state.items.find(x => x.id === el.dataset.id); if (i) openItem(i); };
ACT['item-type'] = el => { readItemForm(); const d = UI.itemDraft; d.type = el.dataset.v; d.comp = suggestComp(subj(d.sid), d.type); modalOnClose = null; renderItemModal(); };
CHG['item-sid'] = el => { readItemForm(); const d = UI.itemDraft; d.sid = el.value; d.comp = suggestComp(subj(d.sid), d.type); modalOnClose = null; renderItemModal(); };
CHG['ph-add'] = async el => {
  readItemForm();
  const d = UI.itemDraft;
  try {
    for (const f of Array.from(el.files || [])) { const id = await Photos.add(f); d.photos.push(id); d.newPhotos.push(id); }
  } catch (e) { toast('写真を保存できませんでした: ' + (e && e.message || e)); }
  modalOnClose = null; renderItemModal();
};
ACT['ph-del'] = el => { readItemForm(); const d = UI.itemDraft; d.photos = d.photos.filter(x => x !== el.dataset.id); d.delPhotos.push(el.dataset.id); modalOnClose = null; renderItemModal(); };
ACT['item-cancel'] = () => closeModal();
ACT['item-save'] = () => {
  readItemForm();
  const d = UI.itemDraft;
  if (!d.title) d.title = ITEM_TYPES[d.type];
  if (d.score != null && d.score > d.max) return toast('点数が満点を超えています');
  if (d.type === 'task' && d.score != null && isOpenTask(d)) d.status = 'done';
  for (const id of d.delPhotos) Photos.del(id).catch(() => { /* noop */ });
  const rec = { id: d.id || uid('i'), sid: d.sid, type: d.type, title: d.title, due: d.due, comp: d.comp, status: d.type === 'task' ? d.status : 'done', score: d.score, max: d.max, memo: d.memo, links: d.links, photos: d.photos };
  const idx = state.items.findIndex(x => x.id === rec.id);
  if (idx >= 0) state.items[idx] = rec; else state.items.push(rec);
  UI.itemDraft = null; modalOnClose = null; closeModal(); commit('保存しました');
};
ACT['item-del'] = () => {
  const d = UI.itemDraft;
  if (!confirm('この記録を削除しますか？')) return;
  for (const id of (d.photos || []).concat(d.delPhotos || [])) Photos.del(id).catch(() => { /* noop */ });
  state.items = state.items.filter(x => x.id !== d.id);
  UI.itemDraft = null; modalOnClose = null; closeModal(); commit('削除しました');
};

/* ---------------------------------------------------------------- 成績予測 */
function needHtml(s, gs) {
  if (gs.fixed || s.passfail || gs.noData || gs.att.level === 'fail') return '';
  const lab = { 60: '可', 70: '良', 80: '優', 90: '秀' };
  return `<div><div class="small muted" style="margin-bottom:4px">残りの配点 ${fmtNum(round1(gs.rest))}% で必要な平均得点率</div><div class="need">${[60, 70, 80, 90].map(t => {
    const n = gs.need[t];
    const txt = n <= 0 ? '到達済み' : n > 1 ? '届かない' : Math.ceil(n * 100) + '%';
    return `<span class="${n <= 0 ? 'ok' : n > 1 ? 'ng' : ''}">${lab[t]}（${t}点）<b>${txt}</b></span>`;
  }).join('')}</div></div>`;
}
function gradeCard(s) {
  const gs = gradeStats(s), lv = PASS_LEVEL[gs.level];
  const manual = state.manual[s.id] || {};
  const failAtt = gs.att.level === 'fail' && !gs.fixed;
  const scoreTxt = gs.noData ? '<span class="v faint">—</span>' : s.passfail ? `<span class="v">${gs.letter}</span>` : `<span class="v">${failAtt ? 0 : Math.round(gs.pred)}<small>点 ${gs.letter}</small></span>`;
  return `<div class="card gcard">
    <div class="gcard-head">
      <div class="grow">${subjName(s)}
        <div class="badges" style="margin-top:4px"><span class="badge">${s.credits}単位</span>${s.must ? '<span class="badge accent">必修得</span>' : ''}<span class="badge outline">${esc(s.term)}</span>
        ${gs.fixed ? `<span class="badge ${gs.passed ? 'accent' : ''}">成績確定</span>` : ''}</div></div>
      <div class="score-big">${scoreTxt}<div class="r">${gs.fixed ? '確定' : gs.noData ? '点数の記録なし' : failAtt ? '出席不足のため' : s.passfail ? '見込み' : `見込み ${Math.round(gs.lo)}〜${Math.round(gs.hi)}点`}</div></div>
    </div>
    <div>
      <div class="row" style="margin-bottom:4px"><span class="small muted grow">単位取得の可能性</span>${statusHtml(lv.cls, gs.noData ? 'まだ判定できません' : lv.label)}<b class="num">${gs.noData ? '—' : Math.round(gs.pPass * 100) + '%'}</b></div>
      ${meter(gs.noData ? 0 : gs.pPass, 'm-' + lv.cls, 'tall')}
      ${gs.note ? `<div class="small" style="margin-top:4px">${statusHtml('critical', gs.note, true)}</div>` : ''}
    </div>
    ${gs.fixed ? '' : `<div class="comp-rows">${gs.rows.map(r => `
      <div class="comp-row"><div class="lb k-${r.kind}"><i class="dot"></i><span title="${esc(r.label)}">${esc(r.label)}</span></div>
        <span class="num muted">${fmtNum(round1(r.w))}%</span>
        ${meter(r.rate == null ? 0 : r.rate, 'm-accent')}
        <input type="number" min="0" max="100" step="1" value="${manual[r.idx] != null ? esc(manual[r.idx]) : ''}" placeholder="${r.rate != null && r.src === 'items' ? Math.round(r.rate * 100) + '%' : '—'}"
          data-chg="manual" data-sid="${esc(s.id)}" data-i="${r.idx}" aria-label="${esc(r.label)}の得点率（手入力）" title="記録${r.n}件${r.pending ? '・点数待ち' + r.pending + '件' : ''}。手入力すると記録より優先します">
      </div>`).join('')}</div>
      <div class="hint">${gs.hasData ? `評価済みの配点 ${fmtNum(round1(gs.known))}%（現在 ${fmtNum(round1(gs.partial))}点分を獲得）` : '点数を記録するか、右の欄に見込みの得点率(%)を入れると予測します。'}</div>
      ${needHtml(s, gs)}`}
    ${attSummaryHtml(gs.att)}
    <div class="row"><button class="btn sm" data-act="item-new" data-sid="${esc(s.id)}">${icon('plus')}点数・課題を記録</button>
      <button class="btn sm" data-act="final-edit" data-sid="${esc(s.id)}">${icon('edit')}${gs.fixed ? '確定成績を修正' : '確定成績を入力'}</button></div>
  </div>`;
}
PAGES.grades = () => {
  const g = state.profile.grade, term = state.profile.term;
  let subs = enrolledSubjects(g).filter(s => !s.custom);
  if (UI.gradeScope === 'term') subs = subs.filter(s => inTerm(s, term));
  const stats = subs.map(s => ({ s, gs: gradeStats(s) })).sort((a, b) => (a.gs.noData - b.gs.noData) || a.gs.pPass - b.gs.pPass || b.s.credits - a.s.credits);
  const total = subs.reduce((a, s) => a + s.credits, 0);
  const exp = stats.reduce((a, x) => a + x.s.credits * x.gs.pEff, 0);
  const assumed = stats.reduce((a, x) => a + (x.gs.noData ? x.s.credits : 0), 0);
  const scored = stats.filter(x => !x.s.passfail && (x.gs.hasData || x.gs.fixed));
  const avg = scored.length ? scored.reduce((a, x) => a + x.gs.pred * x.s.credits, 0) / scored.reduce((a, x) => a + x.s.credits, 0) : null;
  const danger = stats.filter(x => x.gs.level === 'critical' || x.gs.level === 'serious').length;
  const seg = (v, label) => `<button data-act="grade-scope" data-v="${v}" aria-pressed="${UI.gradeScope === v}">${label}</button>`;
  return `
    <div class="page-head"><div class="grow"><h2>成績予測・単位取得の可能性</h2>
      <p>シラバスの評価配分 × 記録した点数・提出状況・出席から見込みを計算します（60点以上で単位取得）。あくまで目安です。</p></div>
      <div class="actions"><label class="check small">未評価の項目の想定得点率 <input type="number" min="0" max="100" step="5" value="${state.settings.expect}" data-chg="set-expect"> %</label>
        <div class="seg">${seg('term', term + 'の科目')}${seg('year', g + '年すべて')}</div></div></div>
    <div class="tiles" style="margin-bottom:14px">
      <div class="tile"><span class="k">単位取得の見込み</span><span class="v">${fmtNum(round1(exp))}<small>/ ${total} 単位</small></span><span class="d">${assumed ? `記録なしの ${assumed} 単位は取得と仮定` : '可能性で重みづけした期待値'}</span></div>
      <div class="tile"><span class="k">見込み平均点</span><span class="v">${avg == null ? '—' : fmtNum(round1(avg))}<small>${avg == null ? '' : '点'}</small></span><span class="d">点数の記録がある ${scored.length} 科目</span></div>
      <div class="tile"><span class="k">要注意・危険の科目</span><span class="v">${danger}<small>科目</small></span><span class="d">可能性 70% 未満</span></div>
    </div>
    ${stats.length ? `<div class="grid cols-2" style="align-items:start">${stats.map(x => gradeCard(x.s)).join('')}</div>` : '<div class="card"><div class="empty"><b>対象の科目がありません</b>学年・コースを選ぶと履修科目が表示されます。</div></div>'}
    <details class="card" style="margin-top:14px"><summary>予測の計算方法</summary><div class="prose">
      ・評価項目ごとに、紐づけた課題・試験の得点率の平均を使います（「未提出」は0点、手入力があればそちらを優先）。<br>
      ・まだ点数のない項目は、これまでの得点率と「想定得点率」をならした値で補って見込み点を出します。<br>
      ・未確定の配点が多いほど見込みの幅（±）を広くとり、60点を超える確率を「単位取得の可能性」としています。<br>
      ・点数の記録が1つもない科目は判定せず、単位の合計では「取得できる」と仮定して数えます。<br>
      ・欠課が総授業時間数の 1/3 を超えると、規程により原則 0 点（可能性 0%）として扱います。<br>
      ・追試験は 80点、再認定試験は 60点が成績の上限です（公欠等が認められた追試験は 100点）。</div></details>`;
};
ACT['grade-scope'] = el => { UI.gradeScope = el.dataset.v; renderPage(); };
CHG['set-expect'] = el => { state.settings.expect = clamp(Number(el.value) || 0, 0, 100); commit(); };
CHG.manual = el => {
  const sid = el.dataset.sid, i = el.dataset.i;
  if (!state.manual[sid]) state.manual[sid] = {};
  if (el.value === '') delete state.manual[sid][i]; else state.manual[sid][i] = clamp(Number(el.value), 0, 100);
  if (!Object.keys(state.manual[sid]).length) delete state.manual[sid];
  commit();
};
ACT['final-edit'] = el => {
  const s = subj(el.dataset.sid), f = state.final[s.id] || {};
  openModal({
    title: '確定成績の入力', sub: esc(s.name),
    body: `${s.passfail ? `<label class="field">合否（この科目は合格・不合格で評価されます）<select id="fi-pass"><option value="">未確定</option><option value="1"${f.pass === true ? ' selected' : ''}>合格</option><option value="0"${f.pass === false ? ' selected' : ''}>不合格</option></select></label>`
      : `<label class="field">成績（100点法）<input type="number" id="fi-score" min="0" max="100" step="1" value="${f.score == null ? '' : esc(f.score)}" placeholder="例: 78"></label>
         <label class="check"><input type="checkbox" id="fi-passonly" ${f.score == null && f.pass === true ? 'checked' : ''}> 点数は不明だが単位は取得済み</label>`}
      <p class="hint">成績票が出たら入力してください。確定成績は予測より優先され、「単位・進級」の累計に入ります。</p>`,
    foot: `<button class="btn" data-act="final-clear" data-sid="${esc(s.id)}">未確定に戻す</button><span class="grow"></span><button class="btn" data-act="modal-close">キャンセル</button><button class="btn primary" data-act="final-save" data-sid="${esc(s.id)}">保存</button>`,
  });
};
ACT['final-save'] = el => {
  const s = subj(el.dataset.sid);
  if (s.passfail) {
    const v = $('#fi-pass').value;
    if (v === '') delete state.final[s.id]; else state.final[s.id] = { score: null, pass: v === '1' };
  } else {
    const v = $('#fi-score').value;
    if (v !== '') state.final[s.id] = { score: clamp(Number(v), 0, 100), pass: null };
    else if ($('#fi-passonly').checked) state.final[s.id] = { score: null, pass: true };
    else delete state.final[s.id];
  }
  closeModal(); commit('確定成績を保存しました');
};
ACT['final-clear'] = el => { delete state.final[el.dataset.sid]; closeModal(); commit('未確定に戻しました'); };
