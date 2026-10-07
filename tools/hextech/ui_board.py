"""Damier d'obsidienne, cadre d'or gravé, boutons forgés (9-slice)."""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from lib import fbm, ridged, blur, normals_from_height, tonemap, save_webp
from metal import edt, draw_mask, downsample, smooth, bump, metal_shade, compose, LIGHT

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "web", "src", "assets", "hextech")
os.makedirs(OUT, exist_ok=True)


# ------------------------------------------------------------------ damier
def board_squares(N=1024):
    cell = N // 8
    ys, xs = np.mgrid[0:N, 0:N]
    ci, ri = xs // cell, ys // cell
    light = ((ci + ri) % 2 == 0)[..., None]
    n1 = fbm(N, N, 180, 4, 3)
    n2 = fbm(N, N, 40, 3, 8)
    # veines : bruit en crête déformé
    wx = fbm(N, N, 140, 3, 21) * 90
    wy = fbm(N, N, 140, 3, 34) * 90
    from lib import value_noise
    v = 1.0 - np.abs(fbm(N, N, 150, 4, 55) * 2 - 1)
    vein = np.clip((v - 0.86) / 0.14, 0, 1) ** 2
    vein2 = np.clip((1.0 - np.abs(fbm(N, N, 70, 3, 77) * 2 - 1) - 0.9) / 0.1, 0, 1) ** 2
    L = np.array([0.150, 0.215, 0.335]); L2 = np.array([0.255, 0.350, 0.520])
    D = np.array([0.020, 0.035, 0.075]); D2 = np.array([0.050, 0.080, 0.150])
    alb_l = L + (L2 - L) * n1[..., None]
    alb_d = D + (D2 - D) * n1[..., None]
    alb = np.where(light, alb_l, alb_d)
    alb = alb * (0.88 + 0.24 * n2[..., None])
    veins = blur(vein * 0.45 + vein2 * 0.22, 1.1)[..., None]
    alb = alb + veins * np.where(light, np.array([0.20, 0.28, 0.40]), np.array([0.055, 0.09, 0.16]))
    # bombé de chaque case
    lx = xs % cell; ly = ys % cell
    e = np.minimum(np.minimum(lx, ly), np.minimum(cell - 1 - lx, cell - 1 - ly)).astype(float)
    h = smooth(e / 9.0) * 1.0 + blur(n1, 3) * 0.05
    nrm = normals_from_height(h, 3.0)
    ndl = np.clip(nrm @ LIGHT, 0, 1)[..., None]
    edge_lit = np.clip((ndl - ndl.mean()) * 1.2, -0.4, 0.8)
    col = alb * (0.78 + 0.5 * ndl) + edge_lit * 0.10 * np.where(light, 1.0, 0.45)
    # fine ligne de joint
    gap = (e < 1.2)[..., None]
    col = np.where(gap, col * 0.35, col)
    # reflets : voile diagonal de verre fumé
    u = (xs + ys) / (2.0 * N)
    sheen = np.exp(-((u - 0.28) ** 2) / 0.006) * 0.07 + np.exp(-((u - 0.64) ** 2) / 0.003) * 0.035
    col = col + sheen[..., None] * np.array([0.8, 0.9, 1.0])
    # vignette
    rr = np.hypot(xs - N / 2, ys - N / 2) / (N * 0.72)
    col = col * (1.0 - 0.28 * smooth(rr))[..., None]
    img = Image.fromarray((np.clip(col, 0, 1) ** (1 / 1.05) * 255).astype(np.uint8), "RGB")
    return img


# ------------------------------------------------------------------ cadre d'or
GOLD = np.array([1.0, 0.78, 0.36])


def board_frame(S=144, B=36):
    ss = 3
    N = S * ss
    outer = draw_mask(S, [("rrect", (0, 0, S, S), 5)], ss)
    inner = draw_mask(S, [("rrect", (B, B, S - B, S - B), 1)], ss)
    ys, xs = np.mgrid[0:N, 0:N]
    d = np.minimum(np.minimum(xs, ys), np.minimum(N - 1 - xs, N - 1 - ys)) / ss  # px finaux
    prof = bump(d, [(0, 0.0), (1.0, 0.55), (3.0, 0.72), (5.0, 0.55), (6.5, 0.32), (8.5, 0.30), (10, 0.52), (14, 0.74),
                    (19, 0.86), (24, 0.74), (28, 0.60), (30.5, 0.62), (32.5, 0.50), (34.2, 0.22), (36, 0.0)])
    # bossages d'angle : cabochons
    hh = prof.copy()
    for cx, cy in ((B * 0.5, B * 0.5), (S - B * 0.5, B * 0.5), (B * 0.5, S - B * 0.5), (S - B * 0.5, S - B * 0.5)):
        rr = np.hypot(xs / ss - cx, ys / ss - cy)
        dome = np.sqrt(np.clip(1 - (rr / 15.0) ** 2, 0, 1))
        hh = np.where(rr < 15.0, np.maximum(hh * 0.0 + 0.55, 0.55 + dome * 0.9), hh)
        ring = (rr > 15.0) & (rr < 17.5)
        hh = np.where(ring, 0.38, hh)
    mask = outer * (1 - inner)
    height = hh * mask
    rgb = metal_shade(blur(height, 0.7), GOLD, seed=4, strength=7.0, brushed=0.07)
    # liseré hextech turquoise dans la gorge
    glow_m = np.ones((N, N))
    for cx, cy in ((B * 0.5, B * 0.5), (S - B * 0.5, B * 0.5), (B * 0.5, S - B * 0.5), (S - B * 0.5, S - B * 0.5)):
        glow_m = glow_m * (np.hypot(xs / ss - cx, ys / ss - cy) > 18.0)
    glow = (np.exp(-((d - 7.6) ** 2) / 0.8) * glow_m)[..., None] * np.array([0.0, 0.85, 0.80]) * 1.2
    rgb = rgb * (1 - 0.7 * glow[..., :1] / 1.2) + glow
    # cabochons d'angle : cristal turquoise
    for cx, cy in ((B * 0.5, B * 0.5), (S - B * 0.5, B * 0.5), (B * 0.5, S - B * 0.5), (S - B * 0.5, S - B * 0.5)):
        rr = np.hypot(xs / ss - cx, ys / ss - cy)
        m = (rr < 8.0)[..., None]
        z = np.sqrt(np.clip(1 - (rr / 8.0) ** 2, 0, 1))
        nx = (xs / ss - cx) / 8.0; ny = (ys / ss - cy) / 8.0
        nn = np.stack([nx, ny, z], -1)
        dl = np.clip(nn @ LIGHT, 0, 1)[..., None]
        gem = np.array([0.02, 0.50, 0.55]) * (0.35 + 1.1 * dl) + np.array([0.0, 0.5, 0.5]) * (1 - z[..., None]) ** 2 + (dl ** 28) * 1.0
        rgb = np.where(m, gem, rgb)
    rgb_s = downsample(rgb, ss)
    a_s = downsample(mask, ss)
    return compose(rgb_s, a_s)


# ------------------------------------------------------------------ boutons
def button(W, H, T, albedo, groove_col, inlay=0.0, seed=2, chamfer=14, notch=True):
    """Plaque forgée (taille 3x des px CSS). T = épaisseur de la 9-slice en px image."""
    ss = 2
    w, h = W, H
    c = chamfer * 3
    poly = [(c, 0), (w - c, 0), (w, c), (w, h - c), (w - c, h), (c, h), (0, h - c), (0, c)]
    N_w, N_h = w * ss, h * ss
    from PIL import Image as I, ImageDraw
    im = I.new("L", (N_w, N_h), 0)
    dr = ImageDraw.Draw(im)
    dr.polygon([(x * ss, y * ss) for x, y in poly], fill=255)
    if notch:   # encoches hextech au milieu des côtés
        for x in (0, w):
            dr.polygon([(x * ss - 4 * ss * (1 if x else -1), (h / 2 - 12) * ss), (x * ss + 9 * ss * (-1 if x else 1), h / 2 * ss), (x * ss - 4 * ss * (1 if x else -1), (h / 2 + 12) * ss)], fill=0)
    mask = np.asarray(im, dtype=np.float64) / 255.0
    pad = 2
    D = edt(np.pad(mask, 0)) / ss
    prof = bump(D, [(0, 0.0), (1.5, 0.55), (4.5, 0.85), (8.0, 0.80), (11.0, 0.52), (13.0, 0.50), (16.0, 0.74), (30, 0.78), (400, 0.78)])
    # bombé du plateau
    yy = (np.mgrid[0:N_h, 0:N_w][0] / (N_h - 1.0)) * 2 - 1
    crown = (1 - yy ** 2) * 0.55 * smooth(D / 30.0)
    height = (prof + crown) * mask
    rgb = metal_shade(blur(height, 0.8), albedo, seed=seed, strength=7.0, brushed=0.10)
    if inlay > 0:
        g = np.exp(-((D - 7.2) ** 2) / 0.7)[..., None] * groove_col * inlay
        rgb = rgb + g
    rgb_s = downsample(rgb, ss)
    return compose(rgb_s, downsample(mask, ss))


def main():
    sq = board_squares()
    save_webp(sq, os.path.join(OUT, "board-squares.webp"), 86)
    fr = board_frame()
    fr.save(os.path.join(OUT, "board-frame.webp"), "WEBP", quality=92, method=6)
    fr.save(os.path.join(OUT, "_board-frame.png"))
    gold = button(360, 156, 54, np.array([1.0, 0.72, 0.31]), np.array([0.5, 0.25, 0.0]), inlay=0.35, seed=2)
    steel = button(360, 156, 54, np.array([0.30, 0.37, 0.50]), np.array([0.95, 0.72, 0.30]), inlay=0.55, seed=6)
    crim = button(360, 156, 54, np.array([0.80, 0.20, 0.28]), np.array([1.0, 0.7, 0.4]), inlay=0.35, seed=9)
    for n, im in (("gold", gold), ("steel", steel), ("crimson", crim)):
        im.save(os.path.join(OUT, f"btn-{n}.webp"), "WEBP", quality=92, method=6)
        im.save(os.path.join(OUT, f"_btn-{n}.png"))
    print("ok")


if __name__ == "__main__":
    main()
