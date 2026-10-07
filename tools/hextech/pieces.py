"""Rend les six pièces d'échecs en 3D (lancer de rayons SDF, éclairage studio) dans deux matières :
ivoire et or, saphir et turquoise. Sortie : assets/pieces/<set>-<pièce>.webp (256 px, alpha)."""
import sys, os, time
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from lib import blur, hexcol, save_webp

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "web", "src", "assets", "hextech", "pieces")
os.makedirs(OUT, exist_ok=True)

R = 640            # résolution du rendu (réduite ensuite)
ELEV = np.radians(24.0)
DIR = np.array([0.0, -np.sin(ELEV), -np.cos(ELEV)])   # direction de visée
UPC = np.array([0.0, np.cos(ELEV), -np.sin(ELEV)])    # « haut » de la caméra
RIGHT = np.array([1.0, 0.0, 0.0])
VIEW = -DIR


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smax(a, b, k):
    return -smin(-a, -b, k)


def sphere(p, c, r):
    return np.linalg.norm(p - np.asarray(c), axis=1) - r


def box(p, c, hs):
    q = np.abs(p - np.asarray(c)) - np.asarray(hs)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0)


def ellipsoid(p, c, r):
    q = (p - np.asarray(c)) / np.asarray(r)
    k0 = np.linalg.norm(q, axis=1)
    k1 = np.linalg.norm(q / np.asarray(r), axis=1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def make_lathe(points, k=0.62, smooth=5):
    pts = np.array(points, dtype=float)
    ys = np.linspace(pts[0, 0] - 0.0, pts[-1, 0], 900)
    rs = np.interp(ys, pts[:, 0], pts[:, 1])
    ker = np.hanning(2 * smooth + 1)
    ker /= ker.sum()
    rs = np.convolve(np.pad(rs, smooth, mode="edge"), ker, mode="valid")
    y0, y1 = ys[0], ys[-1]

    def f(p):
        r = np.hypot(p[:, 0], p[:, 2])
        y = p[:, 1]
        rr = np.interp(y, ys, rs)
        return np.maximum((r - rr) * k, np.maximum(y0 - y, y - y1))
    return f


def rot_xz(p, ang):
    c, s = np.cos(ang), np.sin(ang)
    q = p.copy()
    q[:, 0] = c * p[:, 0] - s * p[:, 2]
    q[:, 2] = s * p[:, 0] + c * p[:, 2]
    return q


BASE = [(0.0, .37), (0.02, .41), (0.06, .415), (0.085, .375), (0.105, .385), (0.13, .31)]


# ---------------------------------------------------------------- géométries
def g_pawn():
    body = make_lathe(BASE + [(0.17, .24), (0.26, .17), (0.37, .125), (0.46, .11), (0.50, .16), (0.535, .20), (0.56, .15), (0.585, .09)])

    def f(p):
        d = body(p)
        return smin(d, sphere(p, (0, .70, 0), .185), .06)
    return f, 0.90


def g_rook():
    body = make_lathe(BASE + [(0.17, .29), (0.24, .24), (0.52, .215), (0.60, .26), (0.64, .29), (0.69, .35), (0.74, .355), (0.92, .355)])

    def f(p):
        d = body(p)
        cut = np.full(len(p), 9.0)
        for a in (0, np.pi / 3, 2 * np.pi / 3):
            q = rot_xz(p, a)
            cut = np.minimum(cut, box(q, (0, .93, 0), (.6, .09, .052)))
        d = smax(d, -cut, .01)
        pit = np.maximum(np.hypot(p[:, 0], p[:, 2]) - .23, -(p[:, 1] - .82))
        return smax(d, -pit, .015)
    return f, 0.92


def g_bishop():
    body = make_lathe(BASE + [(0.17, .25), (0.26, .165), (0.40, .115), (0.47, .205), (0.50, .215), (0.53, .12)])

    def f(p):
        d = body(p)
        egg = ellipsoid(p, (0, .82, 0), (.215, .31, .215))
        d = smin(d, egg, .08)
        d = smin(d, sphere(p, (0, 1.17, 0), .062), .03)
        # fente en biais
        q = p - np.array([0.03, .94, 0.0])
        a = np.radians(-38)
        qx = np.cos(a) * q[:, 0] - np.sin(a) * q[:, 1]
        qy = np.sin(a) * q[:, 0] + np.cos(a) * q[:, 1]
        slit = np.maximum(np.abs(qy) - .016, np.maximum(np.abs(qx) - .16, -(p[:, 2] - .02)))
        return smax(d, -slit, .01)
    return f, 1.0


def g_queen():
    body = make_lathe(BASE + [(0.17, .28), (0.27, .19), (0.42, .13), (0.56, .115), (0.64, .205), (0.68, .19), (0.73, .13),
                              (0.80, .215), (0.90, .285), (0.97, .30), (1.0, .28)])

    def f(p):
        d = body(p)
        pit = np.maximum(np.hypot(p[:, 0], p[:, 2]) - .21, -(p[:, 1] - .955))
        d = smax(d, -pit, .02)
        for i in range(9):
            a = i * 2 * np.pi / 9
            d = smin(d, sphere(p, (.285 * np.cos(a), 1.02, .285 * np.sin(a)), .046), .025)
        d = smin(d, sphere(p, (0, 1.06, 0), .075), .04)
        return d
    return f, 1.07


def g_king():
    body = make_lathe(BASE + [(0.17, .28), (0.27, .19), (0.42, .13), (0.56, .115), (0.64, .21), (0.68, .195), (0.73, .135),
                              (0.80, .225), (0.90, .29), (0.97, .28), (1.0, .18), (1.03, .06)])

    def f(p):
        d = body(p)
        d = smin(d, box(p, (0, 1.16, 0), (.034, .125, .034)), .02)
        d = smin(d, box(p, (0, 1.19, 0), (.105, .034, .034)), .02)
        return d
    return f, 1.14


def g_knight():
    base = make_lathe(BASE + [(0.17, .30), (0.20, .27), (0.24, .0)])

    def seg(px, py, ax, ay, bx, by, r):
        pax, pay = px - ax, py - ay
        bax, bay = bx - ax, by - ay
        h = np.clip((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1)
        return np.hypot(pax - bax * h, pay - bay * h) - r

    def f(p):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        d2 = seg(x, y, 0.02, .22, .08, .50, .20)                        # poitrail
        d2 = smin(d2, seg(x, y, .08, .50, .05, .72, .155), .10)         # encolure
        d2 = smin(d2, seg(x, y, .05, .72, -.04, .86, .14), .08)         # arc de la nuque
        d2 = smin(d2, seg(x, y, -.04, .86, -.30, .735, .125), .08)      # tête
        d2 = smin(d2, seg(x, y, -.30, .735, -.375, .625, .088), .05)    # museau
        d2 = smin(d2, np.hypot(x + .09, y - .83) - .125, .07)           # front
        d2 = smin(d2, seg(x, y, .0, .93, .045, 1.065, .042), .03)       # oreille
        for t in np.linspace(0, 1, 6):                                  # crinière
            d2 = smin(d2, np.hypot(x - (.19 - .07 * t), y - (.40 + .56 * t)) - (.075 - .012 * t), .05)
        d2 = smax(d2, -(np.hypot(x + .20, y - .52) - .095), .05)         # creux sous la ganache
        h = 0.14 - 0.03 * np.clip((y - .5) / .4, 0, 1)
        h = h * (1 - .55 * np.clip((-.12 - x) / .26, 0, 1))
        h = np.where(y > 0.97, 0.05, h)
        r0 = .075
        q1 = np.maximum(d2 + r0, 0)
        q2 = np.maximum(np.abs(z) - h + r0, 0)
        d = np.hypot(q1, q2) + np.minimum(np.maximum(d2 + r0, np.abs(z) - h + r0), 0) - r0
        return smin(d, base(p), .07)
    return f, 1.08


GEOMS = {"pawn": g_pawn, "rook": g_rook, "knight": g_knight, "bishop": g_bishop, "queen": g_queen, "king": g_king}

# bandes de dorure (ivoire) / bandes lumineuses (saphir) par hauteur : (y0, y1)
TRIM = {
    "pawn":   [(0.05, 0.10), (0.49, 0.56)],
    "rook":   [(0.05, 0.10), (0.60, 0.72), (0.90, 1.0)],
    "knight": [(0.05, 0.10)],
    "bishop": [(0.05, 0.10), (0.46, 0.53), (1.11, 1.3)],
    "queen":  [(0.05, 0.10), (0.63, 0.70), (0.96, 1.2)],
    "king":   [(0.05, 0.10), (0.63, 0.70), (1.04, 1.4)],
}


# ------------------------------------------------------------------ rendu
def march(sdf, o, d, steps=110, tmax=9.0):
    n = len(o)
    t = np.zeros(n)
    hit = np.zeros(n, bool)
    alive = np.ones(n, bool)
    for _ in range(steps):
        idx = np.nonzero(alive)[0]
        if len(idx) == 0:
            break
        p = o[idx] + d * t[idx, None]
        dist = sdf(p)
        h = dist < 0.0012
        hit[idx[h]] = True
        t[idx] += np.maximum(dist, 0.0008) * 0.9
        alive[idx[h]] = False
        alive[idx[t[idx] > tmax]] = False
    return t, hit


def normal(sdf, p, e=0.0025):
    ex = np.array([e, 0, 0]); ey = np.array([0, e, 0]); ez = np.array([0, 0, e])
    n = np.stack([sdf(p + ex) - sdf(p - ex), sdf(p + ey) - sdf(p - ey), sdf(p + ez) - sdf(p - ez)], -1)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def soft_shadow(sdf, p, l, k=10):
    res = np.ones(len(p))
    t = np.full(len(p), 0.03)
    for _ in range(26):
        d = sdf(p + l * t[:, None])
        res = np.minimum(res, k * d / t)
        t += np.clip(d, 0.015, 0.12)
    return np.clip(res, 0, 1)


def ao(sdf, p, n):
    occ = np.zeros(len(p))
    for i, h in enumerate((0.03, 0.07, 0.12, 0.2)):
        occ += (h - sdf(p + n * h)) * (0.5 ** i)
    return np.clip(1 - 2.4 * occ, 0, 1)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def band(y, ranges, soft=0.012):
    m = np.zeros_like(y)
    for a, b in ranges:
        m = np.maximum(m, smoothstep(a - soft, a + soft, y) * (1 - smoothstep(b - soft, b + soft, y)))
    return m


L_KEY = np.array([-0.52, 0.72, 0.46]); L_KEY /= np.linalg.norm(L_KEY)
L_FILL = np.array([0.75, 0.22, 0.45]); L_FILL /= np.linalg.norm(L_FILL)
L_RIM = np.array([0.35, 0.35, -0.9]); L_RIM /= np.linalg.norm(L_RIM)


def env(r):
    """Studio : voûte sombre, grande boîte à lumière en haut à gauche, liseré turquoise à droite."""
    up = smoothstep(-0.3, 0.9, r[:, 1])[:, None]
    base = (1 - up) * np.array([0.05, 0.06, 0.09]) + up * np.array([0.62, 0.66, 0.74])
    key = np.exp(-np.sum((r - L_KEY) ** 2, axis=1) * 5.5)[:, None] * np.array([2.2, 1.95, 1.6])
    rim = np.exp(-np.sum((r - L_RIM) ** 2, axis=1) * 6)[:, None] * np.array([0.3, 1.2, 1.3])
    horizon = np.exp(-((r[:, 1] - 0.05) ** 2) * 30)[:, None] * np.array([0.5, 0.45, 0.4])
    return base * 0.8 + key + rim + horizon


def shade(name, kind, P, N, ao_v, sh):
    y = P[:, 1]
    trim = band(y, TRIM[name])[:, None]
    if name == "king":
        trim = np.maximum(trim, smoothstep(1.08, 1.1, y)[:, None])
    V = VIEW[None, :]
    ndv = np.clip(np.sum(N * V, 1), 0, 1)[:, None]
    ndl = np.clip(N @ L_KEY, 0, 1)[:, None] * sh[:, None]
    ndf = np.clip(N @ L_FILL, 0, 1)[:, None]
    ndr = np.clip(N @ L_RIM, 0, 1)[:, None]
    Rv = 2 * np.sum(N * V, 1, keepdims=True) * N - V
    E = env(Rv)
    hemi = (0.5 + 0.5 * N[:, 1:2])
    amb = hemi * np.array([0.30, 0.33, 0.42]) + (1 - hemi) * np.array([0.12, 0.09, 0.07])
    F = (0.04 + 0.96 * (1 - ndv) ** 5)
    if kind == "ivory":
        alb = np.array([0.93, 0.86, 0.72])
        wrap = np.clip((N @ L_KEY + 0.35) / 1.35, 0, 1)[:, None] * (0.45 + 0.55 * sh[:, None])
        diff = alb * (wrap * np.array([1.15, 1.02, 0.86]) + ndf * np.array([0.14, 0.2, 0.32]) + amb * ao_v[:, None] + ndr * np.array([0.1, 0.22, 0.25]))
        h = (L_KEY + VIEW); h /= np.linalg.norm(h)
        sp = (np.clip(N @ h, 0, 1)[:, None] ** 48) * 0.5 * sh[:, None]
        col = diff + sp * np.array([1.0, 0.96, 0.88]) + E * F * 0.22 * ao_v[:, None]
        # or poli
        galb = np.array([0.96, 0.63, 0.19])
        gdiff = galb * (ndl * 0.35 + amb * ao_v[:, None] * 0.55)
        gspec = E * galb * 0.72 * (0.5 + 0.5 * ao_v[:, None])
        gold = gdiff + gspec
        col = col * (1 - trim) + gold * trim
    else:
        alb = np.array([0.025, 0.07, 0.17])
        diff = alb * (ndl * np.array([1.1, 1.2, 1.5]) + ndf * 0.8 + amb * ao_v[:, None] * 1.1)
        h = (L_KEY + VIEW); h /= np.linalg.norm(h)
        sp = (np.clip(N @ h, 0, 1)[:, None] ** 90) * 1.4 * sh[:, None]
        refl = E * np.array([0.35, 0.6, 1.0]) * (0.22 + 0.75 * F) * (0.6 + 0.4 * ao_v[:, None])
        rimc = (1 - ndv) ** 2.4 * np.array([0.05, 0.85, 0.80]) * 0.85
        col = diff + sp + refl + rimc + ndr * np.array([0.04, 0.5, 0.55]) * 0.5
        # veinage de cristal très discret
        vein = 0.5 + 0.5 * np.sin(P[:, 0:1] * 28 + P[:, 1:2] * 17 + np.sin(P[:, 2:3] * 11) * 3)
        col = col * (0.88 + 0.12 * vein)
        glow = np.array([0.1, 0.95, 0.88])
        edge = glow * (1.4 * trim)
        col = col * (1 - trim * 0.8) + edge * 0.95 + trim * (E * 0.2)
    return col


def render(name, kind):
    sdf, height = GEOMS[name]()
    S = 0.95
    ys, xs = np.mgrid[0:R, 0:R]
    u = (xs + 0.5) / R * 2 - 1
    v = 1 - (ys + 0.5) / R * 2
    target = np.array([0.0, 0.55, 0.0])
    o = (target[None, :] + u.reshape(-1, 1) * S * RIGHT + v.reshape(-1, 1) * S * UPC - DIR * 5.0)
    d = DIR
    t, hit = march(sdf, o, d)
    col = np.zeros((R * R, 3))
    alpha = np.zeros(R * R)
    idx = np.nonzero(hit)[0]
    P = o[idx] + d * t[idx, None]
    N = normal(sdf, P)
    a_o = ao(sdf, P, N)
    sh = soft_shadow(sdf, P + N * 0.01, L_KEY)
    col[idx] = shade(name, kind, P, N, a_o, sh)
    # bord adouci : alpha selon la distance minimale approchée
    alpha[idx] = 1.0
    # yeux et naseaux du cavalier
    if name == "knight":
        for (cx, cy, cz, r) in ((-.14, .835, .0, .032),):
            for s in (-1, 1):
                dd = np.linalg.norm(P - np.array([cx, cy, s * 0.098]), axis=1)
                m = np.clip(1 - dd / (r * 1.4), 0, 1)[:, None]
                dark = np.array([0.02, 0.01, 0.0]) if kind == "ivory" else np.array([0.2, 1.0, 0.95])
                col[idx] = col[idx] * (1 - m) + dark * m
    col = col.reshape(R, R, 3)
    alpha = alpha.reshape(R, R)
    return col, alpha


def finish(col, alpha, name, size=256, fill=0.9):
    from lib import tonemap
    rgb = tonemap(col)
    img = np.dstack([rgb, alpha])
    im = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    # recadrage serré
    bbox = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(bbox)
    w, h = im.size
    return im


TARGET_W = {"pawn": .74, "rook": .80, "knight": .84, "bishop": .78, "queen": .86, "king": .88}
SW, SH = 256, 288


def sprite(im, name):
    from PIL import ImageDraw
    w0, h0 = im.size
    tw = TARGET_W[name] * SW
    scale = tw / w0
    if h0 * scale > 0.955 * SH:
        scale = 0.955 * SH / h0
    w = int(round(w0 * scale)); h = int(round(h0 * scale))
    rs = im.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    base_w = w * 0.98
    sh = Image.new("L", (SW, SH), 0)
    dr = ImageDraw.Draw(sh)
    cy = SH * 0.935
    dr.ellipse([SW / 2 - base_w * 0.58, cy - SH * 0.045, SW / 2 + base_w * 0.58, cy + SH * 0.04], fill=200)
    sh = sh.filter(ImageFilter.GaussianBlur(SW * 0.018))
    shadow = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    shadow.putalpha(sh)
    canvas.alpha_composite(shadow)
    px = (SW - w) // 2
    py = int(SH * 0.93 - h + SH * 0.012)
    canvas.alpha_composite(rs, (px, py))
    return canvas


def main(only=None):
    for kind in ("ivory", "sapphire"):
        for name in GEOMS:
            if only and name not in only:
                continue
            t0 = time.time()
            col, alpha = render(name, kind)
            im = finish(col, alpha, name)
            sp = sprite(im, name)
            save_webp(sp, os.path.join(OUT, f"{kind}-{name}.webp"), 90)
            sp.save(os.path.join(OUT, f"_{kind}-{name}.png"))
            print(kind, name, f"{time.time() - t0:.1f}s")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
