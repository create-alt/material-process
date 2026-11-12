/* 高専コマナビ — 単位・進級 / 設定 */
'use strict';

/* ---------------------------------------------------------------- 単位・進級 */
function reqRow(label, need, earned, expect, plan, unit, note) {
  const max = Math.max(need, plan, 1) * 1.02;
  const ok = earned >= need, okExp = expect >= need - 1e-9, okPlan = plan >= need;
  const st = ok ? statusHtml('good', '達成') : okExp ? statusHtml('good', '見込みで到達') : okPlan ? statusHtml('neutral', '履修予定で到達')
    : !state.profile.course ? statusHtml('neutral', 'コース未選択') : statusHtml('warning', '履修予定が不足');
  return `<tr><td><b>${label}</b>${note ? `<div class="small muted">${note}</div>` : ''}</td>
    <td class="r">${need}${unit}</td><td class="r">${fmtNum(round1(earned))}</td><td class="r">${fmtNum(round1(expect))}</td><td class="r">${fmtNum(round1(plan))}</td>
    <td style="min-width:150px"><div class="meter-wrap"><div class="meter tall m-accent" style="--mc2:var(--accent)">
      <i class="second" style="width:${clamp(expect / max, 0, 1) * 100}%"></i><i style="width:${clamp(earned / max, 0, 1) * 100}%"></i></div>
      <span class="meter-mark" style="left:${clamp(need / max, 0, 1) * 100}%" title="必要 ${need}${unit}"></span></div></td>
    <td>${st}</td></tr>`;
}
function ledgerTable(g, row) {
  if (!row.subjects.length) return '<div class="empty">この学年の履修科目がありません（コース・領域を選ぶと表示されます）。</div>';
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>科目</th><th class="r">単位</th><th>区分</th><th>成績（点）</th><th>単位</th></tr></thead><tbody>${sortSubjects(row.subjects).map(s => {
    const f = state.final[s.id] || {}, es = earnedState(s);
    return `<tr><td>${subjName(s)}</td><td class="r">${s.credits}</td><td class="small">${reqLabel(s)}${s.must ? '・<b>必修得</b>' : ''}</td>
      <td>${s.passfail ? '<span class="faint small">合否のみ</span>' : `<input type="number" min="0" max="100" value="${f.score == null ? '' : esc(f.score)}" placeholder="—" data-chg="led-score" data-sid="${esc(s.id)}" aria-label="${esc(s.name)}の点数">`}</td>
      <td><select data-chg="led-st" data-sid="${esc(s.id)}" aria-label="${esc(s.name)}の単位"><option value="">未確定</option><option value="p"${es === true ? ' selected' : ''}>取得済み</option><option value="f"${es === false ? ' selected' : ''}>不可</option></select></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
PAGES.credits = () => {
  const sum = creditSummary(), g = sum.cur, G = RULES.grad;
  const row = sum.byGrade[g];
  const avg = scoreAverages();
  const open = row.subjects.filter(s => earnedState(s) == null);
  const curBest = sum.earned.total + open.reduce((a, s) => a + s.credits, 0);
  const need = sum.need || G.total;
  const unknownPast = [1, 2, 3, 4, 5].filter(x => x < g && sum.byGrade[x].unknown > 0);
  const gap = need - sum.expect.total;
  let verdict;
  if (sum.earned.total >= need) verdict = statusHtml('good', '必要な累計単位に到達済みです');
  else if (curBest < need) verdict = statusHtml('critical', `今年度の科目をすべて取っても ${fmtNum(round1(need - curBest))} 単位足りません（過去学年の成績入力や特別学修を確認）`, true);
  else if (gap <= 0) verdict = statusHtml('good', `見込みでは到達（余裕 ${fmtNum(round1(-gap))} 単位）`);
  else verdict = statusHtml('serious', `見込みでは ${fmtNum(round1(gap))} 単位足りません`);
  const mustAll = row.subjects.filter(s => s.must);
  const max = Math.max(need, curBest, 1) * 1.02;

  return `
    <div class="page-head"><div class="grow"><h2>単位・進級</h2><p>確定した成績と今年度の見込みから、進級・卒業に必要な単位を確認します。</p></div></div>
    ${unknownPast.length ? `<div class="note" style="margin-bottom:12px">${statusHtml('warning', unknownPast.join('・') + '年の成績が未入力です')}
      累計単位に含めるには、下の「学年ごとの単位台帳」で入力するか、まとめて取得済みにしてください。
      <button class="btn sm" data-act="led-fill-past" style="margin-left:6px">${icon('check')}${g - 1}年までの履修科目をすべて取得済みにする</button></div>` : ''}
    <div class="tiles" style="margin-bottom:14px">
      <div class="tile"><span class="k">累計取得単位（確定）</span><span class="v">${fmtNum(round1(sum.earned.total))}<small>単位</small></span><span class="d">うち特別学修 ${fmtNum(round1(sum.special.total))}</span></div>
      <div class="tile"><span class="k">${g}年の見込みを含む累計</span><span class="v">${fmtNum(round1(sum.expect.total))}<small>/ ${need} 単位</small></span><span class="d">${row.assumed ? `記録なしの ${row.assumed} 単位は取得と仮定` : sum.need ? g + '年の課程修了に必要' : '卒業に必要'}</span></div>
      <div class="tile"><span class="k">単位加重の平均点</span><span class="v">${avg ? fmtNum(round1(avg.avg)) : '—'}<small>${avg ? '点' : ''}</small></span><span class="d">${avg ? `参考GPA ${avg.gpa.toFixed(2)}（${avg.credits}単位分）` : '確定成績（点数）を入れると表示'}</span></div>
      <div class="tile"><span class="k">${g}年の必修得科目</span><span class="v">${mustAll.length}<small>科目</small></span><span class="d">注意 ${row.mustRisk.length} 科目</span></div>
    </div>
    <div class="grid cols-2" style="align-items:start">
      <div class="card"><h3>${sum.need ? `${g}年 → ${g + 1}年 進級の見通し` : '卒業の見通し（累計単位）'}</h3>
        <div class="meter-wrap" style="margin:6px 0 10px"><div class="meter tall m-accent">
          <i class="second" style="width:${clamp(sum.expect.total / max, 0, 1) * 100}%"></i><i style="width:${clamp(sum.earned.total / max, 0, 1) * 100}%"></i></div>
          <span class="meter-mark" style="left:${clamp(need / max, 0, 1) * 100}%"></span></div>
        <div class="legend" style="margin-bottom:8px"><span><i class="dot" style="--c:var(--accent)"></i>確定 <b>${fmtNum(round1(sum.earned.total))}</b></span>
          <span><i class="dot" style="--c:var(--accent);opacity:.35"></i>見込み込み <b>${fmtNum(round1(sum.expect.total))}</b></span>
          <span><i class="dot" style="--c:var(--text);width:2px"></i>必要 <b>${need}</b></span><span>全部取れた場合 <b>${fmtNum(round1(curBest))}</b></span></div>
        ${verdict}
        <hr class="sep">
        <h4 style="margin-bottom:6px">必修得科目（${g}年）— 1つでも落とすと課程修了が認められません</h4>
        ${mustAll.length ? `<div class="list">${mustAll.map(s => {
    const gs = gradeStats(s), lv = PASS_LEVEL[gs.level];
    return `<div class="li"><div class="grow">${subjName(s)}</div>${gs.fixed ? statusHtml(gs.passed ? 'good' : 'critical', gs.passed ? '取得済み' : '不可') : statusHtml(lv.cls, lv.label)}<span class="num small muted">${gs.noData ? '' : Math.round(gs.pPass * 100) + '%'}</span></div>`;
  }).join('')}</div>` : '<div class="empty">この学年の必修得科目はありません。</div>'}
        ${g <= 3 ? '<p class="hint" style="margin-top:8px">※3年までは特別活動の修得も課程修了の条件です。</p>' : ''}
      </div>
      <div class="card"><h3>特別学修（資格・検定、他高専・大学、短期留学）</h3>
        <p class="hint">校長に認定された単位を入力すると累計に加算します（上限 ${G.tokubetsuMax} 単位、資格・検定など別表の学修は ${G.tokubetsuTableMax} 単位まで）。対象の資格と単位数は学校からの案内で確認してください。</p>
        ${state.special.length ? `<div class="list">${state.special.map(x => `<div class="li"><div class="grow"><div class="t">${esc(x.name)}</div><div class="m"><span>${x.table ? '別表（資格・検定など）' : '他高専・大学・留学'}</span><span>${x.general ? '一般科目' : '専門科目'}</span></div></div>
          <b class="num">${fmtNum(x.credits)}単位</b><button class="btn ghost icon sm" data-act="sp-del" data-id="${esc(x.id)}" aria-label="削除">${icon('trash')}</button></div>`).join('')}</div>` : ''}
        <div class="form-grid" style="margin-top:8px">
          <label class="field full">名称<input type="text" id="sp-name" placeholder="例: 実用英語技能検定 準2級"></label>
          <label class="field">単位数<input type="number" id="sp-credits" min="1" max="60" value="1"></label>
          <label class="field">種類<select id="sp-table"><option value="1">資格・検定など（別表）</option><option value="0">他高専・大学・留学</option></select></label>
          <label class="field">区分<select id="sp-general"><option value="1">一般科目</option><option value="0">専門科目</option></select></label>
        </div>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="sp-add">${icon('plus')}追加</button>
          ${sum.special.raw > sum.special.total ? statusHtml('warning', `上限を超えた ${fmtNum(sum.special.raw - sum.special.total)} 単位は加算されません`) : ''}</div>
      </div>
    </div>
    <div class="card" style="margin-top:14px"><h3>卒業要件の進み具合</h3>
      ${!state.profile.course || !state.profile.area ? `<div class="note" style="margin-bottom:10px"><div class="row">${statusHtml('neutral', 'コース・領域を選ぶと 5年までの履修予定を計算できます')}
        <select data-chg="course" aria-label="コース（予定）"><option value="">コース未選択</option>${Object.entries(COURSES).map(([k, v]) => `<option value="${k}"${state.profile.course === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <select data-chg="area" aria-label="応用専門の領域（予定）"><option value="">領域未選択</option>${Object.keys(AREAS).map(a => `<option value="${a}"${state.profile.area === a ? ' selected' : ''}>${a}領域</option>`).join('')}</select></div></div>` : ''}
      <div class="table-wrap"><table class="tbl"><thead><tr><th>要件</th><th class="r">必要</th><th class="r">確定</th><th class="r">見込み込み</th><th class="r">履修予定</th><th>進み具合</th><th>状態</th></tr></thead><tbody>
        ${reqRow('累計取得単位', G.total, sum.earned.total, sum.expect.total, sum.plan.total, '', '特別学修を含む')}
        ${reqRow('一般科目', G.general, sum.earned.general, sum.expect.general, sum.plan.general, '')}
        ${reqRow('専門科目', G.special, sum.earned.special, sum.expect.special, sum.plan.special, '')}
        ${reqRow('DP-A', G.dpA, sum.earned.dpA, sum.expect.dpA, sum.plan.dpA, '', '教養・共生社会')}
        ${reqRow('SDGs科目', G.sdgs, sum.earned.sdgs, sum.expect.sdgs, sum.plan.sdgs, '科目', '5科目以上（必履修は4科目。選択の SDGs科目を1つ以上）')}
        ${reqRow('DP-B', G.dpB, sum.earned.dpB, sum.expect.dpB, sum.plan.dpB, '', '数学・自然科学・情報')}
        ${reqRow('DP-C', G.dpC, sum.earned.dpC, sum.expect.dpC, sum.plan.dpC, '', 'コミュニケーション')}
        ${reqRow('DP-D', G.dpD, sum.earned.dpD, sum.expect.dpD, sum.plan.dpD, '', '基盤専門')}
        ${reqRow('DP-E', G.dpE, sum.earned.dpE, sum.expect.dpE, sum.plan.dpE, '', '応用専門')}
      </tbody></table></div>
      <p class="hint" style="margin-top:8px">「履修予定」は現在のコース・領域と履修選択で 1〜5年に取る科目の合計です。学修単位は卒業要件に算入できるのが ${G.gakushuMax} 単位まで（履修予定 ${fmtNum(sum.plan.gakushu)} 単位）。必修得科目はすべて取得が必要です。</p>
    </div>
    <div class="card" style="margin-top:14px"><h3>学年ごとの単位台帳</h3>
      <p class="hint" style="margin-bottom:6px">成績票をもとに点数か単位の取得状況を入力します。点数を入れると 60点以上で自動的に「取得済み」になります。</p>
      ${[1, 2, 3, 4, 5].map(x => { const r = sum.byGrade[x]; return `<details ${x === g ? 'open' : ''}><summary>${x}年 <span class="badge">確定 ${r.earned} / 履修 ${r.plan} 単位</span>${x === g ? ' <span class="badge accent">現在の学年</span>' : ''}</summary>
        <div class="row" style="margin-bottom:6px"><button class="btn sm" data-act="led-fill" data-g="${x}">${icon('check')}未確定の科目をすべて取得済みにする</button></div>
        ${ledgerTable(x, r)}</details>`; }).join('')}
    </div>
    <details class="card" style="margin-top:14px"><summary>評価・進級・卒業のルール早見（学生便覧より）</summary><div class="prose">
      <b>成績</b>：100点法。90点以上＝秀、80点以上＝優、70点以上＝良、60点以上＝可、60点未満＝不可。60点以上で単位取得。卒業研究・インターンシップ・応用専門PBL1/2・防災リテラシー・総合課題実習1〜3は合格/不合格で評価。<br>
      <b>出席</b>：総授業時間数の 2/3 以上の出席時間数がない科目は、原則として試験等にかかわらず 0点。公欠（忌引・感染症による出席停止など）は出席扱い。<br>
      <b>単位時間</b>：履修単位は 1単位＝30単位時間の授業、学修単位は 1単位＝45時間の学修（授業は15単位時間）。50分＝1単位時間、90分＝2単位時間。<br>
      <b>試験</b>：正当な理由なく受けなかった試験は 0点。追試験は 80点が最高（公欠等が認められた場合は 100点）。再認定試験で単位を取った場合は 60点が最高。必修得の実験・実習科目と合否評価の科目は再認定を受けられません。<br>
      <b>進級（課程修了）</b>：累計取得単位が 1年 27・2年 62・3年 97・4年 136 単位以上で、その学年の必修得科目をすべて取得（3年までは特別活動も修得）。<br>
      <b>卒業</b>：累計 167単位以上（一般 75以上・専門 82以上）、必修得科目すべて、DP-A 21単位以上かつ SDGs科目 5科目以上、DP-B 39、DP-C 20、DP-D 50、DP-E 16 単位以上。<br>
      <b>特別学修</b>：他高専・大学での学修、短期海外留学、別表の資格・検定など。加算の上限は 60単位（別表の学修は 10単位）。<br>
      <span class="muted">出典: <a href="https://www.omu.ac.jp/ct/_media/KOSEN_gakuseibinran-original.pdf" target="_blank" rel="noopener">学生便覧</a>（成績評価・学年の課程修了及び卒業の認定等に関する規程、特別学修規程）。
      <a href="https://www1.g-reiki.net/upc-osaka/reiki_honbun/u325RG00200375.html" target="_blank" rel="noopener">学則</a>・<a href="https://www1.g-reiki.net/upc-osaka/reiki_honbun/u325RG00200416.html" target="_blank" rel="noopener">特別学修規程</a>も参照。最終的な判定は必ず学校の案内・成績票で確認してください。</span></div></details>`;
};
CHG['led-score'] = el => {
  const sid = el.dataset.sid;
  if (el.value === '') { const f = state.final[sid]; if (f && f.pass != null) f.score = null; else delete state.final[sid]; }
  else state.final[sid] = { score: clamp(Number(el.value), 0, 100), pass: null };
  commit();
};
CHG['led-st'] = el => {
  const sid = el.dataset.sid, f = state.final[sid] || {};
  if (el.value === '') delete state.final[sid];
  else if (el.value === 'p') state.final[sid] = { score: f.score != null && f.score >= RULES.passScore ? f.score : null, pass: true };
  else state.final[sid] = { score: f.score != null && f.score < RULES.passScore ? f.score : null, pass: false };
  commit();
};
function fillLedger(g) {
  let n = 0;
  for (const s of enrolledSubjects(g)) if (!s.custom && earnedState(s) == null) { state.final[s.id] = { score: null, pass: true }; n++; }
  return n;
}
ACT['led-fill'] = el => {
  const g = Number(el.dataset.g);
  if (!confirm(`${g}年の未確定の履修科目を、すべて「取得済み」にしますか？`)) return;
  commit(fillLedger(g) + ' 科目を取得済みにしました');
};
ACT['led-fill-past'] = () => {
  const g = state.profile.grade;
  if (!confirm(`1〜${g - 1}年の未確定の履修科目を、すべて「取得済み」にしますか？（落とした科目は後から「不可」に直せます）`)) return;
  let n = 0;
  for (let x = 1; x < g; x++) n += fillLedger(x);
  commit(n + ' 科目を取得済みにしました');
};
ACT['sp-add'] = () => {
  const name = $('#sp-name').value.trim(), credits = Number($('#sp-credits').value);
  if (!name || !(credits > 0)) return toast('名称と単位数を入力してください');
  state.special.push({ id: uid('sp'), name, credits, table: $('#sp-table').value === '1', general: $('#sp-general').value === '1' });
  commit('特別学修を追加しました');
};
ACT['sp-del'] = el => { state.special = state.special.filter(x => x.id !== el.dataset.id); commit(); };

/* ---------------------------------------------------------------- 設定 */
PAGES.settings = () => {
  const st = state.settings, cal = st.cal;
  while (st.times.length < st.periods) st.times.push(['', '']);
  const kb = Math.round(storageBytes() / 1024);
  const opt = (v, label, cur) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
  return `
    <div class="page-head"><div class="grow"><h2>設定</h2><p>すべてのデータはこのブラウザの中だけに保存されます（サーバーには送信しません）。</p></div></div>
    <div class="grid cols-wide" style="align-items:start">
      <div class="card"><h3>時間割の形</h3>
        <div class="form-grid">
          <label class="field">曜日<select data-chg="set" data-f="days" data-num="1">${opt(5, '月〜金', st.days)}${opt(6, '月〜土', st.days)}</select></label>
          <label class="field">1日のコマ数<select data-chg="set" data-f="periods" data-num="1">${[2, 3, 4, 5, 6, 7, 8].map(n => opt(n, n + 'コマ', st.periods)).join('')}</select></label>
          <label class="field full">1コマの長さ<select data-chg="set" data-f="unit" data-num="1">${opt(2, '90分（2単位時間）', st.unit)}${opt(1, '50分（1単位時間）', st.unit)}</select></label>
        </div>
        <h4 style="margin:12px 0 6px">時限の時刻</h4>
        <div class="stack" style="gap:6px">${Array.from({ length: st.periods }, (_, i) => `<div class="range-row"><b style="width:36px">${i + 1}限</b>
          <input type="time" value="${esc(st.times[i][0])}" data-chg="set-time" data-i="${i}" data-j="0" aria-label="${i + 1}限の開始"> 〜
          <input type="time" value="${esc(st.times[i][1])}" data-chg="set-time" data-i="${i}" data-j="1" aria-label="${i + 1}限の終了"></div>`).join('')}</div>
        <p class="hint" style="margin-top:8px">時刻の初期値は仮のものです。学校の時間割に合わせて直してください。</p>
      </div>
      <div class="card"><h3>出席・成績の計算</h3>
        <div class="form-grid">
          <label class="field full">遅刻・早退の扱い<select data-chg="set" data-f="lateRatio" data-num="1">${opt(0, '欠課に数えない（出席扱い）', st.lateRatio)}${[2, 3, 4].map(n => opt(n, n + '回で欠課1コマに換算', st.lateRatio)).join('')}</select></label>
          <label class="field full">未評価の項目の想定得点率（%）<input type="number" min="0" max="100" step="5" value="${st.expect}" data-chg="set" data-f="expect" data-num="1"></label>
          <label class="field full">表示テーマ<select data-chg="set" data-f="theme">${opt('auto', '端末の設定に合わせる', st.theme)}${opt('light', 'ライト', st.theme)}${opt('dark', 'ダーク', st.theme)}</select></label>
        </div>
        <p class="hint" style="margin-top:8px">遅刻・早退の換算は学生便覧に明記がないため、担任の先生の説明に合わせて選んでください。</p>
      </div>
      <div class="card"><h3>学年暦（2026年度）</h3>
        <p class="hint">「まとめて出席を記録」や残り授業数の計算、試験までの日数表示に使います。祝日は自動で除きます。</p>
        <div class="form-grid" style="margin-top:8px">
          <label class="field">前期 授業開始<input type="date" value="${cal.firstStart}" data-chg="set-cal" data-f="firstStart"></label>
          <label class="field">前期 終了<input type="date" value="${cal.firstEnd}" data-chg="set-cal" data-f="firstEnd"></label>
          <label class="field">後期 開始<input type="date" value="${cal.secondStart}" data-chg="set-cal" data-f="secondStart"></label>
          <label class="field">後期 授業終了<input type="date" value="${cal.secondEnd}" data-chg="set-cal" data-f="secondEnd"></label>
          ${cal.breaks.map((b, i) => `<label class="field">${i === 0 ? '夏季' : '冬季'}休業 開始<input type="date" value="${esc(b[0])}" data-chg="set-break" data-i="${i}" data-j="0"></label>
          <label class="field">${i === 0 ? '夏季' : '冬季'}休業 終了<input type="date" value="${esc(b[1])}" data-chg="set-break" data-i="${i}" data-j="1"></label>`).join('')}
          <label class="field full">全日休講の日（カンマ区切り）<input type="text" value="${esc(cal.off.join(', '))}" data-chg="set-off" placeholder="2026-11-10, 2026-11-11"></label>
        </div>
        <h4 style="margin:12px 0 6px">試験期間</h4>
        <div class="stack" style="gap:6px">${cal.exams.map((x, i) => `<div class="range-row"><b style="width:92px" class="small">${esc(x.name)}</b>
          <input type="date" value="${esc(x.from)}" data-chg="set-exam" data-i="${i}" data-f="from" aria-label="${esc(x.name)} 開始"> 〜
          <input type="date" value="${esc(x.to)}" data-chg="set-exam" data-i="${i}" data-f="to" aria-label="${esc(x.name)} 終了"></div>`).join('')}</div>
        <p class="hint" style="margin-top:8px">後期の日程は学校の「2026年度 行事予定表（後期）」をもとにした初期値です。前期の試験日程は未入力なので、必要なら入力してください。</p>
      </div>
      <div class="card"><h3>データの保存・バックアップ</h3>
        <dl class="kv"><dt>保存先</dt><dd>このブラウザの localStorage（写真は IndexedDB）</dd>
          <dt>使用量</dt><dd class="num">約 ${kb} KB（localStorage の目安は 5,000 KB）</dd>
          <dt>記録数</dt><dd class="num">課題・試験 ${state.items.length} 件 ／ 出席 ${Object.values(state.att).reduce((a, r) => a + Object.keys(r).length, 0)} コマ</dd></dl>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="export">${icon('down')}バックアップを書き出す</button>
          <label class="btn">${icon('up')}バックアップを読み込む<input type="file" accept="application/json,.json" class="hide" data-chg="import"></label>
        </div>
        <label class="check small" style="margin-top:8px"><input type="checkbox" id="exp-photos" checked> 書き出しに写真も含める</label>
        <hr class="sep">
        <button class="btn danger" data-act="reset-all">${icon('trash')}すべてのデータを消去</button>
        <p class="hint" style="margin-top:8px">ブラウザの閲覧データを消すと記録も消えます。機種変更やブラウザを変えるときはバックアップを書き出してください。</p>
      </div>
    </div>
    <div class="card" style="margin-top:14px"><h3>このアプリについて</h3><div class="prose">
      大阪公立大学工業高等専門学校の <a href="${esc(window.SYLLABUS_META.source)}" target="_blank" rel="noopener">2026年度シラバス（本科）</a> から ${window.SYLLABUS_META.count} 科目を抽出し、
      <a href="https://www.omu.ac.jp/ct/_media/KOSEN_gakuseibinran-original.pdf" target="_blank" rel="noopener">学生便覧</a> の評価・進級・卒業の規程にもとづいて計算しています。
      学校の公式ツールではありません。評価配分はシラバスの文章から機械的に読み取っているため、実際の授業での説明を優先してください。成績予測・単位取得の可能性は目安です。</div></div>`;
};
CHG.set = el => { state.settings[el.dataset.f] = el.dataset.num ? Number(el.value) : el.value; commit(); };
CHG['set-time'] = el => { state.settings.times[Number(el.dataset.i)][Number(el.dataset.j)] = el.value; saveState(); };
CHG['set-cal'] = el => { if (el.value) { state.settings.cal[el.dataset.f] = el.value; commit(); } };
CHG['set-break'] = el => { state.settings.cal.breaks[Number(el.dataset.i)][Number(el.dataset.j)] = el.value; commit(); };
CHG['set-exam'] = el => { state.settings.cal.exams[Number(el.dataset.i)][el.dataset.f] = el.value; commit(); };
CHG['set-off'] = el => { state.settings.cal.off = el.value.split(/[,、\s]+/).map(x => x.trim()).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)); commit(); };

ACT.export = async () => {
  const out = { app: 'kosen-komanavi', v: 1, exported: new Date().toISOString(), state };
  try { if ($('#exp-photos') && $('#exp-photos').checked) out.photos = await Photos.exportAll(); } catch (e) { toast('写真は書き出せませんでした'); }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'komanavi-backup-' + todayYmd() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('バックアップを書き出しました');
};
CHG.import = async el => {
  const f = el.files && el.files[0];
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (!obj || obj.app !== 'kosen-komanavi' || !obj.state) throw new Error('このアプリのバックアップではありません');
    if (!confirm('現在のデータをバックアップの内容で置き換えます。よろしいですか？')) return;
    state = mergeDeep(defaultState(), obj.state);
    registerCustom();
    if (obj.photos) await Photos.importAll(obj.photos);
    commit('バックアップを読み込みました');
  } catch (e) { toast('読み込めませんでした: ' + (e && e.message || e)); }
};
ACT['reset-all'] = async () => {
  if (!confirm('時間割・出席・課題・成績などすべてのデータを消去します。元に戻せません。よろしいですか？')) return;
  try { localStorage.removeItem(STORE_KEY); await Photos.clear(); } catch (e) { /* noop */ }
  state = defaultState(); registerCustom(); UI.pick = null;
  commit('すべて消去しました');
};
