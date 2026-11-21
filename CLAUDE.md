# CCNA: On Call

A static web game (plain HTML, CSS, ES modules; no build step, no backend) that teaches CCNA topics through labs on a simulated network. See README.md for the layout and for how to add a level.

## Commands

- `node tools/serve.mjs` runs the dev server on http://localhost:8080 (`?unlock=all` opens every level).
- `npm test` plays every lab's scripted solution and checks the question bank. Run it after any change to `js/engine/` or `js/game/`.
- `docker build -t ccna-on-call .` builds the production image; the build runs the tests.

## Release cycle

Every change the owner asks for ends in a release that is pushed to GitHub. This is standing approval to commit, tag and push to `origin` for those changes; no need to ask each time.

1. Make the change. Add or update the scripted `solution` when a level changes, and run `npm test`.
2. Add an entry under `## [Unreleased]` in CHANGELOG.md, written for a player: what changed, in a sentence. Use the headings `### Added`, `### Changed`, `### Fixed`, `### Removed`.
3. Commit the change together with its changelog entry.
4. Cut the release: `node tools/release.mjs patch|minor|major`, adding `--trailer "Co-Authored-By: ..."` when an assistant made the commit.
   - `minor` for a new level, feature or command; `patch` for a fix, wording or styling; `major` only when saved progress or the level format breaks.
   - The script runs the tests, sets the version in `package.json` and `js/version.js`, dates the changelog section, commits `Release vX.Y.Z`, creates the tag, pushes `main` with the tag, and publishes a GitHub release with the changelog section as notes.
5. Report the new version and the release link.

Several changes asked for in one request go out as one release. Never edit `js/version.js` by hand, and never move or delete a tag that has been pushed.

## This repository is public

- Never commit `data/questions.js` or `data/notes.js`. They are the owner's personal data packs (the question bank comes from a commercial book) and are git-ignored; the release script refuses to run if they are tracked. Do not copy their content into tracked files either.
- New exam questions, handbook text and level text must be written from scratch, not adapted from a book or another site.
- No secrets, tokens, personal names, email addresses or local file paths in tracked files. Passwords in levels are made-up lab values.
- Before pushing anything unusual (a new top-level file, generated data, an image), check what is staged with `git status` and `git diff --cached --stat`.

## Conventions

- `js/engine/` has no DOM access so it runs under Node for the tests. Keep it that way.
- The simulator rejects commands it does not model, the way IOS does. Prefer a clear rejection to silently accepting something that has no effect, unless the command is listed as accepted-but-not-simulated.
- User-facing text is plain and specific: say what happened and what to do next.
