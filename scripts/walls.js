import { MODULE_ID } from "./preset.js";

// Wall geometry the engine and content packs share. Lived in cm-train.js until 2026-09-22 (§54): the
// Ghostlight landing prober was its first user, but the travel-point prober in rpc.js needed it too, and
// an engine file importing a campaign file was the one reverse dependency the pack seam could not keep.

export function wallsBlock(scene, a, b) {
  return scene.walls.contents.some(w => {
    if (w.door > 0 && w.ds === 1) return false;
    if ((w.move ?? 20) === 0) return false;
    const [x1, y1, x2, y2] = w.c;
    const d = (a.x - b.x) * (y1 - y2) - (a.y - b.y) * (x1 - x2);
    if (!d) return false;
    const t = ((a.x - x1) * (y1 - y2) - (a.y - y1) * (x1 - x2)) / d;
    const u = -((a.x - b.x) * (a.y - y1) - (a.y - b.y) * (a.x - x1)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  });
}
