// The Crooked House stairs — climb, then choose (mobile-command §53). TEST WORLD ONLY.
//
// DM 2026-09-20, first placement: "i just touched the bottom of the staircase and got teleported off, no question,
// no[t] only are you confusing players your making them miss out of the creaking stairs, put the teleporter at the
// top of the stairs, and make sure there's a decision by the player."
//
// Both faults were mine and both are fixed here:
//  1. THE TOP, NOT THE BOTTOM. A teleport on the first tread fires the moment a foot touches the staircase — before
//     the climb, and one square before §53's counted creak, so the stair's own sound never got a chance. The trigger
//     now sits on the LAST tread, where the flight goes through the ceiling: they walk the stairs, the third and
//     twelfth pass creaks under them, and only then are they asked.
//  2. IT ASKS. Core's own confirmation (`choice: true`), so the answer belongs to whoever moved the token, on every
//     one of the three ways he plays: plain Foundry gets the native dialog, and a phone gets the same dialog through
//     mobile-command's dialog lift. Nobody is moved without saying yes.
//
//    12.1 (9,13) ⇄ 12.2 (9,13)   the grand stair out of the Foyer — the same spot on both floors
//    12.2 (6,9)  ⇄ 12.3 (6,9)    the flight off the upper hall
//
// The squares are read off the map; if a tread reads better one square over, DRAG the region — a re-run never moves
// a region he has moved himself (it only corrects one still sitting on the old, wrong square). Deletes nothing.
//
// The attic is still deliberately absent: it is the hidden pull-down ladder (action key A114), not a staircase.
(async () => {
  const MOD = "mobile-command";
  if (game.world?.id !== "offline-test") return ui.notifications.error("Stairs: TEST WORLD ONLY — this is not the Offline test world.");
  if (!game.user?.isGM) return ui.notifications.error("Stairs: run this as a GM.");
  const G = 140;
  const sq = (c, r) => ({ type: "rectangle", x: c * G, y: r * G, width: G, height: G, rotation: 0, hole: false });

  // key → [scene, name, col, row, twin, the question, the square it used to sit on (the 2026-09-20 mistake)]
  const ENDS = {
    "stair:12.1:up": ["skzmyUz6MM2U4862", "Stairs — up to the Second Floor", 9, 13, "stair:12.2:down", "Go up to the second floor?", [10, 14]],
    "stair:12.2:down": ["LTGEO7JXWxFvbcIJ", "Stairs — down to the First Floor", 9, 13, "stair:12.1:up", "Go down to the first floor?", [10, 14]],
    "stair:12.2:up": ["LTGEO7JXWxFvbcIJ", "Stairs — up to the Third Floor", 6, 9, "stair:12.3:down", "Go up to the third floor?", [7, 9]],
    "stair:12.3:down": ["gl3mouQf0eAdouY5", "Stairs — down to the Second Floor", 6, 9, "stair:12.2:up", "Go down to the second floor?", [7, 9]],
  };
  const report = { created: 0, moved: 0, leftWhereHePutIt: 0, asked: 0, skipped: [] };
  const found = {};

  for (const [key, [sceneId, name, c, r, , , old]] of Object.entries(ENDS)) {
    const scene = game.scenes.get(sceneId);
    if (!scene) { report.skipped.push(key + ": no scene"); continue; }
    let region = scene.regions.find((x) => x.getFlag(MOD, "cm") === key);
    if (!region) {
      [region] = await scene.createEmbeddedDocuments("Region", [{
        name, color: "#2fbd9c", visibility: CONST.REGION_VISIBILITY.LAYER_UNLOCKED,
        shapes: [sq(c, r)], flags: { [MOD]: { cm: key } },
      }]);
      report.created++;
    } else {
      const s = region.shapes[0];
      const at = [Math.floor((s?.x ?? 0) / G), Math.floor((s?.y ?? 0) / G)];
      if (at[0] === old[0] && at[1] === old[1]) { await region.update({ name, shapes: [sq(c, r)] }); report.moved++; }
      else if (at[0] === c && at[1] === r) { await region.update({ name }); }
      else report.leftWhereHePutIt++; // he chose this square — it stands
    }
    found[key] = region;
  }

  for (const [key, [, , , , toKey, question]] of Object.entries(ENDS)) {
    const region = found[key], dest = found[toKey];
    if (!region || !dest) { report.skipped.push(key + ": no twin"); continue; }
    const system = {
      destinations: [dest.uuid], placement: "center", snap: false,
      choice: true, revealed: true,                      // ← ask, and name where it goes
      dialog: { revealed: question, unrevealed: null },
      transition: { type: null, duration: 1500 },
    };
    const b = region.behaviors.find((x) => x.type === "teleportToken");
    if (b) await b.update({ disabled: false, system });
    else await region.createEmbeddedDocuments("RegionBehavior", [{ name: "Stairs", type: "teleportToken", system }]);
    report.asked++;
  }

  console.log("Crooked House stairs", report);
  ui.notifications.info(`Stairs: ${report.created} created, ${report.moved} moved to the top of the flight, `
    + `${report.leftWhereHePutIt} left where you put them, ${report.asked} now ask before moving anyone`
    + (report.skipped.length ? ` — skipped ${report.skipped.join("; ")}` : "."));
  return report;
})();
