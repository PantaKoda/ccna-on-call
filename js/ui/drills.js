// Non-lab activities: the subnetting worksheet and multiple-choice questions
// (promotion exams and per-topic quick checks).

import { h, rich, fmtTime } from "./dom.js";
import { ipToInt, intToIp, lenMask, netOf, bcastOf } from "../engine/ip.js";
import { QUESTIONS } from "../game/questions.js";
import { topicOfQuestion, TOPIC_BY_ID, inExam, questionOnly, v1DomainOf } from "../game/topics.js";
import { store } from "./store.js";

const rnd = n => Math.floor(Math.random() * n);

function header(level, right) {
  return h("header", { class: "drill-head" },
    h("div", {}, h("span", { class: "tag" }, level.tier ? `Tier ${level.tier}` : "Practice"), h("span", { class: "muted small" }, ` From: ${level.from}`), h("h2", {}, level.subject),
      level.brief.map(p => h("p", { class: "muted", html: rich(p) }))),
    right);
}

// ------------------------------------------------------------ subnetting
function makeSubnetQuestion({ minLen, maxLen }) {
  const len = minLen + rnd(maxLen - minLen + 1);
  const mask = lenMask(len);
  let base;
  if (len >= 24) base = (192 << 24 | 168 << 16 | rnd(256) << 8) >>> 0;
  else if (rnd(2)) base = (172 << 24 | (16 + rnd(16)) << 16) >>> 0;
  else base = (10 << 24 | rnd(256) << 16) >>> 0;
  const size = 2 ** (32 - len);
  const span = len >= 24 ? 256 : 65536;
  const net = (base + rnd(span / size) * size) >>> 0;
  const ip = (net + 1 + rnd(size - 2)) >>> 0;
  return {
    ip, len,
    fields: [
      { key: "mask", label: "Subnet mask", answer: intToIp(mask) },
      { key: "net", label: "Network address", answer: intToIp(netOf(ip, mask)) },
      { key: "first", label: "First usable host", answer: intToIp(netOf(ip, mask) + 1) },
      { key: "last", label: "Last usable host", answer: intToIp(bcastOf(ip, mask) - 1) },
      { key: "bcast", label: "Broadcast address", answer: intToIp(bcastOf(ip, mask)) },
      { key: "hosts", label: "Usable hosts", answer: String(size - 2), numeric: true },
    ],
  };
}

export function mountSubnet(root, level, { onDone }) {
  const total = level.params.count;
  const start = Date.now();
  let n = 0, right = 0, asked = 0, q = null, checked = false;
  const progress = h("span", { class: "stat" });
  const card = h("div", { class: "drill-card" });
  root.replaceChildren(h("div", { class: "drill" }, header(level, progress), card));
  const timer = setInterval(() => { progress.textContent = `Subnet ${Math.min(n + 1, total)} of ${total} · ${fmtTime((Date.now() - start) / 1000)}`; }, 1000);

  function next() {
    if (n >= total) return done();
    q = makeSubnetQuestion(level.params);
    checked = false;
    const inputs = q.fields.map(f => h("input", { type: "text", inputmode: f.numeric ? "numeric" : "decimal", spellcheck: "false", autocomplete: "off", "aria-label": f.label }));
    const rows = q.fields.map((f, i) => h("div", { class: "field" }, h("label", {}, f.label), inputs[i], h("span", { class: "verdict", role: "status" })));
    const btn = h("button", { class: "btn primary", type: "submit" }, "Check");
    const form = h("form", { class: "worksheet" },
      h("div", { class: "host-line" }, h("span", { class: "muted" }, "A host has the address"), h("code", { class: "big" }, `${intToIp(q.ip)} /${q.len}`)),
      rows, h("div", { class: "actions" }, btn));
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (checked) { n++; next(); return; }
      checked = true;
      q.fields.forEach((f, i) => {
        const raw = inputs[i].value.trim();
        const ok = f.numeric ? raw.replace(/[,\s]/g, "") === f.answer : ipToInt(raw) !== null && ipToInt(raw) === ipToInt(f.answer);
        asked++;
        if (ok) right++;
        rows[i].classList.add(ok ? "ok" : "bad");
        rows[i].querySelector(".verdict").textContent = ok ? "✓ correct" : `✗ ${f.answer}`;
        inputs[i].readOnly = true;
      });
      btn.textContent = n + 1 >= total ? "Finish" : "Next subnet";
      btn.focus();
    });
    card.replaceChildren(form);
    inputs[0].focus();
    progress.textContent = `Subnet ${n + 1} of ${total}`;
  }

  function done() {
    clearInterval(timer);
    const pct = Math.round((right / asked) * 100);
    const seconds = Math.round((Date.now() - start) / 1000);
    const starCount = pct >= 95 ? 3 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0;
    onDone({ stars: starCount, seconds, detail: [`${right} of ${asked} fields correct (${pct}%)`, "60% needed to pass"], failText: "You need at least 60% of the fields right. Have another go; the subnets change every time." });
  }

  next();
  return { dirty: () => asked > 0 && n < total, destroy() { clearInterval(timer); } };
}

// ------------------------------------------------------------ question bank
// Two sources, always kept apart:
//   "custom" - written for this game (js/game/questions.js)
//   "book"   - your own imported bank, if data/questions.js is installed
export const SOURCES = { custom: { label: "Custom", title: "Written for On Call" }, book: { label: "Book", title: "From your imported question bank" } };

let bankPromise = null;
export function loadBank() {
  bankPromise ||= new Promise(resolve => {
    const build = imported => {
      const tag = (list, src) => list.map(q => ({ ...q, src, topic: topicOfQuestion(q) }));
      // an imported bank may print the same question in two chapters: keep the first copy
      const seen = new Set();
      const unique = list => list.filter(q => { const k = String(q.q).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase(); return seen.has(k) ? false : (seen.add(k), true); });
      const book = imported && Array.isArray(imported.questions) ? tag(unique(imported.questions), "book") : [];
      resolve({ all: [...tag(QUESTIONS, "custom"), ...book], hasBook: book.length > 0 });
    };
    const sc = document.createElement("script");
    sc.src = "data/questions.js";
    sc.onload = () => build(window.CCNA_QUESTIONS);
    sc.onerror = () => build(null);
    document.head.append(sc);
  });
  return bankPromise;
}

// The questions in play: those that belong to the exam version being studied,
// from the sources the player chose ("all", "book" or "custom"; the choice only
// matters when a book bank is installed).
export function activeQuestions(bank) {
  const exam = store.exam();
  const want = bank.hasBook ? store.pref("sources", "all") : "all";
  return bank.all.filter(q => inExam(q, q.topic, exam) && (want === "all" || q.src === want));
}

// { topicId: { custom: n, book: n } } for the Topics screen, for the chosen exam
export function countByTopic(bank) {
  const out = {}, exam = store.exam();
  for (const q of bank.all) { if (!inExam(q, q.topic, exam)) continue; const c = (out[q.topic] ||= { custom: 0, book: 0 }); c[q.src]++; }
  return out;
}

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Questions you got wrong last time come first, then ones you have never seen,
// then the rest: missed questions resurface until you get them right.
function byNeed(list) {
  const missed = [], unseen = [], known = [];
  for (const q of shuffle(list)) (store.qstat(q.id) === 0 ? missed : store.qstat(q.id) === undefined ? unseen : known).push(q);
  return [...missed, ...unseen, ...known];
}

// With both sources in play, draw about half from each, so a large imported
// bank does not crowd the custom questions out. `order` sorts each source.
function balanced(list, count, order) {
  const book = order(list.filter(q => q.src === "book")), custom = order(list.filter(q => q.src === "custom"));
  if (!book.length || !custom.length) return order(list).slice(0, count);
  const half = Math.ceil(count / 2);
  const picked = [...book.slice(0, half), ...custom.slice(0, count - Math.min(half, book.length))];
  const rest = [...book.slice(half), ...custom.slice(count - Math.min(half, book.length))];
  return [...picked, ...rest].slice(0, count);
}

export function mountQuiz(root, level, { onDone }) {
  const { domains, v2domains, topic, count, pass } = level.params;
  const exam = store.exam();
  // a promotion exam draws by the domains of the exam version being studied
  const want = exam === "v2" ? v2domains : domains;
  // v1.1 uses the domain a question was filed under; questions from a mixed practice exam count by their topic
  const domainOf = q => (exam === "v2" ? TOPIC_BY_ID.get(q.topic).v2 : v1DomainOf(q, q.topic));
  const start = Date.now();
  const progress = h("span", { class: "stat" });
  const card = h("div", { class: "drill-card" }, h("p", { class: "muted" }, "Loading the question bank..."));
  root.replaceChildren(h("div", { class: "drill" }, header(level, progress), card));
  let i = 0, right = 0, qs = [], dead = false, showSource = false;
  const missedTopics = new Set();
  const status = () => `Question ${i + 1} of ${qs.length} · ${right} correct${pass ? ` · pass mark ${pass}%` : ""}`;

  loadBank().then(bank => {
    if (dead) return;
    const pool = activeQuestions(bank);
    showSource = bank.hasBook;
    if (topic) {
      qs = balanced(pool.filter(q => q.topic === topic), count, byNeed);
    } else {
      // spread the questions evenly over the requested domains
      const per = Math.ceil(count / want.length);
      for (const d of want) qs.push(...balanced(pool.filter(q => domainOf(q) === d), per, shuffle));
      qs = shuffle(qs).slice(0, count);
      if (qs.length < Math.min(count, 4)) qs = shuffle(pool).slice(0, count);   // a very small bank: use whatever it has
    }
    if (!qs.length) { card.replaceChildren(h("p", {}, "There are no questions for this selection."), h("p", { class: "muted" }, "Try a different source setting on the Topics screen.")); return; }
    qs = shuffle(qs);
    show();
  });

  function show() {
    const q = qs[i];
    progress.textContent = status();
    const order = shuffle(q.o.map((_, k) => k));
    let picked = null, checked = false;
    const opts = order.map((k, pos) => h("button", { class: "option", type: "button", "aria-pressed": "false" },
      h("span", { class: "letter" }, "ABCDEF"[pos]), h("span", { class: "opt-text", html: q.o[k] })));
    const explain = h("div", { class: "explain", hidden: true });
    const btn = h("button", { class: "btn primary", disabled: true }, "Check answer");
    opts.forEach((b, pos) => b.addEventListener("click", () => {
      if (checked) return;
      picked = pos;
      opts.forEach((o, p) => { o.classList.toggle("picked", p === pos); o.setAttribute("aria-pressed", p === pos); });
      btn.disabled = false;
    }));
    btn.addEventListener("click", () => {
      if (!checked) {
        checked = true;
        const correctPos = order.indexOf(q.a);
        const ok = picked === correctPos;
        if (ok) right++; else missedTopics.add(q.topic);
        store.questionResult(q.id, ok);
        opts[correctPos].classList.add("correct");
        if (!ok) opts[picked].classList.add("wrong");
        opts.forEach(o => { o.disabled = true; });
        explain.hidden = false;
        explain.replaceChildren(h("strong", { class: ok ? "ok-text" : "bad-text" }, ok ? "Correct. " : `Not quite. The answer is ${"ABCDEF"[correctPos]}. `), h("span", { html: q.e }));
        btn.textContent = i + 1 >= qs.length ? "Finish" : "Next question";
        progress.textContent = status();
      } else { i++; if (i >= qs.length) finish(); else show(); }
    });
    const t = TOPIC_BY_ID.get(q.topic);
    card.replaceChildren(h("div", { class: "question" },
      h("div", { class: "q-meta" },
        showSource ? h("span", { class: "src-badge " + q.src, title: SOURCES[q.src].title }, SOURCES[q.src].label) : null,
        t ? h("span", { class: "muted small" }, t.name) : null,
        questionOnly(q, q.topic) === "v1" ? h("span", { class: "vbadge v1x", title: "In the v1.1 blueprint, not in v2.0" }, "v1 exclusive") : null,
        questionOnly(q, q.topic) === "v2" ? h("span", { class: "vbadge v2n", title: "New in the v2.0 blueprint" }, "New in v2") : null),
      h("div", { class: "qhtml", html: q.q }), h("div", { class: "options" }, opts), explain, h("div", { class: "actions" }, btn)));
    card.scrollIntoView({ block: "nearest" });
  }

  function finish() {
    const pct = Math.round((right / qs.length) * 100);
    const seconds = Math.round((Date.now() - start) / 1000);
    const review = [...missedTopics];
    if (!pass) {
      onDone({ check: true, stars: 0, seconds, pct, review, detail: [`${right} of ${qs.length} correct (${pct}%)`] });
      return;
    }
    const starCount = pct < pass ? 0 : pct >= 95 ? 3 : pct >= 85 ? 2 : 1;
    onDone({ stars: starCount, seconds, review, detail: [`${right} of ${qs.length} correct (${pct}%)`, `pass mark ${pass}%`], failText: `You scored ${pct}% and need ${pass}%. The questions are drawn at random, so the next attempt will be different.` });
  }

  return { dirty: () => i > 0 && i < qs.length, destroy() { dead = true; } };
}
