// The three nursery toys get their faces (mobile-command §53). TEST WORLD ONLY.
//
// Crow, Bunny and Goat all shipped wearing the same Quasit placeholder. This points them — the actors, their
// prototype tokens and every token already placed on a map — at the art the DM generated and cleaned
// (mc-portraits/nursery, made transparent by tools/entrances/decheck.py).
//
// FIRST RUN (2026-09-20) re-pictured 6 tokens and 0 ACTORS, because it looked the actors up by the name the
// TOKEN carries. The book does not name them that way, so nothing matched, and a toy dropped fresh from the
// sidebar would still have come out a Quasit. It now walks the other way — token -> its actor -> its prototype —
// which needs no guess about what the module called them, and falls back to a name search only if no token of a
// toy is placed anywhere.
//
// The tokens stay HIDDEN: they appear when their intro plays, which is his rule for the three ("the tokens will
// only appear after they are introduced"). Nothing is deleted, and a token he has already re-pictured by hand is
// left alone.
(async () => {
  const MOD = "mobile-command";
  if (game.world?.id !== "offline-test") return ui.notifications.error("TEST WORLD ONLY — this is not the Offline test world.");
  if (!game.user?.isGM) return ui.notifications.error("Run this as a GM.");
  const ART = {
    Crow: "mc-portraits/nursery/raven-token.webp",
    Goat: "mc-portraits/nursery/goat-token.webp",
    Bunny: "mc-portraits/nursery/bunny-token.webp",
  };
  const PORTRAIT = {
    Crow: "mc-portraits/nursery/raven.webp",
    Goat: "mc-portraits/nursery/goat.webp",
    Bunny: "mc-portraits/nursery/bunny.webp",
  };
  const PLACEHOLDER = /quasit|mystery-man/i;
  const report = { actors: [], tokens: 0, left: [], noActor: [] };
  const seen = new Map(); // toy -> Set of actors reached through its tokens
  const sized = new Map(); // toy -> the size the DM gave its placed tokens, carried up to the prototype

  // 1. the placed tokens, and the actor each one points at
  for (const scene of game.scenes) {
    const rows = [];
    for (const t of scene.tokens) {
      const art = ART[t.name];
      if (!art) continue;
      const a = t.actorId ? game.actors.get(t.actorId) : null;
      if (a) { if (!seen.has(t.name)) seen.set(t.name, new Set()); seen.get(t.name).add(a); }
      // The DM shrank these by hand on the map (2026-09-20: "i shrank down the tokens to 0.25 size") — they are toys
      // on a house-sized floor. Carry HIS size up to the prototype so one dropped fresh from the sidebar matches,
      // instead of arriving a square wide. Read, never imposed: whatever he chose is what gets copied.
      if ((t.width ?? 1) !== 1 || (t.height ?? 1) !== 1) sized.set(t.name, { width: t.width, height: t.height });
      const cur = t.texture?.src ?? "";
      if (cur === art) continue;
      if (cur && !PLACEHOLDER.test(cur)) { report.left.push(`${scene.name}: ${t.name}`); continue; }
      rows.push({ _id: t.id, "texture.src": art });
    }
    if (rows.length) { await scene.updateEmbeddedDocuments("Token", rows); report.tokens += rows.length; }
  }

  // 2. no token of a toy anywhere? then, and only then, guess by name
  for (const name of Object.keys(ART)) {
    if (seen.get(name)?.size) continue;
    const hits = game.actors.filter((a) => new RegExp(`\b${name}\b`, "i").test(a.name));
    if (hits.length) seen.set(name, new Set(hits));
    else report.noActor.push(name);
  }

  // 3. the actors and their prototypes, so one dropped fresh from the sidebar is right too
  for (const [name, actors] of seen) {
    for (const actor of actors) {
      const cur = actor.prototypeToken?.texture?.src ?? "";
      if (cur === ART[name]) continue;
      if (cur && !PLACEHOLDER.test(cur)) { report.left.push(`${actor.name} (prototype is ${cur.split("/").pop()})`); continue; }
      const size = sized.get(name);
      await actor.update({ img: PORTRAIT[name], "prototypeToken.texture.src": ART[name], "prototypeToken.flags.mobile-command.cm": `toy:${name}`,
        ...(size ? { "prototypeToken.width": size.width, "prototypeToken.height": size.height } : {}) });
      report.actors.push(`${name} → ${actor.name}${size ? ` (${size.width}×${size.height})` : ""}`);
    }
  }

  console.log("Crooked House toys", report);
  ui.notifications.info(`The toys have faces: ${report.actors.length} actors, ${report.tokens} tokens`
    + (report.noActor.length ? ` — no actor found for ${report.noActor.join(", ")}` : "")
    + (report.left.length ? ` — left alone: ${report.left.join("; ")}` : "."));
  return report;
})();
