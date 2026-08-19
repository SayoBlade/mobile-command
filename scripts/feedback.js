// §48 The feedback window.
//
// DM 2026-08-19: "open some kind of feedback window that mails me with a unique title that i can
// filter, so people can write feedback as well as send the relevant log/s".
//
// A real window, not a block inside the DM panel. The panel repaints itself on every clock tick, so
// anything living inside it has to survive that; a dialog is independent of all of it, and it can
// be opened by a player, which an inline panel section never could.
//
// Three things it has to get right:
//   1. A SUBJECT THAT FILTERS. Every message starts `[MOBILE-COMMAND]`, so one mail rule catches
//      the lot, and carries a short id so a reply can name the report.
//   2. GETTING THE LOG OUT. mailto: bodies are capped by the OS/browser somewhere around 2000
//      characters and a report is far larger, so the draft carries the person's own words while the
//      log travels by clipboard or as a saved .txt to attach. Pretending to push 30KB through a
//      mailto would silently truncate it, and a truncated log is worse than one never promised.
//   3. NEVER CLAIMING SUCCESS IT DIDN'T HAVE. Every action reports what actually happened, with
//      counts — the rule the empty-clipboard bug bought us.

import { MODULE_ID } from "./preset.js";
import { buildDevReport } from "./devreport.js";

const KINDS = { bug: "Something's broken", idea: "An idea", question: "A question" };

const safe = (fn, fallback = "?") => {
  try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch (e) { return "?"; }
};

// Short, readable, and unambiguous read aloud. Not a uuid — it goes in a subject line.
function feedbackId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function feedbackEmail() {
  try { return String(game.settings.get(MODULE_ID, "feedbackEmail") || "").trim(); } catch (e) { return ""; }
}

/** The full text of one report: what the person wrote, then everything technical. */
function feedbackText({ id, kind, message, details }) {
  const head = [
    `mobile-command feedback ${id}`,
    `kind        ${KINDS[kind] ?? kind}`,
    `from        ${safe(() => game.user?.name)}`,
    ""
  ].join("\n");
  const body = `${message.trim() || "(no description given)"}\n`;
  return details ? `${head}${body}\n${buildDevReport()}` : `${head}${body}`;
}

/** Copy, and return HOW MANY CHARACTERS ACTUALLY LANDED — 0 means it failed, whatever the reason. */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return text.length; }
  catch (e) { /* no clipboard permission (plain http, older browser) — fall through */ }
  // The selection route needs a real element in the document; build a throwaway one.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    const ok = document.execCommand("copy");
    const n = ok ? ta.value.length : 0;
    ta.remove();
    return n;
  } catch (e) { return 0; }
}

/**
 * Open the feedback window. Any user, any client — the DM panel's button, the module settings menu
 * and `MobileCommand.feedback()` all land here.
 */
export async function openFeedback({ kind = "bug", message = "" } = {}) {
  const id = feedbackId();
  const esc = foundry.utils.escapeHTML;
  const to = feedbackEmail();
  const kindOpts = Object.entries(KINDS)
    .map(([k, label]) => `<option value="${k}"${k === kind ? " selected" : ""}>${esc(label)}</option>`).join("");

  const content = `<div class="mc-fb">
    <p class="mc-fb-lead">Tell the dev what happened. The technical details are gathered for you.</p>
    <label class="mc-fb-label">This is…</label>
    <select name="kind" class="mc-fb-kind">${kindOpts}</select>
    <label class="mc-fb-label">What happened?</label>
    <textarea name="message" class="mc-fb-msg" rows="5"
      placeholder="What you did, what you expected, what happened instead.">${esc(message)}</textarea>
    <label class="mc-fb-check"><input type="checkbox" name="details" checked> Include technical details</label>
    <div class="mc-fb-row">
      <button type="button" data-fb-copy><i class="fas fa-copy"></i> Copy</button>
      <button type="button" data-fb-save><i class="fas fa-download"></i> Save file</button>
    </div>
    <p class="mc-fb-note">Reference <b>${id}</b>. Email can't carry the details, so they go on your
      clipboard — paste them into the message — or save the file and attach it.</p>
  </div>`;

  const read = (html) => ({
    id,
    kind: html.querySelector("[name=kind]")?.value ?? "bug",
    message: html.querySelector("[name=message]")?.value ?? "",
    details: !!html.querySelector("[name=details]")?.checked
  });

  await foundry.applications.api.DialogV2.wait({
    window: { title: "Mobile Command — Send feedback" },
    position: { width: 480 },
    content,
    render: (_ev, dialog) => {
      const html = dialog?.element ?? dialog;
      if (!html?.querySelector) return;
      html.querySelector("[data-fb-copy]")?.addEventListener("click", async () => {
        const n = await copyText(feedbackText(read(html)));
        if (n > 0) ui.notifications.info(`Copied ${n} characters.`);
        else ui.notifications.warn("Couldn't copy — use Save file instead.");
      });
      html.querySelector("[data-fb-save]")?.addEventListener("click", () => {
        const text = feedbackText(read(html));
        try {
          foundry.utils.saveDataToFile(text, "text/plain", `mobile-command-${id}.txt`);
          ui.notifications.info(`Saved mobile-command-${id}.txt — attach it to your email.`);
        } catch (e) {
          console.error(`${MODULE_ID} | feedback save failed`, e);
          ui.notifications.warn("Couldn't save the file — use Copy instead.");
        }
      });
    },
    buttons: [
      { action: "close", label: "Close" },
      {
        action: "send", label: "Open email", default: true,
        callback: async (_ev, _btn, dialog) => {
          const html = dialog?.element ?? dialog;
          const data = read(html);
          if (!to) {
            ui.notifications.warn("No feedback address is set — copy the text and send it yourself.");
            await copyText(feedbackText(data));
            return;
          }
          // Clipboard FIRST: opening the mail draft steals focus, and a clipboard write after that
          // can be refused outright. Doing it first also means the details are ready to paste the
          // moment the draft appears.
          const n = await copyText(feedbackText(data));
          // The subject is the whole point — one constant prefix so a single mail rule catches every
          // report, plus the id to refer back to.
          const subject = `[MOBILE-COMMAND] ${data.kind} · ${id}`;
          const lines = [
            data.message.trim() || "(no description given)",
            "",
            "---",
            `report ${id} · module ${safe(() => game.modules.get(MODULE_ID)?.version)} · foundry ${safe(() => game.version)} · ${safe(() => game.system.id)} ${safe(() => game.system.version)}`,
            data.details
              ? (n > 0
                ? "Technical details are on the clipboard — paste them below this line."
                : "Technical details: use Save file in the feedback window and attach it.")
              : "(technical details not included)"
          ];
          const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
          try {
            window.open(href, "_blank");
            ui.notifications.info(n > 0
              ? `Email opened. ${n} characters are on your clipboard — paste them in.`
              : "Email opened. Use Save file to attach the details.");
          } catch (e) {
            console.error(`${MODULE_ID} | feedback mailto failed`, e);
            ui.notifications.warn(`Couldn't open an email app — send it to ${to} yourself.`);
          }
        }
      }
    ]
  }).catch(() => null); // dismissed with Escape — not an error
}

/**
 * A Foundry settings-menu entry, so feedback is reachable without the DM panel — including by a
 * player. `restricted: false` on purpose: the whole point is that the people hitting bugs can
 * report them, and most of them are not the GM.
 */
export function registerFeedbackMenu() {
  try {
    game.settings.registerMenu(MODULE_ID, "feedbackWindow", {
      name: "Mobile Command feedback",
      label: "Send feedback",
      hint: "Report a bug or send an idea, with the technical details gathered for you.",
      icon: "fas fa-envelope",
      // A shim: Foundry instantiates and renders the menu's type; we redirect to the real window.
      type: class extends foundry.applications.api.ApplicationV2 {
        render() { openFeedback(); return this; }
      },
      restricted: false
    });
  } catch (e) { console.warn(`${MODULE_ID} | could not register the feedback menu`, e); }
}
