// Pure camera geometry for the shared display's out-of-combat follow (DESIGN §23).
//
// WHY THIS FILE EXISTS: the TV camera is the one subsystem that cannot be proved from a single
// browser — it needs the display client plus a moving token — and every previous generation of it
// therefore shipped on reasoning alone, and every one of them was wrong in the same way. Splitting
// the maths out of the Foundry adapter makes it runnable off-table: `tools/test-camera.js`
// exercises these functions against the REAL numbers of the test world's Kobold Lair (260px grid at
// 5 ft/square, so 1 ft = 52px — the scale at which the old fixed-margin model degenerated into
// "every step shows the whole map").
//
// Keep this module free of Foundry globals and of imports. main.js gathers canvas state and calls
// in; nothing here may reach back out.

/** Bounding box of a list of {minX,minY,maxX,maxY} rects. null for an empty list. */
export function unionBox(rects) {
  if (!rects?.length) return null;
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const r of rects) {
    b.minX = Math.min(b.minX, r.minX); b.minY = Math.min(b.minY, r.minY);
    b.maxX = Math.max(b.maxX, r.maxX); b.maxY = Math.max(b.maxY, r.maxY);
  }
  return b;
}

/** Squared distance from a rect's centre to a point — used only to order tagalongs, so the
 *  square root would be wasted work. */
export function boxDist2(rect, x, y) {
  return ((rect.minX + rect.maxX) / 2 - x) ** 2 + ((rect.minY + rect.maxY) / 2 - y) ** 2;
}

/** How close the box sits to the nearest viewport edge, in px. Negative = already off-screen.
 *  This is THE measurement the whole model rests on: the closest token's clearance, not an
 *  average (DM 2026-07-24: "15 and two at 20 — keep it at 15"). */
export function measureClearancePx({ box, pivot, scale, screenW, screenH }) {
  if (!box) return null;
  const halfW = screenW / scale / 2, halfH = screenH / scale / 2;
  return Math.min(box.minX - (pivot.x - halfW), (pivot.x + halfW) - box.maxX,
                  box.minY - (pivot.y - halfH), (pivot.y + halfH) - box.maxY);
}

/** The captured clearance, held between a floor (nobody gets nearer the edge than this) and a
 *  ceiling (from a wide frame, don't chase a token hundreds of feet out). A frame with no
 *  measurable clearance falls back to the floor rather than to "no constraint". */
export function clampClearanceFt(ft, minFt, maxFt) {
  return Number.isFinite(ft) ? Math.min(Math.max(ft, minFt), maxFt) : minFt;
}

/**
 * Where the camera should be after a party step (DESIGN §23).
 *
 * `core` is the DRIVERS' box — PCs and the packed group token, the tokens the frame guarantees.
 * `tagalongs` are pets/summons: grown in nearest-first, but only while they cost nothing.
 *
 * The zoom is the DM's (`frameScale`) and is held. It moves in exactly one case: the core cannot
 * fit even at `floorPx`, and then only to the scale that just fits — never to a whole-map "fit".
 * Because the caller does not write that result back to `frameScale`, regrouping restores the
 * DM's zoom by itself.
 *
 * Returns {cx, cy, scale, box} — box is the frame's final contents, for tests and diagnostics.
 */
export function planPartyFrame({
  core, tagalongs = [], pivot, screenW, screenH,
  frameScale, curScale, wantPx, floorPx,
  minZoom = 0.1, maxZoom = 3, sceneRect = null
}) {
  const fit = Math.min(screenW / ((core.maxX - core.minX) + floorPx * 2),
                       screenH / ((core.maxY - core.minY) + floorPx * 2), maxZoom);
  const scale = Math.max(minZoom, Math.min(frameScale ?? curScale, fit));
  const halfW = screenW / scale / 2, halfH = screenH / scale / 2;

  // Tagalongs, nearest first. A pet beside the party joins the frame for free; one three rooms
  // away is left behind rather than paying for it in zoom.
  const box = { ...core };
  const cxCore = (core.minX + core.maxX) / 2, cyCore = (core.minY + core.maxY) / 2;
  for (const r of [...tagalongs].sort((a, b) => boxDist2(a, cxCore, cyCore) - boxDist2(b, cxCore, cyCore))) {
    const grown = unionBox([box, r]);
    if ((grown.maxX - grown.minX) + floorPx * 2 <= halfW * 2
     && (grown.maxY - grown.minY) + floorPx * 2 <= halfH * 2) Object.assign(box, grown);
  }

  // The target clearance, capped per axis at what the frame can actually give: box + 2×clearance
  // must fit, so a tight frame degrades toward the floor instead of demanding an impossible inset.
  const cX = Math.max(0, Math.min(wantPx, halfW - (box.maxX - box.minX) / 2));
  const cY = Math.max(0, Math.min(wantPx, halfH - (box.maxY - box.minY) / 2));

  // Pan the MINIMUM that restores the clearance — an unbroken edge does not move the camera,
  // which is what makes a step toward the group cost nothing.
  let cx = pivot.x, cy = pivot.y;
  if (box.minX - cX < cx - halfW) cx = box.minX - cX + halfW;
  if (box.maxX + cX > cx + halfW) cx = box.maxX + cX - halfW;
  if (box.minY - cY < cy - halfH) cy = box.minY - cY + halfH;
  if (box.maxY + cY > cy + halfH) cy = box.maxY + cY - halfH;

  // Never overscroll the map. An axis smaller than the viewport simply centres.
  if (sceneRect) {
    cx = sceneRect.width  <= halfW * 2 ? sceneRect.x + sceneRect.width  / 2
       : Math.min(Math.max(cx, sceneRect.x + halfW), sceneRect.x + sceneRect.width  - halfW);
    cy = sceneRect.height <= halfH * 2 ? sceneRect.y + sceneRect.height / 2
       : Math.min(Math.max(cy, sceneRect.y + halfH), sceneRect.y + sceneRect.height - halfH);
  }
  return { cx, cy, scale, box };
}
