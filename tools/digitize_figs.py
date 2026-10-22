"""論文PDF（卒業論文集 2026）に埋め込まれたグラフ画像から実測データを数値化する。

論文 Fig. 3 のグラフは透過PNG（色付きマーカー・線のみ。軸文字はPDF側のテキスト）として
埋め込まれているため、系列色でマスクして座標を読み取る。

  pdfimages -png paper.pdf img/i   で抽出した
    i-003.png / i-004.png : Fig.3(a) R vs Wdry（画像 / 透過マスク）
    i-005.png / i-006.png : Fig.3(b) Wdry vs t
を入力とし、abstract/data/*.csv を出力する。

使い方: python3 tools/digitize_figs.py <imgディレクトリ> <出力ディレクトリ>
"""
import csv
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SERIES = {  # 系列色（Fig.3 凡例）
    "130C": (239, 68, 68),
    "90C": (16, 185, 129),
    "50C": (37, 99, 235),
}


def load(img_dir, rgb_name, mask_name):
    rgb = np.array(Image.open(img_dir / rgb_name).convert("RGB")).astype(int)
    alpha = np.array(Image.open(img_dir / mask_name))
    return rgb, alpha


def color_mask(rgb, alpha, col, tol=40):
    d = np.abs(rgb - np.array(col)).sum(axis=2)
    return (d < tol) & (alpha > 128)


def px2data(px, py, ax):
    (x0p, x0), (x1p, x1), (y0p, y0), (y1p, y1) = ax
    return x0 + (px - x0p) * (x1 - x0) / (x1p - x0p), y0 + (py - y0p) * (y1 - y0) / (y1p - y0p)


def blobs(mask, min_area):
    lab, n = ndimage.label(mask)
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        area = (lab[sl] == i).sum()
        if area >= min_area:
            cy, cx = ndimage.center_of_mass(lab == i)
            out.append((cx, cy, area))
    return out


def fig3a(img_dir, out_dir):
    """R vs W：線＋丸マーカー（5点移動平均）と×マーカー（実測）。"""
    rgb, alpha = load(img_dir, "i-003.png", "i-004.png")
    # 軸目盛の画素位置（グリッド線より読み取り）: x 0→157px, 4→1581px / y 0→1045px, 0.4→151px
    ax = ((157, 0.0), (1581, 4.0), (1045, 0.0), (151, 0.4))
    rows = []
    for name, col in SERIES.items():
        m = color_mask(rgb, alpha, col)
        m[:140] = False  # 凡例を除外
        # 丸マーカー：線（幅≈6px）と×（細線）を収縮で消し、直径≈16pxの円だけ残す
        core = ndimage.binary_erosion(m, structure=np.ones((9, 9)))
        for cx, cy, _ in blobs(core, 4):
            w, r = px2data(cx, cy, ax)
            rows.append((name, "MA5", round(w, 4), round(r, 5)))
        # ×マーカー：MA 線・丸から離れた小さな連結成分
        near_line = ndimage.binary_dilation(core, iterations=6) | ndimage.binary_dilation(
            ndimage.binary_opening(m, structure=np.ones((5, 5))), iterations=3)
        for cx, cy, a in blobs(m & ~near_line, 25):
            if a < 400:
                w, r = px2data(cx, cy, ax)
                rows.append((name, "measured", round(w, 4), round(r, 5)))
    rows.sort(key=lambda r: (r[0], r[1], -r[2]))
    write(out_dir / "fig3a_R_vs_W.csv", ("series", "kind", "W_dry", "R"), rows)


def fig3b(img_dir, out_dir):
    """W vs t：丸マーカーのみ。重なりが大きいので列ごとの重心で読む。"""
    rgb, alpha = load(img_dir, "i-005.png", "i-006.png")
    ax = ((127, 0.0), (1563, 200.0), (1045, 0.0), (151, 4.0))
    rows = []
    for name, col in SERIES.items():
        m = color_mask(rgb, alpha, col)
        m[:140] = False
        core = ndimage.binary_erosion(m, structure=np.ones((5, 5)))
        pts = blobs(core, 20)
        # 重なって1塊になった部分は列方向に分割（2 min 間隔 ≈ 14.4px）
        lab, _ = ndimage.label(core)
        for cx, cy, area in pts:
            if area < 400:
                t, w = px2data(cx, cy, ax)
                rows.append((name, round(t, 2), round(w, 4)))
        big = np.zeros_like(core)
        for i, sl in enumerate(ndimage.find_objects(lab), start=1):
            if (lab[sl] == i).sum() >= 400:
                big |= lab == i
        cols = np.where(big.any(axis=0))[0]
        if len(cols):
            step = 14.37
            for x in np.arange(cols.min() + 4, cols.max() - 3, step):
                ys = np.where(big[:, int(x)])[0]
                if len(ys):
                    t, w = px2data(x, ys.mean(), ax)
                    rows.append((name, round(t, 2), round(w, 4)))
    rows.sort(key=lambda r: (r[0], r[1]))
    write(out_dir / "fig3b_W_vs_t.csv", ("series", "t_min", "W_dry"), rows)


def write(path, header, rows):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(path, len(rows), "rows")


if __name__ == "__main__":
    img_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    fig3a(img_dir, out_dir)
    fig3b(img_dir, out_dir)
