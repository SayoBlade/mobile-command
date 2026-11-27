// The active PC, one lookup (scripts/active-pc.js; §38.4b; deck-command D-0241): the DM's pick when it names a character that
// player owns, else the assigned character. The panel, the Tarot and the deck's landing table all read it. Run: node tools/test-active-pc.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, d = "") { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${d}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const A = await import(pathToFileURL(path.join(ROOT, "scripts", "active-pc.js")).href);

const pc = (id, owners, type = "character") => ({ id, type, testUserPermission: (u, lvl) => lvl === "OWNER" && owners.includes(u.id) });
const brekka = pc("brekka", ["u1"]), vos = pc("vos", ["u1"]), other = pc("other", ["u2"]), wolf = pc("wolf", ["u1"], "npc");
const actors = new Map([brekka, vos, other, wolf].map((a) => [a.id, a]));
const u1 = { id: "u1", character: brekka };
const get = (id) => actors.get(id) ?? null;

check("no pick: the assigned character", A.resolveActivePC(u1, undefined, get) === brekka);
check("the DM's pick wins over the assigned character", A.resolveActivePC(u1, "vos", get) === vos);
check("a pick the player does not own is ignored", A.resolveActivePC(u1, "other", get) === brekka);
check("a pick that is not a character is ignored", A.resolveActivePC(u1, "wolf", get) === brekka);
check("a pick that no longer exists is ignored", A.resolveActivePC(u1, "gone", get) === brekka);
check("no pick and no assigned character: none", A.resolveActivePC({ id: "u3", character: null }, undefined, get) === null);
check("no user: none", A.resolveActivePC(null, "vos", get) === null);

globalThis.foundry = { utils: { deepClone: (x) => JSON.parse(JSON.stringify(x)) } };
globalThis.game = { settings: { get: (m, k) => (k === "seatActors" ? { u1: "vos" } : null) }, actors: { get }, users: { get: (id) => (id === "u1" ? u1 : null) } };
check("activePC(user) reads the seatActors setting", A.activePC(u1) === vos);
check("activePC(userId) takes an id too", A.activePC("u1") === vos && A.activePC("nobody") === null);

const src = (f) => fs.readFileSync(path.join(ROOT, "scripts", f), "utf8");
check("published as MobileCommand.activePC", /activePC: \(user\) => activePC\(user\),/.test(src("main.js")) && /import \{ activePC \} from "\.\/active-pc\.js";/.test(src("main.js")));
check("the panel uses it (no private copy left)", /import \{ activePC, seatActors \} from "\.\/active-pc\.js";/.test(src("dm-panel.js")) && !/^function activePC\(/m.test(src("dm-panel.js")));
check("the Tarot uses it", /return activePC\(user\);/.test(src("tarot.js")));
console.log(`\nAll ${n} passed.`);
