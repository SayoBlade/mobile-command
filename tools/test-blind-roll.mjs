// A blind roll request (scripts/blind-roll.js; deck-command D-0118, DM 2026-11-16 "hold on roll requests to make the
// roll a blind one (i.e. only the DM sees results)").
// Run: node tools/test-blind-roll.mjs   (stops at the first failure)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
function check(label, ok, detail = "") {
  n += 1;
  if (!ok) { console.log(`FAIL ${n}. ${label}\n  ${detail}`); process.exit(1); }
  console.log(`PASS ${n}. ${label}`);
}
const B = await import(pathToFileURL(path.join(ROOT, "scripts", "blind-roll.js")).href);
const V14 = { public: {}, gm: {}, blind: {}, self: {}, ic: {} };

check("Foundry 14: the blind mode is \"blind\" (\"blindroll\" would fall back to his public default)", B.blindModeName(V14) === "blind");
check("before 14: the old name", B.blindModeName(undefined) === "blindroll");
check("a request is blind only when it says blind: true", B.requestIsBlind({ blind: true }) && !B.requestIsBlind({ blind: "yes" }) && !B.requestIsBlind({}) && !B.requestIsBlind(null));
const tokenMsg = { data: { speaker: { token: "T" } } };
check("a blind request adds the mode to dnd5e's message config and keeps the speaker",
  JSON.stringify(B.messageForRequest({ blind: true }, tokenMsg, V14)) === JSON.stringify({ data: { speaker: { token: "T" } }, rollMode: "blind" }));
check("an ordinary request leaves the message config exactly as it was", B.messageForRequest({}, tokenMsg, V14) === tokenMsg);
check("a blind message is hidden from the player who rolled it", B.hiddenFromMe({ blind: true }, { isGM: false }) === true);
check("…never from a GM (the deck reads it there)", B.hiddenFromMe({ blind: true }, { isGM: true }) === false);
check("an ordinary message is never hidden", B.hiddenFromMe({ blind: false }, { isGM: false }) === false);

// the glue
const rpc = fs.readFileSync(path.join(ROOT, "scripts", "rpc.js"), "utf8");
check("the relay carries blind to the phone, and the DM-side fallback rolls it blind too",
  /handleRequestRolls\(\{[^}]*\bblind \}\)/.test(rpc)
  && /\.\.\.\(blind === true \? \{ blind: true \} : \{\}\)/.test(rpc)
  && /messageForRequest\(\{ blind: blind === true \}, \{\}\)[\s\S]{0,200}rollSkill\(\{ skill: sk \}, \{\}, msg\)/.test(rpc));
const shell = fs.readFileSync(path.join(ROOT, "scripts", "shell.js"), "utf8");
check("the phone rolls the request with the blind mode", /const msg = messageForRequest\(p, rollMessageFor\(a, p\.tokenUuid\)\);/.test(shell));
check("the phone's roll summary keeps no number for a blind roll", /if \(hiddenFromMe\(message\)\) return \{ id: message\.id, label, total: null, formula: "", outcome: "", hidden: true \};/.test(shell));
check("the toast and the strip draw the hidden mark, never the total",
  /entry\.hidden \? `<i class="fas fa-eye-slash"><\/i>` : entry\.total/.test(shell) && /r\.hidden \? `<i class="fas fa-eye-slash"/.test(shell)
  && /The DM sees the result\./.test(shell));
check("the request card says it is blind (both looks)",
  /The DM asks for a blind roll/.test(shell) && /Only the DM will see the result\./.test(shell)
  && /The DM asks for a blind roll/.test(fs.readFileSync(path.join(ROOT, "scripts", "ve-trial.js"), "utf8")));
const ve = await import(pathToFileURL(path.join(ROOT, "scripts", "ve-trial.js")).href);
const sheet = ve.veRollSheetHTML({ rollType: "check", label: "Insight", dc: 17, blind: true });
check("the VE sheet: blind kicker, one line, advantage still offered", /blind roll/.test(sheet) && /mc-ve-blind/.test(sheet) && /data-mode="adv"/.test(sheet));
check("…and an ordinary request draws no blind line", !/mc-ve-blind|blind roll/.test(ve.veRollSheetHTML({ rollType: "check", label: "Insight", dc: 17 })));

console.log(`\nall ${n} passed`);
