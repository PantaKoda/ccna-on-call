// The cockpit view: an optional look for the whole game, in the browser and in
// the desktop app alike. The panels become glass screens in front of a ship's
// canopy; behind them a ringed gas giant, its moon and the stars turn slowly as
// the ship rolls in orbit (space.js). The Bridge panel runs the music (the
// ship's own generated score, or the player's own files: music.js) and the
// view: which planet, how fast the ship rolls, how see-through the glass is.
//
// It changes only looks and sound: progress, labs and the simulator are the
// same in both views. The choices are kept per browser, or per desktop install.
// js/theme.js sets data-skin="cockpit" before the first paint.

import { h, toast } from "./dom.js";
import { createSpace, PLANETS } from "./space.js";
import { createSpaceGL, GL_PLANETS } from "./spacegl.js";
import { music, MOODS } from "./music.js";

const KEY = "ccna-on-call-cockpit";
const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ROLL = { gentle: 1, cinematic: 3.5, hold: 0 };
const prefs = Object.assign({
  music: false, source: "ambient", volume: 0.45, mood: "orbit", shuffle: false,
  roll: reduced ? "hold" : "gentle", planet: "kestrel", glass: 0.74, read: 0.84, canopy: true, graphics: "full", light: "day",
}, read());
if (prefs.motion === false && !read().roll) prefs.roll = "hold";     // saved by an earlier version
function read() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ } }

export const isCockpit = () => window.ccnaSkin.get() === "cockpit";

// ---------------------------------------------------------------- the view behind the page
// The canopy frame is fixed to the ship, so it does not turn with the stars.
const FRAME_SVG = `<svg class="cockpit-frame" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
  <linearGradient id="ck-metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#172433"/><stop offset=".55" stop-color="#070d14"/><stop offset="1" stop-color="#121e2b"/></linearGradient>
  <linearGradient id="ck-edge" x1="0" x2="1"><stop offset="0" stop-color="#5fdcff" stop-opacity="0"/><stop offset=".5" stop-color="#5fdcff" stop-opacity=".55"/><stop offset="1" stop-color="#5fdcff" stop-opacity="0"/></linearGradient>
  <linearGradient id="ck-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bfefff" stop-opacity=".05"/><stop offset=".4" stop-color="#bfefff" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1600" height="900" fill="url(#ck-glass)"/>
<path d="M0 0H1600V74C1230 38 370 38 0 74Z" fill="url(#ck-metal)"/>
<path d="M0 74C370 38 1230 38 1600 74" fill="none" stroke="url(#ck-edge)" stroke-width="2"/>
<path d="M214 0H292L74 900H-6Z" fill="url(#ck-metal)"/>
<path d="M292 0L74 900" stroke="#5fdcff" stroke-opacity=".22" stroke-width="2"/>
<path d="M1308 0H1386L1606 900H1526Z" fill="url(#ck-metal)"/>
<path d="M1308 0L1526 900" stroke="#5fdcff" stroke-opacity=".22" stroke-width="2"/>
<path d="M0 900V806C420 762 1180 762 1600 806V900Z" fill="url(#ck-metal)"/>
<path d="M0 806C420 762 1180 762 1600 806" fill="none" stroke="url(#ck-edge)" stroke-width="2"/>
<g class="ck-lights">
  <circle cx="610" cy="846" r="4" fill="#5cf0a8"/><circle cx="636" cy="846" r="4" fill="#46e0ff"/><circle cx="662" cy="846" r="4" fill="#ffbf5e"/>
  <circle cx="938" cy="846" r="4" fill="#46e0ff"/><circle cx="964" cy="846" r="4" fill="#ff7f8f"/><circle cx="990" cy="846" r="4" fill="#5cf0a8"/>
</g>
<g fill="#46e0ff" fill-opacity=".14"><rect x="700" y="832" width="200" height="6" rx="3"/><rect x="720" y="850" width="160" height="4" rx="2"/></g>
</svg>`;

let bg = null, space = null;
const tele = { el: h("span", { class: "telemetry", "aria-hidden": "true" }) };
for (const [k, label] of [["alt", "ALT"], ["vel", "VEL"], ["roll", "ROLL"]]) {
  tele[k] = h("b");
  tele.el.append(h("span", {}, label + " ", tele[k]));
}

function onTick(roll, t) {
  const deg = (((roll * 180) / Math.PI) % 360 + 360) % 360;
  const alt = 412 + 7.5 * Math.sin(t / 95);
  tele.alt.textContent = `${alt.toFixed(1)} km`;
  tele.vel.textContent = `${(7.668 - (alt - 412) * 0.0011).toFixed(3)} km/s`;
  tele.roll.textContent = `${deg.toFixed(1)}°`;
}
onTick(0.35, 0);

// panel see-through-ness and the canopy frame are page styles
function applyLook() {
  const root = document.documentElement;
  root.style.setProperty("--glass-a", String(prefs.glass));
  root.style.setProperty("--read-a", String(prefs.read));
  root.classList.toggle("ck-bare", !prefs.canopy);
}

function mount() {
  if (bg) return;
  applyLook();
  bg = h("div", { class: "cockpit-bg", "aria-hidden": "true" }, h("div", { class: "cockpit-vignette" }));
  bg.insertAdjacentHTML("beforeend", FRAME_SVG);
  document.body.prepend(bg);
  startView();
}

// Full graphics draw the view on the GPU (spacegl.js); Light, or a browser
// without WebGL 2, uses the canvas version (space.js). A canvas can only ever
// have one kind of context, so each start gets a new one.
let gpu = false;
function startView() {
  if (space) { space.destroy(); space = null; }
  bg.querySelector(".space-canvas")?.remove();
  const make = () => { const c = h("canvas", { class: "space-canvas" }); bg.prepend(c); return c; };
  const o = { rate: ROLL[prefs.roll] ?? 1, planet: prefs.planet, light: prefs.light, onTick };
  gpu = false;
  if (prefs.graphics === "full") {
    try { space = createSpaceGL(make(), o); gpu = true; return; } catch (e) { console.warn("GPU view unavailable, using the light one:", e.message); bg.querySelector(".space-canvas")?.remove(); }
  }
  try { space = createSpace(make(), o); } catch (e) { console.error("space view failed", e); }
}

function unmount() {
  if (space) { space.destroy(); space = null; }
  if (bg) { bg.remove(); bg = null; }
  document.documentElement.style.removeProperty("--glass-a");
  document.documentElement.style.removeProperty("--read-a");
  document.documentElement.classList.remove("ck-bare");
  closePanel();
  setViewing(false);
  music.pause();
}

// ---------------------------------------------------------------- music
music.init({ source: prefs.source, volume: prefs.volume, mood: prefs.mood, shuffle: prefs.shuffle });
music.on(st => {
  bridgeBtn.classList.toggle("on", st.playing);
  if (st.error) { toast(st.error, "warn"); st.error = null; }
  if (panel) drawPanel();
});

function setMusic(on) {
  prefs.music = on; save();
  if (on) music.play(); else music.pause();
}
function useMine() {
  prefs.source = "mine"; save();
  music.setSource("mine");
  if (!music.state.playing) setMusic(true);
}

// Sound can only start after a click or a key press. When the music was on
// last time, the first one anywhere starts it again (unless it is on the
// Bridge itself, which handles it).
function resumeOnGesture() {
  const go = e => {
    if ((panel && panel.contains(e.target)) || bridgeBtn.contains(e.target)) return;
    off();
    if (isCockpit() && prefs.music) music.play();
  };
  const off = () => { removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true); };
  addEventListener("pointerdown", go, true);
  addEventListener("keydown", go, true);
}

// ---------------------------------------------------------------- loading music
let busy = null;      // what the loader is doing, shown in the panel
const filePick = h("input", { type: "file", accept: "audio/*,.mp3,.ogg,.oga,.opus,.wav,.flac,.m4a,.aac", multiple: true, hidden: true });
const folderPick = h("input", { type: "file", multiple: true, hidden: true, webkitdirectory: true });
for (const input of [filePick, folderPick]) {
  input.addEventListener("change", () => { const files = [...input.files]; input.value = ""; addFiles(files); });
}

async function addFiles(files) {
  if (!files.length || busy) return;
  busy = "Reading…";
  if (panel) drawPanel();
  try {
    const { added, skipped } = await music.addFiles(files, (i, n) => { busy = `Keeping ${i} of ${n} tracks…`; if (panel) drawLoader(); });
    busy = null;
    if (!added) { toast("None of those files is audio. Choose MP3, OGG, Opus, WAV, FLAC or M4A files.", "warn"); return; }
    toast(`Added ${added} track${added > 1 ? "s" : ""}${skipped ? `; ${skipped} other file${skipped > 1 ? "s were" : " was"} left out` : ""}.`, "ok");
    useMine();
  } catch (e) {
    busy = null;
    toast(/quota/i.test(String(e && e.name)) ? "There is not enough room to keep those files. Free some disk space or pick fewer files." : `Could not keep those files: ${e && e.message ? e.message : e}`, "warn");
  }
  if (panel) drawPanel();
}

async function useFolder(how) {
  busy = how === "steam" ? "Looking in your Steam libraries…" : "Waiting for a folder…";
  if (panel) drawPanel();
  const res = await music.useFolder(how);
  busy = null;
  if (res && res.error) toast(res.error, "warn");
  else if (res && !res.canceled) {
    toast(`Playing ${res.tracks.length} tracks from ${res.game || res.folder}. They stay where they are on your computer.`, "ok");
    useMine();
  }
  if (panel) drawPanel();
}

// ---------------------------------------------------------------- the Bridge panel
let panel = null, spectrum = null, specRaf = 0, loaderEl = null;

const bridgeBtn = h("button", {
  class: "btn small bridge-btn", "aria-haspopup": "dialog", "aria-expanded": "false",
  title: "Bridge: music and the view outside", onclick: () => (panel ? closePanel() : openPanel()),
}, h("span", { class: "eq", "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", { class: "ck-word" }, "Bridge"));

function openPanel() {
  panel = h("section", { class: "cockpit-panel", role: "dialog", "aria-label": "Bridge: music and view" });
  panel.addEventListener("dragover", e => { e.preventDefault(); panel.classList.add("drop"); });
  panel.addEventListener("dragleave", e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove("drop"); });
  panel.addEventListener("drop", e => { e.preventDefault(); panel.classList.remove("drop"); addFiles([...(e.dataTransfer?.files || [])]); });
  document.body.append(panel, filePick, folderPick);
  bridgeBtn.setAttribute("aria-expanded", "true");
  drawPanel();
  setTimeout(() => { addEventListener("pointerdown", outside, true); addEventListener("keydown", esc, true); });
  panel.querySelector("button")?.focus();
  specRaf = requestAnimationFrame(drawSpectrum);
}
function closePanel() {
  if (!panel) return;
  cancelAnimationFrame(specRaf); specRaf = 0;
  panel.remove(); panel = null;
  bridgeBtn.setAttribute("aria-expanded", "false");
  removeEventListener("pointerdown", outside, true); removeEventListener("keydown", esc, true);
}
const outside = e => { if (panel && !panel.contains(e.target) && !bridgeBtn.contains(e.target)) closePanel(); };
const esc = e => { if (e.key === "Escape") { closePanel(); bridgeBtn.focus(); } };

function drawSpectrum() {
  if (!panel) return;
  specRaf = requestAnimationFrame(drawSpectrum);
  if (!spectrum) return;
  const c = spectrum, g = c.getContext("2d"), w = c.width, ht = c.height, bars = music.bars(24), gap = 3;
  const bw = (w - gap * (bars.length - 1)) / bars.length, on = music.state.playing;
  g.clearRect(0, 0, w, ht);
  bars.forEach((v, i) => {
    const bh = Math.max(2, v * (ht - 2)), x = i * (bw + gap);
    const gr = g.createLinearGradient(0, ht, 0, ht - bh);
    gr.addColorStop(0, on ? "rgba(92,240,168,.85)" : "rgba(120,160,190,.3)"); gr.addColorStop(1, on ? "rgba(70,224,255,1)" : "rgba(120,160,190,.45)");
    g.fillStyle = gr; g.fillRect(x, ht - bh, bw, bh);
  });
}

const pills = (items, current, onPick, label) => h("div", { class: "ck-pills", role: "group", "aria-label": label },
  items.map(([id, text, disabled]) => h("button", { class: "ck-pill" + (id === current ? " on" : ""), "aria-pressed": id === current ? "true" : "false", disabled, "data-k": `${label}-${id}`, onclick: () => onPick(id) }, text)));
const chips = (items, current, onPick, label) => h("div", { class: "ck-chips", role: "group", "aria-label": label },
  items.map(([id, text]) => h("button", { class: "ck-chip" + (id === current ? " on" : ""), "aria-pressed": id === current ? "true" : "false", "data-k": `${label}-${id}`, onclick: () => onPick(id) }, text)));

function drawLoader() {
  if (!loaderEl) return;
  const st = music.state, n = st.tracks.length;
  loaderEl.replaceChildren(...[
    h("p", { class: "muted small" }, busy || (music.desktop
      ? "Play a folder of your own music straight from disk, such as a game soundtrack, or add single files. Nothing is copied or uploaded."
      : "Add your own music: a whole folder (such as a game soundtrack) or single files, or drop them here. They are kept in this browser on this computer and never uploaded.")),
    h("div", { class: "ck-row" },
      music.desktop ? h("button", { class: "btn small", disabled: !!busy, "data-k": "steam", onclick: () => useFolder("steam"), title: "Looks for an installed X3 game in your Steam libraries and plays its soundtrack folder" }, "Find X3 on Steam") : null,
      h("button", { class: "btn small", disabled: !!busy, "data-k": "folder", onclick: () => (music.desktop ? useFolder("pick") : folderPick.click()) }, "Choose a folder…"),
      h("button", { class: "btn small", disabled: !!busy, "data-k": "files", onclick: () => filePick.click() }, "Add files…"),
      n ? h("button", { class: "linklike small", disabled: !!busy, "data-k": "forget", onclick: () => { if (confirm(`Remove your ${n} track${n > 1 ? "s" : ""} from the game? The files on your computer are not touched.`)) music.forget(); } }, "Remove my music") : null),
    n ? h("p", { class: "muted small" }, `${st.folder ? `Folder: ${st.folder}. ` : ""}Clips shorter than 25 seconds are skipped.`) : null,
  ].filter(Boolean));
}

function drawPanel() {
  const st = music.state, n = st.tracks.length, mine = st.source === "mine";
  const was = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const mood = MOODS[st.mood];

  spectrum = h("canvas", { class: "ck-spectrum", width: 312, height: 36, "aria-hidden": "true" });
  const vol = h("input", { type: "range", min: 0, max: 1, step: 0.02, value: st.volume, "data-k": "vol", "aria-label": "Music volume" });
  vol.addEventListener("input", () => { prefs.volume = +vol.value; save(); music.setVolume(+vol.value); });
  const glass = h("input", { type: "range", min: 0.45, max: 0.94, step: 0.01, value: prefs.glass, "data-k": "glass", "aria-label": "How solid the glass panels are" });
  glass.addEventListener("input", () => { prefs.glass = +glass.value; save(); applyLook(); });
  const read = h("input", { type: "range", min: 0.4, max: 0.97, step: 0.01, value: prefs.read, "data-k": "read", "aria-label": "How solid the reading panels are" });
  read.addEventListener("input", () => { prefs.read = +read.value; save(); applyLook(); });
  let list = null;
  if (mine && n) {
    list = h("select", { class: "ck-select", "data-k": "list", "aria-label": "Track" }, st.tracks.map((t, i) => h("option", { value: i }, t.name)));
    list.value = String(st.index);
    list.addEventListener("change", () => music.pick(+list.value));
  }
  loaderEl = h("div", { class: "ck-loader" });

  panel.replaceChildren(
    h("header", { class: "ck-head" },
      h("div", {}, h("p", { class: "eyebrow" }, "Kestrel Freight · Bridge"), h("h3", {}, "Ship systems")),
      h("button", { class: "btn ghost small", "aria-label": "Close the Bridge", onclick: closePanel }, "✕")),

    h("section", { class: "ck-sec" },
      h("div", { class: "ck-row between" },
        h("span", { class: "ck-label" }, "Comms and music"),
        pills([["ambient", "Ship's score"], ["mine", n ? `My music · ${n}` : "My music", !n]], st.source, id => { prefs.source = id; save(); music.setSource(id); }, "source")),
      h("div", { class: "ck-now" },
        h("strong", {}, mine ? (st.current || st.tracks[st.index]?.name || "No track") : mood.name),
        h("span", { class: "muted small" }, mine ? `Track ${st.index + 1} of ${n}${st.shuffle ? " · shuffle" : ""}` : `${mood.note}. Made live by the game; it never repeats.`),
        spectrum),
      h("div", { class: "ck-row" },
        h("button", { class: "btn small", "data-k": "prev", title: mine ? "Previous track" : "Previous mood", "aria-label": mine ? "Previous track" : "Previous mood", onclick: () => { music.prev(); keepMood(); } }, "⏮"),
        h("button", { class: "btn small primary ck-play", "data-k": "play", onclick: () => setMusic(!st.playing) }, st.playing ? "❚❚ Pause" : "▶ Play"),
        h("button", { class: "btn small", "data-k": "next", title: mine ? "Next track" : "Next mood", "aria-label": mine ? "Next track" : "Next mood", onclick: () => { music.next(); keepMood(); } }, "⏭"),
        mine ? h("button", { class: "btn small" + (st.shuffle ? " primary" : ""), "data-k": "shuffle", "aria-pressed": st.shuffle ? "true" : "false", title: "Shuffle", onclick: () => { prefs.shuffle = !st.shuffle; save(); music.setShuffle(prefs.shuffle); } }, "⤮") : null,
        h("label", { class: "ck-vol" }, h("span", { "aria-hidden": "true" }, "🔊"), vol)),
      mine ? list : chips(Object.entries(MOODS).map(([id, m]) => [id, m.name]), st.mood, id => { music.setMood(id); keepMood(); }, "mood"),
      loaderEl),

    h("section", { class: "ck-sec" },
      h("span", { class: "ck-label" }, "View outside"),
      h("div", { class: "ck-field" }, h("span", { class: "muted small" }, "Planet"),
        chips(Object.entries(gpu ? { ...GL_PLANETS, ...PLANETS } : PLANETS).map(([id, p]) => [id, p.name]), gpu || prefs.planet in PLANETS ? prefs.planet : "ochre", id => { prefs.planet = id; save(); if (space) space.setPlanet(id); drawPanel(); }, "planet")),
      h("div", { class: "ck-field" }, h("span", { class: "muted small" }, prefs.graphics === "full" && !gpu ? "Graphics (this browser has no WebGL 2, so the light view is shown)" : "Graphics"),
        pills([["full", "Full (GPU)"], ["light", "Light"]], prefs.graphics, id => { prefs.graphics = id; save(); if (bg) startView(); drawPanel(); }, "graphics")),
      gpu ? h("div", { class: "ck-field" }, h("span", { class: "muted small" }, "Sunlight"),
        pills([["day", "Day side"], ["sunrise", "Sunrise"]], prefs.light, id => { prefs.light = id; save(); if (space && space.setLight) space.setLight(id); drawPanel(); }, "light")) : null,
      h("div", { class: "ck-field" }, h("span", { class: "muted small" }, "Orbit roll"),
        pills([["gentle", "Gentle"], ["cinematic", "Cinematic"], ["hold", "Hold"]], prefs.roll, id => { prefs.roll = id; save(); if (space) space.setRate(ROLL[id]); drawPanel(); }, "roll")),
      h("label", { class: "ck-field row" }, h("span", { class: "muted small" }, "Glass"), h("span", { class: "muted small" }, "Clear"), glass, h("span", { class: "muted small" }, "Solid")),
      h("label", { class: "ck-field row", title: "Theory pages, the topic and career lists, drills and exams" }, h("span", { class: "muted small" }, "Reading panels"), h("span", { class: "muted small" }, "Clear"), read, h("span", { class: "muted small" }, "Solid")),
      h("div", { class: "ck-field row between" }, h("span", { class: "muted small" }, "Canopy frame and flight readout"),
        pills([["on", "Visible"], ["off", "Hidden"]], prefs.canopy ? "on" : "off", id => { prefs.canopy = id === "on"; save(); applyLook(); drawPanel(); }, "canopy"))),
  );
  drawLoader();
  if (was) panel.querySelector(`[data-k="${was}"]`)?.focus();
}
function keepMood() { if (music.state.mood !== prefs.mood) { prefs.mood = music.state.mood; save(); } }

// ---------------------------------------------------------------- top bar
// What the top bar adds in the cockpit: the flight readout and the Bridge button.
export function cockpitExtras() {
  return isCockpit() ? [tele.el, viewBtn, bridgeBtn] : [];
}

// ---------------------------------------------------------------- just the view
// The View button hides every panel (the top bar too) to look outside; a small
// button at the bottom, or Esc, brings them back. Nothing in a lab stops: its
// clock keeps running.
const viewBtn = h("button", {
  class: "btn small view-btn", title: "Hide the panels and look outside (Esc brings them back)",
  "aria-label": "Hide the panels and look outside", onclick: () => setViewing(true),
}, h("span", { "aria-hidden": "true" }, "⛶"), h("span", { class: "ck-word" }, "View"));
const backBtn = h("button", { class: "ck-back", onclick: () => setViewing(false) },
  h("span", { "aria-hidden": "true" }, "▦ "), "Show the panels", h("kbd", {}, "Esc"));
const viewKeys = e => { if (e.key === "Escape") { e.preventDefault(); setViewing(false); } };

function setViewing(on) {
  const root = document.documentElement;
  if (on === root.classList.contains("ck-viewing")) return;
  root.classList.toggle("ck-viewing", on);
  if (on) {
    closePanel();
    if (document.activeElement) document.activeElement.blur();     // keys must not reach a hidden console
    document.body.append(backBtn);
    addEventListener("keydown", viewKeys, true);
    backBtn.focus({ preventScroll: true });
  } else {
    backBtn.remove();
    removeEventListener("keydown", viewKeys, true);
    viewBtn.focus({ preventScroll: true });
  }
}

// The button names the view you would switch to, like the theme button.
export function cockpitButton(redraw) {
  const on = isCockpit();
  return h("button", {
    class: "btn small cockpit-btn", title: on ? "Back to the classic view" : "Cockpit view: glass screens in a ship orbiting a planet, with music",
    "aria-label": on ? "Switch to the classic view" : "Switch to the cockpit view",
    onclick: () => { setCockpit(!on); redraw(); },
  }, h("span", { "aria-hidden": "true" }, on ? "▭" : "◈"), h("span", { class: "ck-word" }, on ? "Classic" : "Cockpit"));
}

function setCockpit(on) {
  window.ccnaSkin.set(on ? "cockpit" : "classic");
  if (on) {
    mount();
    document.documentElement.classList.add("cockpit-boot");
    setTimeout(() => document.documentElement.classList.remove("cockpit-boot"), 1400);
    if (prefs.music) music.play();      // this runs inside the click, so sound may start
  } else unmount();
}

if (isCockpit()) {
  mount();
  if (prefs.music) resumeOnGesture();
}
