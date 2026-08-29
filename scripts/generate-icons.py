"""
Generate the PulseDex home-screen / PWA icon set.

The mark is the ECG pulse line: a flat baseline, a small blip, the tall spike
and deep trough, then a second medium blip back to baseline. Drawn rather than
traced from a bitmap so every size stays crisp, and re-runnable if the artwork
is ever tweaked.

    python scripts/generate-icons.py

Writes into public/. Sizes cover iOS (apple-touch-icon), Android/Chrome
(manifest 192/512) and a maskable variant that survives Android's circular and
squircle crops.
"""

from PIL import Image, ImageDraw

BACKGROUND = (0, 0, 0)
STROKE = (255, 255, 255)

# Supersample factor. PIL has no anti-aliased stroking, so the mark is drawn
# large and downsampled - that is what produces smooth diagonals.
SS = 4

# Canvas the path below is authored against.
BASE = 1024

# The pulse trace, in BASE-space coordinates.
PULSE = [
    (185, 543),   # baseline, left
    (293, 543),
    (318, 468),   # small blip up
    (378, 600),   # dip before the spike
    (432, 257),   # tall peak
    (510, 763),   # deep trough
    (543, 545),   # back to baseline
    (610, 545),
    (668, 433),   # second, medium peak
    (727, 543),
    (838, 543),   # baseline, right
]

STROKE_WIDTH = 27


def draw_mark(size, scale=1.0):
    """
    Render the mark at `size` px. `scale` shrinks the artwork within the canvas
    without shrinking the canvas - used for the maskable icon, whose content
    must sit inside Android's safe zone.
    """
    canvas = size * SS
    img = Image.new("RGB", (canvas, canvas), BACKGROUND)
    draw = ImageDraw.Draw(img)

    # Map BASE-space to the supersampled canvas, applying the safe-zone scale
    # about the centre of the image.
    unit = canvas / BASE
    centre = BASE / 2

    def place(point):
        x, y = point
        return (
            (centre + (x - centre) * scale) * unit,
            (centre + (y - centre) * scale) * unit,
        )

    points = [place(p) for p in PULSE]
    width = max(1, round(STROKE_WIDTH * unit * scale))

    # joint="curve" rounds the interior corners; the caps are added separately
    # because PIL only offers butt ends.
    draw.line(points, fill=STROKE, width=width, joint="curve")

    radius = width / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=STROKE)

    return img.resize((size, size), Image.LANCZOS)


OUTPUTS = [
    # (filename, size, artwork scale)
    ("public/apple-touch-icon.png", 180, 1.0),
    ("public/icon-192.png", 192, 1.0),
    ("public/icon-512.png", 512, 1.0),
    # Maskable: Android may crop to a circle, so the trace is pulled in to ~72%
    # of the canvas to stay clear of the edges.
    ("public/icon-maskable-512.png", 512, 0.72),
    ("public/favicon-32.png", 32, 1.0),
]


def main():
    for path, size, scale in OUTPUTS:
        draw_mark(size, scale).save(path, "PNG", optimize=True)
        print(f"wrote {path} ({size}x{size})")


if __name__ == "__main__":
    main()
