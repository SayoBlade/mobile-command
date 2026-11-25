// THE PANEL'S MODE (MC redesign phase 4.1, DM 2026-11-26: 2A, "a manual pill now; Auto later").
//
// With the deck the panel rests compact (the deck is hands, the panel is eyes); without it the panel is full. The DM
// panel only; players and the TV never see the mode.
//
//   runFrom (client setting): "auto" (default) · "deck" · "panel".
//     auto  = compact while Deck Command reports the deck reachable (`reportDeck`); until it reports, full.
//     deck  = compact.   panel = full.
//   The pill on the floor is a manual switch over that for this session: tap to go full, tap again to go compact.
//
// The one-way rule (proposal 4.4): GROWING IS AUTOMATIC, SHRINKING IS OFFERED. The deck drops → the full panel is back
// at once (one notice). The deck returns → nothing moves; the pill offers "Shrink?" and the DM taps it when free.
//
// The seam for Deck Command: `MobileCommand.deck.report(reachable)` (main.js). Until it calls, Auto reads "No deck".

export const RUN_FROM = Object.freeze(["auto", "deck", "panel"]);
const st = { override: null, reachable: null, offer: false, lost: false };
export const panelModeState = st;

export function baseCompact(runFrom, reachable) {
  if (runFrom === "deck") return true;
  if (runFrom === "panel") return false;
  return reachable === true;
}
export function isCompact(runFrom) { return st.override ?? baseCompact(runFrom, st.reachable); }

/** The pill: { state, label, title }. state: live (compact) · held (full by your tap) · offer · lost · none. */
export function pillOf(runFrom) {
  if (isCompact(runFrom)) return { state: "live", label: "Deck", title: "Compact: the deck drives. Tap for the full panel" };
  if (st.offer) return { state: "offer", label: "Shrink?", title: "The deck is back. Tap to make the panel compact" };
  if (st.lost) return { state: "lost", label: "Deck lost", title: "The deck dropped, so the full panel is back. Tap to make it compact anyway" };
  if (baseCompact(runFrom, st.reachable)) return { state: "held", label: "Full panel", title: "You opened the full panel. Tap to make it compact again" };
  return { state: "none", label: "No deck", title: "Full panel. Tap if you are running from the deck" };
}

/** A tap on the pill flips compact/full for this session. */
export function tapPill(runFrom) {
  const next = !isCompact(runFrom);
  st.offer = false; st.lost = false;
  st.override = next === baseCompact(runFrom, st.reachable) ? null : next;
  return next;
}

/** Deck Command's report. Returns "lost" | "back" | null (what changed, for one notice). */
export function reportDeck(reachable, runFrom = "auto") {
  const prev = st.reachable;
  const now = !!reachable;
  st.reachable = now;
  if (prev === true && !now) {
    // grows by itself: drop any hold, the full panel is back at once
    const was = st.override ?? baseCompact(runFrom, true);
    st.override = null; st.offer = false;
    st.lost = runFrom === "auto" && was;
    return st.lost ? "lost" : null;
  }
  if (prev === false && now && runFrom === "auto") {
    // never shrinks under his hand: keep it full and offer (the first report at load just sets the mode)
    st.lost = false;
    if (st.override === null) { st.override = false; st.offer = true; return "back"; }
  }
  return null;
}

/** Back to a fresh session (tests). */
export function resetPanelMode() { st.override = null; st.reachable = null; st.offer = false; st.lost = false; }
