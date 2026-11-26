// THE MOON'S DUE (DM 2026-11-26): a token per twist a player spends, cap 3, kept on the world; spent on a Reroll of an
// NPC roll or a Redirect of a player's natural 1. scripts/moons-due.js (pure parts driven here, the bank on a fake
// world), plus the wiring by source.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-moons-due.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
const REPO = new URL("..", import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, REPO), "utf8");
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const J = JSON.stringify;

// a fake world: settings, a GM, hooks
const store = new Map([["mobile-command.crookedMoonTools", true]]);
const calls = [];
globalThis.Hooks = { callAll: (h) => calls.push(h), on: () => 0, off: () => {} };
globalThis.game = {
  user: { id: "GM", isGM: true }, users: { activeGM: { id: "GM" } },
  settings: { get: (m, k) => { const key = `${m}.${k}`; if (!store.has(key)) throw new Error("unregistered"); return store.get(key); },
    set: async (m, k, v) => { store.set(`${m}.${k}`, v); return v; } },
};
const M = await import(new URL("scripts/moons-due.js", REPO));

/* ── 1–4. the bank ───────────────────────────────────────────────────────────────────────────────────── */
store.set("mobile-command.moonsDue", { count: 0, offer: null });
check("starts empty: 0", M.moonsDue() === 0);
await M.gainMoonsDue(1); await M.gainMoonsDue(1);
check("a twist spent banks one; two spent: 2", M.moonsDue() === 2);
await M.gainMoonsDue(1); await M.gainMoonsDue(1);
check("cap 3: a fourth twist adds nothing", M.moonsDue() === 3 && M.clampDue(9) === 3 && M.clampDue(-2) === 0);
check("the bank is a WORLD setting (it carries over between sessions)",
  /register\(MODULE_ID, "moonsDue", \{\s*scope: "world",\s*config: false,\s*type: Object,\s*default: \{ count: 0, offer: null \}/.test(read("scripts/settings.js")));

/* ── 5. the gain is on the spend, every door ─────────────────────────────────────────────────────────── */
const live = read("scripts/cm-live.js");
const spend = live.slice(live.indexOf("export async function spendTwist(a)"), live.indexOf("export async function refundTwist"));
check("spendTwist (the popup, the floor's Waiting line and the deck all call it) banks one; Keep does not",
  /await a\.unsetFlag\(MODULE_ID, "twistPending"\);\s*await gainMoonsDue\(1\);/.test(spend) && !/gainMoonsDue/.test(live.slice(live.indexOf("export async function refundTwist"), live.indexOf("export async function refundTwist") + 200)));

/* ── 6–12. (a) reroll: which rolls ───────────────────────────────────────────────────────────────────── */
const ok = { hasRolls: true, npc: true, kind: "attack" };
check("an NPC's attack may be rerolled", M.rerollRefusal(ok) === null);
check("never a player's roll", M.rerollRefusal({ ...ok, npc: false }) === "not an NPC's roll");
check("never a death save", M.rerollRefusal({ ...ok, kind: "death" }) === "never a death save");
check("never a Maim roll", M.rerollRefusal({ ...ok, maim: true }) === "never a Maim roll");
check("the same roll never twice: a rerolled roll, and the reroll itself, refuse",
  M.rerollRefusal({ ...ok, rerolled: true }) === "already rerolled" && M.rerollRefusal({ ...ok, isReroll: true }) === "a reroll stands");
check("a message with no roll, or a table draw, refuses", M.rerollRefusal({ ...ok, hasRolls: false }) === "no roll" && M.rerollRefusal({ ...ok, table: true }) === "not a table draw");
check("the deck's word for a roll: 'Goblin Boss · attack 14'", M.rerollLabel({ speaker: "Goblin Boss Prime", kind: "attack", total: 14 }) === "Goblin Boss · attack 14"
  && M.rerollLabel({ speaker: "Ogre", kind: "concentration", total: 9 }) === "Ogre · save 9");

const src = read("scripts/moons-due.js");
const rr = src.slice(src.indexOf("export async function moonReroll"), src.indexOf("/* ── (b) redirect"));
check("the reroll: no token, no reroll; the NEW card stands (posted as its own card); the old one is marked; one token spent",
  /if \(moonsDue\(\) < 1\) return \{ ok: false, reason: "no Moon's Due" \};/.test(rr) && /rolls\.push\(await r\.reroll\(\)\)/.test(rr)
  && /setProperty\(data, `flags\.\$\{MODULE_ID\}\.moonReroll`, msg\.id\)/.test(rr) && /await msg\.setFlag\(MODULE_ID, "moonRerolled", made\.id\);\s*await spendMoon\(\);/.test(rr)
  && !/Math\.max\(|better/.test(rr));

/* ── 14–20. (b) redirect ─────────────────────────────────────────────────────────────────────────────── */
check("a Redirect chance: a player's WEAPON attack, natural 1",
  M.redirectChance({ natural: 1, itemType: "weapon", playerOwned: true }) && !M.redirectChance({ natural: 2, itemType: "weapon", playerOwned: true })
  && !M.redirectChance({ natural: 1, itemType: "spell", playerOwned: true }) && !M.redirectChance({ natural: 1, itemType: "weapon", playerOwned: false }));
check("…not the redirected roll itself (it carries the no-crit mark)", !M.redirectChance({ natural: 1, itemType: "weapon", playerOwned: true, noCrit: true }));
check("reach: melee 5 by default, a reach weapon 10, a bow its long range, a touch nothing to measure",
  M.attackReachFt({}, { melee: true }) === 5 && M.attackReachFt({ reach: 10, units: "ft" }, { melee: true }) === 10
  && M.attackReachFt({ value: 80, long: 320, units: "ft" }) === 320 && M.attackReachFt({ units: "touch" }) === null);
check("the new target: within reach, not at 0 HP, not the attacker",
  M.redirectRefusal({ distanceFt: 5, reachFt: 5 }) === null && /^out of reach/.test(M.redirectRefusal({ distanceFt: 10, reachFt: 5 }))
  && M.redirectRefusal({ hp: 0, distanceFt: 5, reachFt: 5 }) === "that one is at 0 HP" && M.redirectRefusal({ isAttacker: true }) === "not the attacker");
const cheb = (p, q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) / 100 * 5; // 5 ft squares, 100 px
check("…measured nearest square to nearest square: a Large ogre beside the hero is 5 ft, one square farther 10 ft",
  M.nearestDistance({ x: 0, y: 0 }, { x: 100, y: 0, width: 2, height: 2 }, 100, cheb) === 5 && M.nearestDistance({ x: 0, y: 0 }, { x: 200, y: 0, width: 2, height: 2 }, 100, cheb) === 10
  && M.tokenCells({ x: 0, y: 0, width: 2, height: 2 }, 100).length === 4);
const now = 1e12;
check("an offer lives 5 minutes, and not while the DM is picking", M.offerLive({ at: now }, now + 1000) && !M.offerLive({ at: now }, now + M.OFFER_TTL_MS + 1) && !M.offerLive({ at: now, picking: true }, now));
check("the no-crit mark fits only that attack, and lapses", M.redirectArmed({ activityUuid: "A", ts: now }, "A", now) && !M.redirectArmed({ activityUuid: "A", ts: now }, "B", now)
  && !M.redirectArmed({ activityUuid: "A", ts: now }, "A", now + M.REDIRECT_TTL_MS + 1));

store.set("mobile-command.moonsDue", { count: 1, offer: { id: "o1", at: Date.now(), name: "Brekka Stone", actorUuid: "Actor.B" } });
check("an open offer reads while a token is held", M.redirectOffer()?.id === "o1");
store.set("mobile-command.moonsDue", { count: 0, offer: { id: "o1", at: Date.now(), name: "Brekka Stone" } });
check("…and not with none held, nor with the Crooked Moon tools off", M.redirectOffer() === null
  && (store.set("mobile-command.moonsDue", { count: 2, offer: { id: "o1", at: Date.now() } }), store.set("mobile-command.crookedMoonTools", false), M.redirectOffer() === null));
store.set("mobile-command.crookedMoonTools", true);

const rd = src.slice(src.indexOf("export async function startRedirectPick"), src.indexOf("/* ── hooks"));
check("Redirect: the DM clicks (selects or targets) the new target; a wrong pick says why and keeps listening; one minute, then the offer is back",
  /Hooks\.on\("controlToken"/.test(rd) && /Hooks\.on\("targetToken"/.test(rd) && /if \(no\) \{ notifier\.warn\(`Not that one: \$\{no\}\.`\); return; \}/.test(rd) && /PICK_MS\)/.test(rd));
check("…then one token spent, the attacker's no-crit mark on THAT attack, a public line, and the player's phone gets the card aimed at the new target",
  /if \(!\(await spendMoon\(\)\)\)/.test(rd) && /setFlag\(MODULE_ID, REDIRECT_FLAG, \{ activityUuid: o\.activityUuid, targetUuid, ts: Date\.now\(\) \}\)/.test(rd)
  && /ChatMessage\.create\(\{ speaker: \{ alias: "The Moon's Due" \}/.test(rd) && /aooPromptUser\(u\.id, \{ reactorUuid: actor\.uuid, activityUuid: o\.activityUuid, targetUuid,[\s\S]*moon: true/.test(rd));
check("…a hidden target is never named to the table", /const tname = tok\.document\.hidden \? "someone unseen" : tok\.document\.name;/.test(rd));
const hooks = src.slice(src.indexOf("/* ── hooks"), src.indexOf("/* ── the TV's crescent"));
check("the redirected roll can't crit: set before the dialog and on the built rolls; spent by that roll",
  /criticalSuccess = 21/.test(hooks) && /Hooks\.on\("dnd5e\.preRollD20Test"/.test(hooks) && /Hooks\.on\("dnd5e\.postD20TestRollConfiguration"[\s\S]*unsetFlag\(MODULE_ID, REDIRECT_FLAG\)/.test(hooks));
check("a natural 1 on a player's own client reaches the DM over the socket, checked against the real sender",
  /moonSocket\?\.executeAsGM\?\.\("moonNat1", payload\)/.test(hooks) && /this\?\.socketdata\?\.userId/.test(hooks) && /testUserPermission\?\.\(from, "OWNER"\)/.test(hooks));
check("both of dnd5e's attack hooks, one offer per roll", /Hooks\.on\("dnd5e\.rollAttack", onAttackRolled\);\s*Hooks\.on\("dnd5e\.rollAttackV2", onAttackRolled\);/.test(hooks) && /seenRolls\.has\(roll\)/.test(hooks));
check("a picked roll: the chat log's right-click on the DM's screen, in Foundry 14's entry shape",
  /Hooks\.on\("getChatMessageContextOptions", \(_app, options\) => \{ options\.push\(moonMenuEntry\(\)\); \}\)/.test(src)
  && /visible: \(li\) => \{ try \{ return game\.user\.isGM && toolsOn\(\) && moonsDue\(\) > 0 && !rerollRefusal/.test(src) && /onClick: \(_event, li\) =>/.test(src)
  && !/getChatLogEntryContext|condition: \(li\)|callback: \(li\)/.test(src));

/* ── the queue, the deck, the phone, the TV, On now ───────────────────────────────────────────────────── */
const asks = read("scripts/actions-asks.js");
check("Waiting / Notifications: 'Brekka rolled a 1 · Moon's Due', Let it be (the way out) · Redirect",
  /redirect: \{\s*icon: "moon",\s*sub: \(e\) => `\$\{first\(e\.name\)\} rolled a 1 · Moon's Due`,\s*choices: \(\) => \[\{ id: "cancel", label: "Let it be" \}, \{ id: "redirect", label: "Redirect" \}\]/.test(asks)
  && /redirect: \(\) => \{ const o = redirectOffer\(\);/.test(asks));
const acts = read("scripts/actions-moon.js");
check("the deck's two keys: Reroll (a pick of the last NPC rolls, newest by default) and Redirect (live with an offer), Crooked Moon only",
  /id: "moon\.reroll", area: "combat", group: "Moon's Due", label: "Reroll", icon: "dice", kind: "pick", cm: true/.test(acts) && /run: \(\{ choice \} = \{\}\) => moonReroll\(choice \?\? null\)/.test(acts)
  && /id: "moon\.redirect", area: "combat", group: "Moon's Due", label: "Redirect", icon: "target", cm: true/.test(acts) && /when: \(\) => !!redirectOffer\(\)/.test(acts));
const main = read("scripts/main.js");
check("the deck reads the count and the crescent from MobileCommand.moon", /moon: \{ due: \(\) => moonsDue\(\), cap: MOON_CAP, art: \(n = moonsDue\(\)\) => moonArt\(n\), set: \(n\) => setMoonsDue\(n\) \}/.test(main)
  && /registerMoonsDue\(initSocket\(\)\);/.test(main) && /if \(isDisplayClient\(\)\) initMoonTv\(\);/.test(main));
check("four crescents ship, 0 to 3", [0, 1, 2, 3].every((i) => fs.existsSync(new URL(`art/moons-due-${i}.svg`, REPO))) && M.moonArt(7) === "modules/mobile-command/art/moons-due-3.svg");
const css = read("styles/shell.css");
check("the TV: bottom-left (the compass's mirror), 46 px, no word, faded in only with the Crooked Moon tools on",
  /#mc-moons-due \{ position: fixed; bottom: 60px; left: 60px; width: 46px; height: 46px; z-index: 60; pointer-events: none;\s*opacity: 0;/.test(css) && /#mc-moons-due\.mc-on \{ opacity: \.85; \}/.test(css));
const shell = read("scripts/shell.js");
check("the phone: the redirected attack is the opportunity card, 'The Moon' aims it, nothing is spent a second time; dismissing clears the mark",
  /this\.#assignedBy = p\.moon \? "The Moon" : "Opportunity";/.test(shell) && /skipConsume: !!s\.depleted \|\| !!s\.moon/.test(shell) && /if \(p\?\.moon\) fromUuid\(p\.reactorUuid\)\.then\(\(a\) => a\?\.unsetFlag\(MODULE_ID, "moonRedirect"\)\)/.test(shell));
const O = await import(new URL("scripts/on-now.js", REPO));
const L = O.onNowLines({ moon: 2 });
const ml = L.find((l) => l.key === "moon");
check("On now: 'Moon's Due · 2 of 3' in the sheet, with − / + (the DM can always cheat); '2' beside the crescent on the line",
  ml?.text === "2 of 3" && ml.act === "moon" && O.onNowFloor(L).find((f) => f.key === "moon")?.text === "2" && !O.onNowLines({}).some((l) => l.key === "moon")
  && /data-moon-adj="-1"/.test(read("scripts/dm-panel.js")) && /await setMoonsDue\(moonsDue\(\) \+ Number\(moonAdj\.dataset\.moonAdj\)\)/.test(read("scripts/dm-panel.js")));
check("toasts go through the one notifier (max five)", !/ui\.notifications/.test(src) && /import \{ notifier \} from "\.\/notifier\.js";/.test(src));
// SEAT 38: midi's item card carries no dnd5e roll type ("ZZ Goblin · roll 14"); read the kind from midi / the roll / the activity
check("a card's kind: dnd5e's own word first; else damage/healing by the roll; a d20 is an attack (midi's workflow or an attack activity), a save, a check",
  M.cardRollKind({ kind: "save" }) === "save" && M.cardRollKind({ kind: "generic", firstRoll: "damage" }) === "damage"
  && M.cardRollKind({ firstRoll: "d20", midiAttack: true }) === "attack" && M.cardRollKind({ firstRoll: "d20", activityType: "attack" }) === "attack"
  && M.cardRollKind({ firstRoll: "d20", activityType: "save" }) === "save" && M.cardRollKind({ firstRoll: "d20", activityType: "check" }) === "ability"
  && M.cardRollKind({ firstRoll: "healing" }) === "healing" && M.cardRollKind({ activityType: "damage" }) === "damage" && M.cardRollKind({}) === null);
{
  class D20Roll { constructor(t) { this.total = t; this.options = {}; } }
  class DamageRoll { constructor(t, type) { this.total = t; this.options = { type }; } }
  globalThis.CONFIG = { Dice: { D20Roll, DamageRoll } };
  const atk = new D20Roll(14), dmg = new DamageRoll(6, "slashing");
  globalThis.MidiQOL = { Workflow: { getWorkflow: (u) => (u === "ChatMessage.m1" ? { attackRoll: atk } : null) } };
  globalThis.fromUuidSync = () => null;
  const midiCard = { uuid: "ChatMessage.m1", type: "usage", flags: { "midi-qol": {} }, rolls: [atk, dmg], speaker: { alias: "ZZ Goblin" } };
  const plainMidi = { uuid: "ChatMessage.m2", type: "usage", flags: { "midi-qol": {}, dnd5e: { activity: { type: "attack" } } }, rolls: [new D20Roll(11)] };
  const dmgCard = { uuid: "ChatMessage.m3", type: "usage", flags: { "midi-qol": {} }, rolls: [new DamageRoll(9, "fire")] };
  check("midi's goblin card reads 'attack 14' (midi's workflow), 'attack' from the activity when the workflow is gone, 'damage' for a damage-only card",
    M.rollKindOf(midiCard) === "attack" && M.rollKindOf(plainMidi) === "attack" && M.rollKindOf(dmgCard) === "damage"
    && M.rerollLabel({ speaker: "ZZ Goblin", kind: M.rollKindOf(midiCard), total: 14 }) === "ZZ Goblin · attack 14", J([M.rollKindOf(midiCard), M.rollKindOf(plainMidi), M.rollKindOf(dmgCard)]));
  check("the list and the refusal read the same kind (a midi death save still refuses)", /kind: rollKindOf\(msg\),/.test(src) && /kind: rollKindOf\(msg\), total:/.test(src));
  delete globalThis.MidiQOL; delete globalThis.CONFIG;
}

/* ── SEAT 39: the right-click entry joins the menu ────────────────────────────────────────────────── */
{
  const mainSrc = read("scripts/main.js");
  const init = mainSrc.slice(mainSrc.indexOf('Hooks.once("init"'), mainSrc.indexOf('Hooks.once("setup"'));
  check("SEAT 39: the menu hook is set at init (Foundry 14 builds the chat log's menu once, before ready), not at ready",
    /registerMoonMenu\(\);/.test(init) && !/registerMoonMenu\(\)/.test(mainSrc.slice(mainSrc.indexOf('Hooks.once("ready"'))));
  const e = M.moonMenuEntry();
  check("SEAT 39: the entry is { label, icon, visible(li), onClick(event, li) }, like Foundry 14's own chat entries",
    typeof e.label === "string" && typeof e.visible === "function" && typeof e.onClick === "function" && !("name" in e) && !("condition" in e) && !("callback" in e));
  // Foundry 14's menu calls visible(li) with the message's bare element (jQuery off)
  const prevMsgs = game.messages; game.messages = { get: () => null };
  check("SEAT 39: visible(li) takes the bare element and never throws (no message: hidden)", e.visible({ dataset: { messageId: "x" } }) === false);
  game.messages = prevMsgs;
  const pushed = []; const prevOn = Hooks.on; let hooked = null;
  Hooks.on = (h, fn) => { hooked = h; fn(null, pushed); return 1; };
  M.registerMoonMenu(); Hooks.on = prevOn;
  check("SEAT 39: registering pushes one entry onto the chat message menu",
    hooked === "getChatMessageContextOptions" && pushed.length === 1 && pushed[0].label === "Reroll: the Moon's Due");
}
console.log(`\nAll ${n} passed.`);
