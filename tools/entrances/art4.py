"""Portraits for the third wave (DM 2026-09-19: normal intros for NPCs met before they change, shared banners for joint
introductions, more NPCs who are NOT monsters). Copies only; the module is read, never written."""
import os
from pathlib import Path
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
A = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data/modules/the-crooked-moon-2014/assets/art"
OUT = Path(__file__).parent / "art"
ART = {
    "crossroads": "art npc/NPC_Mr_Crossroads_and_Briggsy.webp",
    "isolde": "art npc/NPC_Isolde.webp",
    "doris": "art npc/NPC_Doris_Squire.webp",
    "howie": "art npc/NPC_Howie_Butterman.webp",
    "walter": "art npc/NPC_Walter_Jenkin.webp",
    "gilly": "art npc/NPC_Gilly_Jenkin.webp",
    "dani": "art npc/NPC_Dani_Jenkin.webp",
    "jeremiah": "art npc/NPC_Jeremiah_Stover.webp",
    "william": "art npc/NPC_William_Lodge.webp",
    "vander": "art npc/NPC_Vander_Boone.webp",
    "lyla": "art npc/NPC_Lyla_Webb.webp",
    "rain": "art npc/NPC_Sister_Rain.webp",
    "weston": "art npc/NPC_Weston_Murdoch.webp",
    "rusty": "art npc/NPC_Old_Rusty.webp",
    "mori": "art npc/NPC_Mori_Shade.webp",
}
for name, src in ART.items():
    with Image.open(A / src) as im:
        im = im.convert("RGBA")
        bb = im.getchannel("A").getbbox()
        if bb:
            im = im.crop(bb)
        im.thumbnail((800, 900), Image.LANCZOS)
        im.save(OUT / f"{name}.webp", "WEBP", quality=80, method=6)
    print(f"{name:<11} {im.size[0]}x{im.size[1]} ar {im.size[0] / im.size[1]:.3f}")
