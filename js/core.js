/* 高専コマナビ — core: 規程の定数・ユーティリティ・保存(localStorage / IndexedDB) */
'use strict';

const SUBJECTS = window.SYLLABUS || [];
const SMAP = new Map(SUBJECTS.map(s => [s.id, s]));

/* ---- 学生便覧「成績評価・学年の課程修了及び卒業の認定等に関する規程」から ---- */
const RULES = {
  passScore: 60,                 // 第12条: 60点以上で単位取得
  attendMin: 2 / 3,              // 第8条2: 総授業時間数の2/3以上の出席が必要
  promote: { 1: 27, 2: 62, 3: 97, 4: 136 },   // 第19条: 累計取得単位数
  grad: {                        // 第23条: 卒業要件
    total: 167, general: 75, special: 82,
    dpA: 21, sdgs: 5, dpB: 39, dpC: 20, dpD: 50, dpE: 16,
    gakushuMax: 60, tokubetsuMax: 60, tokubetsuTableMax: 10,
  },
  letters: [[90, '秀'], [80, '優'], [70, '良'], [60, '可'], [0, '不可']],   // 第9条2
  makeupMax: 80,                 // 第5条4: 追試験は80点が最高（公欠等は100点）
  retakeMax: 60,                 // 第7条: 再認定試験は60点が最高
};

const COURSES = { M: 'エネルギー機械', D: 'プロダクトデザイン', E: 'エレクトロニクス', I: '知能情報' };
const AREAS = { '物質プロセス': '生活基盤', '物質デザイン': '生活基盤', '環境インフラ': '社会基盤', '環境デザイン': '社会基盤' };
const TERMS = ['前期', '後期'];
const DAY_NAMES = ['月', '火', '水', '木', '金', '土'];

/* 科目カテゴリ（色分け用。色は css の --cat-* で定義） */
const CATS = {
  sci: '理数系', lang: '外国語', hum: '人文・社会系', pe: '保健・体育', art: '芸術',
  com: '専門共通', base: '基盤専門', app: '応用専門', custom: 'その他',
};
function catOf(s) {
  if (s.custom) return 'custom';
  const f = s.field || '';
  if (f.startsWith('理数')) return 'sci';
  if (f.startsWith('外国語')) return 'lang';
  if (f.startsWith('人文')) return 'hum';
  if (f.startsWith('保健')) return 'pe';
  if (f.startsWith('芸術')) return 'art';
  if (f.startsWith('専門共通')) return 'com';
  if (f.startsWith('基盤専門')) return 'base';
  if (f.startsWith('応用専門')) return 'app';
  return 'custom';
}

/* 評価項目の種別（色分け・課題との紐付け用） */
const KINDS = {
  exam: '試験', task: '課題・レポート', quiz: '小テスト', present: '発表',
  practice: '実技・実験', attitude: '取り組み', other: 'その他',
};
const KIND_ORDER = ['exam', 'task', 'quiz', 'present', 'practice', 'attitude', 'other'];

/* 出席ステータス */
const ATT = {
  P: { label: '出席', short: '出' },
  A: { label: '欠席', short: '欠' },
  L: { label: '遅刻', short: '遅' },
  E: { label: '早退', short: '早' },
  O: { label: '公欠', short: '公' },
  C: { label: '休講', short: '休' },
};

/* 2026年度（2026/4〜2027/3）の国民の祝日・休日 */
const HOLIDAYS = {
  '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日', '2026-07-20': '海の日', '2026-08-11': '山の日', '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日', '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日', '2027-03-21': '春分の日', '2027-03-22': '振替休日',
};

/* ---------------------------------------------------------------- utils */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function nl2br(v) { return esc(v).replace(/\n/g, '<br>'); }
function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function round1(v) { return Math.round(v * 10) / 10; }
function fmtNum(v) { return Number.isInteger(v) ? String(v) : String(round1(v)); }

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function todayYmd() { return ymd(new Date()); }
function dowIndex(s) { return (parseYmd(s).getDay() + 6) % 7; }          // 月=0 … 日=6
function diffDays(a, b) { return Math.round((parseYmd(a) - parseYmd(b)) / 86400000); }
function fmtDate(s, withYear) {
  if (!s) return '';
  const d = parseYmd(s);
  return (withYear ? d.getFullYear() + '/' : '') + (d.getMonth() + 1) + '/' + d.getDate() + '(' + '日月火水木金土'[d.getDay()] + ')';
}
function relDay(s) {
  const n = diffDays(s, todayYmd());
  if (n === 0) return '今日';
  if (n === 1) return '明日';
  if (n === -1) return '昨日';
  return n > 0 ? 'あと' + n + '日' : Math.abs(n) + '日前';
}
function letterOf(score) {
  for (const [min, l] of RULES.letters) if (score >= min) return l;
  return '不可';
}
function safeUrl(u) {
  const t = String(u || '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(t)) return 'https://' + t;
  return '';
}

/* ---------------------------------------------------------------- state */
const STORE_KEY = 'omuct-komanavi-v1';

function defaultState() {
  return {
    v: 1,
    profile: { grade: 1, term: '前期', course: '', area: '' },
    settings: {
      days: 5, periods: 4, unit: 2,          // unit: 1コマあたりの単位時間（90分=2, 50分=1）
      times: [['09:00', '10:30'], ['10:40', '12:10'], ['13:00', '14:30'], ['14:40', '16:10'], ['16:20', '17:50'], ['18:00', '19:30']],
      lateRatio: 0,                          // 遅刻・早退 n 回で欠課1コマ（0=換算しない）
      expect: 70,                            // まだ評価のない項目の想定得点率(%)
      theme: 'auto',
      cal: {
        firstStart: '2026-04-08', firstEnd: '2026-09-30',
        secondStart: '2026-10-01', secondEnd: '2027-02-12',
        breaks: [['2026-08-09', '2026-09-14'], ['2026-12-26', '2027-01-03']],
        off: ['2026-11-10', '2026-11-11'],   // 高専祭代休など全日休講
        exams: [
          { name: '前期中間試験', from: '', to: '' },
          { name: '前期末試験', from: '', to: '' },
          { name: '後期中間試験', from: '2026-11-20', to: '2026-11-27' },
          { name: '学年末試験', from: '2027-01-26', to: '2027-02-02' },
        ],
      },
    },
    enroll: {},     // {'学年:科目ID': true|false} 既定値からの変更だけを持つ
    tt: {},         // {'1-前期': {'曜-限': {sid, room, note}}}
    att: {},        // {科目ID: {'YYYY-MM-DD#限': 'P|A|L|E|O|C'}}
    items: [],      // 課題・小テスト・試験
    comps: {},      // {科目ID: [{label,w,kind}]} 評価配分の上書き
    manual: {},     // {科目ID: {項目index: 得点率%}} 手入力の見込み
    hoursOv: {},    // {科目ID: 総授業時間数}
    final: {},      // {科目ID: {score:number|null, pass:boolean}} 確定した成績
    special: [],    // 特別学修 [{id,name,credits,table,general}]
    custom: [],     // 自作科目 [{id,name,grades,term,hours,...}]
    memo: {},       // {科目ID: text}
  };
}

function mergeDeep(base, src) {
  if (Array.isArray(base) || Array.isArray(src)) return src === undefined ? base : src;
  if (base && typeof base === 'object') {
    const out = Object.assign({}, base);
    if (src && typeof src === 'object') for (const k of Object.keys(src)) out[k] = k in base ? mergeDeep(base[k], src[k]) : src[k];
    return out;
  }
  return src === undefined ? base : src;
}

let state = defaultState();
let lastSaveError = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state = mergeDeep(defaultState(), JSON.parse(raw));
    else { const m = new Date().getMonth() + 1; state.profile.term = m >= 4 && m <= 9 ? '前期' : '後期'; }
  } catch (e) {
    console.warn('load failed', e);
  }
  registerCustom();
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    lastSaveError = null;
    return true;
  } catch (e) {
    lastSaveError = e;
    console.warn('save failed', e);
    return false;
  }
}
function storageBytes() {
  try { return (localStorage.getItem(STORE_KEY) || '').length * 2; } catch (e) { return 0; }
}

/* 自作科目（HR・特別活動・補習など）を科目マップへ登録 */
function customToSubject(c) {
  return Object.assign({
    code: '自作', en: '', course: null, domain: null, area: null, credits: 0, req: 'E', must: false, dp: '', sdgs: false,
    ctype: '', field: 'その他', general: false, form: '', teachers: [], hours: 30, planHours: 0, passfail: false,
    exam: { mid: false, final: false, any: false }, comps: [], compsSrc: 'none', evalText: '', overview: '', method: '',
    goals: '', plan: [], outside: '', notes: '', related: '', books: '', refs: '', custom: true,
  }, c);
}
function registerCustom() {
  for (const [id, s] of Array.from(SMAP)) if (s.custom) SMAP.delete(id);
  for (const c of state.custom) SMAP.set(c.id, customToSubject(c));
}
function allSubjects() { return Array.from(SMAP.values()); }
function subj(id) { return SMAP.get(id); }

/* ---------------------------------------------------------------- 写真 (IndexedDB) */
const Photos = (() => {
  const DB = 'omuct-komanavi-photos', STORE = 'photos';
  let dbp = null;
  const urls = new Map();
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('IndexedDB が使えません'));
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath: 'id' });
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(STORE, mode);
      const rq = fn(t.objectStore(STORE));
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }
  /* 画像を長辺1600pxのJPEGへ縮小して保存容量を抑える */
  function shrink(file) {
    return new Promise((res) => {
      if (!/^image\//.test(file.type)) return res(file);
      const img = new Image();
      const u = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(u);
        cv.toBlob(b => res(b || file), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(u); res(file); };
      img.src = u;
    });
  }
  async function add(file) {
    const blob = await shrink(file);
    const rec = { id: uid('ph'), name: file.name || 'photo.jpg', type: blob.type || file.type, blob, created: Date.now() };
    await tx('readwrite', s => s.put(rec));
    return rec.id;
  }
  async function get(id) { return tx('readonly', s => s.get(id)); }
  async function del(id) {
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
    return tx('readwrite', s => s.delete(id));
  }
  async function url(id) {
    if (urls.has(id)) return urls.get(id);
    const rec = await get(id);
    if (!rec) return '';
    const u = URL.createObjectURL(rec.blob);
    urls.set(id, u);
    return u;
  }
  async function all() { return tx('readonly', s => s.getAll()); }
  async function clear() { urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); return tx('readwrite', s => s.clear()); }
  function blobToDataUrl(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  }
  async function exportAll() {
    const out = [];
    for (const r of await all()) out.push({ id: r.id, name: r.name, type: r.type, created: r.created, data: await blobToDataUrl(r.blob) });
    return out;
  }
  async function importAll(list) {
    for (const r of list || []) {
      const blob = await (await fetch(r.data)).blob();
      await tx('readwrite', s => s.put({ id: r.id, name: r.name, type: r.type, created: r.created, blob }));
    }
  }
  return { add, get, del, url, all, clear, exportAll, importAll };
})();
