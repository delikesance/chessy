"""Fond de scène : trame hexagonale gravée, tuilable, très discrète."""
import os, sys, math
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from lib import fbm, blur

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "web", "src", "assets", "hextech")
a = 32.0
W, H = 554, 576   # 10 colonnes de √3·a, 6 rangées de 3a/… (≈ période exacte)

def hexdist(x, y, a):
    # distance « hexagonale » normalisée au centre de cellule le plus proche (pointes en haut)
    s3 = math.sqrt(3)
    px = x / (s3 * a); py = y / (1.5 * a)
    # deux réseaux décalés
    best = np.full(x.shape, 9.0); idx = np.zeros(x.shape, dtype=np.int64)
    out = None
    for ox, oy in ((0.0, 0.0), (0.5, 0.5)):
        qx = px - ox; qy = py - oy
        cx = np.round(qx); cy = np.round(qy)
        dx = (qx - cx) * s3 * a; dy = (qy - cy) * 1.5 * a
        dd = np.hypot(dx, dy)
        take = dd < best
        best = np.where(take, dd, best)
        out = (dx, dy, cx + ox, cy + oy) if out is None else tuple(np.where(take, n, o) for n, o in zip((dx, dy, cx + ox, cy + oy), out))
    return out

def main():
    ys, xs = np.mgrid[0:H, 0:W].astype(float)
    dx, dy, cx, cy = hexdist(xs, ys, a)
    # distance au bord de l'hexagone (pointe en haut) : max sur 3 axes
    ax = np.abs(dx)
    d1 = np.abs(dx * math.cos(math.radians(30)) + dy * math.sin(math.radians(30)))
    d2 = np.abs(dx * math.cos(math.radians(30)) - dy * math.sin(math.radians(30)))
    r = np.maximum(np.maximum(ax / 1.0 * 1.0, d1), d2) / (a * math.sqrt(3) / 2)
    edge = np.exp(-((1 - r) ** 2) / 0.0016)
    h = (cx * 7.31 + cy * 3.17)
    rnd = (np.sin(h * 12.9898) * 43758.5453) % 1.0
    n = fbm(W, H, 120, 3, 5, tile=True)
    img = np.zeros((H, W, 4))
    gold = np.array([200, 170, 110]) / 255.0
    img[..., :3] = gold
    img[..., 3] = edge * (0.045 + 0.05 * (rnd > 0.86)) + (rnd > 0.93) * 0.02 * (1 - edge) * n
    Image.fromarray((img * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "bg-hex.webp"), "WEBP", quality=88, method=6, lossless=False)
    Image.fromarray((img * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "_bg-hex.png"))

main()
