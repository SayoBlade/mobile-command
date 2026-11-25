/**
 * Builds MC-REDESIGN-2026-11-26.pdf (in the renders folder): the summary, the ten sheets one per page, the questions.
 * For reading on a phone held sideways. Text comes from ../../MC-REDESIGN-2026-11-26.md sections 1 and 8.
 *   node renders-redesign-2026-11-26/src/pdf.mjs
 */
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const SRC = path.dirname(fileURLToPath(import.meta.url)), OUT = path.dirname(SRC), REPO = path.dirname(OUT);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const md = fs.readFileSync(path.join(REPO, "MC-REDESIGN-2026-11-26.md"), "utf8");
const section = (n) => { const m = md.match(new RegExp(`\\n## ${n}\\. [^\\n]*\\n([\\s\\S]*?)\\n---`)); return m ? m[1].trim() : ""; };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
// numbered items "N. text" with indented continuation/option lines
const items = (txt) => txt.split(/\n(?=\d+\. )/).filter(b => /^\d+\. /.test(b)).map(b => {
  const lines = b.split("\n").map(l => l.trim()).filter(Boolean); const out = []; let cur = "";
  for (const l of lines) { if (/^([A-C]\. |\*\*My pick)/.test(l)) { if (cur) out.push(cur); cur = l; } else cur += (cur ? " " : "") + l; }
  if (cur) out.push(cur);
  return out;
});
const sheets = fs.readdirSync(OUT).filter(f => /^\d\d-.*\.png$/.test(f)).sort();
const sumHTML = items(section(1)).map(it => `<li>${inline(it.join(" ").replace(/^\d+\. /, ""))}</li>`).join("");
const qHTML = items(section(8)).map(it => `<div class="q"><div class="qt">${inline(it[0])}</div>${it.slice(1).map(l => `<div class="${l.startsWith("**My pick") ? "pick" : "opt"}">${inline(l)}</div>`).join("")}</div>`);
const half = Math.ceil(qHTML.length / 2);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 11in 6.6in; margin: 0; }
* { box-sizing: border-box; } body { margin: 0; background: #0e0d11; color: #ece5d6; font-family: "Segoe UI", sans-serif; }
.pg { width: 11in; height: 6.6in; padding: .35in .45in; page-break-after: always; overflow: hidden; background: #0e0d11; }
.pg.img { padding: .12in; display: flex; align-items: center; justify-content: center; }
.pg.img img { max-width: 100%; max-height: 100%; }
h1 { font-size: 24pt; margin: 0 0 4pt; } h2 { font-size: 17pt; margin: 0 0 8pt; color: #c8a44d; } .sub { color: #a59b86; font-size: 11.5pt; margin-bottom: 10pt; }
ol { margin: 0; padding-left: 20pt; font-size: 11.6pt; line-height: 1.34; } li { margin-bottom: 4pt; } b { color: #fff; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22pt; }
.q { margin-bottom: 8pt; font-size: 10pt; line-height: 1.3; break-inside: avoid; } .qt { font-size: 10.6pt; } .opt { color: #cfc8ba; padding-left: 12pt; } .pick { color: #6fd0c4; padding-left: 12pt; } .pick b { color: #6fd0c4; }
code { color: #c8a44d; font-size: .92em; }
</style></head><body>
<div class="pg"><h1>Mobile Command redesign proposal</h1><div class="sub">26 Nov 2026 · two modes: with the deck, without the deck · read and recommend only, nothing was changed · turn the phone sideways</div><h2>Summary</h2><ol>${sumHTML}</ol></div>
${sheets.map(f => `<div class="pg img"><img src="${pathToFileURL(path.join(OUT, f)).href}"></div>`).join("")}
<div class="pg"><h2>Questions for you (1 to ${half})</h2><div class="sub">Reply with the number and the letter. My pick is in green.</div><div class="cols">${qHTML.slice(0, half).join("")}</div></div>
<div class="pg"><h2>Questions for you (${half + 1} to ${qHTML.length})</h2><div class="sub">The full reasoning, the old-home to new-home table, phases and risks are in MC-REDESIGN-2026-11-26.md.</div><div class="cols">${qHTML.slice(half).join("")}</div></div>
</body></html>`;
const tmp = path.join(SRC, "_pdf.html"); fs.writeFileSync(tmp, html);
const pdf = path.join(OUT, "MC-REDESIGN-2026-11-26.pdf");
execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", `--print-to-pdf=${pdf}`, pathToFileURL(tmp).href], { stdio: "ignore" });
fs.unlinkSync(tmp);
console.log("wrote", pdf, `(${sheets.length} sheets, ${qHTML.length} questions)`);
