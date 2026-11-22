// Typing sounds for the device consoles: a mechanical keyboard, made live with
// the Web Audio API (a short burst of filtered noise for the click and a low
// knock for the key bottoming out). No audio files. Off until the player turns
// it on with the Keys button on the console; the choice is kept per browser,
// or per desktop install.
//
// Space, Enter and Backspace each sound a little different, held keys repeat
// more quietly, and every press varies slightly so it never sounds looped.

const KEY = "ccna-on-call-keysound";
let on = false;
try { on = localStorage.getItem(KEY) === "on"; } catch { /* storage unavailable */ }

let ctx = null, out = null, noise = null;
const SILENT = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "OS", "Fn", "AltGraph", "ContextMenu", "ScrollLock", "NumLock"]);

function setup() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  const len = Math.round(ctx.sampleRate * 0.12);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

const vary = (x, spread) => x * (1 + (Math.random() * 2 - 1) * spread);

// one keystroke: `click` is the bright top, `knock` the body; t is when
function stroke({ click = 2600, knock = 150, level = 1, decay = 0.035 }, t) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = vary(1, 0.1);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = vary(click, 0.12); bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.55 * level, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + vary(decay, 0.15));
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * 0.05, 0.07);

  const o = ctx.createOscillator(), og = ctx.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(vary(knock, 0.08), t);
  o.frequency.exponentialRampToValueAtTime(knock * 0.55, t + 0.05);
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(0.35 * level, t + 0.002);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(og).connect(out);
  o.start(t); o.stop(t + 0.08);
}

// Plays the sound for one keydown event (does nothing while turned off).
export function keySound(e) {
  if (!on || SILENT.has(e.key) || e.ctrlKey || e.metaKey) return;
  setup();
  const t = ctx.currentTime + 0.002, level = e.repeat ? 0.45 : 1;
  if (e.key === " ") stroke({ click: 1500, knock: 95, level: level * 1.1, decay: 0.05 }, t);
  else if (e.key === "Enter") {
    stroke({ click: 1900, knock: 110, level: level * 1.25, decay: 0.05 }, t);
    stroke({ click: 3200, knock: 160, level: level * 0.35, decay: 0.025 }, t + 0.075);   // the key coming back up
  } else if (e.key === "Backspace" || e.key === "Delete") stroke({ click: 3400, knock: 175, level: level * 0.9 }, t);
  else stroke({ click: 2600, knock: 150, level }, t);
}

export const keySoundOn = () => on;

export function setKeySound(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
  if (on) { setup(); keySound({ key: "a" }); }    // called from a click, so sound may start; play one as a sample
}
