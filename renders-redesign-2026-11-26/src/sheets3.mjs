/** Sheets 01, 08, 09, 10. Run through sheets.mjs (it imports this file). Mockups only: nothing here is module code. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import * as P from "./parts.mjs";
const { i, page, PCS, who, btn, drawer, stub, work, panel, key, tile, deck, BOTTOM, partyTile, whenTile, phone, pbarTabs } = P;
const SRC = path.dirname(fileURLToPath(import.meta.url));
const out = (name, html) => { fs.writeFileSync(path.join(SRC, name), html); console.log("sheet", name); };

// =====================================================================================
// 01 — who owns what
// =====================================================================================
{
  const cell = (html, hot) => `<div class="cell ${hot ? "hot" : ""}">${html}</div>`;
  out("01-who-owns-what.html", page("Who owns what", 1640, 620, `
  <h1>Four surfaces, one job each</h1>
  <p class="lede">Your line from September: <b>"the deck is hands, MC's panel is eyes."</b> The redesign takes that literally. The mode only changes the two DM surfaces. <b>Players and the TV never see which mode you are in.</b></p>
  <div class="own">
    <div></div>
    <div class="hd">${i("table-cells", "color:#cfd2da;font-size:16px;margin-right:8px")}The deck<small>hands · one press</small></div>
    <div class="hd">${i("window-maximize", "color:#c8a44d;font-size:16px;margin-right:8px")}The DM panel<small>eyes, keyboard, mouse</small></div>
    <div class="hd">${i("mobile-screen", "color:#5b7fd6;font-size:16px;margin-right:8px")}The phone<small>one player, their own hero</small></div>
    <div class="hd">${i("tv", "color:#8fd6a8;font-size:16px;margin-right:8px")}The TV<small>the shared picture</small></div>

    <div class="mode">With the deck<small>the deck is reachable</small></div>
    ${cell(`<b>Runs the moment.</b><ul><li>Rooms, creatures, reveals</li><li>The whole fight</li><li>Camera, music, pause</li><li>Time steps, travel, group up</li><li>Asks a roll; answers player asks</li></ul>`, 1)}
    ${cell(`<b>A strip you glance at, and a desk.</b><ul><li>Who is here · what is waiting · what is on</li><li>Anything typed, dragged or drawn</li><li>Long lists (100 curses, 94 intros)</li><li>Rest, marching order, mixes</li><li>Setup and health</li></ul>`, 1)}
    ${cell(`<b>Same as without.</b><ul><li>Acts, rolls, moves, casts</li><li>Answers what the DM asks</li><li>Sees what it has asked and is waiting on</li></ul>`)}
    ${cell(`<b>Same as without.</b><ul><li>The map through the party's eyes</li><li>Dice, intros, weather, the fight order</li><li>No controls, no status, no toasts</li></ul>`)}

    <div class="mode">Without the deck<small>unplugged, another PC, service stopped, or no DC</small></div>
    ${cell(`<span style="color:#77717f">Dark. Nothing depends on it.</span>`)}
    ${cell(`<b>The whole cockpit.</b><ul><li>The same strip</li><li>The same six sections, all full</li><li>Buttons return for everything that is deck-only today: travel, music picks, volume, time steps</li></ul>`, 1)}
    ${cell(`<b>Same.</b>`)}
    ${cell(`<b>Same.</b>`)}

    <div class="mode">Owns<small>the one thing only it can do</small></div>
    ${cell(`<b>Speed without looking.</b> Fixed places, one press, a guess at the next action.`)}
    ${cell(`<b>Words, positions, shapes, numbers, mixes</b>, and the truth about what is running.`)}
    ${cell(`<b>The player's own rolls.</b> Players always roll their own; nobody else's surface rolls for them.`)}
    ${cell(`<b>What everyone sees at once.</b> Never a secret, never a control.`)}
  </div>`));
}

// =====================================================================================
// 08 — the player's phone, today vs proposed
// =====================================================================================
{
  const pad = `<div style="display:grid;grid-template-columns:repeat(3,46px);gap:6px;justify-content:center;margin:2px 0">${["arrow-up-left", "arrow-up", "arrow-up-right", "arrow-left", "hand", "arrow-right", "arrow-down-left", "arrow-down", "arrow-down-right"].map((n, k) => `<div class="pbtn ${k === 4 ? "" : "pri"}" style="height:46px${k === 4 ? ";border-color:var(--gold);color:var(--gold)" : ""}">${i(n.replace("arrow-up-left", "arrow-up").replace("arrow-up-right", "arrow-up").replace("arrow-down-left", "arrow-down").replace("arrow-down-right", "arrow-down"), k === 0 ? "transform:rotate(-45deg)" : k === 2 ? "transform:rotate(45deg)" : k === 6 ? "transform:rotate(45deg)" : k === 8 ? "transform:rotate(-45deg)" : "")}</div>`).join("")}</div>`;
  const hdTools = (bell) => `<div style="display:flex;gap:5px">${["envelope", "dice-d20", "star"].map(n => `<div style="width:26px;height:26px;border-radius:50%;border:1px solid var(--edge);display:flex;align-items:center;justify-content:center;font-size:11px;color:#cfc8ba">${i(n)}</div>`).join("")}${bell}</div>`;
  const today = phone({ hdRight: hdTools(`<div style="width:26px;height:26px;border-radius:50%;border:1px solid var(--edge);display:flex;align-items:center;justify-content:center;font-size:11px;color:#5d5866">${i("bell")}</div>`),
    body: `<div class="g4" style="font-size:10px;color:var(--muted);text-align:center">${["Init +0", "Hit Dice 1/1", "Speed 25", "Prof +2"].map(t => `<div class="pcard" style="padding:5px 2px">${t}</div>`).join("")}</div>${pad}
      <div class="note" style="font-size:11px;text-align:center">Waiting for the DM…</div>
      <div class="pbar">Favorites</div><div class="note" style="font-size:11.5px">No favorites yet — tap the bookmark in Actions to pin one.</div>
      <div class="pbar">Abilities</div><div class="g2">${["STR +3", "DEX −1"].map(t => `<div class="pcard"><b>${t}</b><div class="g2" style="margin-top:6px"><div class="pbtn" style="height:30px;font-size:11.5px">Check</div><div class="pbtn pri" style="height:30px;font-size:11.5px">Save</div></div></div>`).join("")}</div>`,
    bar: pbarTabs([["hand-fist"], ["user"], ["wand-sparkles"], ["compass"], ["suitcase"], ["feather"], ["moon"]], 3) });
  const bellOn = `<div style="width:26px;height:26px;border-radius:50%;border:1px solid #8a6fd8;display:flex;align-items:center;justify-content:center;font-size:11px;color:#b6a2f2;position:relative">${i("bell")}<span style="position:absolute;top:-5px;right:-5px;background:#7a5fd6;color:#fff;border-radius:8px;font-size:9px;padding:0 4px;font-weight:700">1</span></div>`;
  const NEWBAR = (on) => pbarTabs([["hand-fist", "Act"], ["user", "Sheet"], ["compass", "Play"], ["suitcase", "Bag"], ["feather", "Story"], ["moon", "Moon"]], on);
  const play = phone({ hdRight: hdTools(bellOn),
    strip: `<div style="margin:8px 11px 0" class="pcard viol"><div style="display:flex;justify-content:space-between;align-items:center"><span><b>Crossing to the Dining Car</b><br><span style="color:var(--muted);font-size:11px">${i("hourglass-half")} Waiting for the DM</span></span>${i("chevron-right", "color:#b6a2f2")}</div></div>`,
    body: `${pad}<div class="prow"><div class="ic" style="background:#3a2f22"></div><div style="flex:1">Door<small>Dining Car · 5 ft</small></div><div class="pbtn" style="height:28px;padding:0 10px;font-size:11.5px">Use</div></div>
      <div class="pbar">Favorites</div><div class="prow"><div class="ic"></div><div>Sacred Flame<small>Cast · DEX save</small></div></div>
      <div class="g2"><div class="pbtn">Short Rest</div><div class="pbtn">Long Rest</div></div>`,
    bar: NEWBAR(2) });
  const act = phone({ hdRight: hdTools(bellOn),
    body: `<div style="display:flex;border:1px solid var(--edge);border-radius:9px;overflow:hidden;font-size:12.5px;font-weight:700"><div style="flex:1;text-align:center;padding:7px;background:var(--panel2);color:var(--gold)">Ready</div><div style="flex:1;text-align:center;padding:7px;color:var(--muted)">Spellbook</div></div>
      <div class="pbar">Actions</div>
      ${[["Mace", "Attack · +5"], ["Sacred Flame", "Cast · cantrip"], ["Bless", "Cast · 1st · 2 slots"], ["Cure Wounds", "Heal · 1st"]].map(([a, b]) => `<div class="prow"><div class="ic"></div><div>${a}<small>${b}</small></div></div>`).join("")}
      <div class="pbar">Bonus actions</div><div class="prow"><div class="ic"></div><div>Healing Word<small>Heal · 1st</small></div></div>`,
    bar: NEWBAR(0) });
  out("08-phone-today-vs-proposed.html", page("The phone", 1640, 850, `
  <h1>The player's phone: the same in both modes</h1>
  <p class="lede">The phone does not know or care whether you hold the deck. Its look is already being explored separately (the VE Mobile trial of 13 Nov); this is only about <b>grouping</b> and about its end of the <b>one queue</b>.</p>
  <div class="row" style="gap:36px">
    <div class="col"><span class="tag today">Today · Explore</span>${today}</div>
    <div class="col" style="max-width:270px;padding-top:36px"><ol class="keylist">
      <li><span class="n t">1</span><span><b>Seven icon-only tabs.</b> The labels are tooltips, which a touch screen never shows.</span></li>
      <li><span class="n t">2</span><span>A prompt that is dismissed or times out is <b>gone</b>. The bell only jumps between your own tokens.</span></li>
      <li><span class="n t">3</span><span>"Waiting for the DM…" is a line under the pad. A twist or bargain you asked for lives in the Moon tab.</span></li>
      <li><span class="n t">4</span><span>Theme, full screen and log out sit at the <b>bottom of Details</b>, under every feat.</span></li>
      <li><span class="n t">5</span><span>Spells is a tab even for a fighter ("No spellcasting.").</span></li>
    </ol></div>
    <div class="col"><span class="tag prop">Proposed · Play</span>${play}</div>
    <div class="col"><span class="tag prop">Proposed · Act</span>${act}</div>
    <div class="col" style="max-width:290px;padding-top:36px"><ol class="keylist">
      <li><span class="n">1</span><span><b>Labelled tabs:</b> Act · Sheet · Play · Bag · Story, with the campaign tab at the edge. Play keeps the centre.</span></li>
      <li><span class="n">2</span><span><b>Spells fold into Act</b> as "Ready" and "Spellbook". A non-caster sees no switch.</span></li>
      <li><span class="n">3</span><span><b>The bell becomes "Asked":</b> everything the DM asked of you and everything you asked the DM, with its state. A dismissed prompt can be reopened there.</span></li>
      <li><span class="n">4</span><span>The newest ask also sits <b>above the pad</b> on Play, in violet.</span></li>
      <li><span class="n">5</span><span>Phone settings open from the <b>portrait</b>.</span></li>
      <li><span class="n">6</span><span>Unchanged: every roll is the player's own; Basic still hides the shared-state screens.</span></li>
    </ol></div>
  </div>`));
}

// =====================================================================================
// 09 — the TV
// =====================================================================================
{
  const toks = [[230, 130, "#d9534f"], [268, 152, "#5b7fd6"], [246, 186, "#5fbf7f"], [292, 194, "#c77dff"]].map(([x, y, c]) => `<div class="tok" style="left:${x}px;top:${y}px;border-color:${c}"></div>`).join("");
  const tv = (inner) => `<div class="tv">${inner}<div class="compass">N</div></div>`;
  out("09-tv.html", page("The TV", 1700, 870, `
  <h1>The TV: one picture, the same in both modes</h1>
  <p class="lede">Nothing new appears on the TV and it never shows the mode. What changes is on your side: <b>the TV reports what it is doing</b>, so "why is it black", "why won't it follow" and "is it making sound" are answered on the panel instead of by walking over to look.</p>
  <div class="row" style="gap:26px">
    <div class="col"><span class="tag today">Exploring · unchanged</span>${tv(toks)}<div class="cap">The party's shared view. The camera follows them and holds your zoom.</div></div>
    <div class="col"><span class="tag today">A fight · unchanged</span>${tv(toks + `<div class="tok" style="left:380px;top:140px;border-color:#c8a44d"></div><div class="car">${[0, 1, 2, 3, 4].map(k => `<div class="${k === 1 ? "cur" : ""}"></div>`).join("")}</div>`)}<div class="cap">The fight order appears by itself once the fight has started. The camera pushes in on each turn.</div></div>
    <div class="col"><span class="tag today">Nothing to show · unchanged</span>${tv(`<div class="cardc">${i("eye-slash", "color:#c8a44d;font-size:18px;margin-bottom:6px")}<b>No PCs in scene</b>The map shows through a hero's eyes.</div>`)}<div class="cap">Says so once per scene, and clears itself.</div></div>
  </div>
  <div class="row" style="gap:26px;margin-top:22px;align-items:stretch">
    <div class="card" style="flex:1.1"><h3>New: the TV's lines in On now <small>DM panel, both modes</small></h3>
      <div style="zoom:1.25;max-width:330px">
      <div class="st"><span>TV camera</span><span>Follows the party · your zoom</span></div>
      <div class="st"><span></span><span class="w">Manual · you are driving</span></div>
      <div class="st"><span></span><span class="w">Held by an intro</span></div>
      <div class="st"><span>TV shows</span><span>Fight order · round 2</span></div>
      <div class="st"><span></span><span class="w">"No PCs in scene" card</span></div>
      <div class="st"><span>TV sound</span><span>Live · music 25% · rain 50%</span></div>
      <div class="st"><span></span><span class="w">Never tapped: silent</span></div>
      </div></div>
    <div class="card" style="flex:1"><h3>Who can change the picture</h3><div class="note" style="font-size:14px">
      <b>With the deck:</b> the Camera key (Frame, Fit, Zoom, Manual, a room, a pin), reveals and intros, weather, the ride.<br><br>
      <b>From the panel, both modes:</b> who the TV follows and hears through, mute, the mix.<br><br>
      <b>Without the deck:</b> Frame and Manual on the floor; Fit and Zoom in Stage.<br><br>
      <b>Never:</b> a player's phone, and never a scene the party is not on.</div></div>
    <div class="card" style="flex:1"><h3>Two rough edges this removes</h3><div class="note" style="font-size:14px">
      <b>An intro leaves the game paused</b> and nothing says so (37 of the 94 do). On now shows "Paused by an intro" with Resume.<br><br>
      <b>The TV's volume sliders are reset on every launch</b> while the panel still shows them as yours to set. The sliders say "resets on launch" beside them, with the switch.</div></div>
  </div>`));
}

// =====================================================================================
// 10 — Setup: one place to prepare and check
// =====================================================================================
{
  const setup = panel(P.newFloor("deck"), P.NEW_TABS(5, { deck: [0], dim: [0], badges: { 5: 2 } }), work("Setup", `
    ${drawer("Health", `<div class="rowi"><span>${i("circle-xmark", "color:#ffb4a8")} The shared screen</span>${btn("Fix", "mini")}</div><div class="rowi"><span>${i("triangle-exclamation", "color:#e0b24a")} What the party can see</span>${btn("Sync", "mini")}</div><div class="hint">9 more are fine</div><div class="fx">${btn("Run Again", "mini grow")}${btn("Wizard", "mini grow")}</div>`, "2 to fix")}
    ${drawer("This table", `<div class="g2">${btn("In Person", "mini on")}${btn("Online", "mini")}</div><div class="g2">${btn("Basic", "mini on")}${btn("Complex", "mini")}</div><div class="sec">Run from</div><div class="g3">${btn("Auto", "mini on")}${btn("Deck", "mini")}${btn("Panel", "mini")}</div>`)}
    ${drawer("Players & seats")}${drawer("Screen", null, "TV · fog · vision")}${drawer("Sound", null, "rules · themes")}${drawer("Fights", null, "bosses · reactions")}${drawer("Travel & time")}${drawer("Campaign", null, "Crooked Moon on")}
    ${btn("All Settings", "")}`), true);
  const todayPlaces = [["Settings tab", "TV sound, hears-through, combat music, fog, the campaign switch"], ["System health tab", "11 checks, wizard, feedback"], ["Party tab", "players, seats, colours"], ["Combat tab", "which monsters are bosses, and their sounds"], ["Travel tab", "which map is the travel map, custom transports"], ["Rest tab", "the activity catalogue"], ["The settings window", "4 pages, 29 settings"], ["Foundry's own settings list", "31 more that have no place in MC's window: every sound and music rule, every phone switch, who owns reactions"]];
  out("10-setup.html", page("Setup", 1640, 1040, `
  <h1>Setup: one place to prepare and to check</h1>
  <p class="lede">Before a session you prepare and check; during it you should not need to. Today that work is spread over <b>eight places</b>. Proposed: one section, the last tab, wearing the health count. It is the same in both modes.</p>
  <div class="row" style="gap:40px">
    <div class="col" style="width:470px"><span class="tag today">Today · where setup lives</span>
      <div class="card"><ol class="keylist">${todayPlaces.map(([a, b], k) => `<li><span class="n t">${k + 1}</span><span><b>${a}</b><br>${b}</span></li>`).join("")}</ol></div></div>
    <div class="col"><span class="tag prop">Proposed · Setup</span><div class="z">${setup}</div></div>
    <div class="col" style="max-width:380px;padding-top:36px"><ol class="keylist">
      <li><span class="n">1</span><span><b>Health first.</b> Only what needs fixing is listed, each with its one-tap fix.</span></li>
      <li><span class="n">2</span><span><b>This table</b> holds the three questions everything else reads: in person or online, what phones may change, and which instrument you run from.</span></li>
      <li><span class="n">3</span><span>Each drawer is the short list. <b>All Settings</b> opens the full window, which gains pages for the 31 settings that have none.</span></li>
      <li><span class="n">4</span><span>Authoring moves here from the play tabs: bosses, per-hero themes, travel maps, transports.</span></li>
      <li><span class="n">5</span><span>The activity catalogue stays in Time › Rest, because you edit rules in the middle of a rest.</span></li>
    </ol></div>
  </div>`));
}
