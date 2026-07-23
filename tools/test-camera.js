// Off-table tests for the TV camera's follow geometry (DESIGN §23, scripts/camera-frame.js).
//
// Run with Foundry's bundled node (there is no separate node on this machine):
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
//     "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" \
//     tools/test-camera.js
//
// WHY: the camera needs the display client plus a moving token, so it cannot be proved from one
// browser — which is how three generations of it shipped on reasoning alone and were wrong the same
// way each time. These run the REAL numbers of the test world's active scene (Cave A: Kobold Lair,
// read live 2026-07-24): 7930×5850, grid 260px at 5 ft/square, so ONE FOOT IS 52 PIXELS. That ratio
// is the whole story of the old bug — the retired 25 ft margin was 1300px per side.
//
// These prove the maths, NOT the table. Panning that is correct here can still look wrong on a TV.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

// --- the scene, as it actually is -------------------------------------------------------------
const GRID = 260, FT = 5;              // 260px per 5ft square
const ftPx = (ft) => (ft / FT) * GRID; // 1 ft = 52px
const SCREEN_W = 1920, SCREEN_H = 1080;
// Foundry pads a scene by `padding` rounded UP to whole grid squares on each side.
const PAD_X = Math.ceil((0.25 * 7930) / GRID) * GRID; // 2080
const PAD_Y = Math.ceil((0.25 * 5850) / GRID) * GRID; // 1560
const SCENE = { x: PAD_X, y: PAD_Y, width: 7930, height: 5850 };

// A 1×1 token's rect from its top-left, as Foundry stores it.
const tok = (x, y, squares = 1) => ({ minX: x, minY: y, maxX: x + squares * GRID, maxY: y + squares * GRID });

// The live party, mid-map so the scene clamp doesn't confound the pan tests.
const PARTY = [tok(4420, 3900), tok(4680, 3900), tok(4940, 3900)];

// --- tiny harness ------------------------------------------------------------------------------
let failed = 0, n = 0;
const results = [];
function check(name, ok, detail) {
  n++;
  results.push(`${ok ? "PASS" : "FAIL"} ${n}. ${name}${ok ? "" : `\n       ${detail}`}`);
  if (!ok) failed++;
}
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

async function loadModule(file) {
  const src = fs.readFileSync(file, "utf8");
  const context = vm.createContext({});
  const mod = new vm.SourceTextModule(src, { identifier: file, context });
  await mod.link(() => { throw new Error("camera-frame.js must have no imports"); });
  await mod.evaluate();
  return mod.namespace;
}

async function main() {
  const C = await loadModule(path.join(__dirname, "..", "scripts", "camera-frame.js"));
  const { planPartyFrame, measureClearancePx, clampClearanceFt, unionBox } = C;

  const FLOOR = ftPx(5);
  // A frame the DM might set: party centred, zoomed so the group reads well on the TV.
  const core = unionBox(PARTY);
  const centre = { x: (core.minX + core.maxX) / 2, y: (core.minY + core.maxY) / 2 };
  const FRAME_SCALE = 0.6;

  const plan = (opts) => planPartyFrame({
    core, tagalongs: [], pivot: { ...centre }, screenW: SCREEN_W, screenH: SCREEN_H,
    frameScale: FRAME_SCALE, curScale: FRAME_SCALE,
    wantPx: ftPx(15), floorPx: FLOOR, minZoom: 0.1, maxZoom: 3, sceneRect: SCENE, ...opts
  });

  // 1 — the measurement is the MINIMUM over all four edges, not an average, and not per-axis
  //     (DM: "15 and two at 20 — keep 15"). Deliberately at 0.4, not the 0.6 used elsewhere: at
  //     0.6 the VERTICAL budget is only 14.8ft for this box, so the answer would correctly be the
  //     vertical edge and the test would be measuring the wrong thing (caught by this suite).
  {
    const scale = 0.4;
    const halfW = SCREEN_W / scale / 2;
    const box = unionBox([tok(1000, 3900), tok(1000 + ftPx(5), 3900)]);
    const pivot = { x: box.minX - ftPx(15) + halfW, y: (box.minY + box.maxY) / 2 };
    const px = measureClearancePx({ box, pivot, scale, screenW: SCREEN_W, screenH: SCREEN_H });
    check("clearance is the closest token's, in ft", near(px / GRID * FT, 15, 0.01), `got ${(px / GRID * FT).toFixed(2)} ft, want 15`);
  }

  // 2 — the floor holds: a party jammed against the edge captures 5ft, never less.
  check("clearance floors at 5 ft", clampClearanceFt(2, 5, 60) === 5, `got ${clampClearanceFt(2, 5, 60)}`);
  // 3 — and never negative, even with a token already off-screen.
  check("an off-screen token still floors at 5 ft", clampClearanceFt(-300, 5, 60) === 5, `got ${clampClearanceFt(-300, 5, 60)}`);
  // 4 — the ceiling holds: a whole-map frame doesn't make the camera chase a distant token.
  check("clearance ceilings at 60 ft", clampClearanceFt(240, 5, 60) === 60, `got ${clampClearanceFt(240, 5, 60)}`);

  // 5 — THE HEADLINE: a step that widens the party box must not touch the zoom.
  {
    const spread = unionBox([tok(4420, 3900), tok(4940 + GRID * 4, 3900)]); // a PC walks 4 squares out
    const r = plan({ core: spread });
    check("a step that widens the party does NOT change the zoom",
      near(r.scale, FRAME_SCALE, 1e-9), `scale moved ${FRAME_SCALE} → ${r.scale.toFixed(4)}`);
  }

  // 6 — a step TOWARD the group costs nothing at all: no pan, no zoom.
  {
    const tighter = unionBox([tok(4680, 3900), tok(4940, 3900)]); // the left PC steps in
    const r = plan({ core: tighter });
    check("a step toward the group moves the camera not at all",
      near(r.cx, centre.x, 0.5) && near(r.cy, centre.y, 0.5) && near(r.scale, FRAME_SCALE, 1e-9),
      `pivot ${centre.x},${centre.y} → ${r.cx.toFixed(1)},${r.cy.toFixed(1)}`);
  }

  // 7 — a step toward the edge PANS, by exactly the amount the clearance was broken by, not more.
  {
    const halfW = SCREEN_W / FRAME_SCALE / 2;
    // Put the party so its left edge sits exactly at the 15ft inset, then step one square left.
    const pivot = { x: core.minX - ftPx(15) + halfW, y: centre.y };
    const moved = { ...core, minX: core.minX - GRID };
    const r = plan({ core: moved, pivot });
    check("a step toward the edge pans by exactly one square",
      near(r.cx, pivot.x - GRID, 0.5) && near(r.scale, FRAME_SCALE, 1e-9),
      `cx ${pivot.x.toFixed(1)} → ${r.cx.toFixed(1)}, wanted ${(pivot.x - GRID).toFixed(1)}; scale ${r.scale.toFixed(4)}`);
  }

  // 8 — the pull-back is LAST RESORT: only when the drivers can't fit at the 5ft floor.
  {
    // Widest the core can be at FRAME_SCALE while still fitting with the floor on both sides.
    const maxCoreW = SCREEN_W / FRAME_SCALE - FLOOR * 2;
    const justFits = { minX: 4000, minY: 3900, maxX: 4000 + maxCoreW - 1, maxY: 3900 + GRID };
    const r = plan({ core: justFits });
    check("a party that still fits at the floor keeps the DM's zoom",
      near(r.scale, FRAME_SCALE, 1e-9), `scale ${r.scale.toFixed(4)} ≠ ${FRAME_SCALE}`);
  }
  {
    const tooWide = { minX: 4000, minY: 3900, maxX: 4000 + SCREEN_W / FRAME_SCALE + 1000, maxY: 3900 + GRID };
    const r = plan({ core: tooWide });
    const wantFit = SCREEN_W / ((tooWide.maxX - tooWide.minX) + FLOOR * 2);
    check("a split party pulls back by the MINIMUM that fits",
      r.scale < FRAME_SCALE && near(r.scale, wantFit, 1e-9),
      `scale ${r.scale.toFixed(4)}, wanted exactly ${wantFit.toFixed(4)}`);
    // ...and that is nowhere near a whole-map fit, which is the bug being fixed.
    const wholeMap = Math.min(SCREEN_W / SCENE.width, SCREEN_H / SCENE.height);
    check("...and is far tighter than fitting the whole map",
      r.scale > wholeMap * 1.5, `pull-back ${r.scale.toFixed(4)} vs whole-map ${wholeMap.toFixed(4)}`);
  }

  // 9 — regrouping restores the DM's zoom, because the pull-back never wrote frameScale.
  {
    const r = plan({ core, curScale: 0.3 }); // camera currently pulled back to 0.3
    check("regrouping returns to the DM's zoom", near(r.scale, FRAME_SCALE, 1e-9),
      `scale ${r.scale.toFixed(4)} ≠ ${FRAME_SCALE}`);
  }

  // 10 — a pet beside the party is framed for free (DM 2026-07-22: frame the owl).
  {
    const owl = tok(core.maxX, 3900);
    const r = plan({ tagalongs: [owl] });
    check("a pet beside the party joins the frame", r.box.maxX >= owl.maxX,
      `box maxX ${r.box.maxX} < owl ${owl.maxX}`);
  }

  // 11 — a mage hand across the room is dropped, and costs NOTHING (DM 2026-07-23).
  {
    const mageHand = tok(4420 + GRID * 30, 3900 + GRID * 10);
    const r = plan({ tagalongs: [mageHand] });
    const noPet = plan({});
    check("a distant summon is left behind, not chased",
      r.box.maxX === core.maxX && r.box.maxY === core.maxY,
      `box grew to ${r.box.maxX},${r.box.maxY} (core ${core.maxX},${core.maxY})`);
    check("...and costs no zoom and no pan",
      near(r.scale, noPet.scale, 1e-9) && near(r.cx, noPet.cx, 0.5) && near(r.cy, noPet.cy, 0.5),
      `with pet ${r.cx.toFixed(1)},${r.cy.toFixed(1)}@${r.scale.toFixed(4)} vs without ${noPet.cx.toFixed(1)},${noPet.cy.toFixed(1)}@${noPet.scale.toFixed(4)}`);
  }

  // 12 — the nearer of two pets wins the free slot rather than whichever was listed first.
  {
    const far = tok(4420 + GRID * 20, 3900);
    const close = tok(core.maxX, 3900);
    const r = plan({ tagalongs: [far, close] });
    check("the nearer pet is preferred over the far one",
      r.box.maxX === close.maxX, `box maxX ${r.box.maxX}, close pet ${close.maxX}, far ${far.maxX}`);
  }

  // 13 — the scene clamp: the viewport never leaves the map.
  {
    const edgeParty = unionBox([tok(SCENE.x + SCENE.width - GRID * 2, SCENE.y + SCENE.height - GRID * 2)]);
    const r = plan({ core: edgeParty, pivot: { x: edgeParty.minX, y: edgeParty.minY } });
    const halfW = SCREEN_W / r.scale / 2, halfH = SCREEN_H / r.scale / 2;
    const inside = r.cx + halfW <= SCENE.x + SCENE.width + 0.5 && r.cy + halfH <= SCENE.y + SCENE.height + 0.5;
    check("the camera never overscrolls the map edge", inside,
      `right edge ${(r.cx + halfW).toFixed(1)} vs scene ${SCENE.x + SCENE.width}; bottom ${(r.cy + halfH).toFixed(1)} vs ${SCENE.y + SCENE.height}`);
  }

  // 14 — a scene axis smaller than the viewport centres instead of clamping to a corner.
  {
    const r = plan({ core, frameScale: 0.1, curScale: 0.1 });
    check("a fully-visible axis centres on the scene",
      near(r.cy, SCENE.y + SCENE.height / 2, 0.5),
      `cy ${r.cy.toFixed(1)}, scene centre ${(SCENE.y + SCENE.height / 2).toFixed(1)}`);
  }

  // 15 — a party that fits the screen budget holds the DM's zoom exactly. At 0.6 on a 1080p TV the
  //     budget is 1800px = 34.6 ft, minus the 5 ft floor each side = 24.6 ft of party. A 3-square
  //     (20 ft) spread is inside that.
  {
    const ok = unionBox([tok(4420, 3900), tok(4420, 3900 + GRID * 3)]);
    const r = plan({ core: ok });
    check("a party inside the screen budget holds the DM's zoom",
      near(r.scale, FRAME_SCALE, 1e-9), `scale ${r.scale.toFixed(4)} ≠ ${FRAME_SCALE}`);
  }

  // 16 — the retired model, for the record: the same 40 ft-strung party under a 25 ft-per-side
  //     margin collapses to ~whole-map, where the new one pulls back less than half as far. This
  //     is the regression test for the actual reported bug.
  {
    const spread = unionBox([tok(4420, 3900), tok(4420, 3900 + GRID * 7)]); // strung over 40 ft
    const oldReq = { w: (spread.maxX - spread.minX) + ftPx(25) * 2, h: (spread.maxY - spread.minY) + ftPx(25) * 2 };
    const oldScale = Math.min(SCREEN_W / oldReq.w, SCREEN_H / oldReq.h);
    const wholeMap = Math.min(SCREEN_W / SCENE.width, SCREEN_H / SCENE.height);
    const now = plan({ core: spread });
    check("the OLD model really did collapse to ~whole-map on this scene",
      oldScale < wholeMap * 1.35, `old ${oldScale.toFixed(4)} vs whole-map ${wholeMap.toFixed(4)}`);
    // 40 ft of party genuinely exceeds a 24.6 ft budget, so the new model DOES pull back here —
    // it just pulls back to 0.415 where the old model went to 0.231, a bit above the whole map.
    check("...where the new model pulls back far less",
      now.scale > oldScale * 1.5, `new ${now.scale.toFixed(4)} vs old ${oldScale.toFixed(4)}`);
  }

  console.log(results.join("\n"));
  console.log(`\n${n - failed}/${n} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
