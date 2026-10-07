"""Briques communes de rendu : bruit, flou, éclairage. numpy + Pillow seulement."""
import numpy as np
from PIL import Image


# ---------- bruit -----------------------------------------------------------
def _hash2(ix, iy, seed):
    with np.errstate(over="ignore"):
        n = ix.astype(np.uint64) * np.uint64(374761393) + iy.astype(np.uint64) * np.uint64(668265263) + np.uint64(seed * 2246822519 + 3266489917)
        n = (n ^ (n >> np.uint64(13))) * np.uint64(1274126177)
        n = n ^ (n >> np.uint64(16))
        n = n * np.uint64(2654435761)
        n = n ^ (n >> np.uint64(15))
    return (n & np.uint64(0xFFFFFF)).astype(np.float64) / float(0xFFFFFF)


def value_noise(w, h, scale, seed=0, tile=False):
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    x = xs / scale
    y = ys / scale
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx = x - x0
    fy = y - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    if tile:
        nx = max(1, int(round(w / scale)))
        ny = max(1, int(round(h / scale)))
        x1 = (x0 + 1) % nx
        y1 = (y0 + 1) % ny
        x0 = x0 % nx
        y0 = y0 % ny
    else:
        x1 = x0 + 1
        y1 = y0 + 1
    a = _hash2(x0, y0, seed)
    b = _hash2(x1, y0, seed)
    c = _hash2(x0, y1, seed)
    d = _hash2(x1, y1, seed)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(w, h, scale, octaves=5, seed=0, tile=False, gain=0.5):
    out = np.zeros((h, w))
    amp = 1.0
    tot = 0.0
    s = scale
    for o in range(octaves):
        out += amp * value_noise(w, h, max(s, 1.5), seed + o * 17, tile)
        tot += amp
        amp *= gain
        s /= 2.0
    return out / tot


def ridged(w, h, scale, octaves=5, seed=0, tile=False):
    n = fbm(w, h, scale, octaves, seed, tile)
    return 1.0 - np.abs(n * 2 - 1)


# ---------- flou ------------------------------------------------------------
def blur(a, sigma):
    """Flou gaussien par FFT (image 2D flottante)."""
    if sigma <= 0:
        return a
    h, w = a.shape
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi ** 2) * (sigma ** 2) * (kx ** 2 + ky ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))


def blur_rgb(img, sigma):
    return np.stack([blur(img[..., i], sigma) for i in range(img.shape[-1])], -1)


# ---------- relief ----------------------------------------------------------
def normals_from_height(hmap, strength=1.0):
    gy, gx = np.gradient(hmap)
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(hmap)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / n, ny / n, nz / n], -1)


def to_image(rgb, alpha=None):
    rgb = np.clip(rgb, 0, 1)
    out = (rgb * 255 + 0.5).astype(np.uint8)
    if alpha is None:
        return Image.fromarray(out, "RGB")
    a = (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)
    return Image.fromarray(np.dstack([out, a]), "RGBA")


def save_webp(img, path, q=88):
    img.save(path, "WEBP", quality=q, method=6)


def hexcol(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def tonemap(c):
    """Compression douce qui conserve la teinte (pas de jaune cramé sur l'or)."""
    c = np.maximum(c, 1e-6)
    m = c.max(axis=-1, keepdims=True)
    mapped = m / (1.0 + 0.62 * m) * 1.52
    out = c * (mapped / m)
    out = np.clip(out, 0, 1)
    return out ** (1 / 1.1)
