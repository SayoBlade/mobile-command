// Headless check of the §22.11 player calendar redraw — no world, no server, no browser.
// Run: ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
//   "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" tools/test-calendar-redraw.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAVE = { key: "foundryvtt-simple-calendar-reborn.calendar-configuration" };

class MainApp { draws = 0; updateApp() { this.draws++; } }

globalThis.game = { user: { isGM: false } };
globalThis.ui = { windows: {} };
const { redrawCalendarAfterSave: redraw } = await import(pathToFileURL(path.join(REPO, "scripts/gametime.js")).href);

let fails = 0;
const ok = (n, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${n}`); if (!cond) fails++; };

const app = new MainApp();
ui.windows = { 1: { constructor: { name: "Other" } }, 2: app };

redraw(SAVE);
ok("1. a player's open calendar redraws when the GM's save lands", app.draws === 1);

redraw({ key: "foundryvtt-simple-calendar-reborn.active-calendar" });
redraw({ key: "core.time" });
redraw(null);
ok("2. any other setting leaves it alone", app.draws === 1);

game.user.isGM = true;
redraw(SAVE);
ok("3. a GM client is untouched", app.draws === 1);
game.user.isGM = false;

ui.windows = {};
let threw = false;
try { redraw(SAVE); } catch (e) { threw = true; }
ok("4. no calendar window (closed, or the module absent) is a no-op", !threw);

ui.windows = undefined;
threw = false;
try { redraw(SAVE); } catch (e) { threw = true; }
ok("5. no ui at all does not throw", !threw);

if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log("All passed");
