import { MODULE_ID } from "./preset.js";

// §27 Personal messages — DM ⇄ player private notes ("you are charmed, and want to get the
// party to leave this room"), riding Foundry's own chat WHISPERS. No new storage, no RPC:
// ChatMessage documents sync to every client and filter client-side (ChatMessage#visible =
// author or whisper target — verified 14.363), so both ends read the thread straight out of
// game.messages and the createChatMessage hook is the live push. Persistence, permissions and
// the native chat log all come for free — a note typed as /w in the sidebar joins the thread.
//
// Shared by shell.js (the phone overlay) and dm-panel.js (the Party-tab thread) — one filter,
// one send path, so the two ends can never disagree about what a "personal message" is.

/** Is this chat message a personal note (ours, or a hand-typed whisper) — as opposed to the
 *  automated whisper traffic (midi save cards, dnd5e roll results, initiative)? */
export function pmIsPersonal(m) {
  if (!m) return false;
  if (m.getFlag?.(MODULE_ID, "pm")) return true;
  if (!m.whisper?.length) return false;
  if (m.rolls?.length) return false; // whispered rolls are machinery, never notes
  if (m.flags?.["midi-qol"] || m.flags?.dnd5e) return false; // system/midi cards
  return true;
}

/** The two-way thread between one player user and the DM seat (any GM), chronological. */
export function pmThread(userId) {
  const gmIds = new Set(game.users.filter(u => u.isGM).map(u => u.id));
  const out = [];
  for (const m of game.messages) {
    if (!pmIsPersonal(m)) continue;
    const author = m.author?.id;
    const w = m.whisper ?? [];
    if ((gmIds.has(author) && w.includes(userId)) || (author === userId && w.some(id => gmIds.has(id))))
      out.push(m);
  }
  return out;
}

/** Send a personal note. Text in, HTML-escaped whisper out (newlines survive as <br>). */
export async function pmSend(targetUserIds, text) {
  const body = String(text ?? "").trim();
  if (!body || !targetUserIds?.length) return null;
  return ChatMessage.create({
    content: foundry.utils.escapeHTML(body).replaceAll("\n", "<br>"),
    whisper: targetUserIds,
    flags: { [MODULE_ID]: { pm: true } }
  });
}

/** A message's readable text — content may be HTML (a /w note can carry enrichment); render
 *  it as plain text so a bubble can never smuggle markup into either UI. */
export function pmText(m) {
  const div = document.createElement("div");
  div.innerHTML = m.content ?? "";
  div.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  return div.textContent.trim();
}

export function pmTime(m) {
  const d = new Date(m.timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
