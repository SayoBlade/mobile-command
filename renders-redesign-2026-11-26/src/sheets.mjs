/**
 * Writes the sheet HTML files (NN-*.html) next to this script; render.mjs turns them into PNGs.
 *   node renders-redesign-2026-11-26/src/sheets.mjs && node renders-redesign-2026-11-26/src/render.mjs
 * Mockups only: nothing here is module code.
 */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import * as P from "./parts.mjs";
const { i, page, PCS, who, npc, btn, drawer, stub, work, panel, key, tile, deck, BOTTOM, partyTile, whenTile, phone, pbarTabs } = P;
const SRC = path.dirname(fileURLToPath(import.meta.url));
const out = (name, html) => { fs.writeFileSync(path.join(SRC, name), html); console.log("sheet", name); };
const gm = (inner, o = {}) => `<div class="gm"><div class="lbl">The DM's screen${o.lbl ? " · " + o.lbl : ""}</div>
  <div class="side">${["comments", "swords", "map", "user", "suitcase", "book-open", "table", "music", "gear"].map(n => i(n === "swords" ? "khanda" : n)).join("")}</div>
  ${[[330, 150, "#d9534f"], [372, 176, "#5b7fd6"], [348, 214, "#5fbf7f"], [400, 222, "#c77dff"], [520, 150, "#c8a44d"], [560, 196, "#c8a44d"]].map(([x, y, c]) => `<div class="tok" style="left:${x}px;top:${y}px;border-color:${c}"></div>`).join("")}
  ${inner}</div>`;
const at = (x, y, html, w) => `<div style="position:absolute;left:${x}px;${y < 0 ? `bottom:${-y}px` : `top:${y}px`}${w ? `;width:${w}px` : ""}">${html}</div>`;

// ---------- pieces reused across sheets ----------
const todayCombatWork = work("Combat", `
  <div class="fx"><span class="inp">Save ▾</span><span class="inp">DEX ▾</span></div>
  ${PCS.map(([n, c], k) => `<div class="rowi">${who(n, c)}<span class="fx"><small style="color:${k < 3 ? "#8fd6a8" : "#ffb4a8"}">${[10, 15, 25, 40][k]} ft</small>${i("crosshairs", "color:#a59b86;font-size:11px")}</span></div>`).join("")}
  ${btn("Request save from 3", "cta")}
  <div class="rowi"><span>${i("khanda", "color:#c8a44d")} R2 · Goblin Boss</span><span class="fx">${btn(i("backward-step"), "sq mini")}${btn(i("dice-d20"), "sq mini")}${btn(i("flag-checkered"), "sq mini")}${btn(i("forward-step"), "sq mini")}</span></div>
  ${drawer("Boss intro")}
  <div class="sec">Place spell</div>
  <div class="rowi"><span>Wizard — Fireball <small>· 3rd</small></span><span class="fx">${btn("Place", "mini")}${btn("✕", "mini ghost")}</span></div>`);

const deckFight = () => deck(
  [key({ art: "skills/melee/blade-tip-orange.webp", l: "Scimitar", sub: "Attack", c: "red" }), key({ art: "weapons/bows/shortbow-recurve.webp", l: "Shortbow", sub: "Attack", c: "red" }), key({ g: "forward-step", l: "End turn", c: "red", rim: true }), key({ art: "creatures/magical/humanoid-horned-rider.webp", l: "Goblin Boss", sub: "turn", c: "red" }), key({ art: "creatures/abilities/mouth-teeth-human.webp", l: "Goblin", sub: "×3", c: "red" })],
  [key({ g: "eye", l: "Hide", c: "blue" }), key({ g: "bullhorn", l: "War cry", c: "teal" }), key({ g: "dice-d20", l: "Ask roll", c: "grey" }), key({ empty: 1 }), key({ g: "flag-checkered", l: "End fight", c: "red" })],
  BOTTOM({ music: "Battle" }),
  [tile(`<b>Goblin Boss</b>turn`), tile(`AC 17<div class="hp"></div><b>21/21</b>`), whenTile("Round 2", "21:40")]);

// =====================================================================================
// 02 — the DM's screen in a fight: today vs with the deck
// =====================================================================================
{
  const today = gm(at(12, -40, panel(P.todayFloor(), P.TODAY_TABS(0, { 0: 1, 7: 2 }), todayCombatWork, true)), { lbl: "today" });
  const withDeck = gm(at(12, -40, panel(P.newFloor("deck", { waiting: `<div class="chip viol"><div class="t">${i("wand-sparkles", "color:#b6a2f2")} Wizard — Fireball · 3rd</div><div class="fx">${btn("Dismiss", "mini ghost")}<span class="grow"></span>${btn("Place on map", "mini viol")}</div></div>` }),
    P.NEW_TABS(-1, { deck: [0], dim: [0], badges: { 5: 2 } }))), { lbl: "proposed, deck reachable" });
  out("02-fight-today-vs-with-deck.html", page("In a fight: today vs with the deck", 1700, 1140, `
  <h1>In a fight: today, and with the deck</h1>
  <p class="lede">Same moment on both sides: round 2, the Goblin Boss's turn, the Wizard has announced a Fireball. <b>With the deck reachable the panel stops being a place you operate.</b> It shows who is here, what is waiting on you, and what the table is hearing and seeing. The turn itself is under your fingers.</p>
  <div class="row">
    <div class="col"><span class="tag today">Today</span>${today}
      <ol class="keylist" style="max-width:740px">
        <li><span class="n t">1</span><span><b>Nine tabs</b>, about 291 controls. In a fight you work in the Combat tab with the mouse.</span></li>
        <li><span class="n t">2</span><span>The Fireball waiting to be placed shows <b>only inside the Combat tab</b>. With the tab closed it is a "1" on the tab icon.</span></li>
        <li><span class="n t">3</span><span>Turn buttons, Roll NPCs and Request rolls duplicate keys the deck already has.</span></li>
        <li><span class="n t">4</span><span>Nothing tells you which music is playing, or why.</span></li>
      </ol></div>
    <div class="col"><span class="tag prop">Proposed · with the deck</span>${withDeck}
      <div style="display:flex;gap:18px;align-items:flex-start"><div><span class="tag dkt" style="margin-bottom:8px">The deck (unchanged)</span><br>${deckFight()}</div>
      <ol class="keylist" style="max-width:300px">
        <li><span class="n">1</span><span><b>Waiting</b> is always on the floor. The Fireball is there because placing it needs the map.</span></li>
        <li><span class="n">2</span><span><b>On now</b>: music, weather, hour, what the TV is doing. One line.</span></li>
        <li><span class="n">3</span><span><b>Six sections, same order in both modes.</b> Fight is dimmed with a deck mark: the deck has it.</span></li>
        <li><span class="n">4</span><span><b>Deck pill</b> shows the mode. Tap it for the full panel.</span></li>
        <li><span class="n">5</span><span>Damage / Heal stays: it needs a typed number.</span></li>
      </ol></div></div>
  </div>`));
}

await import("./sheets2.mjs");
await import("./sheets3.mjs");
