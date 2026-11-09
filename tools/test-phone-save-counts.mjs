// Tour Rehearsal R3 rerun 3 step 57 (2026-11-09), deck-command MC-PATCHES S1: the phone rolled the Barbarian's
// Constitution save (21, a pass, at 12 s); at 34 s midi rolled it AGAIN on the DM's side (7), threw the 21 away and
// applied full damage. That breaks his firmest rule: players roll their own saves.
// Cause: midi files each player's save under the asked TOKEN's id (createPlayerChatSaveRequest: requestId = target.id)
// and answers it only from a roll message whose speaker.token is that id (processSaveRoll returns when it is empty).
// dnd5e takes the speaker from actor.getActiveTokens(), which is [] without a canvas, so a phone's save never matched.
// Fix: the relay carries the asked token's uuid and the phone names it as the roll's speaker (rpc rollMessageFor).
//
// midi's matcher below is midi-qol 14.6.8's own logic, transcribed (saveRequests / saveTimeouts / processSaveRoll);
// dnd5e's roll is 6.0.6's #rollD20Test message merge; ChatMessage.getSpeaker is core 14's cases 1 and 2.
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-phone-save-counts.mjs   (or plain node)
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import fs from "node:fs";
import { installFakeFoundry } from "./fake-foundry.mjs";

const toUser = [];
let fakeSocketlib;
Object.defineProperty(globalThis, "socketlib", { configurable: true,
  get: () => fakeSocketlib,
  set: (lib) => { fakeSocketlib = { registerModule: (id) => {
    const real = lib.registerModule(id);
    return { ...real, register() {}, executeAsUser: async (name, userId, payload) => { toUser.push({ name, userId, payload }); } };
  } }; } });
const { brekka, outsider, users } = await installFakeFoundry();
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
for (const u of users) u.active = true;
users.get("u2").active = false; // nobody else
globalThis.MidiQOL = { configSettings: () => ({ playerSaveTimeout: 30 }) };

// ── the scene: the Test Barbarian (Player1 = u1, the phone) and the Test Cleric (no player online) ─────────────
const scene = game.scenes.active;
const mkTok = (id, actor) => ({ id, documentName: "Token", uuid: `Scene.${scene.id}.Token.${id}`, actor, actorId: actor.id, parent: scene, hidden: false, name: actor.name });
const barbTok = mkTok("barbTok", brekka), clerTok = mkTok("clerTok", outsider);
scene.tokens = Object.assign([barbTok, clerTok], { get: (id) => [barbTok, clerTok].find(t => t.id === id) });
globalThis.fromUuidSync = (u) => [barbTok, clerTok].find(t => t.uuid === u) ?? game.actors.find(a => a.uuid === u) ?? null;

// core 14 ChatMessage.getSpeaker, the two cases that matter here, on a client whose canvas is NOT ready
globalThis.ChatMessage.getSpeaker = ({ actor, token } = {}) => {
  if (token?.documentName === "Token") return { scene: token.parent.id, actor: token.actorId, token: token.id, alias: token.name };
  const tokens = []; // Actor#getActiveTokens: `if (!canvas.ready) return []`
  return { scene: null, actor: actor?.id ?? null, token: tokens[0]?.id ?? null, alias: actor?.name };
};
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b ?? {})) o[k] = v && typeof v === "object" && !Array.isArray(v) && typeof a?.[k] === "object" ? merge(a[k], v) : v; return o; };

// midi-qol 14.6.8: the request, its timeout and the matcher (transcribed)
let clock = 0; const timers = [];
const saveRequests = {}, saveTimeouts = {}, results = {};
function createPlayerChatSaveRequest(target, gmRoll) {
  const requestId = target?.id;
  return new Promise((resolve) => {
    saveRequests[requestId] = resolve;
    saveTimeouts[requestId] = timers.push({ at: clock + 30000, id: requestId, fire: () => {
      if (saveRequests[requestId]) { delete saveRequests[requestId]; delete saveTimeouts[requestId]; resolve(gmRoll()); }
    } });
  }).then((r) => { results[requestId] = r; });
}
function processSaveRoll(message) {
  const requestId = message?.speaker?.token;
  if (!requestId) return true;
  if (!saveRequests[requestId]) return true;
  const t = timers.find(x => x.id === requestId); if (t) t.cancelled = true; // clearTimeout(saveTimeouts[requestId])
  const handler = saveRequests[requestId];
  delete saveRequests[requestId]; delete saveTimeouts[requestId];
  handler(message.rolls[0]);
  return true;
}
const advance = async (ms) => { clock += ms; for (const t of timers) if (!t.done && !t.cancelled && t.at <= clock) { t.done = true; t.fire(); } await null; await null; };

// dnd5e 6.0.6 rollSavingThrow on the phone: its own speaker, then the caller's `message` merged over it
const posted = [];
brekka.rollSavingThrow = async (config, dialog = {}, message = {}) => {
  const messageConfig = merge({ create: true, data: { speaker: ChatMessage.getSpeaker({ actor: brekka }) } }, message);
  const msg = { speaker: messageConfig.data.speaker, rolls: [{ total: 21, by: "phone", ability: config.ability }] };
  posted.push(msg); processSaveRoll(msg); // midi's renderChatMessageHTML hook on the DM's client
  return msg.rolls;
};

// ── 1: the relay ─────────────────────────────────────────────────────────────────────────────────────────────
const relay = [];
globalThis.Hooks.on = (name, fn) => { if (name === "midi-qol.preTargetSave") relay.push(fn); };
rpc.registerSaveRelay();
const workflow = { item: { name: "Spirit Exhaust" } };
const details = (actor) => ({ actorUuid: actor.uuid, rollAbilities: ["con"], rollType: "save", rollDC: 13 });
for (const [tok, actor] of [[barbTok, brekka], [clerTok, outsider]]) relay[0]({ document: tok, actor, id: tok.id }, workflow, details(actor));
const prompt = toUser.find(m => m.name === "savePrompt")?.payload;
check("the relayed save prompt carries the asked token's uuid (midi's request key is that token's id)",
  toUser.length === 1 && toUser[0].userId === "u1" && prompt?.tokenUuid === barbTok.uuid && prompt.abilities[0] === "con" && prompt.dc === 13, JSON.stringify(toUser));

// ── 2: the phone's roll, no canvas ───────────────────────────────────────────────────────────────────────────
const before = ChatMessage.getSpeaker({ actor: brekka });
check("(the bug) without it, a canvasless phone's speaker names no token", before.token === null);
const msgCfg = rpc.rollMessageFor(brekka, prompt.tokenUuid);
check("rollMessageFor names the asked token as the speaker", msgCfg?.data?.speaker?.token === "barbTok" && msgCfg.data.speaker.actor === brekka.id, JSON.stringify(msgCfg));
check("the card fallback (no uuid) names the actor's token on the active scene", rpc.rollMessageFor(brekka)?.data?.speaker?.token === "barbTok");
check("an actor with no token here gets {} (dnd5e's own speaker stands)", JSON.stringify(rpc.rollMessageFor({ id: "nobodyHere" })) === "{}");
const shell = fs.readFileSync(new URL("scripts/shell.js", REPO), "utf8");
check("the phone's save button rolls with it", /actor\?\.rollSavingThrow\?\.\(\{ ability \}, \{\}, rollMessageFor\(actor, s\?\.tokenUuid\)\)/.test(shell));
check("…and so do the roll-request card (skill, check, save) and downtime rolls",
  /a\.rollSkill\(\{ skill: p\.skill \}, \{\}, msg\)/.test(shell) && /a\.rollAbilityCheck\(\{ ability: p\.ability \}, \{\}, msg\)/.test(shell)
  && /a\.rollSavingThrow\(\{ ability: p\.ability \}, \{\}, msg\)/.test(shell) && /rollSkill\(\{ skill: r\.skill \}, \{\}, rollMessageFor\(actor\)\)/.test(shell));

// ── 3: the live flow against midi's matcher ──────────────────────────────────────────────────────────────────
const gmRolls = [];
const reqB = createPlayerChatSaveRequest(barbTok, () => { gmRolls.push("Test Barbarian"); return { total: 7, by: "gm" }; });
const reqC = createPlayerChatSaveRequest(clerTok, () => { gmRolls.push("Test Cleric"); return { total: 11, by: "gm" }; });
await advance(12000); // the phone taps Roll at 12 s, as in R3
await brekka.rollSavingThrow({ ability: "con" }, {}, rpc.rollMessageFor(brekka, prompt.tokenUuid));
await null; await null;
check("a phone save inside the window resolves its request: midi keeps the phone's 21", results.barbTok?.by === "phone" && results.barbTok.total === 21, JSON.stringify(results));
check("…and cancels that request's 30 s timeout", timers.find(t => t.id === "barbTok")?.cancelled === true);
await advance(18000); // 30 s
await Promise.all([reqB, reqC]);
check("at 30 s only the absent player's target (the Cleric) is rolled on the DM's side", JSON.stringify(gmRolls) === '["Test Cleric"]' && results.clerTok?.by === "gm", JSON.stringify(gmRolls));
check("the Barbarian's save stays the phone's 21 (not re-rolled)", results.barbTok.by === "phone");

// ── control: the old roll (no message) is never matched, and midi re-rolls it at 30 s ─────────────────────────
for (const k of Object.keys(results)) delete results[k];
gmRolls.length = 0;
const reqOld = createPlayerChatSaveRequest(barbTok, () => { gmRolls.push("Test Barbarian"); return { total: 7, by: "gm" }; });
await advance(12000);
await brekka.rollSavingThrow({ ability: "con" }); // the phone before the fix
await advance(18000); await reqOld;
check("(control) the old phone roll is ignored and midi re-rolls it at 30 s, as R3 saw", results.barbTok?.by === "gm" && gmRolls[0] === "Test Barbarian", JSON.stringify(results));

console.log(`\nall ${n} passed`);
