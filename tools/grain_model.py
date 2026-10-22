"""温度連成グレインモデル（論文 式(5)-(11)）の Python 実装。

simulator/index.html の JavaScript 実装と同じ式・同じ既定値を用いる。
"""
import math

RG = 8.314  # J/(mol K)

# Table 4（同定値）
P = dict(
    Winit=3.30,   # 初期含水率 [kg/kg]
    Wc1=2.50,     # 第1臨界含水率 [kg/kg]
    Wc2=0.70,     # 第2臨界含水率 [kg/kg]
    We=0.038,     # 終局平衡含水率 [kg/kg]
    aM=0.35,      # αM マクロ細孔拡散抵抗係数 [-]
    dl=0.090,     # δ 境界平滑化パラメータ [-]
    b2=0.0,       # β2（論文に値なし。Fig.6 の Phase III-2 が直線なので 0）
    W0=0.3553e-3,  # 絶乾質量 [kg]
    d=80e-6,      # 単繊維径 [m]
    rho=1300.0,   # ケラチン真密度 [kg/m3]
)


def area(p=P):
    """式(3) A = 4 W0 / (d rho) [m2]"""
    return 4 * p["W0"] / (p["d"] * p["rho"])


def Rc(T_C, A0=98.85, Ea=18.58e3):
    """式(8) 恒率乾燥速度 [kg/(m2 h)]"""
    return A0 * math.exp(-Ea / (RG * (T_C + 273.15)))


def Rc2(T_C, p=P):
    """式(9) 第2臨界点での境界速度"""
    u1 = p["Wc1"] - p["Wc2"] + p["dl"]
    return Rc(T_C) / (1 + p["aM"] * math.log(u1 / p["dl"]))


def rate(W, T_C, p=P):
    """式(10) R(W;T) [kg/(m2 h)]"""
    c = Rc(T_C)
    u1 = p["Wc1"] - p["Wc2"] + p["dl"]
    if W >= p["Wc1"]:
        return c
    if W >= p["Wc2"]:
        return c / (1 + p["aM"] * math.log(u1 / (W - p["Wc2"] + p["dl"])))
    if W > p["We"]:
        th = (W - p["We"]) / (p["Wc2"] - p["We"])
        return Rc2(T_C, p) * th * (1 + p["b2"] * (1 - th))
    return 0.0


def time_to(W, T_C, p=P):
    """式(11) 閉形式解 t(W;T) [min]"""
    k = area(p) / p["W0"] / 60  # [m2/kg]/60 → R[kg/m2h] を [1/min] へ
    Kc = k * Rc(T_C)
    u1 = p["Wc1"] - p["Wc2"] + p["dl"]
    if W >= p["Wc1"]:
        return (p["Winit"] - W) / Kc
    tc = (p["Winit"] - p["Wc1"]) / Kc
    if W >= p["Wc2"]:
        u = W - p["Wc2"] + p["dl"]
        return tc + ((1 + p["aM"]) * (p["Wc1"] - W) - p["aM"] * u * math.log(u1 / u)) / Kc
    u = p["dl"]
    tc2 = tc + ((1 + p["aM"]) * (p["Wc1"] - p["Wc2"]) - p["aM"] * u * math.log(u1 / u)) / Kc
    if W <= p["We"]:
        return math.inf
    K2 = k * Rc2(T_C, p) / (p["Wc2"] - p["We"])  # 速度の連続条件から決まる [1/min]
    th = (W - p["We"]) / (p["Wc2"] - p["We"])
    return tc2 + (math.log(1 / th) + math.log(1 + p["b2"] * (1 - th))) / (K2 * (1 + p["b2"]))


def simulate(T_of_W, p=P, dt=0.01, t_end=400, W_end=0.05):
    """任意の送風温度プロファイル T(W) で式(10)を数値積分（オイラー法）。"""
    k = area(p) / p["W0"] / 60
    t, W, out = 0.0, p["Winit"], [(0.0, p["Winit"])]
    while t < t_end and W > W_end:
        W -= k * rate(W, T_of_W(W), p) * dt
        t += dt
        out.append((t, W))
    return out


if __name__ == "__main__":
    print("A =", area(), "m2")
    for T in (40, 50, 90, 130, 140):
        print(T, "Rc=%.3f" % Rc(T), "tc=%.1f" % time_to(P["Wc1"], T), "tc2=%.1f" % time_to(P["Wc2"], T),
              "te(W=0.05)=%.1f min" % time_to(0.05, T), "num=%.1f" % simulate(lambda W: T)[-1][0])
