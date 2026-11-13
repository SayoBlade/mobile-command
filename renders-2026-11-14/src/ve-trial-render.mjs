/**
 * THE VE TRIAL AS BUILT, rendered from the module's own stylesheets (styles/shell.css + styles/ve-trial.css) and its own
 * markup (scripts/ve-trial.js for the sheet; the Act list in #actionsHTML's exact classes). Today (switch off) left,
 * trial (switch on) right. Chrome headless at phone size (375x812, 2x).
 *   node renders-2026-11-14/src/ve-trial-render.mjs   → renders-2026-11-14/vetrial-*.png
 */
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const OUT = path.join(REPO, "renders-2026-11-14"), SRC = path.join(OUT, "src");
const { veRollSheetHTML } = await import(pathToFileURL(path.join(REPO, "scripts/ve-trial.js")).href);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ICONS = "file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop%2014/resources/app/public/icons/";
const FA = "file:///C:/Users/User/Documents/Claude/Code/deck-command/service/node_modules/@fortawesome/fontawesome-free/css/all.min.css";
const css = (f) => pathToFileURL(path.join(REPO, "styles", f)).href;
const PORTRAIT = "file:///C:/Users/User/AppData/Local/FoundryVTT/Data/modules/dnd-players-handbook/assets/journal-art/cleric.webp";

const row = (name, sub, icon, right = "") => `<button class="mc-action" data-action="action-pick"><img class="mc-action-icon" src="${ICONS}${icon}" alt="">
  <span class="mc-action-text"><span class="mc-action-name">${name}</span><span class="mc-action-sub">${sub}</span></span>
  <span class="mc-action-right">${right}<i class="fas fa-bookmark mc-action-fav mc-ph"></i></span></button>`;
const fav = '<i class="fas fa-bookmark mc-action-fav mc-on"></i>';
const groups = [
  ["action", "Actions", [row("Guidance", "Cast", "magic/holy/chalice-glowing-gold.webp"), row("Sacred Flame", "Cast", "magic/fire/barrier-wall-flame-ring-yellow.webp"),
    row("Bless", "Cast", "magic/holy/angel-wings-gray.webp"), row("Cure Wounds", "Heal", "magic/life/ankh-gold-blue.webp"),
    row("Mace", "Attack", "weapons/maces/flail-morning-star.webp"), row("Light Crossbow", "Attack", "weapons/crossbows/crossbow-blue.webp")]],
  ["bonus", "Bonus actions", [row("Healing Word", "Heal", "magic/life/cross-beam-green.webp")]],
  ["other", "Other", [row("Channel Divinity", "Use", "magic/holy/barrier-shield-winged-blue.webp", '<span class="mc-pips-num">1/1</span>')]],
];
function act(ve) {
  const body = groups.map(([k, label, rows]) => `<div class="mc-search-group"><button class="mc-actions-sub mc-econ-${k} mc-accordion" data-action="agroup">
    <span>${label}</span>${ve ? `<span class="mc-ve-count">${rows.length}</span>` : ""}<i class="fas fa-chevron-down"></i></button><div class="mc-actions">${rows.join("")}</div></div>`).join("");
  return `<main class="mc-content${ve ? " mc-ve-act" : ""}"><div class="mc-actions-head"><span class="mc-section-label">Actions</span></div>${body}</main>`;
}
const header = `<header class="mc-header"><img class="mc-portrait" src="${PORTRAIT}" alt=""><div class="mc-id"><div class="mc-name"><span class="mc-name-text">Test Cleric</span></div>
  <div class="mc-stats"><span class="mc-stat">HP 10/10</span><button class="mc-stat mc-stat-tap mc-stat-acwrap"><span class="mc-ac-frame"><i class="fas fa-shield"></i>14</span></button></div></div></header>`;
const tabs = `<nav class="mc-tabs">${["fa-hand-fist", "fa-user", "fa-wand-sparkles", "fa-compass", "fa-suitcase", "fa-feather", "fa-moon"].map((f, i) => `<button class="mc-tab ${i === 0 ? "mc-on" : ""}"><i class="fas ${f}"></i></button>`).join("")}</nav>`;
const req = { rollType: "save", ability: "wis", label: "Wisdom", dc: 13 };
const todayRoll = `<div class="mc-saveprompt mc-rollreq"><div class="mc-saveprompt-bar"><span class="mc-saveprompt-title"><i class="fas fa-dice-d20"></i> The DM asks for a roll</span>
  <button class="mc-saveprompt-x"><i class="fas fa-xmark"></i></button></div><div class="mc-saveprompt-body"><div class="mc-saveprompt-btns">
  <button class="mc-save-roll" data-action="roll-request">Roll Wisdom save (DC 13)</button></div></div></div>`;
const page = (inner) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FA}"><link rel="stylesheet" href="${css("shell.css")}"><link rel="stylesheet" href="${css("ve-trial.css")}">
<style>html,body{margin:0;width:375px;height:812px;overflow:hidden;font-family:Signika,"Segoe UI",sans-serif}#mobile-command-shell{position:absolute;left:0;top:0;width:375px;height:812px;display:flex;flex-direction:column;overflow:hidden}#mobile-command-shell .mc-saveprompt,#mobile-command-shell .mc-ve-veil{position:absolute;right:auto;width:375px}#mobile-command-shell .mc-ve-veil{height:812px}</style></head>
<body><div id="mobile-command-shell">${inner}</div></body></html>`;
const shots = {
  "act-today": page(header + act(false) + tabs), "act-trial": page(header + act(true) + tabs),
  "roll-today": page(header + act(false) + tabs + todayRoll),
  "roll-trial": page(header + act(true) + tabs + veRollSheetHTML(req, { mode: "normal" })),
  "roll-trial-adv": page(header + act(true) + tabs + veRollSheetHTML(req, { mode: "adv" })),
};
fs.mkdirSync(SRC, { recursive: true });
for (const [k, html] of Object.entries(shots)) {
  const f = path.join(SRC, `${k}.html`); fs.writeFileSync(f, html);
  const png = path.join(SRC, `${k}.png`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--allow-file-access-from-files", "--window-size=375,812",
    "--force-device-scale-factor=2", "--virtual-time-budget=2500", `--user-data-dir=${path.join(SRC, "chrome-profile")}`, `--screenshot=${png}`, pathToFileURL(f).href], { stdio: "ignore", timeout: 120000 });
  console.log("rendered", k);
}
