"""卒業研究発表講演会概要（docx）を学科配布テンプレートから作成する。

テンプレートの段組・余白（A4, 上下20 mm, 2段組・段間10 mm）とヘッダ部の書式をそのまま使い、
表題・氏名・英文アブストラクト・本文・図表を差し替える。

使い方: python3 tools/make_abstract.py <テンプレート.docx> <出力.docx>
"""
import copy
import re
import sys
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import qn
from docx.shared import Mm, Pt

ROOT = Path(__file__).resolve().parent.parent
FIG = ROOT / "abstract" / "fig"

MINCHO, GOTHIC, TIMES = "ＭＳ 明朝", "ＭＳ ゴシック", "Times New Roman"
COL_W = Mm(85)  # 段幅 = (210 - 15*2 - 10) / 2

# ---------------------------------------------------------------- 原稿の中身
TITLE_JA = "恒温恒湿熱風環境における毛髪束の乾燥挙動と乾燥特性曲線の評価"
TITLE_EN = ("Evaluation of Drying Behavior and Characteristic Curves of Hair Bundles "
            "in Constant Temperature and Humidity Convective Environment")
NAME_JA = "久保田　快　（指導教員：平林　大介）"
NAME_EN = "Kai KUBOTA"
ABSTRACT = (
    "The drying behavior of human hair bundles was measured in hot air at 50, 90 and 130 °C under constant "
    "humidity, and the drying characteristic curves were analyzed. Unlike the conventional view of "
    "internal-diffusion-controlled drying (Type C), a distinct constant-rate period appeared, followed by a two-stage falling-rate period with a convex-upward profile (Type B). "
    "The apparent activation energies of all periods converged to 25–28 kJ/mol, below the latent heat of "
    "evaporation, indicating that capillary water supply through inter-fiber pores sustains evaporation even "
    "in the falling-rate period. A hierarchical grain model treating the bundle as a pellet and each fiber as "
    "a grain was formulated, and its temperature-coupled form predicted the drying behavior from 40 to "
    "140 °C. SEM images showed cuticle fusion caused by overheating after drying; switching the air "
    "temperature at the second critical moisture content is proposed to prevent such damage.")
KEYWORDS = "Drying, Characteristic Curve, Hair Bundle, Grain Model, Activation Energy"

# 本文。各要素は ("h", 見出し) / ("p", 段落) / ("fig", ファイル, 幅mm, キャプション) / ("tab",) / ("eq",)
# fig の 5 番目の要素 "top"/"bottom" は浮動配置（直後の段落と同じ段の上端/下端）。
# 配置計画：1頁左下 Fig.1，1頁右下 Fig.2，2頁左上 Fig.4・左下 Fig.3，2頁右上 Fig.5。
# アンカー段落は段の境目から離れた位置を選び，1段に上端・下端それぞれ1つまでとする。
# 段落中の _{x} は下付き、^{x} は上付き、*x* は斜体（変数）として組む。
BODY = [
    ("h", "１．緒　言"),
    ("fig", "fig1_drying_curves.png", 68,
     "Fig. 1  Measured drying behavior of hair bundles at 50, 90 and 130 °C: (a) drying characteristic "
     "curves and (b) moisture content histories.", "bottom"),
    ("p", "毛髪は硬ケラチンを主成分とする生体繊維であり，含水状態で弾性や光沢が大きく変化する^{(1)}．"
          "近年のヘアドライヤは温度制御機能を備え，低温・大風量化による速乾と熱ダメージ抑制の両立が図られているが，"
          "過乾燥による過熱はヘアカラーの色抜けやケラチンの熱変性による髪質悪化を招く．"
          "一方，毛髪の乾燥は内部拡散支配の減率乾燥（C 型）とみなされることが多く^{(2)}，"
          "毛髪束の乾燥速度を化学工学の乾燥特性曲線として評価した例は少ない．"
          "本研究では，恒温恒湿熱風中で毛髪束の乾燥速度を測定し，乾燥特性曲線の形状と温度依存性から"
          "毛束内の水分移動機構を明らかにするとともに，熱損傷を抑える送風制御の指針を得ることを目的とした．"),
    ("h", "２．実験方法"),
    ("p", "日本人成人の毛髪（平均直径 *d* = 80 μm，密度 *ρ* = 1.30×10^{3} kg/m^{3}）を脱脂洗浄して束ね"
          "（絶乾質量 *W*_{0} = 0.3553 g），精製水に 1 h 浸漬して飽和膨潤させ，余剰水を除去して試料とした．"
          "送風循環式恒温槽内で試料を金網バスケットに懸垂し，風速 1.20 m/s，相対湿度約 15 % の熱風"
          "（*T*_{d} = 50，90，130 ℃）中で質量を 2 min ごとに電子天秤（0.1 mg）で記録した．"
          "乾量基準含水率 *W*_{dry} = (*W* − *W*_{0})/*W*_{0} と，単繊維の総表面積 "
          "*A* = 4*W*_{0}/(*dρ*) = 0.01366 m^{2} を基準とする乾燥速度 *R* = −(*W*_{0}/*A*)d*W*_{dry}/d*t* を求めた．"),
    ("h", "３．実験結果および考察"),
    ("h2", "3.1　乾燥特性曲線"),
    ("p", "Fig. 1 に乾燥特性曲線 (a) と含水率履歴 (b) を，Table 1 に特性値を示す．"
          "130 ℃では，初期含水率約 3.3 kg/kg から限界含水率 *W*_{c1} = 2.25 kg/kg まで乾燥速度が"
          " *R*_{c} = 0.355 kg/(m^{2}·h) で一定となる恒率乾燥期間（II）が明瞭に現れた．"
          "続く減率乾燥期間は二段階となり，減率第 1 期間（III-1）では限界点 (*W*_{c1}, *R*_{c}) と"
          "平衡点 (*W*_{e}, 0) を結ぶ弦より上に膨らむ「上に凸」の B 型曲線を，"
          "第 2 臨界含水率 *W*_{c2} = 0.62 kg/kg 以下の減率第 2 期間（III-2）ではほぼ直線的な速度低下を示した．"
          "この形状は全温度で共通であり，温度上昇に伴い *R*_{c} は約 7.4 倍に増加し，"
          "乾燥完了時間 *t*_{e} は 148 min から 42 min に短縮した．"),
    ("fig", "fig3_arrhenius.png", 70,
     "Fig. 2  Arrhenius plots of rate parameters in each drying period.", "bottom"),
    ("tab",),
    ("h2", "3.2　活性化エネルギー"),
    ("p", "各期間の代表速度（恒率速度 *R*_{c}，減率第 1 期の変曲点速度 *R*_{c2}，減率第 2 期の速度係数 *K*_{2}）の"
          "アレニウスプロットを Fig. 2 に示す．見かけの活性化エネルギーはそれぞれ 27.60，25.08，27.87 kJ/mol と"
          "全期間で 25〜28 kJ/mol の狭い範囲に収まり，水の蒸発潜熱（約 40〜44 kJ/mol）や"
          "一般的な多孔体の内部拡散律速期（50〜80 kJ/mol）^{(2)}より小さかった．"
          "これは減率期においても蒸発面への水分補給が毛束間隙の毛細管流で維持され，"
          "気相境膜内の水蒸気移動が律速し続けることを示している．"),
    ("h2", "3.3　毛髪表面の SEM 観察"),
    ("fig", "fig2_sem.png", 72,
     "Fig. 3  SEM images of hair surfaces: (a) before drying and (b) after drying at 130 °C for 1 h.", "bottom"),
    ("p", "130 ℃で 1 h 乾燥した毛髪では，キューティクル端部の平滑化と鱗片の熱融着が観察された（Fig. 3）．"
          "水が蒸発している間は潜熱により毛髪温度は湿球温度付近に保たれるが，"
          "乾燥完了後は熱風温度まで上昇するため，過乾燥が熱損傷の主因と考えられる．"),
    ("fig", "fig4_grain_model.png", 76,
     "Fig. 4  Hierarchical grain model: (a) hair bundle as a pellet and (b) single fiber as a grain.", "top"),
    ("h", "４．階層的グレインモデル"),
    ("p", "多孔質反応工学のグレインモデル^{(3)}を拡張し，毛髪束をペレット，単繊維をグレインとみなした（Fig. 4）．"
          "減率第 1 期は繊維間マクロ空隙の水が毛細管力で外表面へ補給されつつ湿潤核が後退する過程，"
          "減率第 2 期は単繊維ケラチン内の結合水の拡散過程として，乾燥速度を次式で表した．"),
    ("eq",),
    ("p0", "ここで *u* = *W* − *W*_{c2} + *δ*，*u*_{1} = *W*_{c1} − *W*_{c2} + *δ*，"
           "*θ* = (*W* − *W*_{e})/(*W*_{c2} − *W*_{e}) であり，*R*_{c2}^{*} は *W* = *W*_{c2} で速度が連続となる値である．"
           "式(1) は閉形式で時間積分でき，任意の含水率までの乾燥時間が得られる．"
           "130 ℃の実測に対する決定係数は *R*^{2} = 0.989 であった．"),
    ("p", "さらに *R*_{c} = 98.85 exp(−18.58×10^{3}/*R*_{g}*T*) とし，構造パラメータ（*W*_{c1} = 2.50，"
          "*W*_{c2} = 0.70，*W*_{e} = 0.038 kg/kg，*α*_{M} = 0.35，*δ* = 0.090）を温度によらず一定とした"
          "温度連成モデルで 40〜140 ℃の乾燥挙動を予測した（Fig. 5）．実測との誤差は RMSE < 0.024 kg/kg であり，"
          "乾燥完了時間（*W* ≤ 0.05 kg/kg）は 40 ℃の約 171 min から 140 ℃の約 30 min まで短縮する．"),
    ("h", "５．ドライヤ制御への応用"),
    ("p", "*W* ≥ *W*_{c2} では潜熱冷却により毛髪温度が低く保たれるため，高温（100〜130 ℃）の送風で速やかに"
          "水分を除去し，蒸発面が繊維内部へ沈んで毛髪温度が上昇し始める *W*_{c2} ≈ 0.70 kg/kg で"
          "60 ℃以下に切り替える制御（Fig. 5(b) 破線）が，速乾と熱変性・色抜けの防止の両立に有効である．"),
    ("fig", "fig5_prediction.png", 72,
     "Fig. 5  Prediction by the temperature-coupled grain model (40–140 °C): (a) drying characteristic "
     "curves and (b) moisture content histories. Dashed line: air temperature switched from 130 °C to "
     "60 °C at W_c2.", "top"),
    ("h", "６．結　言"),
    ("p", "(1) 毛髪束の乾燥特性曲線は恒率期と二段階の減率期からなる B 型であり，"
          "内部拡散支配（C 型）とする従来の見方は毛髪束には当てはまらない．"),
    ("p", "(2) 各乾燥期間の見かけの活性化エネルギーは 25〜28 kJ/mol に収束し，"
          "毛束間隙の毛細管補給が減率期の乾燥速度を支配する．"),
    ("p", "(3) グレインモデルに基づく温度連成モデルで 40〜140 ℃の乾燥挙動を予測でき，"
          "*W*_{c2} での送風温度切替が熱損傷の抑制に有効であることを示した．"),
    ("h", "参考文献"),
    ("ref", "(1) Feughelman, M., Mechanical Properties and Structure of Alpha-Keratin Fibres (1997), UNSW Press."),
    ("ref", "(2) 化学工学会編，化学工学便覧 改訂七版 (2011)，丸善．"),
]
LAST_REF = "(3) Szekely, J., Evans, J. W. and Sohn, H. Y., Gas-Solid Reactions (1976), Academic Press."

TABLE_CAPTION = "Table 1  Drying parameters at each air temperature"
TABLE = [
    ("T_d [°C]", "R_c [kg/(m²·h)]", "W_c1 [kg/kg]", "t_c [min]", "t_e [min]", "W_e [kg/kg]"),
    ("50", "0.048", "3.12", "20", "148", "0.182"),
    ("90", "0.252", "3.01", "7", "78", "0.171"),
    ("130", "0.355", "2.25", "10", "42", "0.098"),
]


# ---------------------------------------------------------------- 書式ヘルパ
def set_font(run, ascii_=TIMES, east=MINCHO, size=9, bold=False, italic=False, va=None):
    rpr = run._r.get_or_add_rPr()
    rf = rpr.find(qn("w:rFonts"))
    if rf is None:
        rf = parse_xml('<w:rFonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')
        rpr.insert(0, rf)
    for k, v in (("w:ascii", ascii_), ("w:hAnsi", ascii_), ("w:eastAsia", east), ("w:cs", ascii_)):
        rf.set(qn(k), v)
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    if va == "sub":
        run.font.subscript = True
    elif va == "sup":
        run.font.superscript = True


TOKEN = re.compile(r"\*([^*]+)\*|_\{([^}]*)\}|\^\{([^}]*)\}")


def add_rich(p, text, size=9, east=MINCHO, bold=False):
    """*x* = 斜体, _{x} = 下付き, ^{x} = 上付き を解釈して段落に追加する。"""
    pos = 0
    for m in TOKEN.finditer(text):
        if m.start() > pos:
            set_font(p.add_run(text[pos:m.start()]), east=east, size=size, bold=bold)
        it, sub, sup = m.groups()
        if it is not None:
            set_font(p.add_run(it), east=east, size=size, italic=True, bold=bold)
        elif sub is not None:
            # 下付きの中の英字は変数の添字として立体（M, c1 等）。
            set_font(p.add_run(sub), east=east, size=size, va="sub", bold=bold)
        else:
            set_font(p.add_run(sup), east=east, size=size, va="sup", bold=bold)
        pos = m.end()
    if pos < len(text):
        set_font(p.add_run(text[pos:]), east=east, size=size, bold=bold)


def clear_runs(p):
    for child in list(p._p):
        if child.tag != qn("w:pPr"):
            p._p.remove(child)


def body_par(doc, anchor, indent=True, align=None, keep_next=False, space_before=0):
    p = doc.add_paragraph()
    anchor._p.addprevious(p._p)
    pf = p.paragraph_format
    pf.line_spacing = 1.0
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(0)
    if indent:
        pf.first_line_indent = Pt(9)
    if align is not None:
        p.alignment = align
    if keep_next:
        pf.keep_with_next = True
    return p


# ---------------------------------------------------------------- 数式 (OMML)
M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' \
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def mr(t, plain=False):
    sty = '<m:rPr><m:sty m:val="p"/></m:rPr>' if plain else ""
    font = f'<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:sz w:val="18"/></w:rPr>'
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f'<m:r>{sty}{font}<m:t xml:space="preserve">{t}</m:t></m:r>'


def msub(base, sub):
    return f"<m:sSub><m:e>{mr(base)}</m:e><m:sub>{mr(sub, plain=True)}</m:sub></m:sSub>"


def msubsup(base, sub, sup):
    return (f"<m:sSubSup><m:e>{mr(base)}</m:e><m:sub>{mr(sub, plain=True)}</m:sub>"
            f"<m:sup>{mr(sup, plain=True)}</m:sup></m:sSubSup>")


def mfrac(num, den):
    return f"<m:f><m:num>{num}</m:num><m:den>{den}</m:den></m:f>"


def rate_equation():
    Rc, Wc1, Wc2, We = msub("R", "c"), msub("W", "c1"), msub("W", "c2"), msub("W", "e")
    gap = mr(",\u2003", plain=True)
    rows = [
        Rc + gap + mr("(", True) + mr("W") + mr("≥", True) + Wc1 + mr(")", True),
        mfrac(Rc, mr("1+", True) + msub("α", "M") + mr(" ln", True) + mr("(", True) + msub("u", "1")
              + mr("/") + mr("u") + mr(")", True))
        + gap + mr("(", True) + Wc2 + mr("≤", True) + mr("W") + mr("<", True) + Wc1 + mr(")", True),
        msubsup("R", "c2", "*") + mr("θ") + mr("[1+", True) + msub("β", "2") + mr("(1−", True)
        + mr("θ") + mr(")]", True) + gap + mr("(", True) + We + mr("<", True) + mr("W") + mr("<", True)
        + Wc2 + mr(")", True),
        mr("0", True) + gap + mr("(", True) + mr("W") + mr("≤", True) + We + mr(")", True),
    ]
    arr = "".join(f"<m:e>{r}</m:e>" for r in rows)
    body = (mr("R") + mr("=", True)
            + '<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e>'
            + f"<m:eqArr><m:eqArrPr><m:baseJc m:val=\"center\"/></m:eqArrPr>{arr}</m:eqArr></m:e></m:d>")
    return parse_xml(f"<m:oMath {M}>{body}</m:oMath>")


# ---------------------------------------------------------------- 組版
def set_header(doc):
    P = doc.paragraphs
    # 0: 講演番号（後日通知）
    clear_runs(P[0])
    set_font(P[0].add_run("○○"), east=MINCHO, size=14)
    # 1: 和文表題 14pt、2: 英文表題 12pt
    clear_runs(P[1])
    set_font(P[1].add_run(TITLE_JA), east=MINCHO, size=14)
    clear_runs(P[2])
    P[2].paragraph_format.line_spacing = Pt(14)
    set_font(P[2].add_run(TITLE_EN), size=12)
    # 4: 氏名（指導教員）、5: 英文氏名
    clear_runs(P[4])
    set_font(P[4].add_run(NAME_JA), east=MINCHO, size=10)
    clear_runs(P[5])
    P[5].paragraph_format.first_line_indent = None
    P[5].alignment = WD_ALIGN_PARAGRAPH.CENTER
    ind = P[5]._p.pPr.find(qn("w:ind"))
    if ind is not None:
        P[5]._p.pPr.remove(ind)
    set_font(P[5].add_run(NAME_EN), size=10)
    # 7: 英文アブストラクト（両端揃え）
    clear_runs(P[7])
    P[7].alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    set_font(P[7].add_run(ABSTRACT), size=9)
    # 9: キーワード
    clear_runs(P[9])
    set_font(P[9].add_run("Key Words"), size=9, italic=True)
    set_font(P[9].add_run(": " + KEYWORDS), size=9)
    clear_runs(P[10])


def build(template, out):
    doc = Document(template)
    set_header(doc)
    P = doc.paragraphs
    sect = [i for i, p in enumerate(P) if p._p.pPr is not None and p._p.pPr.find(qn("w:sectPr")) is not None]
    first, li = sect[0], sect[1]  # 1段組（表題部）と2段組（本文）の区切り段落
    last = P[li]  # 2段組セクションの最終段落（sectPr を保持）
    for p in P[first + 1:li]:
        p._p.getparent().remove(p._p)
    clear_runs(last)
    last.paragraph_format.first_line_indent = None
    first_h = True
    for item in BODY:
        kind = item[0]
        if kind in ("h", "h2"):
            p = body_par(doc, last, indent=False, keep_next=True, space_before=0 if first_h else (4 if kind == "h" else 2))
            first_h = False
            add_rich(p, item[1], east=GOTHIC if kind == "h" else MINCHO)
        elif kind in ("p", "p0"):
            add_rich(body_par(doc, last, indent=(kind == "p")), item[1])
        elif kind == "ref":
            p = body_par(doc, last, indent=False)
            add_rich(p, item[1], size=8)
        elif kind == "fig":
            _, name, width, cap, *pos = item
            if pos:
                add_float_figure(doc, last, name, width, cap, pos[0])
                continue
            p = body_par(doc, last, indent=False, align=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True, space_before=3)
            p.add_run().add_picture(str(FIG / name), width=Mm(width))
            c = body_par(doc, last, indent=False, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
            caption_format(c)
            add_rich(c, cap.replace("W_c2", "*W*_{c2}"), size=8)
        elif kind == "eq":
            p = body_par(doc, last, indent=False, space_before=2)
            p.paragraph_format.space_after = Pt(2)
            ts = p.paragraph_format.tab_stops
            ts.add_tab_stop(COL_W // 2, WD_TAB_ALIGNMENT.CENTER)
            ts.add_tab_stop(COL_W - Mm(0.5), WD_TAB_ALIGNMENT.RIGHT)
            set_font(p.add_run("\t"))
            p._p.append(rate_equation())
            set_font(p.add_run("\t(1)"))
        elif kind == "tab":
            add_table(doc, last)
    add_rich(last, LAST_REF, size=8)
    # テンプレート末尾の空段落が白紙の3ページ目を作るので削除し，
    # 本文セクションの設定（フッタ参照を含む）を文書末尾の sectPr に移す
    body = last._p.getparent()
    for el in list(last._p.itersiblings()):
        if el.tag == qn("w:p"):
            body.remove(el)
    sp = last._p.pPr.find(qn("w:sectPr"))
    last._p.pPr.remove(sp)
    body.replace(body.find(qn("w:sectPr")), sp)
    for tbl in doc.element.body.iter(qn("w:tbl")):
        order_tblPr(tbl.tblPr)
    doc.core_properties.title = TITLE_JA
    doc.core_properties.author = "久保田 快"
    doc.save(out)


def caption_format(c):
    c.paragraph_format.space_after = Pt(3)
    c.paragraph_format.left_indent = Mm(2)
    c.paragraph_format.right_indent = Mm(2)


def add_float_figure(doc, anchor, name, width, cap, pos):
    """図とキャプションを段幅の 1×1 浮動表に入れ，段の上端（top）または下端（bottom）に固定する。

    インライン画像だと，段の残りに収まらない図が次の段へ送られ大きな空白ができる。
    浮動表にすると本文は図を避けて連続して流れるので空白が生じない。
    表は直後の段落（アンカー）と同じ段・ページに配置される。
    """
    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    t = doc.add_table(rows=1, cols=1)
    anchor._p.addprevious(t._tbl)
    tblPr = t._tbl.tblPr
    gap = int(Mm(2).twips)
    tblPr.insert(0, parse_xml(
        f'<w:tblpPr xmlns:w="{W}" w:leftFromText="0" w:rightFromText="0" w:topFromText="{gap if pos == "bottom" else 0}" '
        f'w:bottomFromText="{gap if pos == "top" else 0}" w:vertAnchor="margin" w:horzAnchor="text" '
        f'w:tblpXSpec="center" w:tblpYSpec="{pos}"/>'))
    for tag, xml in (("w:tblOverlap", f'<w:tblOverlap xmlns:w="{W}" w:val="never"/>'),
                     ("w:tblW", f'<w:tblW xmlns:w="{W}" w:w="{int(COL_W.twips)}" w:type="dxa"/>'),
                     ("w:tblCellMar", f'<w:tblCellMar xmlns:w="{W}"><w:left w:w="0" w:type="dxa"/>'
                                      f'<w:right w:w="0" w:type="dxa"/></w:tblCellMar>')):
        old = tblPr.find(qn(tag))
        if old is not None:
            tblPr.remove(old)
        tblPr.append(parse_xml(xml))
    t._tbl.tblGrid.find(qn("w:gridCol")).set(qn("w:w"), str(int(COL_W.twips)))
    cell = t.cell(0, 0)
    cell.width = COL_W
    p = cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.line_spacing = 1.0
    p.paragraph_format.keep_with_next = True
    p.add_run().add_picture(str(FIG / name), width=Mm(width))
    c = cell.add_paragraph()
    c.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    c.paragraph_format.line_spacing = 1.0
    caption_format(c)
    c.paragraph_format.space_after = Pt(0)
    add_rich(c, cap.replace("W_c2", "*W*_{c2}"), size=8)


TBLPR_ORDER = ["tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize", "tblStyleColBandSize",
               "tblW", "jc", "tblCellSpacing", "tblInd", "tblBorders", "shd", "tblLayout", "tblCellMar",
               "tblLook", "tblCaption", "tblDescription"]


def order_tblPr(tblPr):
    """w:tblPr の子要素をスキーマ順に並べ替える（Word は順序違反のファイルを壊れていると判定する）。"""
    rank = {qn("w:" + n): i for i, n in enumerate(TBLPR_ORDER)}
    kids = sorted(tblPr, key=lambda e: rank.get(e.tag, len(rank)))
    for k in kids:
        tblPr.remove(k)
        tblPr.append(k)


def add_table(doc, anchor):
    cap = body_par(doc, anchor, indent=False, align=WD_ALIGN_PARAGRAPH.CENTER, keep_next=True, space_before=3)
    add_rich(cap, TABLE_CAPTION, size=8)
    t = doc.add_table(rows=len(TABLE), cols=len(TABLE[0]))
    anchor._p.addprevious(t._tbl)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    widths = [Mm(11), Mm(17), Mm(14), Mm(11), Mm(11), Mm(14)]
    for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), widths):
        gc.set(qn("w:w"), str(int(w.twips)))
    for i, row in enumerate(TABLE):
        for j, txt in enumerate(row):
            cell = t.cell(i, j)
            cell.width = widths[j]
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.line_spacing = 1.0
            if i == 0:
                sym, unit = txt.split(" ", 1)
                base, _, sub = sym.partition("_")
                set_font(p.add_run(base), size=8, italic=True)
                if sub:
                    set_font(p.add_run(sub), size=8, va="sub")
                p2 = cell.add_paragraph()
                p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p2.paragraph_format.line_spacing = 1.0
                set_font(p2.add_run(unit), size=7)
            else:
                set_font(p.add_run(txt), size=8)
    # 表が段・ページをまたいで分割されないようにする
    for i, row in enumerate(t.rows):
        trPr = row._tr.get_or_add_trPr()
        trPr.append(parse_xml(f'<w:cantSplit xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>'))
        if i < len(t.rows) - 1:
            for cell in row.cells:
                for cp in cell.paragraphs:
                    cp.paragraph_format.keep_with_next = True
    # 三線表（上・見出し下・下の罫線のみ）
    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    tblPr = t._tbl.tblPr
    tblPr.append(parse_xml(
        f'<w:tblBorders xmlns:w="{W}"><w:top w:val="single" w:sz="8" w:color="000000"/>'
        f'<w:bottom w:val="single" w:sz="8" w:color="000000"/></w:tblBorders>'))
    for cell in t.rows[0].cells:
        tcPr = cell._tc.get_or_add_tcPr()
        tcPr.append(parse_xml(f'<w:tcBorders xmlns:w="{W}"><w:bottom w:val="single" w:sz="4" w:color="000000"/></w:tcBorders>'))
    sp = body_par(doc, anchor, indent=False)
    sp.paragraph_format.space_after = Pt(2)
    sp.paragraph_format.line_spacing = Pt(4)


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
    words = len(ABSTRACT.split())
    print("abstract words:", words)
