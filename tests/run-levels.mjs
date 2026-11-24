// Plays every lab level's scripted solution against the simulator and checks
// that the objectives start incomplete and end complete.  Run: npm test

import { LEVELS } from "../js/game/levels/index.js";
import { Lab } from "../js/game/lab.js";

let failed = 0;
const only = process.argv[2];

for (const level of LEVELS) {
  if (level.type !== "lab" || (only && level.id !== only)) continue;
  let lab;
  try {
    lab = new Lab(level);
  } catch (e) {
    failed++;
    console.log(`FAIL ${level.id}: ${e.message}`);
    continue;
  }
  const before = lab.progress();
  const problems = [];
  if (before.every(o => o.done)) problems.push("all objectives are already complete before the player does anything");
  const transcript = [];
  for (const step of level.solution) {
    if (step.pc || step.answer) { lab.runStep(step); continue; }
    for (const c of step.cmds) {
      const s = lab.session(step.on);
      const prompt = s.prompt;
      const out = lab.exec(step.on, c);
      transcript.push(`${prompt}${c}${out ? "\n" + out : ""}`);
      if (/% (Invalid|Incomplete|Ambiguous|Unknown)/.test(out)) problems.push(`solution command rejected on ${step.on}: "${c}" -> ${out.trim().split("\n").pop()}`);
    }
  }
  const after = lab.progress();
  for (const o of after) if (!o.done) problems.push(`objective not met: ${o.text}`);
  if (problems.length) {
    failed++;
    console.log(`FAIL ${level.id}`);
    for (const p of problems) console.log("   - " + p);
    if (process.argv.includes("-v")) console.log(transcript.join("\n"));
  } else {
    console.log(`ok   ${level.id}  (${before.filter(o => o.done).length}/${before.length} done at start, ${lab.commands} commands)`);
  }
  if (only && process.argv.includes("-v") && !problems.length) console.log(transcript.join("\n"));
}

// Lab variants: every template, over many random seeds, must build, start
// with something left to do, and be completed by its own solution.
if (!only || only === "practice") {
  const { SKILLS, makePractice } = await import("../js/game/practice.js");
  const SEEDS = Number(process.env.PRACTICE_SEEDS || 40);
  for (const skill of SKILLS) {
    const problems = [];
    const subjects = new Set();
    for (let seed = 1; seed <= SEEDS && problems.length < 4; seed++) {
      let lab, level;
      try { level = makePractice(skill.id, seed * 7919); lab = new Lab(level); }
      catch (e) { problems.push(`seed ${seed}: ${e.message.split("\n").slice(0, 3).join(" | ")}`); continue; }
      subjects.add(JSON.stringify(level.details));
      if (lab.progress().every(o => o.done)) problems.push(`seed ${seed}: nothing to do at the start`);
      for (const step of level.solution) {
        if (step.pc || step.answer) { lab.runStep(step); continue; }
        for (const c of step.cmds) {
          const out = lab.exec(step.on, c);
          if (/% (Invalid|Incomplete|Ambiguous|Unknown)/.test(out)) problems.push(`seed ${seed}: "${c}" rejected on ${step.on}`);
        }
      }
      for (const o of lab.progress()) if (!o.done) problems.push(`seed ${seed}: objective not met: ${o.text}`);
    }
    if (problems.length) {
      failed++;
      console.log(`FAIL variant ${skill.id}`);
      for (const p of problems) console.log("   - " + p);
    } else console.log(`ok   variant ${skill.id}  (of ${skill.after}; ${SEEDS} seeds, ${subjects.size} distinct)`);
  }
}

// Topics: every topic has a theory page, every ticket and skill belongs to one,
// and every topic has something to check yourself with.
if (!only) {
  const fs = await import("node:fs");
  const { TOPICS, TOPIC_ORDER, TOPIC_BY_ID, LEVEL_TOPIC, splitTheory, topicOfQuestion } = await import("../js/game/topics.js");
  const { SKILLS } = await import("../js/game/practice.js");
  const { QUESTIONS } = await import("../js/game/questions.js");
  const pages = splitTheory(fs.readFileSync(new URL("../content/theory.md", import.meta.url), "utf8"));
  const problems = [];
  for (const t of TOPICS) {
    if (!pages[t.id] || pages[t.id].length < 400) problems.push(`topic ${t.id}: theory page missing or too short`);
    if (!TOPIC_ORDER.includes(t.id)) problems.push(`topic ${t.id}: not in TOPIC_ORDER`);
  }
  for (const id of Object.keys(pages)) if (!TOPIC_BY_ID.has(id)) problems.push(`theory page "${id}" has no topic`);
  for (const l of LEVELS) if (l.type !== "quiz" && !TOPIC_BY_ID.has(LEVEL_TOPIC[l.id])) problems.push(`level ${l.id}: no topic`);
  for (const s of SKILLS) {
    if (!TOPIC_BY_ID.has(s.topic)) problems.push(`skill ${s.id}: unknown topic ${s.topic}`);
    const teacher = LEVELS.find(l => l.id === s.after);
    if (!teacher || teacher.type !== "lab") problems.push(`template ${s.id}: it is not attached to a lab`);
    else if (LEVEL_TOPIC[teacher.id] !== s.topic) problems.push(`skill ${s.id}: its ticket ${teacher.id} is in another topic`);
  }
  // every lab should have at least one variant template; these two are one-off capstones
  const NO_VARIANTS = ["p1-outage", "greenfield-branch"];
  for (const l of LEVELS) {
    if (l.type !== "lab") continue;
    const has = SKILLS.some(k => k.after === l.id);
    if (!has && !NO_VARIANTS.includes(l.id)) problems.push(`lab ${l.id}: no variant template`);
  }
  const perTopic = {};
  for (const q of QUESTIONS) { const t = topicOfQuestion(q); perTopic[t] = (perTopic[t] || 0) + 1; }
  if (problems.length) {
    failed++;
    console.log("FAIL topics");
    for (const p of problems) console.log("   - " + p);
  } else console.log(`ok   topics  (${TOPICS.length} topics with theory; built-in questions per topic: ${TOPIC_ORDER.map(t => `${t} ${perTopic[t] || 0}`).join(", ")})`);
}

// Console behaviour that objectives and coaching rely on.
if (!only) {
  const problems = [];
  const lab = new Lab(LEVELS.find(l => l.id === "first-console"));
  const shown = () => lab.progress().find(o => o.text.startsWith("Display the running")).done;
  const expect = (cond, what) => { if (!cond) problems.push(what); };
  let out = lab.exec("SW1", "show running-config");
  expect(/% Invalid/.test(out) && /Tip: .*enable/.test(out), "user mode: show running-config should be rejected with an 'enable' tip");
  expect(!shown(), "a show command rejected in user mode must not complete the objective");
  lab.exec("SW1", "enable");
  out = lab.exec("SW1", "hostname X");
  expect(/Tip: .*configure terminal/.test(out), "privileged mode: a config command should get a 'configure terminal' tip");
  lab.exec("SW1", "configure terminal");
  out = lab.exec("SW1", "show running-config");
  expect(/% Invalid/.test(out) && /Tip: .*do show running-config/.test(out), "config mode: show should be rejected with a 'do' tip");
  expect(!shown(), "a show command rejected in config mode must not complete the objective");
  out = lab.exec("SW1", "copy running-config startup-config");
  expect(/% Invalid/.test(out) && /Tip: /.test(out), "config mode: copy should be rejected with a tip");
  out = lab.exec("SW1", "switchport mode access");
  expect(/Tip: .*interface/.test(out), "config mode: an interface command should get an 'interface' tip");
  out = lab.exec("SW1", "frobnicate now");
  expect(/% Invalid/.test(out) && !/Tip:/.test(out), "an unknown command should be rejected without a tip");
  lab.exec("SW1", "do show running-config");
  expect(shown(), "'do show running-config' in config mode should complete the objective");
  if (problems.length) {
    failed++;
    console.log("FAIL console behaviour");
    for (const p of problems) console.log("   - " + p);
  } else console.log("ok   console behaviour  (rejected commands do not count; wrong-mode tips)");
}

// The built-in question bank: well formed, and big enough for every exam.
if (!only) {
  const { QUESTIONS } = await import("../js/game/questions.js");
  const { HANDBOOK_MD } = await import("../js/game/handbook.js");
  const problems = [];
  const ids = new Set();
  for (const q of QUESTIONS) {
    if (ids.has(q.id)) problems.push(`duplicate id ${q.id}`);
    ids.add(q.id);
    if (!q.q || !q.e || !Array.isArray(q.o) || q.o.length < 3) problems.push(`${q.id}: missing text, explanation or options`);
    // one correct option, or a list of them for a "choose two" question
    const ans = Array.isArray(q.a) ? q.a : [q.a];
    if (!ans.length || ans.some(k => !Number.isInteger(k) || k < 0 || k >= q.o.length)) problems.push(`${q.id}: answer index out of range`);
    if (Array.isArray(q.a) && (ans.length < 2 || new Set(ans).size !== ans.length || ans.length > q.o.length - 2)) problems.push(`${q.id}: a multi-select question needs 2 or more different answers and at least 2 wrong options`);
    if (q.o.length > 6) problems.push(`${q.id}: more than six options`);
    if (new Set(q.o).size !== q.o.length) problems.push(`${q.id}: duplicate options`);
  }
  // each promotion exam must be fillable from the built-in bank, in both exam versions
  const { topicOfQuestion, TOPIC_BY_ID, inExam, EXAMS, topicsByDomain, topicInExam, inBothExams } = await import("../js/game/topics.js");
  const tagged = QUESTIONS.map(q => ({ ...q, topic: topicOfQuestion(q) }));
  for (const exam of Object.keys(EXAMS)) {
    // as the quiz does it: a question on a subject both exams share is filed under that exam's topic
    const pool = tagged.map(q => ({ ...q, both: inBothExams(q, q.topic), topic: topicInExam(q, q.topic, exam) })).filter(q => q.both || inExam(q, q.topic, exam));
    if (!pool.some(q => q.both && /ansible/i.test(q.q))) problems.push(`${exam}: no Ansible question is visible`);
    for (const level of LEVELS.filter(l => l.type === "quiz")) {
      const want = exam === "v2" ? level.params.v2domains : level.params.domains;
      if (!Array.isArray(want)) { problems.push(`${level.id}: no domain list for ${exam}`); continue; }
      const per = Math.ceil(level.params.count / want.length);
      for (const d of want) {
        const have = pool.filter(q => (exam === "v2" ? TOPIC_BY_ID.get(q.topic).v2 : q.ch) === d).length;
        if (have < per) problems.push(`${level.id} (${exam}): needs ${per} questions from domain ${d}, the bank has ${have}`);
      }
    }
    for (const d of EXAMS[exam].domains) if (d.n && !topicsByDomain(exam).some(x => x.n === d.n)) problems.push(`${exam}: domain ${d.n} has no topics`);
    for (const dom of topicsByDomain(exam)) for (const t of dom.topics) {
      if (t.id !== "capstone" && pool.filter(q => q.topic === t.id).length < 4) problems.push(`${exam}: topic ${t.id} has fewer than 4 custom questions`);
    }
  }
  for (const l of LEVELS) if (l.only && !EXAMS[l.only]) problems.push(`level ${l.id}: unknown exam "${l.only}"`);
  if (!HANDBOOK_MD.includes("## ")) problems.push("handbook has no sections");
  if (problems.length) {
    failed++;
    console.log("FAIL question bank");
    for (const p of problems) console.log("   - " + p);
  } else console.log(`ok   question bank  (${QUESTIONS.length} questions, ${[1, 2, 3, 4, 5, 6].map(d => QUESTIONS.filter(q => q.ch === d).length).join("/")} per domain)`);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll lab levels pass");
process.exit(failed ? 1 : 0);
