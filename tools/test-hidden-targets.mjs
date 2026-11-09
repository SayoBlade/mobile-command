// Hidden creatures as targets (DM 2026-11-09): "For DMs not players." The DM (deck / a GM client) may target a hidden
// token; a player's phone must never list it, offer it, aim at it, or learn it is there. Drives the real executor
// handlers (targetsList, itemUse, previewTargets, assignTargets) and relays (reaction, damage) with a hidden foe.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-hidden-targets.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import fs from "node:fs";
import { installFakeFoundry } from "./fake-foundry.mjs";

const handlers = {}, toUser = [];
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real, register(name, fn) { handlers[name] = fn; }, executeAsUser: async (name, userId, payload) => { toUser.push({ name, userId, payload }); } };
  } }; } });
const { brekka, users } = await installFakeFoundry();
const REPO = new URL("..", import.meta.url);
const rpc = await import(new URL("scripts/rpc.js", REPO));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const asUser = (userId, name, payload) => handlers[name].call({ socketdata: { userId } }, payload);
for (const u of users) u.active = true;
{ const own = brekka.testUserPermission; brekka.testUserPermission = (u, l) => !!u?.isGM || own(u, l); }

// ── the scene: the Barbarian (u1's), a visible weasel, a HIDDEN Crooked Man ─────────────────────────────────
const scene = game.scenes.active;
const mk = (id, name, hidden, actor) => {
  const doc = { id, name, uuid: `Scene.${scene.id}.Token.${id}`, hidden, documentName: "Token", displayName: 50, disposition: -1, texture: { src: `${id}.webp` } };
  const tok = { id, name, document: doc, actor, center: { x: 0, y: 0 } };
  doc.object = tok;
  return tok;
};
const npc = (id, name) => ({ id, name, type: "npc", hasPlayerOwner: false, statuses: new Set(), system: { attributes: { hp: { value: 7 } } } });
const me = mk("me", "Test Barbarian", false, brekka);
const weasel = mk("weasel", "Weasel", false, npc("w", "Weasel"));
const crooked = mk("crooked", "The Crooked Man", true, npc("cm", "Crooked Man"));
const docs = Object.fromEntries([me, weasel, crooked].map((t) => [t.document.uuid, t.document]));
globalThis.fromUuidSync = (u) => docs[u] ?? game.actors.find((a) => a.uuid === u) ?? null;
let previewed = null;
globalThis.canvas = { ready: true, scene, tokens: { placeables: [me, weasel, crooked], get: (id) => [me, weasel, crooked].find((t) => t.id === id), setTargets: (ids) => { previewed = ids; } } };
scene.id = scene.id ?? "s1";
globalThis.CONST = { ...(globalThis.CONST ?? {}), TOKEN_DISPLAY_MODES: { NONE: 0, CONTROL: 10, OWNER_HOVER: 20, HOVER: 30, OWNER: 40, ALWAYS: 50 } };
let fired = null;
globalThis.MidiQOL = { canSense: () => true, computeDistance: () => 10, completeActivityUse: async (uuid, usage) => { fired = usage; return { targets: new Set(), hitTargets: new Set(), failedSaves: new Set() }; } };
const activity = { uuid: "Actor.a1.Item.axe.Activity.atk", type: "attack", item: { name: "Greataxe", actor: brekka }, target: {} };
globalThis.fromUuid = async (u) => (u === activity.uuid ? activity : null);
globalThis.Hooks.off = () => {};
ui.notifications.notify = () => {};
foreignProps();
function foreignProps() { const get = (o, k) => k.split(".").reduce((x, p) => x?.[p], o); foundry.utils.getProperty = get; foundry.utils.hasProperty = (o, k) => get(o, k) !== undefined; }

// ── 1–3: the phone's target list ────────────────────────────────────────────────────────────────────────────
let res = await asUser("u1", "targetsList", { forTokenId: "me" });
const names = (r) => (r?.candidates ?? []).map((c) => c.name).join(", ");
check("a player's target list shows the weasel and NOT the hidden Crooked Man", res?.ok && names(res) === "Weasel", names(res) || JSON.stringify(res));
res = await asUser("gm", "targetsList", { forTokenId: "me" });
check("the DM's list (a GM requester) may include the hidden one", names(res).includes("The Crooked Man"), names(res));
check("hiddenFromPlayers reads a document, a placeable and a uuid", rpc.hiddenFromPlayers(crooked.document) && rpc.hiddenFromPlayers(crooked) && rpc.hiddenFromPlayers(crooked.document.uuid) && !rpc.hiddenFromPlayers(weasel));

// ── 4–6: what a phone SENDS can't aim at it either (a stale list, a crafted call) ─────────────────────────
await asUser("u1", "itemUse", { activityUuid: activity.uuid, targetUuids: [weasel.document.uuid, crooked.document.uuid] });
check("a phone's attack naming the hidden token fires at the weasel only", JSON.stringify(fired?.midiOptions?.targetUuids) === JSON.stringify([weasel.document.uuid]), JSON.stringify(fired?.midiOptions?.targetUuids));
await asUser("gm", "itemUse", { activityUuid: activity.uuid, targetUuids: [crooked.document.uuid] });
check("the DM's own use may aim at the hidden one", JSON.stringify(fired?.midiOptions?.targetUuids) === JSON.stringify([crooked.document.uuid]));
await asUser("u1", "previewTargets", { tokenUuids: [crooked.document.uuid, weasel.document.uuid] });
check("the phone's live preview never marks the hidden token on the map", JSON.stringify(previewed) === '["weasel"]', JSON.stringify(previewed));

// ── 7: targets the DM assigns to a phone ─────────────────────────────────────────────────────────────────────
await asUser("gm", "assignTargets", { tokenUuids: [crooked.document.uuid, weasel.document.uuid], fromName: "DM" });
check("assigned targets reaching the phone drop the hidden token", JSON.stringify(rpc.remoteState.assignedTargetUuids) === JSON.stringify([weasel.document.uuid]), JSON.stringify(rpc.remoteState.assignedTargetUuids));

// ── 8–9: relays that would name it ──────────────────────────────────────────────────────────────────────────
const hooks = {};
const realOn = globalThis.Hooks.on;
globalThis.Hooks.on = (h, fn) => { (hooks[h] ??= []).push(fn); };
rpc.registerReactionRelay(); rpc.registerDamageRelay();
globalThis.Hooks.on = realOn;
const reaction = { uuid: "Actor.a1.Item.hr.Activity.x", name: "Hellish Rebuke", item: { actor: brekka, name: "Hellish Rebuke", img: "" } };
toUser.length = 0;
hooks["midi-qol.ReactionFilter"][0]([reaction], { workflow: { token: crooked, tokenUuid: crooked.document.uuid, actor: crooked.actor, item: { name: "Claw" } } }, "isDamaged");
let p = toUser.find((m) => m.name === "reactionPrompt")?.payload;
check("a reaction to a hidden attacker: the card names nobody and pre-aims at nothing", p && p.attackerName === "" && p.attackerTokenUuid === null, JSON.stringify(p));
game.combat = { started: true, combatant: { name: "The Crooked Man", hidden: true, actor: crooked.actor, token: crooked.document }, combatants: [{ actor: brekka }] };
brekka.system.attributes.hp = { value: 20, temp: 0 };
toUser.length = 0;
hooks.preUpdateActor[0](brekka, { system: { attributes: { hp: { value: 12 } } } });
p = toUser.find((m) => m.name === "damageTaken")?.payload;
check("damage from a hidden creature's turn: '8 damage', no source name", p?.amount === 8 && p.source === "", JSON.stringify(p));

// ── 10–12: the rest, read from the source ────────────────────────────────────────────────────────────────────
const rpcSrc = fs.readFileSync(new URL("scripts/rpc.js", REPO), "utf8"), aoo = fs.readFileSync(new URL("scripts/aoo.js", REPO), "utf8");
check("AoO: a hidden mover never prompts a phone, and is never swung at automatically (the DM's chip)",
  aoo.includes("const owners = moverDoc?.hidden ? [] :") && aoo.includes("moverDoc?.hidden && actor?.hasPlayerOwner && set !== \"off\" ? \"prompt\" : set"));
check("Use (the hand): hidden loot piles and hidden tiles are not offered",
  rpcSrc.includes("if (!API.isValidItemPile(t) || hiddenFromPlayers(t)) continue;") && rpcSrc.includes("|| d.hidden) continue; // a hidden tile is the DM's"));
check("an area spell tells the phone only how many creatures it may know of",
  rpcSrc.includes("targets: targets.filter(t => !hiddenFromPlayers(t)).length"));

console.log(`\nall ${n} passed`);
