// Headless check of masteries.js (§45) — no world, no server, no locks.
// Run: ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
//   "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" tools/test-masteries.mjs
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");

// The eight 2024 masteries, as dnd5e itself declares them (dnd5e.mjs DND5E.weaponMasteries).
// Mirrored here so the test fails loudly if the system ever adds or renames one and our copy
// table silently stops covering the set.
const DND5E_KEYS = ["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"];
globalThis.CONFIG = {
  DND5E: {
    weaponMasteries: Object.fromEntries(DND5E_KEYS.map(k => [k, { label: k[0].toUpperCase() + k.slice(1) }]))
  }
};

const M = await import("file:///" + path.join(REPO, "scripts/masteries.js").replace(/\\/g, "/"));

let fails = 0;
const ok = (n, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}${extra ? " — " + extra : ""}`); if (!cond) fails++; };

// 1. the table covers exactly what dnd5e ships
const ours = Object.keys(M.MASTERIES).sort();
ok("covers all 8 dnd5e masteries", ours.join(",") === [...DND5E_KEYS].sort().join(","), ours.join(","));

// 2. copy hygiene (UI-BIBLE §7): sentence case, one sentence-ish, never a rules citation
const badCase = ours.filter(k => !/^[A-Z]/.test(M.MASTERIES[k].line));
ok("every line is sentence case", badCase.length === 0, badCase.join(","));
const noStop = ours.filter(k => !M.MASTERIES[k].line.endsWith("."));
ok("every line ends in a full stop", noStop.length === 0, noStop.join(","));
const tooLong = ours.filter(k => M.MASTERIES[k].line.length > 95);
ok("no line outgrows a phone", tooLong.length === 0, tooLong.join(","));

// 3. labels come from dnd5e, with a readable fallback for anything it doesn't know
ok("label from dnd5e config", M.masteryLabel("vex") === "Vex");
ok("label falls back to the key", M.masteryLabel("hew") === "Hew");
ok("no key, no label", M.masteryLabel(null) === "");

// 4. the gate — the whole point. Graze is a MISS mastery; the rest are HIT masteries; Nick is
//    neither (it's about the extra attack riding along), so it shows either way.
const on = (k, hit) => !!M.masteryReminder(k, { hit });
ok("graze shows on a miss", on("graze", false));
ok("graze hidden on a hit", !on("graze", true));
for (const k of ["cleave", "push", "sap", "slow", "topple", "vex"]) {
  ok(`${k} shows on a hit`, on(k, true));
  ok(`${k} hidden on a miss`, !on(k, false));
}
ok("nick shows on a hit", on("nick", true));
ok("nick shows on a miss", on("nick", false));

// 4b. unknown outcome (the attack resolved but no total came back — the phone asserts NEITHER
//     hit nor miss there, and the reminder must follow the same rule).
ok("unknown outcome hides hit masteries", !on("vex", null));
ok("unknown outcome hides graze", !on("graze", null));
ok("unknown outcome still shows nick", on("nick", null));

// 4c. nothing at all for a weapon with no mastery
ok("no mastery, no card", M.masteryReminder(null, { hit: true }) === null);
ok("unknown mastery, no card", M.masteryReminder("hew", { hit: true }) === null);

// 5. the footer must never over-promise: "Applied for you" only when something is applying it
ok("effect + manual asks the DM", M.masteryReminder("sap", { hit: true }).foot === "Ask the DM to apply it.");
ok("effect + auto reports the fact", M.masteryReminder("sap", { hit: true, auto: true }).foot === "Applied for you.");
ok("nick footer is the same either way",
  M.masteryReminder("nick", { hit: true }).foot === M.masteryReminder("nick", { hit: true, auto: true }).foot);
// Cleave is the one automation takes away from the player.
ok("cleave manual tells the player to swing", /second creature/.test(M.masteryReminder("cleave", { hit: true }).foot));
ok("cleave auto hands it to the DM", /DM picks/.test(M.masteryReminder("cleave", { hit: true, auto: true }).foot));

// 6. masteryOf — mirrors dnd5e's own choice (remembered pick, else the first option)
const mkActivity = (options, lastPick) => ({
  id: "act1",
  item: {
    system: { masteryOptions: options },
    getFlag: (_ns, key) => (key === "last.act1.mastery" ? lastPick : undefined)
  }
});
const opts = [{ value: "vex" }, { value: "sap" }];
ok("no options → no mastery", M.masteryOf(mkActivity(null)) === null);
ok("empty options → no mastery", M.masteryOf(mkActivity([])) === null);
ok("defaults to the weapon's own mastery", M.masteryOf(mkActivity(opts)) === "vex");
ok("honours a remembered valid pick", M.masteryOf(mkActivity(opts, "sap")) === "sap");
ok("ignores a remembered pick that is no longer offered", M.masteryOf(mkActivity(opts, "topple")) === "vex");
ok("survives an activity with no item", M.masteryOf({ id: "x" }) === null);
ok("survives no activity at all", M.masteryOf(null) === null);

console.log(fails ? `\n${fails} FAILED` : "\nall green");
process.exit(fails ? 1 : 0);
