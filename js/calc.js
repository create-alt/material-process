/* 高専コマナビ — calc: 履修判定・暦・出席・成績予測・単位集計 */
'use strict';

/* ---------------------------------------------------------------- 履修 */
/* その学年で、プロフィール（コース・領域）に対して開講される科目か */
function isOffered(s, grade, prof) {
  prof = prof || state.profile;
  if (!s.grades.includes(grade)) return false;
  if (s.course && s.course !== prof.course) return false;
  if (s.area && prof.area && s.area !== prof.area) return false;
  if (s.domain && !s.area && prof.area && s.domain !== AREAS[prof.area]) return false;
  return true;
}
/* 既定で履修している扱いにするか（必履修 / 選んだ領域の選択必履修） */
function defaultEnrolled(s, grade, prof) {
  prof = prof || state.profile;
  if (s.custom) return true;
  if (s.req === 'R') return true;
  if (s.req === 'S') {
    if (s.area) return !!prof.area && s.area === prof.area;
    if (s.domain) return !!prof.area && s.domain === AREAS[prof.area];
  }
  return false;
}
function isEnrolled(s, grade) {
  const k = grade + ':' + s.id;
  if (k in state.enroll) return !!state.enroll[k];
  return defaultEnrolled(s, grade);
}
function setEnrolled(s, grade, on) {
  const k = grade + ':' + s.id;
  if (on === defaultEnrolled(s, grade)) delete state.enroll[k]; else state.enroll[k] = on;
}
function offeredSubjects(grade) { return allSubjects().filter(s => isOffered(s, grade)); }
function enrolledSubjects(grade) { return offeredSubjects(grade).filter(s => isEnrolled(s, grade)); }
function inTerm(s, term) { return s.term === '通年' || s.term === '半期' || s.term === term; }
function reqLabel(s) {
  if (s.custom) return '自作';
  return s.req === 'R' ? '必履修' : s.req === 'S' ? '選択必履修' : '選択';
}

/* ---------------------------------------------------------------- 時間割 */
function ttKey(grade, term) { return grade + '-' + term; }
function ttOf(grade, term) {
  const k = ttKey(grade, term);
  if (!state.tt[k]) state.tt[k] = {};
  return state.tt[k];
}
function ttPeek(grade, term) { return state.tt[ttKey(grade, term)] || {}; }
function placedCount(grade, term, sid) {
  return Object.values(ttPeek(grade, term)).filter(c => c.sid === sid).length;
}
/* 1週あたりの目安コマ数（総授業時間数から） */
function weeklySlots(s) {
  const weeks = s.term === '通年' ? 30 : 15;
  return hoursOf(s) / state.settings.unit / weeks;
}
function hoursOf(s) { return state.hoursOv[s.id] != null ? state.hoursOv[s.id] : s.hours; }

/* ---------------------------------------------------------------- 暦 */
function termOfDate(d) { return d >= state.settings.cal.secondStart ? '後期' : '前期'; }
function examPeriodOf(d) {
  return state.settings.cal.exams.find(x => x.from && x.to && d >= x.from && d <= x.to) || null;
}
function dayInfo(d) {
  const cal = state.settings.cal;
  const dow = dowIndex(d);
  if (dow >= state.settings.days) return { cls: false, why: '休日' };
  if (HOLIDAYS[d]) return { cls: false, why: HOLIDAYS[d] };
  if (cal.off.includes(d)) return { cls: false, why: '休講日' };
  for (const [a, b] of cal.breaks) if (a && b && d >= a && d <= b) return { cls: false, why: '休業期間' };
  if (d < cal.firstStart || d > cal.secondEnd) return { cls: false, why: '授業期間外' };
  const ex = examPeriodOf(d);
  if (ex) return { cls: false, why: ex.name };
  return { cls: true, why: '' };
}
/* 指定日の授業コマ一覧（時間割から） */
function slotsOn(d, grade) {
  grade = grade || state.profile.grade;
  const dow = dowIndex(d);
  const tt = ttPeek(grade, termOfDate(d));
  const out = [];
  for (let p = 0; p < state.settings.periods; p++) {
    const c = tt[dow + '-' + p];
    if (c && subj(c.sid)) out.push({ p, cell: c, s: subj(c.sid), key: d + '#' + p });
  }
  return out;
}
function eachDay(from, to, fn) {
  let d = from, guard = 0;
  while (d <= to && guard++ < 800) { fn(d); d = addDays(d, 1); }
}
/* 今日より後に残っている授業コマ数（時間割と暦からの概算） */
function remainingSlots(s, grade) {
  const cal = state.settings.cal;
  let n = 0;
  const from = addDays(todayYmd(), 1);
  eachDay(from < cal.firstStart ? cal.firstStart : from, cal.secondEnd, d => {
    if (!dayInfo(d).cls) return;
    for (const sl of slotsOn(d, grade)) if (sl.s.id === s.id) n++;
  });
  return n;
}

/* ---------------------------------------------------------------- 出席 */
function attOf(sid) { return state.att[sid] || {}; }
function setAtt(sid, key, st) {
  if (!state.att[sid]) state.att[sid] = {};
  if (st) state.att[sid][key] = st; else delete state.att[sid][key];
  if (!Object.keys(state.att[sid]).length) delete state.att[sid];
}
function attStats(s) {
  const unit = state.settings.unit;
  const cnt = { P: 0, A: 0, L: 0, E: 0, O: 0, C: 0 };
  for (const v of Object.values(attOf(s.id))) if (cnt[v] != null) cnt[v]++;
  const ratio = state.settings.lateRatio;
  const lateAsAbs = ratio > 0 ? Math.floor((cnt.L + cnt.E) / ratio) : 0;
  const absentSlots = cnt.A + lateAsAbs;
  const attendedSlots = cnt.P + cnt.L + cnt.E + cnt.O - lateAsAbs;
  const total = hoursOf(s);
  const maxAbsH = Math.floor(total / 3 + 1e-9);          // 欠課できる上限（単位時間）
  const absentH = absentSlots * unit;
  const maxAbsSlots = Math.floor(maxAbsH / unit);
  const remainSlots = maxAbsSlots - absentSlots;
  const recorded = cnt.P + cnt.A + cnt.L + cnt.E + cnt.O;
  let level = 'ok';
  if (absentH > maxAbsH) level = 'fail';
  else if (remainSlots <= 0 && absentSlots > 0) level = 'danger';
  else if (maxAbsSlots > 0 && absentSlots / maxAbsSlots >= 0.6) level = 'warn';
  return {
    cnt, lateAsAbs, absentSlots, attendedSlots, recorded, total, totalSlots: total / unit,
    maxAbsH, absentH, maxAbsSlots, remainSlots, level,
    rate: recorded ? (recorded - absentSlots) / recorded : null,
    used: maxAbsSlots > 0 ? clamp(absentSlots / maxAbsSlots, 0, 1) : (absentSlots > 0 ? 1 : 0),
  };
}
const ATT_LEVEL = {
  ok: { label: '余裕あり', cls: 'good' },
  warn: { label: '注意', cls: 'warning' },
  danger: { label: 'もう休めない', cls: 'serious' },
  fail: { label: '出席不足', cls: 'critical' },
};

/* ---------------------------------------------------------------- 成績 */
function compsOf(s) {
  const ov = state.comps[s.id];
  if (ov && ov.length) return ov;
  if (s.comps && s.comps.length) return s.comps;
  return [{ label: s.passfail ? '総合評価（合否判定）' : '総合評価', w: 100, kind: 'other' }];
}
function itemsOf(sid) { return state.items.filter(i => i.sid === sid); }
function itemRate(i) {
  if (i.score != null && i.score !== '' && i.max > 0) return clamp(i.score / i.max, 0, 1);
  if (i.status === 'missed') return 0;      // 未提出は0点扱い
  return null;
}
function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/* 科目ごとの成績見込み
   - 評価項目ごとに、記録済みの点数（未提出は0点）の平均を得点率とする
   - まだ記録のない項目は「これまでの得点率」と「想定得点率(設定)」をならした値で補う
   - 見込み点のばらつきは、未確定の配点が多いほど大きいとみなして合格確率を出す */
function gradeStats(s) {
  const comps = compsOf(s);
  const wsum = comps.reduce((a, c) => a + (Number(c.w) || 0), 0) || 100;
  const items = itemsOf(s.id);
  const manual = state.manual[s.id] || {};
  const rows = comps.map((c, idx) => {
    const w = (Number(c.w) || 0) * 100 / wsum;
    const mine = items.filter(i => i.comp === idx);
    const rates = mine.map(itemRate).filter(r => r != null);
    let rate = null, src = '';
    if (manual[idx] != null && manual[idx] !== '') { rate = clamp(manual[idx] / 100, 0, 1); src = 'manual'; }
    else if (rates.length) { rate = rates.reduce((a, b) => a + b, 0) / rates.length; src = 'items'; }
    return { idx, label: c.label, kind: c.kind || 'other', w, rate, src, n: rates.length, pending: mine.length - rates.length, count: mine.length };
  });
  const known = rows.reduce((a, r) => a + (r.rate != null ? r.w : 0), 0);
  const partial = rows.reduce((a, r) => a + (r.rate != null ? r.w * r.rate : 0), 0);
  const prior = state.settings.expect / 100, priorW = 20;
  const expectRate = (partial + prior * priorW) / (known + priorW);
  const rest = 100 - known;
  let pred = partial + rest * expectRate;
  const sd = 3 + 15 * Math.sqrt(rest / 100);
  const att = attStats(s);
  const fin = state.final[s.id];
  let pPass = normCdf((pred - RULES.passScore) / sd);
  let note = '';
  if (att.level === 'fail') { pPass = 0; note = '出席時数が総授業時間数の2/3に届かないため、原則0点になります'; }
  let fixed = false, passed = null;
  if (fin && (fin.score != null || fin.pass != null)) {
    fixed = true;
    passed = fin.score != null ? fin.score >= RULES.passScore : !!fin.pass;
    pPass = passed ? 1 : 0;
    if (fin.score != null) pred = fin.score;
  }
  const need = {};
  for (const t of [60, 70, 80, 90]) need[t] = rest > 0.001 ? (t - partial) / rest : (partial >= t ? -1 : 2);
  let level = 'good';
  if (pPass < 0.4) level = 'critical'; else if (pPass < 0.7) level = 'serious'; else if (pPass < 0.9) level = 'warning';
  // 点数の記録がまだない科目は判定せず、集計では「取得できる」と仮定する
  const noData = !fixed && known <= 0 && att.level !== 'fail';
  if (noData) level = 'neutral';
  const pEff = noData ? 1 : pPass;
  return {
    noData, pEff,
    rows, known, partial, rest, pred, sd, lo: clamp(pred - sd, 0, 100), hi: clamp(pred + sd, 0, 100),
    pPass, level, need, att, fixed, passed, final: fin || null, note,
    letter: s.passfail ? (pPass >= 0.5 ? '合' : '否') : letterOf(att.level === 'fail' && !fixed ? 0 : pred),
    hasData: known > 0,
  };
}
const PASS_LEVEL = {
  good: { label: '安全圏', cls: 'good' },
  warning: { label: 'やや注意', cls: 'warning' },
  serious: { label: '要注意', cls: 'serious' },
  critical: { label: '危険', cls: 'critical' },
  neutral: { label: '記録なし', cls: 'neutral' },
};

/* ---------------------------------------------------------------- 単位 */
function earnedState(s) {
  const f = state.final[s.id];
  if (!f || (f.score == null && f.pass == null)) return null;
  return f.score != null ? f.score >= RULES.passScore : !!f.pass;
}
function specialCredits() {
  const g = RULES.grad;
  let table = 0, other = 0, general = 0, special = 0;
  for (const x of state.special) {
    const c = Number(x.credits) || 0;
    if (x.table) table += c; else other += c;
  }
  const tableCapped = Math.min(table, g.tokubetsuTableMax);
  const total = Math.min(tableCapped + other, g.tokubetsuMax);
  // 一般/専門への振り分けは、上限でカットした比率で按分
  const raw = table + other;
  for (const x of state.special) {
    const c = (Number(x.credits) || 0) * (raw > 0 ? total / raw : 0);
    if (x.general) general += c; else special += c;
  }
  return { raw, table, tableCapped, other, total, general, special };
}
function emptyTally() {
  return { total: 0, general: 0, special: 0, dpA: 0, dpB: 0, dpC: 0, dpD: 0, dpE: 0, sdgs: 0, gakushu: 0 };
}
function addTally(t, s, k) {
  const c = s.credits * k;
  t.total += c;
  if (s.general) t.general += c; else t.special += c;
  const dp = { 'DP-A': 'dpA', 'DP-B': 'dpB', 'DP-C': 'dpC', 'DP-D': 'dpD', 'DP-E': 'dpE' }[s.dp];
  if (dp) t[dp] += c;
  if (s.sdgs) t.sdgs += k;
  if (s.ctype === '学修単位') t.gakushu += c;
}
/* 全学年の単位集計: earned=確定, expect=確定+現学年の見込み(確率加重), plan=履修予定すべて */
function creditSummary() {
  const cur = state.profile.grade;
  const earned = emptyTally(), expect = emptyTally(), plan = emptyTally(), best = emptyTally();
  const byGrade = {};
  const seen = new Set();
  for (let g = 1; g <= 5; g++) {
    const list = enrolledSubjects(g).filter(s => !s.custom);
    const row = { grade: g, subjects: list, earned: 0, expect: 0, plan: 0, mustRisk: [], unknown: 0, assumed: 0 };
    for (const s of list) {
      if (seen.has(s.id)) continue;        // 複数学年に開講される科目は一度だけ数える
      const es = earnedState(s);
      seen.add(s.id);
      addTally(plan, s, 1); row.plan += s.credits;
      if (es === true) {
        addTally(earned, s, 1); addTally(expect, s, 1); addTally(best, s, 1);
        row.earned += s.credits; row.expect += s.credits;
      } else if (es === false) {
        if (s.must) row.mustRisk.push({ s, p: 0 });
      } else if (g === cur) {
        const gs = gradeStats(s);
        addTally(expect, s, gs.pEff); addTally(best, s, 1);
        row.expect += s.credits * gs.pEff;
        if (gs.noData) row.assumed += s.credits;
        if (s.must && gs.pEff < 0.9) row.mustRisk.push({ s, p: gs.pEff });
      } else {
        row.unknown += s.credits;
        if (g > cur) addTally(best, s, 1);
      }
    }
    byGrade[g] = row;
  }
  const sp = specialCredits();
  for (const t of [earned, expect, plan, best]) { t.total += sp.total; t.general += sp.general; t.special += sp.special; t.tokubetsu = sp.total; }
  return { earned, expect, plan, best, byGrade, special: sp, cur, need: RULES.promote[cur] || null };
}
/* 単位加重の平均点と参考GPA（確定成績のうち点数のある科目） */
function scoreAverages() {
  let cs = 0, sum = 0, gp = 0;
  for (const [sid, f] of Object.entries(state.final)) {
    const s = subj(sid);
    if (!s || s.custom || f.score == null || !s.credits) continue;
    cs += s.credits; sum += f.score * s.credits;
    gp += (f.score >= 90 ? 4 : f.score >= 80 ? 3 : f.score >= 70 ? 2 : f.score >= 60 ? 1 : 0) * s.credits;
  }
  return cs ? { avg: sum / cs, gpa: gp / cs, credits: cs } : null;
}
/* 学修単位の授業外学習の目安（1単位=45時間の学修、うち授業15単位時間） */
function selfStudyWeekly(s) {
  if (s.ctype !== '学修単位') return 0;
  const weeks = s.term === '通年' ? 30 : 15;
  return (s.credits * 45 - s.hours) / weeks;
}
