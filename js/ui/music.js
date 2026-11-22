// Music for the cockpit view, from one of two sources:
//   - "ambient": the ship's own score, generated live with the Web Audio API:
//     slow pad chords that never quite repeat, a low drone, the engine's hum,
//     soft bells and now and then a sonar ping. No audio files at all.
//   - "mine": audio files the player chooses. They are kept in IndexedDB in this
//     browser (or in the desktop app's data folder), so they stay on this
//     computer and are still there next time. Nothing is uploaded, and no music
//     ships with the game.
//
// Browsers only start sound after the player has clicked or pressed a key, so
// play() must first be called from one of those events.

const DB = "ccna-on-call-music", STORE = "tracks";
const AUDIO_EXT = /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|webm)$/i;

// ---------------------------------------------------------------- saved tracks
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
    const req = fn(s);
    t.oncomplete = () => { db.close(); resolve(req && req.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error); };
  });
}
const listTracks = () => tx("readonly", s => s.getAll());

// ---------------------------------------------------------------- the ship's own score
const mtof = m => 440 * 2 ** ((m - 69) / 12);
// D dorian, with a borrowed B flat chord for colour: Dm9, Bbmaj9, Fmaj9, G6/9, Cmaj9, Am11
const CHORDS = [[38, 50, 53, 57, 64], [34, 50, 53, 57, 60], [41, 48, 52, 55, 62], [43, 50, 55, 59, 64], [36, 48, 55, 59, 62], [45, 52, 55, 60, 62]];
const BELLS = [74, 76, 77, 81, 83, 86, 88, 89, 93];
const CHORD_LEN = 14;

function impulse(ctx, seconds, decay) {
  const len = Math.round(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

function brownNoise(ctx, seconds) {
  const len = Math.round(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  return buf;
}

// One run of the score. stop() fades it out and frees everything; a new
// Ambient is made for the next start.
class Ambient {
  constructor(ctx, volume) {
    this.ctx = ctx; this.timers = []; this.sources = []; this.running = true;
    const out = this.out = ctx.createGain();
    out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3;
    out.connect(comp).connect(ctx.destination);
    this.tail = [out, comp];
    this.verb = ctx.createConvolver(); this.verb.buffer = impulse(ctx, 6.5, 2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.75; this.verb.connect(wet).connect(out);
    this.dry = ctx.createGain(); this.dry.gain.value = 0.6; this.dry.connect(out);
    this.tail.push(this.verb, wet, this.dry);

    this.drone(); this.hum(); this.pad();
    this.nextChord = ctx.currentTime + 0.1; this.lastChord = -1;
    this.chordLoop(); this.bellLoop(2 + Math.random() * 3); this.pingLoop(18 + Math.random() * 20);
    this.setVolume(volume, 4);
  }

  // send a node to the dry and reverb buses
  route(node, dry, wet) {
    const a = this.ctx.createGain(), b = this.ctx.createGain();
    a.gain.value = dry; b.gain.value = wet;
    node.connect(a).connect(this.dry); node.connect(b).connect(this.verb);
  }
  osc(type, freq, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    o.onended = () => { const i = this.sources.indexOf(o); if (i >= 0) this.sources.splice(i, 1); o.disconnect(); };
    this.sources.push(o);
    return o;
  }
  lfo(freq, depth, param) {
    const o = this.osc("sine", freq), g = this.ctx.createGain();
    g.gain.value = depth; o.connect(g).connect(param); o.start();
  }
  later(fn, seconds) { this.timers.push(setTimeout(() => { if (this.running) fn(); }, Math.max(0, seconds * 1000))); }

  drone() {
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    for (const [m, det] of [[38, -4], [38, 5], [45, 2]]) { const o = this.osc("sine", mtof(m), det); o.connect(g); o.start(); }
    this.lfo(0.05, 0.02, g.gain);
    this.route(g, 0.7, 0.3);
  }

  hum() {
    const src = this.ctx.createBufferSource();
    src.buffer = brownNoise(this.ctx, 6); src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 170; lp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.07;
    src.connect(lp).connect(g); this.lfo(0.07, 0.025, g.gain);
    this.route(g, 0.8, 0.15);
    src.start(); this.sources.push(src);
  }

  pad() {
    const f = this.padFilter = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 1000; f.Q.value = 0.7;
    this.lfo(0.025, 450, f.frequency);
    const g = this.ctx.createGain(); g.gain.value = 0.22;
    f.connect(g); this.route(g, 0.45, 0.75);
  }

  chord(notes, t0) {
    const ctx = this.ctx, end = t0 + CHORD_LEN, gone = end + 7;
    notes.forEach((m, i) => {
      const g = ctx.createGain(), amp = i === 0 ? 0.06 : 0.04;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp, t0 + 5);
      g.gain.setValueAtTime(amp, end); g.gain.linearRampToValueAtTime(0, gone);
      g.connect(this.padFilter);
      for (const det of [-7, 6]) { const o = this.osc("sawtooth", mtof(m), det); o.connect(g); o.start(t0); o.stop(gone + 0.1); }
      if (i === 0) { const o = this.osc("sine", mtof(m - 12)); o.connect(g); o.start(t0); o.stop(gone + 0.1); }
    });
  }

  chordLoop() {
    const ctx = this.ctx;
    while (this.nextChord < ctx.currentTime + CHORD_LEN * 2) {   // keep two chords scheduled ahead
      let i;
      do i = Math.floor(Math.random() * CHORDS.length); while (i === this.lastChord);
      if (this.lastChord === -1) i = 0;
      this.lastChord = i;
      this.chord(CHORDS[i], Math.max(this.nextChord, ctx.currentTime + 0.05));
      this.nextChord += CHORD_LEN;
    }
    this.later(() => this.chordLoop(), 4);
  }

  bell(m, t, amp = 0.05) {
    const ctx = this.ctx, g = ctx.createGain(), pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    const a = this.osc("sine", mtof(m)), b = this.osc("sine", mtof(m) * 2.76), bg = ctx.createGain();
    bg.gain.value = 0.25; a.connect(g); b.connect(bg).connect(g);
    g.connect(pan); this.route(pan, 0.25, 0.9);
    a.start(t); b.start(t); a.stop(t + 4.6); b.stop(t + 4.6);
  }

  bellLoop(wait) {
    this.later(() => {
      const t = this.ctx.currentTime + 0.05, n = Math.random() < 0.3 ? 3 : 1;
      let k = Math.floor(Math.random() * BELLS.length);
      for (let i = 0; i < n; i++) { this.bell(BELLS[k], t + i * 0.45, 0.045 - i * 0.008); k = Math.max(0, Math.min(BELLS.length - 1, k + (Math.random() < 0.5 ? -2 : 2))); }
      this.bellLoop(4 + Math.random() * 7);
    }, wait);
  }

  // a sonar ping with a fading echo
  pingLoop(wait) {
    this.later(() => {
      const ctx = this.ctx, t = ctx.currentTime + 0.05;
      const o = this.osc("sine", 1318.5), g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      const delay = ctx.createDelay(1); delay.delayTime.value = 0.42;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      o.connect(g); g.connect(delay); delay.connect(fb).connect(delay);
      this.route(g, 0.5, 0.6); this.route(delay, 0.25, 0.6);
      o.start(t); o.stop(t + 1.5);
      this.pingLoop(30 + Math.random() * 40);
    }, wait);
  }

  setVolume(v, over = 0.3) {
    const g = this.out.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(v * 0.9, now + over);
  }

  stop() {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.setVolume(0, 1.5);
    setTimeout(() => {
      for (const s of this.sources) { try { s.stop(); } catch { /* not started or already stopped */ } try { s.disconnect(); } catch { /* already gone */ } }
      for (const n of this.tail) { try { n.disconnect(); } catch { /* already gone */ } }
    }, 1700);
  }
}

// ---------------------------------------------------------------- the player
const listeners = new Set();
const state = { playing: false, source: "ambient", volume: 0.5, tracks: [], index: 0, current: null, error: null };
const emit = () => listeners.forEach(f => f(state));
let ctx = null, ambient = null, url = null, failures = 0;
const audio = new Audio();
audio.preload = "auto";
audio.addEventListener("ended", () => { failures = 0; step(1); });
audio.addEventListener("playing", () => { failures = 0; state.error = null; emit(); });
audio.addEventListener("error", () => {
  if (!state.playing || state.source !== "mine") return;
  const t = state.tracks[state.index];
  state.error = `Could not play ${t ? t.name : "this file"}: its format is not supported here. MP3, OGG, Opus, WAV, FLAC and M4A work.`;
  emit();
  if (++failures < state.tracks.length) setTimeout(() => step(1), 800); else stopAll();
});

function playTrack() {
  const t = state.tracks[state.index];
  if (!t) return;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(t.blob);
  audio.src = url;
  audio.volume = state.volume;
  state.current = t.name;
  audio.play().catch(() => { /* reported by the error event, or blocked until the next click */ });
  emit();
}

function step(dir) {
  if (!state.tracks.length) return;
  state.index = (state.index + dir + state.tracks.length) % state.tracks.length;
  if (state.playing && state.source === "mine") playTrack(); else emit();
}

function stopAll() {
  if (ambient) { ambient.stop(); ambient = null; }
  audio.pause();
  state.playing = false;
  emit();
}

export const music = {
  state,
  on(f) { listeners.add(f); return () => listeners.delete(f); },

  async init({ source = "ambient", volume = 0.5 } = {}) {
    state.volume = volume;
    try { state.tracks = await listTracks(); } catch { state.tracks = []; }
    state.source = source === "mine" && state.tracks.length ? "mine" : "ambient";
    emit();
  },

  play() {
    if (state.playing) return;
    state.playing = true; state.error = null;
    if (state.source === "mine" && state.tracks.length) playTrack();
    else {
      state.source = "ambient"; state.current = null;
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume();
      ambient = new Ambient(ctx, state.volume);
      emit();
    }
  },
  pause: stopAll,
  toggle() { if (state.playing) stopAll(); else music.play(); },
  next() { step(1); },

  setSource(s) {
    if (s === state.source) return;
    const was = state.playing;
    if (was) stopAll();
    state.source = s;
    if (was) music.play(); else emit();
  },

  setVolume(v) {
    state.volume = v;
    audio.volume = v;
    if (ambient) ambient.setVolume(v);
    emit();
  },

  // add audio files the player picked; returns how many were kept
  async addFiles(files) {
    const keep = [...files].filter(f => (f.type || "").startsWith("audio/") || AUDIO_EXT.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const f of keep) await tx("readwrite", s => s.add({ name: f.name.replace(/\.[^.]+$/, ""), blob: f }));
    state.tracks = await listTracks();
    return { added: keep.length, skipped: files.length - keep.length };
  },

  async forget() {
    if (state.source === "mine") { stopAll(); state.source = "ambient"; }
    await tx("readwrite", s => s.clear());
    if (url) { URL.revokeObjectURL(url); url = null; }
    audio.removeAttribute("src");
    state.tracks = []; state.index = 0; state.current = null;
    emit();
  },
};
