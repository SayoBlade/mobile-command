"""Portraits, sprites and chapter maps for the banner page — copies only; the module is read, never written."""
import os
from pathlib import Path
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
M = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data/modules/the-crooked-moon-2014/assets"
OUT = Path(__file__).parent / "art"
ART = {  # name: (source under assets/art, crop fractions or None, max box, quality)
 "vagrant":  ("art npc/NPC_The_Vagrant.webp", None, (900, 900), 80),
 "adela":    ("art npc/NPC_Adela_Druskenvald.webp", None, (700, 900), 80),
 "phillip":  ("art npc/NPC_Phillip_Druskenvald.webp", None, (700, 900), 80),
 "vessla":   ("art npc/NPC_Vessla_Browntooth.webp", None, (900, 900), 80),
 "crooked":  ("art npc/NPC_The_Crooked_Man.webp", None, (900, 900), 80),
 "harvest":  ("art monster/BOSS_Harvest_Terror.webp", None, (1000, 900), 80),
 "widow":    ("art npc/NPC_Matron_Lethica.webp", None, (900, 900), 80),
 "horned":   ("art monster/BOSS_Horned_King.webp", None, (1100, 900), 80),
 "weasel":   ("art book/Holly_DECO_Weasel 01.webp", None, (260, 260), 80),
 "crows":    ("art book/Holly_DECO_Birds 2x.webp", None, (360, 360), 80),
}
MAPS = {  # name: source under assets/maps/map battle
 "map-vagrant": "GL_10_1_Passenger_Car_24x7_COL.webp",
 "map-druskenvald": "GL_10_3_Lounge_Car_24x7_COL.webp",
 "map-vessla": "GL_12_4_The_Crooked_House_4_21x24_COL.webp",
 "map-crooked": "GL_12_1_The_Crooked_House_1_21x24_COL.webp",
 "map-jericho": "GL_13_2_Windmill_34x19_COL.webp",
 "map-harvest": "GL_13_3_Circle_of_Secrets_22x16.webp",
 "map-abbot": "GL_14_3_Sanguine_Cathedral_22x16.webp",
 "map-sinner": "GL_15_2_Dead_Man's_Hand_51x31_COL.webp",
 "map-widow": "GL_17_3_Grotto_of_Tears_22x16.webp",
 "map-blight": "GL_18_4_Den_of_the_Blighted_One_22x16.webp",
 "map-reaper": "GL_19_7_Tomb_of_the_Shrouded_all_22x16.webp",
 "map-golub": "GL_20_2_Walking_Dovecote_36x15_COL.webp",
 "map-fools": "GL_21_2_Ring_of_Fools_22x16.webp",
 "map-wicker": "GL_23_3_Wickers_Vigil_22x16.webp",
 "map-horned": "GL_24_2_Wytchwood_Encounters_25x18_COL.webp",
 "map-kehlenn": "GL_24_3_The_Crooked_Tree_24x22.webp",
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
