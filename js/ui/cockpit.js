// The cockpit view: an optional look for the whole game, in the browser and in
// the desktop app alike. The panels become glass screens in front of a ship's
// canopy; behind them a ringed gas giant, its moon and the stars turn slowly as
// the ship rolls in orbit (space.js). Music comes from the ship's own generated
// score or from files the player chooses (music.js).
//
// It changes only looks and sound: progress, labs and the simulator are the
// same in both views. The choice is kept per browser, or per desktop install.
// js/theme.js sets data-skin="cockpit" before the first paint.

import { h, toast } from "./dom.js";
import { createSpace } from "./space.js";
import { music } from "./music.js";

const KEY = "ccna-on-call-cockpit";
const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const prefs = Object.assign({ music: false, source: "ambient", volume: 0.45, motion: !reduced }, read());
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

function mount() {
  if (bg) return;
  const canvas = h("canvas", { class: "space-canvas" });
  bg = h("div", { class: "cockpit-bg", "aria-hidden": "true" }, canvas, h("div", { class: "cockpit-vignette" }));
  bg.insertAdjacentHTML("beforeend", FRAME_SVG);
  document.body.prepend(bg);
  try { space = createSpace(canvas, { motion: prefs.motion, onTick }); } catch (e) { console.error("space view failed", e); }
}

function unmount() {
  if (space) { space.destroy(); space = null; }
  if (bg) { bg.remove(); bg = null; }
  closePanel();
  music.pause();
}

// ---------------------------------------------------------------- music
music.init({ source: prefs.source, volume: prefs.volume });
music.on(st => {
  musicBtn.classList.toggle("on", st.playing);
  musicBtn.setAttribute("aria-pressed", st.playing ? "true" : "false");
  if (st.error) { toast(st.error, "warn"); st.error = null; }
  if (panel) drawPanel();
});

function setMusic(on) {
  prefs.music = on; save();
  if (on) music.play(); else music.pause();
}

// Sound can only start after a click or a key press. When the music was on
// last time, the first one anywhere starts it again (unless it is on the music
// controls themselves, which handle it).
function resumeOnGesture() {
  const go = e => {
    if (panel && panel.contains(e.target)) return;
    if (musicBtn.contains(e.target)) return;
    off();
    if (isCockpit() && prefs.music) music.play();
  };
  const off = () => { removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true); };
  addEventListener("pointerdown", go, true);
  addEventListener("keydown", go, true);
}

// ---------------------------------------------------------------- ship systems panel
let panel = null;
const picker = h("input", { type: "file", accept: "audio/*,.mp3,.ogg,.oga,.opus,.wav,.flac,.m4a,.aac", multiple: true, hidden: true });
picker.addEventListener("change", async () => {
  const files = [...picker.files];
  picker.value = "";
  if (!files.length) return;
  try {
    const { added, skipped } = await music.addFiles(files);
    if (!added) { toast("None of those files is audio. Choose MP3, OGG, Opus, WAV, FLAC or M4A files.", "warn"); return; }
    toast(`Added ${added} track${added > 1 ? "s" : ""}${skipped ? `; ${skipped} file${skipped > 1 ? "s were" : " was"} not audio and left out` : ""}.`, "ok");
    prefs.source = "mine"; save();
    music.setSource("mine");
    if (!music.state.playing) setMusic(true);
  } catch (e) {
    toast(/quota/i.test(String(e && e.name)) ? "There is not enough room to keep those files. Free some disk space or pick fewer files." : `Could not keep those files: ${e && e.message ? e.message : e}`, "warn");
  }
});

const musicBtn = h("button", {
  class: "btn small music-btn", "aria-pressed": "false", "aria-haspopup": "dialog",
  title: "Music and view settings", onclick: () => (panel ? closePanel() : openPanel()),
}, h("span", { class: "eq", "aria-hidden": "true" }, h("i"), h("i"), h("i")), h("span", { class: "ck-word" }, "Ship"));

function openPanel() {
  panel = h("div", { class: "cockpit-panel", role: "dialog", "aria-label": "Ship systems: music and view" });
  document.body.append(panel, picker);
  drawPanel();
  setTimeout(() => { addEventListener("pointerdown", outside, true); addEventListener("keydown", esc, true); });
  panel.querySelector("button")?.focus();
}
function closePanel() {
  if (!panel) return;
  panel.remove(); panel = null;
  removeEventListener("pointerdown", outside, true); removeEventListener("keydown", esc, true);
}
const outside = e => { if (panel && !panel.contains(e.target) && !musicBtn.contains(e.target)) closePanel(); };
const esc = e => { if (e.key === "Escape") { closePanel(); musicBtn.focus(); } };

function drawPanel() {
  const st = music.state, n = st.tracks.length, focused = document.activeElement && panel.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const radio = (id, label, note, disabled) => h("label", { class: "ck-radio" + (disabled ? " off" : "") },
    h("input", { type: "radio", name: "ck-source", value: id, checked: st.source === id, disabled, "data-k": "src-" + id,
      onchange: () => { prefs.source = id; save(); music.setSource(id); } }),
    h("span", {}, h("strong", {}, label), h("span", { class: "muted small" }, note)));
  const vol = h("input", { type: "range", min: 0, max: 1, step: 0.05, value: st.volume, "data-k": "vol", "aria-label": "Music volume" });
  vol.addEventListener("input", () => { prefs.volume = +vol.value; save(); music.setVolume(+vol.value); });
  const motion = h("input", { type: "checkbox", checked: prefs.motion, "data-k": "motion" });
  motion.addEventListener("change", () => { prefs.motion = motion.checked; save(); if (space) space.setMotion(prefs.motion); });

  panel.replaceChildren(
    h("p", { class: "eyebrow" }, "Ship systems"),
    h("h3", {}, "Music"),
    h("div", { class: "ck-row" },
      h("button", { class: "btn small primary", "data-k": "play", onclick: () => setMusic(!st.playing) }, st.playing ? "❚❚ Pause" : "▶ Play"),
      st.source === "mine" && n > 1 ? h("button", { class: "btn small", "data-k": "next", onclick: () => music.next() }, "Next track ⏭") : null,
      h("span", { class: "muted small ck-now" }, st.playing ? (st.source === "mine" ? `Playing: ${st.current || "…"}` : "Playing the ship's score") : "Off")),
    h("div", { class: "ck-sources", role: "radiogroup", "aria-label": "Music source" },
      radio("ambient", "Ship's own score", "Made live by the game: slow chords, the engine's hum, the odd sonar ping. It never repeats."),
      radio("mine", n ? `My music · ${n} track${n > 1 ? "s" : ""}` : "My music", n ? "Your files, in order, then round again." : "Choose some audio files first.", !n)),
    h("div", { class: "ck-row" },
      h("button", { class: "btn small", "data-k": "pick", onclick: () => picker.click() }, n ? "Add music files…" : "Choose music files…"),
      n ? h("button", { class: "linklike small", "data-k": "forget", onclick: () => { if (confirm(`Remove your ${n} track${n > 1 ? "s" : ""} from the game? The files on your computer are not touched.`)) music.forget(); } }, "Remove my music") : null),
    h("p", { class: "muted small" }, "Files you choose stay on this computer, kept with the game's saved data. They are never uploaded."),
    h("label", { class: "ck-vol" }, h("span", {}, "Volume"), vol),
    h("h3", {}, "View"),
    h("label", { class: "ck-check" }, motion, h("span", {}, "Orbit motion", h("span", { class: "muted small" }, "The view rolls slowly as the ship orbits. Turn off to hold still."))));
  if (focused) panel.querySelector(`[data-k="${focused}"]`)?.focus();
}

// ---------------------------------------------------------------- top bar
// What the top bar adds in the cockpit: the flight readout and the Ship button.
export function cockpitExtras() {
  return isCockpit() ? [tele.el, musicBtn] : [];
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
