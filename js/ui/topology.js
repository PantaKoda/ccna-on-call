// Network map: an SVG drawing of the lab's devices and links with live link state.

import { intToIp } from "../engine/ip.js";
import { shortIf, isHost } from "../engine/network.js";

const NS = "http://www.w3.org/2000/svg";
const W = 1000, H = 520;

function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const ICONS = {
  router: () => [
    s("circle", { r: 30, class: "dev-body" }),
    s("path", { class: "dev-glyph", d: "M-17 0h34M11 -6l6 6-6 6M-11 -6l-6 6 6 6M0 -17v34M-6 -11l6 -6 6 6M-6 11l6 6 6 -6" }),
  ],
  switch: () => [
    s("rect", { x: -38, y: -24, width: 76, height: 48, rx: 9, class: "dev-body" }),
    s("path", { class: "dev-glyph", d: "M-22 -8h40M12 -14l6 6-6 6M22 9h-40M-12 3l-6 6 6 6" }),
  ],
  pc: () => [
    s("rect", { x: -28, y: -24, width: 56, height: 38, rx: 5, class: "dev-body" }),
    s("path", { class: "dev-glyph", d: "M-12 24h24M0 14v10" }),
    s("path", { class: "dev-glyph thin", d: "M-18 -12h20M-18 -3h28" }),
  ],
  server: () => [
    s("rect", { x: -22, y: -30, width: 44, height: 60, rx: 5, class: "dev-body" }),
    s("path", { class: "dev-glyph thin", d: "M-13 -17h26M-13 -5h26M-13 7h26" }),
    s("circle", { cx: 11, cy: 19, r: 2.4, class: "dev-led" }),
  ],
};

export class Topology {
  constructor({ onPick }) {
    this.onPick = onPick;
    this.el = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "topo", role: "group", "aria-label": "Network map" });
    this.active = null;
  }

  render(net) {
    const st = net.st;
    const nodes = [];
    // zoom to the devices so small topologies are not lost in empty space
    const xs = net.order.map(n => net.devs[n].x), ys = net.order.map(n => net.devs[n].y);
    const x0 = Math.min(...xs) - 120, y0 = Math.min(...ys) - 62;
    this.el.setAttribute("viewBox", `${x0} ${y0} ${Math.max(...xs) + 120 - x0} ${Math.max(...ys) + 84 - y0}`);
    // links first so devices sit on top
    const pairKey = l => [l.a, l.b].sort().join("|");
    const pairCount = {}, pairSeen = {};
    for (const l of net.links) pairCount[pairKey(l)] = (pairCount[pairKey(l)] || 0) + 1;
    for (const l of net.links) {
      const up = st.status(l.a, l.ai).up && st.status(l.b, l.bi).up;
      const A = net.devs[l.a], B = net.devs[l.b];
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // parallel links are shifted sideways so each one, and its port labels, stays readable
      const k = pairKey(l), idx = (pairSeen[k] = (pairSeen[k] ?? -1) + 1), flip = l.a < l.b ? 1 : -1;
      const shift = (idx - (pairCount[k] - 1) / 2) * 34 * flip;
      const a = { ...A, x: A.x - uy * shift, y: A.y + ux * shift }, b = { ...B, x: B.x - uy * shift, y: B.y + ux * shift };
      nodes.push(s("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "link" + (up ? " up" : " down") + (l.ai.startsWith("Serial") ? " serial" : "") + ((st.bundle[`${l.a}|${l.ai}`] || {}).state === "P" ? " bundled" : "") }));
      for (const [d, ifn, dir] of [[a, l.ai, 1], [b, l.bi, -1]]) {
        const sUp = st.status(d.name, ifn).up;
        const lp = d.kind === "switch" ? st.logical(d.name, ifn) : ifn;
        const heldIn = sUp && d.kind === "switch" ? Object.keys(st.stp[d.name] || {}).filter(v => { const p = st.stp[d.name][v].ports[lp]; return p && p.state !== "FWD"; }) : [];
        const blocked = heldIn.length > 0;
        const guard = blocked && heldIn.some(v => st.stp[d.name][v].ports[lp].state === "BKN");
        const err = d.kind === "switch" && net.devs[d.name].ifaces[ifn].errdisabled;
        const r = d.kind === "switch" ? 50 : 42;
        const px = d.x + ux * dir * r, py = d.y + uy * dir * r;
        nodes.push(s("circle", { cx: px, cy: py, r: 5, class: "port " + (!sUp ? "down" : blocked ? "blocked" : "up") },
          s("title", {}, `${d.name} ${ifn}: ${err ? "err-disabled" : !sUp ? "down" : blocked ? `up, but ${guard ? "held by root guard" : "blocked by spanning tree"} in VLAN ${heldIn.join(", ")}` : "up"}`)));
        if (!isHost(d)) {
          // label a little further along the link, nudged off the line
          const lx = d.x + ux * dir * (r + 24) - uy * 15 * dir, ly = d.y + uy * dir * (r + 24) + ux * 15 * dir;
          nodes.push(s("text", { x: lx, y: ly + 4, class: "port-label", "text-anchor": "middle" }, shortIf(ifn)));
        }
      }
    }
    for (const dn of net.order) {
      const d = net.devs[dn];
      const label = isHost(d) ? d.name : d.hostname;
      let sub = d.note || "";
      if (isHost(d) && !net.hideHostIps) {
        const c = st.pcs[dn];
        sub = c.ip != null ? intToIp(c.ip) + (c.via === "dhcp" ? " (DHCP)" : c.via === "apipa" ? " (no DHCP)" : "") : d.ipcfg.mode === "dhcp" ? "DHCP: no lease" : "no address";
      }
      const below = d.kind === "server" ? 48 : d.kind === "router" ? 48 : 44;
      const g = s("g", {
        class: `dev ${d.kind}${d.locked ? " locked" : ""}${this.active === dn ? " active" : ""}`,
        transform: `translate(${d.x} ${d.y})`, tabindex: 0, role: "button",
        "aria-label": `${label}${d.locked ? " (not manageable)" : ": open console"}`,
      }, s("circle", { r: 46, class: "dev-hit" }), ...ICONS[d.kind](),
        s("text", { y: below, class: "dev-label", "text-anchor": "middle" }, label),
        sub ? s("text", { y: below + 15, class: "dev-sub", "text-anchor": "middle" }, sub) : null,
        d.locked ? s("text", { x: 26, y: -22, class: "dev-lock", "text-anchor": "middle" }, "🔒") : null);
      const pick = () => this.onPick(dn);
      g.addEventListener("click", pick);
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      nodes.push(g);
    }
    this.el.replaceChildren(...nodes);
  }
}
