/**
 * Sheet 11: the phone's Act tab with Actions / Spells sub-tabs, with and without names (DM 2026-11-26, question 7).
 *   node renders-redesign-2026-11-26/src/sheets4.mjs && node renders-redesign-2026-11-26/src/render.mjs 11-
 * Mockups only: nothing here is module code.
 */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import * as P from "./parts.mjs";
const { i, page, phone, pbarTabs } = P;
const SRC = path.dirname(fileURLToPath(import.meta.url));
const out = (name, html) => { fs.writeFileSync(path.join(SRC, name), html); console.log("sheet", name); };

const hd = `<div style="display:flex;gap:5px">${["envelope", "dice-d20", "star", "bell"].map(n => `<div style="width:26px;height:26px;border-radius:50%;border:1px solid var(--edge);display:flex;align-items:center;justify-content:center;font-size:11px;color:#cfc8ba">${i(n)}</div>`).join("")}</div>`;
const BAR = [["hand-fist", "Act"], ["user", "Sheet"], ["compass", "Play"], ["suitcase", "Bag"], ["feather", "Story"], ["moon", "Moon"]];
const bar = (named) => pbarTabs(BAR.map(([ic, l]) => [ic, named ? l : ""]), 0);

// the sub-tab switch at the top of Act
const sub = (named, on) => {
  const items = [["hand-fist", "Actions"], ["wand-sparkles", "Spells"]];
  return `<div style="display:flex;border:1px solid var(--edge);border-radius:9px;overflow:hidden;font-size:12.5px;font-weight:700;min-height:40px">${items.map(([ic, l], k) => `<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:7px;${k === on ? "background:var(--panel2);color:var(--gold);box-shadow:inset 0 -2px 0 var(--gold)" : "color:var(--muted)"}">${i(ic, named ? "" : "font-size:16px")}${named ? l : ""}</div>`).join("")}</div>`;
};
const row = (a, b, right = "") => `<div class="prow"><div class="ic"></div><div style="flex:1">${a}<small>${b}</small></div>${right}</div>`;
const actions = `<div class="pbar">Actions</div>
  ${row("Mace", "Attack · +5")}${row("Sacred Flame", "Cast · cantrip")}${row("Bless", "Cast · 1st")}
  <div class="pbar">Bonus actions</div>${row("Healing Word", "Heal · 1st")}
  <div class="pbar">Reactions</div>${row("Opportunity Attack", "Mace · +5")}`;
const pip = (n, used) => `<span style="display:inline-flex;gap:3px">${Array.from({ length: n }, (_, k) => `<span style="width:9px;height:9px;border-radius:50%;border:1px solid var(--gold);${k < n - used ? "background:var(--gold)" : ""}"></span>`).join("")}</span>`;
const prep = (on) => `<span style="font-size:12px;color:${on ? "var(--gold)" : "#5d5866"}">${i(on ? "book-bookmark" : "book")}</span>`;
const spells = `<div class="pcard" style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px"><span>1st ${pip(2, 1)}</span><span>2nd ${pip(1, 0)}</span><span style="color:var(--muted)">Prepared 4/5</span></div>
  <div class="pbar">Cantrips</div>${row("Sacred Flame", "DEX save · 60 ft")}${row("Guidance", "Touch · concentration")}
  <div class="pbar">1st level</div>${row("Bless", "3 creatures · conc.", prep(true))}${row("Cure Wounds", "Touch · heal", prep(true))}${row("Healing Word", "Bonus · 60 ft", prep(true))}${row("Command", "WIS save · 60 ft", prep(false))}`;

const ph = (named, on) => phone({ hdRight: hd, body: `${sub(named, on)}${on === 0 ? actions : spells}`, bar: bar(named) });
const col = (tag, html, cls = "prop") => `<div class="col"><span class="tag ${cls}">${tag}</span>${html}</div>`;

out("11-phone-act-subtabs.html", page("Phone Act sub-tabs", 1760, 860, `
  <h1>The phone's Act tab: Actions and Spells as two views</h1>
  <p class="lede">Your note: <b>"explore a subtab option for actions / spells, not sure names are needed."</b> Spells leaves the bottom bar and becomes the second view inside Act, so the bar drops to five tabs plus the campaign tab. Left pair: <b>with names</b> (sub-tabs and bar). Right pair: <b>icons only</b>. Pick one for each, or mix: e.g. icon sub-tabs with a named bar.</p>
  <div class="row" style="gap:26px">
    ${col("With names · Act › Actions", ph(true, 0))}
    ${col("With names · Act › Spells", ph(true, 1))}
    ${col("Icons only · Act › Actions", ph(false, 0), "today")}
    ${col("Icons only · Act › Spells", ph(false, 1), "today")}
    <div class="col" style="max-width:300px;padding-top:36px"><ol class="keylist">
      <li><span class="n">1</span><span><b>The bar:</b> Act · Sheet · Play · Bag · Story, and the Moon at the edge. Play keeps the centre.</span></li>
      <li><span class="n">2</span><span><b>Inside Act:</b> a two-way switch at the top. It remembers the last view per hero.</span></li>
      <li><span class="n">3</span><span><b>A non-caster</b> (Barbarian, Rogue) sees no switch; Act is just Actions.</span></li>
      <li><span class="n">4</span><span><b>Without names</b> the icons must carry it: fist for actions, wand for spells. A new player has to learn six bar icons and two switch icons by touch; there is no hover on a phone.</span></li>
      <li><span class="n">5</span><span><b>My pick:</b> names on the bar (it is the first thing a new player reads), icons only on the switch (two choices, right under the finger, and the list below says which one you are on).</span></li>
      <li><span class="n">6</span><span>Not built yet. The phone tabs wait for your pick.</span></li>
    </ol></div>
  </div>`));
