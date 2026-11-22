// The view out of the cockpit: stars, nebulae, a ringed gas giant with a moon,
// and the sun, drawn on one canvas behind the page. The ship is in orbit and
// rolls slowly, so the whole view turns; the planet's cloud bands drift as it
// spins, and a little dust drifts past the canopy.
//
// Plain canvas 2D, no libraries. The planet is generated once (a cloud texture
// and a per-pixel sphere lookup) and its surface is redrawn a few times a
// second from that lookup, which is cheap. Everything else is redrawn each
// frame at about 30 frames a second, and nothing at all while the tab is hidden.
//
//   const space = createSpace(canvas, { motion: true, onTick: (roll, t) => {} });
//   space.setMotion(false);   // hold still (also what reduced motion asks for)
//   space.destroy();

const TAU = Math.PI * 2;
const SPIN_PERIOD = 600;        // seconds for the ship to roll once
const PLANET_DAY = 1500;        // seconds for the planet to turn once
const FRAME = 1000 / 30;
const TW = 1024, TH = 512;      // planet cloud texture
const P = 1024;                 // planet disc, in pixels, before scaling to the screen

// Where things are, in units of the screen diagonal from the screen centre,
// before the roll is applied. The planet is huge and mostly off screen, so its
// limb always cuts into the view somewhere as the ship rolls.
const LAYOUT = {
  planet: { angle: 2.45, dist: 0.78, r: 0.55, tilt: 0.38 },
  sun: { angle: 2.45 + Math.PI - 0.55, dist: 0.42 },
  moon: { orbit: 0.63, angle: 0.95, r: 0.017 },
  rings: { inner: 1.24, outer: 1.86, squash: 0.16 },
};

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const polar = (angle, dist) => [Math.cos(angle) * dist, Math.sin(angle) * dist];

// ---------------------------------------------------------------- the planet
// Value noise that wraps around in x, so the texture has no seam.
function wrapNoise(rand, gx, gy) {
  const g = new Float32Array(gx * gy);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = s(x - x0), fy = s(y - y0);
    const xa = ((x0 % gx) + gx) % gx, xb = (xa + 1) % gx;
    const ya = Math.min(gy - 1, Math.max(0, y0)), yb = Math.min(gy - 1, ya + 1);
    const a = g[ya * gx + xa], b = g[ya * gx + xb], c = g[yb * gx + xa], d = g[yb * gx + xb];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

// Cloud bands, a large storm and a few small ones, as RGB bytes (TW x TH).
function cloudTexture(rand) {
  const oct = [0, 1, 2, 3].map(k => ({ n: wrapNoise(rand, 8 << k, (12 << k) + 1), gx: 8 << k, gy: 12 << k }));
  const fbm = (u, v) => {
    let sum = 0, amp = 0.5;
    for (const o of oct) { sum += amp * o.n(u * o.gx, v * o.gy); amp *= 0.5; }
    return sum / 0.9375;
  };
  const PAL = [
    [0.00, 46, 24, 22], [0.18, 104, 52, 38], [0.34, 168, 102, 64], [0.48, 214, 160, 110],
    [0.60, 236, 206, 164], [0.70, 196, 132, 92], [0.82, 150, 84, 70], [0.92, 230, 196, 168], [1.00, 120, 70, 58],
  ];
  const pal = t => {
    t = clamp01(t);
    let i = 1;
    while (i < PAL.length - 1 && PAL[i][0] < t) i++;
    const a = PAL[i - 1], b = PAL[i], f = (t - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
  };
  const ph = [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU];
  const storms = [{ u: 0.3, v: 0.63, rx: 0.075, ry: 0.035, spin: 3.2, col: [196, 96, 70], k: 0.55 }];
  for (let i = 0; i < 7; i++) {
    storms.push({ u: rand(), v: 0.2 + rand() * 0.6, rx: 0.012 + rand() * 0.012, ry: 0.007 + rand() * 0.006, spin: 2.2, col: [244, 230, 210], k: 0.5 });
  }

  const out = new Uint8Array(TW * TH * 3);
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      let u = x / TW, v = y / TH, m = 0, col = null;
      for (const s of storms) {
        let du = u - s.u; du -= Math.round(du);
        const dx = du * 2, dy = v - s.v;              // the texture is twice as wide as it is tall
        const d = Math.hypot(dx / s.rx, dy / s.ry);
        if (d < 1.8) {
          const a = s.spin * (1 - d / 1.8) ** 2, c = Math.cos(a), sn = Math.sin(a);
          u = s.u + (dx * c - dy * sn) / 2;
          v = s.v + dx * sn + dy * c;
          const w = clamp01(1 - d) * s.k;
          if (w > m) { m = w; col = s.col; }
        }
      }
      const n = fbm(u, v), vv = v + (n - 0.5) * 0.07;
      let b = 0.5 + 0.2 * Math.sin(vv * TAU * 3.1 + ph[0]) + 0.15 * Math.sin(vv * TAU * 7.3 + ph[1])
        + 0.08 * Math.sin(vv * TAU * 15.7 + ph[2]) + 0.04 * Math.sin(vv * TAU * 31 + ph[3]) + (n - 0.5) * 0.3;
      const lat = Math.abs(v - 0.5) * 2;
      b = b * (1 - 0.4 * lat ** 4) + 0.08 * lat ** 6;
      let [r, g, bl] = pal(b);
      if (col) { r += (col[0] - r) * m; g += (col[1] - g) * m; bl += (col[2] - bl) * m; }
      const o = (y * TW + x) * 3;
      out[o] = r; out[o + 1] = g; out[o + 2] = bl;
    }
  }
  return out;
}

// For each pixel of the disc: where on the texture it looks, how lit it is, and
// how much atmosphere glows at that point. Built once; the light is fixed
// relative to the planet because the ship rolls everything together.
function sphereLookup(light) {
  const r = P / 2, { tilt } = LAYOUT.planet, ct = Math.cos(tilt), st = Math.sin(tilt);
  const idx = [], U = [], V = [], S = [], RIM = [], A = [];
  for (let y = 0; y < P; y++) {
    for (let x = 0; x < P; x++) {
      const nx = (x + 0.5 - r) / r, ny = (y + 0.5 - r) / r, q = nx * nx + ny * ny;
      if (q >= 1) continue;
      const nz = Math.sqrt(1 - q);
      const px = nx * ct + ny * st, py = -nx * st + ny * ct;
      const lat = Math.asin(Math.max(-1, Math.min(1, py))), lon = Math.atan2(px, nz);
      const dot = nx * light[0] + ny * light[1] + nz * light[2];
      const lit = clamp01((dot + 0.1) / 0.75) ** 1.3;
      const limb = 0.5 + 0.5 * Math.sqrt(nz);
      idx.push(y * P + x);
      U.push((lon / TAU + 0.5) * TW);
      V.push(Math.min(TH - 1, Math.floor((lat / Math.PI + 0.5) * TH)));
      S.push(Math.max(0.02, lit * limb));
      RIM.push((1 - nz) ** 3 * clamp01(dot + 0.35) * 1.6);
      A.push(Math.round(clamp01((1 - Math.sqrt(q)) * r * 1.5) * 255));
    }
  }
  return { idx: Uint32Array.from(idx), U: Float32Array.from(U), V: Uint16Array.from(V), S: Float32Array.from(S), RIM: Float32Array.from(RIM), A: Uint8Array.from(A) };
}

function makePlanet(rand) {
  const [px, py] = polar(LAYOUT.planet.angle, LAYOUT.planet.dist);
  const [sx, sy] = polar(LAYOUT.sun.angle, LAYOUT.sun.dist);
  let lx = sx - px, ly = sy - py, lz = 0.18;
  const len = Math.hypot(lx, ly, lz); lx /= len; ly /= len; lz /= len;
  const tex = cloudTexture(rand), look = sphereLookup([lx, ly, lz]);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = P;
  const c = canvas.getContext("2d");
  const img = c.createImageData(P, P), px8 = img.data;
  const ATM = [255, 196, 150];
  let lastOff = -1;
  return {
    canvas,
    light: [lx, ly],
    paint(off) {
      off = ((Math.floor(off) % TW) + TW) % TW;
      if (off === lastOff) return;
      lastOff = off;
      const { idx, U, V, S, RIM, A } = look;
      for (let i = 0; i < idx.length; i++) {
        let col = (U[i] + off) | 0; if (col >= TW) col -= TW;
        const t = (V[i] * TW + col) * 3, o = idx[i] * 4, s = S[i], rim = RIM[i];
        px8[o] = tex[t] * s + ATM[0] * rim;
        px8[o + 1] = tex[t + 1] * s + ATM[1] * rim;
        px8[o + 2] = tex[t + 2] * s + ATM[2] * rim;
        px8[o + 3] = A[i];
      }
      c.putImageData(img, 0, 0);
    },
  };
}

// ---------------------------------------------------------------- the scene
export function createSpace(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  const rand = rng(0x5eed42);
  let motion = opts.motion !== false;
  let W = 0, H = 0, D = 0, dpr = 1, stars = null, twinkles = [], dust = [];
  let planet = null, planetFade = 0, raf = 0, last = 0, lastPaint = -1e9, lastTick = 0;
  let clock = 0, prev = performance.now();
  const ROLL0 = 0.35;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight; D = Math.hypot(W, H);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    buildStars();
    dust = Array.from({ length: Math.round(Math.min(70, D / 30)) }, () => ({
      x: rand() * W, y: rand() * H, z: 0.3 + rand() * 0.7, a: 0.12 + rand() * 0.3,
    }));
    draw(true);
  }

  // stars, the galaxy's band and nebulae: one square image large enough to
  // cover the screen at any roll angle
  function buildStars() {
    const r = rng(7), S = Math.ceil(D * dpr) + 4, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d"), m = S / 2;
    g.fillStyle = "#02040a"; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "lighter";
    const blob = (x, y, rad, rgb, a, sq = 1, rot = 0) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, sq);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad);
      gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.5, `rgba(${rgb},${a * 0.4})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2); g.restore();
    };
    const band = 0.6;
    blob(m, m, S * 0.62, "120,140,200", 0.09, 0.13, band);
    blob(m, m, S * 0.4, "170,150,190", 0.06, 0.07, band);
    const neb = [["30,120,150", 0.16], ["90,50,160", 0.14], ["160,40,110", 0.08], ["30,60,140", 0.14], ["40,150,140", 0.08]];
    for (const [rgb, a] of neb) blob(r() * S, r() * S, S * (0.18 + r() * 0.22), rgb, a, 0.5 + r() * 0.5, r() * TAU);
    const tint = () => { const t = r(); return t < 0.2 ? "190,210,255" : t < 0.85 ? "240,244,255" : "255,220,180"; };
    const field = Math.round((S * S) / 2600), dense = Math.round((S * S) / 1100);
    for (let i = 0; i < field + dense; i++) {
      let x, y;
      if (i < field) { x = r() * S; y = r() * S; } else {
        const t = (r() - 0.5) * S * 1.2, off = (r() + r() + r() - 1.5) * S * 0.07;
        x = m + Math.cos(band) * t - Math.sin(band) * off; y = m + Math.sin(band) * t + Math.cos(band) * off;
      }
      const big = r() < 0.03, a = big ? 0.7 + r() * 0.3 : 0.15 + r() * 0.5;
      g.fillStyle = `rgba(${tint()},${a})`;
      if (big) { g.beginPath(); g.arc(x, y, (0.8 + r() * 0.9) * dpr, 0, TAU); g.fill(); } else g.fillRect(x, y, dpr, dpr);
    }
    g.globalCompositeOperation = "source-over";
    stars = c;
    twinkles = Array.from({ length: 90 }, () => ({
      x: (r() - 0.5) * S, y: (r() - 0.5) * S, rad: (0.7 + r() * 1.3) * dpr, ph: r() * TAU, f: 0.4 + r() * 1.4, rgb: tint(),
    }));
  }

  const roll = () => ROLL0 + (clock * TAU) / SPIN_PERIOD + 0.012 * Math.sin(clock * 0.21);

  function draw(force) {
    if (!stars) return;
    const k = dpr, cx = (W / 2) * k, cy = (H / 2) * k, d = D * k, a = roll();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#02040a"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // everything outside the ship turns together
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(a);
    ctx.drawImage(stars, -stars.width / 2, -stars.height / 2);
    ctx.globalCompositeOperation = "lighter";
    for (const s of twinkles) {
      const al = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(clock * s.f + s.ph));
      ctx.fillStyle = `rgba(${s.rgb},${al.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.rad, 0, TAU); ctx.fill();
    }

    const [sx, sy] = polar(LAYOUT.sun.angle, LAYOUT.sun.dist).map(v => v * d);
    sun(sx, sy, d);
    ctx.globalCompositeOperation = "source-over";

    if (planet) {
      if (motion || force || lastPaint < 0) {
        if (clock - lastPaint > 0.4 || force) { planet.paint((clock * TW) / PLANET_DAY); lastPaint = clock; }
      }
      ctx.globalAlpha = planetFade;
      const [px, py] = polar(LAYOUT.planet.angle, LAYOUT.planet.dist).map(v => v * d), R = LAYOUT.planet.r * d;
      moon(px, py, R, d);
      ring(px, py, R, -1);
      halo(px, py, R);
      ctx.drawImage(planet.canvas, px - R, py - R, R * 2, R * 2);
      ring(px, py, R, 1);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // the camera's own: lens flare from the sun, dust on the move past the canopy
    const ca = Math.cos(a), sa = Math.sin(a);
    flare(cx + sx * ca - sy * sa, cy + sx * sa + sy * ca, cx, cy, d);
    for (const p of dust) {
      ctx.fillStyle = `rgba(200,230,255,${p.a})`;
      ctx.fillRect(p.x * k, p.y * k, 1.4 * k * p.z, 1.4 * k * p.z);
    }
  }

  function sun(x, y, d) {
    const g1 = ctx.createRadialGradient(x, y, 0, x, y, d * 0.38);
    g1.addColorStop(0, "rgba(255,200,150,0.16)"); g1.addColorStop(1, "rgba(255,180,120,0)");
    ctx.fillStyle = g1; ctx.fillRect(x - d * 0.38, y - d * 0.38, d * 0.76, d * 0.76);
    const r = d * 0.05, g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, "rgba(255,255,255,1)"); g2.addColorStop(0.18, "rgba(255,246,226,0.95)");
    g2.addColorStop(0.45, "rgba(255,206,150,0.3)"); g2.addColorStop(1, "rgba(255,180,120,0)");
    ctx.fillStyle = g2; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function flare(x, y, cx, cy, d) {
    const k = dpr;
    if (x < -0.2 * d || y < -0.2 * d || x > W * k + 0.2 * d || y > H * k + 0.2 * d) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y); ctx.scale(1, 0.012);
    const L = W * k * 0.55, g = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
    g.addColorStop(0, "rgba(255,220,190,0.35)"); g.addColorStop(1, "rgba(255,200,170,0)");
    ctx.fillStyle = g; ctx.fillRect(-L, -L, L * 2, L * 2);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const ghosts = [[0.55, 0.02, "120,220,255", 0.06], [1.25, 0.045, "150,120,255", 0.04], [1.6, 0.012, "255,200,150", 0.08], [1.9, 0.07, "80,200,255", 0.025]];
    for (const [t, r, rgb, al] of ghosts) {
      const gx = x + (cx - x) * t, gy = y + (cy - y) * t, rr = r * d;
      const g = ctx.createRadialGradient(gx, gy, rr * 0.6, gx, gy, rr);
      g.addColorStop(0, `rgba(${rgb},${al})`); g.addColorStop(0.85, `rgba(${rgb},${al * 1.6})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, rr, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function halo(x, y, R) {
    const g = ctx.createRadialGradient(x, y, R * 0.97, x, y, R * 1.09);
    g.addColorStop(0, "rgba(255,190,140,0.32)"); g.addColorStop(0.3, "rgba(255,170,130,0.12)"); g.addColorStop(1, "rgba(255,150,120,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.09, 0, TAU); ctx.fill();
  }

  // side < 0: the half behind the planet, side > 0: the half in front of it
  function ring(x, y, R, side) {
    const { inner, outer, squash } = LAYOUT.rings;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(LAYOUT.planet.tilt); ctx.scale(1, squash);
    ctx.beginPath(); ctx.rect(-outer * R * 1.1, side < 0 ? -outer * R * 1.1 : 0, outer * R * 2.2, outer * R * 1.1); ctx.clip();
    const g = ctx.createRadialGradient(0, 0, inner * R, 0, 0, outer * R), A = side < 0 ? 0.55 : 0.85;
    const bands = [[0, 0], [0.04, 0.3], [0.17, 0.2], [0.22, 0.04], [0.27, 0.38], [0.48, 0.42], [0.53, 0.1], [0.6, 0.3], [0.84, 0.24], [0.89, 0.03], [0.93, 0.16], [1, 0]];
    for (const [o, al] of bands) g.addColorStop(o, `rgba(226,204,174,${(al * A).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, outer * R, 0, TAU); ctx.arc(0, 0, inner * R, 0, TAU, true); ctx.fill();
    ctx.restore();
  }

  function moon(px, py, R, d) {
    const M = LAYOUT.moon, a = LAYOUT.planet.angle + Math.PI + M.angle + (clock * TAU) / 2400;
    const x = px + Math.cos(a) * M.orbit * d, y = py + Math.sin(a) * M.orbit * d, r = M.r * d;
    const [lx, ly] = planet.light;
    const g = ctx.createRadialGradient(x + lx * r * 0.55, y + ly * r * 0.55, r * 0.1, x, y, r);
    g.addColorStop(0, "#d9dde6"); g.addColorStop(0.55, "#8d939f"); g.addColorStop(0.85, "#2a2e36"); g.addColorStop(1, "#0b0d12");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
    if (motion) clock += dt;
    if (now - last < FRAME) return;
    last = now;
    if (planet && planetFade < 1) planetFade = Math.min(1, planetFade + 0.02);
    if (motion) {
      const vx = Math.cos(0.9) * 14, vy = Math.sin(0.9) * 14;
      for (const p of dust) {
        p.x += vx * p.z * (FRAME / 1000); p.y += vy * p.z * (FRAME / 1000);
        if (p.x > W) p.x -= W; if (p.y > H) p.y -= H;
      }
    }
    draw(false);
    if (opts.onTick && now - lastTick > 250) { lastTick = now; opts.onTick(roll(), clock); }
    if (!motion && planetFade >= 1) { cancelAnimationFrame(raf); raf = 0; }
  }

  function run() { if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); } }

  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { resize(); run(); }, 150); };
  window.addEventListener("resize", onResize);
  resize();
  run();
  // the planet takes a moment to build; draw the stars first, then let it rise
  const build = () => { planet = makePlanet(rng(0xa11ce)); planet.paint(0); lastPaint = clock; run(); };
  const idle = window.requestIdleCallback || (f => setTimeout(f, 60));
  idle(build, { timeout: 600 });

  return {
    setMotion(on) { motion = !!on; run(); },
    destroy() { cancelAnimationFrame(raf); raf = 0; window.removeEventListener("resize", onResize); clearTimeout(resizeTimer); },
  };
}
