// Shared mock components for the redesign sheets. Mockups only: nothing here is module code.
export const FA = "file:///C:/Users/User/Documents/Claude/Code/deck-command/service/node_modules/@fortawesome/fontawesome-free/css/all.min.css";
export const ICONS = "file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop%2014/resources/app/public/icons/";
export const i = (n, st = "") => `<i class="fas fa-${n}"${st ? ` style="${st}"` : ""}></i>`;
export const page = (title, w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="shot" content="${w}x${h}">
<title>${title}</title><link rel="stylesheet" href="${FA}"><link rel="stylesheet" href="base.css"></head><body>${body}
<div class="foot">Mock render for MC-REDESIGN-2026-11-26. Drawn with Mobile Command's own colours and the deck's key families; test party, not a screenshot.</div></body></html>`;

// The test party (class-named test characters, as on the seat runs).
export const PCS = [["Barbarian", "#d9534f", "Player1"], ["Cleric", "#5b7fd6", "Player2"], ["Rogue", "#5fbf7f", "Player3"], ["Wizard", "#c77dff", "Player4"]];
export const who = (n, c, extra = "") => `<span class="who">${i("circle-user", `color:${c}`)}<span>${n}</span>${extra}</span>`;
export const npc = (n) => `<span class="who">${i("dragon", "color:#c8a44d")}<span>${n}</span></span>`;
export const presence = (states = ["", "", "a", ""]) => `<div class="pres">${PCS.map(([, , u], k) => `<span><span class="dot ${states[k] || ""}"></span>${u}</span>`).join("")}</div>`;

// ----- DM panel -----
export const tab = (icon, o = {}) => `<div class="tab ${o.on ? "on" : ""} ${o.dim ? "dim" : ""}">${icon.startsWith("<") ? icon : i(icon)}${o.badge ? `<span class="bdg ${o.v ? "v" : ""}">${o.badge}</span>` : ""}${o.deck ? `<span class="dk">${i("table-cells")}</span>` : ""}</div>`;
export const TODAY_TABS = (on = -1, badges = {}) => ["dice-d20", "users", "tv", "campground", "route", "cloud-bolt", "moon", "clipboard-check", "gear"]
  .map((ic, k) => tab(ic, { on: k === on, badge: badges[k] })).join("");
// proposed six: Fight · Party · Stage · Time · Story · Setup
export const NEW_ICONS = ["dice-d20", "users", "masks-theater", "hourglass-half", "moon", "gear"];
export const NEW_NAMES = ["Fight", "Party", "Stage", "Time", "Story", "Setup"];
export const NEW_TABS = (on = -1, o = {}) => NEW_ICONS.map((ic, k) => tab(ic, { on: k === on, badge: (o.badges || {})[k], dim: (o.dim || []).includes(k), deck: (o.deck || []).includes(k), v: (o.violet || []).includes(k) })).join("");
export const panel = (floorHTML, tabsHTML, workHTML = "", open = false) => `<div style="display:inline-block;position:relative;padding-right:31px">
  ${workHTML}<div class="dmp"><div class="rail14"></div><div class="body">${floorHTML}</div><div class="rail14 b"></div><div class="tabs ${open ? "open" : ""}">${tabsHTML}</div></div></div>`;
export const work = (title, inner, sub = "") => `<div class="work"><div class="ttl"><span>${title}</span>${sub ? `<small>${sub}</small>` : ""}</div><div class="in">${inner}</div></div>`;
export const drawer = (title, body = null, extra = "") => `<div class="drw"><div class="h"><span>${title}${extra ? ` <small>${extra}</small>` : ""}</span>${i(body === null ? "chevron-right" : "chevron-down")}</div>${body === null ? "" : `<div class="b">${body}</div>`}</div>`;
export const btn = (label, cls = "") => `<span class="btn ${cls}">${label}</span>`;
export const stub = (text) => `<div class="stub">${i("table-cells")}<span>${text}</span></div>`;
export const hpStrip = (sel = null) => `<div><div class="who" style="color:${sel ? "var(--ink)" : "var(--muted)"};margin-bottom:4px">${sel ? npc(sel) : `${i("hand-pointer", "color:#6b6573")}<span>No token selected</span>`}</div>
  <div class="fx">${btn("− Damage", sel ? "" : "off")}<span class="inp" style="flex:0 0 46px;justify-content:center">${sel ? "11/11" : ""}</span>${btn("Heal +", sel ? "" : "off")}</div></div>`;

// today's floor
export const todayFloor = (chips = "") => `${presence()}
  <div class="fx">${btn(i("bullseye"), "sq")}${btn(i("up-down-left-right"), "sq")}${btn(i("sliders"), "sq")}</div>${chips}${hpStrip()}`;

// proposed floor. mode: "deck" | "panel"
export const nowLine = (o = {}) => `<div class="now"><span>${i("music")}${o.music || "Crooked House"}</span><span>${i("cloud-rain")}${o.wx || "Rain"}</span><span>${i("moon")}${o.hour || "Nightfall"}</span><span class="${o.tvWarn ? "w" : ""}">${i("tv")}${o.tv || "follows party"}</span></div>`;
export const waitingRow = (html = null, more = 0) => html
  ? `<div><div class="sec" style="color:#b6a2f2">Waiting${more ? ` · +${more}` : ""}</div>${html}</div>`
  : `<div><div class="sec" style="color:#6b6573">Waiting</div><div class="hint" style="height:22px;display:flex;align-items:center">Nothing waiting</div></div>`;
export const deckPill = (state = "live") => ({
  live: `<span class="pill live">${i("table-cells")}Deck</span>`,
  lost: `<span class="pill lost">${i("triangle-exclamation")}Deck lost</span>`,
  back: `<span class="pill offer">${i("table-cells")}Shrink?</span>`,
  none: `<span class="pill">${i("table-cells")}No deck</span>`,
  held: `<span class="pill offer">${i("table-cells")}Full panel</span>`,
}[state]);
export const newFloor = (mode, o = {}) => `<div class="fx" style="justify-content:space-between;align-items:flex-start">${presence(o.pres)}${deckPill(o.pill || (mode === "deck" ? "live" : "none"))}</div>
  ${waitingRow(o.waiting ?? null, o.more || 0)}
  ${nowLine(o.now || {})}
  ${mode === "panel" ? `<div class="fx">${btn(i("bullseye") + " Frame", "grow")}${btn(i("up-down-left-right") + " Manual", "grow")}</div>` : ""}
  ${hpStrip(o.sel || null)}`;

// ----- deck -----
export const key = (o = {}) => {
  if (o.empty) return `<div class="key" style="background:#000"></div>`;
  const art = o.art ? `<div class="art" style="background-image:url('${o.art.startsWith("file") ? o.art : ICONS + o.art}')"></div>` : `<div class="g">${i(o.g || "circle")}</div>`;
  return `<div class="key ${o.c || ""} ${o.rim ? "rim" : ""} ${o.dark ? "dark" : ""} ${o.cls || ""}">${o.dark ? "" : art}<div class="band">${o.sub ? `<small>${o.sub}</small>` : ""}${o.l || ""}</div></div>`;
};
export const tile = (html, cls = "") => `<div class="tile ${cls}">${html}</div>`;
export const BOTTOM = (o = {}) => [
  key({ g: "arrow-up", l: o.back || "Back", c: "" }), key({ g: "video", l: "Camera", c: "grey" }), key({ g: "pause", l: "Pause" }),
  o.bell || key({ g: "bell", l: "Notifications", sub: "none", c: "grey" }), key({ g: "music", l: "Music", sub: o.music || "Crooked House", c: "grey" })];
// rows: two arrays of 5 keys; tiles: three tile htmls
export const deck = (r1, r2, r3, tiles) => `<div class="deck">${r1.join("")}<div class="gap"></div>${tiles[0]}${r2.join("")}<div class="gap"></div>${tiles[1]}${r3.join("")}<div class="gap"></div>${tiles[2]}</div>`;
export const partyTile = () => tile(PCS.map(([n]) => `<div style="text-align:left;padding:0 5px">${n}<div class="hp" style="margin:1px 0 0;width:${60 + n.length * 3}%"></div></div>`).join(""));
export const whenTile = (a = "Nightfall", b = "21:40") => tile(`<b>${a}</b>${b}`);

// ----- phone -----
export const phone = (o) => `<div class="phone"><div class="hd"><div class="por"></div><div style="flex:1"><div class="nm">${o.name || "Test Cleric"}</div><div class="hpl">HP<b>${o.hp || "10"}</b>/10 &nbsp; AC <b style="color:var(--ink)">14</b></div></div>${o.hdRight || ""}</div>
  ${o.strip || ""}<div class="sc">${o.body}</div><div class="bar">${o.bar}</div></div>`;
export const pbarTabs = (items, on) => items.map(([ic, l, cls], k) => `<div class="${k === on ? "on" : ""} ${cls || ""}">${i(ic)}${l ? `<small>${l}</small>` : ""}</div>`).join("");
