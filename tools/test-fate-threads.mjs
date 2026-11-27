// §34 the Threads of Fate as the book has them (2026-11-27; DM: "we kind of forgot about threads of fate", then GO on the
// corrected Thread descriptions): every Thread's goal is its book goal in our own words, and every Thread carries a line on
// why the character is at the ghost train, shown on the player's card. Numbered results; stops at the first failure.
import fs from "node:fs";
const REPO = new URL("..", import.meta.url);
const { FATE_THREADS, FATE_STEPS } = await import(new URL("scripts/fateweaving.js", REPO));
let n = 0;
function check(what, cond, got = "") { n += 1; if (cond) { console.log(`PASS ${n}. ${what}`); return; } console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`); console.log("Stopped at the first failure."); process.exit(1); }
const T = FATE_THREADS;
check("the book's thirteen Threads, by name", Object.values(T).map((t) => t.name).sort().join() === "Apocalypse,Ascendancy,Deliverance,Duality,Evolution,Immortality,Kindred,Liberation,Malediction,Pilgrimage,Rapture,Rejuvenation,Slaughter");
check("every Thread has a goal and a reason to board, each one short line", Object.values(T).every((t) => t.goal && t.board && t.goal.length <= 140 && t.board.length <= 100), JSON.stringify(Object.values(T).filter((t) => !(t.goal?.length <= 140 && t.board?.length <= 100)).map((t) => t.name)));
check("Kindred: a vanished relative, nightmares of a crooked-grinned man (not 'where you belong')", /relative/.test(T.kindred.goal) && /crooked/.test(T.kindred.goal) && !/belong/.test(T.kindred.goal), T.kindred.goal);
check("Deliverance: the heirloom stolen on the train, broken in three (not a lost person)", /heirloom/.test(T.deliverance.goal) && /three/.test(T.deliverance.goal) && !/Someone you lost/.test(T.deliverance.goal), T.deliverance.goal);
check("Immortality: a sickness no one can cure, alchemy of life", /sickness/.test(T.immortality.goal) && /alchemy/.test(T.immortality.goal), T.immortality.goal);
check("Apocalypse: stop the end, never 'finish it'", /stop it/.test(T.apocalypse.goal) && !/finish it/i.test(T.apocalypse.goal), T.apocalypse.goal);
check("Pilgrimage: lay the restless dead to rest; Malediction: break the bloodline's curse; Slaughter: the apex predator",
  /rest/.test(T.pilgrimage.goal) && /bloodline/.test(T.malediction.goal) && /apex predator/.test(T.slaughter.goal));
check("the six touchpoints unchanged", FATE_STEPS.map((s) => s.name).join() === "Incitement,Connection,Discovery,Confrontation,Climax,Catharsis");
const shell = fs.readFileSync(new URL("scripts/shell.js", REPO), "utf8");
check("the player's card shows the reason to board under the goal, escaped", /<p class="mc-cm-goal"><em>\$\{esc\(thread\.goal\)\}<\/em><\/p>\s*\$\{thread\.board \? `<p class="mc-cm-board">Why you're on the train: \$\{esc\(thread\.board\)\}<\/p>` : ""\}/.test(shell));
const css = fs.readFileSync(new URL("styles/shell.css", REPO), "utf8");
check("as a hint: muted (UI-BIBLE)", /\.mc-cm-board \{[^}]*color: var\(--mc-muted\)/.test(css));
console.log(`All ${n} passed.`);
