// A fake Foundry just rich enough to run mobile-command's action list headlessly — shared by
// tools/test-actions.mjs (the numbered checks) and tools/dump-actions.mjs (the deck mockup's data).
// No world, no server, no locks: nothing here touches a real Foundry.
import path from "node:path";

export async function installFakeFoundry() {
  const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
  const url = (f) => "file:///" + path.join(REPO, f).replace(/\\/g, "/");
  const MOD = "mobile-command";
  /* ── a fake Foundry, just rich enough ─────────────────────────────────────────────────────────── */
  const fired = [];   // one-shots broadcast (socketlib)
  const chats = [];   // chat cards + roll messages
  const notes = [];   // ui.notifications
  const rolls = [];   // queued Roll totals — push to set the next results
  let effectN = 0;

  const store = new Map();
  const settings = {
    get: (m, k) => store.get(k),
    set: async (m, k, v) => { await null; store.set(k, JSON.parse(JSON.stringify(v))); return v; },
  };

  function mkActor(id, name, owner) {
    const flags = {};
    const a = {
      id, name, type: "character", hasPlayerOwner: true, uuid: `Actor.${id}`,
      img: `art/${id}.webp`, prototypeToken: { texture: { src: `tokens/${id}.webp` } },
      system: { attributes: { hp: { max: 20 } } },
      effects: [], damage: [], flags: { [MOD]: flags },
      getFlag: (m, k) => flags[k],
      setFlag: async (m, k, v) => { await null; flags[k] = JSON.parse(JSON.stringify(v)); },
      unsetFlag: async (m, k) => { await null; delete flags[k]; },
      update: async (data) => {
        await null;
        for (const [k, v] of Object.entries(data)) {
          const f = /^flags\.mobile-command\.(-=)?(.+)$/.exec(k);
          if (f) { if (f[1]) delete flags[f[2]]; else flags[f[2]] = v; }
          else if (k === "system.attributes.inspiration") a.system.attributes.inspiration = v;
        }
      },
      createEmbeddedDocuments: async (t, docs) => { for (const d of docs) a.effects.push({ id: `fx${++effectN}`, ...d }); },
      deleteEmbeddedDocuments: async (t, ids) => { a.effects = a.effects.filter((e) => !ids.includes(e.id)); },
      applyDamage: async (parts) => { a.damage.push(parts); },
      testUserPermission: (u) => u.id === owner,
      // §40.6: an intro places a missing villain from its actor — the prototype token, as a plain token record
      getTokenDocument: async (data = {}) => ({ toObject: () => ({ name: a.name, actorId: a.id, width: 1, height: 1, texture: { src: a.prototypeToken.texture.src }, ...data }) }),
    };
    return a;
  }
  const withGet = (arr) => Object.assign(arr, { get: (id) => arr.find((x) => x.id === id) });

  const users = withGet([
    { id: "gm", name: "DM", isGM: true },
    { id: "u1", name: "Maya", isGM: false },
    { id: "u2", name: "Tom", isGM: false },
    { id: "tv", name: "Table", isGM: false },
  ]);
  const brekka = mkActor("a1", "Brekka", "u1");
  const gorbon = mkActor("a2", "Gorbon", "u2");
  const outsider = mkActor("a3", "Vex", "nobody");
  outsider.hasPlayerOwner = false; // an NPC: never on a player roster
  users.get("u1").character = brekka;
  users.get("u2").character = gorbon;
  // two of the Crooked Moon's villains, as the world would hold them once imported (§40.6 places their tokens)
  const crookedMan = mkActor("a4", "Crooked Man", "nobody");
  const pigeonHag = mkActor("a5", "Pigeon Hag", "nobody");
  for (const v of [crookedMan, pigeonHag]) { v.hasPlayerOwner = false; v.type = "npc"; }
  const actors = withGet([brekka, gorbon, outsider, crookedMan, pigeonHag]);
  actors.contents = actors;
  actors.importFromCompendium = async () => null;
  let tokenN = 0;
  const scene = {
    id: "s1", name: "12.1 The Crooked House", weather: "", flags: {}, getFlag: () => undefined,
    grid: { size: 100 }, dimensions: { sceneRect: { x: 0, y: 0, width: 3000, height: 2000 } },
    tokens: [{ id: "tk1", actor: brekka, x: 500, y: 500, width: 1, height: 1, hidden: false }, { id: "tk2", actor: gorbon, x: 600, y: 500, width: 1, height: 1, hidden: false }],
    createEmbeddedDocuments: async (type, docs) => docs.map((d) => {
      const t = { id: `tk${++tokenN + 2}`, hidden: false, x: 0, y: 0, width: 1, height: 1, ...d, actor: actors.get(d.actorId), parent: scene, getFlag: (m, k) => d.flags?.[m]?.[k] };
      scene.tokens.push(t); return t;
    }),
    updateEmbeddedDocuments: async (type, updates) => { for (const u of updates) { const t = scene.tokens.find((x) => x.id === u._id); if (t) Object.assign(t, u); } },
    // §26 weather (and anything else written flat onto the scene): top-level fields only
    update: async (data) => { await null; for (const [k, v] of Object.entries(data)) if (!k.includes(".")) scene[k] = v; },
  };
  for (const t of scene.tokens) t.parent = scene;
  const scenes = withGet([scene]);
  scenes.active = scene; scenes.viewed = scene;
  // Sequencer, as the intros use it for the map's burst at a change: every effect played is recorded here
  const seq = [];
  globalThis.Sequence = class { effect() { return this; } file(f) { this.f = f; return this; } atLocation(p) { this.p = p; return this; } size(s) { this.s = s; return this; } play() { seq.push({ file: this.f, at: this.p, size: this.s }); } };
  globalThis.Sequencer = { Database: { entryExists: () => true } };

  globalThis.game = {
    ready: true, user: users.get("gm"), users, actors, scenes, settings,
    packs: { get: () => null },
    modules: { get: () => ({ active: true }) },
    system: { id: "dnd5e", version: "5.3.3" },
    time: { worldTime: 0 },
    paused: false,
    togglePause(v) { this.paused = v === undefined ? !this.paused : !!v; return this.paused; }, // §40.6: a foe's intro pauses first
  };
  users.activeGM = users.get("gm");
  globalThis.canvas = { scene };
  globalThis.Hooks = { on() {}, once() {}, callAll() {} };
  globalThis.ui = { notifications: { info: (m) => notes.push(m), warn: (m) => notes.push(m), error: (m) => notes.push(m) } };
  globalThis.CONFIG = { Dice: { randomUniform: () => 0.005 } }; // the d100 comes up 1
  globalThis.Roll = class { constructor(f) { this.formula = f; } async evaluate() { this.total = rolls.shift() ?? 3; return this; } async toMessage(d, o) { chats.push({ ...d, rollMode: o?.rollMode }); } };
  globalThis.ChatMessage = { create: async (d) => { chats.push(d); }, getWhisperRecipients: () => [] };
  globalThis.fromUuid = async (u) => actors.find((a) => a.uuid === u) ?? null;
  class Stub { static mixin() { return Stub; } }
  const deep = () => new Proxy(function () {}, { get: (t, k) => (k === "prototype" ? {} : deep()), construct: () => ({}), apply: () => undefined });
  globalThis.foundry = {
    utils: { escapeHTML: (s) => String(s), deepClone: (o) => JSON.parse(JSON.stringify(o ?? null)) },
    applications: { api: { ApplicationV2: Stub, HandlebarsApplicationMixin: (c) => c, DialogV2: Stub }, ux: deep(), sheets: deep(), handlebars: deep() },
    canvas: deep(), data: deep(), documents: deep(), audio: deep(),
  };
  globalThis.socketlib = { registerModule: () => ({ register() {}, executeForEveryone: (n, p) => { fired.push(p); }, executeAsGM: async () => {} }) };

  store.set("displayOwnerUser", "tv");
  store.set("role", "auto");

  const rpc = await import(url("scripts/rpc.js"));
  rpc.initSocket();
  await import(url("scripts/actions-effects.js"));
  await import(url("scripts/actions-cm.js"));
  const A = await import(url("scripts/actions.js"));
  const live = await import(url("scripts/cm-live.js"));

  return { A, live, store, fired, chats, notes, rolls, seq, brekka, gorbon, outsider, users, MOD };
}
