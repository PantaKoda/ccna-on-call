// The view out of the cockpit, drawn on the graphics card (WebGL 2). The same
// scene as space.js, the light version: stars, nebulae and the Milky Way, a
// ringed gas giant with a moon, and the sun. Here every pixel is ray-traced in
// one shader, so the planet is sharp at any screen size, the rings cast their
// shadow on the planet and the planet on the rings, the atmosphere glows at the
// edge, and the sun blooms through a camera lens.
//
// Textures: the sky's nebulae and the planet's clouds are generated on the GPU
// when the view starts. A texture made in Blender can replace either (ASSETS
// below); until one is listed there, nothing is downloaded.
//
//   const space = createSpaceGL(canvas, { rate: 1, planet: "ochre", onTick });
//   space.setRate(0); space.setPlanet("ice"); space.destroy();
// Throws when the browser has no WebGL 2 or no float render targets; the
// cockpit then uses space.js instead.

import { PLANETS } from "./space.js";

// Image files that replace generated textures, relative to index.html.
// sky: an equirectangular (2:1) image of the sky, north at the top.
// planets.<id>: map (2:1 cloud map) and ring (a strip, inner edge on the left,
// with alpha) for a planet; a planet with a map is added to the Bridge's list.
export const ASSETS = { sky: null, planets: {} };

const TAU = Math.PI * 2;
const SPIN_PERIOD = 600;          // seconds for the ship to roll once
const PLANET_DAY = 1500;          // seconds for the planet to turn once
const MOON_MONTH = 2400;
const FOV = 50;                   // vertical field of view, degrees

// ---------------------------------------------------------------- the world
// The camera sits at the origin looking down -z. Distances are arbitrary units.
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const deg = d => (d * Math.PI) / 180;

const WORLD = (() => {
  const off = deg(47), az = deg(200), dist = 7.2;
  const pc = [Math.sin(off) * Math.cos(az) * dist, Math.sin(off) * Math.sin(az) * dist, -Math.cos(off) * dist];
  const n = norm([0.3, 0.92, 0.25]);                 // the planet's axis; the rings lie in its equator
  const t = norm(cross(n, [0, 0, 1])), b = cross(t, n);
  return { pc, r: 4, n, t, b, sun: norm([0.62, 0.38, -0.69]), ringIn: 1.3, ringOut: 2.3, moonOrbit: 6.6, moonR: 0.17 };
})();

// ---------------------------------------------------------------- shaders
const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
const float PI = 3.14159265, TAU = 6.2831853;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.984; }
vec3 dirFromUv(vec2 uv) { float lon = (uv.x - 0.5) * TAU, lat = (uv.y - 0.5) * PI; return vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon)); }
vec2 uvFromDir(vec3 d) { return vec2(atan(d.x, -d.z) / TAU + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5); }
`;

// The sky's nebulae and Milky Way, as an equirectangular texture. Alpha is
// how crowded the stars are (more along the Milky Way).
const SKY_GEN = COMMON + `
uniform vec3 uBand;
void main() {
  vec3 d = dirFromUv(vUv);
  float g = dot(d, uBand), band = exp(-g * g * 16.0);
  float n = fbm(d * 3.0), n2 = fbm(d * 7.0 + 5.0);
  float dust = smoothstep(0.42, 0.72, fbm(d * vec3(4.0, 9.0, 4.0) + 11.0));
  vec3 mw = mix(vec3(0.42, 0.46, 0.66), vec3(0.75, 0.62, 0.52), smoothstep(0.3, 0.8, n2)) * band * (0.3 + 0.7 * n) * (1.0 - dust * 0.8 * band) * 0.42;
  float c1 = pow(smoothstep(0.48, 0.92, fbm(d * 2.2 + vec3(3, 1, 7))), 2.2);
  float c2 = pow(smoothstep(0.52, 0.95, fbm(d * 2.6 + vec3(9, 4, 2))), 2.2);
  float c3 = pow(smoothstep(0.58, 0.97, fbm(d * 1.7 + vec3(2, 8, 5))), 2.0);
  vec3 neb = c1 * vec3(0.06, 0.34, 0.46) * (0.5 + n2) + c2 * vec3(0.44, 0.1, 0.36) * (0.5 + n) + c3 * vec3(0.16, 0.12, 0.5) * (0.6 + n2);
  vec3 col = mw + neb * 0.5 + vec3(0.003, 0.005, 0.01);
  fragColor = vec4(col, clamp(band * 0.85 + 0.15, 0.0, 1.0));
}`;

// The planet's clouds, as an equirectangular texture: bands, a great storm,
// small white ovals and fine streaks, in the planet's palette.
const PLANET_GEN = COMMON + `
uniform vec4 uPal[9];
uniform vec3 uStorm, uSpots;
uniform float uSeed;
vec3 pal(float t) {
  t = clamp(t, 0.0, 1.0); vec3 c = uPal[0].yzw;
  for (int i = 1; i < 9; i++) c = mix(c, uPal[i].yzw, clamp((t - uPal[i - 1].x) / max(uPal[i].x - uPal[i - 1].x, 1e-4), 0.0, 1.0));
  return c;
}
float wrapA(float a) { return mod(a + PI, TAU) - PI; }
void main() {
  float lon = (vUv.x - 0.5) * TAU, lat = (vUv.y - 0.5) * PI, mixS = 0.0, mixW = 0.0;
  // the great storm: the clouds swirl around it
  vec2 ax = vec2(0.2, 0.085), q0 = vec2(wrapA(lon - 1.2) * cos(lat), lat + 0.36) / ax;
  float e = length(q0);
  if (e < 2.2) {
    float a = 3.4 * pow(1.0 - e / 2.2, 2.0), c = cos(a), s = sin(a);
    vec2 dl = (mat2(c, s, -s, c) * q0) * ax;
    lon = 1.2 + dl.x / max(cos(lat), 0.05); lat = -0.36 + dl.y;
    mixS = smoothstep(1.05, 0.25, e) * 0.75;
  }
  for (int i = 0; i < 9; i++) {
    float fi = float(i) + uSeed;
    vec2 o = vec2(hash13(vec3(fi, 1, 2)) * TAU - PI, (hash13(vec3(fi, 3, 4)) - 0.5) * 1.6);
    vec2 q = vec2(wrapA(lon - o.x) * cos(lat), lat - o.y) / vec2(0.035, 0.018);
    mixW = max(mixW, smoothstep(1.0, 0.2, length(q)) * 0.8);
  }
  vec3 p = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  float n = fbm(vec3(p.x * 1.6, p.y * 7.0, p.z * 1.6) * 1.8 + uSeed);
  float n2 = fbm(p * 6.0 + uSeed * 2.0);
  float lw = lat + (n - 0.5) * 0.1 + (n2 - 0.5) * 0.03;
  float b = 0.5 + 0.2 * sin(lw * 6.3 + 1.3) + 0.15 * sin(lw * 13.9 + 0.4) + 0.08 * sin(lw * 31.0 + 2.2) + 0.04 * sin(lw * 67.0) + (n - 0.5) * 0.35;
  b += (fbm(vec3(p.x * 3.0, p.y * 46.0, p.z * 3.0) + uSeed) - 0.5) * 0.14;
  b *= 1.0 - 0.45 * pow(abs(sin(lat)), 4.0);
  vec3 col = pal(b);
  col = mix(col, uStorm, mixS); col = mix(col, uSpots, mixW);
  col *= 0.9 + 0.2 * n2;
  fragColor = vec4(col, 1.0);
}`;

// The scene, ray-traced: sky, stars, sun, moon, the planet and its rings.
const SCENE = COMMON + `
uniform vec2 uRes; uniform float uTime, uTan, uPx, uSunI, uSpin, uSkyGain;
uniform mat3 uCam;
uniform vec3 uPc, uN, uT, uB, uL, uAtmo, uMoon;
uniform float uR, uRingIn, uRingOut, uMoonR;
uniform sampler2D uSky, uPlanet, uRing;

float ringAlpha(float r) { float x = (r - uRingIn) / (uRingOut - uRingIn); return (x < 0.0 || x > 1.0) ? 0.0 : texture(uRing, vec2(x, 0.5)).a; }

vec3 stars(vec3 d, float crowd) {
  vec3 c = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float scale = k == 0 ? 160.0 : k == 1 ? 380.0 : 820.0;
    float dens = (k == 0 ? 0.025 : k == 1 ? 0.04 : 0.06) * (k == 0 ? 1.0 : 0.25 + 1.4 * crowd);
    float gain = k == 0 ? 5.0 : k == 1 ? 1.1 : 0.35;
    vec3 p = d * scale, cell = floor(p);
    float h = hash13(cell + float(k) * 71.0);
    if (h > dens) continue;
    vec3 sp = normalize(cell + 0.2 + 0.6 * vec3(hash13(cell + 17.1), hash13(cell + 31.7), hash13(cell + 47.3))) * scale;
    float px = uPx * scale, dist = length(p - sp);
    float b = pow(hash13(cell + 5.5), 8.0) * gain + 0.012;
    vec3 tint = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.82, 0.6), hash13(cell + 9.1));
    float tw = 0.8 + 0.2 * sin(uTime * (0.7 + 3.0 * h) + h * 50.0);
    c += tint * b * tw * exp(-dist * dist / (px * px * 0.8));
  }
  return c;
}

vec3 sky(vec3 d) {
  vec4 s = texture(uSky, uvFromDir(d));
  vec3 c = s.rgb * s.rgb * uSkyGain + stars(d, s.a);
  float cs = max(dot(d, uL), 0.0);
  c += vec3(1.0, 0.93, 0.82) * (smoothstep(0.99989, 0.99994, cs) * 60.0 + pow(cs, 1400.0) * 10.0 + pow(cs, 120.0) * 0.7 + pow(cs, 10.0) * 0.05);
  return c;
}

// a sphere as seen from the camera: how much of this pixel it covers, the
// distance, and the surface point (on the limb for pixels just outside)
float sphere(vec3 rd, vec3 c, float r, out float t, out vec3 p) {
  float tc = dot(c, rd); vec3 cp = rd * tc; float dp = length(cp - c);
  if (tc <= 0.0) { t = -1.0; return 0.0; }
  if (dp < r) { t = tc - sqrt(r * r - dp * dp); p = rd * t; }
  else { t = tc; p = c + normalize(cp - c) * r; }
  return clamp((r - dp) / (tc * uPx) + 0.5, 0.0, 1.0);
}

vec3 planet(vec3 rd, vec3 p) {
  vec3 n = normalize(p - uPc);
  float lat = asin(clamp(dot(n, uN), -1.0, 1.0));
  float lon = atan(dot(n, uT), dot(n, uB)) + uSpin + uTime * (0.0006 * sin(lat * 11.0) + 0.0003 * sin(lat * 23.0 + 1.0));
  vec3 alb = texture(uPlanet, vec2(fract(lon / TAU + 0.5), lat / PI + 0.5)).rgb;
  alb = pow(alb, vec3(2.2));
  float ndl = dot(n, uL), mu = max(dot(n, -rd), 0.0);
  float wrap = clamp((ndl + 0.15) / 1.15, 0.0, 1.0);
  float diff = mix(max(ndl, 0.0), wrap, 0.3) * pow(mu, 0.22);
  // the rings' shadow
  float sh = 1.0, dn = dot(uL, uN);
  if (abs(dn) > 1e-4) { float s = dot(uPc - p, uN) / dn; if (s > 0.0) sh = 1.0 - 0.85 * ringAlpha(length(p + uL * s - uPc) / uR); }
  vec3 c = alb * diff * sh * uSunI;
  c += alb * vec3(1.0, 0.42, 0.2) * exp(-pow(ndl * 6.0, 2.0)) * 0.16 * sh;     // warm twilight at the terminator
  c += uAtmo * pow(1.0 - mu, 3.5) * smoothstep(-0.3, 0.4, ndl) * 1.4;          // atmosphere at the edge
  c += alb * 0.003;
  return c;
}

vec4 rings(vec3 rd, out float t) {
  t = -1.0;
  float dn = dot(rd, uN); if (abs(dn) < 1e-5) return vec4(0.0);
  float tt = dot(uPc, uN) / dn; if (tt <= 0.0) return vec4(0.0);
  vec3 q = rd * tt; float x = (length(q - uPc) / uR - uRingIn) / (uRingOut - uRingIn);
  if (x < 0.0 || x > 1.0) return vec4(0.0);
  t = tt;
  vec4 s = texture(uRing, vec2(x, 0.5));
  vec3 alb = pow(s.rgb, vec3(2.2));
  float lit = dot(uL, uN) * dot(-rd, uN);
  vec3 c = lit > 0.0
    ? alb * (0.25 + 0.75 * abs(dot(uL, uN))) * uSunI
    : alb * (1.0 - s.a) * uSunI * (0.3 + 2.0 * pow(max(dot(rd, uL), 0.0), 6.0));    // seen from the dark side, lit through the gaps
  // the planet's shadow, with a soft edge
  vec3 tc = uPc - q; float along = dot(tc, uL);
  if (along > 0.0) c *= mix(0.04, 1.0, smoothstep(uR * 0.97, uR * 1.03, length(tc - uL * along)));
  return vec4(c, s.a);
}

vec3 moon(vec3 rd, vec3 p) {
  vec3 n = normalize(p - uMoon);
  float cr = fbm(n * 5.0), mare = smoothstep(0.45, 0.6, fbm(n * 1.6 + 3.0));
  vec3 alb = mix(vec3(0.42), vec3(0.24, 0.24, 0.26), mare) * (0.75 + 0.5 * cr);
  float ndl = max(dot(n, uL), 0.0);
  return alb * ndl * uSunI + alb * 0.02 * max(dot(n, normalize(uPc - uMoon)), 0.0);   // a little planetshine
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.0 * uTan;
  vec3 rd = normalize(uCam * vec3(uv, -1.0));

  vec3 bg = sky(rd);
  float tp, tm, tr; vec3 pp, pm;
  float cp = sphere(rd, uPc, uR, tp, pp);
  float cm = sphere(rd, uMoon, uMoonR, tm, pm);
  vec4 rg = rings(rd, tr);

  // the atmosphere's glow just outside the planet, brightest toward the sun
  float tc = dot(uPc, rd);
  if (tc > 0.0) {
    vec3 cpt = rd * tc; float dp = length(cpt - uPc);
    if (dp > uR * 0.98) {
      float h = (dp - uR) / uR, side = clamp(dot(normalize(cpt - uPc), uL) * 0.5 + 0.5, 0.0, 1.0);
      bg += uAtmo * exp(-max(h, 0.0) * 42.0) * (0.12 + 1.3 * side * side) * (1.0 - cp);
    }
  }
  // back to front: the moon if it is behind the planet, rings behind it, the planet, then nearer things
  bool moonFar = cm > 0.0 && (cp <= 0.0 || tm > tp);
  if (moonFar) bg = mix(bg, moon(rd, pm), cm);
  bool ringFar = tr > 0.0 && (cp <= 0.0 || tr > tp);
  if (ringFar) bg = mix(bg, rg.rgb, rg.a);
  vec3 col = cp > 0.0 ? mix(bg, planet(rd, pp), cp) : bg;
  if (tr > 0.0 && !ringFar) col = mix(col, rg.rgb, rg.a);
  if (cm > 0.0 && !moonFar) col = mix(col, moon(rd, pm), cm);
  fragColor = vec4(col, 1.0);
}`;

const BRIGHT = COMMON + `
uniform sampler2D uTex;
void main() { vec3 c = texture(uTex, vUv).rgb; float l = max(c.r, max(c.g, c.b)); fragColor = vec4(c * max(l - 0.85, 0.0) / max(l, 1e-4), 1.0); }`;

const BLUR = COMMON + `
uniform sampler2D uTex; uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.2270;
  c += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.3162;
  c += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.0703;
  fragColor = vec4(c, 1.0);
}`;

// Bloom, the lens (flare and a little colour fringing), tone mapping, grain.
const FINAL = COMMON + `
uniform sampler2D uScene, uBloomA, uBloomB;
uniform vec2 uRes; uniform vec3 uSun; uniform float uTime, uExposure;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 dc = vUv - 0.5; float asp = uRes.x / uRes.y;
  vec3 c = vec3(texture(uScene, vUv + dc * 0.0035).r, texture(uScene, vUv).g, texture(uScene, vUv - dc * 0.0035).b);
  c += texture(uBloomA, vUv).rgb * 0.55 + texture(uBloomB, vUv).rgb * 0.9;
  if (uSun.z > 0.0) {
    vec2 p = (vUv - uSun.xy) * vec2(asp, 1.0);
    c += vec3(1.0, 0.86, 0.72) * uSun.z * (exp(-abs(p.y) * 160.0) * exp(-abs(p.x) * 1.6) * 0.45 + exp(-length(p) * 9.0) * 0.25);
    vec2 axis = vec2(0.5) - uSun.xy;
    for (int i = 0; i < 4; i++) {
      float k = i == 0 ? 0.55 : i == 1 ? 1.15 : i == 2 ? 1.5 : 1.85, r = i == 0 ? 0.035 : i == 1 ? 0.08 : i == 2 ? 0.018 : 0.12;
      vec3 tint = i == 0 ? vec3(0.3, 0.8, 1.0) : i == 1 ? vec3(0.6, 0.4, 1.0) : i == 2 ? vec3(1.0, 0.7, 0.4) : vec3(0.2, 0.7, 0.9);
      float d = length((vUv - (uSun.xy + axis * k)) * vec2(asp, 1.0));
      c += tint * uSun.z * smoothstep(r, r * 0.7, d) * smoothstep(0.0, r, d + r * 0.3) * 0.05;
    }
  }
  c = aces(c * uExposure);
  c *= 1.0 - 0.35 * smoothstep(0.45, 1.1, length(dc * vec2(asp, 1.0)));
  c = pow(c, vec3(1.0 / 2.2));
  c += (hash13(vec3(gl_FragCoord.xy, fract(uTime) * 97.0)) - 0.5) * 0.03;
  fragColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- WebGL plumbing
function program(gl, frag) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, make(gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("program: " + gl.getProgramInfoLog(p));
  const loc = {};
  return { p, u: name => (name in loc ? loc[name] : (loc[name] = gl.getUniformLocation(p, name))) };
}

function texture(gl, w, h, { float = false, wrap = gl.CLAMP_TO_EDGE, data = null } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function target(gl, w, h, float) {
  const tex = texture(gl, w, h, { float, wrap: gl.REPEAT });
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("render target not supported");
  return { tex, fb, w, h };
}

// The rings: a strip of bands and gaps, made once.
function ringStrip() {
  const W = 1024, d = new Uint8Array(W * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ripples = Array.from({ length: 60 }, () => [rnd(), 0.003 + rnd() * 0.03, rnd() * 0.22]);
  for (let i = 0; i < W; i++) {
    const x = i / W;
    let a = 0.62 + 0.12 * Math.sin(x * 23 + 0.5) * Math.sin(x * 5 + 1) + 0.05 * Math.sin(x * 140);
    for (const [c, w, depth] of ripples) a -= depth * Math.exp(-(((x - c) / w) ** 2));
    if (x > 0.6 && x < 0.64) a *= 0.08;                 // a wide gap, like Saturn's Cassini division
    if (x > 0.86 && x < 0.87) a *= 0.2;
    a *= Math.min(1, x / 0.06) * Math.min(1, (1 - x) / 0.04);
    a = Math.max(0, Math.min(0.92, a));
    const warm = 0.5 + 0.5 * Math.sin(x * 9);
    d.set([200 + 30 * warm, 186 + 20 * warm, 160 + 10 * warm, a * 255], i * 4);
  }
  return d;
}

function loadImage(url) {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("could not load " + url)); img.src = url; });
}

// ---------------------------------------------------------------- the scene
export function createSpaceGL(canvas, opts = {}) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("no WebGL 2");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("no float render targets");
  gl.getExtension("OES_texture_float_linear");

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const P = { sky: program(gl, SKY_GEN), planet: program(gl, PLANET_GEN), scene: program(gl, SCENE), bright: program(gl, BRIGHT), blur: program(gl, BLUR), final: program(gl, FINAL) };
  const draw = (prog, fb, w, h) => { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); gl.useProgram(prog.p); gl.drawArrays(gl.TRIANGLES, 0, 3); };

  // generated textures (replaced by Blender images when ASSETS lists them)
  const skyT = target(gl, 2048, 1024, false);
  gl.useProgram(P.sky.p); gl.uniform3fv(P.sky.u("uBand"), norm([0.2, 0.55, 0.81]));
  draw(P.sky, skyT.fb, 2048, 1024);
  let skyTex = skyT.tex;
  const planetT = target(gl, 4096, 2048, false);
  let planetTex = planetT.tex, ringTex = texture(gl, 1024, 1, { data: ringStrip() });

  let rate = opts.rate ?? 1, kind = opts.planet in PLANETS ? opts.planet : "ochre", look = [0, 0], lookTo = [0, 0];
  let atmo = [1, 0.75, 0.55];
  function makePlanet(id) {
    const pl = PLANETS[id] || PLANETS.ochre, u = P.planet.u;
    gl.useProgram(P.planet.p);
    gl.uniform4fv(u("uPal"), new Float32Array(pl.pal.flatMap(([t, r, g, b]) => [t, r / 255, g / 255, b / 255])));
    gl.uniform3fv(u("uStorm"), pl.storm.map(v => v / 255));
    gl.uniform3fv(u("uSpots"), pl.spots.map(v => v / 255));
    gl.uniform1f(u("uSeed"), 3.7);
    draw(P.planet, planetT.fb, 4096, 2048);
    planetTex = planetT.tex;
    atmo = pl.atm.map(v => (v / 255) * 0.9);
  }
  makePlanet(kind);

  let W = 0, H = 0, scene = null, half = null, qa = null, qb = null, ea = null, eb = null;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * (opts.scale || 1);
    W = Math.max(2, Math.round(window.innerWidth * dpr)); H = Math.max(2, Math.round(window.innerHeight * dpr));
    canvas.width = W; canvas.height = H;
    for (const t of [scene, half, qa, qb, ea, eb]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    scene = target(gl, W, H, true);
    half = target(gl, W >> 1, H >> 1, true);
    qa = target(gl, W >> 2, H >> 2, true); qb = target(gl, W >> 2, H >> 2, true);
    ea = target(gl, W >> 3, H >> 3, true); eb = target(gl, W >> 3, H >> 3, true);
    frame(performance.now(), true);
  }

  let clock = 0, raf = 0, prev = performance.now(), lastTick = 0, lastDraw = 0;
  const tan = Math.tan(deg(FOV / 2));
  const roll = () => 0.35 + (clock * TAU) / SPIN_PERIOD + 0.012 * Math.sin(clock * 0.21);

  // camera: roll about the view axis, plus a little look-around from the pointer
  function camera() {
    const a = -roll(), ca = Math.cos(a), sa = Math.sin(a);
    const yaw = look[0] * 0.035, pitch = look[1] * 0.025, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // R = Rz(a) * Ry(yaw) * Rx(pitch), column-major for WebGL
    const ry = [cy, 0, -sy, 0, 1, 0, sy, 0, cy], rx = [1, 0, 0, 0, cp, sp, 0, -sp, cp], rz = [ca, sa, 0, -sa, ca, 0, 0, 0, 1];
    const mul = (A, B) => { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = A[r] * B[c * 3] + A[3 + r] * B[c * 3 + 1] + A[6 + r] * B[c * 3 + 2]; return o; };
    return mul(rz, mul(ry, rx));
  }

  // where the sun is on screen, and how much of it is not hidden by the planet
  function sunOnScreen(m) {
    const L = WORLD.sun;
    const v = [m[0] * L[0] + m[1] * L[1] + m[2] * L[2], m[3] * L[0] + m[4] * L[1] + m[5] * L[2], m[6] * L[0] + m[7] * L[1] + m[8] * L[2]];   // transpose: world to camera
    if (v[2] >= -0.05) return [0, 0, 0];
    const asp = W / H, x = 0.5 + v[0] / -v[2] / (2 * tan * asp), y = 0.5 + v[1] / -v[2] / (2 * tan);
    const tc = dot(WORLD.pc, L), miss = Math.hypot(...WORLD.pc.map((c, i) => L[i] * tc - c));
    const hidden = tc > 0 ? 1 - Math.min(1, Math.max(0, (miss - WORLD.r) / (WORLD.r * 0.02))) : 0;
    const edge = Math.min(1, Math.max(0, 1.2 - Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * 2) / 0.4);
    return [x, y, (1 - hidden) * edge];
  }

  function frame(now, force) {
    if (!force) raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
    clock += dt * rate;
    const ease = 1 - Math.exp(-dt * 2.5);
    look[0] += (lookTo[0] - look[0]) * ease; look[1] += (lookTo[1] - look[1]) * ease;
    if (!force && now - lastDraw < 15) return;
    lastDraw = now;

    const m = camera(), s = P.scene, u = s.u, w = WORLD;
    const ma = WORLD.moonOrbit, th = 2.4 + (clock * TAU) / MOON_MONTH;
    const moon = w.pc.map((c, i) => c + ma * (Math.cos(th) * w.t[i] + Math.sin(th) * w.b[i]) + w.n[i] * 0.6);
    gl.useProgram(s.p);
    gl.uniform2f(u("uRes"), W, H); gl.uniform1f(u("uTime"), clock); gl.uniform1f(u("uTan"), tan);
    gl.uniform1f(u("uPx"), (2 * tan) / H); gl.uniform1f(u("uSunI"), 1.45); gl.uniform1f(u("uSkyGain"), 1.6);
    gl.uniform1f(u("uSpin"), (clock * TAU) / PLANET_DAY);
    gl.uniformMatrix3fv(u("uCam"), false, m);
    gl.uniform3fv(u("uPc"), w.pc); gl.uniform3fv(u("uN"), w.n); gl.uniform3fv(u("uT"), w.t); gl.uniform3fv(u("uB"), w.b);
    gl.uniform3fv(u("uL"), w.sun); gl.uniform3fv(u("uAtmo"), atmo); gl.uniform3fv(u("uMoon"), moon);
    gl.uniform1f(u("uR"), w.r); gl.uniform1f(u("uRingIn"), w.ringIn); gl.uniform1f(u("uRingOut"), w.ringOut); gl.uniform1f(u("uMoonR"), w.moonR);
    bind(u("uSky"), 0, skyTex); bind(u("uPlanet"), 1, planetTex); bind(u("uRing"), 2, ringTex);
    draw(s, scene.fb, W, H);

    // bloom: the bright parts, blurred at a quarter and an eighth of the size
    gl.useProgram(P.bright.p); bind(P.bright.u("uTex"), 0, scene.tex); draw(P.bright, half.fb, half.w, half.h);
    blur(half, qa, qb); blur(qb, ea, eb);

    const f = P.final;
    gl.useProgram(f.p);
    bind(f.u("uScene"), 0, scene.tex); bind(f.u("uBloomA"), 1, qb.tex); bind(f.u("uBloomB"), 2, eb.tex);
    gl.uniform2f(f.u("uRes"), W, H); gl.uniform1f(f.u("uTime"), now / 1000); gl.uniform1f(f.u("uExposure"), 1.0);
    gl.uniform3fv(f.u("uSun"), sunOnScreen(m));
    draw(f, null, W, H);

    if (opts.onTick && now - lastTick > 250) { lastTick = now; opts.onTick(roll(), clock); }
    if (!force && rate === 0 && Math.abs(look[0] - lookTo[0]) + Math.abs(look[1] - lookTo[1]) < 0.001) { cancelAnimationFrame(raf); raf = 0; }
  }

  function bind(loc, unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); }
  function blur(src, a, b) {
    const bl = P.blur;
    gl.useProgram(bl.p);
    bind(bl.u("uTex"), 0, src.tex); gl.uniform2f(bl.u("uDir"), 1 / a.w, 0); draw(bl, a.fb, a.w, a.h);
    bind(bl.u("uTex"), 0, a.tex); gl.uniform2f(bl.u("uDir"), 0, 1 / a.h); draw(bl, b.fb, b.w, b.h);
  }

  // Blender-made textures, when ASSETS lists them
  async function loadAssets() {
    const up = (img, wrap) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    try { if (ASSETS.sky) { skyTex = up(await loadImage(ASSETS.sky), gl.REPEAT); run(); } } catch (e) { console.warn(e.message); }
    const own = ASSETS.planets[kind];
    try {
      if (own && own.map) planetTex = up(await loadImage(own.map), gl.REPEAT);
      if (own && own.ring) ringTex = up(await loadImage(own.ring), gl.CLAMP_TO_EDGE);
      run();
    } catch (e) { console.warn(e.message); }
  }

  function run() { if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); } }
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); run(); }, 150); };
  const onPointer = e => { if (rate > 0) lookTo = [(e.clientX / window.innerWidth - 0.5) * 2, -(e.clientY / window.innerHeight - 0.5) * 2]; };
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointer, { passive: true });
  resize();
  run();
  loadAssets();

  return {
    setRate(r) { rate = Math.max(0, +r || 0); if (!rate) lookTo = [0, 0]; run(); },
    setPlanet(id) { if (!(id in PLANETS) || id === kind) return; kind = id; makePlanet(id); loadAssets(); run(); },
    destroy() {
      cancelAnimationFrame(raf); raf = 0; clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize); window.removeEventListener("pointermove", onPointer);
      const lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
    },
  };
}
