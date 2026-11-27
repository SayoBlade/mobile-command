// Headless check of §62, the deck's Session 0 drawer (deck-command D-0242; DM 2026-11-27: *"Add a button for it in the deck
// for the landing in a session 0 drawer along with "remove all banners" in case I get stuck and test"*).
//
//   node tools/test-session-zero-keys.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import { installFakeFoundry } from "./fake-foundry.mjs";

const { A, store, fired } = await installFakeFoundry();
const { tableStep } = await import("../scripts/actions-effects.js");
const { overlaysUp, CLEAR_BOARDS } = await import("../scripts/effects.js");

let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const row = (id) => A.actionSnapshot({ area: "tv" }).find((r) => r.id === id);
const run = (id, p) => A.runAction(id, p);
const szCues = [];
{ const was = globalThis.Hooks.callAll; globalThis.Hooks.callAll = (name, p, ...r) => { if (name === "mobile-command.szEvent") szCues.push(p?.kind); return was?.(name, p, ...r); }; }

/* ── 1–2 the two rows ────────────────────────────────────────────────────────────────────────── */
{
  const t = row("sz.table"), c = row("tv.clearAll");
  check("the TV area carries Card table (a toggle) and Clear all (one press), under Session zero",
    t?.kind === "toggle" && c?.kind === "shot" && t.group === "Session zero" && c.group === "Session zero" && t.label === "Card table" && c.label === "Clear all",
    JSON.stringify([t, c]));
  check("both wear a picture: the card back and Foundry's cancel mark",
    /card-back\.png$/.test(t.art ?? "") && c.art === "icons/svg/cancel.svg", JSON.stringify([t.art, c.art]));
}

/* ── 3 the press, from where it stands ──────────────────────────────────────────────────────── */
check("the press: down and never opened → begin; down after → raise; up → lower",
  tableStep(false, false) === "begin" && tableStep(false, true) === "raise" && tableStep(true, true) === "lower" && tableStep(true, false) === "lower");

/* ── 4–6 the card table ─────────────────────────────────────────────────────────────────────── */
store.set("cardTableOn", false); store.set("szOpened", false);
{
  check("down, never opened: unlit, its sub-line says begin", row("sz.table").on === false && row("sz.table").sub === "begin", JSON.stringify(row("sz.table")));
  await run("sz.table");
  check("first press: the board up, the opening marked run and cued (as the panel's Begin session zero)",
    store.get("cardTableOn") === true && store.get("szOpened") === true && szCues.includes("opening") && row("sz.table").on === true && !row("sz.table").sub,
    JSON.stringify({ on: store.get("cardTableOn"), opened: store.get("szOpened"), szCues }));
  await run("sz.table");
  const cues = szCues.length;
  await run("sz.table");
  check("second press lowers it; a third raises it again WITHOUT replaying the opening",
    store.get("cardTableOn") === true && szCues.length === cues, JSON.stringify({ on: store.get("cardTableOn"), szCues }));
}

/* ── 7–10 clear all ─────────────────────────────────────────────────────────────────────────── */
{
  check("what counts as up: the table, the four boards, a player's overlay, the Moon's offer; weather is not",
    JSON.stringify(overlaysUp({ fx: { seance: true, rain: true, heartbeat: { users: ["u1"] }, rainbow: true }, cardTable: true, offer: { id: "o" } }))
      === JSON.stringify({ cardTable: true, boards: ["seance"], players: ["heartbeat"], offer: true })
      && CLEAR_BOARDS.join() === "seance,cmStation,cmIntro,cmTrain");
  store.set("cardTableOn", true); store.set("szOpened", true);
  store.set("fxActive", { seance: true, cmStation: true, cmIntro: { actor: "x" }, cmTicket: { users: ["u1"] }, woozy: { users: ["u2"] }, rain: true, rainbow: true });
  store.set("moonsDue", { count: 2, offer: { id: "o1", at: Date.now() } });
  fired.length = 0;
  await run("tv.clearAll");
  const fx = store.get("fxActive");
  check("one press: the table down, the boards and the phones' overlays off",
    store.get("cardTableOn") === false && !fx.seance && !fx.cmStation && !fx.cmIntro && !fx.cmTicket && !fx.woozy, JSON.stringify(fx));
  check("nothing else changed: the weather and filter kept, the Moon's count kept, the opening still marked run",
    fx.rain === true && fx.rainbow === true && store.get("moonsDue").count === 2 && store.get("szOpened") === true, JSON.stringify([fx, store.get("moonsDue")]));
  check("the Moon's Due offer is dropped, and every screen is told to clear its banners",
    store.get("moonsDue").offer == null && fired.some((p) => p?.id === "clearOverlays"), JSON.stringify([store.get("moonsDue"), fired]));
}
console.log(`ALL ${n} PASS`);
