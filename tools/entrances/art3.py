"""Portraits and maps for the second wave of banners (DM 2026-09-19: 1-6, Golub as a transformation, the priors).
Copies only; the module is read, never written. Same processing as art2.py."""
import os
from pathlib import Path
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
M = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data/modules/the-crooked-moon-2014/assets"
OUT = Path(__file__).parent / "art"
ART = {  # name: (source under assets/art, crop fractions or None, max box, quality)
    "trainhopper": ("art npc/NPC_The_Phantom_Trainhopper.webp", None, (900, 900), 80),
    "mayor": ("art npc/NPC_Mayor_Wendel_Somerton.webp", None, (900, 900), 80),
    "stonoga": ("art npc/NPC_Stonoga_Blackstinger.webp", None, (1000, 900), 80),
    "hugo": ("art monster/MONSTER_Serum_Brute.webp", None, (900, 900), 80),
    "worm": ("art monster/BOSS_White_Worm.webp", None, (1200, 900), 80),
    "coven": ("art monster/BOSS_Vermintoll_Abomination.webp", None, (900, 900), 80),
    "theodora": ("art npc/NPC_Theodora_Mayville.webp", None, (900, 900), 80),
    "jaeger": ("art npc/NPC_Sigmund_Jaeger.webp", None, (900, 900), 80),
    "olaf": ("art npc/NPC_Friar_Olaf.webp", None, (900, 900), 80),
    "cromwell": ("art npc/NPC_Leona_Cromwell.webp", None, (900, 900), 80),
    "nightcreature": ("art monster/MONSTER_Night_Creature.webp", None, (1000, 900), 80),
}
MAPS = {  # name: source under assets/maps/map battle
    "map-trainhopper": "GL_10_8_Tender_24x7_COL.webp",
    "map-mayor": "GL_11_1_The_Founder's_Round_22x22_COL.webp",
    "map-stonoga": "GL_16_5_Deep_Drift_and_Stonogas_Laboratory_30x17_COL.webp",
    "map-hugo": "GL_17_1_Memory’s_Rest_Sanatorium_1_31x40_COL.webp",
    "map-coven": "GL_22_5_Crooked_Attic_16x11.webp",
    "map-priors": "GL_14_1_The_Crimson_Monastery_1_73x44_COL.webp",
}
total = 0
for name, (src, crop, box, q) in ART.items():
    with Image.open(M / "art" / src) as im:
        im = im.convert("RGBA")
        if crop:
            w, h = im.size
            im = im.crop((round(crop[0] * w), round(crop[1] * h), round(crop[2] * w), round(crop[3] * h)))
        bb = im.getchannel("A").getbbox()
        if bb: im = im.crop(bb)
        im.thumbnail(box, Image.LANCZOS)
        out = OUT / f"{name}.webp"; im.save(out, "WEBP", quality=q, method=6)
    total += out.stat().st_size
    print(f"{name:<16} {im.size[0]}x{im.size[1]} ar {im.size[0]/im.size[1]:.3f} {out.stat().st_size//1024}KB")
for name, src in MAPS.items():
    with Image.open(M / "maps/map battle" / src) as im:
        im = im.convert("RGB"); w, h = im.size
        tw, th = (w, round(w * 9 / 16)) if w / h < 16 / 9 else (round(h * 16 / 9), h)   # centred 16:9 slice
        im = im.crop(((w - tw) // 2, (h - th) // 2, (w - tw) // 2 + tw, (h - th) // 2 + th))
        im = im.resize((1920, 1080), Image.LANCZOS)
        out = OUT / f"{name}.webp"; im.save(out, "WEBP", quality=60, method=6)
    total += out.stat().st_size
    print(f"{name:<16} from {w}x{h}  {out.stat().st_size//1024}KB")
print("total", total // 1024, "KB")
