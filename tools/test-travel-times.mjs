// T2 (deck-command MC-PATCHES-2026-11-09), DM 2026-11-09: "Let's go with time and not miles for travel (leave miles for
// dm) and let's set times based on the book description." A road on Wickermoor Hollow is a ROUTE (the pin left, the pin
// drawn to) and takes the book's time; the walk advances the clock by it; the table hears the time, never miles.
// The pins are 6x's Wickermoor Hollow Notes (ids and positions from deck-command MAP-RESTORE.json).
//
//   ELECTRON_RUN_AS_NODE=1 "…/Foundry Virtual Tabletop.exe" tools/test-travel-times.mjs   (or plain node)
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
const { users } = await installFakeFoundry();
const REPO = new URL("..", import.meta.url);
const T = await import(new URL("scripts/travel-times.js", REPO));
const rpc = await import(new URL("scripts/rpc.js", REPO));

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const J = (v) => JSON.stringify(v);

// ── Wickermoor Hollow's chapter pins, as 6x has them ────────────────────────────────────────────────────────
const PINS = [["4CGate3VkKrjuKq4", 1966, 1080], ["9ZxcQAzfIMns37Iv", 1805, 1063], ["F9mWZrE8nHKcjTJp", 1550, 650], ["GGOOtwS040uDV95D", 1600, 1450],
  ["N4oqjvgh1JRR1por", 1701, 1075], ["Ti8GMcjUHag7Aicq", 950, 1031], ["U4Rj4fYVfRJ8aVYS", 1993, 1247], ["WhdvDjPBO39Ul6GV", 981, 602],
  ["ZYMMZ0vJ3IkrWz1h", 1250, 950], ["atxNfGVTBDHcuekR", 813, 1417], ["cgOZbUXvfMdbYa6l", 1770, 920], ["fp7SS6QSmuJKRUKt", 1721, 1313],
  ["haimRSHVS9MOVYJg", 2104, 586], ["uUEd2cmoalleiE91", 2421, 1009], ["uiuqih19BNSbMcWS", 2232, 1467]].map(([id, x, y]) => ({ id, x, y }));
const hollow = { id: T.HOLLOW_SCENE, notes: PINS, flags: {} };
const at = (id, dx = 0, dy = 0) => { const p = PINS.find((q) => q.id === id); return { x: p.x + dx, y: p.y + dy }; };
const road = (a, b) => [at(a, 50, 0), { x: 1660, y: 1380 }, at(b)]; // starts at the party token's centre, by the pin

// 1. R4's road: the party dropped by the Ch 10 pin (token centre 1650,1450), drawn to the village
let r = T.routeOf(hollow, road("GGOOtwS040uDV95D", "fp7SS6QSmuJKRUKt"));
check("the wreck (Ch 10) → the village: { hours: 4 }", r.from === "GGOOtwS040uDV95D" && r.to === "fp7SS6QSmuJKRUKt" && J(r.time) === '{"hours":4}', J(r));
// 2. from the village
const from = (to) => T.routeOf(hollow, road("fp7SS6QSmuJKRUKt", to)).time;
check("village → Ch 13 Foxwillow: 1–2 nights; → Ch 19 Maidenmist: 1–2 nights", J(from("uUEd2cmoalleiE91")) === '{"nights":[1,2]}' && J(from("uiuqih19BNSbMcWS")) === '{"nights":[1,2]}');
check("village → Ch 16 Skitterdeep Mine: 3–5 nights (and every other valley area the book lumps in)",
  ["ZYMMZ0vJ3IkrWz1h", "atxNfGVTBDHcuekR", "haimRSHVS9MOVYJg", "Ti8GMcjUHag7Aicq", "WhdvDjPBO39Ul6GV", "4CGate3VkKrjuKq4", "cgOZbUXvfMdbYa6l", "F9mWZrE8nHKcjTJp"].every((p) => J(from(p)) === '{"nights":[3,5]}'));
check("village → Ch 12 Crooked House (and 21, 22): null, the book gives no time", ["N4oqjvgh1JRR1por", "U4Rj4fYVfRJ8aVYS", "9ZxcQAzfIMns37Iv"].every((p) => from(p) === null));
check("back to the village takes the road-out time; Ch 10 ← village: 4 hours", J(T.routeOf(hollow, road("ZYMMZ0vJ3IkrWz1h", "fp7SS6QSmuJKRUKt")).time) === '{"nights":[3,5]}' && J(T.routeOf(hollow, road("fp7SS6QSmuJKRUKt", "GGOOtwS040uDV95D")).time) === '{"hours":4}');
check("between two pins neither of which is the village: null (the book measures only from it)", T.routeOf(hollow, road("ZYMMZ0vJ3IkrWz1h", "atxNfGVTBDHcuekR")).time === null);
// 3. no route / off the Hollow / too far from a pin
check("a road off the Hollow, or ending far from any pin: no time", T.routeOf({ ...hollow, id: "elsewhere" }, road("GGOOtwS040uDV95D", "fp7SS6QSmuJKRUKt")).time === null
  && T.routeOf(hollow, [at("GGOOtwS040uDV95D", 50, 0), { x: 300, y: 300 }]).time === null);
// 4. the ROUTE's time, not the line's length
const wiggly = [at("GGOOtwS040uDV95D", 50, 0), { x: 300, y: 1900 }, { x: 2600, y: 200 }, { x: 900, y: 1700 }, at("fp7SS6QSmuJKRUKt")];
check("a long winding line between the same two pins is still 4 hours (the route, not the length)", J(T.routeOf(hollow, wiggly).time) === '{"hours":4}');
check("the two nearest pins (Ch 12 / Ch 22, 104 px apart) are told apart", T.pinAt(PINS, at("N4oqjvgh1JRR1por", 10, 5)) === "N4oqjvgh1JRR1por" && T.pinAt(PINS, at("9ZxcQAzfIMns37Iv", -10, 5)) === "9ZxcQAzfIMns37Iv");
check("his scene flag overrides a row (Ch 12 set to 1 hour; Ch 16 set to null)",
  J(T.routeOf({ ...hollow, flags: { "mobile-command": { travelTimes: { N4oqjvgh1JRR1por: { hours: 1 }, ZYMMZ0vJ3IkrWz1h: null } } } }, road("fp7SS6QSmuJKRUKt", "N4oqjvgh1JRR1por")).time) === '{"hours":1}'
  && T.routeOf({ ...hollow, flags: { "mobile-command": { travelTimes: { ZYMMZ0vJ3IkrWz1h: null } } } }, road("fp7SS6QSmuJKRUKt", "ZYMMZ0vJ3IkrWz1h")).time === null);

// ── the clock and the words ─────────────────────────────────────────────────────────────────────────────────
check("the clock runs the book's time: 4 hours = 4 h; 1–2 nights = 24 h; 3–5 nights = 72 h (the low end, his to extend)",
  T.bookHours({ hours: 4 }) === 4 && T.bookHours({ nights: [1, 2] }) === 24 && T.bookHours({ nights: [3, 5] }) === 72 && T.bookHours(null) === null);
check("the words: '4 hours' · '1–2 nights' · '3–5 nights' · '1 night' · null",
  T.travelTimeLabel({ hours: 4 }) === "4 hours" && T.travelTimeLabel({ nights: [1, 2] }) === "1–2 nights" && T.travelTimeLabel({ nights: [3, 5] }) === "3–5 nights" && T.travelTimeLabel({ nights: [1] }) === "1 night" && T.travelTimeLabel(null) === null);

// ── what the table hears ────────────────────────────────────────────────────────────────────────────────────
for (const u of users) u.active = true;
const res = rpc.broadcastTravelNotice({ label: "4 hours" });
check("the walk tells every player client the time (players and the TV account; not the GM)", res.ok && toUser.length === 3 && toUser.every((m) => m.name === "travelNotice" && m.payload.label === "4 hours" && !("miles" in m.payload)), J(toUser));
let heard = null; const realCall = Hooks.callAll; Hooks.callAll = (h, p) => { if (h === "mobile-command.travelNotice") heard = p; };
handlers.travelNotice.call({ socketdata: { userId: "u1" } }, { label: "99 miles" });
check("a notice not sent by a GM is ignored", heard === null);
handlers.travelNotice.call({ socketdata: { userId: "gm" } }, { label: "4 hours" });
check("…the GM's is heard", heard?.label === "4 hours");
Hooks.callAll = realCall;

// ── the wiring (read from the source) ───────────────────────────────────────────────────────────────────────
const panel = fs.readFileSync(new URL("scripts/dm-panel.js", REPO), "utf8"), keys = fs.readFileSync(new URL("scripts/actions-travel.js", REPO), "utf8"), shell = fs.readFileSync(new URL("scripts/shell.js", REPO), "utf8");
check("a drawn road keeps its route and book time; travelState() carries `time` beside `miles`",
  panel.includes("travelRouteInfo = { miles, time: route.time, from: route.from, to: route.to };") && panel.includes("time: travelRouteInfo?.time ?? null,"));
check("the walk's clock uses the book's hours when there are some (else the DM's pace, as before)",
  panel.includes("const totalHours = bookHours(travelRouteInfo.time) ?? Math.max(1, Math.round(travelRouteInfo.miles * 8 / travelMilesPerDay(group)));"));
check("MC's deck keys say the time ('4 hours · the clock runs'); miles only when the book gives none",
  keys.includes("travelTimeLabel(s.time) ?? `${Math.round(s.miles)} mi`") && keys.includes("`${routeWords(s)} · the clock runs`") && !/Math\.round\(s\.miles\)\} mi · /.test(keys));
check("the phone shows 'On the road: 4 hours.' and the TV a caption; neither ever says miles",
  shell.includes("notifier.info(`On the road: ${label}.`)") && shell.includes("el.textContent = `On the road · ${label}`") && !/On the road[^\n]*mi\b/.test(shell));

console.log(`\nall ${n} passed`);
