// Music for the cockpit view, from one of two sources:
//   - "ambient": the ship's own score, generated live with the Web Audio API in
//     one of three moods. Slow pad chords that never quite repeat, a low drone,
//     the engine's hum, soft bells and now and then a sonar ping. No audio files.
//   - "mine": the player's own music. Files they choose are kept in IndexedDB in
//     this browser (or the desktop app's data folder), so they stay on this
//     computer. The desktop app can also play a whole folder straight from disk
//     (a game soundtrack, say) through window.ccnaDesktop.music. Nothing is
//     uploaded, and no music ships with the game.
//
// Browsers only start sound after the player has clicked or pressed a key, so
// play() must first be called from one of those events.

const DB = "ccna-on-call-music", STORE = "tracks";
const AUDIO_EXT = /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|webm)$/i;
const SHORT = 25;          // seconds: shorter files (jingles, sound cues) are skipped
const desktop = window.ccnaDesktop && window.ccnaDesktop.music ? window.ccnaDesktop.music : null;

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
const savedTracks = () => tx("readonly", s => s.getAll());

// ---------------------------------------------------------------- the ship's own score
const mtof = m => 440 * 2 ** ((m - 69) / 12);

export const MOODS = {
  orbit: {
    name: "Deep orbit", note: "Slow minor chords over the engine's hum",
    // D dorian, with a borrowed B flat: Dm9, Bbmaj9, Fmaj9, G6/9, Cmaj9, Am11
    chords: [[38, 50, 53, 57, 64], [34, 50, 53, 57, 60], [41, 48, 52, 55, 62], [43, 50, 55, 59, 64], [36, 48, 55, 59, 62], [45, 52, 55, 60, 62]],
    bells: [74, 76, 77, 81, 83, 86, 88, 89, 93], len: 14, cutoff: 1000, bellGap: [4, 11], ping: [30, 70], hum: 0.07, drone: [38, 45],
  },
  nebula: {
    name: "Nebula drift", note: "Bright and weightless, more chimes",
    // F lydian: Fmaj7#11, G/F, Am9, Cmaj9, Em7
    chords: [[41, 53, 57, 64, 71], [41, 55, 59, 62, 67], [45, 52, 55, 59, 64], [36, 52, 55, 59, 62], [40, 52, 55, 59, 62]],
    bells: [77, 79, 81, 83, 84, 88, 91, 93, 95], len: 18, cutoff: 1500, bellGap: [2.5, 7], ping: [70, 120], hum: 0.045, drone: [41, 48],
  },
  redline: {
    name: "Red sector", note: "Darker, tense, frequent sonar sweeps",
    // C minor: Cm9, Abmaj7, Fm9, G7sus, Ebmaj7
    chords: [[36, 48, 51, 55, 62], [32, 48, 51, 55, 60], [41, 48, 51, 56, 60], [43, 50, 53, 55, 60], [39, 50, 51, 55, 58]],
    bells: [60, 63, 65, 67, 70, 72, 75], len: 10, cutoff: 700, bellGap: [6, 14], ping: [12, 26], hum: 0.1, drone: [36, 43],
  },
};

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
  constructor(ctx, dest, volume, mood) {
    this.ctx = ctx; this.mood = mood; this.timers = []; this.sources = []; this.running = true;
    const out = this.out = ctx.createGain();
    out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3;
    out.connect(comp).connect(dest);
    this.tail = [out, comp];
    this.verb = ctx.createConvolver(); this.verb.buffer = impulse(ctx, 6.5, 2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.75; this.verb.connect(wet).connect(out);
    this.dry = ctx.createGain(); this.dry.gain.value = 0.6; this.dry.connect(out);
    this.tail.push(this.verb, wet, this.dry);

    this.drone(); this.hum(); this.pad();
    this.nextChord = ctx.currentTime + 0.1; this.lastChord = -1;
    this.chordLoop(); this.bellLoop(2 + Math.random() * 3); this.pingLoop(this.between(mood.ping) / 2);
    this.setVolume(volume, 4);
  }

  between([a, b]) { return a + Math.random() * (b - a); }
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
    const [a, b] = this.mood.drone;
    for (const [m, det] of [[a, -4], [a, 5], [b, 2]]) { const o = this.osc("sine", mtof(m), det); o.connect(g); o.start(); }
    this.lfo(0.05, 0.02, g.gain);
    this.route(g, 0.7, 0.3);
  }

  hum() {
    const src = this.ctx.createBufferSource();
    src.buffer = brownNoise(this.ctx, 6); src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 170; lp.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = this.mood.hum;
    src.connect(lp).connect(g); this.lfo(0.07, this.mood.hum / 3, g.gain);
    this.route(g, 0.8, 0.15);
    src.start(); this.sources.push(src);
  }

  pad() {
    const f = this.padFilter = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = this.mood.cutoff; f.Q.value = 0.7;
    this.lfo(0.025, this.mood.cutoff * 0.45, f.frequency);
    const g = this.ctx.createGain(); g.gain.value = 0.22;
    f.connect(g); this.route(g, 0.45, 0.75);
  }

  chord(notes, t0) {
    const ctx = this.ctx, end = t0 + this.mood.len, gone = end + 7;
    notes.forEach((m, i) => {
      const g = ctx.createGain(), amp = i === 0 ? 0.06 : 0.04;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp, t0 + Math.min(5, this.mood.len / 2));
      g.gain.setValueAtTime(amp, end); g.gain.linearRampToValueAtTime(0, gone);
      g.connect(this.padFilter);
      for (const det of [-7, 6]) { const o = this.osc("sawtooth", mtof(m), det); o.connect(g); o.start(t0); o.stop(gone + 0.1); }
      if (i === 0) { const o = this.osc("sine", mtof(m - 12)); o.connect(g); o.start(t0); o.stop(gone + 0.1); }
    });
  }

  chordLoop() {
    const ctx = this.ctx, { chords, len } = this.mood;
    while (this.nextChord < ctx.currentTime + len * 2) {   // keep two chords scheduled ahead
      let i;
      do i = Math.floor(Math.random() * chords.length); while (i === this.lastChord);
      if (this.lastChord === -1) i = 0;
      this.lastChord = i;
      this.chord(chords[i], Math.max(this.nextChord, ctx.currentTime + 0.05));
      this.nextChord += len;
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
      const { bells } = this.mood, t = this.ctx.currentTime + 0.05, n = Math.random() < 0.3 ? 3 : 1;
      let k = Math.floor(Math.random() * bells.length);
      for (let i = 0; i < n; i++) { this.bell(bells[k], t + i * 0.45, 0.045 - i * 0.008); k = Math.max(0, Math.min(bells.length - 1, k + (Math.random() < 0.5 ? -2 : 2))); }
      this.bellLoop(this.between(this.mood.bellGap));
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
      this.pingLoop(this.between(this.mood.ping));
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
const state = {
  playing: false, source: "ambient", mood: "orbit", volume: 0.5, shuffle: false,
  tracks: [],          // { name, blob } saved here, or { name, url } from the desktop folder
  folder: null,        // name of the desktop music folder, if one is chosen
  index: 0, current: null, error: null,
};
const emit = () => listeners.forEach(f => f(state));
let ctx = null, analyser = null, freq = null, ambient = null, url = null, failures = 0, shorts = 0;
const history = [];
const audio = new Audio();
audio.preload = "auto";

// one AudioContext for both sources, with an analyser for the Bridge's spectrum
function audioCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.8;
    analyser.connect(ctx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
    try { ctx.createMediaElementSource(audio).connect(analyser); } catch { /* plays directly, without the spectrum */ }
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

audio.addEventListener("ended", () => { failures = 0; step(1); });
audio.addEventListener("loadedmetadata", () => {
  // game soundtracks hold short jingles and sound cues among the music
  if (state.source === "mine" && state.tracks.length > 1 && audio.duration < SHORT && shorts < state.tracks.length) { shorts++; step(1); }
});
audio.addEventListener("playing", () => { failures = 0; shorts = 0; state.error = null; emit(); });
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
  if (url) { URL.revokeObjectURL(url); url = null; }
  if (t.blob) { url = URL.createObjectURL(t.blob); audio.src = url; } else audio.src = t.url;
  audio.volume = state.volume;
  state.current = t.name;
  audio.play().catch(() => { /* reported by the error event, or blocked until the next click */ });
  emit();
}

function step(dir) {
  const n = state.tracks.length;
  if (!n) return;
  if (dir > 0) {
    history.push(state.index);
    if (history.length > 200) history.shift();
    if (state.shuffle && n > 1) { let i; do i = Math.floor(Math.random() * n); while (i === state.index); state.index = i; }
    else state.index = (state.index + 1) % n;
  } else {
    state.index = history.length ? history.pop() : (state.index - 1 + n) % n;
  }
  if (state.playing && state.source === "mine") playTrack(); else { state.current = state.tracks[state.index].name; emit(); }
}

function stopAll() {
  if (ambient) { ambient.stop(); ambient = null; }
  audio.pause();
  state.playing = false;
  emit();
}

function startAmbient() {
  audioCtx();
  ambient = new Ambient(ctx, analyser, state.volume, MOODS[state.mood] || MOODS.orbit);
}

async function loadTracks() {
  let saved = [], folder = null;
  try { saved = await savedTracks(); } catch { /* storage unavailable */ }
  if (desktop) { try { folder = await desktop.get(); } catch { /* bridge unavailable */ } }
  state.folder = folder && folder.folder;
  state.tracks = [...(folder ? folder.tracks : []), ...saved];
  if (state.index >= state.tracks.length) state.index = 0;
  return folder;
}

export const music = {
  state,
  desktop: !!desktop,
  on(f) { listeners.add(f); return () => listeners.delete(f); },

  async init({ source = "ambient", volume = 0.5, mood = "orbit", shuffle = false } = {}) {
    state.volume = volume; state.mood = MOODS[mood] ? mood : "orbit"; state.shuffle = !!shuffle;
    await loadTracks();
    state.source = source === "mine" && state.tracks.length ? "mine" : "ambient";
    emit();
  },

  play() {
    if (state.playing) return;
    state.playing = true; state.error = null;
    if (state.source === "mine" && state.tracks.length) { audioCtx(); playTrack(); }
    else { state.source = "ambient"; state.current = null; startAmbient(); emit(); }
  },
  pause: stopAll,
  toggle() { if (state.playing) stopAll(); else music.play(); },

  // in the score, next and previous change the mood
  next() { if (state.source === "mine") step(1); else music.setMood(cycle(1)); },
  prev() {
    if (state.source !== "mine") return music.setMood(cycle(-1));
    if (state.playing && audio.currentTime > 4) { audio.currentTime = 0; return; }
    step(-1);
  },
  pick(i) { if (!state.tracks[i]) return; history.push(state.index); state.index = i; if (state.playing && state.source === "mine") playTrack(); else emit(); },
  setShuffle(on) { state.shuffle = !!on; emit(); },

  setMood(id) {
    if (!MOODS[id]) return;
    state.mood = id;
    if (state.playing && state.source === "ambient") { if (ambient) ambient.stop(); startAmbient(); }
    emit();
  },

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

  // 0..1 levels for n bars of a spectrum, low to high
  bars(n) {
    const out = new Array(n).fill(0);
    if (!analyser || !state.playing) return out;
    analyser.getByteFrequencyData(freq);
    const max = freq.length * 0.4;          // up to about 9 kHz, where the music is
    for (let i = 0; i < n; i++) {
      const a = Math.floor((i / n) ** 1.4 * max), b = Math.max(a + 1, Math.floor(((i + 1) / n) ** 1.4 * max));
      let s = 0;
      for (let k = a; k < b; k++) s += freq[k];
      out[i] = Math.min(1, (s / (b - a) / 255) * (1 + i / n));   // lift the quieter highs a little
    }
    return out;
  },

  // add audio files the player picked (or dropped, or a folder's worth);
  // returns how many were kept and how many were not audio
  async addFiles(files, onProgress) {
    const all = [...files];
    const keep = all.filter(f => (f.type || "").startsWith("audio/") || AUDIO_EXT.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (let i = 0; i < keep.length; i++) {
      const f = keep[i];
      await tx("readwrite", s => s.add({ name: f.name.replace(/\.[^.]+$/, ""), blob: f }));
      if (onProgress) onProgress(i + 1, keep.length);
    }
    await loadTracks();
    emit();
    return { added: keep.length, skipped: all.length - keep.length };
  },

  // desktop app only: play a folder from disk, chosen or found on Steam
  async useFolder(how) {
    if (!desktop) return null;
    const res = how === "steam" ? await desktop.findSteam() : await desktop.pickFolder();
    await loadTracks();
    emit();
    return res;
  },

  async forget() {
    if (state.source === "mine") { stopAll(); state.source = "ambient"; }
    await tx("readwrite", s => s.clear());
    if (desktop) { try { await desktop.clear(); } catch { /* bridge unavailable */ } }
    if (url) { URL.revokeObjectURL(url); url = null; }
    audio.removeAttribute("src");
    history.length = 0;
    state.index = 0; state.current = null;
    await loadTracks();
    emit();
  },
};

function cycle(dir) {
  const ids = Object.keys(MOODS), i = ids.indexOf(state.mood);
  return ids[(i + dir + ids.length) % ids.length];
}
