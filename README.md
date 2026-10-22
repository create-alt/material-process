# 毛髪束の乾燥：シミュレータと卒業研究概要（2026年度 エネルギー機械コース）

論文「恒温恒湿熱風環境における毛髪束の乾燥挙動と乾燥特性曲線の評価」（久保田・平林, 2026）を題材に、

1. 論文の内容を理解するためのシミュレータ
2. 卒業研究発表講演会概要（学科テンプレート準拠の Word 原稿）

を作成したものです。

## ファイル構成

| パス | 内容 |
|---|---|
| `simulator/index.html` | 乾燥シミュレータ（ブラウザで開くだけで動作。外部ライブラリなし） |
| `abstract/abstract.docx` | 卒業研究概要（A4・2ページ、2段組、英文アブストラクト 143 words） |
| `abstract/abstract_preview.pdf` | 上記の LibreOffice による確認用 PDF（Word とはフォントが異なります） |
| `abstract/fig/` | 概要用の図（英文表記、300 dpi） |
| `abstract/data/` | 論文 Fig.3 から数値化した実測データ（CSV） |
| `tools/grain_model.py` | 温度連成グレインモデル（式(8)–(11)）の Python 実装 |
| `tools/digitize_figs.py` | 論文PDFのグラフ画像 → 実測データ CSV |
| `tools/make_figures.py` | 概要用の図を作成 |
| `tools/make_abstract.py` | テンプレート docx から概要原稿を作成（本文テキストもこのファイル内） |

## シミュレータでできること

- **乾燥特性**：式(10) の乾燥特性曲線 R–W と式(11) の含水率履歴 W–t。40〜140 ℃の重ね描き、論文の実測（50/90/130 ℃）との比較
- **毛束の内部**：グレインモデルの可視化（外周水膜 → 空隙水の湿潤核の後退 → 単繊維内の結合水）を時間スライダで再生
- **温度と熱損傷**：湿球温度・潜熱冷却を考慮した毛髪温度、ケラチン変成温度との比較、色抜け指数（論文外の仮定モデル）
- **温度依存性**：アレニウスプロット（論文 Fig.4）、モデルと実測（Table 2）の特性値比較
- **湿り空気・相平衡**：加熱による相対湿度低下と湿球温度、毛髪の収着等温線（GAB）
- **制御の比較**：一定温度と「W<sub>c2</sub> で送風温度を切替」の到達時間・最高毛髪温度・損傷指標
- **式と論文チェック**：閉形式解と数値積分の一致確認、論文中の数値・記号の整合性チェック

画面上で <span>論文</span> は論文の式・値、<span>仮定</span> は理解のために追加した論文外のモデルを示します。

## 再生成の手順

```sh
pdfimages -png 論文.pdf img/i                         # 論文の図画像を抽出
python3 tools/digitize_figs.py img abstract/data      # 実測データを数値化
python3 tools/make_figures.py img                     # 図を作成
python3 tools/make_abstract.py テンプレート.docx abstract/abstract.docx
```

必要なもの：Python 3, numpy, scipy, matplotlib, pillow, python-docx, poppler-utils。
