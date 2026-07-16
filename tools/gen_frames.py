# -*- coding: utf-8 -*-
"""Corner-art SKELETON FAMILIES + theme swatch icons.

DM 2026-07-17: "too many corner arts are just a curved line with a curved line in it, I don't want
them all the same ... when I said avoid straight lines I didn't mean ANY lines ... try some art
deco corner art ... art nouveau for druids ... Japanese corner art for the monk".

One shared skeleton made all 18 corners the same drawing with a different pin in the middle. So
there are now FIVE families, each with its own grammar, researched rather than invented:

  deco     — stepped nested Ls + a quarter sunburst fan with concentric arcs behind it. Straight
             lines, tapered/stepped rays, strict symmetry. (Chrysler-building chevrons.)
  nouveau  — the ASYMMETRIC whiplash S-curve with tendrils and a bud. Asymmetry is precisely what
             separates Art Nouveau from symmetrical baroque scrollwork.
  japanese — seigaiha (concentric quarter-arc waves) + an off-centre asanoha (hemp-leaf) star.
             Composition deliberately off-balance.
  heraldic — mitred arms + a trefoil cusp; tight, architectural, pointed.
  scroll   — the ogee bracket with volutes (the original), kept for tavern/flame.

Each theme = family skeleton + its own motif, so no two corners read alike.

THE MOTIF SLOT: the motif sits at (30,30) with radius ~7 on the 64-grid. A skeleton must keep OUT
of a circle at (30,30) r=9 or it collides with the art it is framing — the first cut had seigaiha
arcs and an asanoha star drawn straight through the monk's lotus, because the two halves were
designed apart. Skeletons own the corner (roughly r<27 from the origin) and the two arms; the
motif owns the slot.
"""
import io, os, re

Q = chr(39)

def svg64(body):
    return ("url(\"data:image/svg+xml;utf8,<svg xmlns=%shttp://www.w3.org/2000/svg%s "
            "viewBox=%s0 0 64 64%s>%s</svg>\");" % (Q, Q, Q, Q, body))

# ---------------------------------------------------------------- families
FAM = {}

# --- DECO: nested stepped Ls, then a quarter fan of rays over concentric arcs.
FAM['deco'] = (
    "<g fill='none' stroke='black'>"
    # nested Ls, heavy -> light. Straight and square: that IS the style.
    "<path d='M3 40V3h37' stroke-width='3'/>"
    "<path d='M8.5 45V8.5h37' stroke-width='1.5'/>"
    "<path d='M13 49.5V13h6.5' stroke-width='1.2'/>"      # stepped return
    "<path d='M49.5 13H43' stroke-width='1.2'/>"          # its mirror on the other arm
    # concentric arcs behind the fan, kept inside the slot line
    "<path d='M14 32A18 18 0 0 0 32 14' stroke-width='1'/>"
    "<path d='M14 26A12 12 0 0 0 26 14' stroke-width='1.4'/>"
    # the fan: tapered rays at 0/22.5/45/67.5/90, radiating from the corner, stopped short
    "<g stroke-linecap='round'>"
    "<path d='M14 19v9' stroke-width='1.6'/>"
    "<path d='M16.9 18.3L20.4 26.4' stroke-width='1.3'/>"
    "<path d='M19.5 19.5L23.2 23.2' stroke-width='1.6'/>"
    "<path d='M18.3 16.9L26.4 20.4' stroke-width='1.3'/>"
    "<path d='M19 14h9' stroke-width='1.6'/>"
    "</g></g>"
)

# --- NOUVEAU: one asymmetric whiplash, a tendril curling off it, a bud at the tip.
FAM['nouveau'] = (
    "<g fill='none' stroke='black' stroke-linecap='round'>"
    # the whiplash: long, asymmetric, tapering as it travels (stepped widths)
    "<path d='M5.5 50 C4.2 40 5.4 30 9.6 22' stroke-width='2.8'/>"
    "<path d='M9.6 22 C13.4 14.6 20 8.8 28.5 6' stroke-width='2.1'/>"
    "<path d='M28.5 6 C34.5 4 40 3.6 46 4.4' stroke-width='1.3'/>"
    "<path d='M46 4.4 C50.4 5 52.6 7.6 52 11 C51.6 13.4 49.6 15 47.4 14.6' stroke-width='0.9'/>"
    # tendril springing off the main line, curling the OTHER way (asymmetry)
    "<path d='M12.4 17.6 C13.2 24 14.4 29.6 17.6 34.6' stroke-width='1.3'/>"
    "<path d='M17.6 34.6 C20.4 39 19.6 43.4 16 44.6 C13.4 45.4 11.4 43.8 11.6 41.6 C11.8 40 13.2 39 14.6 39.4' stroke-width='0.9'/>"
    # a bud budding off the main stem, low and to the left — never mirrored
    "<path d='M7.4 33 C10 30.4 13.6 30 16.4 31.6' stroke-width='1'/>"
    "<path d='M16.4 31.6 C18.6 33 19.2 35.6 18 37.6' stroke-width='0.8'/>"
    "</g>"
)

# --- JAPANESE: seigaiha quarter-waves + an off-centre asanoha star.
FAM['japanese'] = (
    "<g fill='none' stroke='black' stroke-linecap='round'>"
    # seigaiha: concentric quarter arcs radiating from the corner
    "<path d='M3 12A9 9 0 0 1 12 3' stroke-width='2.4'/>"
    "<path d='M3 20A17 17 0 0 1 20 3' stroke-width='1.7'/>"
    "<path d='M3 27A24 24 0 0 1 27 3' stroke-width='1.4'/>"
    "<path d='M3 34A31 31 0 0 1 34 3' stroke-width='1.1'/>"
    # asanoha (hemp leaf): a six-point star, pushed OFF the diagonal — clear of the motif
    # slot, and off-balance on purpose (the composition should never read as mirrored)
    "<g stroke-width='0.9' transform='translate(13,34) scale(0.62)'>"
    "<path d='M0 -9V9M-7.8 -4.5L7.8 4.5M-7.8 4.5L7.8 -4.5'/>"
    "<path d='M0 -9L-7.8 -4.5L-7.8 4.5L0 9L7.8 4.5L7.8 -4.5Z'/>"
    "<path d='M0 0L-7.8 -4.5M0 0L7.8 -4.5M0 0L-7.8 4.5M0 0L7.8 4.5'/>"
    "</g></g>"
)

# --- HERALDIC: mitred arms + trefoil cusp. Architectural, pointed, tight.
FAM['heraldic'] = (
    "<g fill='none' stroke='black' stroke-linejoin='miter'>"
    "<path d='M3 38V7.5L7.5 3H38' stroke-width='2.8'/>"      # mitred outer
    "<path d='M9 44V11L11 9H44' stroke-width='1.3'/>"        # mitred inner
    # trefoil cusp at the elbow
    "<g stroke-width='1.2'>"
    "<circle cx='19' cy='19' r='3.6'/><circle cx='26.5' cy='19' r='3.6'/><circle cx='19' cy='26.5' r='3.6'/>"
    "</g>"
    # pointed finials on both arms
    "<path d='M38 3l4 4-4 4' stroke-width='1.3'/>"
    "<path d='M3 38l4 4 4-4' stroke-width='1.3'/>"
    "</g>"
)

# --- SCROLL: the original ogee bracket with volutes.
FAM['scroll'] = (
    "<g fill='none' stroke='black' stroke-linecap='round'>"
    "<path d='M4.6 39.5 C3.7 34 3.5 29.6 4.1 25.4' stroke-width='0.9'/>"
    "<path d='M4.1 25.4 C4.8 20.6 6.5 16.2 9.4 12.4' stroke-width='1.8'/>"
    "<path d='M9.4 12.4 C12.6 8.4 16.9 5.7 21.6 4.5' stroke-width='3'/>"
    "<path d='M21.6 4.5 C26 3.4 30.6 3.4 35.2 4.1' stroke-width='1.8'/>"
    "<path d='M35.2 4.1 C37.8 4.5 40 4.9 42 5.4' stroke-width='0.9'/>"
    "<path d='M13.2 43 C12.3 37.6 12.6 32.8 14.1 28.6' stroke-width='1'/>"
    "<path d='M14.1 28.6 C15.7 24 18.4 20.1 22.2 17.2' stroke-width='1.5'/>"
    "<path d='M22.2 17.2 C26.2 14.1 30.9 12.5 35.8 12.2' stroke-width='1.5'/>"
    "<path d='M35.8 12.2 C38.4 12.1 40.9 12.3 43.2 12.7' stroke-width='1'/>"
    "<path d='M43.2 12.7 C46.9 13.4 49 15.9 48.8 19' stroke-width='1.2'/>"
    "<path d='M48.8 19 C48.6 21.5 46.8 23.2 44.6 23' stroke-width='0.9'/>"
    "<path d='M44.6 23 C42.7 22.8 41.5 21.4 41.7 19.8 C41.8 18.6 42.8 17.7 44 17.8' stroke-width='0.65'/>"
    "<path d='M13.2 43 C13.9 46.7 16.4 48.8 19.5 48.6' stroke-width='1.2'/>"
    "<path d='M19.5 48.6 C22 48.4 23.7 46.6 23.5 44.4' stroke-width='0.9'/>"
    "<path d='M23.5 44.4 C23.3 42.5 21.9 41.3 20.3 41.5 C19.1 41.6 18.2 42.6 18.3 43.8' stroke-width='0.65'/>"
    "</g>"
)

# which family each theme wears
FAMILY = {
    'tavern': 'scroll', 'flame': 'scroll', 'sorcerer': 'nouveau',
    'slate': 'deco', 'artificer': 'deco', 'fighter': 'deco', 'rogue': 'deco', 'wizard': 'deco',
    'druid': 'nouveau', 'bard': 'nouveau', 'ranger': 'nouveau',
    'monk': 'japanese', 'tide': 'japanese', 'frost': 'japanese',
    'paladin': 'heraldic', 'cleric': 'heraldic', 'barbarian': 'heraldic', 'warlock': 'heraldic',
}

# ---------------------------------------------------------------- swatch icons
# A tiny line-art badge inside each colour dot (DM: "sword for fighter, shield with cross for
# paladin, wand for mage"). 24-grid, dark ink so it reads on any dot colour.
INK = "black"   # a MASK: alpha is what matters, so full black = fully painted
def ico(body, w="2.2"):
    return ("url(\"data:image/svg+xml;utf8,<svg xmlns=%shttp://www.w3.org/2000/svg%s "
            "viewBox=%s0 0 24 24%s><g fill=%snone%s stroke=%s%s%s stroke-width=%s%s%s "
            "stroke-linecap=%sround%s stroke-linejoin=%sround%s>%s</g></svg>\")"
            % (Q, Q, Q, Q, Q, Q, Q, INK, Q, Q, w, Q, Q, Q, Q, Q, body))

ICON = {
 'tavern':    ico("<path d='M7 7h8v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z'/><path d='M15 9h2.5a1.5 1.5 0 0 1 0 5H15'/><path d='M7 10h8'/>"),           # tankard
 'slate':     ico("<path d='M12 4l8 8-8 8-8-8z'/><path d='M12 8.5l3.5 3.5-3.5 3.5-3.5-3.5z'/>"),                                                  # cut stone
 'frost':     ico("<path d='M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9'/><path d='M12 6.6L9.6 4.2M12 6.6l2.4-2.4M12 17.4l-2.4 2.4M12 17.4l2.4 2.4'/>", "1.3"),  # snowflake
 'flame':     ico("<path d='M12 3c1.2 3.4 3.6 4.8 3.6 8 0 2.3-1.8 4.1-4 4.1-1.9 0-3.2-1.3-3.2-3 0-1.6 1.2-2.6 1.2-4.2C7.2 9.5 5.6 12 5.6 15c0 3.9 2.9 6 6.4 6s6.4-2.4 6.4-6.4C18.4 9.4 14.6 6.5 12 3z'/>"),  # flame
 'tide':      ico("<path d='M3 9c2.2 0 2.2-2.4 4.5-2.4S12 9 14.2 9s2.3-2.4 4.5-2.4S21 9 21 9'/><path d='M3 14c2.2 0 2.2-2.4 4.5-2.4S12 14 14.2 14s2.3-2.4 4.5-2.4S21 14 21 14'/><path d='M3 19c2.2 0 2.2-2.4 4.5-2.4S12 19 14.2 19s2.3-2.4 4.5-2.4S21 19 21 19'/>", "1.4"),  # waves
 'artificer': ico("<circle cx='12' cy='12' r='3'/><circle cx='12' cy='12' r='7' stroke-dasharray='2.2 2.6'/>"),                                    # gear
 'barbarian': ico("<path d='M6 19L18 7'/><path d='M18 7c1.8-2 4.6-2.2 6.2-.4' /><path d='M15 4.5c2.6-.6 5 .4 6 2.5-2.2 1.6-5 1.4-7-.5z'/><path d='M6.5 12.5c-2 2.2-2 5.2-.2 7 2-1.6 3-4.2 2.4-6.4z'/>", "1.5"),  # axe
 'bard':      ico("<path d='M9 20c-2.6-2.6-2-6.8 1.4-9.6C13.8 7.6 18 7.2 20 9.6'/><path d='M12 16.5c0-3.4 2.6-6 6-6.6'/><path d='M14.5 19c0-4.2 3-7.6 7-8.2'/>", "1.4"),  # harp
 'cleric':    ico("<circle cx='12' cy='12' r='3.4'/><path d='M12 3v3.4M12 17.6V21M3 12h3.4M17.6 12H21M5.6 5.6l2.4 2.4M16 16l2.4 2.4M18.4 5.6L16 8M8 16l-2.4 2.4'/>", "1.3"),  # sun
 'druid':     ico("<path d='M4 20c0-7.7 6.3-14 14-14 0 7.7-6.3 14-14 14z'/><path d='M4.5 19.5C8.5 15.5 13.5 10.5 17.5 6.5'/>", "1.5"),             # leaf
 'fighter':   ico("<path d='M12 3l2.4 3.6v9.6h-4.8V6.6z'/><path d='M9.6 16.2h4.8'/><path d='M12 16.2V21'/><path d='M8.4 18.4h7.2'/>", "1.5"),        # sword
 'monk':      ico("<path d='M12 21c-4.4 0-8-3.2-8-7.2 2.7 1.3 4.8 1.5 8 1.5s5.3-.2 8-1.5c0 4-3.6 7.2-8 7.2z'/><path d='M12 15.3c-2.3-2.6-2.3-6.2 0-8.8 2.3 2.6 2.3 6.2 0 8.8z'/><path d='M12 15.3c-3-1.3-5.3-3.6-6.2-6.6 3 .5 5.3 2.3 6.2 6.6z'/><path d='M12 15.3c3-1.3 5.3-3.6 6.2-6.6-3 .5-5.3 2.3-6.2 6.6z'/>", "1.3"),  # lotus
 'paladin':   ico("<path d='M12 3.5c2.7 1.8 5.4 2.3 8 2.3 0 7.2-2.7 12.6-8 15.7C6.7 18.4 4 13 4 5.8c2.6 0 5.3-.5 8-2.3z'/><path d='M12 8v8M8.4 11.6h7.2'/>", "1.5"),  # shield + cross
 'ranger':    ico("<path d='M5 20c0-8.3 6.7-15 15-15'/><path d='M5 20C11.7 18.3 18.3 11.7 20 5'/><path d='M8.4 16.6l8-8'/><path d='M16.4 8.6l-1-2.6 2.6 1'/>", "1.4"),  # bow + arrow
 'rogue':     ico("<path d='M5 19l7-7'/><path d='M12 12c1.9-2 4.6-5.5 6.4-8-2.5 1.8-6 4.5-8 6.4'/><path d='M8.6 13.4l3 3'/>", "1.5"),                # dagger
 'sorcerer':  ico("<path d='M12 21c-4 0-7.2-3.2-7.2-7.2 0-4.8 4-7.5 7.2-11.3 3.2 3.8 7.2 6.5 7.2 11.3 0 4-3.2 7.2-7.2 7.2z'/><path d='M12 17.4c-1.9 0-3.4-1.5-3.4-3.3 0-2.2 1.8-3.3 3.4-5.2 1.6 1.9 3.4 3 3.4 5.2 0 1.8-1.5 3.3-3.4 3.3z'/>", "1.4"),  # double flame
 'warlock':   ico("<path d='M2.5 12c3.4-4.5 6.1-6.8 9.5-6.8s6.1 2.3 9.5 6.8c-3.4 4.5-6.1 6.8-9.5 6.8S5.9 16.5 2.5 12z'/><circle cx='12' cy='12' r='2.6'/>", "1.5"),  # eye
 'wizard':    ico("<path d='M5 19L16 8'/><path d='M16 8l3-3'/><path d='M18 3.2l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z'/><path d='M6.5 8l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4L4.5 10l1.4-.6z'/>", "1.4"),  # wand + sparks
}

THEMES = list(FAMILY.keys())

def main():
    out = os.path.dirname(os.path.abspath(__file__))
    # skeleton per theme
    skel = []
    for k in sorted(THEMES):
        if k == 'tavern':
            continue
        skel.append("body.mc-theme-%s .mc-frame { --mc-frame-skel: %s }\n" % (k, svg64(FAM[FAMILY[k]])))
    io.open(os.path.join(out, "gen_skel.css"), "w", encoding="utf-8", newline="").write("".join(skel))
    # swatch icons
    icos = []
    for k in sorted(ICON):
        icos.append('.mc-theme-opt[data-theme="%s"] .mc-theme-sw { --mc-sw-ico: %s; }\n' % (k, ICON[k]))
    io.open(os.path.join(out, "gen_icons.css"), "w", encoding="utf-8", newline="").write("".join(icos))
    # tavern keeps the scroll family as the base skeleton
    io.open(os.path.join(out, "gen_base_skel.txt"), "w", encoding="utf-8", newline="").write(
        "--mc-frame-skel: %s" % svg64(FAM['scroll']))
    print("families: %d | skeleton rules: %d | icons: %d" % (len(FAM), len(skel), len(icos)))
    for fam in FAM:
        print("  %-9s -> %s" % (fam, ", ".join(sorted(k for k, v in FAMILY.items() if v == fam))))

main()
