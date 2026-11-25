/**
 * Renders every src/NN-*.html to ../NN-*.png with headless Chrome. Mockups only: nothing here is module code.
 * Each page declares its size: <meta name="shot" content="1680x980">.
 *   node renders-redesign-2026-11-26/src/render.mjs [name-filter]
 */
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const SRC = path.dirname(fileURLToPath(import.meta.url)), OUT = path.dirname(SRC);
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const only = process.argv[2];
for (const f of fs.readdirSync(SRC).filter(f => /^\d\d-.*\.html$/.test(f)).sort()) {
  if (only && !f.includes(only)) continue;
  const html = fs.readFileSync(path.join(SRC, f), "utf8");
  const m = html.match(/name="shot" content="(\d+)x(\d+)"/);
  const [w, h] = m ? [m[1], m[2]] : [1680, 1000];
  const png = path.join(OUT, f.replace(/\.html$/, ".png"));
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1.5", "--allow-file-access-from-files",
    `--window-size=${w},${h}`, `--screenshot=${png}`, "--virtual-time-budget=4000", pathToFileURL(path.join(SRC, f)).href], { stdio: "ignore" });
  console.log("wrote", path.basename(png), `${w}x${h}`);
}
