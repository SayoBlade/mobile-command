// Pre-commit syntax gate for scripts/*.js and styles/*.css.
//
// Run with Foundry's bundled node (there is no separate node on this machine):
//   ELECTRON_RUN_AS_NODE=1 NODE_OPTIONS=--experimental-vm-modules \
//     "/c/Program Files/Foundry Virtual Tabletop 14/Foundry Virtual Tabletop.exe" \
//     tools/check-syntax.js scripts/*.js styles/*.css
//
// WHY THIS EXISTS, twice over:
//
//   JS — v0.1.68 shipped `#partyMove` as a duplicate private method name. One SyntaxError in one
//   file disables the WHOLE module (it's a single import chain) while Foundry still lists it as
//   enabled, so it reads as "the module vanished". `node --check` is the obvious tool and it is
//   USELESS here: Electron swallows the flag and exits 0 on garbage (verified 2026-07-21 against a
//   deliberately broken file). vm.SourceTextModule parses ESM for real without executing it.
//
//   CSS — 2026-07-21: a comment reading `--mc-pause-ink*/--mc-pause-counter*` closed itself early
//   at `ink*/`. The parser then treated the rest of the prose as garbage and resynced by EATING THE
//   NEXT RULE, which happened to be `#pause { display: none !important; }` — so Foundry's default
//   pause bar silently came back. Nothing errored, nothing logged; the file just quietly lost a
//   rule. The invariant below catches exactly that: strip comments properly, and no `*/` may
//   remain. Braces must balance too.
const fs = require("fs");
const vm = require("vm");

/** Strip CSS comments the way a parser does, and report anything left over that proves a comment
 *  ended early. Returns a list of problem strings (empty = clean). */
function checkCss(src) {
  const problems = [];
  let out = "", i = 0, line = 1, openedAt = 0;
  while (i < src.length) {
    if (src[i] === "\n") line++;
    if (src[i] === "/" && src[i + 1] === "*") {
      openedAt = line;
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; }
      if (i >= src.length) { problems.push(`unterminated comment opened on line ${openedAt}`); break; }
      i += 2;
      continue;
    }
    out += src[i++];
  }
  // A stray `*/` in the comment-stripped text means an earlier comment closed before it should
  // have — the prose after the accidental terminator is being parsed as CSS.
  const stray = out.indexOf("*/");
  if (stray !== -1) {
    const upto = out.slice(0, stray);
    problems.push(`stray "*/" on line ${upto.split("\n").length} — a comment closed early, and the `
      + `rule after it is being swallowed. Look for "*/" inside comment prose (e.g. "--foo*/--bar")`);
  }
  let depth = 0;
  for (const ch of out) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) { problems.push("unbalanced }"); break; }
  }
  if (depth > 0) problems.push(`${depth} unclosed { block(s)`);
  return problems;
}

let bad = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, "utf8");
  if (f.endsWith(".css")) {
    const problems = checkCss(src);
    if (problems.length) { bad = 1; for (const p of problems) console.log(`FAIL ${f} — ${p}`); }
    else console.log(`PASS ${f}`);
    continue;
  }
  try {
    new vm.SourceTextModule(src, { identifier: f });
    console.log(`PASS ${f}`);
  } catch (e) {
    bad = 1;
    console.log(`FAIL ${f} — ${e.message}`);
  }
}
process.exit(bad);
