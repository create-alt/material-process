"""卒業研究概要用の図（英文表記）を作成する。

入力 : abstract/data/*.csv（tools/digitize_figs.py で論文 Fig.3 から数値化）
       論文PDFから抽出した SEM 像・グレインモデル概念図（pdfimages の i-002, i-010）
出力 : abstract/fig/*.png（300 dpi）

使い方: python3 tools/make_figures.py <pdfimagesの出力ディレクトリ>
"""
import csv
import math
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import grain_model as gm

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "abstract" / "data"
FIG = ROOT / "abstract" / "fig"

plt.rcParams.update({
    "font.family": "serif",
    "font.serif": ["Liberation Serif", "DejaVu Serif"],
    "mathtext.fontset": "stix",
    "font.size": 7.5,
    "axes.linewidth": 0.6,
    "xtick.direction": "in",
    "ytick.direction": "in",
    "xtick.major.width": 0.6,
    "ytick.major.width": 0.6,
    "legend.frameon": False,
    "legend.fontsize": 6.5,
    "savefig.dpi": 300,
})
COL = {"50C": "#2563eb", "90C": "#10b981", "130C": "#ef4444"}
LAB = {"50C": "50 °C", "90C": "90 °C", "130C": "130 °C"}
ORDER = ("50C", "90C", "130C")


def read(name):
    with open(DATA / name) as f:
        return list(csv.DictReader(f))


def fig_drying():
    """Fig.1 実測の乾燥特性曲線 (a) と含水率履歴 (b)"""
    fig, (a, b) = plt.subplots(2, 1, figsize=(3.2, 4.3))
    rw = defaultdict(list)
    for r in read("fig3a_R_vs_W.csv"):
        rw[(r["series"], r["kind"])].append((float(r["W_dry"]), float(r["R"])))
    for s in ORDER:
        ma = sorted(rw[(s, "MA5")])
        a.plot(*zip(*ma), "-o", color=COL[s], ms=2.2, lw=1.0, label=LAB[s])
        if rw[(s, "measured")]:
            a.plot(*zip(*rw[(s, "measured")]), "x", color=COL[s], ms=3, mew=0.6)
    for w, t in ((2.25, r"$W_{c1}$"), (0.62, r"$W_{c2}$")):
        a.axvline(w, color="0.4", ls=":", lw=0.6)
        a.text(w + 0.04, 0.392, t, fontsize=6.5, color="0.25", va="top")
    a.text(3.15, 0.30, "II", ha="center", fontsize=7, color="0.3")
    a.text(1.45, 0.30, "III-1", ha="center", fontsize=7, color="0.3")
    a.text(0.30, 0.30, "III-2", ha="center", fontsize=7, color="0.3")
    a.set(xlim=(0, 4), ylim=(0, 0.4), xlabel=r"Moisture content $W_{\rm dry}$ [kg/kg-dry]",
          ylabel=r"Drying rate $R$ [kg/(m$^2$·h)]")
    a.legend(loc="lower right", bbox_to_anchor=(1.0, 0.13), title="line: 5-pt MA, ×: measured",
             title_fontsize=6)
    a.text(0.02, 0.97, "(a)", transform=a.transAxes, va="top", fontweight="bold")

    wt = defaultdict(list)
    for r in read("fig3b_W_vs_t.csv"):
        wt[r["series"]].append((float(r["t_min"]), float(r["W_dry"])))
    te = {"50C": 148, "90C": 78, "130C": 42}
    for s in ORDER:
        b.plot(*zip(*sorted(wt[s])), "o", color=COL[s], ms=1.8, label=f"{LAB[s]} ($t_e$ = {te[s]} min)")
    b.set(xlim=(0, 200), ylim=(0, 4), xlabel=r"Time $t$ [min]", ylabel=r"$W_{\rm dry}$ [kg/kg-dry]")
    b.legend(loc="upper right")
    b.text(0.98, 0.5, "(b)", transform=b.transAxes, ha="right", fontweight="bold")
    fig.tight_layout(h_pad=0.6)
    fig.savefig(FIG / "fig1_drying_curves.png")
    plt.close(fig)


def fig_arrhenius():
    """Fig.3 アレニウスプロット。点は論文 Fig.4 から読み取り、直線はその最小二乗回帰。

    回帰で得られる Ea は Table 3（27.60 / 25.08 / 27.87 kJ/mol）と読み取り誤差内で一致する。
    """
    T = [403.15, 363.15, 323.15]
    pts = {  # 論文 Fig.4 の読み取り値 ln(k)（●=Rc, ◆=Rc2, ▲=K2）
        "Rc": [-1.032, -1.377, -3.045],
        "Rc2": [-1.445, -1.50, -3.25],
        "K2": [-0.873, -2.27, -2.99],
    }
    sty = {"Rc": ("o", "#2563eb", r"Constant rate $R_c$", 27.60),
           "Rc2": ("D", "#ea580c", r"Falling rate 1 $R_{c2}$", 25.08),
           "K2": ("^", "#7c3aed", r"Falling rate 2 $K_2$", 27.87)}
    fig, ax = plt.subplots(figsize=(3.2, 2.3))
    x = [1000 / t for t in T]
    for k, (m, c, lab, Ea) in sty.items():
        ax.plot(x, pts[k], m, color=c, ms=4, mfc=c, mec="k", mew=0.3,
                label=f"{lab}: $E_a$ = {Ea:.2f} kJ/mol")
        s, i = np.polyfit(x, pts[k], 1)
        xs = np.array([2.4, 3.2])
        ax.plot(xs, s * xs + i, "--", color=c, lw=0.8)
    ax.set(xlim=(2.4, 3.2), ylim=(-4, 0.2), xlabel=r"$1000/T$ [K$^{-1}$]", ylabel=r"$\ln k$ [–]")
    for xv, lab in zip(x, ("130 °C", "90 °C", "50 °C")):
        ax.text(xv, -3.85, lab, ha="center", fontsize=6, color="0.35")
    ax.legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(FIG / "fig3_arrhenius.png")
    plt.close(fig)


def fig_sem(img_dir):
    """Fig.2 SEM 像（論文 Fig.2 をそのまま使用）"""
    Image.open(img_dir / "i-002.png").convert("RGB").save(FIG / "fig2_sem.png", dpi=(300, 300))


def fig_grain(img_dir):
    """Fig.4 グレインモデル概念図（論文 Fig.5 の画像に英文ラベルを付す）"""
    im = Image.open(img_dir / "i-010.png").convert("RGBA")
    bg = Image.new("RGBA", im.size, "white")
    bg.alpha_composite(im)
    w, h = bg.size
    crop = bg.convert("RGB").crop((0, 90, w, h - 90))
    fig = plt.figure(figsize=(3.2, 3.2 * crop.height / w + 0.3))
    ax = fig.add_axes([0, 0.22, 1, 0.78])
    ax.imshow(crop)
    ax.axis("off")
    fig.text(0.25, 0.03, "(a) Hair bundle (pellet)\nfilled with inter-fiber water", ha="center", fontsize=6.5)
    fig.text(0.75, 0.03, "(b) Single fiber (grain)\nwith bound water in keratin", ha="center", fontsize=6.5)
    fig.savefig(FIG / "fig4_grain_model.png")
    plt.close(fig)


def fig_prediction():
    """Fig.5 温度連成グレインモデル（式(10),(11)）による予測と送風温度切替"""
    p = gm.P
    temps = (40, 60, 80, 100, 120, 140)
    cmap = plt.get_cmap("coolwarm")
    fig, (a, b) = plt.subplots(2, 1, figsize=(3.2, 4.0))
    for i, T in enumerate(temps):
        c = cmap(i / (len(temps) - 1))
        Ws = [p["Winit"] - k * (p["Winit"] - p["We"] - 1e-4) / 600 for k in range(601)]
        a.plot(Ws, [gm.rate(w, T) for w in Ws], color=c, lw=1.0, label=f"{T} °C")
        ws = [w for w in Ws if w > 0.05]
        b.plot([gm.time_to(w, T) for w in ws], ws, color=c, lw=1.0)
    for w, t in ((p["Wc1"], r"$W_{c1}$"), (p["Wc2"], r"$W_{c2}$")):
        a.axvline(w, color="0.4", ls=":", lw=0.6)
        a.text(w + 0.04, 0.47, t, fontsize=6.5, color="0.25", va="center")
    a.set(xlim=(0, 3.4), ylim=(0, 0.58), xlabel=r"$W_{\rm dry}$ [kg/kg-dry]", ylabel=r"$R$ [kg/(m$^2$·h)]")
    a.legend(loc="upper left", ncol=3, bbox_to_anchor=(0.0, 1.0), columnspacing=1.0)
    a.text(0.98, 0.04, "(a)", transform=a.transAxes, ha="right", fontweight="bold")

    sw = gm.simulate(lambda W: 130 if W >= p["Wc2"] else 60)
    b.plot(*zip(*sw), "k--", lw=1.0, label=r"130 °C → 60 °C at $W_{c2}$")
    b.axhline(p["Wc2"], color="0.4", ls=":", lw=0.6)
    b.set(xlim=(0, 180), ylim=(0, 3.4), xlabel=r"$t$ [min]", ylabel=r"$W_{\rm dry}$ [kg/kg-dry]")
    b.legend(loc="upper right")
    b.text(0.98, 0.04, "(b)", transform=b.transAxes, ha="right", fontweight="bold")
    fig.tight_layout(h_pad=0.6)
    fig.savefig(FIG / "fig5_prediction.png")
    plt.close(fig)
    return sw[-1][0]


if __name__ == "__main__":
    img_dir = Path(sys.argv[1])
    FIG.mkdir(parents=True, exist_ok=True)
    fig_drying()
    fig_sem(img_dir)
    fig_arrhenius()
    fig_grain(img_dir)
    print("switched 130->60 at Wc2: t(W=0.05) = %.1f min" % fig_prediction())
