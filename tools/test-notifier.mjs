// Headless check of the one way out to the screen (scripts/notifier.js, DM 2026-11-06: "no more than
// 5 messages, errors or warnings in one go; if something happens multiple times report it once"):
//
//   node tools/test-notifier.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import { readdirSync, readFileSync } from "node:fs";
import { createNotifier } from "../scripts/notifier.js";

let step = 0;
const check = (ok, what) => {
  step++;
  if (!ok) { console.error(`FAIL ${step}: ${what}`); process.exit(1); }
  console.log(`ok ${step}: ${what}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function screen() {
  const toasts = [];
  const rec = (level) => (text, options) => { toasts.push({ level, text, options }); return { id: toasts.length }; };
  globalThis.ui = { notifications: { info: rec("info"), warn: rec("warn"), error: rec("error") } };
  return toasts;
}

let toasts = screen();
let n = createNotifier("Mobile Command", { windowMs: 10 });
for (let i = 0; i < 50; i++) n.warn("the same thing");
await wait(30);
check(toasts.length === 2 && toasts[1].text === "the same thing (×50)", "a repeated message shows once, then once with its count");

toasts = screen();
n = createNotifier("Mobile Command", { windowMs: 10 });
for (let i = 0; i < 300; i++) n.info(`message ${i}`);
await wait(30);
check(toasts.length === 5, "300 different messages in one burst are five toasts");
check(toasts[4].text === "Mobile Command: 296 more messages (details in console)", "the fifth is the summary");

toasts = screen();
n = createNotifier("Mobile Command", { windowMs: 10 });
for (let i = 0; i < 4; i++) n.info(`message ${i}`);
n.error("fatal", { permanent: true });
await wait(30);
check(toasts.length === 5 && toasts[4].level === "error" && toasts[4].options?.permanent === true,
  "a held-back permanent error still reaches the screen, as an error that stays up");

toasts = screen();
n = createNotifier("Mobile Command", { windowMs: 10 });
const heard = [];
n.onHeld((level, text) => heard.push(`${level}:${text}`));
for (let i = 0; i < 6; i++) n.warn(`refusal ${i}`);
await wait(30);
check(heard.length === 2 && heard[0] === "warn:refusal 4", "a refusal that never reached the screen is still heard by the capture tap");

delete globalThis.ui;
check(createNotifier("Mobile Command").warn("headless") === null, "no ui at all is not an error");

const dir = new URL("../scripts/", import.meta.url);
const strays = readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "notifier.js")
  .filter((f) => /\bui\??\.notifications\??\.(info|warn|error)\b/.test(readFileSync(new URL(f, dir), "utf8")));
check(!strays.length, `no script raises a toast except through the notifier${strays.length ? ` (${strays})` : ""}`);
