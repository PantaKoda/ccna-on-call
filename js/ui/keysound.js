// Typing sounds for the device consoles, made live with the Web Audio API (no
// audio files). The player picks a style from the Keys list on the console;
// the choice is kept per browser, or per desktop install. Off by default.
//
//   soft        a quiet laptop keyboard: a muffled tap, no click
//   space       a starship console: soft tuned blips with a little echo
//   mechanical  a tactile switch with a deep, rounded "thock"
//
// Space, Enter and Backspace each sound a little different, held keys repeat
// more quietly, and every press varies slightly so it never sounds looped.

const KEY = "ccna-on-call-keysound";
export const KEY_SOUNDS = { off: "Off", soft: "Soft", space: "Space", mechanical: "Mechanical" };

let style = "off";
try {
  const saved = localStorage.getItem(KEY);
  style = saved === "on" ? "mechanical" : KEY_SOUNDS[saved] ? saved : "off";    // "on" was saved by the first version
} catch { /* storage unavailable */ }

let ctx = null, out = null, echo = null, noise = null;
const SILENT = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "OS", "Fn", "AltGraph", "ContextMenu", "ScrollLock", "NumLock"]);

function setup() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  // a short, dark stereo echo for the space console
  echo = ctx.createGain(); echo.gain.value = 0.32;
  const d1 = ctx.createDelay(0.5), d2 = ctx.createDelay(0.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), pan1 = ctx.createStereoPanner(), pan2 = ctx.createStereoPanner();
  d1.delayTime.value = 0.11; d2.delayTime.value = 0.17; fb.gain.value = 0.3; lp.type = "lowpass"; lp.frequency.value = 2400;
  pan1.pan.value = -0.5; pan2.pan.value = 0.5;
  echo.connect(lp); lp.connect(d1); lp.connect(d2);
  d1.connect(pan1).connect(out); d2.connect(pan2).connect(out);
  d2.connect(fb).connect(lp);
  const len = Math.round(ctx.sampleRate * 0.15);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

const vary = (x, spread) => x * (1 + (Math.random() * 2 - 1) * spread);

// a burst of filtered noise
function hiss(t, { type = "lowpass", freq, q = 0.7, level, decay }) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; src.playbackRate.value = vary(1, 0.1);
  f.type = type; f.frequency.value = vary(freq, 0.1); f.Q.value = q;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + vary(decay, 0.15));
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.05, decay + 0.03);
}

// a short pitched tone with a falling pitch; `send` adds the echo
function tone(t, { type = "sine", from, to, level, attack = 0.002, decay, send = 0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + decay * 0.8);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(out);
  if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(echo); }
  o.start(t); o.stop(t + decay + 0.02);
}

// the space console's blips are tuned: each key lands on a note of a calm scale
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const note = (key, base) => base * 2 ** (SCALE[[...String(key)].reduce((a, c) => a + c.charCodeAt(0), 0) % SCALE.length] / 12);

const STYLES = {
  soft(kind, t, lv) {
    const big = kind === "space" || kind === "enter";
    hiss(t, { freq: big ? 900 : 1300, level: 0.3 * lv * (big ? 1.2 : 1), decay: big ? 0.045 : 0.03 });
    tone(t, { type: "sine", from: big ? 120 : 160, to: 90, level: 0.18 * lv, decay: 0.04 });
  },
  space(kind, t, lv, key) {
    if (kind === "enter") {                 // a two-note "accepted" chirp
      tone(t, { from: 880, to: 870, level: 0.09 * lv, attack: 0.004, decay: 0.12, send: 0.8 });
      tone(t + 0.07, { from: 1320, to: 1310, level: 0.08 * lv, attack: 0.004, decay: 0.18, send: 0.9 });
    } else if (kind === "back") {           // a falling blip
      tone(t, { from: 900, to: 520, level: 0.08 * lv, attack: 0.003, decay: 0.09, send: 0.5 });
    } else if (kind === "space") {
      tone(t, { type: "triangle", from: 330, to: 300, level: 0.08 * lv, attack: 0.004, decay: 0.1, send: 0.6 });
    } else {
      const f = vary(note(key, 1046.5), 0.004);
      tone(t, { from: f, to: f * 0.985, level: 0.06 * lv, attack: 0.003, decay: 0.07, send: 0.55 });
      hiss(t, { type: "highpass", freq: 6000, level: 0.03 * lv, decay: 0.012 });
    }
  },
  mechanical(kind, t, lv) {
    const big = kind === "space" || kind === "enter";
    // bottoming out: a rounded, low "thock" rather than a click
    hiss(t, { type: "bandpass", freq: big ? 700 : 1000, q: 1.4, level: 0.45 * lv, decay: big ? 0.05 : 0.035 });
    tone(t, { type: "sine", from: big ? 150 : 210, to: big ? 85 : 120, level: 0.32 * lv, decay: big ? 0.08 : 0.06 });
    // the tactile bump, a moment before
    hiss(t, { type: "highpass", freq: 3500, level: 0.06 * lv, decay: 0.008 });
    // and the key springing back up
    if (kind === "enter" || kind === "space") hiss(t + 0.085, { type: "bandpass", freq: 1600, q: 1.2, level: 0.12 * lv, decay: 0.02 });
  },
};

// Plays the sound for one keydown event (does nothing while turned off).
export function keySound(e) {
  if (style === "off" || SILENT.has(e.key) || e.ctrlKey || e.metaKey) return;
  setup();
  const t = ctx.currentTime + 0.002, lv = e.repeat ? 0.45 : 1;
  const kind = e.key === "Enter" ? "enter" : e.key === " " ? "space" : e.key === "Backspace" || e.key === "Delete" ? "back" : "key";
  STYLES[style](kind, t, lv, e.key);
}

export const keySoundStyle = () => style;
export const keySoundOn = () => style !== "off";

export function setKeySound(v) {
  style = v === true ? "mechanical" : KEY_SOUNDS[v] ? v : "off";
  try { localStorage.setItem(KEY, style); } catch { /* storage unavailable */ }
  if (style !== "off") {             // called from the player's choice, so sound may start: play a sample
    setup();
    const t = ctx.currentTime + 0.01;
    ["k", "e", "y", "s"].forEach((k, i) => STYLES[style]("key", t + i * 0.11, 1, k));
  }
}
