// Objective checks. Each returns a function (net, lab) => boolean.

import { ipToInt, maskLen } from "../engine/ip.js";
import { normIf } from "../engine/network.js";
import { runningConfig, remoteAccess } from "../engine/ios.js";

const I = s => ipToInt(s);
const iface = (net, dev, n) => net.devs[dev].ifaces[normIf(n)];

export const C = {
  // --- player actions
  reachedMode: (dev, mode) => (net, lab) => lab.seen.has(`mode:${dev}:${mode}`),
  ran: (dev, re) => (net, lab) => (lab.cmdLog[dev] || []).some(c => re.test(c)),

  // --- device basics
  hostname: (dev, name) => net => net.devs[dev].hostname === name,
  saved: dev => net => net.devs[dev].startup !== null && net.devs[dev].startup === runningConfig(net.devs[dev]),
  // saved, and different from how the device started (for troubleshooting tickets)
  savedChanged: dev => (net, lab) => { const run = runningConfig(net.devs[dev]); return net.devs[dev].startup === run && lab.initial[dev] !== run; },
  enableSecret: (dev, pw) => net => net.devs[dev].enableSecret === pw,
  linePassword: (dev, line, pw) => net => { const l = net.devs[dev].lines[line]; return l.password === pw && l.login === "line"; },
  pwEncryption: dev => net => net.devs[dev].pwEncrypt,
  bannerHas: (dev, word) => net => (net.devs[dev].banner || "").toLowerCase().includes(word.toLowerCase()),

  // --- interfaces
  ifaceIp: (dev, n, addr, mask) => net => { const i = iface(net, dev, n); return !!i && i.ip === I(addr) && i.mask === I(mask); },
  ifaceUp: (dev, n) => net => net.st.status(dev, normIf(n)).up,
  ifaceShut: (dev, list) => net => list.every(n => iface(net, dev, n).shutdown),
  dot1q: (dev, n, vlan) => net => { const i = iface(net, dev, n); return !!i && i.dot1q === vlan; },
  hostIp: (dev, addr, mask, gw) => net => { const c = net.devs[dev].ipcfg; return c.mode === "static" && c.ip === I(addr) && c.mask === I(mask) && c.gw === I(gw); },
  defaultGw: (dev, gw) => net => net.devs[dev].defaultGw === I(gw),

  // --- switching
  vlan: (dev, id, name) => net => { const v = net.devs[dev].vlans[id]; return !!v && (!name || v.name.toLowerCase() === name.toLowerCase()); },
  accessVlan: (dev, list, vlan) => net => list.every(n => { const s = iface(net, dev, n).sw; return s.mode === "access" && s.accessVlan === vlan; }),
  trunk: (dev, n) => net => iface(net, dev, n).sw.mode === "trunk",
  trunkAllows: (dev, n, vlans) => net => {
    const a = iface(net, dev, n).sw.allowed;
    return !!a && a.length === vlans.length && vlans.every(v => a.includes(v));
  },
  portSecurity: (dev, list, want) => net => list.every(n => {
    const ps = iface(net, dev, n).sw.ps;
    return ps.on && (want.max == null || ps.max === want.max) && (!want.violation || ps.violation === want.violation) && (want.sticky == null || ps.sticky === want.sticky);
  }),
  edgePort: (dev, list) => net => list.every(n => { const s = iface(net, dev, n).sw; return s.portfast && s.bpduguard; }),

  // --- routing
  hasRoute: (dev, prefix, proto) => net => {
    const [a, len] = prefix.split("/");
    return net.st.rt[dev].some(r => r.net === I(a) && r.len === Number(len) && (!proto || r.proto.startsWith(proto)));
  },
  // a static route to the prefix through this next hop with exactly this administrative distance
  floating: (dev, prefix, nh, ad) => net => {
    const [a, len] = prefix.split("/");
    return net.devs[dev].routes.some(r => r.net === I(a) && maskLen(r.mask) === Number(len) && r.nh === I(nh) && (r.ad || 1) === ad);
  },
  // the route the device would use for this address right now: prefix length and next hop
  routeVia: (dev, addr, nh, len) => net => {
    const r = net.st.lookup(dev, I(addr));
    return !!r && !!r.route && r.nh === (r.route.nh == null ? I(addr) : I(nh)) && r.route.nh === I(nh) && (len == null || r.route.len === len);
  },
  helper: (dev, n, addr) => net => { const i = iface(net, dev, n); return !!i && i.helpers.includes(I(addr)); },
  // true once the condition has held at some moment during the lab (for "prove the failover" objectives)
  sticky: (key, cond) => (net, lab) => { if (cond(net, lab)) lab.seen.add("sticky:" + key); return lab.seen.has("sticky:" + key); },
  staticRoute: (dev, prefix) => net => {
    const [a, len] = prefix.split("/");
    return net.devs[dev].routes.some(r => r.net === I(a) && maskLen(r.mask) === Number(len));
  },
  noOspf: devs => net => devs.every(d => !Object.keys(net.devs[d].ospf).length),
  ospfNeighbors: (dev, count) => net => (net.st.nbrs[dev] || []).length >= count,
  ospfNeighbor: (dev, other) => net => (net.st.nbrs[dev] || []).some(n => n.dev === other),
  routerId: (dev, rid) => net => net.st.rids[dev] === I(rid),
  ospfPassive: (dev, n) => net => { const o = (net.st.oifs[dev] || []).find(x => x.name === normIf(n)); return !!o && o.passive; },

  // --- reachability
  ping: (from, to) => net => net.st.reach(from, I(to)).ok,
  pingHost: (from, to) => net => { const c = net.st.pcs[to]; return c.ip != null && c.via !== "apipa" && net.st.reach(from, c.ip).ok; },
  noPing: (from, to) => net => !net.st.reach(from, I(to)).ok,
  tcp: (from, to, port) => net => net.st.reach(from, I(to), { proto: "tcp", dport: port }).ok,
  noTcp: (from, to, port) => net => !net.st.reach(from, I(to), { proto: "tcp", dport: port }).ok,

  // --- services
  dhcpLease: (pc, prefix, minHost) => net => {
    const c = net.st.pcs[pc];
    const [a, len] = prefix.split("/");
    if (c.via !== "dhcp" || maskLen(c.mask) !== Number(len) || ((c.ip & c.mask) >>> 0) !== I(a)) return false;
    return minHost == null || c.ip - I(a) >= minHost;
  },
  natRole: (dev, n, role) => net => { const i = iface(net, dev, n); return !!i && i.nat === role; },
  natOverload: dev => net => net.devs[dev].natRules.some(r => r.type === "overload"),
  natStatic: (dev, local, global) => net => net.devs[dev].natRules.some(r => r.type === "static" && r.local === I(local) && r.global === I(global)),
  aclApplied: (dev, n, dir) => net => { const i = iface(net, dev, n); const name = dir === "in" ? i.aclIn : i.aclOut; return !!name && !!net.devs[dev].acls[name]; },

  // --- remote access
  ssh: (from, to, user) => net => {
    const r = remoteAccess(net, from, I(to), "ssh");
    return r.ok && r.login === "local" && !!net.devs[r.dev].users[user];
  },
  noSsh: (from, to) => net => !remoteAccess(net, from, I(to), "ssh").ok,
  noTelnet: (from, to) => net => { const r = remoteAccess(net, from, I(to), "telnet"); return !r.ok && r.reason !== "timeout"; },
  rsaBits: (dev, min) => net => (net.devs[dev].rsa || 0) >= min,
  domainName: (dev, name) => net => net.devs[dev].domainName === name,
  userSecret: (dev, user) => net => { const u = net.devs[dev].users[user]; return !!u && u.kind === "secret"; },
  sshV2: dev => net => net.devs[dev].sshVersion === 2,

  // --- Ansible
  // the inventory on the control node lists every one of these addresses
  inventoryHas: (pc, addrs) => net => { const text = (net.devs[pc].files || {})["inventory.ini"] || ""; return addrs.every(a => new RegExp("ansible_host=" + a.replace(/\./g, "\\.") + "(\\s|$)", "m").test(text.replace(/[#;].*$/gm, ""))); },
  // the last real (not --check) playbook run reached all these hosts with no failure
  ansibleClean: hosts => net => {
    const last = net.ansibleLast;
    return !!last && hosts.every(h => last.results[h] && last.results[h].failed === 0 && last.results[h].unreachable === 0 && last.results[h].ok > 0);
  },

  all: (...fns) => (net, lab) => fns.every(f => f(net, lab)),
};
