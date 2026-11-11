// Characters are made at the PC (DM 2026-11-11, deck-command D-0104): the phone offers no "Create your character" unless
// the world setting `phoneCreate` (off by default) brings its own builder back. Static checks on the shell and settings.
// Run: node tools/test-phone-create.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok) { n += 1; if (!ok) { console.log(`FAIL ${n}. ${label}`); process.exit(1); } console.log(`PASS ${n}. ${label}`); }
const shell = fs.readFileSync(path.join(ROOT, "scripts", "shell.js"), "utf8");
const settings = fs.readFileSync(path.join(ROOT, "scripts", "settings.js"), "utf8");
check("the Create door needs the setting AND the permission", shell.includes('const canMake = phoneCreate && !!game.user?.can?.("ACTOR_CREATE") && !isDisplayClient();'));
check("the setting is read safely (an unregistered setting means off)", /let phoneCreate = false; try \{ phoneCreate = game\.settings\.get\(MODULE_ID, "phoneCreate"\) === true; \}/.test(shell));
check("with it off, a phone with no character is told to ask the DM at the PC", shell.includes("Characters are made at the PC with your DM"));
check("the setting is a world setting, off by default", /register\(MODULE_ID, "phoneCreate", \{[\s\S]{0,500}scope: "world", config: true, type: Boolean, default: false/.test(settings));
console.log(`\nall ${n} passed`);
