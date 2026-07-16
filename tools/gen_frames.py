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
    "</g>"
    # a second, outer fan tier — deco stacks its rays in registers
    "<g stroke-linecap='butt' stroke-width='0.9'>"
    "<path d='M14 34v6'/><path d='M20.1 32.1l4.3 4.3'/><path d='M34 14h6'/><path d='M32.1 20.1l4.3 4.3'/>"
    "</g>"
    # stepped ziggurat blocks marching down each arm
    "<g stroke-width='1'>"
    "<path d='M3 44h4v-4M3 52h8v-8'/><path d='M44 3v4h-4M52 3v8h-8'/>"
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
    # a flower head where the whiplash begins — the eye of the composition
    "<g stroke-width='0.9'>"
    "<path d='M6.6 46 C3.4 45.2 2.4 42 4.4 39.6 C6 37.6 9 37.8 10.2 40'/>"
    "<path d='M10.2 40 C12.6 38.4 15.6 39.6 16 42.4 C16.4 45 14.2 47.2 11.4 46.8'/>"
    "</g>"
    # a long leaf riding the outside of the main stem
    "<path d='M20 8.6 C24.4 5.2 30.6 4.2 36 5.6 C31.6 9.6 25.4 10.8 20 8.6z' stroke-width='0.9'/>"
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
    "</g>"
    # a second seigaiha register, offset — the pattern is scale-like, never a single row
    "<g stroke-width='0.8'>"
    "<path d='M3 41A38 38 0 0 1 41 3'/><path d='M3 48A45 45 0 0 1 48 3'/>"
    "</g>"
    # bamboo: a stem with nodes running out along the top arm
    "<g stroke-width='1.1'>"
    "<path d='M40 6.5h14'/><path d='M44.5 4.5v4M49.5 4.5v4'/>"
    "<path d='M46 11c2.6 0 4.6 1.6 5.6 4' stroke-linecap='round'/>"
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
    # a chevron band marching along both arms
    "<g stroke-width='1' stroke-linecap='round'>"
    "<path d='M14 15l4-4 4 4M24 15l4-4 4 4M34 15l4-4 4 4'/>"
    "<path d='M15 14l-4 4 4 4M15 24l-4 4 4 4M15 34l-4 4 4 4'/>"
    "</g>"
    # rivets at the mitre
    "<g stroke-width='1.4' stroke-linecap='round'><path d='M7 7h.1M12 4h.1M4 12h.1'/></g>"
    "</g>"
)

# --- GOTHIC: a pointed arch with tracery, crockets climbing the arm, a finial. Severe and tall.
FAM['gothic'] = (
    "<g fill='none' stroke='black' stroke-linejoin='miter' stroke-linecap='butt'>"
    # the arch: two straight jambs rising into a lancet point
    "<path d='M3 46V16L14 3' stroke-width='3'/>"
    "<path d='M9.5 50V19L18.5 8' stroke-width='1.4'/>"
    # a second lancet springing off the arm, echoing the first
    "<path d='M14 3L25 14' stroke-width='3'/>"
    "<path d='M18.5 8L27.5 17' stroke-width='1.4'/>"
    # tracery: a quatrefoil cusp under the arch
    "<g stroke-width='1.1'>"
    "<circle cx='13.5' cy='17.5' r='2.6'/><circle cx='19' cy='23' r='2.6'/>"
    "<path d='M11 20L16.4 25.4' stroke-linecap='round'/>"
    "</g>"
    # crockets — the little hooks climbing a gothic spire
    "<g stroke-width='1.2' stroke-linecap='round'>"
    "<path d='M6 34c2.6 0 4-1.4 4-4'/><path d='M6 26c2.6 0 4-1.4 4-4'/>"
    "<path d='M30 7c0 2.6 1.4 4 4 4'/><path d='M38 7c0 2.6 1.4 4 4 4'/>"
    "</g>"
    # finials capping both arms
    "<path d='M3 46l3 5 3-5' stroke-width='1.4'/>"
    "<path d='M46 3l5 3-5 3' stroke-width='1.4'/>"
    "</g>"
)

# --- RUNIC: NO BRACKET. Runes don't get a corner drawn round them — they're chiselled into the
# thing itself, so the marks ARE the ornament (DM 2026-07-17: "Runes don't need corners, just the
# runes, thick lines, more rough"). Elder Futhark, cut thick, every stave knocked a couple of
# degrees off true and butt-capped: a chisel doesn't do round ends or perfect verticals.
FAM['runic'] = (
    "<g fill='none' stroke='black' stroke-linecap='butt'>"
    # Algiz — the big one at the corner, leaning slightly
    "<g transform='rotate(-2 11 19)'>"
    "<path d='M11 31V7' stroke-width='3.6'/>"
    "<path d='M11.2 16.6L4.2 8.6' stroke-width='3.2'/>"
    "<path d='M10.8 16.2L18.4 8' stroke-width='3.1'/>"
    "</g>"
    # Isa + Gebo, cut down the vertical arm
    "<path d='M6 38.5v10' stroke-width='3.2' transform='rotate(2 6 43)'/>"
    "<g transform='rotate(-3 18 44)'>"
    "<path d='M13.6 39.6l8.8 9' stroke-width='2.9'/>"
    "<path d='M22.4 39.6l-8.8 9' stroke-width='2.7'/>"
    "</g>"
    # Kenaz + Sowilo, cut along the top arm
    "<path d='M29.5 4l7.5 6.4-7.5 6.2' stroke-width='2.9' transform='rotate(3 33 10)'/>"
    "<path d='M44 3.6l6 3.6-6 3.4 6 3.6' stroke-width='2.7' transform='rotate(-2 47 7)'/>"
    # Thurisaz, low on the outer edge — clear of the motif slot
    "<g transform='rotate(2 45 34)'>"
    "<path d='M45 27.5v13' stroke-width='3'/>"
    "<path d='M45 30.6l5.4 3.2-5.4 3.4z' stroke-width='2.8'/>"
    "</g>"
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
    'gothic': 'gothic', 'artificer': 'deco', 'fighter': 'deco', 'rogue': 'deco', 'wizard': 'deco',
    'druid': 'nouveau', 'bard': 'nouveau', 'ranger': 'nouveau',
    'monk': 'japanese', 'tide': 'japanese', 'frost': 'japanese',
    'paladin': 'heraldic', 'cleric': 'heraldic', 'warlock': 'heraldic',
    'barbarian': 'runic',
}

# ---------------------------------------------------------------- swatch icons
# A tiny line-art badge inside each colour dot (DM: "sword for fighter, shield with cross for
# paladin, wand for mage"). 24-grid, dark ink so it reads on any dot colour.
INK = "black"   # a MASK: alpha is what matters, so full black = fully painted
def ico(body, w="2.6"):
    return ("url(\"data:image/svg+xml;utf8,<svg xmlns=%shttp://www.w3.org/2000/svg%s "
            "viewBox=%s0 0 24 24%s><g fill=%snone%s stroke=%s%s%s stroke-width=%s%s%s "
            "stroke-linecap=%sround%s stroke-linejoin=%sround%s>%s</g></svg>\")"
            % (Q, Q, Q, Q, Q, Q, Q, INK, Q, Q, w, Q, Q, Q, Q, Q, body))

ICON = {
 # A class reads fastest as its WEAPON (DM 2026-07-17: "a good way to show classes is with favorite
 # weapon"). These render ~44px, so: one silhouette, 2-4 strokes, nothing finer than 2.2.
 # The corner MOTIF stays symbolic (rune, sunburst, leafy spray) — icon = weapon, motif = meaning.
 'tavern':    ico("<path d='M6 7h9v11a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 6 18z'/><path d='M15 10h2.5a2.5 2.5 0 0 1 0 5H15'/><path d='M6 11h9'/>"),  # tankard
 'gothic':    ico("<path d='M12 2.5L19 11v10.5H5V11z'/><circle cx='12' cy='11.5' r='3.4'/><path d='M9 21.5v-4a3 3 0 0 1 6 0v4'/>", "2.2"),  # arch + rose window
 'frost':     ico("<path d='M12 2.5v19M4 7l16 9.5M4 16.5L20 7'/><path d='M12 7L8.6 3.6M12 7l3.4-3.4M12 17l-3.4 3.4M12 17l3.4 3.4'/>", "2.2"),  # snowflake
 'flame':     ico("<path d='M12 2.5c1.4 4 4.2 5.6 4.2 9.2 0 2.6-2 4.6-4.4 4.6-2.1 0-3.5-1.4-3.5-3.2 0-1.8 1.3-2.8 1.3-4.6C6.6 10.4 4.8 13 4.8 16.2c0 3.9 3.2 5.8 7.2 5.8s7.2-2.4 7.2-6.6c0-5.4-4.4-8.6-7.2-12.9z'/>"),  # flame
 'tide':      ico("<path d='M3 8.5c2.2 0 2.2-2.6 4.5-2.6S12 8.5 14.2 8.5s2.3-2.6 4.5-2.6S21 8.5 21 8.5'/><path d='M3 14c2.2 0 2.2-2.6 4.5-2.6S12 14 14.2 14s2.3-2.6 4.5-2.6S21 14 21 14'/><path d='M3 19.5c2.2 0 2.2-2.6 4.5-2.6S12 19.5 14.2 19.5s2.3-2.6 4.5-2.6S21 19.5 21 19.5'/>", "2.2"),  # waves
 # --- the thirteen: each class's weapon ---
 'artificer': ico("<path d='M3 8h13v5H8l-2 3H3z'/><path d='M16 10.5h5'/><path d='M9 16v4'/><path d='M6.5 20h5'/>", "2.3"),  # gun
 'barbarian': ico("<path d='M12 3v18'/><path d='M12 6.5c3-3 7.5-3 9.5 0-2 3-6.5 3-9.5 0z'/><path d='M12 6.5c-3-3-7.5-3-9.5 0 2 3 6.5 3 9.5 0z'/>", "2.4"),  # battle axe
 'bard':      ico("<path d='M8 21c-3-3-2-8 2-11.5S18.5 6 21 8.5'/><path d='M12.5 18.5c0-4 3-7 7-7.5'/>", "2.4"),  # lute/harp
 'cleric':    ico("<path d='M12 21v-9'/><path d='M8 8.5a4 4 0 0 1 8 0 4 4 0 0 1-8 0z'/><path d='M12 2.5V5'/><path d='M9 21h6'/>", "2.4"),  # mace
 'druid':     ico("<path d='M8 21L14 6'/><path d='M14 6c-2.5-1-3-3.5-1.5-5.5C15 1.5 16 4 14 6z'/><path d='M14 6c2.5-1 5 0 5.5 2.5C17 9.5 15 8.5 14 6z'/><path d='M11 13c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4z'/>", "2.2"),  # wooden staff
 'fighter':   ico("<path d='M12 21V7'/><path d='M12 7l3-4.5L12 1.5 9 2.5z'/><path d='M8 7h8'/><path d='M10 21h4'/>", "2.4"),  # sword
 'monk':      ico("<path d='M6 11.5V8a1.8 1.8 0 0 1 3.6 0v3'/><path d='M9.6 11V6.5a1.8 1.8 0 0 1 3.6 0V11'/><path d='M13.2 11V7.5a1.8 1.8 0 0 1 3.6 0V12'/><path d='M16.8 12v-1a1.8 1.8 0 0 1 3.4 0v5.5a5.5 5.5 0 0 1-5.5 5.5h-3A5.6 5.6 0 0 1 6 17z'/>", "2.1"),  # fist
 'paladin':   ico("<path d='M12 2.5c3 2 6 2.6 9 2.6 0 8-3 14-9 17.4C6 19.1 3 13.1 3 5.1c3 0 6-.6 9-2.6z'/><path d='M12 7.5v9M8 11.5h8'/>", "2.3"),  # shield + cross
 'ranger':    ico("<path d='M4 20c0-8.8 7.2-16 16-16'/><path d='M4 20L20 4'/><path d='M20 4l-5.5 1 1 5.5'/>", "2.4"),  # bow + arrow
 'rogue':     ico("<path d='M3.5 20.5L14 10'/><path d='M14 10l4-6.5-6.5 4'/><path d='M20.5 20.5L10 10'/><path d='M10 10L6 3.5l6.5 4'/>", "2.3"),  # two crossed daggers
 'sorcerer':  ico("<path d='M12 21.5c-4.2 0-7.6-3.4-7.6-7.6 0-5 4.2-7.9 7.6-11.9 3.4 4 7.6 6.9 7.6 11.9 0 4.2-3.4 7.6-7.6 7.6z'/><path d='M12 17.6c-2 0-3.6-1.6-3.6-3.5 0-2.3 1.9-3.5 3.6-5.5 1.7 2 3.6 3.2 3.6 5.5 0 1.9-1.6 3.5-3.6 3.5z'/>", "2.2"),  # innate flame — a sorcerer's weapon IS the magic
 'warlock':   ico("<path d='M2.5 12c3.4-4.6 6.1-6.9 9.5-6.9s6.1 2.3 9.5 6.9c-3.4 4.6-6.1 6.9-9.5 6.9S5.9 16.6 2.5 12z'/><circle cx='12' cy='12' r='2.8'/>", "2.3"),  # the pact's eye
 'wizard':    ico("<path d='M4 20L15 9'/><path d='M17.5 6.5l2 2'/><path d='M18.5 2.5l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8L14.5 6.5l2.8-1.2z'/>", "2.3"),  # wand
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
