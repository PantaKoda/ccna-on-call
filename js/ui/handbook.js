// "Handbook" drawer: a searchable command reference. Uses the built-in one
// (js/game/handbook.js) unless you installed your own as data/notes.js.

import { h, esc } from "./dom.js";
import { HANDBOOK } from "../game/handbook.js";

let loading = null;
function loadNotes() {
  const pick = () => (window.CCNA_NOTES && window.CCNA_NOTES.length ? window.CCNA_NOTES : HANDBOOK);
  loading ||= new Promise(resolve => {
    const sc = document.createElement("script");
    sc.src = "data/notes.js";
    sc.onload = () => resolve(pick());
    sc.onerror = () => resolve(HANDBOOK);
    document.head.append(sc);
  });
  return loading;
}

const inline = t => esc(t)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

const cells = line => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, "|"));

// Markdown subset -> DOM. Every searchable unit gets class "unit".
function render(md) {
  const root = h("div", { class: "hb-doc" });
  const lines = md.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  let section = null;
  const into = () => section || root;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      section = h("section", { class: "hb-section" }, h("h3", {}, line.slice(3)));
      root.append(section);
    } else if (line.startsWith("### ")) {
      into().append(h("h4", {}, line.slice(4)));
    } else if (line.startsWith("```")) {
      const buf = [];
      while (++i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i]);
      into().append(h("pre", { class: "unit" }, buf.join("\n")));
    } else if (line.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const head = cells(line);
      const body = h("tbody");
      i++;
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
        body.append(h("tr", { class: "unit" }, cells(lines[++i]).map(c => h("td", { html: inline(c) }))));
      }
      into().append(h("div", { class: "hb-table" }, h("table", {}, h("thead", {}, h("tr", {}, head.map(c => h("th", { html: inline(c) })))), body)));
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ul = h("ul");
      i--;
      while (i + 1 < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i + 1])) ul.append(h("li", { class: "unit", html: inline(lines[++i].replace(/^\s*([-*]|\d+\.)\s+/, "")) }));
      into().append(ul);
    } else if (line.startsWith(">")) {
      const buf = [line.replace(/^>\s?/, "")];
      while (i + 1 < lines.length && lines[i + 1].startsWith(">")) buf.push(lines[++i].replace(/^>\s?/, ""));
      into().append(h("blockquote", { class: "unit", html: inline(buf.join(" ")) }));
    } else {
      into().append(h("p", { class: "unit", html: inline(line) }));
    }
  }
  return root;
}

function filter(doc, query, countEl) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const u of doc.querySelectorAll(".unit")) {
    const text = (u.dataset.t ||= u.textContent.toLowerCase());
    const ok = words.every(w => text.includes(w));
    u.hidden = !ok;
    if (ok) shown++;
  }
  for (const sub of doc.querySelectorAll("h4")) sub.hidden = words.length > 0;   // sub-headings would be left orphaned
  for (const t of doc.querySelectorAll(".hb-table")) t.hidden = !t.querySelector("tr.unit:not([hidden])");
  for (const sec of doc.querySelectorAll(".hb-section")) sec.hidden = !sec.querySelector(".unit:not([hidden])");
  countEl.textContent = words.length ? `${shown} match${shown === 1 ? "" : "es"}` : "";
}

let drawer = null;
export function toggleHandbook() {
  if (drawer) { closeHandbook(); return; }
  const body = h("div", { class: "hb-body" }, h("p", { class: "muted" }, "Loading the handbook..."));
  const count = h("span", { class: "muted small" });
  const search = h("input", { class: "hb-search", type: "search", placeholder: "Search commands, e.g. trunk allowed", "aria-label": "Search the handbook" });
  drawer = h("aside", { class: "handbook", role: "dialog", "aria-label": "Handbook" },
    h("header", { class: "hb-head" },
      h("strong", {}, "Handbook"), count,
      h("button", { class: "btn ghost small", onclick: closeHandbook, "aria-label": "Close handbook" }, "Close")),
    search, body);
  document.body.append(drawer);
  drawer.addEventListener("keydown", e => { if (e.key === "Escape") closeHandbook(); });
  search.focus();
  loadNotes().then(notes => {
    if (!drawer) return;
    const doc = render(notes.map(n => n.md).join("\n"));
    body.replaceChildren(doc);
    search.addEventListener("input", () => filter(doc, search.value, count));
  });
}
export function closeHandbook() {
  if (drawer) { drawer.remove(); drawer = null; }
}
