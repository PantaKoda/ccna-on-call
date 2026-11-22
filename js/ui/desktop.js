// What the page adds when it runs inside the desktop app (desktop/preload.cjs
// provides window.ccnaDesktop). In a browser `desktop` is null and every export
// here does nothing, so the web version is unchanged.

import { h, toast } from "./dom.js";

const api = window.ccnaDesktop || null;
export const desktop = api;

// ---- update button in the top bar: hidden until a new release is found.
// The same element is put back into the top bar every time it is redrawn.
let state = { status: "idle" };
let asked = false;     // the player pressed Check for updates and wants an answer
const btn = h("button", { class: "btn small update-btn", hidden: true, onclick: press });

function press() {
  if (state.status === "available") api.update.start();
}

function draw() {
  const s = state;
  btn.hidden = !["available", "downloading", "ready"].includes(s.status);
  btn.disabled = s.status !== "available";
  btn.classList.toggle("primary", s.status === "available");
  btn.textContent = s.status === "downloading" ? `Downloading ${s.percent || 0}%`
    : s.status === "ready" ? "Restarting…"
    : s.manual ? `Download ${s.version}` : `Update to ${s.version}`;
  btn.title = s.manual
    ? `Version ${s.version} is out. This opens the download page; install it over this copy and your progress stays.`
    : `Version ${s.version} is out. Downloads it, then restarts the game on the new version. Your progress stays.`;
}

function changed(next) {
  const was = state.status;
  state = next;
  draw();
  if (next.status === "available" && was !== "available") toast(`Version ${next.version} is out. Press “${btn.textContent}” in the top bar to get it.`, "ok");
  if (next.error && (asked || was === "downloading")) toast(`Update failed: ${next.error}`, "warn");
  if (asked && next.status === "latest") toast(`You have the latest version (${next.current}).`, "ok");
  if (asked && next.status === "dev") toast("Updates are only checked in an installed copy, not when running from the source tree.", "warn");
  if (["latest", "available", "error", "dev"].includes(next.status)) asked = false;
}

if (api) {
  api.update.on(changed);
  api.update.get().then(changed);
}

export const updateButton = () => (api ? btn : null);

// ---- the footer of the home screen
export function storageNote() {
  return api ? "Progress is saved on this computer, for your account only." : "Progress is saved in this browser.";
}

export function desktopLinks() {
  if (!api) return [];
  return [
    h("button", { class: "linklike", onclick: () => { asked = true; toast("Checking for updates…"); api.update.check(); } }, "Check for updates"),
    h("button", { class: "linklike", title: "Use your own question bank or handbook (see data/README.md). It is kept with your progress and survives updates.", onclick: () => api.data.import() }, "Import data pack"),
  ];
}
