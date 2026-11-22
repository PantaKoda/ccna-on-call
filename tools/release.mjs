// Cuts a release: bumps the version, dates the changelog, commits, tags,
// pushes, and publishes a GitHub release with the changelog section as notes.
//
//   node tools/release.mjs patch|minor|major      bump from the current version
//   node tools/release.mjs 1.4.0                  release an explicit version
//
// Options:
//   --no-push            stop after the local commit and tag
//   --trailer "K: V"     add a trailer line to the release commit (repeatable)
//
// Before running: commit your changes and list them under "## [Unreleased]" in
// CHANGELOG.md. The script refuses to run on a dirty tree, with an empty
// Unreleased section, with failing tests, or if a personal data pack is tracked.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const push = !args.includes("--no-push");
const trailers = [];
let bump = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--trailer") trailers.push(args[++i]);
  else if (!args[i].startsWith("--")) bump = args[i];
}

const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const git = (...a) => run("git", a);
const die = msg => { console.error("release: " + msg); process.exit(1); };

// ---- work out the version
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const cur = pkg.version.split(".").map(Number);
let next;
if (bump === "major") next = [cur[0] + 1, 0, 0];
else if (bump === "minor") next = [cur[0], cur[1] + 1, 0];
else if (bump === "patch") next = [cur[0], cur[1], cur[2] + 1];
else if (/^\d+\.\d+\.\d+$/.test(bump || "")) next = bump.split(".").map(Number);
else die("say what to release: patch, minor, major or an explicit version such as 1.2.0");
const version = next.join(".");
const tag = "v" + version;

// ---- preconditions
if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") die("releases are cut from the main branch");
if (git("status", "--porcelain")) die("the working tree has uncommitted changes; commit them first");
if (git("tag", "-l", tag)) die(`tag ${tag} already exists`);
const tracked = git("ls-files", "data").split("\n").filter(f => f && !["data/README.md", "data/none.js"].includes(f));
if (tracked.length) die(`personal data packs must not be tracked in this public repository: ${tracked.join(", ")}`);

const logPath = path.join(root, "CHANGELOG.md");
const lines = fs.readFileSync(logPath, "utf8").split("\n");
const start = lines.findIndex(l => l.startsWith("## [Unreleased]"));
if (start < 0) die('CHANGELOG.md has no "## [Unreleased]" section');
let end = lines.findIndex((l, i) => i > start && l.startsWith("## ["));
if (end < 0) end = lines.length;
const body = lines.slice(start + 1, end).join("\n").trim();
if (!/^- /m.test(body)) die("nothing is listed under [Unreleased] in CHANGELOG.md");

console.log(`Releasing ${tag} (was ${pkg.version})`);
try { run("node", ["tests/run-levels.mjs"]); run("node", ["tests/run-sim.mjs"]); run("node", ["tests/run-drills.mjs"]); }
catch (e) { die("tests failed:\n" + (e.stdout || e.message)); }
console.log("  tests pass");

// ---- write the version everywhere it lives
const d = new Date();
const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
fs.writeFileSync(path.join(root, "js", "version.js"), `// Written by tools/release.mjs. Do not edit by hand.\nexport const VERSION = "${version}";\n`);
lines.splice(start, end - start, "## [Unreleased]", "", `## [${version}] - ${date}`, "", body, "");
fs.writeFileSync(logPath, lines.join("\n"));

// ---- commit, tag, push, publish
git("add", "package.json", "js/version.js", "CHANGELOG.md");
git("commit", "-m", `Release ${tag}`, ...trailers.flatMap(t => ["--trailer", t]));
git("tag", "-a", tag, "-m", `${tag}\n\n${body}`);
console.log(`  committed and tagged ${tag}`);

if (!push) { console.log("  not pushed (--no-push). Later: git push origin main --follow-tags"); process.exit(0); }
git("push", "origin", "main", "--follow-tags");
console.log("  pushed main and the tag");
const notes = path.join(os.tmpdir(), `release-notes-${tag}.md`);
fs.writeFileSync(notes, body + "\n");
try {
  console.log("  " + run("gh", ["release", "create", tag, "--title", tag, "--notes-file", notes, "--verify-tag"]));
} catch (e) {
  console.log(`  the tag is pushed, but the GitHub release was not created (${(e.stderr || e.message).trim().split("\n")[0]})`);
  console.log(`  create it with: gh release create ${tag} --title ${tag} --notes-file <file>`);
} finally {
  fs.rmSync(notes, { force: true });
}
