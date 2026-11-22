// Which file the desktop app serves for a request on its app:// origin.
// No Electron imports here, so tests/run-desktop.mjs can run it under Node.
//
// The window loads the same static files as the web version (index.html, css,
// js, content). The optional data packs (data/questions.js, data/notes.js) are
// looked up first in the player's own data folder, so a pack imported once
// survives every update; then in the app itself (a personal build); and when
// neither has one, the placeholder data/none.js is served, as in the web version.

import fs from "node:fs";
import path from "node:path";

export const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

// only these are part of the game; everything else in the app folder is not served
const SERVED = /^\/(index\.html|css\/.+|js\/.+|content\/.+|data\/[\w-]+\.(js|md))$/;
export const PACKS = ["questions.js", "notes.js"];

const isFile = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const inside = (dir, f) => { const r = path.relative(dir, f); return r && !r.startsWith("..") && !path.isAbsolute(r); };

// pathname: the URL path, still percent-encoded. Returns an absolute file path or null.
export function resolveFile(pathname, { appRoot, packDir }) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel === "/" || rel === "") rel = "/index.html";
  rel = path.posix.normalize(rel);
  if (rel.includes("\0") || rel.includes("\\") || !SERVED.test(rel)) return null;

  const pack = rel.match(/^\/data\/([\w-]+\.js)$/);
  if (pack) {
    const name = pack[1];
    if (PACKS.includes(name) && packDir && isFile(path.join(packDir, name))) return path.join(packDir, name);
    const own = path.join(appRoot, "data", name);
    if (isFile(own)) return own;
    return path.join(appRoot, "data", "none.js");
  }
  const file = path.join(appRoot, ...rel.split("/").filter(Boolean));
  return inside(appRoot, file) && isFile(file) ? file : null;
}

// What an imported file is, from its first line: "questions.js", "notes.js" or null.
export function packKind(text) {
  const head = String(text).replace(/^﻿/, "").slice(0, 4000).replace(/^\s*(\/\/[^\n]*\n\s*)*/, "");
  if (/^window\.CCNA_QUESTIONS\s*=/.test(head)) return "questions.js";
  if (/^window\.CCNA_NOTES\s*=/.test(head)) return "notes.js";
  return null;
}
