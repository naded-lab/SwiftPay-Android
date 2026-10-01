#!/usr/bin/env python3
"""يولّد كل الأيقونات وشاشة البداية من branding/logo-source.png (الشعار الملوّن الجديد).

الاستخدام:  python3 scripts/generate_branding.py
يحتاج: pillow + numpy
"""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "branding" / "logo-source.png"
MIP = ROOT / "branding" / "mipmap-source"
SPL = ROOT / "branding" / "splash-source"
ICONS = ROOT / "www" / "assets" / "icons"
M = 1024  # حجم الماستر


def load_master():
    im = Image.open(SRC).convert("RGBA")
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 128)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0)
    box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
    return im.crop(box).resize((M, M), Image.LANCZOS)


def fit_gradient(master):
    """يبني خلفية متدرّجة بنفس ألوان الشعار (للطبقة الخلفية للأيقونة التكيّفية)."""
    arr = np.array(master).astype(float)
    yy, xx = np.mgrid[0:M, 0:M] / (M - 1)
    a = arr[:, :, 3]
    ring = (a > 250) & (arr[:, :, 0] < 170) & (
        (xx < 0.15) | (xx > 0.85) | (yy < 0.09) | (yy > 0.89)
    ) & (xx > 0.03) & (xx < 0.97) & (yy > 0.03) & (yy < 0.97)
    u, v = xx[ring], yy[ring]

    def feats(u, v):
        return np.stack([np.ones_like(u), u, v, u * u, u * v, v * v,
                         u ** 3, u * u * v, u * v * v, v ** 3], -1)

    F = feats(u, v)
    coef = [np.linalg.lstsq(F, arr[:, :, c][ring], rcond=None)[0] for c in range(3)]
    return coef, feats


def gradient_image(size, coef, feats):
    g = np.mgrid[0:size, 0:size] / (size - 1)
    v, u = g[0].ravel(), g[1].ravel()
    F = feats(u, v)
    out = np.stack([np.clip(F @ c, 0, 255) for c in coef], -1).reshape(size, size, 3)
    return Image.fromarray(out.astype(np.uint8), "RGB").convert("RGBA")


def scaled(master, px):
    return master.resize((px, px), Image.LANCZOS)


def paste_center(base, img):
    x = (base.width - img.width) // 2
    y = (base.height - img.height) // 2
    base.alpha_composite(img, (x, y))
    return base


def circle_mask(size):
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def main():
    master = load_master()
    coef, feats = fit_gradient(master)

    # ---------- أيقونات أندرويد ----------
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for name, d in dens.items():
        out = MIP / f"mipmap-{name}"
        out.mkdir(parents=True, exist_ok=True)
        full, leg = int(108 * d), int(48 * d)
        # خلفية متدرّجة + شعار كامل بحجم ~74% (يبقى الـS داخل منطقة الأمان)
        bg = gradient_image(full, coef, feats)
        bg.convert("RGB").save(out / "ic_launcher_background.png")
        fg = Image.new("RGBA", (full, full), (0, 0, 0, 0))
        paste_center(fg, scaled(master, int(full * 0.74))).save(out / "ic_launcher_foreground.png")
        # الأيقونة التقليدية: الشعار نفسه بدون أي خلفية إضافية
        scaled(master, leg).save(out / "ic_launcher.png")
        r = scaled(master, leg)
        r.putalpha(Image.composite(r.getchannel("A"), Image.new("L", (leg, leg), 0), circle_mask(leg)))
        r.save(out / "ic_launcher_round.png")

    any_dir = MIP / "mipmap-anydpi-v26"
    any_dir.mkdir(parents=True, exist_ok=True)
    for f in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (any_dir / f).write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@mipmap/ic_launcher_background"/>\n'
            '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
            '</adaptive-icon>\n')
    (ROOT / "branding" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#1E6BFF</color>\n</resources>\n')

    # ---------- شاشة البداية: اللوغو فقط (الخلفية البيضاء والتموضع في drawable/splash.xml عبر install-stage2.sh) ----------
    SPL.mkdir(parents=True, exist_ok=True)
    scaled(master, 512).save(SPL / "splash_logo.png", optimize=True)

    # ---------- أيقونات الويب / PWA ----------
    scaled(master, 512).save(ICONS / "icon-512.png")
    scaled(master, 192).save(ICONS / "icon-192.png")
    scaled(master, 64).save(ICONS / "favicon-64.png")
    scaled(master, 32).save(ICONS / "favicon-32.png")
    for size in (192, 512):
        bg = gradient_image(size, coef, feats)
        paste_center(bg, scaled(master, int(size * 0.94))).convert("RGB").save(ICONS / f"icon-{size}-maskable.png")
    bg = gradient_image(180, coef, feats)
    paste_center(bg, scaled(master, 180)).convert("RGB").save(ICONS / "apple-touch-icon.png")
    print("done")


if __name__ == "__main__":
    main()
