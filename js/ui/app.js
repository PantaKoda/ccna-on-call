// App shell: home (career path or topics), study pages, routing, results.

import { h, rich, fmtTime, stars } from "./dom.js";
import { store, untilText, MAX_BOX } from "./store.js";
import { LEVELS, LEVEL_BY_ID, TIERS } from "../game/levels/index.js";
import { TRACKS, TOPIC_BY_ID, TOPIC_ORDER, LEVEL_TOPIC } from "../game/topics.js";
import { SKILLS, SKILL_BY_ID, makePractice } from "../game/practice.js";
import { mountLab } from "./labview.js";
import { mountSubnet, mountQuiz, loadBank, countByTopic, SOURCES } from "./drills.js";
import { toggleHandbook, closeHandbook, loadTheory, renderMarkdown } from "./handbook.js";
import { VERSION } from "../version.js";

const app = document.getElementById("app");
const TYPE = { lab: "Lab", subnet: "Drill", quiz: "Exam" };
let view = null;      // the mounted activity, if any
let bank = null;      // question bank, once loaded (for counts on the Topics screen)
let onHome = false;

const topbar = h("header", { class: "topbar" });
const main = h("main", { id: "main" });
app.append(topbar, main);

loadBank().then(b => { bank = b; if (onHome) renderHome(); });

// `where` is null on the home screen, or { tag, title } inside an activity
function renderTopbar(where) {
  const t = store.totals(), r = store.rank();
  topbar.replaceChildren(...[
    h("a", { class: "brand", href: "#/", "aria-label": "CCNA: On Call, back to the home screen" },
      h("span", { class: "brand-mark", "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", {}, "CCNA: ", h("b", {}, "On Call"))),
    where ? h("a", { class: "btn ghost small", href: "#/" }, "← Home") : null,
    where ? h("span", { class: "top-title" }, h("span", { class: "tag" }, where.tag), where.title) : h("span", { class: "top-title muted" }, "Kestrel Freight · Network Operations"),
    h("span", { class: "spacer" }),
    h("span", { class: "top-rank", title: "Your rank" }, r.rank),
    h("span", { class: "top-xp" }, `${t.xp} XP`),
    h("button", { class: "btn small", onclick: toggleHandbook, title: "Command reference and theory pages" }, "Handbook"),
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

const pips = n => h("span", { class: "pips", title: `Mastery ${Math.round(n)} of ${MAX_BOX}`, "aria-label": `Mastery ${Math.round(n)} of ${MAX_BOX}` },
  Array.from({ length: MAX_BOX }, (_, i) => h("i", { class: i < Math.round(n) ? "on" : "" })));

// ------------------------------------------------------------ home
function renderHome() {
  onHome = true;
  renderTopbar(null);
  const mode = store.pref("view", "career");
  main.className = "home";
  main.replaceChildren(...[hero(), reviewBanner(), switcher(mode), ...(mode === "topics" ? topicsView() : careerView()),
    h("footer", { class: "home-foot muted small" },
      h("span", {}, `Version ${VERSION}`),
      h("span", {}, "Progress is saved in this browser."),
      h("button", { class: "linklike", onclick: () => { if (confirm("Erase all progress, review schedule and exam history, and start again as an intern?")) { store.reset(); renderHome(); } } }, "Reset progress"))].filter(Boolean));
}

function hero() {
  const t = store.totals(), r = store.rank(), next = store.nextLevel();
  const pct = Math.round((t.xp / t.maxXp) * 100);
  return h("section", { class: "hero" },
    h("div", { class: "hero-main" },
      h("p", { class: "eyebrow" }, "Your rank"),
      h("h1", {}, r.rank),
      h("p", { class: "muted" }, next
        ? "You're the on-call engineer. Study a topic, work its tickets on a simulated network, then keep it fresh with practice that comes back over time."
        : "Every ticket closed. Keep the skills fresh with the review queue."),
      h("div", { class: "xpbar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Experience" }, h("i", { style: `width:${pct}%` })),
      h("p", { class: "muted small" }, `${t.xp} / ${t.maxXp} XP · ${t.done} of ${t.count} tickets closed · ${t.stars} of ${t.maxStars} stars`)),
    next && h("a", { class: "btn primary big", href: `#/play/${next.id}` }, t.done ? "Next ticket" : "Start your first ticket", h("span", { class: "btn-sub" }, next.title)));
}

function reviewBanner() {
  const due = store.due(), up = store.upcoming();
  const name = id => SKILL_BY_ID.get(id).name;
  if (due.length) {
    return h("section", { class: "review due" },
      h("div", {}, h("p", { class: "eyebrow" }, "Review due"),
        h("p", {}, h("strong", {}, `${due.length} skill${due.length > 1 ? "s are" : " is"} ready to come back: `), due.slice(0, 3).map(name).join(", ") + (due.length > 3 ? ` and ${due.length - 3} more` : "") + "."),
        h("p", { class: "muted small" }, "Each review is a new variant of the lab, with different addresses, names or faults.")),
      h("a", { class: "btn primary", href: "#/review" }, "Start review"));
  }
  return h("section", { class: "review" }, h("p", { class: "muted small" },
    h("strong", {}, "Review queue: "),
    up ? `nothing due right now. Next up: ${name(up.id)}, ${untilText(up.due)}.`
      : "empty for now. When you close a ticket, its skill comes back as a fresh variant after 15 minutes, then after 1, 3, 7, 16 and 35 days."));
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
  const r = store.rank(), next = store.nextLevel();
  return TIERS.map(tier => {
    const levels = LEVELS.filter(l => l.tier === tier.id);
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
  const inner = [
    h("div", { class: "card-top" }, h("span", { class: "tag " + l.type }, TYPE[l.type]), h("span", { class: "spacer" }),
      res ? stars(res.stars) : open ? h("span", { class: "muted small" }, `${l.xp} XP`) : h("span", { class: "lock", "aria-hidden": "true" }, "🔒")),
    h("h3", {}, l.title),
    h("p", { class: "muted small" }, l.subject),
    res ? h("p", { class: "card-foot small" }, `${res.xp} / ${l.xp} XP · best ${fmtTime(res.best)}`)
      : next && next.id === l.id ? h("p", { class: "card-foot small next" }, "Next up")
      : topic && showTopic ? h("p", { class: "card-foot small" }, topic.name) : null,
  ];
  return open
    ? h("a", { class: "card" + (res ? " done" : "") + (next && next.id === l.id ? " next" : ""), href: `#/play/${l.id}` }, inner)
    : h("div", { class: "card locked", "aria-disabled": "true", title: "Close the previous ticket in the career path to unlock this one" }, inner);
}

// ---- topics: theory first, then questions, tickets and practice for each topic
function topicsView() {
  const counts = bank ? countByTopic(bank) : null;
  const want = bank && bank.hasBook ? store.pref("sources", "all") : "all";
  const next = store.nextLevel();
  return TRACKS.map(track => h("section", { class: "track" },
    h("h2", { class: "track-name" }, track.name),
    TOPIC_ORDER.map(id => TOPIC_BY_ID.get(id)).filter(t => t.track === track.id).map(t => {
      const levels = LEVELS.filter(l => LEVEL_TOPIC[l.id] === t.id), skills = SKILLS.filter(s => s.topic === t.id);
      const m = store.mastery(t.id);
      const c = counts ? counts[t.id] || { custom: 0, book: 0 } : null;
      const nq = c ? (want === "book" ? c.book : want === "custom" ? c.custom : c.custom + c.book) : 0;
      const split = c && bank.hasBook && want === "all" ? `${c.custom} custom · ${c.book} book` : c && bank.hasBook ? SOURCES[want].label + " questions" : "";
      return h("section", { class: "topic", id: `topic-${t.id}` },
        h("header", { class: "topic-head" }, h("div", {}, h("h3", {}, t.name), h("p", { class: "muted small" }, t.blurb)), h("span", { class: "spacer" }), skills.length && m !== null ? pips(m) : null),
        h("div", { class: "cards" },
          h("a", { class: "card theory" + (store.isStudied(t.id) ? " done" : ""), href: `#/study/${t.id}` },
            h("div", { class: "card-top" }, h("span", { class: "tag theory" }, "Theory")), h("h3", {}, "Study the theory"),
            h("p", { class: "muted small" }, "Key ideas, commands and common mistakes."),
            h("p", { class: "card-foot small" + (store.isStudied(t.id) ? "" : " next") }, store.isStudied(t.id) ? "✓ Studied" : "Start here")),
          nq > 0 ? h("a", { class: "card", href: `#/check/${t.id}` },
            h("div", { class: "card-top" }, h("span", { class: "tag quiz" }, "Check")), h("h3", {}, "Quick check"),
            h("p", { class: "muted small" }, `${Math.min(6, nq)} questions, the ones you missed first.`),
            h("p", { class: "card-foot small" }, `${nq} question${nq > 1 ? "s" : ""}${split ? " · " + split : ""}`)) : null,
          levels.map(l => levelCard(l, next, false)),
          skills.map(practiceCard)));
    })));
}

function practiceCard(s) {
  const st = store.skill(s.id), due = st && st.due <= Date.now(), open = store.skillOpen(s);
  const inner = [
    h("div", { class: "card-top" }, h("span", { class: "tag practice" }, "Practice"), h("span", { class: "spacer" }), open ? (st ? pips(st.box) : null) : h("span", { class: "lock", "aria-hidden": "true" }, "🔒")),
    h("h3", {}, s.name),
    h("p", { class: "muted small" }, s.kind === "subnet" ? "New addresses every time." : "A new variant every time: different numbers, names or faults."),
    h("p", { class: "card-foot small" + (due ? " next" : "") }, !open ? `Opens with the ticket "${LEVEL_BY_ID.get(s.after).title}"` : !st ? "Not practised yet" : due ? "Review due" : `Next review ${untilText(st.due)}`),
  ];
  return open ? h("a", { class: "card" + (due ? " next" : ""), href: `#/practice/${s.id}` }, inner)
    : h("div", { class: "card locked", "aria-disabled": "true", title: "Reach that ticket in the career path to open this practice" }, inner);
}

// ------------------------------------------------------------ study page
function study(t) {
  renderTopbar({ tag: "Theory", title: t.name });
  main.className = "study";
  const article = h("article", { class: "prose" }, h("p", { class: "muted" }, "Loading..."));
  const side = h("aside", { class: "study-side" });
  const idx = TOPIC_ORDER.indexOf(t.id), prev = TOPIC_BY_ID.get(TOPIC_ORDER[idx - 1]), nextT = TOPIC_BY_ID.get(TOPIC_ORDER[idx + 1]);
  main.replaceChildren(h("div", { class: "study-wrap" },
    h("div", { class: "study-main" }, h("p", { class: "eyebrow" }, TRACKS.find(k => k.id === t.track).name), h("h1", {}, t.name), h("p", { class: "muted lead" }, t.blurb), article,
      h("nav", { class: "study-nav" }, prev ? h("a", { class: "btn", href: `#/study/${prev.id}` }, `← ${prev.name}`) : h("span"), nextT ? h("a", { class: "btn", href: `#/study/${nextT.id}` }, `${nextT.name} →`) : h("span"))),
    side));
  loadTheory().then(pages => { if (main.contains(article)) article.replaceChildren(renderMarkdown(pages[t.id] || "This page is not written yet.")); });

  const levels = LEVELS.filter(l => LEVEL_TOPIC[l.id] === t.id), skills = SKILLS.filter(s => s.topic === t.id);
  const renderSide = () => {
    const studied = store.isStudied(t.id);
    side.replaceChildren(...[
      h("h2", {}, "After reading"),
      h("button", { class: "btn block" + (studied ? "" : " primary"), onclick: () => { store.setStudied(t.id, !studied); renderSide(); } }, studied ? "✓ Studied (undo)" : "Mark as studied"),
      h("a", { class: "btn block", href: `#/check/${t.id}` }, "Quick check (questions)"),
      levels.length ? h("h3", {}, "Tickets") : null,
      levels.map(l => store.isUnlocked(l.id)
        ? h("a", { class: "side-link", href: `#/play/${l.id}` }, h("span", {}, l.title), store.result(l.id) ? stars(store.result(l.id).stars) : h("span", { class: "muted small" }, "open"))
        : h("div", { class: "side-link locked" }, h("span", {}, l.title), h("span", { "aria-hidden": "true" }, "🔒"))),
      skills.length ? h("h3", {}, "Practice (new variant each time)") : null,
      skills.map(s => store.skillOpen(s) ? h("a", { class: "side-link", href: `#/practice/${s.id}` }, h("span", {}, s.name), store.skill(s.id) ? pips(store.skill(s.id).box) : h("span", { class: "muted small" }, "new"))
        : h("div", { class: "side-link locked" }, h("span", {}, s.name), h("span", { "aria-hidden": "true" }, "🔒"))),
      levels.some(l => !store.isUnlocked(l.id)) ? h("p", { class: "muted small" }, "Locked items open as you reach them in the career path.") : null,
      h("a", { class: "btn ghost block", href: "#/" }, "Back to all topics"),
    ].flat().filter(Boolean));
  };
  renderSide();
  view = { dirty: () => false, destroy() {} };
  store.setPref("view", "topics");
}

// ------------------------------------------------------------ activities
function play(level) {
  const tag = level.check ? "Check" : level.practice ? "Practice" : TYPE[level.type];
  renderTopbar({ tag, title: level.title });
  main.className = "play " + level.type;
  const mount = { lab: mountLab, subnet: mountSubnet, quiz: mountQuiz }[level.type];
  view = mount(main, level, { onDone: res => showResult(level, res) });
}

const checkLevel = t => ({
  id: `check:${t.id}`, type: "quiz", check: true, topic: t.id, title: `Quick check: ${t.name}`, from: "Practice", subject: `Quick check: ${t.name}`,
  brief: ["Up to six questions on this topic. Questions you missed before come first, then ones you have not seen."], params: { topic: t.id, count: 6 },
});

function showResult(level, res) {
  const close = () => { overlay.remove(); };
  const go = hash => { close(); view = null; if (location.hash === hash) route(); else location.hash = hash; };
  const btn = (label, hash, cls = "") => h("button", { class: "btn " + cls, onclick: () => go(hash) }, label);
  const topic = TOPIC_BY_ID.get(level.topic || LEVEL_TOPIC[level.id]);
  const revisit = (res.review || []).map(id => TOPIC_BY_ID.get(id)).filter(Boolean);
  const revisitLine = revisit.length ? h("p", { class: "small" }, "Worth revisiting: ", revisit.map((t, i) => [i ? ", " : "", h("a", { href: `#/study/${t.id}`, onclick: close }, t.name)])) : null;
  let body;

  if (res.check) {
    body = [
      h("p", { class: "eyebrow" }, "Quick check"), h("h2", {}, topic.name),
      h("p", { class: "result-xp" }, `${res.pct}%`),
      h("p", { class: "muted" }, `${fmtTime(res.seconds)} · ${res.detail.join(" · ")}`),
      h("p", { class: "small" }, res.pct === 100 ? "All correct. New questions come up next time." : "The questions you missed will come first next time."),
      h("div", { class: "actions" }, btn("Another round", `#/check/${topic.id}`, "primary"), btn("Study the theory", `#/study/${topic.id}`), btn("Back to topics", "#/")),
    ];
  } else if (level.practice) {
    const passed = res.stars > 0;
    const good = res.stars >= 2 && !res.solutionShown;
    const r = store.practiced(level.skill, good);
    const moreDue = store.due().filter(id => id !== level.skill);
    const outcome = !passed ? res.failText
      : !good ? "Solved, but with enough help that it does not count as remembered yet. It comes back in 15 minutes."
      : !r.wasDue ? `Extra practice: the review schedule is unchanged. Next review ${untilText(r.due)}.`
      : r.box >= MAX_BOX ? `Mastery ${r.box} of ${MAX_BOX}: this one has stuck. Next review ${untilText(r.due)}.`
      : `Remembered. Mastery ${r.box} of ${MAX_BOX}; it comes back ${untilText(r.due)}.`;
    body = [
      h("p", { class: "eyebrow" }, passed ? "Practice complete" : "Not yet"), h("h2", {}, level.title),
      passed ? h("div", { class: "result-stars" }, stars(res.stars)) : null,
      h("div", { class: "mastery-line" }, pips(r.box), h("span", {}, outcome)),
      h("p", { class: "muted" }, `${fmtTime(res.seconds)} · ${res.detail.join(" · ")}`),
      h("div", { class: "actions" },
        moreDue.length ? btn(`Next review (${moreDue.length} due)`, "#/review", "primary") : null,
        btn("Another variant", `#/practice/${level.skill}`, moreDue.length ? "" : "primary"),
        btn("Study the theory", `#/study/${level.topic}`), btn("Back to topics", "#/"),
        passed && level.type === "lab" ? h("button", { class: "btn ghost", onclick: close }, "Keep exploring this lab") : null),
    ];
    store.setPref("view", "topics");
  } else {
    const before = store.rank().rank;
    const passed = res.stars > 0;
    const gained = passed ? store.record(level, res.stars, res.seconds) : 0;
    const after = store.rank().rank;
    const added = passed ? store.introduce(level.id) : [];
    const next = LEVELS[LEVELS.indexOf(level) + 1];
    body = [
      h("p", { class: "eyebrow" }, passed ? (level.type === "lab" ? "Ticket closed" : "Passed") : "Not yet"),
      h("h2", {}, level.title),
      passed ? h("div", { class: "result-stars" }, stars(res.stars)) : null,
      passed ? h("p", { class: "result-xp" }, `+${gained} XP`, gained < store.xpFor(level, res.stars) ? h("span", { class: "muted small" }, " (best result kept)") : null) : h("p", {}, res.failText),
      h("p", { class: "muted" }, `${fmtTime(res.seconds)} · ${res.detail.join(" · ")}`),
      passed && after !== before ? h("p", { class: "promo" }, `Promotion: you are now ${/^[AEIOU]/.test(after) ? "an" : "a"} ${after}.`) : null,
      added.length ? h("p", { class: "queued small" }, h("strong", {}, "Added to your review queue: "), added.map(s => s.name).join(", ") + ". A fresh variant comes back in 15 minutes.") : null,
      revisitLine,
      passed && level.debrief ? h("div", { class: "debrief" }, h("strong", {}, "Debrief"), h("p", { html: rich(level.debrief) })) : null,
      h("div", { class: "actions" },
        passed && next ? btn(`Next: ${next.title}`, `#/play/${next.id}`, "primary") : null,
        !passed ? btn("Try again", `#/play/${level.id}`, "primary") : null,
        !passed && topic ? btn("Study the theory", `#/study/${topic.id}`) : null,
        btn("Back to home", "#/"),
        passed && level.type === "lab" ? h("button", { class: "btn ghost", onclick: close }, "Keep exploring this lab") : null),
    ];
  }

  const overlay = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", "aria-label": "Result" }, h("div", { class: "modal" }, body));
  document.body.append(overlay);
  overlay.querySelector("button").focus();
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

  const m = /^#\/(play|practice|check|study)\/([\w:-]+)$/.exec(location.hash);
  const [kind, id] = m ? [m[1], m[2]] : [location.hash === "#/review" ? "review" : "home", null];
  if (kind === "play" && LEVEL_BY_ID.has(id) && store.isUnlocked(id)) return play(LEVEL_BY_ID.get(id));
  if (kind === "study" && TOPIC_BY_ID.has(id)) return study(TOPIC_BY_ID.get(id));
  if (kind === "check" && TOPIC_BY_ID.has(id)) return play(checkLevel(TOPIC_BY_ID.get(id)));
  const skillId = kind === "review" ? store.due()[0] : kind === "practice" ? id : null;
  if (skillId && SKILL_BY_ID.has(skillId) && store.skillOpen(SKILL_BY_ID.get(skillId))) return play(makePractice(skillId));
  if (kind !== "home") history.replaceState(null, "", "#/");
  renderHome();
}
window.addEventListener("hashchange", route);
window.addEventListener("beforeunload", e => { if (view && view.dirty && view.dirty()) e.preventDefault(); });
route();
