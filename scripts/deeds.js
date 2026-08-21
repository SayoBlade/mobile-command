// §44.4 The Deeds recorder — the one genuinely NEW half of the Character File (slice B).
// DM's list: "most damage to big monsters, last hit on big monsters, favorite weapon,
// favorite spell, and anything cool you can come up with."
//
// A module in its own right (the spec's own words): everything in this file is the RECORDER —
// event listeners plus pure reducers over one bounded `deeds` flag per PC. The BOOK renders it
// (character-file.js chapter 8); this file never touches a journal.
//
// Where the truth comes from:
// - `midi-qol.RollComplete` — one workflow, fully resolved: attacker, item, and midi's
//   damageList ({actorUuid, hpDamage, tempDamage, oldHP, newHP, isHit…}, read from installed
//   14.0.11 source). Damage dealt, healing given, drops, nemesis, per-foe totals, biggest
//   hit/turn, and weapon/spell use counts all come from here. The hook fires on the client
//   that RAN the workflow (the executor for every phone action), and that client can always
//   write what it needs to: its own player's actor, or anything at all when it's a GM.
// - `updateActor` HP→0 — the kill. Attribution is a per-client `lastDamager` map filled by
//   the workflow hook, so exactly the client that dealt the killing damage records the kill;
//   every other client sees the death but holds no claim. "Last damager" is an approximation
//   and the caveat is the honest part (§44.4): a three-kill fireball, a familiar's chip
//   damage, simultaneous hits can mis-credit.
// - `createChatMessage` (executor only) — death saves and luck. Every d20 test posts a chat
//   card carrying `flags.dnd5e.roll.type` and its Roll; parsing chat needs no cross-client
//   writes and no roll-hook surgery. Known undercount: midi's merge-card mode can attach an
//   attack roll to its card AFTER creation, and those d20s slip the luck tally.
//
// Bounded by construction (§44.4): counters, maxima, a top-20 worthy-kill list ranked by
// CR − level, and capped [name, n] PAIR ARRAYS for weapons/spells/nemesis — arrays because a
// flag update MERGES objects (an evicted key would resurrect) but REPLACES arrays wholesale.
// The worthy bar is CR > level, strictly (DM 2026-08-15).

import { MODULE_ID } from "./preset.js";
import { isExecutor } from "./settings.js";
import { clockLabel } from "./gametime.js";

export const DEEDS_FLAG = "deeds";
const KILL_CAP = 20;    // worthy kills kept (ranked, spec)
const PAIR_CAP = 30;    // weapon/spell name→count pairs
const NEMESIS_CAP = 24; // creatures tracked as damage sources (evict-smallest; tail may blur)

/* -------------------------------------------- */
/*  Pure reducers — no Foundry, fully testable  */
/* -------------------------------------------- */

export function emptyDeeds() {
  return {
    v: 1,
    totalKills: 0, kills: [],
    maxFoe: null, maxHit: null, maxTurn: null,
    weapons: [], spells: [], nemesis: [],
    drops: 0, dsMade: 0, dsFail: 0,
    healGiven: 0, maxHeal: null,
    nat20: 0, nat1: 0
  };
}

export function isWorthy(cr, level) {
  return Number.isFinite(cr) && Number.isFinite(level) && cr > level; // strictly above — an even fight is no trophy
}

// Count one use of a named thing in a capped [name, n] pair list. A full list only grows an
// EXISTING name; a brand-new 31st item is dropped rather than evicting a real favourite.
export function bumpPair(pairs, name, n = 1, cap = PAIR_CAP) {
  if (!name) return pairs;
  const hit = pairs.find(p => p[0] === name);
  if (hit) hit[1] += n;
  else if (pairs.length < cap) pairs.push([name, n]);
  return pairs;
}

// Nemesis accumulation differs: damage keeps adding, and a NEW creature may evict the current
// smallest when the list is full — the top stays exact, only the tail blurs (documented).
export function bumpNemesis(pairs, name, amount, cap = NEMESIS_CAP) {
  if (!name || !(amount > 0)) return pairs;
  const hit = pairs.find(p => p[0] === name);
  if (hit) { hit[1] += amount; return pairs; }
  if (pairs.length < cap) { pairs.push([name, amount]); return pairs; }
  let min = 0;
  for (let i = 1; i < pairs.length; i++) if (pairs[i][1] < pairs[min][1]) min = i;
  if (pairs[min][1] < amount) pairs[min] = [name, amount];
  return pairs;
}

export function topPair(pairs) {
  return pairs?.length ? pairs.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
}

export function recordUse(d, item) {
  if (item?.type === "weapon") bumpPair(d.weapons, item.name);
  else if (item?.type === "spell") bumpPair(d.spells, item.name);
  return d;
}

// One landed packet of damage from this PC to one creature.
export function recordHit(d, { amount, victim, ts = 0 }) {
  if (!(amount > 0)) return d;
  if (!d.maxHit || amount > d.maxHit.amount) d.maxHit = { amount, name: victim ?? "", ts };
  return d;
}

// Running TOTAL into one worthy foe (the caller accumulates per foe; we keep the record).
export function recordFoeTotal(d, { name, cr, total, level, ts = 0 }) {
  if (!isWorthy(cr, level) || !(total > 0)) return d;
  if (!d.maxFoe || total > d.maxFoe.total) d.maxFoe = { name, cr, total, level, ts };
  return d;
}

export function recordTurn(d, { amount, ts = 0 }) {
  if (!(amount > 0)) return d;
  if (!d.maxTurn || amount > d.maxTurn.amount) d.maxTurn = { amount, ts };
  return d;
}

// The killing blow. Every kill counts; only a WORTHY one (CR > level) enters the ranked list,
// ordered by CR − level (the biggest thing punched above their weight), capped at 20.
export function recordKill(d, { name, cr, level, scene = "", wd = "", ts = 0 }) {
  d.totalKills += 1;
  if (!isWorthy(cr, level)) return d;
  d.kills.push({ name, cr, level, scene, wd, ts });
  d.kills.sort((a, b) => (b.cr - b.level) - (a.cr - a.level) || (a.ts - b.ts));
  if (d.kills.length > KILL_CAP) d.kills.length = KILL_CAP;
  return d;
}

export function recordHeal(d, { amount, target, ts = 0 }) {
  if (!(amount > 0)) return d;
  d.healGiven += amount;
  if (!d.maxHeal || amount > d.maxHeal.amount) d.maxHeal = { amount, name: target ?? "", ts };
  return d;
}

export function recordTaken(d, { attacker, amount }) {
  bumpNemesis(d.nemesis, attacker, amount);
  return d;
}

export function recordDrop(d) { d.drops += 1; return d; }

// RAW death saves: 10+ is a success, a natural 20 revives (still a made save for the tally),
// a natural 1 is TWO failures.
export function recordDeathSave(d, { total, die }) {
  if (die === 1) d.dsFail += 2;
  else if (die === 20 || total >= 10) d.dsMade += 1;
  else d.dsFail += 1;
  return d;
}

export function recordLuck(d, die) {
  if (die === 20) d.nat20 += 1;
  else if (die === 1) d.nat1 += 1;
  return d;
}

/* -------------------------------------------- */
/*  The recorder — event glue                   */
/* -------------------------------------------- */

// Per-client working memory. Only the client that ran a workflow holds attribution state, so
// map presence IS the write permission story: nobody else acts on the same event.
const lastDamager = new Map(); // victim actor uuid → { pcUuid, ts }
const foeTotals = new Map();   // `${pcId}:${victimUuid}` → { name, cr, total }
const turnAcc = new Map();     // pcId → { key, total }
const recordedKills = new Set(); // victim actor uuids already credited (cleared if healed back up)

function readDeeds(actor) {
  const raw = actor.getFlag(MODULE_ID, DEEDS_FLAG);
  const d = emptyDeeds();
  if (raw && typeof raw === "object") Object.assign(d, structuredClone(raw));
  return d;
}

async function writeDeeds(actor, d) {
  try { await actor.setFlag(MODULE_ID, DEEDS_FLAG, d); }
  catch (e) { console.warn(`${MODULE_ID} | deeds write failed for ${actor?.name}`, e); }
}

function worldDate() { try { return clockLabel(); } catch (e) { return ""; } }

async function onWorkflowComplete(workflow) {
  const attacker = workflow?.actor;
  const item = workflow?.item;
  const ts = Date.now();
  const attackerIsPC = attacker?.type === "character";
  const pcDeeds = attackerIsPC ? readDeeds(attacker) : null;
  let pcDirty = false;

  if (pcDeeds && item) { recordUse(pcDeeds, item); pcDirty = true; }

  let dealtToNpcs = 0;
  for (const e of workflow?.damageList ?? []) {
    let victim = null;
    try { victim = fromUuidSync(e.actorUuid); } catch (err) { /* gone between roll and apply */ }
    if (!victim) continue;
    const victimName = victim.token?.name ?? victim.name ?? "";
    const applied = Math.max(0, (e.hpDamage ?? 0) + (e.tempDamage ?? 0));
    const healed = Math.max(0, -(e.hpDamage ?? 0));

    if (pcDeeds && applied > 0 && victim.type === "npc") {
      dealtToNpcs += applied;
      lastDamager.set(victim.uuid, { pcUuid: attacker.uuid, ts });
      recordHit(pcDeeds, { amount: applied, victim: victimName, ts });
      const cr = Number(victim.system?.details?.cr);
      const level = Number(attacker.system?.details?.level);
      const fk = `${attacker.id}:${victim.uuid}`;
      const foe = foeTotals.get(fk) ?? { name: victimName, cr, total: 0 };
      foe.total += applied;
      foeTotals.set(fk, foe);
      recordFoeTotal(pcDeeds, { name: foe.name, cr: foe.cr, total: foe.total, level, ts });
      pcDirty = true;
    }

    if (pcDeeds && healed > 0) {
      recordHeal(pcDeeds, { amount: healed, target: victimName, ts });
      pcDirty = true;
    }

    // The victim's side of the story — scars and the nemesis ledger. GM clients only: a
    // player-run workflow may not have write rights on the victim, and PC-on-PC "nemesis"
    // entries would be noise anyway.
    if (victim.type === "character" && game.user.isGM) {
      const vd = readDeeds(victim);
      let vDirty = false;
      if (applied > 0 && attacker && attacker.type !== "character") {
        recordTaken(vd, { attacker: workflow.token?.name ?? attacker.name, amount: applied });
        vDirty = true;
      }
      if ((e.oldHP ?? 0) > 0 && (e.newHP ?? 0) <= 0) { recordDrop(vd); vDirty = true; }
      if (vDirty) await writeDeeds(victim, vd);
    }
  }

  // Biggest turn: damage summed inside one combat-turn window (reactions land in the turn
  // they interrupt — it is still "damage in a single turn").
  if (pcDeeds && dealtToNpcs > 0 && game.combat?.started) {
    const key = `${game.combat.id}:${game.combat.round}:${game.combat.turn}`;
    const acc = turnAcc.get(attacker.id);
    const total = (acc?.key === key ? acc.total : 0) + dealtToNpcs;
    turnAcc.set(attacker.id, { key, total });
    recordTurn(pcDeeds, { amount: total, ts });
    pcDirty = true;
  }

  if (pcDeeds && pcDirty) await writeDeeds(attacker, pcDeeds);
}

// The kill: an NPC hitting 0 HP on any client — but only the client holding the lastDamager
// claim records it, and only once per corpse (healed-then-rekilled re-arms).
async function onActorUpdate(actor, changes) {
  const hp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (hp === undefined || hp === null) return;
  if (hp > 0) { recordedKills.delete(actor.uuid); return; }
  if (actor.type !== "npc" || recordedKills.has(actor.uuid)) return;
  const claim = lastDamager.get(actor.uuid);
  if (!claim || Date.now() - claim.ts > 60_000) return; // stale claim — a DM edit, not a blow
  let pc = null;
  try { pc = fromUuidSync(claim.pcUuid); } catch (e) { return; }
  if (!pc) return;
  recordedKills.add(actor.uuid);
  const d = readDeeds(pc);
  recordKill(d, {
    name: actor.token?.name ?? actor.name,
    cr: Number(actor.system?.details?.cr),
    level: Number(pc.system?.details?.level),
    scene: game.scenes.get(actor.token?.parent?.id)?.name ?? canvas?.scene?.name ?? "",
    wd: worldDate(),
    ts: Date.now()
  });
  await writeDeeds(pc, d);
}

// Death saves + luck, parsed from the chat cards every d20 test posts. Executor-only: chat is
// global, so one authoritative writer and no cross-client races.
async function onChatMessage(msg) {
  if (!isExecutor()) return;
  if (!msg?.rolls?.length) return;
  let actor = null;
  try { actor = ChatMessage.getSpeakerActor(msg.speaker); } catch (e) { return; }
  if (actor?.type !== "character") return;
  const rollType = msg.getFlag?.("dnd5e", "roll")?.type;
  const d = readDeeds(actor);
  let dirty = false;
  for (const roll of msg.rolls) {
    const d20 = roll?.dice?.[0];
    if (!d20 || d20.faces !== 20) continue; // not a d20 test (damage, hit dice…)
    const die = d20.total;
    if (die === 20 || die === 1) { recordLuck(d, die); dirty = true; }
    if (rollType === "death") { recordDeathSave(d, { total: roll.total, die }); dirty = true; }
  }
  if (dirty) await writeDeeds(actor, d);
}

export function registerDeeds() {
  Hooks.on("midi-qol.RollComplete", (workflow) => { onWorkflowComplete(workflow).catch(e => console.warn(`${MODULE_ID} | deeds workflow`, e)); });
  Hooks.on("updateActor", (actor, changes) => { onActorUpdate(actor, changes).catch(e => console.warn(`${MODULE_ID} | deeds kill`, e)); });
  Hooks.on("createChatMessage", (msg) => { onChatMessage(msg).catch(e => console.warn(`${MODULE_ID} | deeds chat`, e)); });
  Hooks.on("deleteCombat", () => { foeTotals.clear(); turnAcc.clear(); }); // per-fight memory ends with the fight
}
