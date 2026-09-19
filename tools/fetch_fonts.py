# -*- coding: utf-8 -*-
"""Fetch the bundled title faces from Google Fonts (all SIL OFL — free to redistribute).

DM approved bundling 2026-07-17: Foundry's 18 core faces are all Latin text faces, so "gothic
font", the monk's Asian face, and genuinely diverse titles were impossible without shipping fonts.

Only the LATIN subset is taken. Shippori Mincho's full Japanese set is several MB; the Latin
subset is ~15KB and is all we render (titles are English).

Run: python tools/fetch_fonts.py     ->  fonts/*.woff2  + the @font-face block to paste.
"""
import io, os, re, subprocess, sys

# family -> (css name, why)
FAMILIES = [
    ("UnifrakturMaguntia", "blackletter — the gothic theme's titles"),
    ("Shippori+Mincho:wght@600", "mincho — the monk (Japanese-styled Latin)"),
    ("Cinzel:wght@600", "Roman inscriptional caps — cleric, paladin"),
    ("Metamorphous", "carved/rough — barbarian"),
    ("Grenze+Gotisch:wght@500", "lighter blackletter — warlock"),
    ("Orbitron:wght@600", "techno — artificer"),
]
# The entrance banners' faces (§40.6 Intros; DM approved the download 2026-09-19). Each is declared under the family
# name the banner CSS asks for, so these rows carry it: (query, why, css family, file stem, style).
ENTRANCE_FACES = [
    ("IM+Fell+English:ital@1", "every intro's subtitle (italic)", "IM Fell English", "IMFellEnglish-Italic", "italic"),
    ("IM+Fell+English", "the subtitle face, upright", "IM Fell English", "IMFellEnglish", "normal"),
    ("IM+Fell+English+SC", "the Crooked Man, the Jenkins", "IM Fell English SC", "IMFellEnglishSC", "normal"),
    ("Cinzel+Decorative", "the Crimson Abbot, Sister Rain", "Cinzel Decorative", "CinzelDecorative", "normal"),
    ("Eater", "Gorthos", "Eater", "Eater", "normal"),
    ("Limelight", "Phillip and Adela", "Limelight", "Limelight", "normal"),
    ("Poiret+One", "Phillip and Adela's subtitle", "Poiret One", "PoiretOne", "normal"),
    ("MedievalSharp", "the Crooked Queen", "MedievalSharp", "MedievalSharp", "normal"),
    ("Pinyon+Script", "Golub, Theodora", "Pinyon Script", "PinyonScript", "normal"),
    ("Pirata+One", "the Chained Reaper, the Old Ways' keepers", "Pirata One", "PirataOne", "normal"),
    ("Rye", "Chuckles, Vander and Lyla", "Rye", "Rye", "normal"),
    ("Sacramento", "the Grinning Sinner, Mister Crossroads", "Sacramento", "Sacramento", "normal"),
    ("Sancreek", "Jericho, the farmers", "Sancreek", "Sancreek", "normal"),
    ("Uncial+Antiqua", "Vessla, Stonoga, the Wicker Man", "Uncial Antiqua", "UncialAntiqua", "normal"),
]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/120.0.0.0 Safari/537.36")   # a modern UA -> Google serves woff2, not ttf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTDIR = os.path.join(ROOT, "fonts")

def sh(args):
    return subprocess.run(args, capture_output=True, text=True).stdout

def main():
    if not os.path.isdir(FONTDIR):
        os.makedirs(FONTDIR)
    faces = []
    rows = [(fam, why, None, None, "normal") for fam, why in FAMILIES] + ENTRANCE_FACES
    for fam, why, family, stem, style in rows:
        plain = stem or fam.split(":")[0].replace("+", "")
        if any(os.path.exists(os.path.join(FONTDIR, plain + e)) for e in (".woff2", ".ttf")):
            continue  # already bundled: never refetch a shipped face (Google may have moved it on a version)
        url = "https://fonts.googleapis.com/css2?family=%s&display=swap" % fam
        css = sh(["curl", "-s", "-m", "30", "-A", UA, url])
        if "@font-face" not in css:
            print("FAIL css: %s" % fam); continue
        # Split into @font-face blocks; keep the one covering basic Latin.
        blocks = re.findall(r"/\*\s*([a-z0-9-\[\]]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
        if not blocks:
            blocks = [("only", m) for m in re.findall(r"@font-face\s*\{(.*?)\}", css, re.S)]
        chosen = None
        for name, body in blocks:
            ur = re.search(r"unicode-range:\s*([^;]+);", body)
            # basic Latin lives in U+0000-00FF; that's the subset our English titles need
            if name == "latin" or (ur and "U+0000-00FF" in ur.group(1)) or name == "only":
                chosen = body
                if name == "latin" or name == "only":
                    break
        if not chosen:
            print("FAIL subset: %s" % fam); continue
        src = re.search(r"src:\s*url\(([^)]+)\)\s*format\('([a-z2]+)'\)", chosen)
        if not src:
            print("FAIL src: %s" % fam); continue
        href, fmt = src.group(1), src.group(2)
        ext = "woff2" if fmt == "woff2" else "ttf"
        out = os.path.join(FONTDIR, "%s.%s" % (plain, ext))
        sh(["curl", "-s", "-m", "60", "-A", UA, "-o", out, href])
        size = os.path.getsize(out) if os.path.exists(out) else 0
        print("%-22s %-6s %6.1f KB   %s" % (plain, ext, size / 1024.0, why))
        faces.append((family or plain, plain, ext, fmt, why, style))
    print("\n/* ---- paste into shell.css (entrance faces: gen_mc.py writes them into entrances.css) ---- */")
    for family, plain, ext, fmt, why, style in faces:
        print("/* %s */" % why)
        print("@font-face { font-family: '%s'; font-style: %s; font-weight: 400 700;"
              " font-display: swap;\n  src: url('../fonts/%s.%s') format('%s'); }" % (family, style, plain, ext, fmt))

main()
