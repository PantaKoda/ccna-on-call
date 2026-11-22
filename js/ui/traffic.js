// Space traffic in the cockpit's GPU view (spacegl.js): a trading station
// turning slowly on its axis, ships arriving at its dock and leaving it (with a
// flash as they jump away), and a few more passing far off. The station and
// ships are sprites rendered in Blender (tools/blender/station_sprites.py);
// engine glow, trails and blinking lights are drawn here.
//
// Everything lives in the same world as the planet: the camera is at the
// origin looking down -z, and the ship's roll turns it all together.

const STATION = {
  az: 120, off: 20, dist: 3.3,     // where it hangs: degrees round and away from the view's centre, and how far
  size: 0.9,                       // world width of one atlas cell
  frames: 24, cols: 6, spin: 240,  // seconds per turn
  dock: [-0.02, 0.115],            // the docking bay, as a fraction of the cell from its centre (x right, y up)
};
const SHIPS = [
  { row: 0, len: 0.18, speed: 0.045, weight: 3 },   // hauler
  { row: 1, len: 0.11, speed: 0.075, weight: 3 },   // shuttle
  { row: 2, len: 0.09, speed: 0.11, weight: 2 },    // courier
];
const SHIP_ROWS = 3, SHIP_ASPECT = 192 / 512, SHIP_FILL = 0.86;   // a ship spans about 86% of its cell's width
const MAX_DOCKING = 4, MAX_PASSING = 3;

// ---------------------------------------------------------------- vectors
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => mul(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
const bez = (p, t) => { const u = 1 - t; return add(add(mul(p[0], u * u * u), mul(p[1], 3 * u * u * t)), add(mul(p[2], 3 * u * t * t), mul(p[3], t * t * t))); };
const deg = d => (d * Math.PI) / 180;

// ---------------------------------------------------------------- the simulation
export function createTrafficSim({ planet, radius, seed = 5 }) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = arr => { const total = arr.reduce((a, x) => a + x.weight, 0); let r = rnd() * total; for (const x of arr) if ((r -= x.weight) < 0) return x; return arr[0]; };

  const az = deg(STATION.az), off = deg(STATION.off);
  const station = [Math.sin(off) * Math.cos(az) * STATION.dist, Math.sin(off) * Math.sin(az) * STATION.dist, -Math.cos(off) * STATION.dist];
  // the sprite's own axes in the world: up is the world's up, flattened onto the view
  const fwd = norm(station), up = norm(sub([0, 1, 0], mul(fwd, dot([0, 1, 0], fwd)))), right = cross(up, mul(fwd, -1));
  const dock = add(station, add(mul(right, STATION.dock[0] * STATION.size), mul(up, STATION.dock[1] * STATION.size)));
  const axis = up;                       // ships come and go along the spindle

  const ships = [], flashes = [];
  let nextDock = 2, nextPass = 4;

  const randomDir = () => { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), r * Math.sin(a), z]; };
  // somewhere out in the open, in front of the camera and not inside the planet
  function farPoint(from, reach) {
    for (let i = 0; i < 20; i++) {
      const p = add(from, mul(randomDir(), reach));
      if (p[2] < -1.2 && len(sub(p, planet)) > radius * 1.25) return p;
    }
    return add(from, [reach * 0.6, reach * 0.3, -reach * 0.5]);
  }

  // a route is usable when it stays clear of the planet and in front of the camera
  const clear = path => {
    for (let i = 0; i <= 24; i++) {
      const p = bez(path, i / 24);
      if (p[2] > -0.4 || len(sub(p, planet)) < radius * 1.08) return false;
    }
    return true;
  };

  function spawnDocking(mode, at = 0) {
    const kind = pick(SHIPS);
    let path = null, length = 0;
    for (let tries = 0; tries < 12 && !path; tries++) {
      const far = farPoint(station, 2.0 + rnd() * 1.2);
      const near = add(dock, mul(axis, 0.45 + rnd() * 0.25));
      const bend = add(lerp(far, near, 0.5), mul(randomDir(), 0.5));
      const p = mode === "arrive" ? [far, bend, near, dock] : [dock, near, bend, far];
      if (clear(p)) { path = p; length = len(sub(far, near)) + len(sub(near, dock)); }
    }
    if (path) ships.push({ kind, mode, path, t: at, dur: length / kind.speed, trail: [], trailClock: 0 });
  }
  function spawnPassing(at = 0) {
    const kind = pick(SHIPS);
    for (let tries = 0; tries < 12; tries++) {
      const a = farPoint([0, 0, -9], 7), b = farPoint([0, 0, -9], 7);
      const mid = lerp(a, b, 0.5);
      const path = [a, lerp(a, mid, 0.66), lerp(mid, b, 0.34), b];
      if (!clear(path)) continue;
      ships.push({ kind, mode: "pass", path, t: at, dur: len(sub(b, a)) / (kind.speed * 2.2), trail: [], trailClock: 0 });
      return;
    }
  }
  // start with some traffic already on the move
  spawnDocking("arrive", 0.35); spawnDocking("leave", 0.2); spawnPassing(0.4);

  function update(dt) {
    if (dt <= 0) return;
    nextDock -= dt; nextPass -= dt;
    const docking = ships.filter(x => x.mode !== "pass").length, passing = ships.length - docking;
    if (nextDock <= 0) { if (docking < MAX_DOCKING) spawnDocking(rnd() < 0.5 ? "arrive" : "leave"); nextDock = 14 + rnd() * 26; }
    if (nextPass <= 0) { if (passing < MAX_PASSING) spawnPassing(); nextPass = 10 + rnd() * 25; }
    for (let i = ships.length - 1; i >= 0; i--) {
      const sh = ships[i];
      sh.t += dt / sh.dur;
      sh.trailClock += dt;
      if (sh.trailClock > 0.12) { sh.trailClock = 0; sh.trail.unshift(position(sh)); if (sh.trail.length > 22) sh.trail.pop(); }
      if (sh.t >= 1) {
        if (sh.mode === "leave") flashes.push({ p: sh.path[3], age: 0 });
        ships.splice(i, 1);
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].age += dt) > 1.2) flashes.splice(i, 1);
  }

  // arrivals slow down into the dock, departures speed up away from it
  const ease = sh => (sh.mode === "arrive" ? 1 - (1 - sh.t) ** 2 : sh.mode === "leave" ? sh.t * sh.t : sh.t);
  const position = sh => bez(sh.path, Math.min(1, Math.max(0, ease(sh))));
  const velocity = sh => { const e = ease(sh), e2 = Math.min(1, e + 0.002); return sub(bez(sh.path, e2), bez(sh.path, e)); };
  const fade = sh => (sh.mode === "arrive" ? Math.min(1, sh.t / 0.05, (1 - sh.t) / 0.04) : sh.mode === "leave" ? Math.min(1, sh.t / 0.03, (1 - sh.t) / 0.02 + 0.3) : Math.min(1, sh.t / 0.1, (1 - sh.t) / 0.1));
  const thrust = sh => (sh.mode === "leave" ? 0.5 + 1.5 * sh.t : sh.mode === "arrive" ? 0.35 + 0.65 * (1 - sh.t) : 0.8);

  return { station, up, right, dock, ships, flashes, update, position, velocity, fade, thrust };
}

// ---------------------------------------------------------------- drawing
const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 iRect;
layout(location = 2) in vec4 iUv;
layout(location = 3) in vec4 iColor;
layout(location = 4) in vec3 iRot;
uniform vec2 uRes;
out vec2 vUv, vLocal; out vec4 vColor; flat out float vKind;
void main() {
  vec2 c = aPos * iRect.zw, r = vec2(c.x * iRot.x - c.y * iRot.y, c.x * iRot.y + c.y * iRot.x);
  gl_Position = vec4((iRect.xy + r) / uRes * 2.0 - 1.0, 0.0, 1.0);
  vUv = mix(iUv.xy, iUv.zw, aPos + 0.5); vLocal = aPos * 2.0; vColor = iColor; vKind = iRot.z;
}`;
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv, vLocal; in vec4 vColor; flat in float vKind; out vec4 o;
uniform sampler2D uStation, uShips;
vec4 sprite(vec4 t) { float a = t.a * vColor.a; vec3 c = pow(t.rgb / max(t.a, 1e-3), vec3(2.2)) * vColor.rgb; return vec4(c * a, a); }
void main() {
  if (vKind < 0.5) o = sprite(texture(uStation, vUv));
  else if (vKind < 1.5) o = sprite(texture(uShips, vUv));
  else if (vKind < 2.5) { float d = dot(vLocal, vLocal); o = vec4(vColor.rgb * (exp(-d * 6.0) + 0.2 * exp(-d * 2.2)) * clamp(1.0 - d, 0.0, 1.0) * vColor.a, 0.0); }
  else { o = vec4(vColor.rgb * exp(-vLocal.y * vLocal.y * 40.0 - vLocal.x * vLocal.x * 2.5) * clamp(1.0 - abs(vLocal.x), 0.0, 1.0) * clamp(1.0 - abs(vLocal.y), 0.0, 1.0) * vColor.a, 0.0); }
}`;
const STRIDE = 15;     // floats per sprite: rect 4, uv 4, colour 4, rotation 3
const KIND = { station: 0, ship: 1, glow: 2, streak: 3 };

export function createTrafficRenderer(gl, sim) {
  const make = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("traffic shader: " + gl.getShaderInfoLog(sh)); return sh; };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, make(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("traffic program: " + gl.getProgramInfoLog(prog));
  const uRes = gl.getUniformLocation(prog, "uRes"), uStation = gl.getUniformLocation(prog, "uStation"), uShips = gl.getUniformLocation(prog, "uShips");

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  const B = 4 * STRIDE;
  [[1, 4, 0], [2, 4, 16], [3, 4, 32], [4, 3, 48]].forEach(([loc, n, offset]) => {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, B, offset); gl.vertexAttribDivisor(loc, 1);
  });
  gl.bindVertexArray(null);
  let data = new Float32Array(STRIDE * 256);

  let stationTex = null, shipsTex = null;
  const upload = img => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const load = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("could not load " + url)); i.src = url; });
  const ready = Promise.all([load("content/space/station.webp"), load("content/space/ships.webp")])
    .then(([a, b]) => { stationTex = upload(a); shipsTex = upload(b); });

  // camera: m is the camera-to-world matrix (column-major), tan the half-height of the view
  function draw({ m, W, H, tan, clock, light, planet, radius }) {
    if (!stationTex) return;
    const list = [];
    const toCam = p => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
    const k = H / 2 / tan;
    // screen position (pixels, y up) and pixels per world unit, or null when behind the camera or the planet
    const project = p => {
      const v = toCam(p);
      if (v[2] > -0.05) return null;
      const d = len(p), dir = mul(p, 1 / d), tc = dot(planet, dir);
      if (tc > 0 && tc < d && len(sub(mul(dir, tc), planet)) < radius) return null;
      return { x: W / 2 + (v[0] / -v[2]) * k, y: H / 2 + (v[1] / -v[2]) * k, s: k / -v[2], depth: -v[2] };
    };
    const shade = light === "sunrise" ? 0.42 : 0.92;
    const push = (depth, x, y, w, h, uv, col, a, ang, kind) => list.push([depth, x, y, w, h, uv[0], uv[1], uv[2], uv[3], col[0], col[1], col[2], a, Math.cos(ang), Math.sin(ang), kind]);
    const glow = (depth, q, size, col, a) => push(depth - 0.001, q.x, q.y, size, size, [0, 0, 1, 1], col, a, 0, KIND.glow);
    const blink = (period, phase, on = 0.12) => ((clock / period + phase) % 1) < on ? 1 : 0;

    // the station: two neighbouring frames of its turn, cross-faded
    const st = project(sim.station);
    if (st) {
      const upq = project(add(sim.station, mul(sim.up, 0.1)));
      const ang = upq ? Math.atan2(upq.y - st.y, upq.x - st.x) - Math.PI / 2 : 0;
      const ph = ((clock / STATION.spin) % 1) * STATION.frames, f0 = Math.floor(ph) % STATION.frames, f1 = (f0 + 1) % STATION.frames, mix = ph - Math.floor(ph);
      const rows = STATION.frames / STATION.cols, size = STATION.size * st.s;
      const cell = f => { const r = Math.floor(f / STATION.cols), c = f % STATION.cols; return [c / STATION.cols, 1 - (r + 1) / rows, (c + 1) / STATION.cols, 1 - r / rows]; };
      push(st.depth, st.x, st.y, size, size, cell(f0), [shade, shade, shade], 1, ang, KIND.station);
      push(st.depth - 0.0005, st.x, st.y, size, size, cell(f1), [shade, shade, shade], mix, ang, KIND.station);
      const dq = project(sim.dock);
      if (dq) glow(dq.depth, dq, size * 0.07 * (0.85 + 0.15 * Math.sin(clock * 2)), [0.4, 0.9, 1.6], 0.3);
      const ca = Math.cos(ang), sa = Math.sin(ang), at = (fx, fy) => ({ x: st.x + (fx * ca - fy * sa) * size, y: st.y + (fx * sa + fy * ca) * size });
      glow(st.depth - 0.01, at(0.24, 0.05), size * 0.05, [3, 0.4, 0.3], blink(1.6, 0));
      glow(st.depth - 0.01, at(-0.24, 0.05), size * 0.05, [3, 0.4, 0.3], blink(1.6, 0.5));
      glow(st.depth - 0.01, at(0, -0.33), size * 0.06, [3, 3, 3], blink(2.4, 0.2, 0.06));
    }

    for (const sh of sim.ships) {
      const p = sim.position(sh), q = project(p);
      if (!q) continue;
      const a = sim.fade(sh), th = sim.thrust(sh), kind = sh.kind;
      const v = sim.velocity(sh), q2 = project(add(p, mul(norm(v), 0.05)));
      const ang = q2 ? Math.atan2(q2.y - q.y, q2.x - q.x) : 0;
      const w = (kind.len / SHIP_FILL) * q.s, h = w * SHIP_ASPECT;
      const top = 1 - kind.row / SHIP_ROWS, bottom = 1 - (kind.row + 1) / SHIP_ROWS;
      const uv = Math.cos(ang) < 0 ? [0, top, 1, bottom] : [0, bottom, 1, top];    // flip, so the cockpit stays up when flying left
      // the trail, fading behind it
      sh.trail.forEach((tp, i) => {
        const tq = project(tp);
        if (tq) glow(tq.depth + 0.002, tq, Math.max(2, kind.len * 0.32 * tq.s) * (1 - i / 30), [0.35, 0.75, 1.4], a * th * 0.38 * (1 - i / 22));
      });
      // the engine, at the tail
      const tail = { x: q.x - Math.cos(ang) * w * 0.43, y: q.y - Math.sin(ang) * w * 0.43 };
      glow(q.depth, tail, Math.max(3, kind.len * 0.6 * q.s) * (0.6 + 0.4 * th), [0.5, 0.85, 1.8], a * th);
      push(q.depth, q.x, q.y, w, h, uv, [shade, shade, shade], a, ang, KIND.ship);
      if (w > 10) {
        const n = { x: -Math.sin(ang) * h * 0.5, y: Math.cos(ang) * h * 0.5 };
        glow(q.depth - 0.001, { x: q.x + n.x, y: q.y + n.y }, Math.max(2, w * 0.08), [0.3, 2.5, 0.6], a * blink(1.3, sh.dur % 1));
        glow(q.depth - 0.001, { x: q.x - n.x, y: q.y - n.y }, Math.max(2, w * 0.08), [2.8, 0.3, 0.25], a * blink(1.3, (sh.dur + 0.5) % 1));
      }
    }
    // a departing ship jumps away: a bright flash and a streak
    for (const f of sim.flashes) {
      const q = project(f.p);
      if (!q) continue;
      const t = f.age / 1.2, burst = Math.sin(Math.min(1, t * 3) * Math.PI / 2) * (1 - t) ** 2;
      glow(q.depth, q, 40 * burst + 6, [1.2, 1.8, 3], burst * 1.5);
      push(q.depth, q.x, q.y, 220 * burst + 10, 16, [0, 0, 1, 1], [1, 1.6, 2.6], burst, 0, KIND.streak);
    }
    if (!list.length) return;

    list.sort((x, y) => y[0] - x[0]);                  // far to near
    if (data.length < list.length * STRIDE) data = new Float32Array(list.length * STRIDE * 2);
    list.forEach((it, i) => data.set(it.slice(1), i * STRIDE));

    gl.useProgram(prog);
    gl.uniform2f(uRes, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, stationTex); gl.uniform1i(uStation, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shipsTex); gl.uniform1i(uShips, 1);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, list.length * STRIDE), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.length);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  return { ready, draw };
}
