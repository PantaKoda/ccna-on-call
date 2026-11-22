// App shell: exam chooser, home (career path or topics), study pages, routing, results.

import { h, rich, fmtTime, stars } from "./dom.js";
import { store } from "./store.js";
import { LEVELS, LEVEL_BY_ID, TIERS } from "../game/levels/index.js";
import { EXAMS, TOPIC_BY_ID, LEVEL_TOPIC, topicsByDomain, topicOnly } from "../game/topics.js";
import { variantsOf, makeVariant } from "../game/practice.js";
import { mountLab } from "./labview.js";
import { mountSubnet, mountQuiz, loadBank, countByTopic, SOURCES } from "./drills.js";
import { toggleHandbook, closeHandbook, loadTheory, renderMarkdown, theoryPage } from "./handbook.js";
import { VERSION } from "../version.js";

const app = document.getElementById("app");
const TYPE = { lab: "Lab", subnet: "Drill", quiz: "Exam" };
const BADGE = {
  v1: () => h("span", { class: "vbadge v1x", title: "In the v1.1 blueprint, not in v2.0" }, "v1 exclusive"),
  v2: () => h("span", { class: "vbadge v2n", title: "New in the v2.0 blueprint" }, "New in v2"),
};
let view = null;      // the mounted activity, if any
let bank = null;      // question bank, once loaded (for counts on the Topics screen)
let onHome = false;

const topbar = h("header", { class: "topbar" });
const main = h("main", { id: "main" });
app.append(topbar, main);

loadBank().then(b => { bank = b; if (onHome) renderHome(); });

// `where` is null on the home screen, or { tag, title } inside an activity
function renderTopbar(where) {
  const t = store.totals(), r = store.rank(), chosen = store.examChosen();
  topbar.replaceChildren(...[
    h("a", { class: "brand", href: "#/", "aria-label": "CCNA: On Call, back to the home screen" },
      h("span", { class: "brand-mark", "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", { class: "brand-word" }, h("span", { class: "brand-pre" }, "CCNA: "), h("b", {}, "On Call"))),
    where && where.back !== false ? h("a", { class: "btn ghost small", href: "#/" }, "← Home") : null,
    where ? h("span", { class: "top-title" }, where.tag ? h("span", { class: "tag" + (where.solved ? " done" : "") }, where.tag) : null, where.title) : h("span", { class: "top-title muted" }, "Kestrel Freight · Network Operations"),
    h("span", { class: "spacer" }),
    chosen ? h("a", { class: "btn small exam-chip", href: "#/exam", title: `Studying for ${EXAMS[store.exam()].name}. Click to change.` }, h("span", { class: "exam-word" }, "Exam "), h("b", {}, EXAMS[store.exam()].short)) : null,
    chosen ? h("span", { class: "top-rank", title: "Your rank" }, r.rank) : null,
    chosen ? h("span", { class: "top-xp" }, `${t.xp} XP`) : null,
    chosen ? h("button", { class: "btn small", onclick: toggleHandbook, title: "Command reference and theory pages" }, "Handbook") : null,
    themeButton(where),
  ].filter(Boolean));
}

// The button names the theme you would switch to.
function themeButton(where) {
  const to = window.ccnaTheme.get() === "light" ? "dark" : "light";
  return h("button", {
    class: "btn small theme-btn", "aria-label": `Switch to ${to} mode`, title: `Switch to ${to} mode`,
    onclick: () => { window.ccnaTheme.set(to); renderTopbar(where); },
  }, h("span", { "aria-hidden": "true" }, to === "light" ? "☀" : "☾"), h("span", { class: "theme-word" }, to === "light" ? "Light" : "Dark"));
}

// Go to a route, also when it is the one already showing (a new variant).
function nav(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

// ------------------------------------------------------------ exam chooser
function renderChooser() {
  const first = !store.examChosen();
  renderTopbar({ tag: null, title: "Choose your exam", back: !first });
  main.className = "chooser";
  const NOTES = {
    v1: ["Everything in the game except the Ansible lab and the sections marked “New in v2”.", "Topics and sections that v2.0 dropped are marked “v1 exclusive”, so you can see what only this exam asks for.", "Matches a v1.1 question bank, if you imported one."],
    v2: ["Adds an Ansible lab, and theory sections on OSPFv3, storm control, RA guard and secure file transfer.", "Hides what v2.0 dropped: REST and SDN theory, NTP, QoS and the security-programme sections.", "The AI topics of v2.0 are not in the game yet."],
  };
  const card = id => {
    const e = EXAMS[id], cur = !first && store.exam() === id;
    return h("section", { class: "exam-card" + (cur ? " current" : "") },
      h("p", { class: "eyebrow" }, cur ? "Currently selected" : id === "v2" ? "New blueprint" : "Current blueprint"),
      h("h2", {}, e.name), h("p", { class: "muted" }, e.blurb),
      h("table", { class: "details" }, h("tbody", {}, e.domains.filter(d => d.n).map(d => h("tr", {}, h("th", { scope: "row" }, `${d.n}. ${d.name}`), h("td", {}, `${d.weight}%`))))),
      h("ul", { class: "exam-notes" }, NOTES[id].map(n => h("li", {}, n))),
      h("button", { class: "btn primary block", onclick: () => { store.setExam(id); nav("#/"); } }, cur ? `Keep studying for ${e.short}` : `Study for ${e.short}`));
  };
  main.replaceChildren(h("div", { class: "chooser-wrap" },
    h("h1", {}, "Which exam are you studying for?"),
    h("p", { class: "muted lead" }, "The labs, theory and questions are arranged by the blueprint you pick. Your progress is shared, and you can switch at any time from the Exam button in the top bar."),
    h("div", { class: "exam-cards" }, card("v1"), card("v2"))));
  view = { dirty: () => false, destroy() {} };
}

// ------------------------------------------------------------ home
function renderHome() {
  onHome = true;
  renderTopbar(null);
  const mode = store.pref("view", "career");
  main.className = "home";
  main.replaceChildren(...[hero(), switcher(mode), ...(mode === "topics" ? topicsView() : careerView()),
    h("footer", { class: "home-foot muted small" },
      h("span", {}, `Version ${VERSION}`),
      h("span", {}, "Progress is saved in this browser."),
      h("button", { class: "linklike", onclick: () => { if (confirm("Erase all progress and exam history, and start again as an intern?")) { store.reset(); renderHome(); } } }, "Reset progress"))].filter(Boolean));
}

function hero() {
  const t = store.totals(), r = store.rank(), next = store.nextLevel();
  const pct = Math.round((t.ticketXp / t.maxXp) * 100);
  return h("section", { class: "hero" },
    h("div", { class: "hero-main" },
      h("p", { class: "eyebrow" }, `Your rank · ${EXAMS[store.exam()].name}`),
      h("h1", {}, r.rank),
      h("p", { class: "muted" }, next
        ? "You're the on-call engineer. Study a topic, then work its tickets on a simulated network. Once you have solved a lab, open it again for a random variant whenever you want more practice."
        : "Every ticket closed. Open any lab again for a fresh random variant."),
      h("div", { class: "xpbar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Career path progress" }, h("i", { style: `width:${pct}%` })),
      h("p", { class: "muted small" }, `${t.done} of ${t.count} tickets closed · ${t.stars} of ${t.maxStars} stars · ${t.ticketXp} / ${t.maxXp} XP from tickets`,
        t.variants ? ` · ${t.variantXp} XP from ${t.variants} variant${t.variants > 1 ? "s" : ""}` : "")),
    next && h("a", { class: "btn primary big", href: `#/play/${next.id}` }, t.done ? "Next ticket" : "Start your first ticket", h("span", { class: "btn-sub" }, next.title)));
}

function switcher(mode) {
  const tab = (id, label) => h("button", { class: "seg" + (mode === id ? " on" : ""), role: "tab", "aria-selected": mode === id, onclick: () => { store.setPref("view", id); renderHome(); } }, label);
  let sources = null;
  if (bank && bank.hasBook) {
    const sel = h("select", { "aria-label": "Which exam questions to use" },
      h("option", { value: "all" }, "Book and custom"), h("option", { value: "book" }, "Book only"), h("option", { value: "custom" }, "Custom only"));
    sel.value = store.pref("sources", "all");
    sel.addEventListener("change", () => { store.setPref("sources", sel.value); renderHome(); });
    sources = h("label", { class: "sources muted small" }, "Exam questions: ", sel);
  }
  return h("div", { class: "switcher" }, h("div", { class: "segs", role: "tablist", "aria-label": "How to browse" }, tab("career", "Career path"), tab("topics", "Topics")), h("span", { class: "spacer" }), sources);
}

// ---- career path: tiers of tickets, each harder than the last
function careerView() {
  const r = store.rank(), next = store.nextLevel(), list = store.levels();
  return TIERS.map(tier => {
    const levels = list.filter(l => l.tier === tier.id);
    const done = levels.filter(l => store.isDone(l.id)).length;
    return h("section", { class: "tier" + (r.tier === tier.id ? " current" : "") },
      h("header", { class: "tier-head" },
        h("span", { class: "tier-num" }, `Tier ${tier.id}`),
        h("div", {}, h("h2", {}, tier.name), h("p", { class: "muted small" }, `${tier.rank} · ${tier.blurb}`)),
        h("span", { class: "spacer" }), h("span", { class: "muted small" }, `${done} / ${levels.length}`)),
      h("div", { class: "cards" }, levels.map(l => levelCard(l, next))));
  });
}

function levelCard(l, next, showTopic = true) {
  const res = store.result(l.id), open = store.isUnlocked(l.id);
  const topic = TOPIC_BY_ID.get(LEVEL_TOPIC[l.id]);
  const hasVariants = l.type === "lab" && variantsOf(l.id).length > 0, vs = store.variantStats(l.id);
  const inner = [
    h("div", { class: "card-top" }, h("span", { class: "tag " + l.type }, TYPE[l.type]), l.only ? BADGE[l.only]() : null, h("span", { class: "spacer" }),
      res ? stars(res.stars) : open ? h("span", { class: "muted small" }, `${l.xp} XP`) : h("span", { class: "lock", "aria-hidden": "true" }, "🔒")),
    h("h3", {}, l.title),
    h("p", { class: "muted small" }, (store.exam() === "v2" && l.v2 && l.v2.subject) || l.subject),
    res ? h("p", { class: "card-foot small" }, h("span", { class: "solved-mark" }, "✓ Solved"), ` · ${res.xp} / ${l.xp} XP · best ${fmtTime(res.best)}`,
      hasVariants ? h("span", { class: vs.n ? "variant-line on" : "variant-line" }, vs.n ? `✓ ${vs.n} variant${vs.n > 1 ? "s" : ""} solved · +${vs.xp} XP` : "Variants open") : null)
      : next && next.id === l.id ? h("p", { class: "card-foot small next" }, "Next up")
      : topic && showTopic ? h("p", { class: "card-foot small" }, topic.name) : null,
  ];
  return open
    ? h("a", { class: "card" + (res ? " done" : "") + (next && next.id === l.id ? " next" : ""), href: `#/play/${l.id}` }, inner)
    : h("div", { class: "card locked", "aria-disabled": "true", title: "Close the previous ticket in the career path to unlock this one" }, inner);
}

// ---- topics: grouped by the domains of the chosen exam; theory first, then questions and labs
function topicsView() {
  const exam = store.exam();
  const counts = bank ? countByTopic(bank) : null;
  const want = bank && bank.hasBook ? store.pref("sources", "all") : "all";
  const next = store.nextLevel(), list = store.levels();
  return topicsByDomain(exam).map(domain => h("section", { class: "track" },
    h("h2", { class: "track-name" }, domain.n ? `${domain.n}. ${domain.name}` : domain.name, domain.weight ? h("span", { class: "weight" }, `${domain.weight}% of the exam`) : null),
    domain.topics.map(t => {
      const levels = list.filter(l => LEVEL_TOPIC[l.id] === t.id);
      const c = counts ? counts[t.id] || { custom: 0, book: 0 } : null;
      const nq = c ? (want === "book" ? c.book : want === "custom" ? c.custom : c.custom + c.book) : 0;
      const split = c && bank.hasBook && want === "all" ? `${c.custom} custom · ${c.book} book` : c && bank.hasBook ? SOURCES[want].label + " questions" : "";
      const only = topicOnly(t);
      return h("section", { class: "topic", id: `topic-${t.id}` },
        h("header", { class: "topic-head" }, h("div", {}, h("h3", {}, t.name, only ? BADGE[only]() : null), h("p", { class: "muted small" }, t.blurb))),
        h("div", { class: "cards" },
          h("a", { class: "card theory" + (store.isStudied(t.id) ? " done" : ""), href: `#/study/${t.id}` },
            h("div", { class: "card-top" }, h("span", { class: "tag theory" }, "Theory")), h("h3", {}, "Study the theory"),
            h("p", { class: "muted small" }, "Key ideas, commands and common mistakes."),
            h("p", { class: "card-foot small" + (store.isStudied(t.id) ? "" : " next") }, store.isStudied(t.id) ? "✓ Studied" : "Start here")),
          nq > 0 ? h("a", { class: "card", href: `#/check/${t.id}` },
            h("div", { class: "card-top" }, h("span", { class: "tag quiz" }, "Check")), h("h3", {}, "Quick check"),
            h("p", { class: "muted small" }, `${Math.min(6, nq)} questions, the ones you missed first.`),
            h("p", { class: "card-foot small" }, `${nq} question${nq > 1 ? "s" : ""}${split ? " · " + split : ""}`)) : null,
          levels.map(l => levelCard(l, next, false))));
    })));
}

// ------------------------------------------------------------ study page
function study(t) {
  const exam = store.exam();
  renderTopbar({ tag: "Theory", title: t.name });
  main.className = "study";
  const article = h("article", { class: "prose" }, h("p", { class: "muted" }, "Loading..."));
  const side = h("aside", { class: "study-side" });
  const domains = topicsByDomain(exam), order = domains.flatMap(d => d.topics);
  const domain = domains.find(d => d.topics.includes(t));
  const idx = order.indexOf(t), prev = order[idx - 1], nextT = order[idx + 1];
  const only = topicOnly(t);
  main.replaceChildren(h("div", { class: "study-wrap" },
    h("div", { class: "study-main" }, h("p", { class: "eyebrow" }, `${EXAMS[exam].short} · ${domain.n ? `${domain.n}. ` : ""}${domain.name}`), h("h1", {}, t.name, only ? BADGE[only]() : null), h("p", { class: "muted lead" }, t.blurb), article,
      h("nav", { class: "study-nav" }, prev ? h("a", { class: "btn", href: `#/study/${prev.id}` }, `← ${prev.name}`) : h("span"), nextT ? h("a", { class: "btn", href: `#/study/${nextT.id}` }, `${nextT.name} →`) : h("span"))),
    side));
  loadTheory().then(pages => { if (main.contains(article)) article.replaceChildren(renderMarkdown(theoryPage(pages, t.id) || "This page is not written yet.")); });

  const levels = store.levels().filter(l => LEVEL_TOPIC[l.id] === t.id);
  const renderSide = () => {
    const studied = store.isStudied(t.id);
    side.replaceChildren(...[
      h("h2", {}, "After reading"),
      h("button", { class: "btn block" + (studied ? "" : " primary"), onclick: () => { store.setStudied(t.id, !studied); renderSide(); } }, studied ? "✓ Studied (undo)" : "Mark as studied"),
      h("a", { class: "btn block", href: `#/check/${t.id}` }, "Quick check (questions)"),
      levels.length ? h("h3", {}, "Labs") : null,
      levels.map(l => store.isUnlocked(l.id)
        ? h("a", { class: "side-link", href: `#/play/${l.id}` }, h("span", {}, l.title), store.result(l.id) ? stars(store.result(l.id).stars) : h("span", { class: "muted small" }, "open"))
        : h("div", { class: "side-link locked" }, h("span", {}, l.title), h("span", { "aria-hidden": "true" }, "🔒"))),
      levels.some(l => !store.isUnlocked(l.id)) ? h("p", { class: "muted small" }, "Locked labs open as you reach them in the career path.") : null,
      levels.some(l => variantsOf(l.id).length) ? h("p", { class: "muted small" }, "Solved a lab? Open it again and press New variant for a fresh version of it.") : null,
      h("a", { class: "btn ghost block", href: "#/" }, "Back to all topics"),
    ].flat().filter(Boolean));
  };
  renderSide();
  view = { dirty: () => false, destroy() {} };
  store.setPref("view", "topics");
}

// ------------------------------------------------------------ activities
// Buttons shown on a lab's ticket for getting random variants of it.
function variantTools(level) {
  const origin = level.practice ? LEVEL_BY_ID.get(level.origin) : level;
  if (!origin || !variantsOf(origin.id).length) return {};
  const fresh = () => nav(`#/variant/${origin.id}`);
  if (level.practice) {
    return {
      actions: [h("button", { class: "btn small primary", onclick: fresh, title: "Throw this one away and build a different random variant" }, "New variant"),
        h("button", { class: "btn small", onclick: () => nav(`#/play/${origin.id}`) }, "Original lab")],
      note: `A random variant of "${origin.title}", worth up to ${origin.xp} XP like the original: all of it with no hints and inside the par time.`,
    };
  }
  if (!store.variantsOpen(origin.id)) return { note: "Solve this lab once and a New variant button appears here: the same skill with different addresses, names or faults, as often as you like." };
  return {
    actions: [h("button", { class: "btn small primary", onclick: fresh, title: "The same skill with different addresses, names or faults" }, "New variant")],
    note: `${store.isDone(origin.id) ? "You have solved this lab. " : ""}New variant builds a random version of it, each worth up to ${origin.xp} XP again; press it as often as you like.`,
    badge: !store.isDone(origin.id) ? null : h("span", { class: "tag done", title: "You have solved this lab before" }, "✓ Solved"),
  };
}

let lastTemplate = null;     // so a lab with two templates alternates instead of repeating

function play(level) {
  // promotion exams have their own wording for the v2.0 blueprint
  if (store.exam() === "v2" && level.v2) level = { ...level, ...level.v2 };
  const tag = level.check ? "Check" : level.practice ? "Variant" : TYPE[level.type];
  renderTopbar({ tag, title: level.title });
  main.className = "play " + level.type;
  const mount = { lab: mountLab, subnet: mountSubnet, quiz: mountQuiz }[level.type];
  view = mount(main, level, { onDone: res => showResult(level, res), ...(level.type === "lab" ? variantTools(level) : {}) });
}

const checkLevel = t => ({
  id: `check:${t.id}`, type: "quiz", check: true, topic: t.id, title: `Quick check: ${t.name}`, from: "Practice", subject: `Quick check: ${t.name}`,
  brief: ["Up to six questions on this topic. Questions you missed before come first, then ones you have not seen."], params: { topic: t.id, count: 6 },
});

function showResult(level, res) {
  const close = () => { overlay.remove(); };
  const go = hash => { close(); view = null; nav(hash); };
  const btn = (label, hash, cls = "") => h("button", { class: "btn " + cls, onclick: () => go(hash) }, label);
  const topic = TOPIC_BY_ID.get(level.topic || LEVEL_TOPIC[level.id]);
  const revisit = (res.review || []).map(id => TOPIC_BY_ID.get(id)).filter(Boolean);
  const revisitLine = revisit.length ? h("p", { class: "small" }, "Worth revisiting: ", revisit.map((t, i) => [i ? ", " : "", h("a", { href: `#/study/${t.id}`, onclick: close }, t.name)])) : null;
  const explore = h("button", { class: "btn ghost", onclick: close }, "Keep exploring this lab");
  let body, label = "";

  if (res.check) {
    body = [
      h("p", { class: "eyebrow" }, "Quick check"), h("h2", {}, topic.name),
      h("p", { class: "result-xp" }, `${res.pct}%`),
      h("p", { class: "muted" }, `${fmtTime(res.seconds)} · ${res.detail.join(" · ")}`),
      h("p", { class: "small" }, res.pct === 100 ? "All correct. New questions come up next time." : "The questions you missed will come first next time."),
      h("div", { class: "actions" }, btn("Another round", `#/check/${topic.id}`, "primary"), btn("Study the theory", `#/study/${topic.id}`), btn("Back to topics", "#/")),
    ];
  } else if (level.practice) {
    const origin = LEVEL_BY_ID.get(level.origin);
    const v = store.variantSolved(origin, res.stars);
    label = `+${v.gained} XP`;
    body = [
      h("p", { class: "eyebrow" }, "Variant solved"), h("h2", {}, level.title),
      h("div", { class: "result-stars" }, stars(res.stars)),
      h("p", { class: "result-xp" }, label, v.gained < origin.xp ? h("span", { class: "muted small" }, ` of ${origin.xp} (full points need no hints and the par time)`) : h("span", { class: "muted small" }, " full points")),
      h("p", { class: "muted" }, `${fmtTime(res.seconds)} · ${res.detail.join(" · ")}`),
      h("p", { class: "small" }, `That is ${v.n} variant${v.n > 1 ? "s" : ""} of "${origin.title}" solved, ${v.xp} XP in total.`),
      h("div", { class: "actions" }, btn("New variant", `#/variant/${origin.id}`, "primary"), btn("Original lab", `#/play/${origin.id}`), btn("Back to home", "#/"), explore),
    ];
  } else {
    const before = store.rank().rank;
    const passed = res.stars > 0;
    const firstTime = passed && !store.isDone(level.id);
    const gained = passed ? store.record(level, res.stars, res.seconds) : 0;
    if (passed) label = `+${gained} XP`;
    const after = store.rank().rank;
    const list = store.levels(), next = list[list.findIndex(l => l.id === level.id) + 1];
    const hasVariants = passed && level.type === "lab" && variantsOf(level.id).length > 0;
    body = [
      h("p", { class: "eyebrow" }, passed ? (level.type === "lab" ? "Ticket closed" : "Passed") : "Not yet"),
      h("h2", {}, level.title),
      passed ? h("div", { class: "result-stars" }, stars(res.stars)) : null,
      passed ? h("p", { class: "result-xp" }, `+${gained} XP`, gained < store.xpFor(level, res.stars) ? h("span", { class: "muted small" }, " (best result kept)") : null) : h("p", {}, res.failText),
      h("p", { class: "muted" }, `${fmtTime(res.seconds)} · ${res.detail.join(" · ")}`),
      passed && after !== before ? h("p", { class: "promo" }, `Promotion: you are now ${/^[AEIOU]/.test(after) ? "an" : "a"} ${after}.`) : null,
      hasVariants && firstTime ? h("p", { class: "small" }, "Random variants of this lab are now open: open the lab again and press New variant whenever you want more practice.") : null,
      revisitLine,
      passed && level.debrief ? h("div", { class: "debrief" }, h("strong", {}, "Debrief"), h("p", { html: rich(level.debrief) })) : null,
      h("div", { class: "actions" },
        passed && next ? btn(`Next: ${next.title}`, `#/play/${next.id}`, "primary") : null,
        !passed ? btn("Try again", `#/play/${level.id}`, "primary") : null,
        hasVariants ? btn("Try a variant", `#/variant/${level.id}`) : null,
        !passed && topic ? btn("Study the theory", `#/study/${topic.id}`) : null,
        btn("Back to home", "#/"),
        passed && level.type === "lab" ? explore : null),
    ];
  }

  const overlay = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", "aria-label": "Result" }, h("div", { class: "modal" }, body));
  document.body.append(overlay);
  overlay.querySelector("button").focus();
  // refresh the top bar: new XP total, and a Solved tag for a finished lab
  if (level.type === "lab" && res.stars > 0) renderTopbar({ tag: "Solved", title: level.title, solved: true });
  else renderTopbar({ tag: level.check ? "Check" : TYPE[level.type], title: level.title });
  return label;
}

// ------------------------------------------------------------ routing
let current = location.hash;
function route() {
  if (view && view.dirty && view.dirty() && !confirm("Leave this activity? Your progress on it will be lost.")) {
    history.replaceState(null, "", current || "#/");
    return;
  }
  current = location.hash;
  if (view) { view.destroy(); view = null; }
  onHome = false;
  document.querySelectorAll(".overlay").forEach(o => o.remove());
  closeHandbook();
  window.scrollTo(0, 0);

  // nothing else is shown until an exam version has been chosen
  if (!store.examChosen() || location.hash === "#/exam") return renderChooser();

  const exam = store.exam();
  const m = /^#\/(play|variant|check|study)\/([\w-]+)$/.exec(location.hash);
  const [kind, id] = m ? [m[1], m[2]] : ["home", null];
  const level = LEVEL_BY_ID.get(id), inThisExam = level && (!level.only || level.only === exam);
  const topic = TOPIC_BY_ID.get(id), topicHere = topic && topic[exam] !== null;
  if (kind === "play" && inThisExam && store.isUnlocked(id)) return play(level);
  if (kind === "study" && topicHere) return study(topic);
  if (kind === "check" && topicHere) return play(checkLevel(topic));
  if (kind === "variant" && inThisExam && store.variantsOpen(id)) {
    const variant = makeVariant(id, lastTemplate);
    if (variant) { lastTemplate = variant.skill; return play(variant); }
  }
  if (kind !== "home") history.replaceState(null, "", "#/");
  renderHome();
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", e => { if (view && view.dirty && view.dirty()) e.preventDefault(); });
route();
