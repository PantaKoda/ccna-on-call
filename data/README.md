# Optional data packs

The game works without anything in this folder: the promotion exams use the built-in question bank (`js/game/questions.js`) and the Handbook uses the built-in command reference (`js/game/handbook.js`). Both were written for this project.

You can drop in your own content. These two files are **ignored by git** so that material you have a personal licence for (for example questions from a book you bought) is never committed or published by accident.

| File | Replaces | Format |
| --- | --- | --- |
| `questions.js` | the exam question bank | `window.CCNA_QUESTIONS = { questions: [{ id, ch, q, o, a, e }] }` |
| `notes.js` | the Handbook | `window.CCNA_NOTES = [{ id, title, md }]` |

- `ch` is the exam domain, 1 to 6. `q` (question), `o` (array of options) and `e` (explanation) may contain simple HTML. `a` is the index of the correct option, or a list of indexes such as `[0, 2]` for a "choose two" question.
- `md` is Markdown: `##` headings become sections, and tables, lists, block quotes and code blocks are supported.

`node tools/import-data.mjs <path>` builds both files from a folder that has `data/questions.js` and `data/notes.js` in the format of the companion practice app.

If you build the Docker image on a machine where these files exist, they are copied into the image. Keep such an image private.

The desktop app never gets them from a public build. Import them in the app (File > Import), which keeps them in the app's data folder through updates, or build a personal installer with `npm run desktop:personal`, which is just as private as such an image.
