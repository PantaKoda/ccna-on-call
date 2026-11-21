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
    if (step.pc) { lab.setHostIp(step.pc, step.ip); continue; }
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
    if (!Number.isInteger(q.a) || q.a < 0 || q.a >= q.o.length) problems.push(`${q.id}: answer index out of range`);
    if (new Set(q.o).size !== q.o.length) problems.push(`${q.id}: duplicate options`);
  }
  for (const level of LEVELS.filter(l => l.type === "quiz")) {
    const { domains, count } = level.params;
    const per = Math.ceil(count / domains.length);
    for (const d of domains) {
      const have = QUESTIONS.filter(q => q.ch === d).length;
      if (have < per) problems.push(`${level.id}: needs ${per} questions from domain ${d}, the bank has ${have}`);
    }
  }
  if (!HANDBOOK_MD.includes("## ")) problems.push("handbook has no sections");
  if (problems.length) {
    failed++;
    console.log("FAIL question bank");
    for (const p of problems) console.log("   - " + p);
  } else console.log(`ok   question bank  (${QUESTIONS.length} questions, ${[1, 2, 3, 4, 5, 6].map(d => QUESTIONS.filter(q => q.ch === d).length).join("/")} per domain)`);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll lab levels pass");
process.exit(failed ? 1 : 0);
