// Builds the optional data packs (data/questions.js, data/notes.js) from the
// companion practice app, for people who have their own question bank there.
//
//   node tools/import-data.mjs [path-to-practice-app]
//
// The output is git-ignored: it is your personal content and stays on your
// machine. The game works without it (see data/README.md).
// Questions that need a figure are skipped, because the images are not copied.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(process.argv[2] || path.join(here, "..", "..", "CCNA_EXAMS_APP"));
const out = path.join(here, "..", "data");
fs.mkdirSync(out, { recursive: true });

const load = file => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(src, "data", file), "utf8"), sandbox);
  return sandbox.window;
};

const bank = load("questions.js").CCNA_DATA;
const questions = bank.questions
  .filter(q => !/<img|<figure/i.test(q.q + q.e + q.o.join("")))
  .map(({ id, ch, q, o, a, e }) => ({ id, ch, q, o, a, e }));
fs.writeFileSync(path.join(out, "questions.js"), "window.CCNA_QUESTIONS=" + JSON.stringify({ chapters: bank.chapters, questions }) + ";\n");
console.log(`questions: kept ${questions.length} of ${bank.questions.length} (skipped ${bank.questions.length - questions.length} that need figures)`);

const notes = load("notes.js").CCNA_NOTES;
fs.writeFileSync(path.join(out, "notes.js"), "window.CCNA_NOTES=" + JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, md: n.md }))) + ";\n");
console.log(`notes: ${notes.length} sheet(s)`);
