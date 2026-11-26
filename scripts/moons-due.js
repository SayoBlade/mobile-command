// THE MOON'S DUE (DM 2026-11-26, approved): the Crooked Moon's answer to the players' Twists of Fate.
//
// Each time a player SPENDS a twist (cm-live.js spendTwist, every door: the popup, the floor's Waiting line, the deck),
// the DM banks one Moon's Due token. Cap 3. The bank lives on the world (setting `moonsDue`), so it carries over between
// sessions. The table sees it on the TV as a crescent that fills a third per token (art/moons-due-N.svg, bottom-left,
// quiet); the DM sees it in On now.
//
// The DM spends a token one of two ways:
//  (a) REROLL an NPC roll. The new result stands (not the better of the two). A roll is rerolled at most once, and a
//      reroll is never rerolled. Never a death save, never a Maim roll, never a player's roll. From the deck (the last
//      NPC roll in chat, or one of the few before it) or from the chat log's right-click menu on the DM's screen.
//      The reroll posts as a new card (the same kind of card, so damage keeps its Apply buttons); what the first roll
//      already did (midi's hit, applied damage) is the DM's to adjust: the system cannot un-apply it.
//  (b) REDIRECT. When a PLAYER rolls a natural 1 on a WEAPON attack, the queue offers it (the floor's Waiting line and
//      the deck's Notifications key). Redirect → the DM clicks the new target on the map: within that attack's reach
//      or range, not at 0 HP, not the attacker. The player rolls again (players roll their own: their phone gets the
//      attack card aimed at the new target; in plain Foundry they roll it from their sheet), and that roll cannot crit.
//
// Everything that decides is pure and tested (tools/test-moons-due.mjs); the rest reads and writes Foundry.

import { MODULE_ID } from "./preset.js";
import { notifier } from "./notifier.js";
import { messageRollKind } from "./dnd5e-compat.js";

export const MOON_CAP = 3;
export const MOON_KEY = "moonsDue";
export const REDIRECT_FLAG = "moonRedirect";
export const OFFER_TTL_MS = 5 * 60 * 1000;     // a natural 1 left unanswered this long is history
export const REDIRECT_TTL_MS = 10 * 60 * 1000; // the redirected roll is owed within this long, then the no-crit lapses
export const PICK_MS = 60 * 1000;               // the DM's map click
export const moonArt = (n) => `modules/${MODULE_ID}/art/moons-due-${clampDue(n)}.svg`;

/* ── pure ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export function clampDue(n) { return Math.max(0, Math.min(MOON_CAP, Math.floor(Number(n) || 0))); }

/**
 * Why this chat message can't be rerolled, or null. `m` is messageShape(): { hasRolls, npc, kind, maim, table,
 * rerolled, isReroll }.
 */
export function rerollRefusal(m = {}) {
  if (!m.hasRolls) return "no roll";
  if (m.isReroll) return "a reroll stands";
  if (m.rerolled) return "already rerolled";
  if (!m.npc) return "not an NPC's roll";
  if (m.kind === "death") return "never a death save";
  if (m.maim) return "never a Maim roll";
  if (m.table) return "not a table draw";
  return null;
}

/** Is this attack roll a Redirect chance: a player's weapon attack, natural 1, and not itself a redirected roll. */
export function redirectChance({ natural, itemType, playerOwned, noCrit } = {}) {
  return natural === 1 && itemType === "weapon" && !!playerOwned && !noCrit;
}

/** The farthest this attack reaches, in feet: melee reach (5 by default), or a ranged attack's long range. */
export function attackReachFt(range = {}, { melee = false } = {}) {
  const units = String(range.units ?? "ft");
  if (units && units !== "ft" && units !== "m") return null; // "touch", "self", "spec": nothing to measure against
  const far = Math.max(Number(range.reach) || 0, Number(range.value) || 0, Number(range.long) || 0);
  return far || (melee ? 5 : null);
}

/** The squares a token covers, as centre points: [{x, y}] (a Large token covers four). */
export function tokenCells({ x = 0, y = 0, width = 1, height = 1 } = {}, size = 100) {
  const out = [];
  for (let i = 0; i < Math.max(1, Math.round(width)); i++) for (let j = 0; j < Math.max(1, Math.round(height)); j++)
    out.push({ x: x + (i + 0.5) * size, y: y + (j + 0.5) * size });
  return out;
}
/** Nearest square to nearest square, by the table's own measure (`measure(a, b)` → feet), as the table counts reach. */
export function nearestDistance(a, b, size, measure) {
  let best = Infinity;
  for (const p of tokenCells(a, size)) for (const q of tokenCells(b, size)) best = Math.min(best, measure(p, q));
  return best;
}
/** Why this token can't be the new target, or null. `distanceFt` is square to square (nearestDistance). */
export function redirectRefusal({ isAttacker = false, hp = 1, distanceFt = 0, reachFt = null } = {}) {
  if (isAttacker) return "not the attacker";
  if (!(Number(hp) > 0)) return "that one is at 0 HP";
  if (reachFt == null) return null;
  return distanceFt > reachFt + 0.01 ? `out of reach (${Math.round(distanceFt)} ft, the attack reaches ${reachFt} ft)` : null;
}

/** Is an offer still open: not picking, not stale. */
export function offerLive(o, now = Date.now()) {
  return !!o && !o.picking && now - (o.at ?? 0) < OFFER_TTL_MS;
}

/** Is a redirect pending on this attack: the flag names this activity and is fresh. */
export function redirectArmed(flag, activityUuid, now = Date.now()) {
  return !!flag && !!activityUuid && flag.activityUuid === activityUuid && now - (flag.ts ?? 0) < REDIRECT_TTL_MS;
}

/** The deck's and the menu's word for a roll: "Goblin · attack 14". */
export function rerollLabel({ speaker = "", kind = null, total = null } = {}) {
  const who = String(speaker || "NPC").split(/\s+/).slice(0, 2).join(" ");
  const what = { attack: "attack", damage: "damage", save: "save", concentration: "save", ability: "check", skill: "check",
    tool: "check", initiative: "initiative", healing: "healing" }[kind] ?? "roll";
  return `${who} · ${what}${total != null ? ` ${total}` : ""}`;
}

/* ── the bank ─────────────────────────────────────────────────────────────────────────────────────────────── */

export function moonState() { try { return game.settings.get(MODULE_ID, MOON_KEY) ?? {}; } catch (e) { return {}; } }
export function moonsDue() { return clampDue(moonState().count); }
const toolsOn = () => { try { return !!game.settings.get(MODULE_ID, "crookedMoonTools"); } catch (e) { return false; } };
const changed = () => { try { Hooks.callAll(`${MODULE_ID}.actionsChanged`); } catch (e) { /* headless */ } };

async function writeMoon(patch) {
  if (!game.user?.isGM) return false;
  await game.settings.set(MODULE_ID, MOON_KEY, { ...moonState(), ...patch });
  changed();
  return true;
}
/** A twist was spent: the Moon banks one (cap 3). Returns the new count. */
export async function gainMoonsDue(n = 1) {
  const before = moonsDue(), after = clampDue(before + n);
  if (after !== before) await writeMoon({ count: after });
  return after;
}
/** Set the bank by hand (the DM can always cheat, UI-BIBLE §8.1). */
export async function setMoonsDue(n) { await writeMoon({ count: clampDue(n) }); return moonsDue(); }
async function spendMoon() {
  const c = moonsDue();
  if (c < 1) return false;
  await writeMoon({ count: c - 1 });
  return true;
}

/* ── (a) reroll ───────────────────────────────────────────────────────────────────────────────────────────── */

function speakerActor(msg) {
  try { return ChatMessage.getSpeakerActor(msg.speaker) ?? null; } catch (e) { return null; }
}
export function messageShape(msg) {
  const actor = speakerActor(msg);
  const f = msg?.flags?.[MODULE_ID] ?? {};
  return {
    hasRolls: (msg?.rolls?.length ?? 0) > 0,
    npc: !!actor && !actor.hasPlayerOwner,
    kind: messageRollKind(msg),
    maim: /\bmaim\b/i.test(String(msg?.flavor ?? "")) || !!msg?.flags?.["deck-command"]?.maim,
    table: !!msg?.flags?.core?.RollTable,
    rerolled: !!f.moonRerolled,
    isReroll: !!f.moonReroll,
  };
}
const labelOf = (msg) => rerollLabel({ speaker: msg.speaker?.alias ?? speakerActor(msg)?.name, kind: messageRollKind(msg), total: msg.rolls?.[0]?.total ?? null });

/** The last few NPC rolls that may be rerolled, newest first: [{ id, label }]. */
export function rerollCandidates(limit = 4) {
  const out = [];
  const msgs = game.messages?.contents ?? [];
  for (let i = msgs.length - 1; i >= 0 && i >= msgs.length - 60 && out.length < limit; i--) {
    const m = msgs[i];
    if (!rerollRefusal(messageShape(m))) out.push({ id: m.id, label: labelOf(m) });
  }
  return out;
}

/** Reroll one NPC roll (the newest when no id). The new card stands; the old one is marked so it can't go again. */
export async function moonReroll(messageId = null) {
  if (!game.user?.isGM) return { ok: false, reason: "DM only" };
  if (moonsDue() < 1) return { ok: false, reason: "no Moon's Due" };
  const id = messageId ?? rerollCandidates(1)[0]?.id;
  const msg = id ? game.messages.get(id) : null;
  if (!msg) return { ok: false, reason: "no NPC roll to reroll" };
  const no = rerollRefusal(messageShape(msg));
  if (no) return { ok: false, reason: no };
  const rolls = [];
  for (const r of msg.rolls) rolls.push(await r.reroll());
  // The same kind of card when it is a plain system roll card (damage keeps its Apply buttons); a midi item card's
  // HTML carries the old numbers, so that one becomes a plain roll card under the same speaker.
  const plainCard = !msg.flags?.["midi-qol"] && !String(msg.content ?? "").trim();
  const data = plainCard ? foundry.utils.deepClone(msg.toObject()) : { speaker: msg.speaker, whisper: msg.whisper, blind: msg.blind };
  for (const k of ["_id", "timestamp", "_stats", "rolls", "sound"]) delete data[k];
  data.author = game.user.id;
  data.rolls = rolls;
  data.flavor = `${String(msg.flavor ?? "").trim() || labelOf(msg)} · rerolled, the Moon's Due`;
  foundry.utils.setProperty(data, `flags.${MODULE_ID}.moonReroll`, msg.id);
  const made = await ChatMessage.create(data);
  if (!made) return { ok: false, reason: "the reroll didn't post" };
  await msg.setFlag(MODULE_ID, "moonRerolled", made.id);
  await spendMoon();
  return undefined;
}

/* ── (b) redirect ─────────────────────────────────────────────────────────────────────────────────────────── */

/** The open Redirect offer, or null. */
export function redirectOffer() {
  const o = moonState().offer ?? null;
  return toolsOn() && moonsDue() > 0 && offerLive(o) ? o : null;
}
/** The GM hears of a natural 1 (from its own roll, or from a player's client over the socket). */
export async function noteRedirectChance(p = {}) {
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
  if (!toolsOn() || moonsDue() < 1) return;
  const actor = await fromUuid(p.actorUuid ?? "").catch(() => null);
  if (!actor?.hasPlayerOwner) return;
  await writeMoon({ offer: { id: foundry.utils.randomID(), at: Date.now(), actorUuid: actor.uuid, name: actor.name,
    activityUuid: p.activityUuid, itemName: p.itemName ?? "", tokenUuid: p.tokenUuid ?? null } });
}
export async function dropRedirectOffer() { await writeMoon({ offer: null }); }

let picking = null; // { offer, off(), timer }
function endPick() {
  if (!picking) return;
  clearTimeout(picking.timer);
  for (const [hook, id] of picking.hooks) Hooks.off(hook, id);
  picking = null;
}
async function attackerToken(o) {
  const t = o.tokenUuid ? await fromUuid(o.tokenUuid).catch(() => null) : null;
  if (t?.parent?.id === canvas?.scene?.id) return t.object ?? null;
  const a = await fromUuid(o.actorUuid).catch(() => null);
  return a?.getActiveTokens?.()?.[0] ?? null;
}

/** Redirect → the DM clicks the new target on the map (select or target it). One minute, then the offer comes back. */
export async function startRedirectPick() {
  const o = moonState().offer;
  if (!o || !offerLive(o)) return { ok: false, reason: "that natural 1 has passed" };
  if (moonsDue() < 1) return { ok: false, reason: "no Moon's Due" };
  const from = await attackerToken(o);
  if (!from) return { ok: false, reason: "the attacker isn't on this map" };
  const activity = await fromUuid(o.activityUuid).catch(() => null);
  const reachFt = attackReachFt(activity?.range ?? activity?.item?.system?.range ?? {}, { melee: /^m/.test(String(activity?.attack?.type?.value ?? "m")) });
  endPick();
  await writeMoon({ offer: { ...o, picking: true } });
  notifier.info(`The Moon's Due: click ${o.name.split(" ")[0]}'s new target on the map.`);
  const tryToken = async (tok) => {
    if (!picking || !tok?.document) return;
    const hp = tok.actor?.system?.attributes?.hp?.value;
    let distanceFt = 0;
    try { distanceFt = nearestDistance(from.document, tok.document, canvas.grid.size, (p, q) => canvas.grid.measurePath([p, q]).distance); } catch (e) { /* no canvas */ }
    const no = redirectRefusal({ isAttacker: tok.document.uuid === from.document.uuid || tok.actor?.uuid === o.actorUuid, hp: hp ?? 1, distanceFt, reachFt });
    if (no) { notifier.warn(`Not that one: ${no}.`); return; }
    endPick();
    await finishRedirect(o, tok);
  };
  const hooks = [
    ["controlToken", Hooks.on("controlToken", (tok, on) => { if (on) tryToken(tok); })],
    ["targetToken", Hooks.on("targetToken", (user, tok, on) => { if (on && user?.id === game.user.id) tryToken(tok); })],
  ];
  picking = { offer: o, hooks, timer: setTimeout(async () => {
    endPick();
    const now = moonState().offer;
    if (now?.id === o.id) await writeMoon({ offer: { ...now, picking: false, at: Date.now() } });
    notifier.info("The Moon's Due: no target picked; the offer is back in Waiting.");
  }, PICK_MS) };
  return undefined;
}

async function finishRedirect(o, tok) {
  if (!(await spendMoon())) { notifier.warn("No Moon's Due left."); await dropRedirectOffer(); return; }
  await writeMoon({ offer: null });
  const actor = await fromUuid(o.actorUuid).catch(() => null);
  if (!actor) return;
  const targetUuid = tok.document.uuid;
  await actor.setFlag(MODULE_ID, REDIRECT_FLAG, { activityUuid: o.activityUuid, targetUuid, ts: Date.now() });
  const esc = foundry.utils.escapeHTML;
  const tname = tok.document.hidden ? "someone unseen" : tok.document.name;
  await ChatMessage.create({ speaker: { alias: "The Moon's Due" },
    content: `<p><b>${esc(actor.name)}</b>'s blow turns toward <b>${esc(tname)}</b>: roll the attack again. It cannot crit.</p>` });
  // the attacker's phone gets the attack card aimed at the new target (the opportunity-attack prompt's shape)
  try {
    const { aooPromptUser } = await import("./rpc.js");
    const owners = game.users.filter((u) => !u.isGM && u.active && actor.testUserPermission?.(u, "OWNER"));
    for (const u of owners) aooPromptUser(u.id, { reactorUuid: actor.uuid, activityUuid: o.activityUuid, targetUuid,
      weaponName: o.itemName, title: "The Moon's Due", reason: `Your blow turns toward ${tname}. Roll again: it can't crit.`, moon: true, ttlMs: REDIRECT_TTL_MS });
  } catch (e) { console.warn(`${MODULE_ID} | moon redirect prompt`, e); }
}

/* ── hooks (every client) ─────────────────────────────────────────────────────────────────────────────────── */

const seenRolls = new WeakSet();
function onAttackRolled(rolls, data) {
  const roll = rolls?.[0];
  if (!roll || seenRolls.has(roll)) return;
  seenRolls.add(roll);
  const activity = data?.subject;
  const actor = activity?.actor;
  const natural = roll.d20?.total ?? roll.dice?.[0]?.total ?? null;
  if (!redirectChance({ natural, itemType: activity?.item?.type, playerOwned: actor?.hasPlayerOwner, noCrit: Number(roll.options?.criticalSuccess) > 20 })) return;
  if (!toolsOn()) return;
  const payload = { actorUuid: actor.uuid, activityUuid: activity.uuid, itemName: activity.item?.name ?? "",
    tokenUuid: actor.getActiveTokens?.()?.[0]?.document?.uuid ?? null };
  if (game.user.isGM) noteRedirectChance(payload).catch((e) => console.warn(`${MODULE_ID} | moon offer`, e));
  else moonSocket?.executeAsGM?.("moonNat1", payload);
}
const noCrit = (roll) => { roll.options ??= {}; roll.options.criticalSuccess = 21; if (roll.d20?.options) roll.d20.options.criticalSuccess = 21; };
const armedFor = (config) => {
  const act = config?.subject;
  if (act?.type !== "attack") return null;
  const flag = act.actor?.getFlag?.(MODULE_ID, REDIRECT_FLAG);
  return redirectArmed(flag, act.uuid) ? act.actor : null;
};

let moonSocket = null;
export function registerMoonsDue(socket) {
  moonSocket = socket ?? null;
  try {
    moonSocket?.register?.("moonNat1", function (p) {
      // trust socketlib's sender, not the payload: the roller must own that hero
      const from = game.users.get(this?.socketdata?.userId ?? "");
      fromUuid(p?.actorUuid ?? "").then((a) => {
        if (from && a?.testUserPermission?.(from, "OWNER")) return noteRedirectChance(p);
        return null;
      }).catch(() => null);
      return true;
    });
  } catch (e) { console.warn(`${MODULE_ID} | moon socket`, e); }
  Hooks.on("dnd5e.rollAttack", onAttackRolled);
  Hooks.on("dnd5e.rollAttackV2", onAttackRolled);
  // the redirected roll can't crit: set before the dialog and again on the built rolls (another module may set its own)
  Hooks.on("dnd5e.preRollD20Test", (config) => { if (armedFor(config)) for (const r of config.rolls ?? []) noCrit(r); });
  Hooks.on("dnd5e.postD20TestRollConfiguration", (rolls, config) => {
    if (config?.evaluate === false || !rolls?.length) return;
    const actor = armedFor(config);
    if (!actor) return;
    for (const r of rolls) noCrit(r);
    actor.unsetFlag(MODULE_ID, REDIRECT_FLAG).catch(() => null); // one roll, then it's spent
  });
  // the chat log's right-click: reroll a picked NPC roll
  const menu = (_app, options) => {
    const msgOf = (li) => game.messages.get(li?.dataset?.messageId ?? li?.[0]?.dataset?.messageId ?? li?.data?.("messageId"));
    options.push({
      name: "Reroll: the Moon's Due", icon: '<i class="fas fa-moon"></i>',
      condition: (li) => { try { return game.user.isGM && toolsOn() && moonsDue() > 0 && !rerollRefusal(messageShape(msgOf(li))); } catch (e) { return false; } },
      callback: (li) => { const m = msgOf(li); if (m) moonReroll(m.id).then((r) => { if (r?.ok === false) notifier.warn(`Moon's Due: ${r.reason}.`); }); },
    });
  };
  Hooks.on("getChatMessageContextOptions", menu);
  Hooks.on("getChatLogEntryContext", menu);
}

/* ── the TV's crescent ────────────────────────────────────────────────────────────────────────────────────── */

export function initMoonTv() {
  try {
    if (document.getElementById("mc-moons-due")) return;
    const el = document.createElement("div");
    el.id = "mc-moons-due";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    const sync = () => {
      const on = toolsOn(), n = moonsDue();
      el.classList.toggle("mc-on", on);
      el.dataset.n = String(n);
      const src = moonArt(n);
      if (el.dataset.src !== src) { el.dataset.src = src; el.innerHTML = `<img src="${src}" alt="">`; }
    };
    Hooks.on("updateSetting", (s) => { if ([`${MODULE_ID}.${MOON_KEY}`, `${MODULE_ID}.crookedMoonTools`].includes(s?.key)) sync(); });
    sync();
  } catch (e) { console.warn(`${MODULE_ID} | moon's due on the TV`, e); }
}
