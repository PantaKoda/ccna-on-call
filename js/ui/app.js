// App shell: career screen, routing between levels, results.

import { h, rich, fmtTime, stars } from "./dom.js";
import { store } from "./store.js";
import { LEVELS, LEVEL_BY_ID, TIERS } from "../game/levels/index.js";
import { mountLab } from "./labview.js";
import { mountSubnet, mountQuiz } from "./drills.js";
import { toggleHandbook, closeHandbook } from "./handbook.js";

const app = document.getElementById("app");
const TYPE = { lab: "Lab", subnet: "Drill", quiz: "Exam" };
let view = null;      // the mounted level view, if any

const topbar = h("header", { class: "topbar" });
const main = h("main", { id: "main" });
app.append(topbar, main);

function renderTopbar(level) {
  const t = store.totals(), r = store.rank();
  topbar.replaceChildren(...[
    h("a", { class: "brand", href: "#/", "aria-label": "CCNA: On Call, back to the ticket queue" },
      h("span", { class: "brand-mark", "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", {}, "CCNA: ", h("b", {}, "On Call"))),
    level ? h("a", { class: "btn ghost small", href: "#/" }, "← Ticket queue") : null,
    level ? h("span", { class: "top-title" }, h("span", { class: "tag" }, TYPE[level.type]), level.title) : h("span", { class: "top-title muted" }, "Kestrel Freight · Network Operations"),
    h("span", { class: "spacer" }),
    h("span", { class: "top-rank", title: "Your rank" }, r.rank),
    h("span", { class: "top-xp" }, `${t.xp} XP`),
    h("button", { class: "btn small", onclick: toggleHandbook, title: "Searchable command reference" }, "Handbook"),
  ].filter(Boolean));
}

// ------------------------------------------------------------ career screen
function renderHome() {
  renderTopbar(null);
  const t = store.totals(), r = store.rank(), next = store.nextLevel();
  const pct = Math.round((t.xp / t.maxXp) * 100);
  const hero = h("section", { class: "hero" },
    h("div", { class: "hero-main" },
      h("p", { class: "eyebrow" }, "Your rank"),
      h("h1", {}, r.rank),
      h("p", { class: "muted" }, next
        ? "You're the on-call engineer. Tickets come in, you open a console and fix the network. Each tier is harder than the last."
        : "Every ticket closed. Replay any ticket to chase three stars."),
      h("div", { class: "xpbar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Experience" }, h("i", { style: `width:${pct}%` })),
      h("p", { class: "muted small" }, `${t.xp} / ${t.maxXp} XP · ${t.done} of ${t.count} tickets closed · ${t.stars} of ${t.maxStars} stars`)),
    next && h("a", { class: "btn primary big", href: `#/play/${next.id}` }, t.done ? "Next ticket" : "Start your first ticket", h("span", { class: "btn-sub" }, next.title)));

  const tiers = TIERS.map(tier => {
    const levels = LEVELS.filter(l => l.tier === tier.id);
    const done = levels.filter(l => store.isDone(l.id)).length;
    return h("section", { class: "tier" + (r.tier === tier.id ? " current" : "") },
      h("header", { class: "tier-head" },
        h("span", { class: "tier-num" }, `Tier ${tier.id}`),
        h("div", {}, h("h2", {}, tier.name), h("p", { class: "muted small" }, `${tier.rank} · ${tier.blurb}`)),
        h("span", { class: "spacer" }), h("span", { class: "muted small" }, `${done} / ${levels.length}`)),
      h("div", { class: "cards" }, levels.map(l => card(l, next))));
  });

  main.className = "home";
  main.replaceChildren(hero, ...tiers,
    h("footer", { class: "home-foot muted small" },
      h("span", {}, "Progress is saved in this browser."),
      h("button", { class: "linklike", onclick: () => { if (confirm("Erase all progress and start again as an intern?")) { store.reset(); renderHome(); } } }, "Reset progress")));
}

function card(l, next) {
  const res = store.result(l.id), open = store.isUnlocked(l.id);
  const inner = [
    h("div", { class: "card-top" }, h("span", { class: "tag " + l.type }, TYPE[l.type]), h("span", { class: "spacer" }),
      res ? stars(res.stars) : open ? h("span", { class: "muted small" }, `${l.xp} XP`) : h("span", { class: "lock", "aria-hidden": "true" }, "🔒")),
    h("h3", {}, l.title),
    h("p", { class: "muted small" }, l.subject),
    res ? h("p", { class: "card-foot small" }, `${res.xp} / ${l.xp} XP · best ${fmtTime(res.best)}`) : next && next.id === l.id ? h("p", { class: "card-foot small next" }, "Next up") : null,
  ];
  return open
    ? h("a", { class: "card" + (res ? " done" : "") + (next && next.id === l.id ? " next" : ""), href: `#/play/${l.id}` }, inner)
    : h("div", { class: "card locked", "aria-disabled": "true", title: "Close the previous ticket to unlock this one" }, inner);
}

// ------------------------------------------------------------ playing a level
function play(level) {
  renderTopbar(level);
  main.className = "play " + level.type;
  const mount = { lab: mountLab, subnet: mountSubnet, quiz: mountQuiz }[level.type];
  view = mount(main, level, { onDone: res => showResult(level, res) });
}

function showResult(level, res) {
  const before = store.rank().rank;
  const passed = res.stars > 0;
  const gained = passed ? store.record(level, res.stars, res.seconds) : 0;
  const after = store.rank().rank;
  const idx = LEVELS.indexOf(level);
  const next = LEVELS[idx + 1];
  const close = () => { overlay.remove(); };
  const go = hash => { close(); view = null; if (location.hash === hash) route(); else location.hash = hash; };
  const overlay = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", "aria-label": "Result" },
    h("div", { class: "modal" },
      h("p", { class: "eyebrow" }, passed ? (level.type === "lab" ? "Ticket closed" : "Passed") : "Not yet"),
      h("h2", {}, level.title),
      passed ? h("div", { class: "result-stars" }, stars(res.stars)) : null,
      passed ? h("p", { class: "result-xp" }, `+${gained} XP`, gained < store.xpFor(level, res.stars) ? h("span", { class: "muted small" }, " (best result kept)") : null) : h("p", {}, res.failText),
      h("p", { class: "muted" }, `${fmtTime(res.seconds)} · ${res.detail.join(" · ")}`),
      passed && after !== before ? h("p", { class: "promo" }, `Promotion: you are now ${/^[AEIOU]/.test(after) ? "an" : "a"} ${after}.`) : null,
      passed && level.debrief ? h("div", { class: "debrief" }, h("strong", {}, "Debrief"), h("p", { html: rich(level.debrief) })) : null,
      h("div", { class: "actions" },
        passed && next ? h("button", { class: "btn primary", onclick: () => go(`#/play/${next.id}`) }, `Next: ${next.title}`) : null,
        !passed ? h("button", { class: "btn primary", onclick: () => go(`#/play/${level.id}`) }, "Try again") : null,
        h("button", { class: "btn", onclick: () => go("#/") }, "Back to the ticket queue"),
        passed && level.type === "lab" ? h("button", { class: "btn ghost", onclick: close }, "Keep exploring this lab") : null)));
  document.body.append(overlay);
  renderTopbar(level);
  overlay.querySelector("button").focus();
}

// ------------------------------------------------------------ routing
let current = location.hash;
function route() {
  const m = /^#\/play\/([\w-]+)$/.exec(location.hash);
  const level = m && LEVEL_BY_ID.get(m[1]);
  if (view && view.dirty && view.dirty() && !confirm("Leave this ticket? Your progress on it will be lost.")) {
    history.replaceState(null, "", current || "#/");
    return;
  }
  current = location.hash;
  if (view) { view.destroy(); view = null; }
  document.querySelectorAll(".overlay").forEach(o => o.remove());
  closeHandbook();
  if (level && store.isUnlocked(level.id)) play(level);
  else {
    if (m) history.replaceState(null, "", "#/");
    renderHome();
  }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", e => { if (view && view.dirty && view.dirty()) e.preventDefault(); });
route();
