"""The generic intros (DM 2026-09-19: "the rest can have minimal intros, more generic"): everyone in the book-checked
roster who has a portrait and no themed banner. Writes generic.json (used by the page, gen_mc.py and gen_intro_keys.py)
and web copies of the portraits for the preview page (art/g-<key>.webp)."""
import json
import os
import re
from pathlib import Path

from PIL import Image
Image.MAX_IMAGE_PIXELS = None

HERE = Path(__file__).parent
ROSTER = HERE / "roster.json"  # the book-research roster (session scratch, not in the repo — generic.json is its committed output)
A = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data/modules/the-crooked-moon-2014/assets/art"

roster = json.loads(ROSTER.read_text(encoding="utf-8"))
THEMED = {"Hugo", "The White Worm", "Sister Rain", "Weston Murdoch", "Old Rusty", "Mori Shade"}  # themed banners of their own
HELD = {"Adelaide Langtree",                    # the research: her name and face unmask the crow demon — the DM decides
        "Doctor Belkin"}                        # his portrait shows his exposed brain (a cap hides it when first met)
RENAME = {"The Sweetheart": ("The lady with the locket", None),   # her name echoes the letter that frees her
          "Lyla Webb": ("Lyla", None), "Vander Boone": ("Vander", None)}  # surnames the book never has them say
SHORT = {"The lady with the locket": "Locket lady", "The Gaunt Waiter": "Gaunt Waiter", "Constable Doris Squire": "Constable",
         "Deputy Howie Butterman": "Deputy", "The Galloping Headsman": "Headsman", "The Jinxed Leviathan": "Leviathan",
         "The Brimstone Behemoth": "Behemoth", "The Barrow King": "Barrow King", "The Dusk Mother": "Dusk Mother",
         "The Wild Titan": "Wild Titan", "The Tall Man": "Tall Man"}


# DM 2026-09-19: a line stays only if it is a job or eerie — a scene description or a plain physical one goes.
NO_SUB = {"The Daydreamer", "The Harlequin", "The Jailbird", "The Mariner", "The Songstress", "The Sweetheart",
          "Dani Jenkin", "The Brimstone Behemoth", "The Galloping Headsman", "The Jinxed Leviathan", "The Wild Titan"}


def short(name):
    if name in SHORT:
        return SHORT[name]
    n = re.sub(r"^The ", "", name)
    if len(n) <= 12:
        return n
    first = n.split()[0]
    return first if len(first) <= 12 else first[:12]


def slug(name):
    return "g-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


out = []
for e in roster:
    if e.get("group") == "A" or e["name"] in THEMED or e["name"] in HELD:
        continue
    name, sub = e["name"], ("" if e["name"] in NO_SUB else e["sub"])
    if name in RENAME:
        name = RENAME[name][0]
    nums = []
    for sc in e.get("scenes") or []:
        m = re.match(r"(\d{1,2}(?:\.\d{1,2})+)\s", sc)
        if not m:
            continue
        n = m.group(1)
        # Villagers are also listed at Rowan's Rise, where showing a possible cultist IS the reveal (the research).
        if n.startswith("23.2") and e.get("group") == "D":
            continue
        if n not in nums:
            nums.append(n)
    out.append({"key": slug(name), "short": short(name), "name": name, "sub": sub, "stance": e["stance"],
                "chapter": int(e["chapter"]), "file": e["file"], "scenes": nums, "group": e.get("group")})

out.sort(key=lambda x: (x["chapter"], x["group"] or "", x["name"]))
assert len({x["key"] for x in out}) == len(out)
(HERE / "generic.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")

total = 0
for x in out:
    dst = HERE / "art" / f"{x['key']}.webp"
    if dst.exists():
        total += dst.stat().st_size
        continue
    with Image.open(A / x["file"]) as im:
        im = im.convert("RGBA")
        bb = im.getchannel("A").getbbox()
        if bb:
            im = im.crop(bb)
        im.thumbnail((900, 900), Image.LANCZOS)
        im.save(dst, "WEBP", quality=78, method=6)
    total += dst.stat().st_size
print(len(out), "generic intros;", total // 1024, "KB of portraits;",
      sum(1 for x in out if x["stance"] == "foe"), "foes;", sum(1 for x in out if not x["scenes"]), "with no scene")
print(" ".join(f"{x['short']}" for x in out))
