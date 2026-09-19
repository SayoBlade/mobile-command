"""Yorgrim for the transformation banner: the hooded ghost from his NPC portrait, the figure behind him feathered away."""
import os
from pathlib import Path
import numpy as np
from PIL import Image
src = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data/modules/the-crooked-moon-2014/assets/art/art npc/NPC_Yorgrim.webp"
im = Image.open(src).convert("RGBA")
W, H = im.size
c = im.crop((0, int(.22 * H), int(.68 * W), H))
a = np.asarray(c).astype(np.float32)
h, w = a.shape[:2]
y, x = np.mgrid[0:h, 0:w].astype(np.float32)
smooth = lambda e0, e1, v: np.clip((v - e0) / (e1 - e0), 0, 1) ** 2 * (3 - 2 * np.clip((v - e0) / (e1 - e0), 0, 1))
corner = smooth(.24 * w, .5 * w, np.hypot(w - x, y))      # the shoulder behind him, top right
right = smooth(0, .1 * w, w - x)                           # no hard cut through the chains
a[..., 3] *= corner * right
out = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
out = out.resize((round(out.size[0] * 900 / out.size[1]), 900), Image.LANCZOS)
out.save(Path(__file__).parent / "art" / "yorgrim.webp", quality=80, method=6)
bg = Image.new("RGBA", out.size, (200, 60, 60, 255)); bg.alpha_composite(out)
bg.convert("RGB").resize((out.size[0] // 2, 450)).save((Path(__file__).parent / "shots").mkdir(exist_ok=True) or Path(__file__).parent / "shots" / "yorgrim-check.png")
print("art/yorgrim.webp", out.size)
