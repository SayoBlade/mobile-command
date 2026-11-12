// Prepare spells on the phone (DM 2026-11-13, deck-command D-0106; renders-2026-11-13/prepare-*.png).
// The rules (prepare-plan.js), Spell Book's setup as the executor reads it (prepare-data.js), a save against a fake
// world (never a delete; a swap only while the window is open), and the wiring on the phone.
// Run: node tools/test-prepare.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = await import(pathToFileURL(path.join(ROOT, "scripts", "prepare-plan.js")).href);
const D = await import(pathToFileURL(path.join(ROOT, "scripts", "prepare-data.js")).href);
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const sp = (uuid, level, o = {}) => ({ uuid, name: uuid, img: "", level, ritual: false, concentration: false, itemId: null, prepared: 0, ...o });
const wizard = (o = {}) => ({ id: "wizard", name: "Wizard", wizard: true, levels: 1, max: 4, cantripMax: 3, spellSwap: "longRest", cantripSwap: "longRest", swapsOpen: false, listSet: true,
  spells: [sp("acid", 0, { itemId: "i1" }), sp("hand", 0, { itemId: "i2" }), sp("light", 0, { itemId: "i3" }),
    sp("armor", 1, { itemId: "i4", prepared: 1 }), sp("missile", 1, { itemId: "i5", prepared: 1 }), sp("sleep", 1, { itemId: "i6", prepared: 1, concentration: true }),
    sp("thunder", 1, { itemId: "i7", prepared: 1 }), sp("detect", 1, { itemId: "i8", ritual: true, concentration: true }), sp("feather", 1, { itemId: "i9" }),
    sp("shield", 1, { itemId: "i10", prepared: 2 })], ...o });

// ── the rules ─────────────────────────────────────────────────────────────────────────────────────────────────────
const w = wizard();
const v = P.view(w, new Map());
check("grouped: cantrips first, then 1st level; rows alphabetical", v.groups.map((g) => g.label).join(",") === "Cantrips,1st level" && v.groups[1].rows[0].name === "armor");
check("Prepared x / max: four prepared of four; always-prepared (Shield) does not count", v.counts.spells.cur === 4 && v.counts.spells.max === 4 && !v.counts.spells.over);
check("cantrips count apart against their own limit (3 / 3)", v.counts.cantrips.cur === 3 && v.counts.cantrips.max === 3);
check("outside the swap window a prepared spell is locked and says why ('After a long rest')", P.canToggle(w, w.spells[3], new Map()).why === "After a long rest");
check("…a free place can still be filled: an unprepared spell turns on", P.canToggle(w, w.spells[8], new Map()).ok);
check("…and what you turned on this session can be turned off again (changing your mind is not a swap)", (() => { const m = new Map([["feather", true]]); return P.canToggle(w, w.spells[8], m).ok; })());
const open = wizard({ swapsOpen: true });
check("inside the window (after a long rest) a prepared spell can be swapped out", P.canToggle(open, open.spells[3], new Map()).ok);
check("a level-up class says 'At your next level'; a class that never swaps says so", P.canToggle(wizard({ spellSwap: "levelUp" }), w.spells[3], new Map()).why === "At your next level"
  && P.canToggle(wizard({ spellSwap: "none" }), w.spells[3], new Map()).why === "Kept for good");
check("cantrips cannot be unticked here (never delete); always-prepared is locked", P.canToggle(open, open.spells[0], new Map()).why === "Cantrips stay" && P.canToggle(open, open.spells[9], new Map()).why === "Always prepared");
check("in a fight nothing changes", P.canToggle(open, open.spells[8], new Map(), { inCombat: true }).why === "Not during a fight");

const five = new Map([["feather", true]]);
check("one too many WARNS: Save reads 'Save Anyway'", (() => { const s = P.saveState(w, five); return s.ok && s.label === "Save Anyway" && s.warn; })());
check("…the world setting can make it BLOCK", (() => { const s = P.saveState(w, five, { over: "block" }); return !s.ok && /untick/.test(s.why); })());
check("filter chips: Rituals shows Detect Magic only; Concentration adds Sleep; none shows all",
  P.view(w, new Map(), { filters: new Set(["ritual"]) }).groups.flatMap((g) => g.rows.map((r) => r.name)).join() === "detect"
  && P.view(w, new Map(), { filters: new Set(["ritual", "concentration"]) }).groups.flatMap((g) => g.rows.map((r) => r.name)).sort().join() === "detect,sleep");

const swap = new Map([["thunder", false], ["detect", true]]);
const plan = P.planSave(open, swap);
check("a save UNPREPARES (prepared 0) and never deletes: there is no delete in a plan", JSON.stringify(plan.update) === JSON.stringify([{ itemId: "i7", prepared: 0 }, { itemId: "i8", prepared: 1 }]) && !("delete" in plan));
check("…a swap out is marked, so the window closes after it", plan.swappedOut === true && P.planSave(w, five).swappedOut === false);
check("…Spell Book's preparedSpellsByClass keys follow ('<class>:<uuid>', cantrips included, always-prepared not)", plan.keys.includes("wizard:detect") && !plan.keys.includes("wizard:thunder")
  && plan.keys.includes("wizard:acid") && !plan.keys.includes("wizard:shield"));
const cleric = { id: "cleric", name: "Cleric", wizard: false, levels: 1, max: 4, cantripMax: 3, spellSwap: "longRest", swapsOpen: true, listSet: true,
  spells: [sp("Compendium.p.spells.Item.bless", 1, { itemId: "c1", prepared: 1 }), sp("Compendium.p.spells.Item.command", 1), sp("Compendium.p.spells.Item.guidance", 0)] };
check("a class-list spell not on the sheet is CREATED when ticked (a cantrip too)", JSON.stringify(P.planSave(cleric, new Map([["Compendium.p.spells.Item.command", true], ["Compendium.p.spells.Item.guidance", true]])).create)
  === JSON.stringify([{ uuid: "Compendium.p.spells.Item.command", level: 1 }, { uuid: "Compendium.p.spells.Item.guidance", level: 0 }]));
check("no list set for a class: the screen says the DM sets it in Spell Book", P.view({ ...cleric, spells: [], listSet: false }, new Map()).empty.includes("Spell Book"));

// ── Spell Book's setup ─────────────────────────────────────────────────────────────────────────────────────────────
check("Spell Book's defaults, modern: Wizard swaps on a long rest (spells and cantrips), Cleric spells on a long rest, Bard at a level-up",
  D.ruleDefaults("wizard", "modern").spellSwapping === "longRest" && D.ruleDefaults("wizard", "modern").cantripSwapping === "longRest"
  && D.ruleDefaults("cleric", "modern").spellSwapping === "longRest" && D.ruleDefaults("bard", "modern").spellSwapping === "levelUp");
check("…legacy: Paladin and Ranger show no cantrips; Ranger swaps at a level-up", D.ruleDefaults("paladin").showCantrips === false && D.ruleDefaults("ranger").spellSwapping === "levelUp");
check("cantrip limit: the first scale key Spell Book's setting names, + its bonus; none when the class shows no cantrips",
  D.cantripMax({ "cantrips-known": { value: 3 } }, "cantrips-known, cantrips", { cantripPreparationBonus: 1 }) === 4
  && D.cantripMax({ cantrips: 2 }, "cantrips-known, cantrips") === 2 && D.cantripMax({ "cantrips-known": 3 }, undefined, { showCantrips: false }) === 0);
check("prepared limit: dnd5e's class preparation max + Spell Book's bonus", D.preparedMax({ system: { spellcasting: { preparation: { max: 4 } } } }, { spellPreparationBonus: 1 }) === 5);
check("the swap window: open at first setup, after a long rest, or at a new level (level-up rule); otherwise shut",
  D.swapOpen(undefined, "longRest", 1) && D.swapOpen({ open: true, level: 1 }, "longRest", 1) && !D.swapOpen({ open: false, level: 1 }, "longRest", 2)
  && D.swapOpen({ open: false, level: 1 }, "levelUp", 2) && !D.swapOpen({ open: false, level: 2 }, "levelUp", 2));
check("Spell Book's own long-rest prompt is recognised (the phone closes it and offers ours)", D.isSpellBookRestPrompt({ options: { classes: ["spell-book"], window: { icon: "fas fa-bed" } } })
  && !D.isSpellBookRestPrompt({ options: { classes: ["spell-book"], window: { icon: "fas fa-book" } } }));

// ── a save against a fake world ────────────────────────────────────────────────────────────────────────────────────
const writes = { updates: [], creates: [], actor: [], deletes: 0 };
const item = (id, name, level, o = {}) => ({ id, type: "spell", name, img: "", system: { level, prepared: 0, method: "spell", properties: [], ...o }, _stats: { compendiumSource: `Compendium.phb.spells.Item.${id}` } });
const actor = {
  id: "A1", isOwner: true, flags: { "spell-book": { classRules: { cleric: { customSpellList: ["JournalEntry.L.JournalEntryPage.list"], spellSwapping: "longRest" } } }, "mobile-command": { prepare: { cleric: { open: false, level: 1 } } } },
  system: { scale: { cleric: { "cantrips-known": { value: 3 } } } },
  items: [{ type: "class", name: "Cleric", system: { identifier: "cleric", levels: 1, spellcasting: { progression: "full", preparation: { max: 2 } } } },
    item("bless", "Bless", 1, { prepared: 1 }), item("cure", "Cure Wounds", 1, { prepared: 1 })],
  async updateEmbeddedDocuments(_t, u) { writes.updates.push(...u); }, async createEmbeddedDocuments(_t, c) { writes.creates.push(...c); },
  async deleteEmbeddedDocuments() { writes.deletes += 1; }, async update(u) { writes.actor.push(u); },
};
const index = new Map([["bless", { name: "Bless", img: "", system: { level: 1, properties: ["concentration"] } }], ["cure", { name: "Cure Wounds", img: "", system: { level: 1, properties: [] } }],
  ["command", { name: "Command", img: "", system: { level: 1, properties: [] } }], ["detect", { name: "Detect Magic", img: "", system: { level: 1, properties: ["ritual", "concentration"] } }]]);
const g = {
  game: { settings: { get: (m, k) => (k === "cantripScaleValues" ? "cantrips-known, cantrips" : k === "prepareOverLimit" ? "warn" : k === "spellcastingRuleSet" ? "modern" : undefined) },
    packs: { get: (id) => (id === "phb.spells" ? { getIndex: async () => index } : null) }, combat: null,
    items: { fromCompendium: async (src) => ({ name: src.name, system: { level: src.level } }) } },
  fromUuid: async (u) => (u === "JournalEntry.L.JournalEntryPage.list" ? { system: { spells: new Set(["bless", "cure", "command", "detect"].map((x) => `Compendium.phb.spells.Item.${x}`)) } }
    : u.startsWith("Compendium.phb.spells.Item.") ? { name: index.get(u.split(".").pop()).name, level: 1 } : null),
};
const data = await D.gatherPrepare(actor, g);
const cl = data.classes[0];
check("the executor reads the class list from Spell Book's rules, the sheet's spells marked, the limit from dnd5e", cl.id === "cleric" && cl.spells.length === 4 && cl.max === 2 && cl.cantripMax === 3
  && cl.spells.find((s) => s.name === "Bless").itemId === "bless" && cl.spells.find((s) => s.name === "Command").itemId === null && cl.swapsOpen === false);
const refused = await D.savePrepare(actor, "cleric", { "Compendium.phb.spells.Item.cure": false }, g);
check("outside the window the executor REFUSES a swap out, whatever the phone sends", !refused.ok && /long rest/i.test(refused.reason) && !writes.updates.length);
actor.flags["mobile-command"].prepare.cleric.open = true;
const ok = await D.savePrepare(actor, "cleric", { "Compendium.phb.spells.Item.cure": false, "Compendium.phb.spells.Item.command": true }, g);
check("inside the window: Cure Wounds unprepared (prepared 0), Command created from the compendium", ok.ok && JSON.stringify(writes.updates) === JSON.stringify([{ _id: "cure", "system.prepared": 0 }])
  && writes.creates.length === 1 && writes.creates[0].system.prepared === 1 && writes.creates[0].system.sourceItem === "class:cleric" && writes.creates[0].system.method === "spell");
check("NOTHING was deleted", writes.deletes === 0);
const flags = writes.actor.at(-1);
check("Spell Book's preparedSpellsByClass is kept in step, and the swap window closes after the swap",
  JSON.stringify(flags["flags.spell-book.preparedSpellsByClass"].cleric.sort()) === JSON.stringify(["cleric:Compendium.phb.spells.Item.bless", "cleric:Compendium.phb.spells.Item.command"])
  && flags["flags.mobile-command.prepare.cleric"].open === false);
check("a long rest opens the window again (the class's rule is the long rest)", await D.openWindowsAfterRest(actor, { longRest: true }, g) && writes.actor.at(-1)["flags.mobile-command.prepare.cleric"].open === true
  && !(await D.openWindowsAfterRest(actor, { longRest: false }, g)));

// ── the wiring on the phone ────────────────────────────────────────────────────────────────────────────────────────
const shell = fs.readFileSync(path.join(ROOT, "scripts", "shell.js"), "utf8");
const rpc = fs.readFileSync(path.join(ROOT, "scripts", "rpc.js"), "utf8");
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
check("the Spells tab opens it (top of the tab), and the long-rest card offers 'Change Prepared Spells'",
  shell.includes("${this.#searchDrawerHTML()}${prepBtn}") && shell.includes('kind === "long" ? this.#prepareButtonHTML(actor, { rest: true })') && shell.includes("Change Prepared Spells"));
check("tap a name to read it (the shell's own card, over the screen); ✕ and Cancel close; Save goes through the executor",
  shell.includes('case "prep-read": return this.#openLinkDetails(el.dataset.uuid);') && shell.includes("if (this.#prep) return this.#prepareHTML();")
  && /if \(this\.#detailCard\) return this\.#detailCardHTML\(\);\r?\n {4}if \(this\.#prep\)/.test(shell) && shell.includes("rpc.prepareSave({ actorUuid: actor.uuid, classId: cls.id"));
check("the executor checks the requester owns the character, both ways", (rpc.match(/requesterCanAct\(requesterId, actor\)\) return \{ ok: false, reason: "not your character" \}/g) ?? []).length === 2);
check("a long rest opens the windows; on a phone Spell Book's own prompt is closed", main.includes('Hooks.on("dnd5e.restCompleted", (actor, result) => { openWindowsAfterRest(')
  && main.includes("if (isSpellBookRestPrompt(app)) app.close();"));
console.log(`\nall ${n} passed`);
