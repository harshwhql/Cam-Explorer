"""Generate CamExplorer brand assets (icon, adaptive icon, splash, TV banner, favicon)."""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

BG = (10, 13, 18, 255)
BG2 = (20, 27, 38, 255)
A1 = (91, 140, 255)   # blue
A2 = (46, 230, 197)   # teal
WHITE = (238, 242, 247, 255)
SS = 4  # supersampling


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c1, c2, angle=45):
    full = size
    k = max(1, max(size) // 256)
    size = (max(1, size[0] // k), max(1, size[1] // k))
    return _gradient(size, c1, c2, angle).resize(full, Image.BILINEAR)


def _gradient(size, c1, c2, angle):
    w, h = size
    img = Image.new("RGBA", size)
    px = img.load()
    rad = math.radians(angle)
    dx, dy = math.cos(rad), math.sin(rad)
    span = abs(w * dx) + abs(h * dy)
    for y in range(h):
        for x in range(w):
            t = ((x * dx + y * dy) / span) if span else 0
            t = min(1, max(0, t))
            px[x, y] = (*lerp(c1, c2, t), 255)
    return img


def mark(size):
    """Viewfinder brackets + gradient lens. Transparent background."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = S / 2
    # viewfinder corner brackets
    m, L, t = S * 0.08, S * 0.22, S * 0.055
    for sx in (0, 1):
        for sy in (0, 1):
            x0 = m if sx == 0 else S - m
            y0 = m if sy == 0 else S - m
            xd = 1 if sx == 0 else -1
            yd = 1 if sy == 0 else -1
            d.rectangle([min(x0, x0 + xd * L), min(y0, y0 + yd * t), max(x0, x0 + xd * L), max(y0, y0 + yd * t)], fill=WHITE)
            d.rectangle([min(x0, x0 + xd * t), min(y0, y0 + yd * L), max(x0, x0 + xd * t), max(y0, y0 + yd * L)], fill=WHITE)
    # lens ring (gradient) via mask
    R = S * 0.27
    ring = gradient((S, S), A1, A2, 35)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([c - R, c - R, c + R, c + R], fill=255)
    img.paste(ring, (0, 0), mask)
    # inner dark lens
    r2 = R * 0.62
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=BG)
    r3 = R * 0.30
    d.ellipse([c - r3, c - r3, c + r3, c + r3], fill=(28, 38, 54, 255))
    # glint
    g = R * 0.13
    gx, gy = c - R * 0.22, c - R * 0.22
    d.ellipse([gx - g, gy - g, gx + g, gy + g], fill=(255, 255, 255, 230))
    # live dot
    lr = S * 0.045
    lx, ly = S - m - lr * 0.2, m + lr * 0.2
    d.ellipse([lx - lr * 2.2, ly - lr * 0.2, lx - lr * 0.2 + 0, ly + lr * 1.8], fill=(255, 92, 108, 255))
    return img.resize((size, size), Image.LANCZOS)


def bg_square(size, radius_frac=0.0):
    img = gradient((size, size), (14, 19, 27), (7, 9, 13), 60)
    if radius_frac:
        mask = Image.new("L", (size * SS, size * SS), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * SS, size * SS], radius=int(size * SS * radius_frac), fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


def place(base, overlay, scale):
    s = int(base.width * scale)
    o = overlay.resize((s, s), Image.LANCZOS)
    base.alpha_composite(o, ((base.width - s) // 2, (base.height - s) // 2))
    return base


def font(size, bold=True):
    for name in (["segoeuib.ttf", "seguisb.ttf"] if bold else ["segoeui.ttf"]):
        p = Path("C:/Windows/Fonts") / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


lens = mark(1024)

# App icon (legacy / web)
icon = place(bg_square(1024), lens, 0.78)
icon.save(OUT / "icon.png")

# Adaptive foreground: keep inside the 66% safe zone, transparent bg
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
place(fg, lens, 0.58)
fg.save(OUT / "adaptive-foreground.png")

# Splash mark (transparent)
place(Image.new("RGBA", (512, 512), (0, 0, 0, 0)), lens, 1.0).save(OUT / "splash.png")

# TV icon
place(bg_square(760), lens, 0.72).save(OUT / "tv-icon.png")

# TV banner 640x360 (xhdpi 320x180dp): mark + wordmark
W, H = 640 * 2, 360 * 2
banner = gradient((W, H), (16, 22, 32), (6, 8, 12), 20)
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([W * 0.02, H * 0.05, W * 0.48, H * 0.95], fill=(*A1, 70))
banner.alpha_composite(glow.filter(ImageFilter.GaussianBlur(90)))
m_size = int(H * 0.56)
banner.alpha_composite(mark(m_size), (int(W * 0.08), (H - m_size) // 2))
d = ImageDraw.Draw(banner)
tx = int(W * 0.08) + m_size + int(W * 0.04)
fs = int(H * 0.17)
while fs > 10 and ImageDraw.Draw(banner).textlength("CamExplorer", font=font(fs)) > (W * 0.93 - tx):
    fs -= 2
f1 = font(fs)
f2 = font(int(fs * 0.44), bold=False)
d.text((tx, int(H * 0.30)), "Cam", font=f1, fill=WHITE)
cam_w = d.textlength("Cam", font=f1)
d.text((tx + cam_w, int(H * 0.30)), "Explorer", font=f1, fill=(*A2, 255))
d.text((tx + 4, int(H * 0.56)), "Live CCTV on every screen", font=f2, fill=(139, 151, 167, 255))
banner.resize((640, 360), Image.LANCZOS).save(OUT / "tv-banner.png")

# favicon
icon.resize((64, 64), Image.LANCZOS).save(OUT / "favicon.png")
print("ok", sorted(p.name for p in OUT.iterdir()))
