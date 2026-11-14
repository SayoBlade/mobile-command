/**
 * THE VE MOBILE LOOK, A TRIAL (lead 2026-11-14, on VE-MOBILE-STYLE-2026-11-13 §8 pick 8: "Act and the roll request",
 * the two screens a player holds in a fight). Behind the world setting `veTrial`, OFF by default. Off, nothing of this
 * runs and the phone is exactly as before. On:
 *   - the Act tab's list wears the trial skin (styles/ve-trial.css, everything scoped under `.mc-ve-act`);
 *   - the DM's roll request is the mocked bottom sheet: a kicker, the roll's name big with its DC pill, a
 *     Disadvantage · Normal · Advantage segment (Normal unless the player picks), one committing button.
 * Pure: the markup and the roll config are tested in tools/test-ve-trial.mjs.
 */
export const VE_SETTING = "veTrial";

export function veOn(g = globalThis) {
  let on = false;
  try { on = g.game?.settings?.get?.("mobile-command", VE_SETTING) === true; } catch (e) { return false; }
  if (on) veEnsureStyles(g.document);
  return on;
}

/**
 * ⚠️ THE TRIAL LOADS ITS OWN STYLESHEET (seat LIVE A11, 2026-11-14: switched on, the phone kept the burgundy bar and
 * the old cards; `ve-trial.css` was in module.json and game.modules, but NOT linked by the page). Foundry writes a
 * page's module stylesheet links from what it read when the WORLD LAUNCHED, so a file added by an update is missing
 * until a relaunch. entrances.js learned this on 2026-09-19 and loads its own; the trial does the same, the first
 * time it is on in a page. Idempotent; a page that already links it (after a relaunch) is left alone.
 */
export const VE_CSS = "modules/mobile-command/styles/ve-trial.css";
export function veEnsureStyles(doc = globalThis.document) {
  try {
    if (!doc?.head || doc.getElementById?.("mc-ve-trial-css")) return false;
    if ([...(doc.querySelectorAll?.('link[rel="stylesheet"]') ?? [])].some((l) => (l.getAttribute?.("href") ?? "").includes("styles/ve-trial.css"))) return false;
    const link = doc.createElement("link");
    link.id = "mc-ve-trial-css"; link.rel = "stylesheet"; link.href = VE_CSS;
    doc.head.appendChild(link);
    return true;
  } catch (e) { return false; }
}

/** The segment's three modes, left to right as the mockup and VE draw them. Normal is the default. */
export const VE_MODES = [["dis", "Disadvantage"], ["normal", "Normal"], ["adv", "Advantage"]];

/** What the chosen mode adds to dnd5e's roll config (BasicRollProcessConfiguration: advantage / disadvantage). */
export function veRollConfig(mode) {
  if (mode === "adv") return { advantage: true };
  if (mode === "dis") return { disadvantage: true };
  return {};
}

const cap = (s) => String(s ?? "").replace(/\b([a-z])/g, (m) => m.toUpperCase());
const plainEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The request's words: "Wisdom save" / "Perception check" / "Initiative"; the button in Title Case ("Roll Wisdom Save");
 * the DC only when the asker sent one (a blind check is his legitimate move, so none is invented: same rule as today).
 */
export function veRollWords(p) {
  const init = p?.rollType === "initiative";
  const name = init ? "Initiative" : `${p?.label ?? p?.ability ?? "?"} ${p?.rollType === "check" ? "check" : "save"}`;
  const dc = (p?.dc != null && p.dc !== "" && Number.isFinite(Number(p.dc))) ? Number(p.dc) : null;
  return { init, name, dc, cta: init ? "Roll Initiative" : `Roll ${cap(name)}` };
}

/** The bottom sheet. `mode` is the segment's current pick; initiative has no segment (it rolls the combatant). */
export function veRollSheetHTML(p, { mode = "normal", esc = plainEsc } = {}) {
  if (!p) return "";
  const w = veRollWords(p);
  const seg = w.init ? "" : `<div class="mc-ve-seg" role="radiogroup" aria-label="Roll mode">${VE_MODES.map(([id, label]) =>
    `<button class="mc-ve-seg-opt ${mode === id ? "mc-on" : ""}" data-action="roll-request-mode" data-mode="${id}" role="radio" aria-checked="${mode === id}">${label}</button>`).join("")}</div>`;
  const source = p.source ? `<div class="mc-ve-sheet-src">${esc(p.source)}</div>` : "";
  return `<div class="mc-ve-veil" aria-hidden="true"></div>
    <div class="mc-saveprompt mc-rollreq mc-ve-sheet">
      <div class="mc-saveprompt-bar">
        <span class="mc-ve-kicker"><i class="fas fa-dice-d20"></i> ${w.init ? "Roll for initiative" : "The DM asks for a roll"}</span>
        <button class="mc-saveprompt-x" data-action="roll-request-x" aria-label="Dismiss"><i class="fas fa-xmark"></i></button>
      </div>
      <div class="mc-saveprompt-body">
        <div class="mc-ve-sheet-head">
          <span class="mc-ve-tile"><i class="fas fa-dice-d20"></i></span>
          <div class="mc-ve-sheet-what">
            <div class="mc-ve-sheet-title">${esc(w.name)}${w.dc === null ? "" : ` <span class="mc-ve-pill">DC ${w.dc}</span>`}</div>
            ${source}
          </div>
        </div>
        ${seg}
        <button class="mc-ve-cta" data-action="roll-request"><i class="fas fa-dice-d20"></i> ${esc(w.cta)}</button>
      </div>
    </div>`;
}
