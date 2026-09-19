"""v14 art (DM 2026-09-19: Adelaide and Doctor Belkin "with reveals"): the crow demon, Adelaide, Doctor Belkin in full,
and Belkin 'capped' — his portrait from the brow down, the top fading into shadow, so the open skull stays hidden
until his reveal. Same processing as art.py (crop, trim to visible pixels, fit, webp q80); the capped version keeps
the full portrait's scale so the two line up on the transformation."""
import os
from pathlib import Path
import numpy as np
from PIL import Image
A = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data/modules/the-crooked-moon-2014/assets/art"
OUT = Path(__file__).parent / "art"
CAP, FADE = 0.25, 0.07            # the cut (fraction of the portrait's height) and the fade above the brow


def trimmed(im):
    bb = im.getchannel("A").getbbox()
    return im.crop(bb) if bb and bb != (0, 0) + im.size else im, bb


def save(im, name):
    out = OUT / f"{name}.webp"
    im.save(out, "WEBP", quality=80, method=6)
    print(f"{name:<14} {im.size[0]}x{im.size[1]}  ar {im.size[0]/im.size[1]:.4f}  {out.stat().st_size//1024}KB")


for name, src, box in (("corvodaemon", "art monster/MONSTER_Corvodaemon.webp", (1000, 900)),
                       ("adelaide", "art npc/NPC_Adelaide_Langtree.webp", (700, 900))):
    im, _ = trimmed(Image.open(A / src).convert("RGBA"))
    im.thumbnail(box, Image.LANCZOS)
    save(im, name)

full = Image.open(A / "art npc/NPC_Doctor_Belkin.webp").convert("RGBA")
W, H = full.size
f_im, f_bb = trimmed(full)
cap = full.crop((0, round(CAP * H), W, H))
c_im, c_bb = trimmed(cap)
print("full bbox", f_bb, "capped bbox (in the crop)", c_bb)
s = 900 / f_im.size[1]                                   # one scale for both
f_out = f_im.resize((round(f_im.size[0] * s), 900), Image.LANCZOS)
c_out = c_im.resize((round(c_im.size[0] * s), round(c_im.size[1] * s)), Image.LANCZOS)
a = np.asarray(c_out).astype(np.float32)
h = a.shape[0]
y = np.arange(h, dtype=np.float32)[:, None]
n = FADE * H * s                                          # the fade, in output pixels
t = np.clip(y / n, 0, 1)
a[..., 3] *= t * t * (3 - 2 * t)
c_out = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
save(f_out, "belkin")
save(c_out, "belkin-capped")
# where the capped picture sits inside the full one, as fractions of the FULL picture (for the CSS that lines them up)
fx0, fy0, fx1, fy1 = f_bb
cx0, cy0 = c_bb[0], c_bb[1] + round(CAP * H)
cx1, cy1 = c_bb[2], c_bb[3] + round(CAP * H)
print(f"capped inside full: left {(cx0 - fx0) / (fx1 - fx0):.4f} right {(fx1 - cx1) / (fx1 - fx0):.4f} "
      f"top {(cy0 - fy0) / (fy1 - fy0):.4f} bottom {(fy1 - cy1) / (fy1 - fy0):.4f}  height share {(cy1 - cy0) / (fy1 - fy0):.4f}  fade share {n / c_out.size[1]:.4f}")
bg = Image.new("RGBA", c_out.size, (60, 60, 70, 255)); bg.alpha_composite(c_out)
bg.convert("RGB").resize((c_out.size[0] // 2, c_out.size[1] // 2)).save((Path(__file__).parent / "shots").mkdir(exist_ok=True) or Path(__file__).parent / "shots" / "belkin-capped-check.jpg", quality=85)
