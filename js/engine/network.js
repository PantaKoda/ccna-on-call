// Network model + simulation: L2 broadcast domains, routing tables (connected,
// static, OSPF), DHCP leases, and packet forwarding with ACLs and NAT.
// Pure logic, no DOM, so it also runs under Node for the level tests.

import { intToIp, netOf, bcastOf, maskLen } from "./ip.js";

const IF_TYPES = ["FastEthernet", "GigabitEthernet", "Serial", "Vlan", "Loopback", "Port-channel"];
const IF_SHORT = { FastEthernet: "Fa", GigabitEthernet: "Gi", Serial: "Se", Vlan: "Vl", Loopback: "Lo", "Port-channel": "Po" };

// "g0/1", "gig 0/1", "fa0/3", "vlan 10" -> canonical "GigabitEthernet0/1" (or null)
export function normIf(raw) {
  if (!raw) return null;
  const m = /^([a-z-]+)\s*(\d+(?:[\/.]\d+)*)$/i.exec(String(raw).trim());
  if (!m) return null;
  const p = m[1].toLowerCase();
  const hits = IF_TYPES.filter(t => t.toLowerCase().startsWith(p));
  return hits.length === 1 ? hits[0] + m[2] : null;
}

export function shortIf(name) {
  const m = /^([A-Za-z-]+)(.*)$/.exec(name);
  return m && IF_SHORT[m[1]] ? IF_SHORT[m[1]] + m[2] : name;
}

export function ifKind(name) {
  if (name.startsWith("Vlan")) return "vlan";
  if (name.startsWith("Loopback")) return "loop";
  if (name.startsWith("Port-channel")) return "po";
  if (name.includes(".")) return "sub";
  return "phys";
}

export const isHost = d => d.kind === "pc" || d.kind === "server";
export const isIos = d => d.kind === "router" || d.kind === "switch";

export function fakeMac(name, idx = 0) {
  let h = 2166136261;
  for (const c of name + ":" + idx) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `00${hex.slice(0, 2)}.${hex.slice(2, 6)}.${hex.slice(6, 8)}${(idx & 255).toString(16).padStart(2, "0")}`;
}

function newIface(d, name) {
  const kind = ifKind(name);
  const i = {
    name, ip: null, mask: null, desc: "", misc: [],
    shutdown: d.kind === "router" ? kind === "phys" : name === "Vlan1",
    nat: null, aclIn: null, aclOut: null, helpers: [],
    ospfCost: null, ospfPri: null, ospfArea: null, ospfHello: null,
    dot1q: null, dot1qNative: false, channel: null,
  };
  if (d.kind === "switch" && kind === "phys") {
    i.sw = {
      mode: null, accessVlan: 1, allowed: null, native: 1, portfast: false, bpduguard: false,
      ps: { on: false, max: 1, violation: "shutdown", sticky: false },
    };
  }
  return i;
}

const IF_RANK = { FastEthernet: 0, GigabitEthernet: 1, Serial: 2, "Port-channel": 3, Loopback: 4, Vlan: 5 };
function ifSortKey(name) {
  const m = /^([A-Za-z-]+)(.*)$/.exec(name);
  const nums = m[2].split(/[\/.]/).map(Number);
  return [IF_RANK[m[1]] ?? 9, ...nums];
}
function cmpIf(a, b) {
  const x = ifSortKey(a), y = ifSortKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

// Returns the interface, creating logical ones (SVI, loopback, subinterface) on demand.
export function ensureIface(d, name) {
  if (d.ifaces[name]) return d.ifaces[name];
  const kind = ifKind(name);
  if (kind === "phys") return null;
  if (kind === "vlan" && d.kind !== "switch") return null;
  if ((kind === "loop" || kind === "sub") && d.kind !== "router") return null;
  if (kind === "sub" && !d.ifaces[name.split(".")[0]]) return null;
  d.ifaces[name] = newIface(d, name);
  d.ifOrder.push(name);
  d.ifOrder.sort(cmpIf);
  return d.ifaces[name];
}

export function removeIface(d, name) {
  if (!d.ifaces[name] || ifKind(name) === "phys") return false;
  delete d.ifaces[name];
  d.ifOrder = d.ifOrder.filter(n => n !== name);
  return true;
}

const DEFAULT_PORTS = {
  router: ["GigabitEthernet0/0", "GigabitEthernet0/1", "GigabitEthernet0/2", "Serial0/0/0", "Serial0/0/1"],
  switch: [...Array.from({ length: 8 }, (_, i) => `FastEthernet0/${i + 1}`), "GigabitEthernet0/1", "GigabitEthernet0/2"],
};

export function makeDevice(spec) {
  const d = {
    name: spec.name, kind: spec.kind, hostname: spec.hostname || spec.name,
    x: spec.x ?? 50, y: spec.y ?? 50, note: spec.note || "", locked: !!spec.locked, lockMsg: spec.lockMsg || "",
    ifaces: {}, ifOrder: [],
  };
  if (isHost(d)) {
    d.ifaces.eth0 = { name: "eth0" };
    d.ifOrder = ["eth0"];
    d.ipcfg = { mode: "static", ip: null, mask: null, gw: null, dns: null, ...(spec.ip || {}) };
    d.services = spec.services || [];
    d.files = spec.files ? { ...spec.files } : null;      // text files on a PC (inventory, playbooks)
    return d;
  }
  Object.assign(d, {
    vlans: d.kind === "switch" ? { 1: { name: "default" } } : null,
    routes: [], ospf: {}, acls: {}, natRules: [], natLog: [],
    dhcp: { excluded: [], pools: {} }, defaultGw: null,
    enableSecret: null, enablePassword: null, pwEncrypt: false, banner: null,
    domainLookup: true, domainName: null, users: {}, rsa: null, sshVersion: null,
    lines: {
      con: { password: null, login: "none", misc: [] },
      vty: { password: null, login: "line", transport: "all", accessClass: null, misc: [], last: 4 },
    },
    misc: [], startup: null,
  });
  for (const p of spec.ports || DEFAULT_PORTS[d.kind]) {
    d.ifaces[p] = newIface(d, p);
    d.ifOrder.push(p);
  }
  if (d.kind === "switch") ensureIface(d, "Vlan1");
  return d;
}

export function ospfCost(name) {
  return name.startsWith("Serial") ? 64 : 1;
}

// ---------- ACL evaluation ----------
function specMatch(spec, ip) {
  return spec.any || ((ip ^ spec.ip) & ~spec.wild) === 0;
}
function portMatch(pm, port) {
  if (!pm) return true;
  if (port == null) return false;
  switch (pm.op) {
    case "eq": return port === pm.n;
    case "neq": return port !== pm.n;
    case "gt": return port > pm.n;
    case "lt": return port < pm.n;
    case "range": return port >= pm.n && port <= pm.m;
  }
  return false;
}
function aclEntryMatch(acl, e, pkt) {
  if (acl.type === "standard") return specMatch(e.src, pkt.src);
  if (e.proto !== "ip" && e.proto !== pkt.proto) return false;
  if (!specMatch(e.src, pkt.src) || !specMatch(e.dst, pkt.dst)) return false;
  return portMatch(e.sport, pkt.sport) && portMatch(e.dport, pkt.dport);
}
// An applied ACL that doesn't exist (or is empty) permits everything, as in IOS.
export function aclPermit(d, name, pkt, count) {
  const acl = d.acls[name];
  if (!acl || !acl.entries.length) return true;
  for (const e of acl.entries) {
    if (aclEntryMatch(acl, e, pkt)) {
      if (count) e.hits = (e.hits || 0) + 1;
      return e.action === "permit";
    }
  }
  return false;
}

// ---------- the network ----------
export class Net {
  constructor() {
    this.devs = {};
    this.order = [];
    this.links = [];
    this.logs = {};
    this.leaseMemo = {};
    this._st = null;
    this._snap = null;
  }
  add(d) { this.devs[d.name] = d; this.order.push(d.name); this.logs[d.name] = []; return d; }
  link(a, ai, b, bi) { this.links.push({ a, ai, b, bi }); }
  touch() { this._st = null; }
  get st() { return this._st || (this._st = compute(this)); }
  peer(dev, ifn) {
    for (const l of this.links) {
      if (l.a === dev && l.ai === ifn) return { dev: l.b, ifn: l.bi };
      if (l.b === dev && l.bi === ifn) return { dev: l.a, ifn: l.ai };
    }
    return null;
  }

  // Compare interface / OSPF state with the last snapshot and queue IOS-style
  // console log lines for each device. Call after anything that changes config.
  collectEvents() {
    const st = this.st, snap = {};
    for (const dn of this.order) {
      const d = this.devs[dn];
      if (!isIos(d)) continue;
      const s = { ifs: {}, nbrs: {} };
      for (const n of d.ifOrder) {
        const x = st.status(dn, n);
        s.ifs[n] = (x.admin ? "A" : "a") + (x.up ? "U" : "u");
      }
      for (const nb of st.nbrs[dn] || []) s.nbrs[`${intToIp(nb.rid)}|${nb.iface}`] = nb.pid;
      snap[dn] = s;
      const old = this._snap && this._snap[dn];
      if (!old) continue;
      const log = this.logs[dn];
      for (const n of d.ifOrder) {
        const was = old.ifs[n], now = s.ifs[n];
        if (!was || was === now) continue;
        if (was[0] === "A" && now[0] === "a") {
          log.push(`%LINK-5-CHANGED: Interface ${n}, changed state to administratively down`);
          if (was[1] === "U") log.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${n}, changed state to down`);
        } else if (was[1] !== now[1]) {
          const to = now[1] === "U" ? "up" : "down";
          log.push(`%LINK-3-UPDOWN: Interface ${n}, changed state to ${to}`);
          log.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${n}, changed state to ${to}`);
        }
      }
      for (const k of Object.keys(s.nbrs)) {
        if (k in old.nbrs) continue;
        const [rid, ifn] = k.split("|");
        log.push(`%OSPF-5-ADJCHG: Process ${s.nbrs[k]}, Nbr ${rid} on ${ifn} from LOADING to FULL, Loading Done`);
      }
      for (const k of Object.keys(old.nbrs)) {
        if (k in s.nbrs) continue;
        const [rid, ifn] = k.split("|");
        log.push(`%OSPF-5-ADJCHG: Process ${old.nbrs[k]}, Nbr ${rid} on ${ifn} from FULL to DOWN, Neighbor Down: Interface down or detached`);
      }
    }
    this._snap = snap;
  }
  takeLogs(dn) {
    const l = this.logs[dn];
    this.logs[dn] = [];
    return l;
  }
}

function compute(net) {
  const devs = net.devs;

  // ----- layer 2: union-find over interfaces and (switch, vlan) segments -----
  const parent = new Map();
  const find = k => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(k) !== r) { const n = parent.get(k); parent.set(k, r); k = n; }
    return r;
  };
  const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const adminUp = (dn, ifn) => {
    const d = devs[dn];
    if (isHost(d)) return true;
    const i = d.ifaces[ifn];
    return !!i && !i.shutdown;
  };
  const physUp = (dn, ifn) => {
    if (!adminUp(dn, ifn)) return false;
    const p = net.peer(dn, ifn);
    return !!p && adminUp(p.dev, p.ifn);
  };

  // What a link end carries: tag ("u" = untagged, or a VLAN id) -> segment key.
  const side = (dn, ifn) => {
    const d = devs[dn], m = new Map();
    if (isHost(d)) { m.set("u", `${dn}|${ifn}`); return m; }
    if (d.kind === "router") {
      m.set("u", `${dn}|${ifn}`);
      for (const n of d.ifOrder) {
        if (!n.startsWith(ifn + ".")) continue;
        const s = d.ifaces[n];
        if (s.dot1q != null && !s.shutdown) m.set(s.dot1qNative ? "u" : s.dot1q, `${dn}|${n}`);
      }
      return m;
    }
    const sw = d.ifaces[ifn].sw;
    if (sw.mode === "trunk") {
      for (const v of Object.keys(d.vlans).map(Number)) {
        if (sw.allowed && !sw.allowed.includes(v)) continue;
        m.set(v === sw.native ? "u" : v, `${dn}#${v}`);
      }
    } else if (d.vlans[sw.accessVlan]) {
      m.set("u", `${dn}#${sw.accessVlan}`);
    }
    return m;
  };

  const vlanActive = {};
  for (const l of net.links) {
    if (!physUp(l.a, l.ai)) continue;
    const A = side(l.a, l.ai), B = side(l.b, l.bi);
    for (const k of [...A.values(), ...B.values()]) if (k.includes("#")) vlanActive[k] = true;
    for (const [tag, k] of A) if (B.has(tag)) unite(k, B.get(tag));
  }

  const status = (dn, ifn) => {
    const d = devs[dn], i = d.ifaces[ifn];
    if (!i) return { admin: false, up: false };
    if (isHost(d)) return { admin: true, up: physUp(dn, ifn) };
    const k = ifKind(ifn);
    if (k === "loop") return { admin: !i.shutdown, up: !i.shutdown };
    if (k === "vlan") {
      const v = Number(ifn.slice(4));
      return { admin: !i.shutdown, up: !i.shutdown && !!d.vlans[v] && !!vlanActive[`${dn}#${v}`] };
    }
    if (k === "sub") {
      const par = ifn.split(".")[0];
      return { admin: !i.shutdown, up: !i.shutdown && physUp(dn, par) };
    }
    if (k === "po") return { admin: !i.shutdown, up: false };
    return { admin: !i.shutdown, up: physUp(dn, ifn) };
  };

  for (const dn of net.order) {
    const d = devs[dn];
    if (d.kind !== "switch") continue;
    for (const n of d.ifOrder) {
      if (ifKind(n) === "vlan" && status(dn, n).up) unite(`${dn}|${n}`, `${dn}#${Number(n.slice(4))}`);
    }
  }

  // ----- layer 3 interfaces -----
  const l3 = {};
  for (const dn of net.order) {
    const d = devs[dn];
    l3[dn] = [];
    if (!isIos(d)) continue;
    for (const n of d.ifOrder) {
      const i = d.ifaces[n];
      if (i.ip != null && status(dn, n).up) l3[dn].push({ name: n, ip: i.ip, mask: i.mask, key: `${dn}|${n}` });
    }
  }
  const pcs = {};
  for (const dn of net.order) {
    const d = devs[dn];
    if (!isHost(d)) continue;
    const c = d.ipcfg;
    pcs[dn] = c.mode === "static" && c.ip != null
      ? { ip: c.ip, mask: c.mask, gw: c.gw, dns: c.dns, via: "static" }
      : { ip: null, mask: null, gw: null, dns: null, via: c.mode === "dhcp" ? "pending" : "none" };
  }

  // ----- routing tables: connected + static -----
  const rt = {};
  const routers = net.order.filter(dn => devs[dn].kind === "router");
  for (const dn of routers) {
    const d = devs[dn], list = [];
    for (const i of l3[dn]) {
      list.push({ net: netOf(i.ip, i.mask), mask: i.mask, len: maskLen(i.mask), proto: "C", ad: 0, metric: 0, iface: i.name, nh: null });
    }
    const connectedFor = ip => {
      let best = null;
      for (const r of list) if (r.proto === "C" && ((ip ^ r.net) & r.mask) === 0 && (!best || r.len > best.len)) best = r;
      return best;
    };
    for (const r of d.routes) {
      let iface = r.iface;
      if (iface) { if (!status(dn, iface).up) continue; }
      else { const c = connectedFor(r.nh); if (!c) continue; iface = c.iface; }
      list.push({ net: r.net, mask: r.mask, len: maskLen(r.mask), proto: "S", ad: r.ad || 1, metric: 0, iface, nh: r.nh ?? null });
    }
    rt[dn] = list;
  }

  // ----- OSPF -----
  const oifs = {}, rids = {}, nbrs = {};
  for (const dn of routers) {
    const d = devs[dn], list = [];
    nbrs[dn] = [];
    for (const [pidS, p] of Object.entries(d.ospf)) {
      const pid = Number(pidS);
      for (const i of l3[dn]) {
        if (list.some(x => x.name === i.name)) continue;
        const ifc = d.ifaces[i.name];
        let area = null;
        if (ifc.ospfArea && ifc.ospfArea.pid === pid) area = ifc.ospfArea.area;
        else for (const nw of p.networks) if (((i.ip ^ nw.ip) & ~nw.wild) === 0) { area = nw.area; break; }
        if (area === null) continue;
        const loop = ifKind(i.name) === "loop";
        const passive = loop || (p.passiveDefault ? !p.noPassive.includes(i.name) : p.passive.includes(i.name));
        list.push({
          pid, name: i.name, ip: i.ip, mask: i.mask, area, key: i.key, passive, loop,
          cost: ifc.ospfCost ?? ospfCost(i.name), pri: ifc.ospfPri ?? 1, hello: ifc.ospfHello ?? 10,
        });
      }
    }
    oifs[dn] = list;
    const procs = Object.values(d.ospf);
    let rid = procs.map(p => p.routerId).find(x => x != null) ?? null;
    if (rid == null && procs.length) {
      const loops = d.ifOrder.filter(n => ifKind(n) === "loop" && d.ifaces[n].ip != null && !d.ifaces[n].shutdown).map(n => d.ifaces[n].ip);
      const all = l3[dn].map(i => i.ip);
      rid = loops.length ? Math.max(...loops) : all.length ? Math.max(...all) : null;
    }
    rids[dn] = rid;
  }
  const sameL2 = (dnA, a, dnB, b) => {
    if (a.name.startsWith("Serial") || b.name.startsWith("Serial")) {
      const p = net.peer(dnA, a.name);
      return !!p && p.dev === dnB && p.ifn === b.name;
    }
    return find(a.key) === find(b.key);
  };
  const segs = {};
  for (let x = 0; x < routers.length; x++) {
    for (let y = x + 1; y < routers.length; y++) {
      const A = routers[x], B = routers[y];
      for (const a of oifs[A]) for (const b of oifs[B]) {
        if (a.passive || b.passive || a.mask !== b.mask || ((a.ip ^ b.ip) & a.mask) !== 0) continue;
        if (a.area !== b.area || a.hello !== b.hello) continue;
        if (rids[A] == null || rids[B] == null || rids[A] === rids[B]) continue;
        if (!sameL2(A, a, B, b)) continue;
        const serial = a.name.startsWith("Serial");
        const seg = `${find(a.key)}/${netOf(a.ip, a.mask)}`;
        (segs[seg] ||= new Map()).set(A, { rid: rids[A], pri: a.pri }).set(B, { rid: rids[B], pri: b.pri });
        nbrs[A].push({ dev: B, rid: rids[B], iface: a.name, addr: b.ip, pri: b.pri, cost: a.cost, pid: a.pid, seg, serial });
        nbrs[B].push({ dev: A, rid: rids[A], iface: b.name, addr: a.ip, pri: a.pri, cost: b.cost, pid: b.pid, seg, serial });
      }
    }
  }
  for (const dn of routers) {
    for (const nb of nbrs[dn]) {
      if (nb.serial) { nb.role = "-"; continue; }
      const order = [...segs[nb.seg].entries()].sort((p, q) => q[1].pri - p[1].pri || q[1].rid - p[1].rid).map(e => e[0]);
      nb.role = order[0] === nb.dev ? "DR" : order[1] === nb.dev ? "BDR" : "DROTHER";
      nb.myRole = order[0] === dn ? "DR" : order[1] === dn ? "BDR" : "DROTHER";
    }
  }
  for (const s of routers) {
    if (!oifs[s].length) continue;
    const dist = { [s]: 0 }, first = {}, done = new Set();
    for (;;) {
      let u = null;
      for (const k of Object.keys(dist)) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
      if (u === null) break;
      done.add(u);
      for (const nb of nbrs[u]) {
        const nd = dist[u] + nb.cost;
        if (dist[nb.dev] === undefined || nd < dist[nb.dev]) {
          dist[nb.dev] = nd;
          first[nb.dev] = u === s ? { nh: nb.addr, iface: nb.iface } : first[u];
        }
      }
    }
    const cand = new Map();
    const offer = (netw, mask, metric, proto, via) => {
      if (rt[s].some(r => r.proto === "C" && r.net === netw && r.mask === mask)) return;
      const k = `${netw}/${mask}`;
      const cur = cand.get(k);
      if (!cur || metric < cur.metric) cand.set(k, { net: netw, mask, len: maskLen(mask), proto, ad: 110, metric, nh: via.nh, iface: via.iface });
    };
    for (const x of Object.keys(dist)) {
      if (x === s) continue;
      for (const o of oifs[x]) {
        const mask = o.loop ? 0xffffffff : o.mask;
        offer(netOf(o.ip, mask), mask, dist[x] + o.cost, "O", first[x]);
      }
      for (const p of Object.values(devs[x].ospf)) {
        if (!p.defaultOriginate) continue;
        if (p.always || rt[x].some(r => r.proto === "S" && r.mask === 0)) offer(0, 0, 1, "O*E2", first[x]);
      }
    }
    rt[s].push(...cand.values());
  }
  // keep the best route per prefix (lowest administrative distance, then metric)
  for (const dn of routers) {
    const best = new Map();
    for (const r of rt[dn]) {
      const k = `${r.net}/${r.mask}`;
      const cur = best.get(k);
      if (!cur || r.ad < cur.ad || (r.ad === cur.ad && r.metric < cur.metric)) best.set(k, r);
    }
    rt[dn] = [...best.values()].sort((a, b) => a.net - b.net || a.len - b.len);
  }

  // ----- lookups and forwarding -----
  const owns = (dn, ip) => isHost(devs[dn]) ? pcs[dn].ip === ip : l3[dn].some(i => i.ip === ip);

  const lookup = (dn, ip) => {
    const d = devs[dn];
    if (isHost(d)) {
      const c = pcs[dn];
      if (c.ip == null) return null;
      if (((ip ^ c.ip) & c.mask) === 0) return { iface: "eth0", nh: ip };
      // a gateway outside the host's own subnet cannot be reached, as on a real PC
      return c.gw != null && ((c.gw ^ c.ip) & c.mask) === 0 ? { iface: "eth0", nh: c.gw } : null;
    }
    if (d.kind === "switch") {
      for (const i of l3[dn]) if (((ip ^ i.ip) & i.mask) === 0) return { iface: i.name, nh: ip };
      if (d.defaultGw != null) for (const i of l3[dn]) if (((d.defaultGw ^ i.ip) & i.mask) === 0) return { iface: i.name, nh: d.defaultGw };
      return null;
    }
    let best = null;
    for (const r of rt[dn]) if (((ip ^ r.net) & r.mask) === 0 && (!best || r.len > best.len)) best = r;
    return best ? { iface: best.iface, nh: best.nh ?? ip, route: best } : null;
  };

  const l2resolve = (dn, ifn, nh) => {
    if (ifn.startsWith("Serial")) {
      const p = net.peer(dn, ifn);
      return p && status(p.dev, p.ifn).up ? { dev: p.dev, iface: p.ifn } : null;
    }
    const root = find(`${dn}|${ifn}`);
    for (const on of net.order) {
      if (on === dn) continue;
      if (isHost(devs[on])) {
        if (pcs[on].ip === nh && find(`${on}|eth0`) === root && status(on, "eth0").up) return { dev: on, iface: "eth0" };
      } else {
        for (const i of l3[on]) if (i.ip === nh && find(i.key) === root) return { dev: on, iface: i.name };
        if (devs[on].kind === "router" && devs[on].natRules.some(r => r.type === "static" && r.global === nh)) {
          for (const i of l3[on]) if (devs[on].ifaces[i.name].nat === "outside" && find(i.key) === root) return { dev: on, iface: i.name };
        }
      }
    }
    return null;
  };

  const srcIpFor = (dn, dst) => {
    if (isHost(devs[dn])) return pcs[dn].ip;
    const r = lookup(dn, dst);
    if (!r) return null;
    const i = l3[dn].find(x => x.name === r.iface);
    return i ? i.ip : null;
  };

  function forward(start, pkt, ctx) {
    let cur = start, inIf = null, ttl = 24;
    const hops = [];
    pkt = { ...pkt };
    const fail = (reason, extra) => ({ ok: false, reason, at: cur, hops, pkt, ...extra });
    while (ttl-- > 0) {
      const d = devs[cur];
      const router = d.kind === "router";
      if (inIf && router) {
        const i = d.ifaces[inIf];
        if (i.aclIn && !aclPermit(d, i.aclIn, pkt, ctx.user)) return fail("acl", { acl: i.aclIn, iface: inIf });
        if (i.nat === "outside") {
          const t = ctx.trans.find(x => x.router === cur && x.global === pkt.dst && x.peer === pkt.src);
          if (t) pkt.dst = t.local;
          else {
            const s = d.natRules.find(r => r.type === "static" && r.global === pkt.dst);
            if (s) pkt.dst = s.local;
          }
        }
      }
      if (owns(cur, pkt.dst)) return { ok: true, dev: cur, hops, pkt };
      if (inIf && !router) return fail("notforme");
      const r = lookup(cur, pkt.dst);
      if (!r) return fail("noroute");
      const oi = d.ifaces[r.iface];
      if (inIf && router) {
        if (d.ifaces[inIf].nat === "inside" && oi.nat === "outside") {
          const orig = pkt.src;
          const s = d.natRules.find(x => x.type === "static" && x.local === pkt.src);
          if (s) pkt.src = s.global;
          else {
            const o = d.natRules.find(x => x.type === "overload" && x.iface === r.iface && aclPermit(d, x.acl, { src: pkt.src, dst: pkt.dst, proto: "ip" }, false) && d.acls[x.acl]);
            if (o && oi.ip != null) pkt.src = oi.ip;
          }
          if (pkt.src !== orig) {
            ctx.trans.push({ router: cur, local: orig, global: pkt.src, peer: pkt.dst });
            if (ctx.user && !s) {
              d.natLog = d.natLog.filter(x => !(x.local === orig && x.peer === pkt.dst && x.proto === pkt.proto));
              d.natLog.push({ proto: pkt.proto, local: orig, global: pkt.src, peer: pkt.dst, port: pkt.sport || 1 });
              if (d.natLog.length > 12) d.natLog.shift();
            }
          }
        }
        if (oi.aclOut && !aclPermit(d, oi.aclOut, pkt, ctx.user)) return fail("acl", { acl: oi.aclOut, iface: r.iface });
      }
      const nxt = l2resolve(cur, r.iface, r.nh);
      if (!nxt) return fail("arp", { iface: r.iface, nh: r.nh });
      hops.push({ dev: cur, out: r.iface, to: nxt.dev, toIf: nxt.iface });
      cur = nxt.dev;
      inIf = nxt.iface;
    }
    return fail("ttl");
  }

  // Round trip: request there, reply back. opts: {proto, dport, user}
  function reach(from, dst, opts = {}) {
    const proto = opts.proto || "icmp";
    const src = opts.src ?? srcIpFor(from, dst);
    if (src == null) return { ok: false, stage: "request", reason: isHost(devs[from]) && pcs[from].ip == null ? "noip" : "noroute", at: from, hops: [] };
    const ctx = { trans: [], user: !!opts.user };
    const tcpish = proto === "tcp" || proto === "udp";
    const req = forward(from, { src, dst, proto, sport: tcpish ? 49152 : null, dport: tcpish ? opts.dport : null }, ctx);
    if (!req.ok) return { ...req, stage: "request" };
    const rep = forward(req.dev, { src: req.pkt.dst, dst: req.pkt.src, proto, sport: req.pkt.dport, dport: req.pkt.sport }, ctx);
    if (!rep.ok) return { ...rep, stage: "reply", target: req.dev, reqHops: req.hops };
    if (rep.dev !== from) return { ok: false, stage: "reply", reason: "notforme", at: rep.dev, hops: rep.hops, target: req.dev, reqHops: req.hops };
    return { ok: true, target: req.dev, hops: req.hops, back: rep.hops };
  }

  const st = { net, find, status, l3, pcs, rt, nbrs, oifs, rids, owns, lookup, reach, leases: {}, vlanActive };

  // ----- DHCP: resolve leases for hosts set to DHCP -----
  const used = new Set();
  for (const dn of net.order) {
    for (const i of l3[dn]) used.add(i.ip);
    if (pcs[dn] && pcs[dn].ip != null) used.add(pcs[dn].ip);
  }
  const poolFor = (srv, netw, mask) => {
    for (const [name, p] of Object.entries(devs[srv].dhcp.pools)) {
      if (p.net != null && p.net === netw && p.mask === mask) return { name, ...p };
    }
    return null;
  };
  const clients = net.order.filter(dn => isHost(devs[dn]) && devs[dn].ipcfg.mode === "dhcp").sort();
  for (const h of clients) {
    let found = null;
    if (status(h, "eth0").up) {
      const root = find(`${h}|eth0`);
      outer: for (const rn of routers) {
        for (const i of l3[rn]) {
          if (find(i.key) !== root) continue;
          const netw = netOf(i.ip, i.mask);
          const own = poolFor(rn, netw, i.mask);
          if (own) { found = { server: rn, pool: own }; break outer; }
          for (const hip of devs[rn].ifaces[i.name].helpers) {
            const srv = routers.find(x => x !== rn && l3[x].some(e => e.ip === hip));
            if (!srv) continue;
            const p = poolFor(srv, netw, i.mask);
            if (p && reach(rn, hip, { src: i.ip }).ok) { found = { server: srv, pool: p }; break outer; }
          }
        }
      }
    }
    if (!found) {
      let n = 0;
      for (const c of h) n = (n * 31 + c.charCodeAt(0)) % 250;
      pcs[h] = { ip: ((169 << 24) | (254 << 16) | (1 << 8) | (n + 1)) >>> 0, mask: 0xffff0000, gw: null, dns: null, via: "apipa" };
      delete net.leaseMemo[h];
      continue;
    }
    const { server, pool } = found;
    const excluded = ip => devs[server].dhcp.excluded.some(([lo, hi]) => ip >= lo && ip <= hi);
    const lo = pool.net + 1, hi = bcastOf(pool.net, pool.mask) - 1;
    let ip = net.leaseMemo[h];
    if (ip == null || ip < lo || ip > hi || excluded(ip) || used.has(ip)) {
      ip = null;
      for (let c = lo; c <= hi; c++) if (!excluded(c) && !used.has(c)) { ip = c; break; }
    }
    if (ip == null) { pcs[h] = { ip: null, mask: null, gw: null, dns: null, via: "pending" }; continue; }
    used.add(ip);
    net.leaseMemo[h] = ip;
    pcs[h] = { ip, mask: pool.mask, gw: pool.gw ?? null, dns: pool.dns ?? null, via: "dhcp", server, pool: pool.name };
    (st.leases[server] ||= []).push({ ip, client: h, pool: pool.name });
  }

  return st;
}
