# Builds the VE-Mobile-style mockups of Mobile Command's phone screens (PROPOSED), renders them with Chrome
# headless at phone size (375x812, 2x), and composes each next to TODAY (live screenshots of the shell).
import os, subprocess, html
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
OUT = Path("C:/Users/User/Documents/Claude/Code/mobile-command/renders-2026-11-13")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = HERE / "chrome-profile"
SHELL_CSS = "file:///C:/Users/User/Documents/Claude/Code/mobile-command/styles/shell.css"
FA_CSS = "file:///C:/Users/User/Documents/Claude/Code/deck-command/service/node_modules/@fortawesome/fontawesome-free/css/all.css"

I = lambda cp: f'<i class="fa">&#x{cp};</i>'
FA = dict(fist="f6de", user="f007", wand="f72b", compass="f14e", suitcase="f0f2", feather="f52d", moon="f186", hourglass="f254",
          d20="f6cf", x="f00d", right="f054", down="f078", up="f077", arrow="f062", hand="f256", shield="f3ed", heart="f004",
          bolt="f0e7", run="f70c", star="f005", bell="f0f3", mail="f0e0", search="f002", circle="f111", dot="f192", lock="f023",
          book="f518", fire="f06d", sun="f185", bed="f236", plus="2b", coins="f51e", weight="f5cd", sparkles="f0d0", door="f52b",
          box="f466", scroll="f70e", eye="f06e", brain="f5dc", pray="f684", cross="f654", hammer="f6e3", bow="f05b", gem="f3a5",
          crosshair="f05b", flag="f024", hourglass2="f252", route="f4d7", dice="f522", stairs="e289", chest="f49e")

def page(body, extra_css="", bg_img=None):
    return f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="proposed.css"><style>{extra_css}</style></head>
<body><div class="app">{body}</div></body></html>"""

def header(paused=True, lvl_ready=False):
    return f"""
<div class="hdr">
  <div class="hdr-row">
    <div class="portrait" style="background: linear-gradient(135deg,#2b3a7a,#6b3fa0 60%,#1a1226)"></div>
    <div class="who"><div class="name">Test Cleric</div>
      <div class="sub"><span>{I(FA['cross'])} Cleric 1</span><span>{I(FA['user'])} Dwarf</span></div></div>
    <div class="lvl {'ready' if lvl_ready else ''}">1<small>LVL</small></div>
  </div>
  {'<div class="paused">&#9646;&#9646; PAUSED</div>' if paused else ''}
  <div class="econ"><span class="pip on" title="Action"></span><span class="pip on" title="Bonus"></span><span class="pip react on" title="Reaction"></span><span class="pip" title="Inspiration"></span><span class="lbl">action · bonus · reaction</span></div>
</div>"""

def vitals(hp=10, mx=10, temp=0, ac=14):
    pct = int(100 * hp / mx); cls = "ok" if pct > 50 else ("hurt" if pct > 25 else "bad")
    return f"""
<div class="vitals">
  <div class="vit-row">
    <div class="vit"><div class="kicker">Hit points</div><div class="v {cls} num">{I(FA['heart'])}{hp}<small>/ {mx}</small></div></div>
    <div class="vit"><div class="kicker">Temp</div><div class="v num">{temp}</div></div>
    <div class="vit"><div class="kicker">Armor</div><div class="v num">{I(FA['shield'])}{ac}</div></div>
  </div>
  <div class="hpbar {cls}"><i style="width:{pct}%"></i></div>
</div>
<div class="cond"><span class="chip">{I(FA['eye'])} Alert</span><span class="chip">Dwarven Toughness</span><span class="chip">+</span></div>"""

TABS = [("fist", "Actions"), ("user", "Details"), ("wand", "Spells"), ("compass", "Explore"), ("suitcase", "Gear"), ("feather", "Journal")]
def tabs(active, dot=None):
    out = []
    for k, label in TABS:
        on = " on" if label == active else ""
        d = '<span class="dot"></span>' if dot == label else ""
        out.append(f'<div class="tab{on}">{I(FA[k])}<span>{label}</span>{d}</div>')
    return f'<div class="tabs">{"".join(out)}</div>'

def sec(title, count=None, open_=True):
    c = f'<span class="count">{count}</span>' if count is not None else ""
    return f'<div class="sec"><span class="kicker">{title}</span>{c}<span class="chev fa">&#x{FA["up"] if open_ else FA["down"]};</span></div>'

def icon_tile(glyph, hue):
    return f'<div class="ico" style="background: linear-gradient(145deg, hsl({hue} 40% 26%), hsl({hue} 50% 14%)); color: hsl({hue} 70% 78%)">{I(FA[glyph])}</div>'

def row(glyph, hue, title, sub, right="", tag=""):
    return f'<div class="row">{icon_tile(glyph, hue)}<div class="txt"><div class="t">{title}{tag}</div><div class="s">{sub}</div></div>{right}</div>'

# ───────────────────────────── screens ─────────────────────────────
def explore():
    pad = ""
    for dx, dy in [(-1,-1),(0,-1),(1,-1),(-1,0),(0,0),(1,0),(-1,1),(0,1),(1,1)]:
        if (dx, dy) == (0, 0):
            pad += f'<b class="hand live">{I(FA["hand"])}</b>'; continue
        import math; deg = round(math.degrees(math.atan2(dx, -dy)))
        diag = "diag" if dx and dy else ""
        pad += f'<b class="{diag}"><span class="fa" style="transform:rotate({deg}deg)">&#x{FA["arrow"]};</span></b>'
    body = header() + vitals() + f"""
<div class="scroll">
  {sec("Move")}
  <div class="movenote num">30 ft<small>left this turn · Passenger Car</small></div>
  <div class="pad">{pad}</div>
  
  {sec("Nearby", 2)}
  <div class="card">
    {row("door", 30, "Forward door", "5 ft · to the Sleeper Car", '<span class="pill">' + I(FA["hand"]) + ' Use</span>')}
    {row("box", 40, "Marble jar", "10 ft · on the seat", '<span class="pill">' + I(FA["hand"]) + ' Take</span>')}
  </div>
  {sec("Rest")}
  <div class="pillrow"><span class="btn">{I(FA['bed'])} Short Rest</span><span class="btn">{I(FA['moon'])} Long Rest</span></div>
</div>""" + tabs("Explore")
    return page(body)

def actions():
    body = header() + vitals() + f"""
<div class="scroll">
  <div class="search">{I(FA['search'])} Search…</div>
  <div class="seg"><b class="on">Actions</b><b>Bonus</b><b>Reactions</b><b>Other</b></div>
  {sec("Actions", 6)}
  <div class="card">
    {row("hammer", 28, "Mace", "Attack · +5 · 1d6+3 bludgeoning", '<span class="star on">' + I(FA["star"]) + '</span>')}
    {row("bow", 200, "Light Crossbow", "Attack · +1 · 1d8−1 piercing · 80/320", '<span class="star">' + I(FA["star"]) + '</span>')}
    {row("sparkles", 48, "Guidance", "Cast · cantrip", "<span class='tag'>C</span>", "")}
    {row("fire", 18, "Sacred Flame", "Cast · cantrip · DEX 13", '<span class="star">' + I(FA["star"]) + '</span>')}
    {row("pray", 210, "Bless", "Cast · 1st", '<span class="uses num">2 slots</span>', "<span class='tag'>C</span>")}
    {row("heart", 120, "Cure Wounds", "Heal · 1st · touch", '<span class="uses num">2 slots</span>')}
    {row("bolt", 205, "Guiding Bolt", "Attack · 1st · 4d6 radiant", '<span class="uses num">2 slots</span>')}
  </div>
  {sec("Class", 1)}
  <div class="card">{row("sun", 45, "Channel Divinity", "Use · 1 / long rest", '<span class="uses num">1/1</span>')}</div>
</div>""" + tabs("Actions")
    return page(body)

def details():
    ab = [("STR", "+3", False), ("DEX", "−1", False), ("CON", "+1", True), ("INT", "+0", False), ("WIS", "+3", True), ("CHA", "+1", True)]
    tiles = "".join(f'<div class="ab {"prof" if p else ""}"><div class="kicker">{k}</div><div class="v num">{v}</div><div class="pr"><b>Check</b><b class="sv">Save</b></div></div>' for k, v, p in ab)
    sk = [("Acrobatics", "DEX", "−1", 0), ("Animal Handling", "WIS", "+3", 0), ("Arcana", "INT", "+0", 0), ("Athletics", "STR", "+5", 1), ("Deception", "CHA", "+1", 0), ("History", "INT", "+0", 0), ("Insight", "WIS", "+5", 1), ("Intimidation", "CHA", "+1", 0)]
    rows = "".join(f'<div class="row" style="min-height:48px;padding:8px 12px"><span class="fa" style="color:{"var(--mc-gold)" if p else "var(--mc-edge-2)"};font-size:11px">&#x{FA["circle"] if not p else FA["dot"]};</span><div class="txt"><div class="t">{n}</div></div><span class="kicker" style="font-size:10px">{a}</span><span class="num" style="font-weight:800;font-size:18px;min-width:36px;text-align:right">{v}</span></div>' for n, a, v, p in sk)
    body = header() + vitals() + f"""
<div class="scroll">
  <div class="tiles"><div class="tile"><div class="kicker">Init</div><div class="v num">{I(FA['bolt'])}−1</div></div><div class="tile"><div class="kicker">Speed</div><div class="v num">{I(FA['run'])}25</div></div><div class="tile"><div class="kicker">Prof</div><div class="v num">+2</div></div><div class="tile"><div class="kicker">Hit dice</div><div class="v num">1/1</div></div></div>
  {sec("Abilities")}
  <div class="abil">{tiles}</div>
  {sec("Skills", "18")}
  <div class="card">{rows}</div>
</div>""" + tabs("Details")
    return page(body)

def gear():
    body = header() + vitals() + f"""
<div class="scroll">
  <div class="coins"><span class="coin pp"><i></i>0</span><span class="coin"><i></i>19</span><span class="coin"><i></i>3</span><span class="coin sp"><i></i>0</span><span class="coin cp"><i></i>0</span></div>
  <div class="weight">{I(FA['weight'])}<span class="bar"><i></i></span><span class="num">82.9 / 240 lb</span></div>
  {sec("Weapons", 3)}
  <div class="card">
    {row("bow", 200, "Light Crossbow", "1d8 piercing · 80/320 · 5 lb", '<span class="qty">1</span><span class="fa" style="color:var(--mc-edge-2)">&#x' + FA["shield"] + ';</span>')}
    <div class="row rail ok" style="box-shadow:none;border-left:3px solid var(--mc-ok-ink)">{icon_tile("hammer", 28)}<div class="txt"><div class="t">Mace</div><div class="s">1d6 bludgeoning · 4 lb</div></div><span class="held">Held</span></div>
    {row("crosshair", 10, "Spear", "1d6 piercing · thrown 20/60 · 3 lb", '<span class="qty">1</span><span class="fa" style="color:var(--mc-edge-2)">&#x' + FA["shield"] + ';</span>')}
  </div>
  {sec("Armor &amp; gear", 4)}
  <div class="card">
    <div class="row" style="border-left:3px solid var(--mc-ok-ink)">{icon_tile("gem", 195)}<div class="txt"><div class="t">Amulet<span class="tag">holy symbol</span></div><div class="s">1 lb</div></div><span class="held">Worn</span></div>
    <div class="row" style="border-left:3px solid var(--mc-ok-ink)">{icon_tile("shield", 240)}<div class="txt"><div class="t">Chain Shirt</div><div class="s">AC 13 · medium · 20 lb</div></div><span class="held">Worn</span></div>
    <div class="row" style="border-left:3px solid var(--mc-ok-ink)">{icon_tile("shield", 35)}<div class="txt"><div class="t">Shield</div><div class="s">+2 AC · 6 lb</div></div><span class="held">Held</span></div>
    {row("chest", 30, "Priest's Pack", "backpack · 7 items", '<span class="fa" style="color:var(--mc-muted);font-size:12px">&#x' + FA["right"] + ';</span>')}
  </div>
</div>""" + tabs("Gear")
    return page(body)

def spells():
    slot = lambda n, of: "".join(f'<span class="pip {"on" if i < n else ""}" style="width:12px;height:12px"></span>' for i in range(of))
    body = header() + vitals() + f"""
<div class="scroll">
  <div class="card rail" style="padding:12px 14px;display:flex;align-items:center;gap:12px">
    <div class="txt" style="flex:1"><div class="t">Prepare Spells</div><div class="s">Cleric · <b style="color:var(--mc-gold)">4 / 4</b> prepared · swaps open after a long rest</div></div>{I(FA['right'])}
  </div>
  <div class="tiles"><div class="tile"><div class="kicker">Ability</div><div class="v num">+3</div></div><div class="tile"><div class="kicker">Attack</div><div class="v num">+5</div></div><div class="tile"><div class="kicker">Save DC</div><div class="v num">13</div></div><div class="tile"><div class="kicker">1st slots</div><div class="v" style="display:flex;gap:4px;justify-content:center;margin-top:7px">{slot(2,2)}</div></div></div>
  {sec("Cantrips", 3)}
  <div class="card">
    {row("sparkles", 48, "Guidance", "1 action · touch · concentration", '<span class="pill">Cast</span>', "<span class='tag'>C</span>")}
    {row("fire", 18, "Sacred Flame", "1 action · 60 ft · DEX save", '<span class="pill">Cast</span>')}
    {row("hand", 270, "Thaumaturgy", "1 action · 30 ft", '<span class="pill">Cast</span>')}
  </div>
  {sec("1st level", "4/4")}
  <div class="card">
    {row("pray", 210, "Bless", "1 action · 30 ft · concentration", '<span class="pill">Cast</span>', "<span class='tag'>C</span>")}
    {row("heart", 120, "Cure Wounds", "1 action · touch", '<span class="pill">Cast</span>')}
    {row("bolt", 205, "Guiding Bolt", "1 action · 120 ft", '<span class="pill">Cast</span>')}
  </div>
</div>""" + tabs("Spells")
    return page(body)

def prepare():
    def prow(glyph, hue, name, on, tag="", locked=None):
        right = f'<span class="lock">{I(FA["lock"])} {locked}</span>' if locked else f'<span class="tog {"on" if on else ""}"><i></i></span>'
        return f'<div class="row" style="min-height:52px">{icon_tile(glyph, hue)}<div class="txt"><div class="t" style="{"" if on else "color:var(--mc-muted)"}">{name}{tag}</div></div>{right}</div>'
    body = f"""
<div class="scroll" style="padding-top:14px">
  <div style="display:flex;align-items:center;gap:10px"><div style="flex:1"><div class="kicker gold">Prepare spells</div><div class="name" style="font-size:19px">Test Cleric <span class="kicker" style="font-size:11px">· Cleric 1</span></div></div><span class="btn ter" style="height:36px;padding:0 8px">{I(FA['x'])}</span></div>
  <div class="hint">From the Cleric list (Spell Book's setup for this character).</div>
  <div style="display:flex;gap:8px;align-items:center"><span class="kicker" style="font-size:10px">Show</span><span class="pill">Rituals</span><span class="pill">Concentration</span></div>
  <div class="prep over"><div class="line"><span class="kicker">Prepared</span><b class="num">5 / 4</b></div><div class="bar"><i style="width:100%"></i></div><div class="warn">⚠ One more than you can prepare — the DM will see it</div></div>
  {sec("Cantrips", "3 / 3")}
  <div class="card">{prow("sparkles", 48, "Guidance", True, "<span class='tag'>C</span>")}{prow("fire", 18, "Sacred Flame", True)}{prow("hand", 270, "Thaumaturgy", True)}</div>
  {sec("1st level")}
  <div class="card">{prow("pray", 210, "Bless", True, "<span class='tag'>C</span>")}{prow("heart", 120, "Cure Wounds", True)}{prow("bolt", 205, "Guiding Bolt", True)}{prow("shield", 50, "Shield of Faith", True, "<span class='tag'>C</span>")}{prow("sparkles", 150, "Healing Word", True)}{prow("scroll", 0, "Command", False)}</div>
  <div class="pillrow" style="margin-top:auto"><span class="btn ter">Cancel</span><span class="btn cta" style="flex:2">Save Anyway</span></div>
</div>"""
    return page(body)

def rollcard():
    base = header() + vitals() + f"""
<div class="scroll">
  {sec("Abilities")}
  <div class="abil">{"".join(f'<div class="ab"><div class="kicker">{k}</div><div class="v num">{v}</div><div class="pr"><b>Check</b><b class="sv">Save</b></div></div>' for k, v in [("STR","+3"),("DEX","−1"),("CON","+1"),("INT","+0"),("WIS","+3"),("CHA","+1")])}</div>
</div>""" + tabs("Details")
    sheet = f"""
<div class="veil low">
  <div class="sheet">
    <div class="bar"><span class="kicker gold">{I(FA['d20'])}&nbsp; The DM asks for a roll</span><span class="x">{I(FA['x'])}</span></div>
    <div class="body">
      <div class="ask"><div class="d20">{I(FA['d20'])}</div><div><div class="t num">Wisdom save<span class="dc">DC 13</span></div><div class="s">Haunting Whistle · the Locomotive · frightened on a fail</div></div></div>
      <div class="seg"><b>Disadvantage</b><b class="on">Normal</b><b>Advantage</b></div>
      <span class="btn cta" style="width:100%">{I(FA['d20'])} Roll Wisdom Save</span>
      <div class="hint" style="text-align:center">Your roll lands on the TV and in the chat.</div>
    </div>
  </div>
</div>"""
    return page(base + sheet)

def waiting():
    base = header() + vitals() + f'<div class="scroll">{sec("Abilities")}<div class="abil">{"".join(f"<div class=ab><div class=kicker>{k}</div><div class=\'v num\'>{v}</div><div class=pr><b>Check</b><b class=sv>Save</b></div></div>" for k, v in [("STR","+3"),("DEX","−1"),("CON","+1"),("INT","+0"),("WIS","+3"),("CHA","+1")])}</div></div>' + tabs("Explore")
    modal = f"""
<div class="veil">
  <div class="modal">
    <div class="fa big">&#x{FA['hourglass']};</div>
    <h2>Waiting for the party</h2>
    <p>You're on <b>Passenger Car</b> — the action is on <b>Attic</b>. The DM will bring the scene to you.</p>
    <span class="btn" style="width:100%">{I(FA['book'])} Browse My Sheet</span>
    <div class="hint" style="margin-top:12px"><span class="paused" style="position:static;display:inline-block">&#9646;&#9646; PAUSED</span></div>
  </div>
</div>"""
    return page(base + modal)

# ── TODAY recreations (the shell's own stylesheet + its class names), used where no live capture exists ──
def today_pad():
    # the live Explore tab as the backdrop; the real party pad markup placed where the pad renders, drawn by shell.css
    cells = ""
    import math
    for c in [(-1,-1),(0,-1),(1,-1),(-1,0),None,(1,0),(-1,1),(0,1),(1,1)]:
        if c is None: cells += '<span class="mc-dpad-blank"></span>'; continue
        dx, dy = c; deg = round(math.degrees(math.atan2(dx, -dy)))
        cells += f'<button class="mc-dpad-btn {"mc-dpad-primary" if (dx == 0) != (dy == 0) else ""}"><i class="fas fa-arrow-up" style="transform: rotate({deg}deg)"></i></button>'
    return f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="{FA_CSS}"><link rel="stylesheet" href="{SHELL_CSS}">
<style>html,body{{margin:0;width:375px;height:812px;overflow:hidden;position:relative}} .shot{{position:absolute;left:0;top:0;width:375px;height:812px}}
#mobile-command-shell{{position:absolute;left:0;right:0;top:188px;height:300px;background:#16141a;padding:6px 14px;border-top:1px solid var(--mc-edge);border-bottom:1px solid var(--mc-edge)}}
.mc-party-pad-head{{font-size:12px;color:var(--mc-muted);text-transform:uppercase;letter-spacing:.08em;margin:4px 2px}}
.mc-use-row{{display:flex;align-items:center;gap:10px;margin-top:6px;padding:10px 12px;background:var(--mc-panel);border:1px solid var(--mc-edge);border-radius:calc(10px * var(--mc-round,1));font-size:14px}}
.mc-use-row .mc-btn{{margin-left:auto;background:var(--mc-primary);border:1px solid var(--mc-primary-edge);color:var(--mc-ink);border-radius:8px;padding:8px 12px;font-weight:700;font-size:13px}}</style></head>
<body><img class="shot" src="today-explore.jpg"><div id="mobile-command-shell"><div class="mc-party-pad-head"><i class="fas fa-route"></i> Move</div><div class="mc-move-note mc-move-green">30 ft</div><div class="mc-dpad">{cells}</div>
<div class="mc-use-row"><i class="fas fa-hand-fist" style="color:var(--mc-gold)"></i><span>Forward door · 5 ft</span><button class="mc-btn">Use</button></div></div>
<div style="position:absolute;left:0;top:488px;width:375px;height:324px;overflow:hidden"><img src="today-explore.jpg" style="position:absolute;left:0;top:-488px;width:375px"></div></body></html>"""

def today_roll():
    return f"""<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="{FA_CSS}"><link rel="stylesheet" href="{SHELL_CSS}">
<style>html,body{{margin:0;width:375px;height:812px;overflow:hidden;position:relative}} .shot{{position:absolute;left:0;top:0;width:375px;height:812px}}
#mobile-command-shell{{position:absolute;inset:0;background:transparent}} .mc-saveprompt{{position:absolute}}</style></head>
<body><img class="shot" src="today-details.jpg"><div id="mobile-command-shell"><div class="mc-saveprompt mc-rollreq">
<div class="mc-saveprompt-bar"><span class="mc-saveprompt-title"><i class="fas fa-dice-d20"></i> The DM asks for a roll</span><button class="mc-saveprompt-x" aria-label="Dismiss"><i class="fas fa-xmark"></i></button></div>
<div class="mc-saveprompt-body"><div class="mc-saveprompt-btns"><button class="mc-save-roll">Roll Wisdom save (DC 13)</button></div></div></div></div></body></html>"""

SCREENS = [
    ("01-explore-move", "Home / Explore — the move pad and the hand", explore, "today-pad.html", "TODAY · pad recreated from the shell's own CSS (no token on the live scene)"),
    ("02-actions", "Act — actions and attacks", actions, "today-actions.jpg", "TODAY (live, Player4 · Test Cleric)"),
    ("03-sheet", "Sheet — abilities and skills", details, "today-details.jpg", "TODAY (live)"),
    ("04-bag", "Bag — equipment", gear, "today-equipment.jpg", "TODAY (live)"),
    ("05-spells", "Spells tab", spells, "today-spells.jpg", "TODAY (live)"),
    ("06-prepare", "Prepare spells (built 2026-11-13)", prepare, "today-prepare-render.png", "TODAY (the built screen, from its 13 Nov render)"),
    ("07-roll-request", "A roll request from the DM", rollcard, "today-roll.html", "TODAY · card recreated from the shell's own CSS"),
    ("08-waiting", "Waiting / paused card", waiting, "today-waiting.jpg", "TODAY (live)"),
]

def render(html_path: Path, png_path: Path):
    cmd = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--allow-file-access-from-files",
           "--window-size=375,812", "--force-device-scale-factor=2", "--virtual-time-budget=2500",
           f"--user-data-dir={PROFILE}", f"--screenshot={png_path}", html_path.as_uri()]
    subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    assert png_path.exists(), f"no render for {html_path.name}"

def load_today(src: str) -> Image.Image:
    p = HERE / src if src.endswith(".html") else OUT / src
    if src.endswith(".html"):
        png = HERE / (src[:-5] + ".png"); render(p, png); im = Image.open(png).convert("RGB")
    else:
        im = Image.open(p).convert("RGB")
        if src.endswith(".png") and im.width == 440:   # the deck lane's phone-frame render: crop the frame + caption
            im = im.crop((22, 12, 418, 882))
        elif im.width == 375:
            im = im.crop((1, 1, 374, 811))              # the pane's 1px blue focus ring
    return im.resize((750, 1624), Image.LANCZOS)

def compose(key, title, prop_png, today_im, today_label):
    prop = Image.open(prop_png).convert("RGB")
    W, H, pad, top = 750, 1624, 40, 110
    canvas = Image.new("RGB", (W * 2 + pad * 3, H + top + pad), "#0b0b0d")
    d = ImageDraw.Draw(canvas)
    try:
        f1 = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 34); f2 = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
    except Exception:
        f1 = f2 = ImageFont.load_default()
    d.text((pad, 24), title, fill="#f1e9d8", font=f1)
    d.text((pad, 72), today_label, fill="#9a9284", font=f2)
    d.text((pad * 2 + W, 72), "PROPOSED · VE-Mobile-leaning dark style (mockup, not built)", fill="#d2a94c", font=f2)
    canvas.paste(today_im, (pad, top)); canvas.paste(prop, (pad * 2 + W, top))
    for x in (pad, pad * 2 + W):
        d.rounded_rectangle((x - 2, top - 2, x + W + 1, top + H + 1), radius=18, outline="#2a2a30", width=2)
    canvas.save(OUT / f"vemobile-{key}.png", optimize=True)

if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    # copy today's live shots next to the html so the recreations can use them as backdrops
    for f in ("today-explore.jpg", "today-details.jpg"):
        (HERE / f).write_bytes((OUT / f).read_bytes())
    (HERE / "today-pad.html").write_text(today_pad(), encoding="utf-8")
    (HERE / "today-roll.html").write_text(today_roll(), encoding="utf-8")
    for key, title, fn, today_src, today_label in SCREENS:
        hp = HERE / f"p-{key}.html"; hp.write_text(fn(), encoding="utf-8")
        png = HERE / f"p-{key}.png"; render(hp, png)
        compose(key, title, png, load_today(today_src), today_label)
        print("wrote vemobile-" + key)
