// Desktop app tests that need no Electron: which file the app:// origin serves
// (desktop/files.mjs), and how an imported data pack is recognised.
// Run with: node tests/run-desktop.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFile, packKind } from "../desktop/files.mjs";
import { scanFolder, vdfLibraries, findX3Soundtrack, trackList, musicFile } from "../desktop/music.mjs";

let fails = 0;
const ok = (name, cond, extra = "") => { console.log((cond ? "ok   " : "FAIL ") + name + (cond ? "" : "  " + extra)); if (!cond) fails++; };

// a fake app folder and a fake data folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ccna-desktop-"));
const appRoot = path.join(tmp, "app"), packDir = path.join(tmp, "user", "data");
const put = (f, text = "x") => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
put(path.join(appRoot, "index.html"));
put(path.join(appRoot, "js", "ui", "app.js"));
put(path.join(appRoot, "content", "theory.md"));
put(path.join(appRoot, "data", "none.js"));
put(path.join(appRoot, "desktop", "main.mjs"));
put(path.join(appRoot, "package.json"));
put(path.join(tmp, "secret.txt"));
const r = p => resolveFile(p, { appRoot, packDir });
const rel = f => (f ? path.relative(tmp, f).split(path.sep).join("/") : null);

ok("/ serves index.html", rel(r("/")) === "app/index.html");
ok("a module is served", rel(r("/js/ui/app.js")) === "app/js/ui/app.js");
ok("percent-encoded paths are decoded", rel(r("/js/ui/%61pp.js")) === "app/js/ui/app.js");
ok("theory is served", rel(r("/content/theory.md")) === "app/content/theory.md");
ok("a missing file is not found", r("/js/ui/nope.js") === null);
ok("the desktop code is not served", r("/desktop/main.mjs") === null);
ok("package.json is not served", r("/package.json") === null);
ok("../ cannot leave the app folder", r("/js/../../secret.txt") === null && r("/%2e%2e/secret.txt") === null && r("/js/%2e%2e/%2e%2e/secret.txt") === null);
ok("a backslash cannot leave the app folder", r("/js/..%5c..%5csecret.txt") === null);
ok("a bad escape is not found", r("/js/%E0%A4%A.js") === null);

ok("no pack installed: the placeholder is served", rel(r("/data/questions.js")) === "app/data/none.js");
put(path.join(appRoot, "data", "notes.js"), "window.CCNA_NOTES = []");
ok("a pack inside the app (personal build) is served", rel(r("/data/notes.js")) === "app/data/notes.js");
put(path.join(packDir, "notes.js"), "window.CCNA_NOTES = []");
put(path.join(packDir, "questions.js"), "window.CCNA_QUESTIONS = {}");
ok("an imported pack wins over the one in the app", rel(r("/data/notes.js")) === "user/data/notes.js");
ok("an imported question bank is served", rel(r("/data/questions.js")) === "user/data/questions.js");
put(path.join(packDir, "other.js"));
ok("only the two known packs are read from the data folder", rel(r("/data/other.js")) === "app/data/none.js");

ok("a question bank is recognised", packKind('window.CCNA_QUESTIONS={"questions":[]}') === "questions.js");
ok("a handbook is recognised, after a BOM and comments", packKind("﻿// my notes\n// more\nwindow.CCNA_NOTES = [];") === "notes.js");
ok("any other script is refused", packKind("alert(1); window.CCNA_QUESTIONS = {}") === null && packKind("") === null);

// the music folder (desktop/music.mjs)
const lib = path.join(tmp, "steam-lib"), sound = path.join(lib, "steamapps", "common", "X3 - Reunion", "soundtrack");
for (const n of ["00010.mp3", "00002.mp3", "notes.txt", "00100.OGG", "cover.jpg"]) put(path.join(sound, n));
fs.mkdirSync(path.join(sound, "sub.mp3"), { recursive: true });
const tracks = scanFolder(sound).map(f => path.basename(f));
ok("a music folder lists only audio files, in natural order", JSON.stringify(tracks) === JSON.stringify(["00002.mp3", "00010.mp3", "00100.OGG"]), JSON.stringify(tracks));
ok("a missing music folder has no tracks", scanFolder(path.join(tmp, "nope")).length === 0);
ok("Steam library paths are read from libraryfolders.vdf", JSON.stringify(vdfLibraries('"libraryfolders"\n{\n "0"\n {\n  "path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n }\n "1" { "path" "D:\\\\SteamLibrary" }\n}')) === JSON.stringify(["C:\\Program Files (x86)\\Steam", "D:\\SteamLibrary"]));
const x3 = findX3Soundtrack([path.join(tmp, "other-lib"), lib]);
ok("an X3 soundtrack is found in a Steam library", x3 && x3.dir === sound && x3.game === "X3 - Reunion");
ok("no X3 soundtrack in an empty library", findX3Soundtrack([path.join(tmp, "other-lib")]) === null);
const files = scanFolder(sound), list = trackList(files);
ok("the page gets track names and app:// addresses, not file paths", list[1].name === "00010" && list[1].url === "app://ccna/music/1" && !JSON.stringify(list).includes("steam-lib"));
ok("a music address maps to its file, and nothing else does", musicFile("/music/2", files) === files[2] && musicFile("/music/3", files) === null && musicFile("/music/../x", files) === null && musicFile("/music/1x", files) === null);

// the real app folder: every file the page asks for at start is served
const real = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rr = p => resolveFile(p, { appRoot: real, packDir: path.join(tmp, "empty") });
ok("the real index.html, styles, theme script and entry module are served", ["/", "/css/style.css", "/css/cockpit.css", "/css/fonts/jetbrains-mono-latin-wght-normal.woff2", "/js/ui/cockpit.js", "/js/theme.js", "/js/ui/app.js", "/js/version.js", "/content/theory.md"].every(p => rr(p)));
ok("the real question bank or its placeholder is served", path.basename(rr("/data/questions.js") || "") === (fs.existsSync(path.join(real, "data", "questions.js")) ? "questions.js" : "none.js"));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\n${fails} desktop test(s) failed` : "\nall desktop tests pass");
process.exit(fails ? 1 : 0);
