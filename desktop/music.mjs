// The desktop app's music folder: the cockpit view can play a folder of the
// player's own music straight from disk, without copying it anywhere. The
// folder is chosen by the player, or found in a Steam library when an X3 game
// is installed there. No Electron imports, so tests/run-desktop.mjs can run it.

import fs from "node:fs";
import path from "node:path";

export const AUDIO_TYPES = {
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav",
  ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac", ".webm": "audio/webm",
};

export const isAudio = name => Object.hasOwn(AUDIO_TYPES, path.extname(String(name)).toLowerCase());
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// The audio files directly inside a folder, in natural order (2 before 10).
export function scanFolder(dir) {
  let names;
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return names.filter(e => e.isFile() && isAudio(e.name)).map(e => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map(n => path.join(dir, n));
}

// Library folders listed in Steam's libraryfolders.vdf
export function vdfLibraries(text) {
  return [...String(text).matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\\\/g, "\\"));
}

// Every Steam library on this computer that we can find.
export function steamLibraries({ platform = process.platform, env = process.env, home = "" } = {}) {
  const installs = platform === "win32"
    ? [path.win32.join(env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam"), path.win32.join(env.ProgramFiles || "C:\\Program Files", "Steam")]
    : platform === "darwin" ? [path.join(home, "Library", "Application Support", "Steam")]
    : [path.join(home, ".local", "share", "Steam"), path.join(home, ".steam", "steam"), path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam")];
  const out = [];
  const add = p => { if (p && !out.includes(p)) out.push(p); };
  for (const dir of installs) {
    add(dir);
    try { vdfLibraries(fs.readFileSync(path.join(dir, "steamapps", "libraryfolders.vdf"), "utf8")).forEach(add); } catch { /* no Steam here */ }
  }
  return out;
}

// X3 games keep their music as plain MP3 files in a soundtrack folder.
const X3 = ["X3 - Reunion", "X3 Reunion", "X3 Terran Conflict", "x3 terran conflict", "X3 Albion Prelude", "X3 Farnham's Legacy"];

export function findX3Soundtrack(libraries) {
  for (const lib of libraries) {
    for (const game of X3) {
      for (const sub of ["soundtrack", "Soundtrack"]) {
        const dir = path.join(lib, "steamapps", "common", game, sub);
        if (isDir(dir) && scanFolder(dir).length) return { dir, game };
      }
    }
  }
  return null;
}

// What the page gets: names and app:// addresses, never file paths.
export function trackList(files) {
  return files.map((f, i) => ({ name: path.basename(f, path.extname(f)), url: `app://ccna/music/${i}` }));
}

// The file behind an app://ccna/music/<n> request, or null.
export function musicFile(pathname, files) {
  const m = /^\/music\/(\d+)$/.exec(pathname);
  return m && files[+m[1]] ? files[+m[1]] : null;
}
