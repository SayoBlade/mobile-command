"""Tile cdp-multi captures: python sheet.py <prefix> <out.png> <key>:<t>,<t> ... (each row = one card)."""
import json, sys
from PIL import Image
prefix, out, *rows = sys.argv[1:]
tiles = []
for row in rows:
    key, ts = row.split(":")
    r = []
    for t in ts.split(","):
        b = json.load(open(f"{prefix}-{key}-{t}.json"))
        im = Image.open(f"{prefix}-{key}-{t}.png").convert("RGB").crop((int(b["x"]), int(b["y"]), int(b["x"] + b["w"]), int(b["y"] + b["h"])))
        r.append(im.resize((int(im.width * .5), int(im.height * .5))))
    tiles.append(r)
W = max(sum(i.width for i in r) + 6 * (len(r) - 1) for r in tiles); H = sum(r[0].height for r in tiles) + 6 * (len(tiles) - 1)
sheet = Image.new("RGB", (W, H), "black"); y = 0
for r in tiles:
    x = 0
    for i in r: sheet.paste(i, (x, y)); x += i.width + 6
    y += r[0].height + 6
sheet.save(out); print(out, sheet.size)
