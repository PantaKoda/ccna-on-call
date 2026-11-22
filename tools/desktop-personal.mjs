// Builds the desktop app for this OS with your personal data packs inside
// (data/questions.js, data/notes.js), into dist/personal/. The packs are
// copied to the app's data folder on first start, so they survive updates to
// the public builds.
//
//   npm run desktop:personal
//
// The result contains content you hold a personal licence for: keep it on your
// own devices. Never attach it to a GitHub release or share it.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packs = ["questions.js", "notes.js"].filter(f => fs.existsSync(path.join(root, "data", f)));
if (!packs.length) { console.error("desktop-personal: no data packs in data/ (questions.js, notes.js); a public build is the same, use npm run desktop:dist"); process.exit(1); }
console.log(`Personal build with data/${packs.join(", data/")}`);

const r = spawnSync("npx", ["electron-builder", "--config", "desktop/builder.config.cjs", "--publish", "never"], {
  cwd: root, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, CCNA_PERSONAL: "1" },
});
if (r.status === 0) console.log("\nBuilt into dist/personal/. Keep it private: it contains your personal data packs.");
process.exit(r.status ?? 1);
