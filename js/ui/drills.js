// Non-lab level types: the subnetting worksheet and the multiple-choice exams.

import { h, rich, fmtTime } from "./dom.js";
import { ipToInt, intToIp, lenMask, netOf, bcastOf } from "../engine/ip.js";
import { QUESTIONS } from "../game/questions.js";

const rnd = n => Math.floor(Math.random() * n);

function header(level, right) {
  return h("header", { class: "drill-head" },
    h("div", {}, h("span", { class: "tag" }, `Tier ${level.tier}`), h("span", { class: "muted small" }, ` From: ${level.from}`), h("h2", {}, level.subject),
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

// ------------------------------------------------------------ exam (multiple choice)
// The exams use the built-in bank (js/game/questions.js). If you installed
// your own bank as data/questions.js (see data/README.md) it is used instead.
let bankPromise = null;
function loadBank() {
  const builtIn = { questions: QUESTIONS };
  const pick = () => (window.CCNA_QUESTIONS && window.CCNA_QUESTIONS.questions.length ? window.CCNA_QUESTIONS : builtIn);
  bankPromise ||= new Promise(resolve => {
    const sc = document.createElement("script");
    sc.src = "data/questions.js";
    sc.onload = () => resolve(pick());
    sc.onerror = () => resolve(builtIn);
    document.head.append(sc);
  });
  return bankPromise;
}

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function mountQuiz(root, level, { onDone }) {
  const { domains, count, pass } = level.params;
  const start = Date.now();
  const progress = h("span", { class: "stat" });
  const card = h("div", { class: "drill-card" }, h("p", { class: "muted" }, "Loading the question bank..."));
  root.replaceChildren(h("div", { class: "drill" }, header(level, progress), card));
  let i = 0, right = 0, qs = [], dead = false;

  loadBank().then(bank => {
    if (dead) return;
    // spread the questions evenly over the requested domains
    const per = Math.ceil(count / domains.length);
    for (const d of domains) qs.push(...shuffle(bank.questions.filter(q => q.ch === d)).slice(0, per));
    if (qs.length < count) qs = shuffle(bank.questions);   // a small custom bank: use whatever it has
    qs = shuffle(qs).slice(0, count);
    show();
  });

  function show() {
    const q = qs[i];
    progress.textContent = `Question ${i + 1} of ${qs.length} · ${right} correct · pass mark ${pass}%`;
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
        if (ok) right++;
        opts[correctPos].classList.add("correct");
        if (!ok) opts[picked].classList.add("wrong");
        opts.forEach(o => { o.disabled = true; });
        explain.hidden = false;
        explain.replaceChildren(h("strong", { class: ok ? "ok-text" : "bad-text" }, ok ? "Correct. " : `Not quite. The answer is ${"ABCDEF"[correctPos]}. `), h("span", { html: q.e }));
        btn.textContent = i + 1 >= qs.length ? "Finish" : "Next question";
        progress.textContent = `Question ${i + 1} of ${qs.length} · ${right} correct · pass mark ${pass}%`;
      } else { i++; if (i >= qs.length) finish(); else show(); }
    });
    card.replaceChildren(h("div", { class: "question" }, h("div", { class: "qhtml", html: q.q }), h("div", { class: "options" }, opts), explain, h("div", { class: "actions" }, btn)));
    card.scrollIntoView({ block: "nearest" });
  }

  function finish() {
    const pct = Math.round((right / qs.length) * 100);
    const starCount = pct < pass ? 0 : pct >= 95 ? 3 : pct >= 85 ? 2 : 1;
    onDone({ stars: starCount, seconds: Math.round((Date.now() - start) / 1000), detail: [`${right} of ${qs.length} correct (${pct}%)`, `pass mark ${pass}%`], failText: `You scored ${pct}% and need ${pass}%. The questions are drawn at random, so the next attempt will be different.` });
  }

  return { dirty: () => i > 0 && i < qs.length, destroy() { dead = true; } };
}
