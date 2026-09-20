"""Cut a row of objects off a flat-background sheet into separate transparent tokens.

The DM generates several props in ONE picture (cheaper for him than one prompt each) on a flat mid-grey
field with no shadows — see the image prompts in DESIGN §53. This finds the background colour from the
border, keys it out with a soft edge, splits the row on empty columns, and writes one square WebP per object.

⚠️ NOT decheck.py's job. That one strips a baked-in transparency CHECKERBOARD (a generator pretending to
give you alpha). This one handles a plain solid field, which is a different and much easier problem — ask
for flat grey and you never need the checkerboard stripper at all.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def cut(path, names, outdir, size=512, lo=18.0, hi=46.0, gap=12, pad=0.06):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    # the background is whatever the border is made of
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    alpha = np.clip((dist - lo) / (hi - lo), 0, 1)
    solid = alpha > 0.5

    # split the row wherever a run of columns is empty
    cols = solid.any(axis=0)
    spans, run = [], None
    for x in range(w):
        if cols[x] and run is None:
            run = x
        elif not cols[x] and run is not None:
            if x - run > gap:
                spans.append((run, x))
            run = None
    if run is not None:
        spans.append((run, w))
    print(f"{len(spans)} objects found in {Path(path).name}")
    if len(spans) != len(names):
        print(f"  ⚠️ expected {len(names)} — check the sheet before trusting these")

    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    out = []
    for (x0, x1), name in zip(spans, names):
        band = solid[:, x0:x1]
        rows = np.where(band.any(axis=1))[0]
        y0, y1 = int(rows[0]), int(rows[-1]) + 1
        rgba = np.dstack([a[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).astype(np.uint8)
        obj = Image.fromarray(rgba, "RGBA")
        # square, centred, with a little air so a round token frame never clips it
        side = int(max(obj.size) * (1 + 2 * pad))
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(obj, ((side - obj.width) // 2, (side - obj.height) // 2))
        canvas = canvas.resize((size, size), Image.LANCZOS)
        p = outdir / f"{name}.webp"
        canvas.save(p, "WEBP", quality=92, method=6)
        out.append(p)
        print(f"  {name:6s} {obj.width}x{obj.height} -> {p.name}")
    return out


if __name__ == "__main__":
    src, dest, *names = sys.argv[1:]
    cut(src, names, dest)
