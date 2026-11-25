/** Sheets 03-07. Run through sheets.mjs (it imports this file). Mockups only: nothing here is module code. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import * as P from "./parts.mjs";
const { i, page, PCS, who, btn, drawer, stub, work, panel, key, tile, deck, BOTTOM, whenTile, phone, pbarTabs } = P;
const SRC = path.dirname(fileURLToPath(import.meta.url));
const out = (name, html) => { fs.writeFileSync(path.join(SRC, name), html); console.log("sheet", name); };

// ---------- shared proposed pieces ----------
export const chipCast = `<div class="chip viol"><div class="t">${i("wand-sparkles", "color:#b6a2f2")} Wizard — Fireball · 3rd</div><div class="fx">${btn("Dismiss", "mini ghost")}<span class="grow"></span>${btn("Place on map", "mini viol")}</div></div>`;
export const chipTravel = `<div class="chip viol"><div class="t">${who("Rogue", "#5fbf7f")} wants to cross</div><div class="s">Dining Car · game paused</div><div class="fx">${btn("Cancel", "mini ghost")}<span class="grow"></span>${btn("Move Rogue", "mini")}${btn("Move Group", "mini viol")}</div></div>`;
export const chipTwist = `<div class="chip viol"><div class="t">${who("Cleric", "#5b7fd6")} twists fate · natural 20</div><div class="fx">${btn("Keep It", "mini ghost")}<span class="grow"></span>${btn("Spend It", "mini viol")}</div></div>`;
const onDeck = (what) => stub(`<b>On the deck:</b> ${what}`);

// =====================================================================================
// 03 — with the deck: the panel's four states
// =====================================================================================
{
  const rest = panel(P.newFloor("deck"), P.NEW_TABS(-1, { deck: [0], dim: [0], badges: { 5: 2 } }));
  const waiting = panel(P.newFloor("deck", { waiting: chipTravel, more: 2 }), P.NEW_TABS(-1, { deck: [0], dim: [0] }));
  const summoned = panel(P.newFloor("deck"), P.NEW_TABS(4, { deck: [0], dim: [0] }),
    work("Story", `${drawer("Séance", `<div class="fx">${btn(i("ghost") + " Spirit Board", "on grow")}</div>
      <div class="fx">${PCS.slice(0, 3).map(([n], k) => btn(n, k < 2 ? "on mini" : "mini")).join("")}</div>
      <div class="fx"><span class="inp focus">the door was never locked|</span>${btn(i("hand"), "sq")}</div>
      <div class="hint">Enter sends. The deck has four set words; anything else is typed here.</div>
      ${onDeck("Spirit board · Ask d10 · The bite")}`)}
      ${drawer("Intros")}${drawer("Chaotic curses")}${drawer("Fated tarot")}`, "opened by the deck"), true);
  const onNow = panel(P.newFloor("deck", { now: { tv: "held by intro", tvWarn: true } }), P.NEW_TABS(-1, { deck: [0], dim: [0] }),
    work("On now", `
      <div class="st"><span>Game</span><span class="w">Paused by an intro ${btn("Resume", "mini")}</span></div>
      <div class="st"><span>Music</span><span>Crooked House<br><small style="color:var(--muted)">room: Front Hall · auto</small></span></div>
      <div class="st"><span>Sound</span><span>TV live · Syrinscape <span class="w">offline, local</span></span></div>
      <div class="st"><span>Weather</span><span>Rain · storm rolling</span></div>
      <div class="st"><span>Light</span><span>Nightfall · follows the clock</span></div>
      <div class="st"><span>TV camera</span><span class="w">Held by the intro</span></div>
      <div class="st"><span>TV shows</span><span>Entrance: The Crooked Man</span></div>
      <div class="st"><span>Reactions</span><span>Mobile Command</span></div>
      <div class="st"><span>Phones</span><span>Basic · 3 of 4 here</span></div>
      <div class="st"><span>Deck</span><span>Reachable · this screen drives</span></div>`, "tap a line to change it"), true);
  out("03-with-deck-panel-states.html", page("With the deck: the panel has four states", 1700, 960, `
  <h1>With the deck: the panel has four states</h1>
  <p class="lede">You do not navigate it. It rests as a strip. It <b>lights up</b> when something waits that the deck cannot answer, the <b>deck opens it</b> at the exact spot when a key needs typing or dragging, and one tap on the status line shows <b>everything automatic</b> and why.</p>
  <div class="row" style="align-items:flex-end;gap:34px">
    <div class="step"><div class="z">${rest}</div><div class="lab">1 · Resting<small>Who is here. Nothing waiting. What the table hears and sees. The Setup tab carries the health count.</small></div></div>
    <div class="step"><div class="z">${waiting}</div><div class="lab">2 · Something waits<small>The same ask is on the deck's Notifications key. Answer on either; the other clears. "+2" is the queue.</small></div></div>
    <div class="step"><div class="z">${summoned}</div><div class="lab">3 · The deck opens it<small>You pressed Séance on the deck. The panel comes forward with the phrase box focused. Works today for this drawer; proposed for every key that needs the keyboard.</small></div></div>
    <div class="step"><div class="z">${onNow}</div><div class="lab">4 · On now<small>New. Eighteen automatic systems report nothing today. Amber means "not what you would expect".</small></div></div>
  </div>`));
}

// =====================================================================================
// 04 — without the deck: today's nine tabs vs the proposed six
// =====================================================================================
{
  const todayTravel = panel(P.todayFloor(), P.TODAY_TABS(4, { 7: 2 }), work("Travel", `
    ${btn(i("square-check") + " Travel map", "on")}
    ${drawer("Switch scene to…", `<span class="inp">Wickermoor Hollow ▾</span><div class="hint">The party is formed up.</div><div class="hint">Press Travel on the deck to go.</div>`)}
    ${drawer("Travel to…", `<div class="g3">${btn("Slow", "mini")}${btn("Normal", "mini on")}${btn("Fast", "mini")}</div><span class="inp">— custom transport — ▾</span>
      <div class="hint">Driven from the deck — Travel, Draw road, Go, Stop.</div>`)}`), true);
  const newTime = panel(P.newFloor("panel"), P.NEW_TABS(3, { badges: { 5: 2 } }), work("Time", `
    ${drawer("Clock", `<div class="fx"><b style="font-family:Modesto;font-size:17px">Nightfall · 21:40</b><span class="grow"></span>${btn("Set", "mini")}</div><div class="g3">${btn("+10 min", "mini")}${btn("+1 hour", "mini")}${btn("+1 night", "mini")}</div>`)}
    ${drawer("Travel", `<div class="g4">${btn("Travel", "mini cta")}${btn("Draw", "mini")}${btn("Go", "mini off")}${btn("Stop", "mini off")}</div>
      <div class="g3">${btn("Slow", "mini")}${btn("Normal", "mini on")}${btn("Fast", "mini")}</div><div class="hint">Wickermoor Hollow · draw a road first</div>`)}
    ${drawer("Rest", `<div class="g2">${btn("Short", "mini")}${btn("Long", "mini on")}</div><div class="g2">${btn(i("square-check") + " Activities", "mini on")}${btn(i("square-check") + " Watches", "mini on")}</div>${btn("Start Rest", "cta")}`)}`), true);
  out("04-without-deck-today-vs-proposed.html", page("Without the deck: nine tabs become six", 1640, 1130, `
  <h1>Without the deck: nine tabs become six, and nothing is deck-only</h1>
  <p class="lede">A DM running from the panel alone. The six sections are the same six, in the same order, as with the deck. Here they are all full. <b>Today's panel has holes without a deck</b>: travel cannot be started, music cannot be chosen, and one player ask never appears.</p>
  <div class="row" style="gap:40px">
    <div class="col"><span class="tag today">Today · Travel tab</span><div class="z">${todayTravel}</div>
      <ol class="keylist" style="max-width:500px">
        <li><span class="n t">1</span><span>The Travel, Draw road, Go and Stop buttons were removed on 18 Oct. The tab says <b>"Press Travel on the deck"</b>. No deck, no travel.</span></li>
        <li><span class="n t">2</span><span>Music picks (Auto, Battle, Next, Silence, moods) and overall volume have <b>no panel control</b> at all.</span></li>
        <li><span class="n t">3</span><span>"One hero went ahead: Stay / Follow" shows on the deck only.</span></li>
        <li><span class="n t">4</span><span>Rest, Travel and the clock are three places that all move time.</span></li>
      </ol></div>
    <div class="col"><span class="tag prop">Proposed · no deck · Time section</span><div class="z">${newTime}</div>
      <ol class="keylist" style="max-width:500px">
        <li><span class="n">1</span><span><b>Fight · Party · Stage · Time · Story · Setup.</b> Time holds everything that moves the clock: the clock, travel, rest.</span></li>
        <li><span class="n">2</span><span>Travel's four verbs are <b>back as buttons</b>. They call the same actions the deck keys call.</span></li>
        <li><span class="n">3</span><span>The floor keeps <b>Frame</b> and <b>Manual</b> here, because there is no Camera key to press.</span></li>
        <li><span class="n">4</span><span>The pill reads <b>No deck</b>. If a deck becomes reachable it offers to shrink; it never shrinks by itself.</span></li>
      </ol></div>
    <div class="col" style="max-width:330px"><div class="card"><h3>Nine → six</h3>
      <table class="map"><tr><th>Today</th><th>Proposed</th></tr>
      <tr><td>Combat</td><td><b>Fight</b></td></tr><tr><td>Party</td><td><b>Party</b></td></tr>
      <tr><td>Display<br>Effects<br>Settings › Sound</td><td><b>Stage</b><br><span class="note">what the table sees and hears</span></td></tr>
      <tr><td>Rest<br>Travel<br>floor clock</td><td><b>Time</b></td></tr>
      <tr><td>Crooked Moon<br>Party › story drawers</td><td><b>Story</b></td></tr>
      <tr><td>Settings<br>System health<br>Party › Players</td><td><b>Setup</b></td></tr></table></div></div>
  </div>`));
}

// =====================================================================================
// 05 — the six sections, full and with the deck (nothing is lost)
// =====================================================================================
{
  const L = (rows) => `<ul class="lst">${rows.map(r => typeof r === "string" ? `<li class="hd">${r}</li>` : `<li class="${r[1] || ""}">${i(r[1] === "dk" ? "table-cells" : r[1] === "nw" ? "plus" : "circle")}<span>${r[0]}</span></li>`).join("")}</ul>`;
  const S = [
    ["Fight", "dice-d20", [["Ask rolls: save, check, initiative", "dk"], ["Send targets to a player"], ["Battle track pick"], ["Roll NPCs · Start", "dk"], ["Next turn · End fight", "dk"], ["Previous turn"], ["Boss intro: Play", "dk"]]],
    ["Party", "users", [["Form Up · Disperse"], ["Create party · choose members"], ["Marching order grid"], ["Rotate · Lock In"], ["Release · Combine a scout"], ["A player's tokens: drag to map"], ["Message a player"]]],
    ["Stage", "masks-theater", ["Camera", ["Frame · Manual · Fit · Zoom", "dk"], ["Who the TV follows"], "Sound", ["Music: Auto · Battle · Next · Silence", "dk"], ["Louder · Quieter", "dk"], ["Mute the table · TV volumes"], ["Who the TV hears through"], ["Loudness sliders"], "Effects", ["Weather ×10 · Lightning · Doom Bell"], ["Visions ×4"], ["One player: Heartbeat · Woozy · Static"]]],
    ["Time", "hourglass-half", ["Clock", ["+10 min · +1 hour · +1 night", "dk"], ["Set the time"], "Travel", ["Travel · Go", "dk"], ["Draw road · Stop"], ["Pace · custom transports"], "Rest", ["Short · Long · Start Rest"], ["Watches grid · Pass Watch"], ["Activities · rules · Push · Tick"], ["Finish · Cancel"]]],
    ["Story", "moon", [["Intros (94) · Stop Intro", "dk"], ["Story questions"], ["Session zero · card table"], ["Character files"], "Crooked Moon", ["Séance board · set words", "dk"], ["Séance phrase · sitters · d10 · bite"], ["Tarot: Deal", "dk"], ["Tarot: next card · take back"], ["Start ride", "dk"], ["Curses · Bargains"], ["Fateweaving · Twists"], ["Druskenvald hour"], ["All aboard · Boarding"], ["The house: Teddy · Weasels", "nw"]]],
    ["Setup", "gear", [["Health checks · fixes"], ["Setup Wizard · feedback"], ["Players · seats · colours"], ["This table: in person / online"], ["Phones: Basic / Complex"], ["Run from: Auto · Deck · Panel", "nw"], ["TV account · fog · vision"], ["Sound rules · combat playlist"], ["Per-hero themes · bosses"], ["Travel maps · daylight"], ["All Settings"]]],
  ];
  out("05-six-sections-both-modes.html", page("The six sections in both modes", 1700, 800, `
  <h1>The six sections: what each holds, and what the deck takes over</h1>
  <p class="lede">One list per section, the same in both modes. <b>Without the deck every line is a live control.</b> With the deck, the grey lines fold into one "On the deck" stub per group, with <b>Show</b> to bring them back. Nothing is removed in either mode.</p>
  <div class="legend"><span>${i("circle", "color:#a59b86;font-size:9px")}A panel control in both modes</span><span>${i("table-cells", "color:#77717f")}The deck has a key for it: folds away while the deck is reachable</span><span>${i("plus", "color:#6fd0c4")}New panel control for something that exists only as an action today</span></div>
  <div class="row" style="gap:14px;align-items:stretch">
  ${S.map(([n, ic, rows]) => `<div class="card" style="flex:1;padding:12px 13px"><h3 style="font-size:19px">${i(ic, "color:#c8a44d;font-size:15px;margin-right:6px")}${n}</h3><div style="zoom:1.18">${L(rows)}</div></div>`).join("")}
  </div>
  <div class="row" style="margin-top:20px;gap:24px;align-items:flex-start">
    <div class="card" style="flex:1"><h3>On the floor, always <small>both modes</small></h3><div class="note"><b>Who is here</b> · <b>Waiting</b> (every ask, one queue) · <b>On now</b> (music, weather, hour, TV) · <b>Damage / Heal</b> by a typed number · the <b>deck pill</b>. Without the deck the floor also carries <b>Frame</b> and <b>Manual</b>.</div></div>
    <div class="card" style="flex:1"><h3>How this differs from October's deck mode</h3><div class="note">October's version only hid buttons, and after you kept Camera, Party and Combat it hid nothing. This one <b>regroups first</b> (worth having with no deck at all), follows whether the deck is <b>reachable</b>, keeps every folded group <b>one tap away</b>, and comes back by itself the moment the deck drops.</div></div>
  </div>`));
}

// =====================================================================================
// 06 — choosing and switching the mode
// =====================================================================================
{
  const f = (pill, extra = {}) => `<div class="z">${panel(P.newFloor(extra.mode || "deck", { pill, ...extra }), P.NEW_TABS(-1, extra.mode === "panel" ? {} : { deck: [0], dim: [0] }))}</div>`;
  out("06-mode-switch.html", page("Choosing and switching the mode", 1700, 690, `
  <h1>The mode follows the deck. Growing is automatic; shrinking is offered.</h1>
  <p class="lede">Your rule of 13 Oct: the trigger is the <b>deck being reachable</b>, not the module being installed. An unplugged deck, the office PC and a stopped service are all the same state. The panel must never take a control away while your hand is on it.</p>
  <div class="row" style="align-items:flex-end;gap:22px">
    <div class="step">${f("live")}<div class="lab">1 · Deck reachable<small>Compact panel. Green pill. Tap the pill to see the full panel for now.</small></div></div>
    <div class="arrow">${i("arrow-right")}</div>
    <div class="step">${f("lost", { mode: "panel" })}<div class="lab">2 · Deck drops mid-session<small>The full panel is back within a moment, on the same six tabs. One toast: "Deck lost. Full panel." Frame and Manual return to the floor.</small></div></div>
    <div class="arrow">${i("arrow-right")}</div>
    <div class="step">${f("back", { mode: "panel" })}<div class="lab">3 · Deck returns<small>Nothing moves. The pill asks "Shrink?". You tap it when your hand is free.</small></div></div>
    <div class="arrow">${i("arrow-right")}</div>
    <div class="step">${f("held", { mode: "panel" })}<div class="lab">4 · You want both<small>Deck reachable, full panel kept. Stays until you tap the pill again or reload.</small></div></div>
  </div>
  <div class="row" style="margin-top:26px;gap:24px">
    <div class="card" style="flex:1"><h3>One setting <small>Setup › This table</small></h3><div class="note"><b>Run from: Auto · Deck · Panel.</b> Auto is the default. "Deck" forces the compact panel (a rehearsal with the deck unplugged). "Panel" never shrinks.</div></div>
    <div class="card" style="flex:1"><h3>What the players and the TV see</h3><div class="note"><b>Nothing.</b> Phones and the TV behave the same in both modes. The mode is about which instrument your hands are on.</div></div>
    <div class="card" style="flex:1"><h3>What it needs</h3><div class="note">Deck Command knows whether the deck is reachable but does not publish it. One small addition there (a status and a "changed" signal). Until then the pill is a <b>manual switch</b>, which is the cheap first step.</div></div>
  </div>`));
}

// =====================================================================================
// 07 — everything waiting on the DM: seven places today, one queue proposed
// =====================================================================================
{
  const places = [["Floor chips", "travel · scribe · summon · trade · opportunity attack"], ["Inside the Combat tab", "area spell or summon to place · split party"], ["Inside Crooked Moon › Curses", "a bargain to strike"], ["Inside Crooked Moon › Twists", "a twist to spend"], ["A popup dialog", "the same twist, again · night ambush"], ["The deck only", "one hero went ahead · Maim"], ["A tab badge", "the only sign of a cast when Combat is closed"]];
  const askDeck = deck(
    [key({ dark: 1 }), key({ dark: 1 }), key({ dark: 1 }), key({ dark: 1 }), key({ dark: 1 })],
    [key({ dark: 1 }), key({ g: "xmark", l: "Cancel", c: "grey" }), key({ g: "person-walking", l: "Move Rogue", cls: "vfull" }), key({ g: "people-group", l: "Move Group", cls: "vfull" }), key({ dark: 1 })],
    BOTTOM({ bell: key({ g: "bell", l: "Notifications", sub: "3 waiting", cls: "vfull" }) }),
    [tile(`<b>Rogue</b>asks`, "v"), tile(`wants to cross<br><b>Dining Car</b>`, "v"), whenTile()]);
  const pnl = panel(P.newFloor("deck", { waiting: chipTravel + `<div style="height:4px"></div>` + chipCast + `<div style="height:4px"></div>` + chipTwist }), P.NEW_TABS(-1, { deck: [0], dim: [0] }));
  const ph = phone({ name: "Test Rogue", body: `<div class="pbar">Asked</div>
    <div class="pcard viol"><b>Crossing to the Dining Car</b><div style="color:var(--muted);font-size:11.5px;margin-top:3px">${i("hourglass-half")} Waiting for the DM</div></div>
    <div class="pcard"><b>Dexterity save</b><div style="color:var(--muted);font-size:11.5px;margin:3px 0 7px">The DM asks for a roll</div><div class="pbtn cta">Roll Save</div></div>
    <div class="pcard" style="opacity:.6"><b>Story question</b><div style="color:var(--muted);font-size:11.5px;margin-top:3px">Parked · answer when you like</div></div>`,
    hdRight: `<div style="width:34px;height:34px;border-radius:50%;border:1px solid #8a6fd8;display:flex;align-items:center;justify-content:center;color:#b6a2f2;position:relative">${i("bell")}<span style="position:absolute;top:-4px;right:-4px;background:#7a5fd6;color:#fff;border-radius:8px;font-size:10px;padding:0 5px;font-weight:700">2</span></div>`,
    bar: pbarTabs([["hand-fist", "Act"], ["user", "Sheet"], ["compass", "Play"], ["suitcase", "Bag"], ["feather", "Story"], ["moon", "Moon"]], 2) });
  out("07-waiting-one-queue.html", page("Everything waiting: one queue", 1700, 1120, `
  <h1>Everything waiting on you: seven places today, one queue proposed</h1>
  <p class="lede">An ask is the one thing that must never be missed. Today it can sit inside a closed tab. Proposed: <b>one queue with two doors</b> (the panel floor and the deck's Notifications key) and its mirror on the player's phone. Violet means "a player is waiting" on all three.</p>
  <div class="row" style="gap:30px">
    <div class="col" style="width:400px"><span class="tag today">Today · where an ask can appear</span>
      <div class="card"><ol class="keylist">${places.map(([a, b], k) => `<li><span class="n t">${k + 1}</span><span><b>${a}</b><br>${b}</span></li>`).join("")}</ol></div>
      <div class="note" style="max-width:400px">The phone has the same problem in reverse: a prompt that is dismissed or times out cannot be reopened, and "waiting for the DM" is a line under the move pad.</div></div>
    <div class="col"><span class="tag prop">Proposed · the DM's panel</span><div class="zz">${pnl}</div>
      <div class="note" style="max-width:420px"><b>A crossing first</b> (the game is paused for it), then by age. Three show; the rest are a count. Opportunity attacks jump the queue because their window is seconds.</div></div>
    <div class="col"><span class="tag dkt">The deck · same queue</span>${askDeck}
      <div class="note" style="max-width:480px">Unchanged for crossings. <b>New on this key:</b> twists, bargains, and "place a spell" (the key brings the panel forward; the click happens on the map). Opportunity attacks stay off the deck, as ruled.</div>
      <span class="tag prop" style="margin-top:10px">Proposed · the player's phone</span><div style="zoom:.82">${ph}</div></div>
  </div>`));
}
