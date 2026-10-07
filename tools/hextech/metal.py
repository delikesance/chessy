"""Moteur de matières 2D : distance, relief, éclairage métal brossé / verre / gemme."""
import numpy as np
from PIL import Image, ImageDraw
from lib import fbm, blur, normals_from_height, tonemap

LIGHT = np.array([-0.55, -0.62, 0.56])   # x gauche, y haut (écran), z vers l'œil
LIGHT /= np.linalg.norm(LIGHT)


def edt(mask):
    """Distance euclidienne (px) au fond pour chaque pixel de mask>0 (Felzenszwalb, 2 passes)."""
    inf = 1e12
    f = np.where(mask > 0.5, inf, 0.0)

    def pass1d(a):
        n = a.shape[0]
        v = np.zeros(n, dtype=np.int64)
        z = np.zeros(n + 1)
        k = 0
        v[0] = 0
        z[0] = -inf
        z[1] = inf
        for q in range(1, n):
            while True:
                p = v[k]
                s = ((a[q] + q * q) - (a[p] + p * p)) / (2.0 * q - 2.0 * p)
                if s <= z[k] and k > 0:
                    k -= 1
                else:
                    break
            if s <= z[k]:
                k = 0
                s = ((a[q] + q * q) - (a[v[0]] + v[0] * v[0])) / (2.0 * q - 2.0 * v[0])
            k += 1
            v[k] = q
            z[k] = s
            z[k + 1] = inf
        out = np.empty(n)
        k = 0
        for q in range(n):
            while z[k + 1] < q:
                k += 1
            out[q] = (q - v[k]) ** 2 + a[v[k]]
        return out

    g = np.empty_like(f)
    for x in range(f.shape[1]):
        g[:, x] = pass1d(f[:, x])
    h = np.empty_like(g)
    for y in range(g.shape[0]):
        h[y, :] = pass1d(g[y, :])
    return np.sqrt(np.minimum(h, inf))


def draw_mask(size, shapes, ss=2):
    """shapes : liste de ('poly', pts) | ('rrect', box, r) | ('ell', box) ; pts en px de la taille finale."""
    W = size * ss
    im = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(im)
    for s in shapes:
        if s[0] == "poly":
            d.polygon([(x * ss, y * ss) for x, y in s[1]], fill=255)
        elif s[0] == "rrect":
            x0, y0, x1, y1 = s[1]
            d.rounded_rectangle([x0 * ss, y0 * ss, x1 * ss, y1 * ss], radius=s[2] * ss, fill=255)
        elif s[0] == "ell":
            x0, y0, x1, y1 = s[1]
            d.ellipse([x0 * ss, y0 * ss, x1 * ss, y1 * ss], fill=255)
    return np.asarray(im, dtype=np.float64) / 255.0


def downsample(a, ss):
    h, w = a.shape[:2]
    return a.reshape(h // ss, ss, w // ss, ss, *a.shape[2:]).mean(axis=(1, 3))


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def bump(d, edges):
    """Profil de hauteur selon la distance au bord ; edges = [(d, h), ...] interpolé linéairement."""
    xs, ys = zip(*edges)
    return np.interp(d, xs, ys)


def env_studio(rx, ry, rz):
    """Studio contrasté : voûte claire, sol noir, grande boîte à lumière haut-gauche, bandeau froid à droite."""
    up = smooth((-ry + 0.05) / 0.95)
    sky = (up ** 1.6)[..., None] * np.array([1.05, 1.0, 0.95])
    ground = (1 - up)[..., None] * np.array([0.025, 0.028, 0.04])
    box1 = np.exp(-(((rx + 0.55) ** 2 + (ry + 0.62) ** 2 + (rz - 0.5) ** 2) * 9.0))[..., None] * np.array([3.0, 2.6, 2.0])
    strip = np.exp(-(((rx - 0.75) ** 2) * 18.0 + ((ry + 0.1) ** 2) * 2.0))[..., None] * np.array([0.45, 0.8, 1.0])
    low = np.exp(-(((rx - 0.1) ** 2 + (ry - 0.7) ** 2) * 12.0))[..., None] * np.array([0.5, 0.35, 0.2])
    return sky * 0.75 + ground + box1 + strip + low


def metal_shade(height, albedo, seed=1, strength=2.6, brushed=0.10, roughness_streak=0.5, aniso_scale=(2.0, 90.0), ao=None):
    """Rend un relief 'height' en métal. Retourne un tableau RGB linéaire."""
    h, w = height.shape
    n = normals_from_height(height, strength)
    # grain brossé : bruit étiré horizontalement, perturbe la réflexion
    sx, sy = aniso_scale
    streak = fbm(w, h, 1.0, 1, seed)  # placeholder pour la forme
    g1 = fbm(w, h, 36.0, 3, seed)
    ys, xs = np.mgrid[0:h, 0:w]
    gx = fbm(w * 4, 1, 1.0, 1, seed + 3)  # inutile, gardé pour compat
    streak = np.repeat(fbm(w, 6, 22.0, 3, seed + 5)[:1, :], h, axis=0) * 0.5 + 0.5 * np.repeat(fbm(1, h, 3.0, 2, seed + 9)[:, :1], w, axis=1)
    streak = (streak - streak.mean())
    n = n.copy()
    n[..., 0] += streak * brushed
    n[..., 1] += (g1 - 0.5) * brushed * 0.35
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    V = np.array([0, 0, 1.0])
    ndl = np.clip(n @ LIGHT, 0, 1)[..., None]
    ndv = np.clip(n[..., 2], 0, 1)[..., None]
    R = 2 * n[..., 2:3] * n - V
    E = env_studio(R[..., 0], R[..., 1], R[..., 2])
    fres = (0.08 + 0.92 * (1 - ndv) ** 4)
    amb = 0.22 if ao is None else 0.22 * ao[..., None]
    col = albedo * (ndl * 0.65 + amb) + albedo * E * (0.62 + 0.38 * fres)
    h_ = (LIGHT + V); h_ /= np.linalg.norm(h_)
    spec = (np.clip(n @ h_, 0, 1)[..., None]) ** 90 * 1.1
    col = col + spec * np.array([1.0, 0.95, 0.85]) * 0.9
    if ao is not None:
        col = col * (0.6 + 0.4 * ao[..., None])
    return col


def compose(rgb, alpha):
    img = np.dstack([tonemap(rgb), np.clip(alpha, 0, 1)])
    return Image.fromarray((img * 255 + 0.5).astype(np.uint8), "RGBA")
