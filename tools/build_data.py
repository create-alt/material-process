# -*- coding: utf-8 -*-
"""Build js/data.js for the timetable app from the 2026 syllabus PDFs (pdftotext -layout output)."""
import re, sys, json, unicodedata, collections

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else None

HEADERS = [
    ('name',     r'【授業科目名】'),
    ('target',   r'【 学 年 ・ 学 科 】'),
    ('term',     r'【 授 業 期 間 】'),
    ('credit',   r'【単位数】'),
    ('dp',       r'【 卒 業 要 件 】'),
    ('ctype',    r'【 単 位 種 別 】'),
    ('field',    r'【 分 野 】'),
    ('form',     r'【 授 業 形 態 】'),
    ('teacher',  r'【 担 当 教 員 】'),
    ('attr',     r'【授業の属性】'),
    ('overview', r'【授業概要】'),
    ('method',   r'【授業の進め方】'),
    ('goals',    r'【科目の達成目標】'),
    ('plan',     r'【授業の内容】'),
    ('outside',  r'【授業時間外の学習】'),
    ('notes',    r'【履修上の注意点】'),
    ('eval',     r'【成績評価の方法】'),
    ('related',  r'【 関 連 科 目 】'),
    ('books',    r'【 教 科 書 等 】'),
    ('refs',     r'【 参 考 書 】'),
]
PAGE_TITLES = re.compile(r'^\s*(一\s*般\s*科\s*目|専\s*門\s*共\s*通\s*科\s*目|基\s*盤\s*専\s*門\s*科\s*目|応\s*用\s*専\s*門\s*科\s*目|'
                         r'エネルギー機械コース|プロダクトデザインコース|エレクトロニクスコース|知能情報コース|'
                         r'-\s*\d+\s*-|\d+)\s*$')

def nfkc(s):
    return unicodedata.normalize('NFKC', s or '')

def split_sections(block):
    pos = 0
    marks = []
    for key, pat in HEADERS:
        # block-level headers must start a line, inline ones may sit mid-line; search forward only
        m = re.compile(r'\s*'.join(re.escape(ch) for ch in pat.replace(' ', ''))).search(block, pos)
        if not m:
            marks.append((key, None, None)); continue
        marks.append((key, m.start(), m.end()))
        pos = m.end()
    out = {}
    real = [x for x in marks if x[1] is not None]
    for i, (key, s, e) in enumerate(real):
        end = real[i + 1][1] if i + 1 < len(real) else len(block)
        out[key] = block[e:end]
    return out

def clean_lines(t):
    lines = []
    for ln in (t or '').split('\n'):
        if PAGE_TITLES.match(ln):
            continue
        lines.append(ln.rstrip())
    return lines

ITEM_START = re.compile(r'^\s*(\d{1,2}[\.\)．、]|\d{1,2}\s|[①-⑳]|【|■|・|※|\(\d+\)|（\d+）)')

def para(t):
    """Join soft-wrapped Japanese lines; keep breaks before numbered / bulleted items."""
    out = []
    for ln in clean_lines(t):
        s = ln.strip()
        if not s:
            continue
        if out and not ITEM_START.match(ln):
            prev = out[-1]
            # ascii word boundary -> keep a space
            if re.search(r'[A-Za-z0-9,.;:]$', prev) and re.match(r'[A-Za-z0-9]', s):
                out[-1] = prev + ' ' + s
            else:
                out[-1] = prev + s
        else:
            out.append(s)
    return '\n'.join(re.sub(r'[ 　]{2,}', ' ', x) for x in out)

def one(t):
    return re.sub(r'\s+', ' ', ' '.join(x.strip() for x in clean_lines(t))).strip()

def parse_plan(t):
    rows = []
    for ln in clean_lines(t):
        if not ln.strip():
            continue
        if re.match(r'^\s*項目\s+時間\s+授業内容', ln):
            continue
        indent = len(ln) - len(ln.lstrip())
        deep = indent >= 12
        m0 = re.match(r'^\s{12,}(\d{1,3})\s+(\S.*)$', ln)                    # same item, new hours row
        m1 = re.match(r'^\s{0,11}(\S(?:.*?\S)?)\s{2,}(\d{1,3})(?:\s+(\S.*))?$', ln)  # item  hours  content
        m2 = re.match(r'^\s{0,11}(\S.*?)\s+(\d{1,3})\s+(\S.*)$', ln)          # loose fallback
        if m0 and rows:
            rows.append(['', int(m0.group(1)), m0.group(2).strip()])
        elif m1:
            rows.append([m1.group(1).strip(), int(m1.group(2)), (m1.group(3) or '').strip()])
        elif m2:
            rows.append([m2.group(1).strip(), int(m2.group(2)), m2.group(3).strip()])
        elif rows:
            s = ln.strip()
            if deep or rows[-1][2] == '' and False:
                rows[-1][2] += s
            else:
                # shallow continuation: belongs to the item column of the last named row
                k = len(rows) - 1
                while k > 0 and rows[k][0] == '':
                    k -= 1
                if len(s) <= 16:
                    rows[k][0] += s
                else:
                    rows[-1][2] += s
        else:
            rows.append([ln.strip(), 0, ''])
    return rows

# ---------------------------------------------------------------- evaluation weights
def norm_eval(text):
    t = nfkc(text)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

LABEL = r'((?:[^\d%、,。;:()\[\]]|\([^()%]*?\))+?)'
NUM = r'(\d{1,3}(?:\.\d+)?)'
def parse_eval(text):
    t = norm_eval(text)
    t = re.sub(r'2\s*/\s*3', '三分の二', t)
    t = re.sub(r'(\d+)\s*割', lambda m: str(int(m.group(1)) * 10) + '%', t)
    t = re.sub(r'(?<![\d.])(\d{1,2})\.\s', ' 。', t)       # list numbering "1. " -> sentence break
    comps = []
    for m in re.finditer(LABEL + r'\s*(?:を|が|は|:|=)?\s*[\(\[]?\s*(?:約|計|合計)?\s*' + NUM + r'\s*%\s*[\)\]]?', t):
        lab = m.group(1); w = float(m.group(2))
        lab = re.sub(r'^.*(について|として|(?:および|及び)(?!その内容)|ならびに|並びに|また|ただし|それぞれ|評価は|配分は|割合は|比率は|総合して|により|による|に対して|では|には|内訳|基準は|到達度を)', '', lab)
        lab = re.sub(r'(の結果|の成績|の比重|によって|にて)$', '', lab)
        lab = re.sub(r'^[\sとやにをがはで・\-~〜.]+', '', lab)
        lab = re.sub(r'[\sをがはのにでと]+$', '', lab).strip()
        if not lab or w <= 0 or w > 100:
            continue
        comps.append([lab, w])
    return comps

def kind_of(label):
    l = label
    if re.search(r'小テスト|確認テスト|単語テスト|理解度テスト|ミニテスト|クイズ|豆テスト', l): return 'quiz'
    if re.search(r'試験|テスト|考査', l): return 'exam'
    if re.search(r'発表|プレゼン|スピーチ|口頭|ポスター|ピッチ', l): return 'present'
    if re.search(r'レポート|課題|提出物|報告書|演習|ノート|作品|成果物|製図|図面|プログラム|宿題|ペーパー|ワーク|論文|制作|製作|設計', l): return 'task'
    if re.search(r'実技|運動|実習|実験', l): return 'practice'
    if re.search(r'取り組み|取組|態度|出席|平常|参加|姿勢|意欲|積極', l): return 'attitude'
    return 'other'

OVR = {}   # filled from overrides file: id -> [[label, weight, kind?], ...]
try:
    OVR = json.load(open(sys.argv[3], encoding='utf-8')) if len(sys.argv) > 3 else {}
except FileNotFoundError:
    OVR = {}

COURSE = {'エネルギー機械コース': 'M', 'プロダクトデザインコース': 'D', 'エレクトロニクスコース': 'E', '知能情報コース': 'I'}
GENERAL = ('理数系', '外国語', '人文・社会系', '保健・体育', '芸術')

subs = []
seen = {}
for y in range(1, 6):
    txt = open(f'{SRC}/y{y}.txt', encoding='utf-8').read()
    parts = re.split(r'科目コード：\s*', txt)
    for p in parts[1:]:
        m = re.match(r'(\S+)\s*\((\d+)\)', p)
        code = m.group(1)
        sec = split_sections(p[m.end():])
        target = one(sec.get('target'))
        # ---- target
        gm = re.match(r'([\d\-,、]+)年\s*(.*)$', target)
        gtxt, rest = gm.group(1), gm.group(2)
        if '-' in gtxt:
            a, b = gtxt.split('-'); grades = list(range(int(a), int(b) + 1))
        else:
            grades = [int(x) for x in re.split(r'[,、]', gtxt)]
        course = None; domain = None; area = None
        for k, v in COURSE.items():
            if k in rest: course = v
        dm = re.search(r'(生活基盤|社会基盤)分野', rest)
        if dm: domain = dm.group(1)
        am = re.search(r'(物質プロセス|物質デザイン|環境インフラ|環境デザイン)領域', rest)
        if am: area = am.group(1)
        teachers = [x.strip() for x in re.split(r'[,、，]', one(sec.get('teacher'))) if x.strip()]
        key = (code, target, ','.join(teachers))
        if key in seen:
            continue
        # ---- name
        nm = one(sec.get('name'))
        mm = re.match(r'^(.*?[^\x00-\x7f][^ ]*)\s+([A-Za-z0-9(].*)$', nm)
        if mm: name, name_en = mm.group(1).strip(), mm.group(2).strip()
        else:  name, name_en = nm, ''
        cr = one(sec.get('credit'))
        cm = re.match(r'(\d+)単位\s*(.*)$', cr)
        credits = int(cm.group(1)); rq = cm.group(2)
        req = {'必履修': 'R', '必履修(必修得)': 'R', '必履修（必修得）': 'R', '必履修(選択)': 'S', '必履修（選択）': 'S', '選択': 'E'}[nfkc(rq).replace(' ', '')]
        must = '必修得' in rq
        dp = one(sec.get('dp'))
        field = one(sec.get('field'))
        plan = parse_plan(sec.get('plan'))
        ctype = one(sec.get('ctype'))
        plan_hours = sum(r[1] for r in plan)
        # 評価認定規程 第2条: 履修単位は1単位=30単位時間、学修単位は1単位=15単位時間の授業
        hours = credits * (30 if ctype == '履修単位' else 15)
        ev_raw = para(sec.get('eval'))
        d = dict(
            code=code, name=name, en=name_en, grades=grades, course=course, domain=domain, area=area,
            term=one(sec.get('term')), credits=credits, req=req, must=must,
            dp=re.sub(r'\s*SDGs科目', '', dp), sdgs=('SDGs' in dp), ctype=ctype, field=field,
            general=field.startswith(GENERAL) or '（一般）' in field,
            form=one(sec.get('form')), teachers=teachers,
            overview=para(sec.get('overview')), method=para(sec.get('method')), goals=para(sec.get('goals')),
            plan=plan, hours=hours, planHours=plan_hours, outside=para(sec.get('outside')), notes=para(sec.get('notes')),
            evalText=ev_raw, related=one(sec.get('related')), books=para(sec.get('books')), refs=para(sec.get('refs')),
        )
        seen[key] = d
        subs.append(d)

# ---- unique ids
cnt = collections.Counter(s['code'] for s in subs)
for s in subs:
    s['id'] = s['code'] if cnt[s['code']] == 1 else s['code'] + '-' + (s['course'] or 'X')
assert len(set(s['id'] for s in subs)) == len(subs), [k for k, v in collections.Counter(s['id'] for s in subs).items() if v > 1]

PASSFAIL = ('卒業研究', 'インターンシップ', '応用専門PBL1', '応用専門PBL2', '防災リテラシー', '総合課題実習1', '総合課題実習2', '総合課題実習3')
report = []
for s in subs:
    s['passfail'] = nfkc(s['name']) in PASSFAIL
    if s['id'] in OVR:
        comps = [[c[0], c[1]] + ([c[2]] if len(c) > 2 else []) for c in OVR[s['id']]]
        src = 'manual'
    else:
        comps = parse_eval(s['evalText']); src = 'auto'
    tot = sum(c[1] for c in comps)
    comps2 = []
    for c in comps:
        k = c[2] if len(c) > 2 else kind_of(c[0])
        w = c[1]; w = int(w) if float(w).is_integer() else w
        comps2.append({'label': c[0], 'w': w, 'kind': k})
    s['comps'] = comps2
    s['compsSrc'] = src if comps2 else 'none'
    ev = nfkc(s['evalText']); planItems = nfkc(' '.join(r[0] + r[2] for r in s['plan']))
    both = ev + ' ' + planItems
    has_exam_comp = any(c['kind'] == 'exam' for c in comps2)
    no_exam = bool(re.search(r'試験は(行わ|実施し)ない|試験を(行わ|実施し)ない|筆記試験は行わず', ev))
    # シラバス巻頭言: 「定期試験」=前期末・学年末試験、「試験」=定期試験+中間試験
    generic = any(c['kind'] == 'exam' and not re.search(r'定期|期末|学年末|中間|実技', nfkc(c['label'])) for c in comps2)
    any_exam = (has_exam_comp or bool(re.search(r'(?<!小)(?<!再認定)(?<!追)試験', ev))) and not no_exam
    no_mid = bool(re.search(r'中間試験は(実施し|行わ)ない', ev))
    s['exam'] = {
        'mid': any_exam and (generic or bool(re.search(r'中間', both))) and not no_mid,
        'final': any_exam and (generic or bool(re.search(r'定期試験|期末|学年末試験', both))),
        'any': any_exam,
    }
    if s['passfail']:
        s['exam'] = {'mid': False, 'final': False, 'any': False}
    report.append((s['id'], s['name'], tot, src, [(c['label'], c['w'], c['kind']) for c in comps2], s['exam']))
    order = ['id', 'code', 'name', 'en', 'grades', 'course', 'domain', 'area', 'term', 'credits', 'req', 'must', 'dp', 'sdgs', 'ctype', 'field', 'general',
             'form', 'teachers', 'hours', 'planHours', 'passfail', 'exam', 'comps', 'compsSrc', 'evalText', 'overview', 'method', 'goals', 'plan', 'outside', 'notes', 'related', 'books', 'refs']
    s2 = {k: s[k] for k in order}
    s.clear(); s.update(s2)

if OUT:
    meta = {
        'year': 2026,
        'school': '大阪公立大学工業高等専門学校',
        'source': 'https://www.omu.ac.jp/ct/syllabus-reg/',
        'count': len(subs),
    }
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('/* 自動生成: 2026年度シラバス（本科）PDF から抽出。tools/build_data.py を参照。 */\n')
        f.write('window.SYLLABUS_META = ' + json.dumps(meta, ensure_ascii=False) + ';\n')
        f.write('window.SYLLABUS = ' + json.dumps(subs, ensure_ascii=False, separators=(',', ':')) + ';\n')
json.dump(report, open('report.json', 'w'), ensure_ascii=False, indent=0)
bad = [r for r in report if abs(r[2] - 100) > 0.01]
print('subjects', len(subs), 'ok', len(report) - len(bad), 'bad', len(bad))
