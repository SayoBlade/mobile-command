// WHERE CROSSING HEROES LAND (lead 2026-11-12, section W: crossing one at a time put every hero on the one landing square,
// and Move Group after one went ahead landed the first on top of him). The landing first, then rings around it — the
// eight neighbours, then the sixteen of the next ring — skipping any square someone already stands on and any the
// caller says a wall cuts off. Nowhere free: the landing itself (stack rather than wall someone in; 10.7's corridor).
// Pure: `blocked(x, y)` answers walls; `occupied` are top-left corners already taken on the destination.
export const LANDING_RING = (() => {
  const out = [];
  for (const r of [1, 2]) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (Math.max(Math.abs(ox), Math.abs(oy)) === r) out.push([ox, oy]);
  // nearest first within a ring: the four sides before the corners
  return out.sort((a, b) => (Math.max(Math.abs(a[0]), Math.abs(a[1])) - Math.max(Math.abs(b[0]), Math.abs(b[1]))) || ((Math.abs(a[0]) + Math.abs(a[1])) - (Math.abs(b[0]) + Math.abs(b[1]))));
})();

export function landingSpots(landing, grid, n, { occupied = [], blocked = () => false } = {}) {
  const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;
  const snap = (v, o) => o + Math.round((v - o) / grid) * grid;
  const taken = new Set(occupied.map((p) => key(snap(p.x, landing.x), snap(p.y, landing.y))));
  const out = [];
  for (let i = 0; i < n; i++) {
    let pick = null;
    for (const [ox, oy] of [[0, 0], ...LANDING_RING]) {
      const x = landing.x + ox * grid, y = landing.y + oy * grid;
      if (taken.has(key(x, y))) continue;
      if ((ox || oy) && blocked(x, y)) continue;
      pick = { x, y }; break;
    }
    pick ??= { x: landing.x, y: landing.y };
    taken.add(key(pick.x, pick.y));
    out.push(pick);
  }
  return out;
}
