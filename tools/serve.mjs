// Minimal static file server for local development (no dependencies).
//   node tools/serve.mjs [port]
// Production uses nginx (see Dockerfile); this is only for working on the game.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon" };

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (rel.endsWith("/")) rel += "index.html";
  let file = path.join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  // optional data packs: serve the placeholder when one is not installed
  if (/^\/data\/[\w-]+\.js$/.test(rel) && !fs.existsSync(file)) file = path.join(root, "data", "none.js");
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
}).listen(port, "127.0.0.1", () => console.log(`CCNA: On Call dev server on http://localhost:${port}`));
