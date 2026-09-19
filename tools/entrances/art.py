"""Web-sized copies of the module's art for the entrance page (read-only against the module)."""
import os
from pathlib import Path
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
A = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data/modules/the-crooked-moon-2014/assets/art"
OUT = Path(__file__).parent / "art"
# name: (source, crop as fractions (l, t, r, b) or None, box (max w, max h), quality)
S = {
 # scene paintings (backdrops)
 "sc-crooked-house":  ("art scenes/SCENE_Chapter12_Crooked_House.webp", None, (1280, 720), 72),
 "sc-foxwillow":      ("art scenes/SCENE_Chapter13_Foxwillow.webp", None, (1280, 720), 72),
 "sc-monastery":      ("art scenes/SCENE_Chapter14_Environment.webp", None, (1280, 720), 72),
 "sc-dead-mans-hand": ("art scenes/SCENE_Chapter15_Dead_Mans_Hand.webp", None, (1280, 720), 72),
 "sc-hartsblight":    ("art scenes/SCENE_Chapter18_Hartsblight.webp", None, (1280, 720), 72),
 "sc-gravedigger":    ("art scenes/SCENE_Chapter19_Gravedigger.webp", None, (1280, 720), 72),
 "sc-maidenmist":     ("art scenes/SCENE_Chapter19_Maidenmist_Cemetery.webp", None, (1280, 720), 72),
 "sc-rookery":        ("art scenes/SCENE_Chapter20_Roving_Rookery.webp", None, (1280, 720), 72),
 "sc-festive":        ("art scenes/SCENE_Chapter21_Festive_Wickermoor.webp", None, (1280, 720), 72),
 "sc-rowans-rise":    ("art scenes/SCENE_Chapter23_Rowans_Rise.webp", None, (1280, 720), 72),
 "sc-barrow":         ("art scenes/SCENE_Chapter24_Barrow.webp", None, (1280, 720), 72),
 # characters (cut-outs)
 "crooked-full":      ("art monster/MONSTER_Crooked_Man.webp", None, (900, 900), 80),
 "crooked-bust":      ("art npc/NPC_The_Crooked_Man.webp", None, (900, 900), 80),
 "jericho":           ("art npc/NPC_Raum_and_Jericho.webp", (0.44, 0.0, 1.0, 0.74), (900, 900), 80),
 "abbot-kind":        ("art monster/BOSS_Crimson_Abbot_Normal.webp", None, (900, 900), 80),
 "abbot-winged":      ("art monster/BOSS_Crimson_Abbot_Transformed.webp", None, (1100, 900), 80),
 "sinner":            ("art monster/BOSS_Grinning_Sinner.webp", None, (900, 900), 80),
 "blight":            ("art monster/BOSS_Beast_of_Blight.webp", None, (1100, 900), 80),
 "keeper":            ("art monster/MONSTER_Keeper_of_the_Blight.webp", None, (420, 420), 78),
 "reaper":            ("art monster/BOSS_Chained_Reaper.webp", None, (1000, 900), 80),
 "golub":             ("art npc/NPC_Gollub_Graygullet.webp", None, (1000, 900), 80),
 "albert":            ("art monster/MONSTER_Vermin_Familiar_Pigeon.webp", None, (300, 300), 78),
 "chuckles":          ("art npc/NPC_Chuckles.webp", None, (700, 700), 80),
 "balloon":           ("art monster/BOSS_Lord_of_Fools.webp", None, (1000, 900), 80),
 "herald":            ("art monster/MONSTER_Herald_of_Fools.webp", None, (420, 420), 78),
 "wicker":            ("art monster/BOSS_Wicker_Man.webp", None, (900, 900), 80),
 "chosen":            ("art monster/MONSTER_Old_Ways_Chosen.webp", None, (420, 420), 78),
 "kehlenn":           ("art npc/NPC_Kehlenn.webp", None, (1000, 900), 80),
 # the book's margin decorations, coins and heirlooms
 "deco-toy":          ("art book/Holly_DECO_ADV_CROOKED HOUSE_Nursery Room Toy.webp", None, (300, 300), 80),
 "deco-pumpkin":      ("art book/Holly_DECO_ADV_FIELDSOFTHECROW_Pumpkin.webp", None, (320, 320), 80),
 "banjo":             ("art items/ITEM_Artifact_Banjo_of_Ol_Jericho_Sticks.webp", None, (420, 420), 80),
 "deco-bat":          ("art book/Holly_DECO_ADV_CRIMSONMONASTERY_Crimson Abbot.webp", None, (240, 240), 80),
 "deco-croc":         ("art book/Holly_DECO_ADV_DROWNEDCROSSRAODS_Grinning Sinner.webp", None, (360, 360), 80),
 "deco-deer":         ("art book/Holly_DECO_ADV_HARTSBLIGHTFOREST_Gorthos.webp", None, (360, 360), 80),
 "leaf-1":            ("art book/Holly_DECO_Leafs 01.webp", (0.0, 0.0, 0.25, 1.0), (120, 120), 80),
 "leaf-2":            ("art book/Holly_DECO_Leafs 01.webp", (0.25, 0.0, 0.5, 1.0), (120, 120), 80),
 "leaf-3":            ("art book/Holly_DECO_Leafs 01.webp", (0.5, 0.0, 0.75, 1.0), (120, 120), 80),
 "leaf-4":            ("art book/Holly_DECO_Leafs 01.webp", (0.75, 0.0, 1.0, 1.0), (120, 120), 80),
 "deco-isolde":       ("art book/Holly_DECO_ADV_MAIDENMISTCEMETERY_Chained Reaper.webp", None, (360, 360), 80),
 "deco-pigeon":       ("art book/Holly_DECO_ADV_ROVINGROOKERY_Pigeon.webp", None, (200, 200), 80),
 "marotte":           ("art items/ITEM_Artifact_Marotte_of_the_Lord_of_Fools.webp", None, (300, 300), 80),
 "coin-hare":         ("art scenes/Coin_Hare_red.webp", None, (260, 260), 80),
 "coin-goat":         ("art scenes/Coin_Goat_red.webp", None, (260, 260), 80),
}
OUT.mkdir(exist_ok=True)
total = 0
for name, (src, crop, box, q) in S.items():
    with Image.open(A / src) as im:
        im = im.convert("RGBA")
        if crop:
            w, h = im.size
            im = im.crop((round(crop[0] * w), round(crop[1] * h), round(crop[2] * w), round(crop[3] * h)))
        bbox = im.getchannel("A").getbbox()          # trim empty transparent margins
        if bbox and bbox != (0, 0) + im.size:
            im = im.crop(bbox)
        im.thumbnail(box, Image.LANCZOS)
        opaque = im.getchannel("A").getextrema()[0] == 255
        out = OUT / f"{name}.webp"
        (im.convert("RGB") if opaque else im).save(out, "WEBP", quality=q, method=6)
        total += out.stat().st_size
        print(f"{name:<20} {im.size[0]}x{im.size[1]}  ar {im.size[0]/im.size[1]:.3f}  {'opaque' if opaque else 'alpha'}  {out.stat().st_size//1024}KB")
print("total", total // 1024, "KB")
