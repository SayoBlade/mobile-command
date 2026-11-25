// A phone loads quietly (DM 2026-11-25: "Make sure as few popups open on mobile view on loading"). scripts/phone-quiet.js.
//
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules "…/Foundry Virtual Tabletop.exe" tools/test-phone-quiet.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}${detail ? ` — got ${detail}` : ""}`); console.log("Stopped at the first failure."); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
globalThis.setTimeout ??= (fn) => fn();
const Q = await import(pathToFileURL(path.join(ROOT, "scripts", "phone-quiet.js")).href);
const main = fs.readFileSync(path.join(ROOT, "scripts", "main.js"), "utf8");
const notifierSrc = fs.readFileSync(path.join(ROOT, "scripts", "notifier.js"), "utf8");

// ── 1–3. who is a phone, and when it is loading ────────────────────────────────────────────────────────
check("before MC's init a phone is known by the noCanvas MC set on it; after, MC's own answer", Q.phoneNow({ phone: null }, { getItem: () => "true" }) === true && Q.phoneNow({ phone: null }, { getItem: () => null }) === false && Q.phoneNow({ phone: false }, { getItem: () => "true" }) === false);
check("loading: until ready, then QUIET_MS more", Q.loading({ readyAt: 0 }, 5) === true && Q.loading({ readyAt: 1000 }, 1000 + Q.QUIET_MS - 1) === true && Q.loading({ readyAt: 1000 }, 1000 + Q.QUIET_MS) === false);
check("held: another module's notice on a loading phone; kept: ours, the connection, the shutdown, any after the load, any on the DM/TV",
  Q.holdNotice({ message: "Welcome to X v2!", phone: true, isLoading: true, isOurs: false }) === true
  && Q.holdNotice({ message: "x", phone: true, isLoading: true, isOurs: true }) === false
  && Q.holdNotice({ message: "You have lost connection to the server, attempting to re-establish.", phone: true, isLoading: true }) === false
  && Q.holdNotice({ message: "GAME.WorldShuttingDown", phone: true, isLoading: true }) === false
  && Q.holdNotice({ message: "x", phone: true, isLoading: false }) === false
  && Q.holdNotice({ message: "x", phone: false, isLoading: true }) === false);
// ── 4–7. the filter on core's Notifications#notify ─────────────────────────────────────────────────────
{
  const shown = [];
  class Notifications { notify(m, type = "info", o) { shown.push([type, String(m)]); return { id: shown.length, type }; } info(m, o) { return this.notify(m, "info", o); } warn(m, o) { return this.notify(m, "warning", o); } }
  const state = { phone: true, readyAt: 0, held: [], closed: [], set: [] };
  let t = 0;
  check("installed on the class, once", Q.installNoticeFilter(Notifications.prototype, { state, now: () => t }) === true && Q.installNoticeFilter(Notifications.prototype, { state }) === false);
  const ui = new Notifications();
  const r = ui.warn("Module X: compendium migration recommended");
  check("a module's warning while the phone loads: not shown, kept for the seat, its caller still gets a notice back", shown.length === 0 && state.held.length === 1 && typeof r.remove === "function" && typeof r.update === "function", JSON.stringify(shown));
  Q.asOurs(() => ui.info("Mobile Command: hello"));
  check("ours shows while loading (notifier.js goes through asOurs)", shown.length === 1 && shown[0][1] === "Mobile Command: hello");
  state.readyAt = 1; t = 1 + Q.QUIET_MS;
  ui.info("later notice");
  state.phone = false; state.readyAt = 0; t = 0;
  ui.info("dm notice");
  check("after the load it shows; on a screen that is not a phone it always shows", shown.length === 3);
}
// ── 8–9. windows and settings ────────────────────────────────────────────────────────────────────────────
{
  const list = [{ why: "X's welcome", test: (app) => app.id === "x-welcome" }];
  check("a listed welcome window on a loading phone is closed; not on the DM, not after the load, not an unlisted window",
    Q.loadWindowWhy({ id: "x-welcome" }, { phone: true, isLoading: true, list }) === "X's welcome"
    && Q.loadWindowWhy({ id: "x-welcome" }, { phone: false, isLoading: true, list }) === null
    && Q.loadWindowWhy({ id: "x-welcome" }, { phone: true, isLoading: false, list }) === null
    && Q.loadWindowWhy({ id: "roll-config" }, { phone: true, isLoading: true, list }) === null);
  const store = new Map([["m.seen", "1.0"]]);
  const g = { modules: { get: (id) => (id === "m" ? { active: true } : undefined) }, settings: { settings: new Map([["m.seen", {}]]), get: (a, k) => store.get(`${a}.${k}`), set: async (a, k, v) => store.set(`${a}.${k}`, v) } };
  const st = { set: [] };
  const n1 = await Q.applyPhoneSettings(g, { list: [{ module: "m", key: "seen", value: "2.0", why: "m's changelog" }, { module: "gone", key: "k", value: 1, why: "x" }], state: st });
  const n2 = await Q.applyPhoneSettings(g, { list: [{ module: "m", key: "seen", value: "2.0", why: "m's changelog" }], state: st });
  check("a module's own 'don't show' switch is set once on a phone; an inactive module is skipped", n1 === 1 && n2 === 0 && store.get("m.seen") === "2.0");
}
// ── 10–12. what the installed modules open at load ────────────────────────────────────────────────────────
{
  globalThis.game = { i18n: { localize: (k) => (k === "DICER.TrayPick.Title" ? "Pick one dice tray" : k) } };
  const on = (app) => Q.loadWindowWhy(app, { phone: true, isLoading: true });
  const journal = (uuid) => ({ document: { documentName: "JournalEntry", uuid } });
  check("each book's changelog and The Crooked Moon's intro journal close; a journal from anywhere else stays",
    Q.BOOK_CHANGELOGS.every((id) => on(journal(`Compendium.${id}.book.JournalEntry.x`)) === "a book's changelog journal")
    && on(journal("JournalEntry.abc")) === null && on(journal("Compendium.dnd5e.rules.JournalEntry.y")) === null);
  class DialogV2 { constructor(t) { this.options = { window: { title: t } }; } }
  check("Hero Mancer's welcome and Dicer's tray pick close; any other dialog (a roll, a reaction) stays",
    on({ id: "hero-mancer-welcome" }) === "Hero Mancer's welcome" && on(new DialogV2("Pick one dice tray")) !== null
    && on(new DialogV2("Shield")) === null && on({ id: "gps-automation-1" }) === null);
  check("Hero Mancer's own per-screen welcome switch is the one set on phones", Q.PHONE_SETTINGS.some((x) => x.module === "hero-mancer" && x.key === "showWelcome" && x.value === false));
}
// ── 13–15. wiring ──────────────────────────────────────────────────────────────────────────────────────
check("main.js installs the filter at load, before any init hook", main.indexOf("installNoticeFilter();") > 0 && main.indexOf("installNoticeFilter();") < main.indexOf('Hooks.once("init"'));
check("…knows the phone after its settings, marks ready, and sets the switches on phones only", /phoneQuietState\.phone = isPhoneClient\(\)/.test(main) && /phoneQuietState\.readyAt = Date\.now\(\);\s*if \(isPhoneClient\(\)\) \{\s*applyPhoneSettings\(\)/.test(main));
check("MC's own toasts pass through asOurs (the five-a-burst rule is still notifier.js's)", (notifierSrc.match(/asOurs\(\(\) => target\[level\]/g) ?? []).length === 2 && /const MAX_TOASTS = 5;/.test(notifierSrc));
console.log(`All ${n} passed.`);
process.exit(0);
