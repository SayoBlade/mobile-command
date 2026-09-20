"""Strip a baked-in transparency checkerboard from generated art, and the drop shadow with it.

Image generators often render the CHECKERBOARD ITSELF into the pixels — the picture looks transparent and is not
(DM 2026-09-20, the three nursery toys: "these are horrifying! but seem to not have a actual transparency, can you
fix it?"). Colour-keying is the obvious answer and the wrong one: the goat's fleece and the crow's beak highlights
are the same greys as the board, so a key punches holes straight through the toy. This works by REACHABILITY:

  1. Read the board's two tones from a border band, where the subject never reaches.
  2. Mark every pixel that could be board — neutral, and sitting on one of those tones or under it (the drop
     shadow is the same tones multiplied down, so the same test catches it).
  3. Flood from the border through that mark. Each toy is ringed by its own dark outline, so the flood stops at
     the edge and can never leak inside.
  4. Take the trapped pieces too — the gap between a goat's legs is board with no path to the border. It is told
     apart from paint by the board itself: a trapped piece still holds BOTH tones, light and dark; a flat grey
     patch on the toy holds one.
  5. Feather a pixel so the cut does not look like a stencil, and trim to what is left.

The flood runs at C speed through PIL and the masks are numpy — a pure-Python pass over a megapixel took minutes.

Run:  python tools/entrances/decheck.py <in> [more ...] [--outdir DIR] [--size N]
      --size N  also writes an N x N copy (a Foundry token wants a square; 512 is plenty).
"""
import argparse
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FREE, WALL, OUTSIDE, SEEN = 0, 255, 128, 64      # the values the flood works in


def border_tones(rgb, band=20):
    """The light and dark tone of the board, read from a border band the subject does not reach."""
    a = np.asarray(rgb)
    edge = np.concatenate([a[:band].reshape(-1, 3), a[-band:].reshape(-1, 3),
                           a[:, :band].reshape(-1, 3), a[:, -band:].reshape(-1, 3)])
    lum = edge.mean(axis=1)
    return float(np.percentile(lum, 5)), float(np.percentile(lum, 95))


def checker_period(rgb, band=40):
    """The checkerboard's square size, read off a border band: the shift that best repeats the pattern."""
    lum = np.asarray(rgb).astype(np.float32)[:band].mean(axis=2)
    best, bestscore = 32, -1e9
    for p in range(8, 161, 2):
        same = np.abs(lum[:, :-p] - lum[:, p:]).mean()
        half = p // 2
        opp = np.abs(lum[:, :-half] - lum[:, half:]).mean() if half else 0.0
        score = opp - same * 2.0
        if score > bestscore:
            best, bestscore = p, score
    return best


def pattern_mask(rgb, period, flat=18.0, step=0.09):
    """Where the CHECKERBOARD ITSELF is still visible — the only test that survives the drop shadow.

    ⚠️ THIS IS THE ONE THAT WORKS, and it took four wrong answers to get here. Brightness cannot do it: the
    raven's crown is neutral grey at luma 161, and the board's dark tone shadowed to 80% is 160 — the same number,
    so every threshold that caught the shadow also ate the bird's head. The board is not a colour, it is a
    PATTERN: one square period away it repeats itself, half a period away it flips to the other tone. Shadow
    dims both tones together, so the pattern survives it; paint has no period at all.
    """
    lum = np.asarray(rgb).astype(np.float32).mean(axis=2)
    a = np.asarray(rgb).astype(np.float32)
    neutral = (a.max(axis=2) - a.min(axis=2)) <= 26
    half = max(1, period // 2)

    def shift(m, dx, dy):
        return np.roll(np.roll(m, dy, axis=0), dx, axis=1)

    # EVERY direction, not any, and not one axis. Three variants were measured on his three toys:
    #   ANY single pair  — too weak: the raven's crown darkens half a period away by chance, and lost its head.
    #   ONE AXIS         — too weak lower down: the flood walked into the bird's belly through its own shading.
    #   ALL FOUR         — the toys come out whole, which is what matters. The price is that a drop SHADOW, being
    #                      a gradient down the image, fails the vertical repeat and survives as a soft grey patch
    #                      under each toy. That is a shadow-shaped shadow on a map, so it stays until it annoys
    #                      somebody; the alternative cost a raven its chest.
    repeats = np.ones(lum.shape, dtype=bool)
    flips = np.ones(lum.shape, dtype=bool)
    for dx, dy in ((period, 0), (-period, 0), (0, period), (0, -period)):
        repeats &= np.abs(lum - shift(lum, dx, dy)) <= flat
    for dx, dy in ((half, 0), (-half, 0), (0, half), (0, -half)):
        flips &= np.abs(lum - shift(lum, dx, dy)) >= np.maximum(6.0, step * lum)
    return neutral & repeats & flips


def background_mask(rgb, lo, hi, tol=26.0, floor=0.46):
    """Could this pixel be board, or board under the shadow? Neutral, and on a tone or below it.

    Deliberately GENEROUS: the shadow ladder accepts almost any neutral grey, which is safe for the flood from the
    border because the toy's dark outline stops it, and useless anywhere the outline is not there to help.
    """
    # ⚠️ A LADDER OF BANDS, NOT ONE RANGE — and the difference is the whole job. Accepting every neutral grey
    # between the shadow and the light tone let the flood walk straight THROUGH the raven and the bunny, whose
    # bodies are exactly those greys wherever their outline thins. Banding it around each tone and its shadowed
    # copies leaves the toys' own mid-greys outside the mask, so the flood stops at them as well as at the outline.
    a = np.asarray(rgb).astype(np.float32)
    neutral = (a.max(axis=2) - a.min(axis=2)) <= 16
    lum = a.mean(axis=2)
    near = np.zeros(lum.shape, dtype=bool)
    for tone in (lo, hi):
        for s in np.arange(1.0, floor - 0.001, -0.06):
            near |= np.abs(lum - tone * s) <= tol
    return neutral & near


def erode(m):
    """Shrink a boolean mask by one pixel (4-neighbour), sealing one and two pixel channels."""
    e = m.copy()
    e[1:, :] &= m[:-1, :]; e[:-1, :] &= m[1:, :]
    e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
    return e


def dilate(m):
    """Grow a boolean mask by one pixel (4-neighbour)."""
    d = m.copy()
    d[1:, :] |= m[:-1, :]; d[:-1, :] |= m[1:, :]
    d[:, 1:] |= m[:, :-1]; d[:, :-1] |= m[:, 1:]
    return d


def strict_board(rgb, lo, hi, tol=16.0):
    """Board and nothing else: neutral and sitting ON one of the two tones, no shadow ladder.

    ⚠️ The trapped-piece pass MUST use this. With the generous mask it treated the raven's chest and the bunny's
    belly as board — smooth painted shading passes through both tones on its way from light to dark, so "holds both
    tones" was true of half the toy. A gap of real board is bright, flat and exactly on the two tones.
    """
    a = np.asarray(rgb).astype(np.float32)
    neutral = (a.max(axis=2) - a.min(axis=2)) <= 12
    lum = a.mean(axis=2)
    return neutral & ((np.abs(lum - lo) <= tol) | (np.abs(lum - hi) <= tol))


def pattern_axis(rgb, period, flat=18.0, step=0.09):
    """The board's pattern along EITHER axis on its own — a looser read than pattern_mask.

    A drop shadow is a gradient down the page, so one period up or down is a different brightness and the vertical
    half of the strict test fails on it (measured under the raven: horizontal repeats of 1 and 3 beside vertical
    ones of 94 and 164). Accepting one axis finds the shadow — and is far too loose to FLOOD with, because the
    raven's own shading passes it too. It is only ever used to GROW outward from background already found, so it
    can reach the shadow attached to the feet and can never reach anything the toy encloses.
    """
    lum = np.asarray(rgb).astype(np.float32).mean(axis=2)
    a = np.asarray(rgb).astype(np.float32)
    neutral = (a.max(axis=2) - a.min(axis=2)) <= 26
    half = max(1, period // 2)

    def shift(m, dx, dy):
        return np.roll(np.roll(m, dy, axis=0), dx, axis=1)

    def along(horizontal):
        ok = np.ones(lum.shape, dtype=bool)
        for d in (period, -period):
            ok &= np.abs(lum - (shift(lum, d, 0) if horizontal else shift(lum, 0, d))) <= flat
        for d in (half, -half):
            ok &= np.abs(lum - (shift(lum, d, 0) if horizontal else shift(lum, 0, d))) >= np.maximum(6.0, step * lum)
        return ok

    return neutral & (along(True) | along(False))


def grow_into_board(bg, growable, rounds=400):
    """Spread the background outward, one pixel at a time, but only into pixels that still show the board."""
    for _ in range(rounds):
        more = dilate(bg) & growable & ~bg
        if not more.any():
            break
        bg |= more
    return bg


def decheck(path, outdir, size=None, shadow=None):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    rgb = im.convert("RGB")
    lo, hi = border_tones(rgb)
    period = checker_period(rgb)
    # The board's core: where the pattern shows, plus anything sitting exactly on a tone. Grown by two pixels so
    # the jpeg-blurred seam between two squares does not wall the flood into one square at a time (it did, and
    # left a grid of lines standing). The growth reaches two pixels into the toy as well; the erode below takes
    # one back and the feather hides the other.
    could = dilate(dilate(pattern_mask(rgb, period) | strict_board(rgb, lo, hi, tol=12.0)))
    # ⚠️ CLOSE THE NARROW NECKS FIRST. Where a toy's outline thins — the stitched seam on the raven's crown — the
    # mask leaves a one or two pixel channel, and the flood pours through it and eats a bite out of the toy.
    # Shrinking the mask by a pixel seals every such channel while leaving the open board untouched; the bite it
    # costs around the true edge is given straight back by growing the filled result by the same pixel.
    could_tight = erode(could)

    # 2–3. flood in from the border through what could be board
    # ⚠️ .copy() IS LOAD-BEARING. An image straight out of Image.fromarray wraps the numpy buffer READ-ONLY, so
    # ImageDraw.floodfill writes into it and nothing happens — silently, no error, seed pixel unchanged. Every
    # flood in this file was a no-op until this copy was added (2026-09-20).
    work = Image.fromarray(np.where(could_tight, FREE, WALL).astype(np.uint8), "L").copy()
    px = work.load()
    for sx, sy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
                   (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)):
        if px[sx, sy] == FREE:
            ImageDraw.floodfill(work, (sx, sy), OUTSIDE, thresh=0)
    bg = dilate(np.asarray(work) == OUTSIDE) & could   # grow back, but never past what could be board
    # ⚠️ AND THE DROP SHADOW (DM 2026-09-20: "You can get rid of the shadows … just make sure the brighter bug
    # areas are removed, those would still show up"). The shadow is board seen through a soft grey wash, attached
    # to the toy's feet, so no flood from the border reaches it and no brightness test separates it from the toy.
    # Growing outward from background already found, through anything that still carries the board's pattern on
    # either axis, walks the length of the shadow and stops dead at paint.
    bg = grow_into_board(bg, pattern_axis(rgb, period))

    # 4. the trapped pieces — board the flood could not reach, judged on the STRICT mask
    strict = strict_board(rgb, lo, hi)
    lum = np.asarray(rgb).astype(np.float32).mean(axis=2)
    mid, spread = (lo + hi) / 2, max(8.0, (hi - lo) * 0.4)
    trap = Image.fromarray(np.where(strict & ~bg, FREE, WALL).astype(np.uint8), "L").copy()
    tpx = trap.load()
    ys, xs = np.nonzero(np.asarray(trap) == FREE)
    for sx, sy in zip(xs.tolist(), ys.tolist()):
        if tpx[sx, sy] != FREE:
            continue
        ImageDraw.floodfill(trap, (sx, sy), SEEN, thresh=0)
        comp = np.asarray(trap) == SEEN
        # ⚠️ FLATNESS, NOT "HOLDS BOTH TONES". The raven's crown is a large neutral grey sitting on the dark tone
        # with specular highlights up on the light one, so "holds both" called it board and bit a piece out of its
        # head. Real board is FLAT: nearly every pixel is exactly one tone or the other, with nothing in between.
        # Paint is a gradient and lives in the middle.
        vals = lum[comp]
        n = int(comp.sum())
        onTone = float((((np.abs(vals - lo) <= 5) | (np.abs(vals - hi) <= 5)).mean())) if n else 0.0
        board = (n > 400 and onTone > 0.80
                 and bool((vals < mid - spread / 2).any())
                 and bool((vals > mid + spread / 2).any()))
        if board:
            bg |= comp
        trap.paste(WALL, (0, 0, w, h), Image.fromarray((comp * 255).astype(np.uint8), "L"))
        tpx = trap.load()

    # 4b. THE DROP SHADOW, named by hand (DM 2026-09-20: "You can get rid of the shadows … just make sure the
    # brighter bug areas are removed, those would still show up"). Five automatic approaches were measured and all
    # failed on at least one toy: the shadow's darkest squares are crushed flat by the jpeg so no pattern survives
    # there, brightness cannot separate a grey board from a grey bunny, and "keep what the ink line encloses" ate
    # a fifth of the bunny where its outline runs pale. Naming the box is honest and takes a minute. Inside it,
    # the toy still protects itself: anything with colour in it (brown legs, tan hooves) or dark enough to be ink
    # is kept, and only the neutral, brighter board goes — which is exactly the part that would show on a map.
    if shadow:
        x0, y0, x1, y1 = shadow
        a = np.asarray(rgb).astype(np.float32)
        chroma = a.max(axis=2) - a.min(axis=2)
        lumf = a.mean(axis=2)
        region = np.zeros(bg.shape, dtype=bool)
        region[max(0, y0):min(h, y1), max(0, x0):min(w, x1)] = True
        bg |= region & (chroma <= 12) & (lumf >= 60)

    # 5. the specks. A few squares of board sit in corners the flood never seeded into; none of them is attached
    # to the toy, so anything left that is smaller than a fiftieth of a percent of the picture is not the toy.
    keep = Image.fromarray(np.where(bg, WALL, FREE).astype(np.uint8), "L").copy()
    kpx = keep.load()
    ys, xs = np.nonzero(np.asarray(keep) == FREE)
    floor_px = max(64, int(0.0035 * w * h))  # a checker square is ~0.26% — two of them is still not a toy
    for sx, sy in zip(xs.tolist(), ys.tolist()):
        if kpx[sx, sy] != FREE:
            continue
        ImageDraw.floodfill(keep, (sx, sy), SEEN, thresh=0)
        comp = np.asarray(keep) == SEEN
        if int(comp.sum()) < floor_px:
            bg |= comp
        keep.paste(WALL, (0, 0, w, h), Image.fromarray((comp * 255).astype(np.uint8), "L"))
        kpx = keep.load()

    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
    out = im.copy()
    out.putalpha(alpha)
    box = out.getbbox()
    if box:
        out = out.crop(box)

    outdir.mkdir(parents=True, exist_ok=True)
    stem = pathlib.Path(path).stem
    kept = round(100 * float((~bg).mean()))
    main = outdir / f"{stem}.webp"
    out.save(main, lossless=True)
    print(f"{pathlib.Path(path).name}: {w}x{h} -> {out.size}, {kept}% kept  -> {main}")
    if size:
        side = max(out.size)
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.paste(out, ((side - out.width) // 2, (side - out.height) // 2))
        token = outdir / f"{stem}-token.webp"
        sq.resize((size, size), Image.LANCZOS).save(token, lossless=True)
        print(f"    token {size}x{size} -> {token}")
    return main


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--outdir", default=None)
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--shadow", action="append", default=[],
                    help="x0,y0,x1,y1 box holding a drop shadow; one per file, in order")
    a = ap.parse_args()
    outdir = pathlib.Path(a.outdir) if a.outdir else pathlib.Path(a.files[0]).parent / "clean"
    for i, f in enumerate(a.files):
        if not pathlib.Path(f).exists():
            print(f"missing: {f}", file=sys.stderr)
            continue
        box = None
        if i < len(a.shadow) and a.shadow[i] and a.shadow[i] != "-":
            box = tuple(int(v) for v in a.shadow[i].split(","))
        decheck(f, outdir, a.size, box)


if __name__ == "__main__":
    main()
