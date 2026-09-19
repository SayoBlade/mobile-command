"""Generate mobile-command's entrance data and styles from the preview page's sources, so the page the DM reviews and
the module he plays with come from ONE description of each banner.

Writes (into the MC repo):
  scripts/cm-entrances.js   CM_ENTRANCES = [...]   book art by module path + a crop, library sound by path + a window
  styles/entrances.css      the banner's shared timeline + every entrance's look, namespaced under #mc-entrance

Book art and library audio are REFERENCED, never copied (MC ships neither — cm-boarding.js:5-8). Crops the page did
with Pillow become a CSS crop box; the mockup's reduced-motion branch is dropped (MC's intros always animate: the
DM's machines report reduced motion for speed — memory reduced-motion-trap).
"""
import json
import os
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
MC = HERE.parents[1]  # tools/entrances → the repo
DATA = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data"
TCM = "modules/the-crooked-moon-2014/assets/art/"
MIST = "modules/animated-mist-and-fog-by-mattm/animations/"
Image.MAX_IMAGE_PIXELS = None

# ---------------------------------------------------------------- art: page key -> (module file, crop, mask)
ART = {
    "abbot-kind": ("art monster/BOSS_Crimson_Abbot_Normal.webp", None),
    "abbot-winged": ("art monster/BOSS_Crimson_Abbot_Transformed.webp", None),
    "adela": ("art npc/NPC_Adela_Druskenvald.webp", None),
    "phillip": ("art npc/NPC_Phillip_Druskenvald.webp", None),
    "balloon": ("art monster/BOSS_Lord_of_Fools.webp", None),
    "blight": ("art monster/BOSS_Beast_of_Blight.webp", None),
    "crooked": ("art npc/NPC_The_Crooked_Man.webp", None),
    "golub": ("art npc/NPC_Gollub_Graygullet.webp", None),
    "harvest": ("art monster/BOSS_Harvest_Terror.webp", None),
    "horned": ("art monster/BOSS_Horned_King.webp", None),
    "jericho": ("art npc/NPC_Raum_and_Jericho.webp", (0.44, 0.0, 1.0, 0.74)),
    "kehlenn": ("art npc/NPC_Kehlenn.webp", None),
    "reaper": ("art monster/BOSS_Chained_Reaper.webp", None),
    "sinner": ("art monster/BOSS_Grinning_Sinner.webp", None),
    "vagrant": ("art npc/NPC_The_Vagrant.webp", None),
    "vessla": ("art npc/NPC_Vessla_Browntooth.webp", None),
    "weasel": ("art book/Holly_DECO_Weasel 01.webp", None),
    "wicker": ("art monster/BOSS_Wicker_Man.webp", None),
    "widow": ("art npc/NPC_Matron_Lethica.webp", None),
    "yorgrim": ("art npc/NPC_Yorgrim.webp", (0.0, 0.22, 0.68, 1.0)),
    "trainhopper": ("art npc/NPC_The_Phantom_Trainhopper.webp", None),
    "mayor": ("art npc/NPC_Mayor_Wendel_Somerton.webp", None),
    "stonoga": ("art npc/NPC_Stonoga_Blackstinger.webp", None),
    "hugo": ("art monster/MONSTER_Serum_Brute.webp", None),
    "worm": ("art monster/BOSS_White_Worm.webp", None),
    "coven": ("art monster/BOSS_Vermintoll_Abomination.webp", None),
    "theodora": ("art npc/NPC_Theodora_Mayville.webp", None),
    "jaeger": ("art npc/NPC_Sigmund_Jaeger.webp", None),
    "olaf": ("art npc/NPC_Friar_Olaf.webp", None),
    "cromwell": ("art npc/NPC_Leona_Cromwell.webp", None),
    "nightcreature": ("art monster/MONSTER_Night_Creature.webp", None),
    "chuckles": ("art npc/NPC_Chuckles.webp", None),
    # v14: the crow demon / Adelaide; Belkin whole and Belkin cut at the brow (the open skull kept for his reveal)
    "corvodaemon": ("art monster/MONSTER_Corvodaemon.webp", None),
    "adelaide": ("art npc/NPC_Adelaide_Langtree.webp", None),
    "belkin": ("art npc/NPC_Doctor_Belkin.webp", None),
    "belkin-capped": ("art npc/NPC_Doctor_Belkin.webp", (0.0, 0.25, 1.0, 1.0)),
    "crossroads": ("art npc/NPC_Mr_Crossroads_and_Briggsy.webp", None),
    "isolde": ("art npc/NPC_Isolde.webp", None),
    "doris": ("art npc/NPC_Doris_Squire.webp", None),
    "howie": ("art npc/NPC_Howie_Butterman.webp", None),
    "walter": ("art npc/NPC_Walter_Jenkin.webp", None),
    "gilly": ("art npc/NPC_Gilly_Jenkin.webp", None),
    "dani": ("art npc/NPC_Dani_Jenkin.webp", None),
    "jeremiah": ("art npc/NPC_Jeremiah_Stover.webp", None),
    "william": ("art npc/NPC_William_Lodge.webp", None),
    "vander": ("art npc/NPC_Vander_Boone.webp", None),
    "lyla": ("art npc/NPC_Lyla_Webb.webp", None),
    "rain": ("art npc/NPC_Sister_Rain.webp", None),
    "weston": ("art npc/NPC_Weston_Murdoch.webp", None),
    "rusty": ("art npc/NPC_Old_Rusty.webp", None),
    "mori": ("art npc/NPC_Mori_Shade.webp", None),
}
MISTS = {"fx/mist-thin-horizontal.webm": MIST + "mist_thin_horizontal.webm",
         "fx/rising-fog-thin.webm": MIST + "rising_fog_thin.webm",
         "fx/fog-thick-drifting.webm": MIST + "fog_thick_drifting.webm"}
# Yorgrim's portrait has a second figure behind him: the page feathered it out with Pillow; here a CSS mask does it.
MASKS = {"yorgrim": "radial-gradient(ellipse 50% 34.3% at 100% 0,transparent 48%,#000 100%),linear-gradient(to left,transparent 0,#000 10%)",
         # Belkin from the brow down: the page's smoothstep fade over the top 9.39% (art5.py), in four stops
         "belkin-capped": "linear-gradient(to bottom,transparent 0,rgba(0,0,0,.16) 2.35%,rgba(0,0,0,.5) 4.7%,rgba(0,0,0,.84) 7.04%,#000 9.39%)"}


def crop_box(key):
    """The page's processing, as fractions of the ORIGINAL file: its explicit crop, then the trim to visible pixels."""
    src, crop = ART[key]
    with Image.open(DATA / TCM / src) as im:
        im = im.convert("RGBA"); W, H = im.size
        l, t, r, b = crop or (0, 0, 1, 1)
        box = (round(l * W), round(t * H), round(r * W), round(b * H))
        bb = im.crop(box).getchannel("A").getbbox() or (0, 0, box[2] - box[0], box[3] - box[1])
        x0, y0, x1, y1 = box[0] + bb[0], box[1] + bb[1], box[0] + bb[2], box[1] + bb[3]
    return W, H, (x0 / W, y0 / H, x1 / W, y1 / H), (x1 - x0, y1 - y0)


CROPS = {k: crop_box(k) for k in ART}


def crop_span(key, shade):
    """A crop box: aspect-ratio of the visible part; the whole picture inside it, scaled and shifted so only that part shows."""
    W, H, (l, t, r, b), (pw, ph) = CROPS[key]
    src = TCM + ART[key][0]
    whole = (l, t, r, b) == (0, 0, 1, 1)
    style = f"aspect-ratio:{pw}/{ph}"
    if not whole:
        style += f";--ch:{100 / (b - t):.3f}%;--cw:{100 / (r - l):.3f}%;--cl:{-100 * l / (r - l):.3f}%;--ct:{-100 * t / (b - t):.3f}%"
    if key in MASKS:
        style += f";-webkit-mask:{MASKS[key]};-webkit-mask-composite:source-in;mask:{MASKS[key]};mask-composite:intersect"
    imgs = f'<img src="{src}" alt="">' + (f'<img class="mc-en-shade" src="{src}" alt="">' if shade else "")
    return f'<span class="mc-en-crop{"" if whole else " mc-en-cropped"}" style="{style}">{imgs}</span>'


def convert_art(html):
    """The page's art HTML -> MC's: each <img src="art/x.webp"> (+ its shade twin) becomes one crop box."""
    html = html.strip()
    out, pos = [], 0
    for m in re.finditer(r'<img src="art/([a-z-]+)\.webp" alt="">(<img class="shade" src="art/\1\.webp" alt="">)?', html):
        out.append(html[pos:m.start()]); out.append(crop_span(m.group(1), bool(m.group(2)))); pos = m.end()
    out.append(html[pos:])
    s = "".join(out)
    s = s.replace("<span><span", "<span class=\"mc-en-pairbox\"><span").replace("</span></span>", "</span></span>")
    assert "art/" not in s.replace(TCM, ""), s
    return s


def convert_fx(html):
    """Weather / extras: prefix class names; point sprites and mist at their real files."""
    if not html:
        return ""
    s = re.sub(r'class="([^"]+)"', lambda m: 'class="' + " ".join("mc-en-" + c for c in m.group(1).split()) + '"', html)
    s = s.replace('src="art/weasel.webp"', f'src="{TCM}{ART["weasel"][0]}"')
    for a, b in MISTS.items():
        s = s.replace(f'src="{a}"', f'src="{b}"')
    assert 'src="art/' not in s and 'src="fx/' not in s, s
    return s


# ---------------------------------------------------------------- sound: page clip -> library window + gain
SPEC = {Path(x["out"]).stem: x for x in json.loads((HERE / "sndspec.json").read_text(encoding="utf-8"))}


def raw_gain(sp):
    from snd import load
    arr = load(sp["src"], sp["start"], sp["end"])
    rms = float(np.sqrt(np.mean(arr ** 2))) or 1e-9
    g = 10 ** (sp["rms"] / 20) / rms
    peak = float(np.max(np.abs(arr))) * g
    return g * 0.89 / peak if peak > 0.89 else g


GAINS = {k: raw_gain(sp) for k, sp in SPEC.items()}


def src_seconds(path):
    import av
    with av.open(path) as c:
        st = c.streams.audio[0]
        return float(c.duration / 1e6) if c.duration else float(st.duration * st.time_base)


LONG = {k: src_seconds(sp["src"]) > 60 for k, sp in SPEC.items()}  # the engine streams these (entrances.js playWindow)
DATA_POSIX = str(DATA).replace("\\", "/") + "/"


def convert_clips(clips):
    out = []
    for c in clips:
        k = Path(c["src"]).stem
        if k == "druskenvald":  # generated for the DM (not a library file) — MC carries this one clip itself
            out.append({"src": "modules/mobile-command/sounds/entrances/swing.mp3", "from": 0, "to": 8.8, "fadeIn": 0, "fadeOut": 0.6,
                        "at": c.get("at", 0), "gain": round(0.9 * c.get("vol", 1) * 0.7, 3)})
            continue
        sp = SPEC[k]
        src = sp["src"].replace("\\", "/")
        assert src.startswith(DATA_POSIX), src
        clip = {"src": src[len(DATA_POSIX):], "from": sp["start"], "to": sp["end"], "fadeIn": sp["fin"], "fadeOut": sp["fout"],
                "at": c.get("at", 0), "gain": round(GAINS[k] * c.get("vol", 1), 3)}
        if LONG[k]:
            clip["stream"] = True
        out.append(clip)
    return out


# ---------------------------------------------------------------- entries
sys.argv = ["cards2.py"]
import importlib.util
spec = importlib.util.spec_from_file_location("cards2", HERE / "cards2.py")
cards = importlib.util.module_from_spec(spec); spec.loader.exec_module(cards)
SOUNDS = json.loads((HERE / "sounds.json").read_text(encoding="utf-8"))
SHORT = {  # a deck key holds about ten letters (deck-play-not-tuning)
    "vagrant": "Vagrant", "druskenvald": "The couple", "trainhopper": "Trainhopper", "mayor": "The Mayor", "vessla": "Vessla",
    "crooked": "Crooked Man", "jericho": "Jericho", "harvest": "Harvest", "abbottf": "The Abbot", "jaeger": "Jaeger turns",
    "olaf": "Olaf turns", "cromwell": "Cromwell turns", "sinner": "The Sinner", "stonoga": "Stonoga", "widow": "The Widow", "hugo": "Hugo",
    "worm": "White Worm", "blight": "Gorthos", "reapertf": "Reaper", "golubtf": "Golub", "fools": "Chuckles",
    "foolstf": "Chuckles turns", "crowdemon": "Crow demon", "adelaide": "Adelaide", "belkin": "Doctor Belkin",
    "belkintf": "Belkin reveal",
    "coven": "The Coven", "wicker": "Wicker Man", "horned": "Horned King", "queen": "The Queen",
    # the third wave: normal intros (the face met first), shared banners, allies, the finale
    "theodora0": "Theodora", "law": "The Law", "rain": "Sister Rain", "weston": "Weston", "rusty": "Old Rusty",
    "mori": "Mori Shade", "jenkins": "The Jenkins", "farmers": "Farmers", "renathyrolaf": "Renathyr",
    "jaeger0": "Jaeger", "cromwell0": "Cromwell", "crossroads0": "Crossroads", "bayou": "Vander", "lethica0": "Lethica",
    "yorgrimisolde": "Yorgrim", "finale": "The Finale"}
FRIENDS = {"vagrant", "druskenvald", "jericho", "mayor", "fools", "belkin",  # no pause: nobody rolls initiative on a first meeting
           "theodora0", "law", "rain", "weston", "rusty", "mori", "jenkins", "farmers", "renathyrolaf", "jaeger0",
           "cromwell0", "crossroads0", "bayou", "lethica0", "yorgrimisolde"}  # no pause for a friend (DM call owed — ledger)
CHAPTER = lambda n: int(re.match(r"Chapters? (\d+)", n["eyebrow"]).group(1))

entries = []
for n in cards.N:
    classes = " ".join("mc-en-" + c for c in n["t"].split())
    e = {"key": n["key"], "short": SHORT[n["key"]], "name": n["name"].replace("&amp;", "&"), "sub": n["sub"], "classes": classes,
         "hold": n.get("dur", 7100), "pause": n["key"] not in FRIENDS, "chapter": CHAPTER(n),
         # the key and the panel row show the form he presses it for — for a transformation, the one the party knows
         "portrait": TCM + ART[re.search(r'src="art/([a-z-]+)\.webp"', n["art"]).group(1)][0],
         "art": convert_art(n["art"]), "pair": bool(n.get("pair")),
         "weather": convert_fx(n.get("weather", "")), "extra": convert_fx(n.get("extra", "") + n.get("front", "")),
         "sound": convert_clips(SOUNDS[n["key"]]["clips"])}
    if n.get("art2"):
        e.update({"art2": convert_art(n["art2"]), "name1": n["name1"], "sub1": n["sub1"]})
    entries.append(e)

# The generic intros (DM 2026-09-19: "the rest can have minimal intros, more generic") — generic.json, book-checked.
for g in json.loads((HERE / "generic.json").read_text(encoding="utf-8")):
    ART[g["key"]] = (g["file"], None)
    CROPS[g["key"]] = crop_box(g["key"])
    entries.append({"key": g["key"], "short": g["short"], "name": g["name"], "sub": g["sub"],
                    "classes": f"mc-en-t-generic mc-en-g-{g['stance']}", "hold": 7100, "pause": g["stance"] == "foe",
                    "chapter": g["chapter"], "portrait": TCM + g["file"],
                    "art": convert_art(f'<img src="art/{g["key"]}.webp" alt=""><img class="shade" src="art/{g["key"]}.webp" alt="">'),
                    "pair": False, "weather": "", "extra": "",
                    "sound": convert_clips(SOUNDS["gfoe" if g["stance"] == "foe" else "gfriend"]["clips"]), "generic": True})
entries.sort(key=lambda e: e["chapter"])  # stable: within a chapter, the themed ones first

# THE STAGE AROUND THE BANNER (entrances.js dmPlayEntrance): which tokens are this NPC's (`match`; a transformation's
# known form is `match1`), when the change lands (`change`, s), whether the NPC ARRIVES mid-scene (`appears`: unhide)
# and whether the book stages a REVEAL (`reveal`: the token in shadow until the banner completes).
MATCH = {"druskenvald": ["Phillip Druskenvald", "Adela Druskenvald"], "sinner": ["Grinning Sinner", "Crossroads"],
         "widow": ["Weeping Widow", "Lethica"], "blight": ["Beast of Blight", "Gorthos"], "harvest": ["Harvest Terror", "Raum"],
         "fools": ["Lord of Fools", "Chuckles"], "coven": ["Vermintoll Abomination", "Coven Abomination"],
         "hugo": ["Hugo", "Serum Brute"], "queen": ["Crooked Queen", "Kehlenn"], "mayor": ["Wendel Somerton"],
         "trainhopper": ["Trainhopper"], "stonoga": ["Stonoga"], "vessla": ["Vessla"], "jericho": ["Jericho"],
         "abbottf": ["Crimson Abbot"], "reapertf": ["Chained Reaper"], "golubtf": ["Golub", "Gollub", "Pigeon Hag"],
         "jaeger": ["Night Creature"], "olaf": ["Night Creature"], "cromwell": ["Night Creature"],
         "jericho": ["Jericho", "Scarecrow"], "theodora0": ["Theodora"], "law": ["Doris Squire", "Howie Butterman"],
         "rain": ["Sister Rain"], "weston": ["Weston Murdoch"], "rusty": ["Old Rusty"], "mori": ["Mori Shade"],
         "jenkins": ["Walter Jenkin", "Gilly Jenkin", "Dani Jenkin"], "farmers": ["Jeremiah Stover", "William Lodge"],
         "renathyrolaf": ["Renathyr", "Olaf"], "jaeger0": ["Jaeger"], "cromwell0": ["Cromwell"],
         "crossroads0": ["Crossroads"], "bayou": ["Vander", "Lyla"], "lethica0": ["Lethica"],
         "yorgrimisolde": ["Yorgrim", "Isolde"], "finale": ["Horned King", "Crooked Queen", "Kehlenn"],
         # v13: the balloon IS Chuckles (the jester is its projection — no token of its own); Phillip becomes the King
         "foolstf": ["Lord of Fools"], "horned": ["Horned King"],
         # v14: the crow demon IS Adelaide in the maze (the cellar one is a stranger) — one token either way, no swap
         "crowdemon": ["Corvodaemon", "Crow Demon", "Adelaide"], "adelaide": ["Adelaide", "Corvodaemon"],
         "belkin": ["Belkin"], "belkintf": ["Belkin"]}
MATCH1 = {"abbottf": ["Renathyr"], "reapertf": ["Yorgrim"], "golubtf": ["Theodora"],
          "jaeger": ["Jaeger"], "olaf": ["Olaf"], "cromwell": ["Cromwell"], "foolstf": ["Chuckles"],
          "horned": ["Phillip Druskenvald"]}
CHANGE = {"abbottf": 2.6, "reapertf": 2.8, "golubtf": 2.6, "jaeger": 2.8, "olaf": 2.8, "cromwell": 2.8, "foolstf": 2.8,
          "horned": 2.8}
# An ALTERNATE known form (DM 2026-09-19, Golub: "change the name based on token present"): the banner opens on it when
# its token stands live on the scene and the default form's doesn't (entrances.js resolveForm). The book gives Geneva
# no portrait, so her picture is her token's.
ALTS = {"golubtf": [{"match": ["Geneva"], "name": "Geneva Fairchild", "sub": "The postmaster's assistant"}]}
# The map's burst at the change (DM 2026-09-19 "sure"): Sequencer paths from JB2A's free set, all present in the DM's
# install (checked 2026-09-19); the engine skips the burst quietly where Sequencer or the path is missing.
SWAPFX = {"golubtf": "jb2a.swirling_feathers.outburst.01.textured", "adelaide": "jb2a.swirling_feathers.outburst.01.textured",
          "abbottf": "jb2a.bats.complete.01.red", "jaeger": "jb2a.bats.complete.01.red", "olaf": "jb2a.bats.complete.01.red",
          "cromwell": "jb2a.bats.complete.01.red", "reapertf": "jb2a.smoke.puff.centered.grey",
          "foolstf": "jb2a.particle_burst.01.star.bluepurple", "horned": "jb2a.explosion.01.orange",
          "belkintf": "jb2a.particle_burst.01.circle.bluepurple"}
STAGE_PATH = HERE / "stage.json"  # the book pass: {"appears": [...keys], "reveal": [...keys]} (DM decisions ride on it)
STAGE = json.loads(STAGE_PATH.read_text(encoding="utf-8")) if STAGE_PATH.exists() else {"appears": [], "reveal": []}
for e in entries:
    e["match"] = MATCH.get(e["key"], [re.sub(r"^The ", "", e["name"])])
    if e["key"] in MATCH1:
        e["match1"] = MATCH1[e["key"]]
        e["change"] = CHANGE[e["key"]]
    if e["key"] in ALTS:
        e["alts"] = ALTS[e["key"]]
    if e.get("art2"):
        e["swapFx"] = SWAPFX[e["key"]]
    e["appears"] = e["key"] in STAGE["appears"]
    e["reveal"] = e["key"] in STAGE["reveal"]

js = [
      "// §40.6 THE CROOKED MOON'S ENTRANCES — generated from the reviewed preview page (tools/entrances/gen_mc.py); edit the page's",
      "// sources and regenerate rather than hand-editing, until the DM signs the set off. Book art and library audio are",
      "// referenced by path, never copied. `sound` windows: play `src` from `from` to `to` seconds, starting `at` seconds",
      "// into the entrance, at `gain` (the page's loudness match — can exceed 1). `hold` is when the banner starts to leave.",
      "export const CM_ENTRANCES = " + json.dumps(entries, indent=1, ensure_ascii=False) + ";", ""]
(MC / "scripts/cm-entrances.js").write_text("\n".join(js), encoding="utf-8")

# ---------------------------------------------------------------- styles
ROOT_CLASSES = {"screen", "run", "out", "done", "table", "tf"}
def is_root_class(c): return c in ROOT_CLASSES or c.startswith(("t-", "tf-", "p-", "g-"))
FONT_MAP = {'"Grenze Gotisch"': '"GrenzeGotisch","Grenze Gotisch"', '"Shippori Mincho"': '"ShipporiMincho","Shippori Mincho"'}


def conv_compound(comp, root_parts):
    """One compound selector. Root-level classes go to root_parts (merged onto #mc-entrance); the rest are prefixed."""
    comp = comp.replace("body:not(.table)", ":not(.mc-en-table)").replace("body.table", ".mc-en-table")
    if comp.startswith(":not(.mc-en-table)") or comp.startswith(".mc-en-table"):
        root_parts.append(comp); return None
    toks = re.findall(r"\.[\w-]+|:not\(\.[\w-]+\)|:[\w-]+(?:\([^)]*\))?|[\w-]+|\*", comp)
    assert "".join(toks) == comp, (comp, toks)
    rootish = [t for t in toks if (t.startswith(".") and is_root_class(t[1:])) or (t.startswith(":not(.") and is_root_class(t[6:-1]))]
    if rootish and len(rootish) == len([t for t in toks if not t.startswith(":") or t.startswith(":not(")]):
        for t in toks:
            if t == ".screen": continue
            if t.startswith(":not(."): root_parts.append(f":not(.mc-en-{t[6:-1]})")
            elif t.startswith("."): root_parts.append(".mc-en-" + t[1:])
            else: root_parts.append(t)
        return None
    return "".join(".mc-en-" + t[1:] if t.startswith(".") else (f":not(.mc-en-{t[6:-1]})" if t.startswith(":not(.") else t) for t in toks)


def conv_selector(sel):
    sel = sel.strip()
    if sel == ":root": return "#mc-entrance"
    root_parts, rest = [], []
    sel = re.sub(r"\s*([>+~])\s*", r" \1 ", sel)
    for comp in sel.split():
        if comp in (">", "+", "~"): rest.append(comp); continue
        c = conv_compound(comp, root_parts)
        if c is not None: rest.append(c)
    return ("#mc-entrance" + "".join(root_parts) + (" " + " ".join(rest) if rest else "")).strip()


KEYFRAMES = set()
def conv_css(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    out, i = [], 0
    while i < len(css):
        if css[i].isspace(): i += 1; continue
        if css.startswith("@media", i):  # the reduced-motion branch: dropped on purpose
            depth, j = 0, css.index("{", i)
            while True:
                if css[j] == "{": depth += 1
                elif css[j] == "}":
                    depth -= 1
                    if depth == 0: break
                j += 1
            i = j + 1; continue
        if css.startswith("@keyframes", i):
            j = css.index("{", i); name = css[i + 10:j].strip(); depth = 0; k = j
            while True:
                if css[k] == "{": depth += 1
                elif css[k] == "}":
                    depth -= 1
                    if depth == 0: break
                k += 1
            KEYFRAMES.add(name); out.append(f"@keyframes mc-en-{name}{css[j:k + 1]}"); i = k + 1; continue
        j = css.index("{", i); k = css.index("}", j)
        sels, body = css[i:j], css[j + 1:k]
        out.append(",".join(conv_selector(s) for s in sels.split(",")) + "{" + body.strip() + "}")
        i = k + 1
    s = "\n".join(out)
    for a, b in FONT_MAP.items(): s = s.replace(a, b)
    return s


base = (HERE / "base2.css").read_text(encoding="utf-8").split("\n")
keep = [l for idx, l in enumerate(base, 1) if 47 <= idx <= 66 or 78 <= idx <= 101 or 105 <= idx <= 134 or 148 <= idx <= 150]
css = conv_css("\n".join(keep)) + "\n" + conv_css((HERE / "themes2.css").read_text(encoding="utf-8"))
css = re.sub(r"(animation(?:-name)?:)([^;}]+)", lambda m: m.group(1) + re.sub(r"\b(" + "|".join(sorted(KEYFRAMES, key=len, reverse=True)) + r")\b(?![-\w])", r"mc-en-\1", m.group(2)), css)
css = css.replace("#mc-entrance.mc-en-t-jericho .mc-en-art img{", "#mc-entrance.mc-en-t-jericho .mc-en-art .mc-en-crop{")

HEAD = """/* ============================================================
   §40.6 ENTRANCES — the themed banner ("Intros" in the DM panel). GENERATED from the reviewed preview page
   (tools/entrances/gen_mc.py): the shared timeline, the table layout, then one block per entrance. #mc-entrance is the
   whole-screen overlay and the size container every cqw/cqh below measures against.
   ============================================================ */
#mc-entrance{position:fixed;inset:0;z-index:99500;pointer-events:none;container-type:size;overflow:hidden;font-kerning:normal}
#mc-entrance .mc-en-stage{position:absolute;inset:0}
#mc-entrance .mc-en-pairbox{position:relative;height:100%;display:block}
#mc-entrance .mc-en-weather video,#mc-entrance video.mc-en-mistvid{object-fit:cover}
"""
TAIL = """
/* The crop box (book art is never copied, so the page's Pillow crops happen here): after the rules above, so it wins. */
#mc-entrance .mc-en-art .mc-en-crop{position:relative;display:block;height:100%;overflow:hidden}
#mc-entrance .mc-en-art .mc-en-cropped>img{position:absolute;inset:auto;left:var(--cl);top:var(--ct);height:var(--ch);width:var(--cw);max-width:none}
#mc-entrance .mc-en-art .mc-en-cropped>.mc-en-shade{inset:auto}
"""
# The banners' own title faces — MC's fonts/ (SIL OFL 1.1; DM approved the download 2026-09-19; tools/fetch_fonts.py
# fetches them, fonts/README.md carries each copyright line). Declared under the names the banner CSS asks for.
FACES = [("IM Fell English", "italic", "IMFellEnglish-Italic"), ("IM Fell English", "normal", "IMFellEnglish"),
         ("IM Fell English SC", "normal", "IMFellEnglishSC"), ("Cinzel Decorative", "normal", "CinzelDecorative"),
         ("Eater", "normal", "Eater"), ("Limelight", "normal", "Limelight"), ("Poiret One", "normal", "PoiretOne"),
         ("MedievalSharp", "normal", "MedievalSharp"), ("Pinyon Script", "normal", "PinyonScript"),
         ("Pirata One", "normal", "PirataOne"), ("Rye", "normal", "Rye"), ("Sacramento", "normal", "Sacramento"),
         ("Sancreek", "normal", "Sancreek"), ("Uncial Antiqua", "normal", "UncialAntiqua")]
for _f, _st, _file in FACES:
    assert (MC / "fonts" / f"{_file}.woff2").exists(), _file
FONT_CSS = "/* The banners' own title faces (fonts/README.md). */\n" + "".join(
    f"@font-face{{font-family:'{f}';font-style:{st};font-weight:400 700;font-display:swap;"
    f"src:url('../fonts/{file}.woff2') format('woff2')}}\n" for f, st, file in FACES)
(MC / "styles/entrances.css").write_text(HEAD + FONT_CSS + css + "\n" + TAIL, encoding="utf-8")
print(len(entries), "entrances;", len(css.splitlines()), "style rules;", len(KEYFRAMES), "keyframes")
