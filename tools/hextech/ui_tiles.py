"""Cadres de rareté (silhouette + matière + gemmes serties) et glyphes lumineux gravés."""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from lib import fbm, blur, normals_from_height, tonemap
from metal import edt, draw_mask, downsample, smooth, bump, metal_shade, compose, LIGHT

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "web", "src", "assets", "hextech")
S = 192


def octagon(x0, y0, x1, y1, c):
    return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]


RAR = {
    # clé: (albedo métal, couleur de lueur, gemmes)
    "common":    (np.array([0.40, 0.45, 0.53]), np.array([0.55, 0.62, 0.75]), 1),
    "uncommon":  (np.array([0.86, 0.55, 0.33]), np.array([0.35, 0.85, 0.45]), 2),
    "rare":      (np.array([0.84, 0.90, 1.00]), np.array([0.22, 0.55, 1.00]), 3),
    "epic":      (np.array([0.40, 0.30, 0.60]), np.array([0.72, 0.42, 1.00]), 4),
    "legendary": (np.array([1.00, 0.78, 0.36]), np.array([1.00, 0.80, 0.40]), 5),
}


def shapes_for(r):
    x0, y0, x1, y1 = 24, 24, 168, 168
    if r == "common":
        outer = [("rrect", (x0, y0, x1, y1), 17)]
        inner = [("rrect", (x0 + 15, y0 + 15, x1 - 15, y1 - 26), 8)]
        return outer, inner
    c = 26
    outer = [("poly", octagon(x0, y0, x1, y1, c))]
    inner = [("poly", octagon(x0 + 15, y0 + 15, x1 - 15, y1 - 26, 14))]
    if r in ("rare", "epic", "legendary"):
        big = r == "legendary"
        w = 22 if big else 17
        for sx in (0, 1):
            xb = x0 if sx == 0 else x1
            s = -1 if sx == 0 else 1
            outer.append(("poly", [(xb, 62), (xb + s * w, 96), (xb, 130)]))
            outer.append(("poly", [(xb - s * 2, 76), (xb + s * (w - 8), 96), (xb - s * 2, 116)]))
    if r in ("epic", "legendary"):
        for (cx, cy, dx, dy) in ((x0, y0, -1, -1), (x1, y0, 1, -1), (x0, y1, -1, 1), (x1, y1, 1, 1)):
            outer.append(("poly", [(cx, cy - dy * c), (cx + dx * 9, cy + dy * 9), (cx - dx * c, cy)]))
    if r == "epic":
        outer.append(("poly", [(80, y0 + 1), (96, 8), (112, y0 + 1)]))
    if r == "legendary":
        outer.append(("poly", [(62, y0 + 1), (70, 8), (82, 18), (96, 2), (110, 18), (122, 8), (130, y0 + 1)]))
        outer.append(("poly", [(76, y1 - 1), (96, 186), (116, y1 - 1)]))
    return outer, inner


def gem(rgb, cx, cy, rad, col, ss):
    N = rgb.shape[0]
    ys, xs = np.mgrid[0:N, 0:N]
    X = (xs + 0.5) / ss - cx
    Y = (ys + 0.5) / ss - cy
    rr = np.hypot(X, Y)
    m = rr < rad
    z = np.sqrt(np.clip(1 - (rr / rad) ** 2, 0, 1))
    nn = np.stack([X / rad, Y / rad, z], -1)
    dl = np.clip(nn @ LIGHT, 0, 1)[..., None]
    V = np.array([0, 0, 1.0])
    body = col * (0.20 + 1.0 * dl) + col * 0.9 * (1 - z[..., None]) ** 1.5 + (dl ** 30) * 1.2
    sock = (rr < rad + 1.8) & (~m)
    out = np.where(m[..., None], body, rgb)
    out = np.where(sock[..., None], rgb * 0.30, out)
    return out


def frame(r):
    albedo, glow, k = RAR[r]
    ss = 2
    N = S * ss
    outer_shapes, inner_shapes = shapes_for(r)
    outer = draw_mask(S, outer_shapes, ss)
    inner = draw_mask(S, inner_shapes, ss)
    d_out = edt(outer) / ss
    d_in = edt(1 - inner) / ss        # distance (hors inner) au bord interne
    ring = outer * (1 - inner)
    tot = d_out + d_in
    t = np.clip(d_out / np.maximum(tot, 1e-6), 0, 1)
    ring_ok = (d_in < 40) & (tot < 46)
    prof_ring = np.interp(t, [0, .10, .28, .40, .52, .64, .86, 1.0], [0, .75, .85, .38, .38, .86, .78, .20])
    prof_app = bump(d_out, [(0, 0), (1.6, .70), (5, .85), (14, .75), (60, .75)])
    h = np.where(ring_ok, prof_ring, prof_app) * ring
    rgb = metal_shade(blur(h, 0.8), albedo, seed={"common": 2, "uncommon": 5, "rare": 7, "epic": 9, "legendary": 4}[r], strength=8.0, brushed=0.09)
    # liseré lumineux dans la gorge
    groove = np.exp(-(((t - 0.46) * np.maximum(tot, 1)) ** 2) / 1.4) * ring_ok * ring
    rgb = rgb * (1 - 0.6 * groove[..., None]) + glow * groove[..., None] * 1.15
    # plaque : verre fumé sombre
    ys, xs = np.mgrid[0:N, 0:N]
    n1 = fbm(N, N, 30, 3, 31)
    plate = np.array([0.012, 0.024, 0.052]) * (0.8 + 0.5 * n1[..., None])
    inset = smooth(d_in_inside(inner, ss) / 10.0)
    plate = plate * (0.35 + 0.65 * inset[..., None])
    u = (xs + ys) / (2.0 * N)
    plate = plate + (np.exp(-((u - 0.35) ** 2) / 0.012) * 0.025)[..., None] * np.array([0.7, 0.85, 1.0])
    rgb = np.where(inner[..., None] > 0.5, plate, rgb)
    # gemmes serties dans la barre du bas
    gy = 168 - 12.5
    gx0 = 96 - (k - 1) * 8.5
    for i in range(k):
        rgb = gem(rgb, gx0 + i * 17, gy, 6.3, glow * 0.95, ss)
    alpha = np.maximum(ring, inner)
    return compose(downsample(rgb, ss), downsample(alpha, ss))


def d_in_inside(inner, ss):
    return edt(inner) / ss


# ------------------------------------------------------------------ glyphes
FAM = {
    "attack": (1.0, 0.42, 0.42), "defense": (0.04, 0.78, 0.72), "mobility": (0.62, 0.82, 1.0),
    "control": (0.82, 0.55, 0.84), "create": (1.0, 0.62, 0.29),
}


def rrect_pts(x0, y0, x1, y1, r, n=7):
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


GLYPHS = {
    "ascension": ("create", [[(22, 88), (16, 44), (40, 64), (60, 34), (80, 64), (104, 44), (98, 88), (22, 88)], [(24, 100), (96, 100)]]),
    "permutation": ("mobility", [[(26, 44), (88, 44), (76, 31)], [(94, 76), (32, 76), (44, 89)]]),
    "freeze": ("control", [[(60, 18), (60, 102)], [(24, 39), (96, 81)], [(24, 81), (96, 39)], [(49, 25), (60, 35), (71, 25)], [(49, 95), (60, 85), (71, 95)]]),
    "mirror": ("control", [rrect_pts(36, 18, 84, 104, 14) + [rrect_pts(36, 18, 84, 104, 14)[0]], [(46, 42), (72, 76)], [(46, 62), (60, 80)]]),
    "sparkle": ("create", [[(60, 12), (70, 46), (104, 56), (70, 66), (60, 100), (50, 66), (16, 56), (50, 46), (60, 12)], [(96, 84), (100, 94), (110, 98), (100, 102), (96, 112), (92, 102), (82, 98), (92, 94), (96, 84)]]),
    "shield": ("defense", [[(60, 14), (92, 28), (92, 58), (60, 106), (28, 58), (28, 28), (60, 14)]]),
    "swords": ("attack", [[(26, 26), (94, 94)], [(94, 26), (26, 94)], [(26, 26), (40, 26)], [(26, 26), (26, 40)], [(94, 26), (80, 26)], [(94, 26), (94, 40)]]),
}


def glyph(name, size=S, ss=3):
    fam, strokes = GLYPHS[name]
    col = np.array(FAM[fam])
    N = size * ss
    im = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(im)
    sc = size / 192.0 * 1.0
    k = (N / 120.0) * 0.70         # le glyphe occupe ≈ 64 % de la tuile
    ox = (N - 120 * k) / 2.0
    oy = (N - 120 * k) / 2.0
    wpx = 10.5 * k
    for st in strokes:
        pts = [(ox + x * k, oy + y * k) for x, y in st]
        d.line(pts, fill=255, width=int(round(wpx)), joint="curve")
        for (x, y) in (pts[0], pts[-1]):
            d.ellipse([x - wpx / 2, y - wpx / 2, x + wpx / 2, y + wpx / 2], fill=255)
    M = np.asarray(im, dtype=np.float64) / 255.0
    M = downsample(blur(M, 0.6 * ss), ss) if False else downsample(M, ss)
    h = blur(M, 1.4)
    n = normals_from_height(h, 7.0)
    dl = np.clip(n @ LIGHT, 0, 1)
    lit = np.clip((dl - 0.62) * 3.0, 0, 1)
    shade = np.clip((0.62 - dl) * 2.6, 0, 1)
    g1 = blur(M, 3.2)
    g2 = blur(M, 9.0)
    core = np.array([1.0, 0.98, 0.94])
    inner = col * 0.55 + core * 0.45
    rgb = (inner * (0.78 + 0.45 * lit - 0.5 * shade)[..., None] * M[..., None]
           + col[None, None, :] * (g1 * 0.95 + g2 * 0.55)[..., None] * (1 - M[..., None]) * 1.1)
    # cœur plus clair au milieu du trait
    cen = blur(M, 2.0) ** 3
    rgb = rgb + core * (cen * 0.35)[..., None] * M[..., None]
    alpha = np.clip(M + g1 * 0.85 + g2 * 0.5, 0, 1)
    rgb = rgb / np.maximum(alpha[..., None], 0.05)
    out = np.dstack([np.clip(rgb, 0, 1) ** (1 / 1.05), alpha])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def main(only=None):
    os.makedirs(os.path.join(OUT, "tiles"), exist_ok=True)
    for r in RAR:
        if only and r not in only:
            continue
        im = frame(r)
        im.save(os.path.join(OUT, "tiles", f"frame-{r}.webp"), "WEBP", quality=92, method=6)
        im.save(os.path.join(OUT, "tiles", f"_frame-{r}.png"))
        print("frame", r)
    for g in GLYPHS:
        if only and g not in only and not any(o in RAR for o in only) is False:
            pass
        im = glyph(g)
        im.save(os.path.join(OUT, "tiles", f"glyph-{g}.webp"), "WEBP", quality=92, method=6)
        im.save(os.path.join(OUT, "tiles", f"_glyph-{g}.png"))
    print("glyphs ok")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
