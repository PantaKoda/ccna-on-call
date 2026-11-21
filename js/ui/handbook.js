// The Handbook drawer: the command reference and the theory page of any topic,
// searchable, without leaving the lab you are working on. Also exports the
// Markdown renderer and the theory loader used by the Study screen.

import { h, esc } from "./dom.js";
import { HANDBOOK } from "../game/handbook.js";
import { TOPIC_BY_ID, TOPIC_ORDER, splitTheory, theoryFor } from "../game/topics.js";
import { store } from "./store.js";

const SECTION_BADGE = { v1: ["vbadge v1x", "v1 exclusive", "In the v1.1 blueprint, not in v2.0"], v2: ["vbadge v2n", "New in v2", "New in the v2.0 blueprint"] };

// one topic's theory page for the exam version being studied
export const theoryPage = (pages, id) => theoryFor(pages[id] || "", store.exam());

// ---- content loaders
let notesPromise = null;
function loadNotes() {
  // your own cheat sheet (data/notes.js) replaces the built-in reference
  const pick = () => (window.CCNA_NOTES && window.CCNA_NOTES.length ? window.CCNA_NOTES : HANDBOOK);
  notesPromise ||= new Promise(resolve => {
    const sc = document.createElement("script");
    sc.src = "data/notes.js";
    sc.onload = () => resolve(pick());
    sc.onerror = () => resolve(HANDBOOK);
    document.head.append(sc);
  });
  return notesPromise;
}

let theoryPromise = null;
export function loadTheory() {
  theoryPromise ||= fetch("content/theory.md").then(r => (r.ok ? r.text() : "")).then(splitTheory).catch(() => ({}));
  return theoryPromise;
}

// ---- Markdown subset -> DOM. Every searchable unit gets class "unit".
const inline = t => esc(t)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\*([^*\s][^*]*)\*/g, "<em>$1</em>")
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

const cells = line => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, "|"));
const LIST = /^\s*([-*]|\d+\.)\s+/;

export function renderMarkdown(md) {
  const root = h("div", { class: "hb-doc" });
  const lines = md.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  let section = null;
  const into = () => section || root;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      const tag = /\s*\{(v1|v2)\}\s*$/.exec(line);
      const title = line.slice(3).replace(/\s*\{(v1|v2)\}\s*$/, "");
      const b = tag && SECTION_BADGE[tag[1]];
      section = h("section", { class: "hb-section" + (tag ? " tagged" : "") }, h("h3", {}, title, b ? h("span", { class: b[0], title: b[2] }, b[1]) : null));
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
    } else if (LIST.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const list = h(ordered ? "ol" : "ul");
      i--;
      while (i + 1 < lines.length && LIST.test(lines[i + 1])) list.append(h("li", { class: "unit", html: inline(lines[++i].replace(LIST, "")) }));
      into().append(list);
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
  for (const list of doc.querySelectorAll("ul, ol")) list.hidden = !list.querySelector(".unit:not([hidden])");
  for (const t of doc.querySelectorAll(".hb-table")) t.hidden = !t.querySelector("tr.unit:not([hidden])");
  for (const sec of doc.querySelectorAll(".hb-section")) sec.hidden = !sec.querySelector(".unit:not([hidden])");
  countEl.textContent = words.length ? `${shown} match${shown === 1 ? "" : "es"}` : "";
}

// ---- the drawer
let drawer = null;

// open (or switch) the drawer; `topic` shows that topic's theory page
export function openHandbook(topic) {
  if (drawer) closeHandbook();
  const body = h("div", { class: "hb-body" }, h("p", { class: "muted" }, "Loading..."));
  const count = h("span", { class: "muted small" });
  const search = h("input", { class: "hb-search", type: "search", placeholder: "Search this page, e.g. trunk allowed", "aria-label": "Search the handbook" });
  const pages = h("select", { class: "hb-pages", "aria-label": "Handbook page" },
    h("option", { value: "" }, "Command reference"),
    h("optgroup", { label: "Theory" }, TOPIC_ORDER.filter(id => TOPIC_BY_ID.get(id)[store.exam()] !== null).map(id => h("option", { value: id }, TOPIC_BY_ID.get(id).name))));
  pages.value = topic && TOPIC_BY_ID.has(topic) ? topic : "";
  drawer = h("aside", { class: "handbook", role: "dialog", "aria-label": "Handbook" },
    h("header", { class: "hb-head" }, h("strong", {}, "Handbook"), pages, count,
      h("button", { class: "btn ghost small", onclick: closeHandbook, "aria-label": "Close handbook" }, "Close")),
    search, body);
  document.body.append(drawer);
  drawer.addEventListener("keydown", e => { if (e.key === "Escape") closeHandbook(); });

  let doc = null;
  const show = () => {
    const id = pages.value;
    const wanted = id;
    (id ? loadTheory().then(t => theoryPage(t, id)) : loadNotes().then(n => n.map(x => x.md).join("\n"))).then(md => {
      if (!drawer || pages.value !== wanted) return;
      doc = renderMarkdown(md || "Nothing here yet.");
      body.replaceChildren(doc);
      body.scrollTop = 0;
      filter(doc, search.value, count);
    });
  };
  pages.addEventListener("change", show);
  search.addEventListener("input", () => { if (doc) filter(doc, search.value, count); });
  show();
  search.focus();
}
export function toggleHandbook() {
  if (drawer) closeHandbook(); else openHandbook();
}
export function closeHandbook() {
  if (drawer) { drawer.remove(); drawer = null; }
}
