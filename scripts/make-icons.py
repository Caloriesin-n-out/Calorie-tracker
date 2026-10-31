"""Generate the app icons (needs Pillow). Run from the repo root: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

ORANGE, TEAL, CREAM = (217, 102, 26), (14, 138, 128), (246, 245, 242)

def draw(size, safe):
    s = size * 4
    img = Image.new("RGB", (s, s), TEAL)  # full-bleed so the maskable version survives any mask shape
    d = ImageDraw.Draw(img)
    # two bars (eaten vs burned) inside the central safe zone
    box = s * safe
    x0, y0 = (s - box) / 2, (s - box) / 2
    bw, gap = box * 0.20, box * 0.10
    base = y0 + box * 0.82
    left = x0 + box * 0.5 - bw - gap / 2
    d.rounded_rectangle([left, base - box * 0.38, left + bw, base], radius=bw * 0.2, fill=ORANGE)
    right = left + bw + gap
    d.rounded_rectangle([right, base - box * 0.64, right + bw, base], radius=bw * 0.2, fill=CREAM)
    return img.resize((size, size), Image.LANCZOS)

draw(192, 0.80).save("icon-192.png")
draw(512, 0.80).save("icon-512.png")
draw(512, 0.60).save("icon-maskable-512.png")  # content kept inside the central 60% so any mask shape works
print("icons written")
