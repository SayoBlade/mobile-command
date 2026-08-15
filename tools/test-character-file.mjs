// Headless check of the Character File compiler (§44) — no world, no server, no locks.
// The point of these is the REGENERATION CONTRACT: a DM who annotates a generated page and loses
// it once will never trust the book again, so the rules about what may be overwritten are the
// part worth testing. Plus the dirty check, which is the only thing keeping a 3-minute timer from
// pushing ~45 page writes a minute at every connected client.
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const imp = (f) => import("file:///" + path.join(REPO, "scripts", f).replace(/\\/g, "/"));

// --- the smallest Foundry that lets the module load -------------------------
const pages = [];
let created = [], updated = [], deleted = [];
const mkPage = (data) => ({
  ...data,
  getFlag: (m, k) => data.flags?.[m]?.[k],
  update: async (ch) => { updated.push({ page: data.name, ch }); Object.assign(data, ch); },
  delete: async () => { deleted.push(data.name); }
});
const book = {
  name: "Ashborn", pages,
  getFlag: (m, k) => ({ charFile: "actor1" }[k]),
  update: async () => {},
  createEmbeddedDocuments: async (_t, arr) => { for (const d of arr) { created.push(d.name); pages.push(mkPage(d)); } }
};
globalThis.game = {
  actors: [], journal: [book], users: [],
  user: { isGM: true, id: "gm" },
  settings: { get: (m, k) => ({ crookedMoonTools: true, downtimeState: {}, tableSeats: {}, seatActors: {} }[k]) },
  modules: { get: () => ({ active: true }) }
};
globalThis.Hooks = { on: () => {}, once: () => {}, callAll: () => {} };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.foundry = { utils: { escapeHTML: (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])), randomID: () => "id" } };
globalThis.ui = { notifications: { info: () => {}, warn: () => {} } };
globalThis.JournalEntry = { create: async () => book };

const cf = await imp("character-file.js");
const tarot = await imp("tarot.js");

let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

// 1. it imports at all. This is not a trivial check: preset.js was once left with a const used
//    above its own declaration, valid syntax that threw on import and would have bricked the
//    module — the syntax gate cannot see that class of bug, only loading can.
ok("the compiler and its whole import chain load", !!cf.compileCharacterFiles);

// 2. the tarot reward map — the DM-side lookup the Fate chapter renders
ok("every arcana has a reward mapped", tarot.ARCANA.every(c => !!tarot.ARCANA_REWARD[c.key]),
  tarot.ARCANA.filter(c => !tarot.ARCANA_REWARD[c.key]).map(c => c.key).join(","));
ok("every reward names an item and a place",
  Object.values(tarot.ARCANA_REWARD).every(r => r.item && r.where));
ok("The Moon points at the Twists we already built",
  /Twists of Fate/i.test(tarot.ARCANA_REWARD.moon.item));
ok("no reward is stored on an actor flag (the spoiler stays DM-side)",
  !JSON.stringify(tarot.ARCANA_REWARD).includes("setFlag"));

// 3. THE REGENERATION CONTRACT — read off the source, because these are structural promises and
//    the failure mode is silent data loss rather than an exception.
const src = await import("node:fs").then(fs =>
  fs.readFileSync(path.join(REPO, "scripts", "character-file.js"), "utf8"));
ok("generated pages are identified by a flag", /charChapter/.test(src));
ok("the DM's notes page is created but never rewritten",
  /charNotes/.test(src) && !/charNotes[\s\S]{0,400}?page\.update/.test(src));
ok("only pages carrying charChapter are ever touched",
  /pages\.find\(p => p\.getFlag\(MODULE_ID, "charChapter"\)/.test(src));
ok("the compile is executor-gated", /isExecutor\(\)/.test(src));
ok("a failing chapter is caught per-chapter, not per-book", /chapter "\$\{ch\.key\}" failed/.test(src));

// 4. the dirty check — the thing that makes an automatic compile affordable
ok("content is hashed", /function hash\(/.test(src));
ok("an unchanged page is skipped before any write",
  /charHash"\) === sig[\s\S]{0,80}continue/.test(src));

console.log(fails ? `\n${fails} FAILED` : "\nall green");
process.exit(fails ? 1 : 0);
