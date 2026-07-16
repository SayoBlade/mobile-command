# -*- coding: utf-8 -*-
"""Generate the 18-theme block for styles/shell.css from one table.

A theme = a palette on body.mc-theme-*, a shell background, and a corner motif. Nothing else
(UI-BIBLE 11.1). The 13 class palettes are derived from a single hue by formula so they stay
consistent; the 5 generic ones keep their hand-tuned values.
"""
import io, re, colorsys

def hx(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360.0, l / 100.0, s / 100.0)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))

def rgb_of(hexstr):
    """'#8a3a2c' -> '138, 58, 44'. The CTA fill is rgba(), so it needs the channels."""
    h = hexstr.lstrip("#")
    return "%d, %d, %d" % (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

def ramp(h, s, dot, hb=None, sb=None, round=1.0):
    """A palette from a hue.

    h/s  = the MATERIAL hue: surfaces, edges, background, and the title bars.
    hb/sb = the BUTTON hue (defaults to the material). Splitting them is what lets a theme mix —
            the DM's example: druid = green titles, brown buttons (2026-07-17).
    round = corner roundness multiplier; every px radius is calc(N * var(--mc-round)).
    """
    hb = h if hb is None else hb
    sb = s if sb is None else sb
    return dict(gold=dot, round=round,
        panel=hx(h, s*0.35, 12), panel2=hx(h, s*0.35, 17), edge=hx(h, s*0.30, 27), sunken=hx(h, s*0.35, 8),
        primary=hx(hb, sb*0.45, 22), primary_edge=hx(hb, sb*0.45, 33), primary_active=hx(hb, sb*0.45, 27),
        cta_top=hx(hb, sb*0.60, 34), cta_bot=hx(hb, sb*0.60, 21), cta_edge=hx(hb, sb*0.60, 45), cta_ink=hx(hb, sb*0.50, 95),
        bar_top=hx(h, s*0.60, 29), bar_bot=hx(h, s*0.60, 19), bar_edge=hx(h, s*0.60, 13),
        bg1=hx(h, s*0.40, 14), bg2=hx(h, s*0.40, 7))

def hand(**kw):
    kw.setdefault('round', 1.0)
    return kw

Q = chr(39)   # single quote, kept out of the literals below for sanity
# Motifs are authored around (25,25); the slot is (30,30) at ~0.78 scale.
SLOT = "<g transform='translate(30,30) scale(0.78) translate(-25,-25)'>%s</g>"
def svg(body):
    return ("url(\"data:image/svg+xml;utf8,<svg xmlns=%shttp://www.w3.org/2000/svg%s "
            "viewBox=%s0 0 64 64%s>%s</svg>\");" % (Q, Q, Q, Q, body))

# ---------------- corner motifs: line-drawn, centred ~(25,25) on the shared 64-grid ----------------
M = {}
M['tavern']    = "<g fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round'><circle cx='25' cy='25' r='4.6'/><path d='M25 15.4v4.2M25 30.2v4.2M15.4 25h4.2M30.2 25h4.2'/></g>"
M['slate']     = "<g fill='none' stroke='black' stroke-width='1.6'><rect x='19' y='19' width='12' height='12' rx='2.4'/><rect x='22.6' y='22.6' width='4.8' height='4.8' rx='1.2'/></g>"
M['frost']     = "<g fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'><path d='M25 15v20M16.4 20l17.2 10M16.4 30l17.2-10'/><path d='M25 19.6l-2.8-2.8M25 19.6l2.8-2.8M25 30.4l-2.8 2.8M25 30.4l2.8 2.8'/><path d='M20.4 22.6l-3.9-1M20.4 27.4l-3.9 1M29.6 22.6l3.9-1M29.6 27.4l3.9 1'/></g>"
M['flame']     = "<path d='M25 14c1.3 3.6 3.9 5.1 3.9 8.5 0 2.5-1.9 4.4-4.3 4.4-2 0-3.4-1.4-3.4-3.2 0-1.7 1.3-2.7 1.3-4.4-2.6 1.7-4.3 4.3-4.3 7.5 0 4.7 3.9 8.1 8.6 8.1' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'/>"
M['tide']      = "<g fill='none' stroke='black' stroke-linecap='round'><path d='M16 26c0-6 4.8-10.8 10.8-10.8-3.6 1.7-5.7 4.2-5.7 7.1 0 1.9 1.3 3.2 3.1 3.2 1.5 0 2.6-1.1 2.6-2.5 0-1.2-.8-2-1.9-2' stroke-width='2'/><path d='M15 32c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2' stroke-width='1.4'/></g>"
# The DM asked for this one by name: a gear as a DOUBLE OUTLINE.
M['artificer'] = "<g fill='none' stroke='black'><circle cx='25' cy='25' r='8.8' stroke-width='1.3'/><circle cx='25' cy='25' r='6.2' stroke-width='1.3'/><circle cx='25' cy='25' r='7.5' stroke-width='2.6' stroke-dasharray='2.3 3.1'/><circle cx='25' cy='25' r='3' stroke-width='1.5'/></g>"
M['barbarian'] = "<g fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M19.5 32.5L30.5 21.5'/><path d='M30.5 21.5c2.4-2.8 6.4-3 8.8-.4-2.6 2.6-6.4 2.8-8.8.4z'/><path d='M19.5 32.5c-2.4 2.8-6.4 3-8.8.4 2.6-2.6 6.4-2.8 8.8-.4z'/></g>"
M['bard']      = "<g fill='none' stroke='black' stroke-linecap='round'><path d='M19.5 32.5c-3.2-3.2-2.4-8.6 1.8-12.2 4.2-3.6 9.4-3.8 12-.8' stroke-width='1.8'/><path d='M23.5 28.5c0-4.4 3.4-7.8 7.8-8.4' stroke-width='1.1'/><path d='M26.5 31.5c0-5.4 4-9.8 9-10.4' stroke-width='1.1'/></g>"
M['cleric']    = "<g fill='none' stroke='black' stroke-linecap='round'><circle cx='25' cy='25' r='4' stroke-width='1.8'/><path d='M25 15.6v3.6M25 30.8v3.6M15.6 25h3.6M30.8 25h3.6' stroke-width='1.4'/><path d='M18.4 18.4l2.6 2.6M29 29l2.6 2.6M31.6 18.4L29 21M21 29l-2.6 2.6' stroke-width='1.2'/></g>"
M['druid']     = "<g fill='none' stroke='black' stroke-linecap='round'><path d='M16 34c0-9.4 7.6-17 17-17 0 9.4-7.6 17-17 17z' stroke-width='1.8' stroke-linejoin='round'/><path d='M16.5 33.5C21.5 28.5 27.5 22.5 32.5 17.5' stroke-width='1.1'/></g>"
M['fighter']   = "<g fill='none' stroke='black' stroke-linecap='round' stroke-linejoin='round'><path d='M25 14.8c3.2 2.2 6.4 2.8 9.4 2.8 0 8.4-3.2 14.8-9.4 18.4-6.2-3.6-9.4-10-9.4-18.4 3 0 6.2-.6 9.4-2.8z' stroke-width='1.8'/><path d='M20.2 24.4c2.6 0 3.9 1.6 4.8 3 .9-1.4 2.2-3 4.8-3' stroke-width='1.3'/></g>"
M['monk']      = "<g fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'><path d='M25 34.5c-5.2 0-9.4-3.8-9.4-8.4 3.2 1.5 5.6 1.7 9.4 1.7s6.2-.2 9.4-1.7c0 4.6-4.2 8.4-9.4 8.4z'/><path d='M25 27.6c-2.7-3.1-2.7-7.3 0-10.4 2.7 3.1 2.7 7.3 0 10.4z'/><path d='M25 27.6c-3.5-1.5-6.2-4.2-7.3-7.7 3.5.6 6.2 2.7 7.3 7.7z'/><path d='M25 27.6c3.5-1.5 6.2-4.2 7.3-7.7-3.5.6-6.2 2.7-7.3 7.7z'/></g>"
M['paladin']   = "<g fill='none' stroke='black' stroke-linecap='round' stroke-linejoin='round'><path d='M25 14.6c3.2 2.2 6.4 2.8 9.6 2.8 0 8.6-3.2 15-9.6 18.6-6.4-3.6-9.6-10-9.6-18.6 3.2 0 6.4-.6 9.6-2.8z' stroke-width='1.8'/><path d='M25 20v10.4M20.6 24.4h8.8' stroke-width='1.5'/></g>"
M['ranger']    = "<g fill='none' stroke='black' stroke-linecap='round'><path d='M16.5 34.5c0-10 8-18 18-18' stroke-width='2.2'/><path d='M16.5 34.5c8-2 16-10 18-18' stroke-width='1'/><path d='M20.5 31.5l9.6-9.6' stroke-width='1.4'/><path d='M30.1 21.9l-1.2-3.2 3.2 1.2' stroke-width='1.2' stroke-linejoin='round'/></g>"
M['rogue']     = "<g fill='none' stroke='black' stroke-linecap='round' stroke-linejoin='round'><path d='M18.5 33.5l8.4-8.4' stroke-width='1.9'/><path d='M26.9 25.1c2.2-2.4 5.4-6.6 7.6-9.6-3 2.2-7.2 5.4-9.6 7.6' stroke-width='1.6'/><path d='M22.4 26.6l3.6 3.6' stroke-width='1.6'/></g>"
M['sorcerer']  = "<g fill='none' stroke='black' stroke-linecap='round'><path d='M25 34.6c-5 0-9-4-9-9 0-6 5-9.4 9-14.2 4 4.8 9 8.2 9 14.2 0 5-4 9-9 9z' stroke-width='1.8'/><path d='M25 30.4c-2.4 0-4.2-1.8-4.2-4.1 0-2.7 2.2-4.1 4.2-6.5 2 2.4 4.2 3.8 4.2 6.5 0 2.3-1.8 4.1-4.2 4.1z' stroke-width='1.2'/></g>"
M['warlock']   = "<g fill='none' stroke='black' stroke-linecap='round'><path d='M15 25c4.2-5.6 7.6-8.4 10-8.4s5.8 2.8 10 8.4c-4.2 5.6-7.6 8.4-10 8.4s-5.8-2.8-10-8.4z' stroke-width='1.8'/><circle cx='25' cy='25' r='3.2' stroke-width='1.5'/></g>"
M['wizard']    = "<g fill='none' stroke='black' stroke-linejoin='round'><path d='M25 15l2.7 6.3 6.3 1.9-6.3 1.9L25 31.4l-2.7-6.3-6.3-1.9 6.3-1.9L25 15z' stroke-width='1.6'/><path d='M33.6 31.6c-2.5 0-4.5-2-4.5-4.5' stroke-width='1.2' stroke-linecap='round'/></g>"

# ---------------- bar patterns (faint, wide-tiled) ----------------
def pat(w, h, vb, body):
    return ("url(\"data:image/svg+xml;utf8,<svg xmlns=%shttp://www.w3.org/2000/svg%s width=%s%s%s "
            "height=%s%s%s viewBox=%s%s%s>%s</svg>\")" % (Q, Q, Q, w, Q, Q, h, Q, Q, vb, Q, body))

P = {}
P['frost'] = pat(40, 22, "-9 0 40 22", "<g fill='none' stroke='rgba(200,240,255,0.13)' stroke-width='1.1' stroke-linecap='round'><path d='M11 3v16M3.5 7l15 8M18.5 7l-15 8'/><path d='M11 6.5l-2-2M11 6.5l2-2M11 15.5l-2 2M11 15.5l2 2'/></g>")
P['flame'] = pat(38, 19, "-5.2 3 34 19", "<path d='M4 17c0-6 4-10 10-13-2.6 3.4-3.6 6-3.6 8.2 0 1.8 1 3 2.6 3 1.3 0 2.2-.9 2.2-2.2 0-1.2-.8-1.8-.8-2.8 1.8 1.2 3 3 3 5.4 0 3.4-2.8 6-6.2 6C7.6 21.6 4 19.8 4 17z' fill='rgba(255,224,160,0.07)'/>")
P['tide'] = pat(44, 20, "-11 0 44 20", "<path d='M-12 13c3.5 0 3.5-4 7-4s3.5 4 7 4 3.5-4 7-4 3.5 4 7 4 3.5-4 7-4 3.5 4 7 4' fill='none' stroke='rgba(190,255,248,0.12)' stroke-width='1.6' stroke-linecap='round'/>")
P['artificer'] = pat(44, 24, "-10 0 44 24", "<g fill='none' stroke='rgba(255,225,180,0.11)' stroke-width='1.2'><circle cx='12' cy='12' r='3.4'/><circle cx='12' cy='12' r='6.4' stroke-dasharray='2 2.8'/></g>")
P['druid'] = pat(36, 18, "-6.9 1.4 32 16.2", "<path d='M2 2c0 9 5 15 14 15C16 8 11 2 2 2z' fill='rgba(205,255,210,0.09)'/>")

# ---------------- the table ----------------
# key, label, dot, title font, palette, background animation
THEMES = [
    ('tavern', 'Tavern', '#c8a44d', '"Modesto Condensed"', None, None),
    ('slate', 'Slate', '#79b8e0', '"Signika"', hand(round=0.8, gold='#79b8e0', panel='#1d2330', panel2='#262d3c', edge='#36404f', sunken='#141924', primary='#2a3a52', primary_edge='#3a5374', primary_active='#34496a', cta_top='#2f5f86', cta_bot='#1f4059', cta_edge='#4076a3', cta_ink='#e6f1f9', bar_top='#2f4660', bar_bot='#1f3044', bar_edge='#16222f', frame='#3a5374', bg1='#1c2433', bg2='#11151c'), 'snow'),
    ('frost', 'Frost', '#8fd3f4', '"Titillium"', hand(round=1.4, gold='#8fd3f4', panel='#16222b', panel2='#1e2f3b', edge='#2f4655', sunken='#0f171d', primary='#1f4459', primary_edge='#2f6480', primary_active='#275470', cta_top='#2b7ba8', cta_bot='#185f80', cta_edge='#47a0cc', cta_ink='#eaf7ff', bar_top='#2a6d95', bar_bot='#174a63', bar_edge='#103548', frame='#2f6480', bg1='#172a36', bg2='#0d161d'), None),
    ('flame', 'Flame', '#f0a52e', '"OptimusPrinceps"', hand(round=1.0, gold='#f0a52e', panel='#2a1f12', panel2='#362818', edge='#4d3a1f', sunken='#1d1509', primary='#5a3a12', primary_edge='#7d5219', primary_active='#6b4515', cta_top='#c9701a', cta_bot='#8f4708', cta_edge='#e08a2b', cta_ink='#fff3e0', bar_top='#b4611a', bar_bot='#7c3a06', bar_edge='#5c2a04', frame='#b4611a', bg1='#33230f', bg2='#1a1208'), None),
    ('tide', 'Tide', '#45c4b0', '"Average"', hand(round=1.5, gold='#45c4b0', panel='#13232a', panel2='#1b3038', edge='#2b4a54', sunken='#0d1a1f', primary='#1b4048', primary_edge='#2a606c', primary_active='#235058', cta_top='#1f7a76', cta_bot='#114f4d', cta_edge='#2fa39c', cta_ink='#e8fbf8', bar_top='#1d6b6a', bar_bot='#0f4746', bar_edge='#0a3130', frame='#2a606c', bg1='#15282f', bg2='#0b1418'), None),
    # --- the thirteen dnd5e classes ---
    ('artificer', 'Artificer', '#c98b3c', '"Bruno Ace"', ramp(32, 55, '#c98b3c', 210, 22, 0.45), None),
    ('barbarian', 'Barbarian', '#c0483a', '"Allrounder Monument"', ramp(6, 55, '#c0483a', 28, 45, 0.25), None),
    ('bard', 'Bard', '#d76ba8', '"Gilda"', ramp(330, 48, '#d76ba8', 265, 40, 1.7), None),
    ('cleric', 'Cleric', '#e0d3a0', '"OptimusPrinceps"', ramp(45, 38, '#e0d3a0', 220, 35, 1.2), None),
    ('druid', 'Druid', '#6fbf73', '"Average"', ramp(110, 38, '#6fbf73', 28, 42, 1.6), None),
    ('fighter', 'Fighter', '#93a3b8', '"Roboto Slab"', ramp(210, 18, '#93a3b8', 8, 40, 0.5), None),
    ('monk', 'Monk', '#52c2a5', '"Amiri"', ramp(165, 40, '#52c2a5', 38, 40, 1.9), None),
    ('paladin', 'Paladin', '#7f9fe0', '"Granville"', ramp(225, 45, '#7f9fe0', 45, 50, 1.0), None),
    ('ranger', 'Ranger', '#9fbf5f', '"Roboto Condensed"', ramp(85, 35, '#9fbf5f', 25, 40, 1.3), None),
    ('rogue', 'Rogue', '#9b8fb5', '"Titillium"', ramp(270, 20, '#9b8fb5', 150, 30, 0.7), None),
    ('sorcerer', 'Sorcerer', '#e2703a', '"Amiri"', ramp(18, 62, '#e2703a', 320, 45, 1.4), 'glow'),
    ('warlock', 'Warlock', '#b06fe0', '"Gilda"', ramp(285, 45, '#b06fe0', 130, 40, 1.1), 'twinkle'),
    ('wizard', 'Wizard', '#7f8fe0', '"Granville"', ramp(245, 45, '#7f8fe0', 45, 45, 1.0), None),
]

def tokens_block(k, font, p):
    barpat = ("\n  --mc-bar-pat: %s;" % P[k]) if k in P else ""
    return ("body.mc-theme-%s {\n"
            "  --mc-font-title: %s;\n"
            "  --mc-gold: %s; --mc-panel: %s; --mc-panel-2: %s; --mc-edge: %s; --mc-sunken: %s;\n"
            "  --mc-primary: %s; --mc-primary-edge: %s; --mc-primary-active: %s;\n"
            "  --mc-cta-top: %s; --mc-cta-bot: %s; --mc-cta-edge: %s; --mc-cta-ink: %s;\n"
            "  --mc-cta-top-rgb: %s; --mc-cta-bot-rgb: %s;\n"
            "  --mc-bar-top: %s; --mc-bar-bot: %s; --mc-bar-edge: %s;\n"
            "  --mc-round: %s;%s\n"
            "}\n" % (k, font, p['gold'], p['panel'], p['panel2'], p['edge'], p['sunken'],
                     p['primary'], p['primary_edge'], p['primary_active'],
                     p['cta_top'], p['cta_bot'], p['cta_edge'], p['cta_ink'],
                     rgb_of(p['cta_top']), rgb_of(p['cta_bot']),
                     p['bar_top'], p['bar_bot'], p['bar_edge'], p['round'], barpat))

def frame_block(k, p):
    """Motif only — the ornament is GILDING now.

    The motif is drawn around (25,25) but LIVES in the slot at (30,30) r~7 (see gen_frames.py):
    the transform moves and shrinks it there. Skeletons are built to keep out of that circle —
    designing the two halves independently is what had seigaiha arcs slicing through the monk's
    lotus.

    Real gold in every theme (DM 2026-07-17: "use gold for the corner art"), set once on the base
    .mc-frame rule. This supersedes the 2026-07-16 "frame is burgundy, not gold" note: that was
    written against a chunky 26px ornament, where gold read as harsh. As fine tapered line-art at
    78px it reads as gilt on leather, and it's the one thing every theme now shares.
    """
    return ("body.mc-theme-%s .mc-frame {\n  --mc-frame-orn: %s\n}\n" % (k, svg(M[k])))

toks, bgs, frames = [], [], []
for k, label, dot, font, p, anim in THEMES:
    if k == 'tavern':
        continue
    toks.append(tokens_block(k, font, p))
    bgs.append("body.mc-theme-%s #mobile-command-shell { background: radial-gradient(120%% 80%% at 50%% -10%%, %s 0%%, %s 60%%); }\n" % (k, p['bg1'], p['bg2']))
    frames.append(frame_block(k, p))

import os
out = os.path.dirname(os.path.abspath(__file__))
io.open(out + '/gen_tokens.css', 'w', encoding='utf-8', newline='').write("".join(toks))
io.open(out + '/gen_bgs.css', 'w', encoding='utf-8', newline='').write("".join(bgs))
io.open(out + '/gen_frames.css', 'w', encoding='utf-8', newline='').write("".join(frames))
io.open(out + '/gen_js.txt', 'w', encoding='utf-8', newline='').write(
    ",\n      ".join('["%s", "%s", "%s"]' % (k, label, dot) for k, label, dot, f, p, a in THEMES))
io.open(out + '/gen_tavern_orn.txt', 'w', encoding='utf-8', newline='').write(svg(M['tavern']))
print("themes: %d | tokens: %d | bgs: %d | frames: %d" % (len(THEMES), len(toks), len(bgs), len(frames)))
