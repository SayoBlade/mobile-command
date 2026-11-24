// A phone's rolls throw Dicer dice on the TV (DM 2026-11-24: "the dice rolls weren't showing up on tv").
// Cause: midi throws only when game.dice3d.isEnabled() on the ROLLING screen (dice3dEnabled, midi-qol 14.7.1) and marks
// the dice "shown" either way (DSNMarkDiceDisplayed), so the TV's Dicer skips them in the chat card. Since 376c6dd a
// phone's Dicer is off, so a phone roll was thrown nowhere (seen in the world: Test Barbarian's 2026-11-23 Animal
// Handling check, d20 marked hidden). Fix: scripts/dicer-midi.js sharePhoneDice.
// The fakes copy the ORDER of the real code: midi's displayDSNForRoll and Dicer 1.4.11's showForRoll (broadcast when
// synchronize, THEN `if(!enabled) return false`, then draw).
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-dicer-phone-tv.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}${detail ? ` — got ${detail}` : ""}`); console.log("Stopped at the first failure."); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const B = await import(pathToFileURL(path.join(ROOT, "scripts", "dicer-midi.js")).href);

// Dicer's game.dice3d on one screen: `enabled` is that browser's "Enable 3D dice".
function dicer(enabled) {
  const d = { enabled, sent: [], drawn: 0 };
  d.isEnabled = function () { return !!d.enabled; };
  d.showForRoll = async function (roll, user, sync = false, whisper = null, blind = false) {
    if (sync) d.sent.push({ to: Array.isArray(whisper) && whisper.length ? whisper : "everyone", blind });
    if (!d.enabled) return false;
    d.drawn += 1; return true;
  };
  return d;
}
// midi's displayDSNForRoll, cut to what decides a throw (the bridge has made installedModules say dice-so-nice).
async function midiRoll(d3, { whisper = null, blind = false } = {}) {
  const roll = { results: [{ result: 14 }] };
  if (Boolean(d3.isEnabled?.())) await d3.showForRoll(roll, { id: "player" }, true, whisper, blind, null, null);
  roll.results.forEach((r) => { r.hidden = true; });       // DSNMarkDiceDisplayed: always
  return roll;
}
const tvSees = (phone, roll) => phone.sent.some((s) => s.to === "everyone") || roll.results.some((r) => !r.hidden);
const noWait = { calls: [], fn: async (ms) => { noWait.calls.push(ms); } };

// ── 1. the bug: a phone with Dicer off sends nothing, and the chat card's dice are marked shown ─────────
{
  const phone = dicer(false);
  const roll = await midiRoll(phone);
  check("before the fix a phone roll reaches no screen (nothing sent, dice marked shown)", !tvSees(phone, roll), JSON.stringify(phone.sent));
}
// ── 2–5. the fix on a phone ─────────────────────────────────────────────────────────────────────────
{
  const phone = dicer(false); noWait.calls = [];
  const took = B.sharePhoneDice(phone, { isPhone: () => true, hold: 2500, wait: noWait.fn });
  check("the wraps take on Dicer's game.dice3d", took === true);
  const roll = await midiRoll(phone);
  check("midi now throws: the dice go to every screen (the TV among them)", phone.sent.length === 1 && phone.sent[0].to === "everyone" && tvSees(phone, roll), JSON.stringify(phone.sent));
  check("…and the phone draws none itself (Dicer stays off here)", phone.drawn === 0 && phone.enabled === false, String(phone.drawn));
  check("the phone holds midi 2.5 s so the result does not beat the TV's dice", JSON.stringify(noWait.calls) === "[2500]", JSON.stringify(noWait.calls));
}
// ── 6. a blind roll from a phone still goes to the GM only ──────────────────────────────────────────
{
  const phone = dicer(false);
  B.sharePhoneDice(phone, { isPhone: () => true, wait: noWait.fn });
  await midiRoll(phone, { whisper: ["gm"], blind: true });
  check("a blind roll: sent to the GM alone, never to everyone", phone.sent.length === 1 && JSON.stringify(phone.sent[0].to) === '["gm"]' && phone.sent[0].blind === true, JSON.stringify(phone.sent));
}
// ── 7. an unsynchronized call is not held ───────────────────────────────────────────────────────────
{
  const phone = dicer(false); noWait.calls = [];
  B.sharePhoneDice(phone, { isPhone: () => true, wait: noWait.fn });
  await phone.showForRoll({}, null, false);
  check("a local-only call (not sent anywhere) is not held", noWait.calls.length === 0, JSON.stringify(noWait.calls));
}
// ── 8–10. screens that are not phones are untouched ────────────────────────────────────────────────
{
  const tv = dicer(true); noWait.calls = [];
  B.sharePhoneDice(tv, { isPhone: () => false, wait: noWait.fn });
  await midiRoll(tv);
  check("the TV / DM screen: Dicer on, draws its own dice, no hold", tv.drawn === 1 && noWait.calls.length === 0, `drawn ${tv.drawn}, waits ${noWait.calls}`);
  const laptop = dicer(false);
  B.sharePhoneDice(laptop, { isPhone: () => false, wait: noWait.fn });
  check("a laptop player who switched Dicer off stays off (isEnabled is honest there)", laptop.isEnabled() === false);
  const phoneOn = dicer(true); noWait.calls = [];
  B.sharePhoneDice(phoneOn, { isPhone: () => true, wait: noWait.fn });
  await midiRoll(phoneOn);
  check("a phone whose Dicer is on (switched back by hand) is left alone: no hold", phoneOn.drawn === 1 && noWait.calls.length === 0);
}
// ── 11. isPhone is read at roll time; a second wrap is refused ─────────────────────────────────────
{
  let phoneNow = false;
  const d = dicer(false);
  B.sharePhoneDice(d, { isPhone: () => phoneNow, wait: noWait.fn });
  const before = d.isEnabled(); phoneNow = true; const after = d.isEnabled();
  check("decided at roll time (the phone flag is set at ready, after the wrap) and wrapped once only", before === false && after === true && B.sharePhoneDice(d, { isPhone: () => true }) === false, `${before} ${after}`);
}
// ── 12. applyPhoneDice records the phone flag even before Dicer is checked ──────────────────────────
{
  globalThis.game = { modules: { get: () => undefined } };
  await B.applyPhoneDice(true);
  const a = B.dicerMidiState.isPhone;
  await B.applyPhoneDice(false);
  check("applyPhoneDice sets the flag sharePhoneDice reads", a === true && B.dicerMidiState.isPhone === false, `${a} ${B.dicerMidiState.isPhone}`);
}
// ── 13. the bridge wraps for phones before it caps (so the 5 s cap bounds the hold) ──────────────────
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(path.join(ROOT, "scripts", "dicer-midi.js"), "utf8");
  const a = src.indexOf("sharePhoneDice(d3,"), b = src.indexOf("d3.showForRoll = capped(");
  check("capWhenThere: sharePhoneDice runs before the cap, and the hold fits inside it", a > 0 && b > a && B.PHONE_HOLD_MS < B.CAP_MS, `${a} ${b}`);
}
console.log(`All ${n} passed.`);
process.exit(0);
