// A Cisco-IOS-style CLI for simulated routers and switches: modes, command
// abbreviation, "?" help, tab completion, show commands, running-config.

import { ipToInt, intToIp, maskLen, lenMask, netOf, bcastOf } from "./ip.js";
import { normIf, shortIf, ifKind, ensureIface, removeIface, fakeMac, defaultBandwidth, isHost } from "./network.js";

// ---------------------------------------------------------------- registry
const CMDS = {};
function reg(modes, pat, fn, kinds) {
  const toks = pat.split(" ").map(t => (t[0] === "<" ? { p: t.slice(1, -1) } : { lits: t.split("|") }));
  for (const m of modes.split(",")) (CMDS[m] ||= []).push({ toks, fn, kinds });
}
const EXEC = "user,priv";
const SUB = "if,line,router,vlan,dhcp,acl";
const CFG_ALL = "config," + SUB;

const PARAM_HELP = { word: "WORD", num: "<number>", ip: "A.B.C.D", mask: "A.B.C.D or /nn", if: "<interface>", rest: "LINE" };
const PORTS = { www: 80, http: 80, https: 443, ssh: 22, telnet: 23, ftp: 21, smtp: 25, domain: 53, dns: 53, tftp: 69, bootps: 67, bootpc: 68, snmp: 161, ntp: 123 };
const PORT_NAMES = { 80: "www", 23: "telnet", 21: "ftp", 25: "smtp", 53: "domain", 69: "tftp", 67: "bootps", 68: "bootpc" };

function conv(type, t) {
  switch (type) {
    case "word": return t;
    case "num": return /^\d+$/.test(t) ? Number(t) : undefined;
    case "ip": { const v = ipToInt(t); return v === null ? undefined : v; }
    case "mask": {
      if (/^\/\d{1,2}$/.test(t) && Number(t.slice(1)) <= 32) return lenMask(Number(t.slice(1)));
      const v = ipToInt(t);
      return v === null || maskLen(v) === null ? undefined : v;
    }
    case "if": return normIf(t) || undefined;
  }
  return undefined;
}

function tokenize(line) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) out.push({ t: m[0], pos: m.index });
  // join "gig 0/1" style interface names when they follow an interface keyword
  for (let i = 1; i < out.length - 1; i++) {
    const prev = out[i - 1].t.toLowerCase();
    const intro = prev.length >= 2 && ["interface", "interfaces", "passive-interface", "range"].some(k => k.startsWith(prev));
    if (intro && /^[a-z-]+$/i.test(out[i].t) && /^\d+([\/.]\d+)*$/.test(out[i + 1].t) && normIf(out[i].t + out[i + 1].t)) {
      out.splice(i, 2, { t: out[i].t + out[i + 1].t, pos: out[i].pos });
    }
  }
  return out;
}

// Walk the command table token by token. Returns the surviving candidates.
function walk(mode, kind, toks, line) {
  let alive = (CMDS[mode] || []).filter(c => !c.kinds || c.kinds.includes(kind)).map(c => ({ c, args: [] }));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t, tl = t.toLowerCase();
    const lit = [], par = [], done = [];
    const words = new Set();
    for (const a of alive) {
      if (a.done) { done.push(a); continue; }
      const pt = a.c.toks[i];
      if (!pt) continue;
      if (pt.lits) {
        const hit = pt.lits.filter(l => l.startsWith(tl));
        if (!hit.length) continue;
        const ex = hit.find(l => l === tl);
        const w = ex || hit[0];
        if (!ex) hit.forEach(h => words.add(h)); else words.add(ex);
        lit.push({ c: a.c, args: pt.lits.length > 1 ? [...a.args, w] : a.args, w, ex: !!ex, amb: !ex && hit.length > 1 });
      } else if (pt.p === "rest") {
        done.push({ c: a.c, args: [...a.args, line.slice(toks[i].pos).trim()], done: true });
      } else {
        const v = conv(pt.p, t);
        if (v !== undefined) par.push({ c: a.c, args: [...a.args, v] });
      }
    }
    let next;
    if (lit.length) {
      const exact = lit.filter(x => x.ex);
      if (exact.length) next = exact;
      else {
        if (words.size > 1) return { err: "ambiguous" };
        next = lit;
      }
      next = next.concat(done);
    } else next = par.concat(done);
    if (!next.length) return { err: "invalid", pos: toks[i].pos };
    alive = next;
  }
  return { alive };
}

function parse(mode, kind, line) {
  const toks = tokenize(line);
  const w = walk(mode, kind, toks, line);
  if (w.err) return w;
  const full = w.alive.filter(a => a.done || a.c.toks.length === toks.length);
  if (!full.length) return { err: "incomplete" };
  return { cmd: full[0].c, args: full[0].args };
}

// ---------------------------------------------------------------- helpers
const pad = (s, n) => String(s).padEnd(n);
const INVALID = "% Invalid input detected.";

function fakeHash(s) {
  let h = 5381;
  for (const c of s) h = (Math.imul(h, 33) ^ c.charCodeAt(0)) >>> 0;
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./";
  let out = "";
  for (let i = 0; i < 22; i++) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; out += abc[(h >>> 16) % 64]; }
  return "$1$mERr$" + out;
}
const type7 = s => "0822" + [...s].map(c => (c.charCodeAt(0) ^ 0x55).toString(16).padStart(2, "0").toUpperCase()).join("");

function parseVlanList(text) {
  const out = new Set();
  for (const part of text.replace(/\s+/g, "").split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    if (a < 1 || b > 4094 || a > b) return null;
    for (let v = a; v <= b; v++) out.add(v);
  }
  return [...out].sort((x, y) => x - y);
}
function vlanListText(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    let j = i;
    while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++;
    out.push(i === j ? `${arr[i]}` : `${arr[i]}-${arr[j]}`);
    i = j;
  }
  return out.join(",") || "none";
}

function parseIfRange(d, text) {
  const names = [];
  for (const part of text.replace(/\s*-\s*/g, "-").split(",").map(x => x.trim()).filter(Boolean)) {
    const m = /^([a-z-]+)\s*((?:\d+\/)*)(\d+)(?:-(\d+))?$/i.exec(part);
    if (!m) return null;
    const a = Number(m[3]), b = Number(m[4] ?? m[3]);
    for (let n = a; n <= b; n++) {
      const name = normIf(`${m[1]}${m[2]}${n}`);
      if (!name || !d.ifaces[name]) return null;
      names.push(name);
    }
  }
  return names.length ? names : null;
}

// ---- ACL text <-> entries
function parseAddrSpec(toks, i, standard) {
  const t = (toks[i] || "").toLowerCase();
  if (t === "any") return { spec: { any: true }, i: i + 1 };
  if (t === "host") {
    const ip = ipToInt(toks[i + 1] || "");
    return ip === null ? null : { spec: { ip, wild: 0 }, i: i + 2 };
  }
  const ip = ipToInt(toks[i] || "");
  if (ip === null) return null;
  const wild = ipToInt(toks[i + 1] || "");
  if (wild === null) return standard ? { spec: { ip, wild: 0 }, i: i + 1 } : null;
  return { spec: { ip, wild }, i: i + 2 };
}
function parsePortSpec(toks, i) {
  const op = (toks[i] || "").toLowerCase();
  if (!["eq", "neq", "gt", "lt", "range"].includes(op)) return { pm: null, i };
  const num = s => (s === undefined ? null : /^\d+$/.test(s) ? Number(s) : PORTS[s.toLowerCase()] ?? null);
  const n = num(toks[i + 1]);
  if (n === null) return null;
  if (op === "range") {
    const m = num(toks[i + 2]);
    return m === null ? null : { pm: { op, n, m }, i: i + 3 };
  }
  return { pm: { op, n }, i: i + 2 };
}
function parseAclRule(type, text) {
  const toks = text.trim().split(/\s+/);
  const act = ["permit", "deny"].find(a => toks[0] && a.startsWith(toks[0].toLowerCase()));
  if (!act) return null;
  if (type === "standard") {
    const s = parseAddrSpec(toks, 1, true);
    if (!s || s.i < toks.length && toks[s.i].toLowerCase() !== "log") return null;
    return { action: act, src: s.spec };
  }
  const proto = (toks[1] || "").toLowerCase();
  if (!["ip", "icmp", "tcp", "udp"].includes(proto)) return null;
  let i = 2;
  const s = parseAddrSpec(toks, i, false);
  if (!s) return null;
  i = s.i;
  const tcpish = proto === "tcp" || proto === "udp";
  let sport = null, dport = null;
  if (tcpish) { const p = parsePortSpec(toks, i); if (!p) return null; sport = p.pm; i = p.i; }
  const d = parseAddrSpec(toks, i, false);
  if (!d) return null;
  i = d.i;
  if (tcpish) { const p = parsePortSpec(toks, i); if (!p) return null; dport = p.pm; i = p.i; }
  const tail = toks.slice(i).map(x => x.toLowerCase());
  if (tail.some(x => !["log", "established", "echo", "echo-reply"].includes(x))) return null;
  return { action: act, proto, src: s.spec, dst: d.spec, sport, dport };
}
const specText = (s, standard) => s.any ? "any" : s.wild === 0 ? (standard ? intToIp(s.ip) : `host ${intToIp(s.ip)}`) : `${intToIp(s.ip)} ${intToIp(s.wild)}`;
const portText = pm => !pm ? "" : pm.op === "range" ? ` range ${pm.n} ${pm.m}` : ` ${pm.op} ${PORT_NAMES[pm.n] || pm.n}`;
function aclRuleText(type, e) {
  if (type === "standard") return `${e.action} ${specText(e.src, true)}`;
  return `${e.action} ${e.proto} ${specText(e.src)}${portText(e.sport)} ${specText(e.dst)}${portText(e.dport)}`;
}
const aclTypeOfNumber = n => (n >= 1 && n <= 99) || (n >= 1300 && n <= 1999) ? "standard" : (n >= 100 && n <= 199) || (n >= 2000 && n <= 2699) ? "extended" : null;
function addAclRule(d, name, type, text, seq) {
  const rule = parseAclRule(type, text);
  if (!rule) return false;
  const acl = (d.acls[name] ||= { type, entries: [] });
  if (acl.type !== type) return false;
  rule.seq = seq ?? (acl.entries.length ? Math.max(...acl.entries.map(e => e.seq)) + 10 : 10);
  acl.entries = acl.entries.filter(e => e.seq !== rule.seq);
  acl.entries.push(rule);
  acl.entries.sort((a, b) => a.seq - b.seq);
  return true;
}

// ---------------------------------------------------------------- running-config
export function runningConfig(d) {
  const L = [];
  const add = (...x) => L.push(...x);
  add("!", "version 15.2", d.pwEncrypt ? "service password-encryption" : "no service password-encryption", "!", `hostname ${d.hostname}`, "!");
  const pw = p => (d.pwEncrypt ? `7 ${type7(p)}` : p);
  if (d.enableSecret) add(`enable secret 5 ${fakeHash(d.enableSecret)}`);
  if (d.enablePassword) add(`enable password ${pw(d.enablePassword)}`);
  if (d.enableSecret || d.enablePassword) add("!");
  for (const [lo, hi] of d.dhcp.excluded) add(`ip dhcp excluded-address ${intToIp(lo)}${hi !== lo ? " " + intToIp(hi) : ""}`);
  for (const [name, p] of Object.entries(d.dhcp.pools)) {
    add("!", `ip dhcp pool ${name}`);
    if (p.net != null) add(` network ${intToIp(p.net)} ${intToIp(p.mask)}`);
    if (p.gw != null) add(` default-router ${intToIp(p.gw)}`);
    if (p.dns != null) add(` dns-server ${intToIp(p.dns)}`);
    for (const m of p.misc || []) add(` ${m}`);
  }
  if (d.dhcp.excluded.length || Object.keys(d.dhcp.pools).length) add("!");
  if (!d.domainLookup) add("no ip domain-lookup");
  if (d.domainName) add(`ip domain-name ${d.domainName}`);
  if (d.sshVersion) add(`ip ssh version ${d.sshVersion}`);
  for (const [u, x] of Object.entries(d.users)) add(`username ${u}${x.priv != null ? ` privilege ${x.priv}` : ""} ${x.kind === "secret" ? `secret 5 ${fakeHash(x.pw)}` : `password ${pw(x.pw)}`}`);
  for (const m of d.misc.filter(x => !x.startsWith("ip route") && !x.startsWith("logging") && !x.startsWith("ntp") && !x.startsWith("snmp"))) add(m);
  if (d.stp) {
    add(`spanning-tree mode ${d.stp.mode}`);
    for (const v of Object.keys(d.stp.prio).map(Number).sort((x, y) => x - y)) add(`spanning-tree vlan ${v} priority ${d.stp.prio[v]}`);
  }
  add("!");
  for (const n of d.ifOrder) {
    const i = d.ifaces[n];
    add(`interface ${n}`);
    if (i.desc) add(` description ${i.desc}`);
    if (i.dot1q != null) add(` encapsulation dot1Q ${i.dot1q}${i.dot1qNative ? " native" : ""}`);
    if (i.sw) {
      const s = i.sw;
      if (s.accessVlan !== 1) add(` switchport access vlan ${s.accessVlan}`);
      if (s.native !== 1) add(` switchport trunk native vlan ${s.native}`);
      if (s.allowed) add(` switchport trunk allowed vlan ${vlanListText(s.allowed)}`);
      if (s.mode) add(` switchport mode ${s.mode}`);
      else if (s.dtp === "desirable") add(" switchport mode dynamic desirable");
      if (s.nonegotiate) add(" switchport nonegotiate");
      if (s.ps.on) add(" switchport port-security");
      if (s.ps.max !== 1) add(` switchport port-security maximum ${s.ps.max}`);
      if (s.ps.violation !== "shutdown") add(` switchport port-security violation ${s.ps.violation}`);
      if (s.ps.sticky) add(" switchport port-security mac-address sticky");
      if (s.portfast) add(" spanning-tree portfast");
      if (s.guard) add(` spanning-tree guard ${s.guard}`);
      if (s.stpCost != null) add(` spanning-tree cost ${s.stpCost}`);
      if (s.bpduguard) add(" spanning-tree bpduguard enable");
    } else if (i.ip != null) add(` ip address ${intToIp(i.ip)} ${intToIp(i.mask)}`);
    else if (d.kind === "router" || ifKind(n) === "vlan") add(" no ip address");
    for (const h of i.helpers) add(` ip helper-address ${intToIp(h)}`);
    if (i.aclIn) add(` ip access-group ${i.aclIn} in`);
    if (i.aclOut) add(` ip access-group ${i.aclOut} out`);
    if (i.nat) add(` ip nat ${i.nat}`);
    if (i.ospfArea) add(` ip ospf ${i.ospfArea.pid} area ${i.ospfArea.area}`);
    if (i.ospfCost != null) add(` ip ospf cost ${i.ospfCost}`);
    if (i.ospfPri != null) add(` ip ospf priority ${i.ospfPri}`);
    if (i.ospfHello != null) add(` ip ospf hello-interval ${i.ospfHello}`);
    if (i.ospfDead != null) add(` ip ospf dead-interval ${i.ospfDead}`);
    if (i.ospfNet) add(` ip ospf network ${i.ospfNet === "p2p" ? "point-to-point" : "broadcast"}`);
    if (i.channel) add(` channel-group ${i.channel.id} mode ${i.channel.mode}`);
    for (const m of i.misc) add(` ${m}`);
    if (i.shutdown) add(" shutdown");
    add("!");
  }
  for (const [pid, p] of Object.entries(d.ospf)) {
    add(`router ospf ${pid}`);
    if (p.routerId != null) add(` router-id ${intToIp(p.routerId)}`);
    if (p.passiveDefault) add(" passive-interface default");
    for (const n of p.noPassive) add(` no passive-interface ${n}`);
    for (const n of p.passive) add(` passive-interface ${n}`);
    for (const nw of p.networks) add(` network ${intToIp(nw.ip)} ${intToIp(nw.wild)} area ${nw.area}`);
    if (p.defaultOriginate) add(` default-information originate${p.always ? " always" : ""}`);
    for (const m of p.misc) add(` ${m}`);
    add("!");
  }
  if (d.defaultGw != null) add(`ip default-gateway ${intToIp(d.defaultGw)}`);
  for (const r of d.natRules) {
    add(r.type === "static" ? `ip nat inside source static ${intToIp(r.local)} ${intToIp(r.global)}` : `ip nat inside source list ${r.acl} interface ${r.iface} overload`);
  }
  for (const r of d.routes) add(`ip route ${intToIp(r.net)} ${intToIp(r.mask)} ${r.iface || intToIp(r.nh)}${r.ad && r.ad !== 1 ? " " + r.ad : ""}`);
  add("!");
  for (const [name, acl] of Object.entries(d.acls)) {
    if (/^\d+$/.test(name)) for (const e of acl.entries) add(`access-list ${name} ${aclRuleText(acl.type, e)}`);
    else { add(`ip access-list ${acl.type} ${name}`); for (const e of acl.entries) add(` ${aclRuleText(acl.type, e)}`); }
  }
  for (const m of d.misc.filter(x => x.startsWith("logging") || x.startsWith("ntp") || x.startsWith("snmp"))) add(m);
  if (d.banner) add("!", `banner motd ^C${d.banner}^C`);
  add("!", "line con 0");
  const line = l => {
    if (l.password) add(` password ${pw(l.password)}`);
    for (const m of l.misc) add(` ${m}`);
    if (l.accessClass) add(` access-class ${l.accessClass} in`);
    if (l.login === "line") add(" login"); else if (l.login === "local") add(" login local");
    if (l.transport && l.transport !== "all") add(` transport input ${l.transport}`);
  };
  line(d.lines.con);
  add(`line vty 0 ${d.lines.vty.last}`);
  line(d.lines.vty);
  add("!", "end");
  return L.join("\n");
}

// ---------------------------------------------------------------- show commands
function ifStatusWords(s, d, n) {
  const st = s.net.st.status(d.name, n);
  if (!st.admin) return ["administratively down", "down"];
  if (d.ifaces[n].errdisabled) return ["down", "down (err-disabled)"];
  return st.up ? ["up", "up"] : ["down", "down"];
}

function showIpIntBrief(s) {
  const d = s.dev;
  const out = ["Interface              IP-Address      OK? Method Status                Protocol"];
  for (const n of d.ifOrder) {
    const i = d.ifaces[n];
    const [a, b] = ifStatusWords(s, d, n);
    out.push(`${pad(n, 22)} ${pad(i.ip != null ? intToIp(i.ip) : "unassigned", 15)} YES ${pad(i.ip != null ? "manual" : "unset", 6)} ${pad(a, 21)} ${b}`);
  }
  return out.join("\n");
}

function showInterfaces(s, name) {
  const d = s.dev, out = [];
  for (const n of name ? [name] : d.ifOrder) {
    const i = d.ifaces[n];
    if (!i) return INVALID;
    const [a, b] = ifStatusWords(s, d, n);
    const gig = n.startsWith("Gig");
    out.push(`${n} is ${a}, line protocol is ${b}`);
    out.push(`  Hardware is ${ifKind(n) === "phys" ? (gig ? "Gigabit Ethernet" : n.startsWith("Serial") ? "HD64570" : "Fast Ethernet") : ifKind(n) === "vlan" ? "EtherSVI" : "Virtual"}, address is ${fakeMac(d.name, d.ifOrder.indexOf(n))}`);
    if (i.desc) out.push(`  Description: ${i.desc}`);
    if (i.ip != null) out.push(`  Internet address is ${intToIp(i.ip)}/${maskLen(i.mask)}`);
    out.push(`  MTU 1500 bytes, BW ${Number((i.misc.find(x => x.startsWith("bandwidth ")) || "").split(" ")[1]) || defaultBandwidth(n)} Kbit/sec, DLY ${gig ? 10 : 100} usec,`);
    out.push("     reliability 255/255, txload 1/255, rxload 1/255");
    if (i.dot1q != null) out.push(`  Encapsulation 802.1Q Virtual LAN, Vlan ID ${i.dot1q}.`);
    if (ifKind(n) === "phys" && !n.startsWith("Serial")) out.push(`  ${b === "up" ? "Full-duplex" : "Auto-duplex"}, ${gig ? "1000Mb/s" : "100Mb/s"}, media type is RJ45`);
    out.push("     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored", "     0 output errors, 0 collisions, 0 interface resets");
  }
  return out.join("\n");
}

function accessPortsOf(s, v) {
  const d = s.dev;
  return d.ifOrder.filter(n => d.ifaces[n].sw && !s.net.st.trunking(d.name, n) && d.ifaces[n].sw.accessVlan === v && !isBundled(s, n));
}
function showVlan(s) {
  const d = s.dev;
  const out = ["VLAN Name                             Status    Ports", "---- -------------------------------- --------- -------------------------------"];
  for (const v of Object.keys(d.vlans).map(Number).sort((a, b) => a - b)) {
    const ports = accessPortsOf(s, v).map(shortIf);
    const rows = [];
    for (let i = 0; i < ports.length; i += 4) rows.push(ports.slice(i, i + 4).join(", "));
    out.push(`${pad(v, 4)} ${pad(d.vlans[v].name, 32)} ${pad("active", 9)} ${rows[0] || ""}`);
    for (const r of rows.slice(1)) out.push(" ".repeat(48) + r);
  }
  out.push("1002 fddi-default                     act/unsup", "1003 token-ring-default               act/unsup", "1004 fddinet-default                  act/unsup", "1005 trnet-default                    act/unsup");
  return out.join("\n");
}

function trunkPorts(s) {
  const d = s.dev;
  return d.ifOrder.filter(n => d.ifaces[n].sw && s.net.st.trunking(d.name, n) && s.net.st.status(d.name, n).up && !isBundled(s, n));
}
function showTrunk(s) {
  const d = s.dev, ports = trunkPorts(s);
  if (!ports.length) return "";
  const out = ["Port        Mode         Encapsulation  Status        Native vlan"];
  for (const n of ports) out.push(`${pad(shortIf(n), 11)} ${pad(d.ifaces[n].sw.mode === "trunk" ? "on" : d.ifaces[n].sw.dtp, 12)} ${pad("802.1q", 14)} ${pad("trunking", 13)} ${d.ifaces[n].sw.native}`);
  out.push("", "Port        Vlans allowed on trunk");
  for (const n of ports) out.push(`${pad(shortIf(n), 11)} ${d.ifaces[n].sw.allowed ? vlanListText(d.ifaces[n].sw.allowed) : "1-4094"}`);
  out.push("", "Port        Vlans allowed and active in management domain");
  const existing = Object.keys(d.vlans).map(Number).sort((a, b) => a - b);
  for (const n of ports) {
    const al = d.ifaces[n].sw.allowed;
    out.push(`${pad(shortIf(n), 11)} ${vlanListText(existing.filter(v => !al || al.includes(v)))}`);
  }
  return out.join("\n");
}

function showIntStatus(s) {
  const d = s.dev;
  const out = ["Port      Name               Status       Vlan       Duplex  Speed Type"];
  for (const n of d.ifOrder) {
    const i = d.ifaces[n];
    if (!i.sw) continue;
    const st = s.net.st.status(d.name, n);
    const po = ifKind(n) === "po";
    // a port-channel runs at the speed of its member ports and has no media type of its own
    const gig = po ? d.ifOrder.some(m => m.startsWith("Gig") && (s.net.st.bundle[d.name + "|" + m] || {}).po === n) : n.startsWith("Gig");
    out.push(`${pad(shortIf(n), 9)} ${pad(i.desc.slice(0, 18), 18)} ${pad(!st.admin ? "disabled" : i.errdisabled ? "err-disabled" : st.up ? "connected" : (s.net.st.bundle[d.name + "|" + n] || {}).state === "s" ? "suspended" : "notconnect", 12)} ${pad(st.up && s.net.st.trunking(d.name, n) ? "trunk" : i.sw.accessVlan, 10)} ${pad(st.up ? "a-full" : "auto", 7)} ${pad(st.up ? (gig ? "a-1000" : "a-100") : "auto", 6)} ${po ? "" : gig ? "10/100/1000BaseTX" : "10/100BaseTX"}`.trimEnd());
  }
  return out.join("\n");
}

function showSwitchport(s, n) {
  const d = s.dev, i = d.ifaces[n];
  if (!i || !i.sw) return INVALID;
  const sw = i.sw, up = s.net.st.status(d.name, n).up;
  const vname = v => (d.vlans[v] ? d.vlans[v].name : "Inactive");
  return [
    `Name: ${shortIf(n)}`, "Switchport: Enabled",
    `Administrative Mode: ${sw.mode === "trunk" ? "trunk" : sw.mode === "access" ? "static access" : "dynamic " + sw.dtp}`,
    `Operational Mode: ${!up ? "down" : s.net.st.trunking(d.name, n) ? "trunk" : "static access"}`,
    "Administrative Trunking Encapsulation: dot1q",
    `Negotiation of Trunking: ${sw.mode === "access" || sw.nonegotiate ? "Off" : "On"}`,
    `Access Mode VLAN: ${sw.accessVlan} (${vname(sw.accessVlan)})`,
    `Trunking Native Mode VLAN: ${sw.native} (${vname(sw.native)})`,
    `Trunking VLANs Enabled: ${sw.allowed ? vlanListText(sw.allowed) : "ALL"}`,
  ].join("\n");
}

function showIpRoute(s) {
  const d = s.dev;
  if (d.kind === "switch") return d.defaultGw != null ? `Default gateway is ${intToIp(d.defaultGw)}\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty` : "Default gateway is not set\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty";
  const rt = s.net.st.rt[d.name];
  const out = [
    "Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP",
    "       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area",
    "       E1 - OSPF external type 1, E2 - OSPF external type 2, * - candidate default",
    "",
  ];
  const def = rt.find(r => r.mask === 0);
  out.push(def ? `Gateway of last resort is ${def.nh != null ? intToIp(def.nh) : "0.0.0.0"} to network 0.0.0.0` : "Gateway of last resort is not set", "");
  for (const r of rt) {
    const pfx = `${intToIp(r.net)}/${r.len}`;
    if (r.proto === "C") {
      out.push(`C        ${pfx} is directly connected, ${r.iface}`);
      const i = d.ifaces[r.iface];
      out.push(`L        ${intToIp(i.ip)}/32 is directly connected, ${r.iface}`);
    } else if (r.proto === "S") {
      out.push(`${r.mask === 0 ? "S*   " : "S    "}    ${pfx} [${r.ad}/0] ${r.nh != null ? "via " + intToIp(r.nh) : "is directly connected, " + r.iface}`);
    } else {
      out.push(`${pad(r.proto, 5)}    ${pfx} [110/${r.metric}] via ${intToIp(r.nh)}, 00:0${1 + (r.metric % 8)}:1${r.len % 10}, ${r.iface}`);
    }
  }
  return out.join("\n");
}

function showOspfNbr(s) {
  const nb = s.net.st.nbrs[s.dev.name] || [];
  if (!nb.length) return "";
  const out = ["Neighbor ID     Pri   State           Dead Time   Address         Interface"];
  for (const n of nb) {
    const left = Math.max(1, n.dead - 1 - (n.pri % 9));
    out.push(`${pad(intToIp(n.rid), 15)} ${String(n.role === "-" ? 0 : n.pri).padStart(3)}   ${pad(n.state + "/" + (n.role === "-" ? "  -" : n.role), 15)} 00:${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}    ${pad(intToIp(n.addr), 15)} ${n.iface}`);
  }
  return out.join("\n");
}
const ospfIfState = i => (i.loop ? "LOOP" : i.ntype === "p2p" ? "P2P" : i.role || "DR");
function showOspfIf(s) {
  const st = s.net.st, o = st.oifs[s.dev.name] || [];
  if (!o.length) return "";
  const out = ["Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C"];
  for (const i of o) {
    const nb = (st.nbrs[s.dev.name] || []).filter(n => n.iface === i.name);
    out.push(`${pad(shortIf(i.name), 12)} ${pad(i.pid, 5)} ${pad(i.area, 15)} ${pad(intToIp(i.ip) + "/" + maskLen(i.mask), 18)} ${pad(i.cost, 5)} ${pad(ospfIfState(i), 5)} ${nb.filter(n => n.state === "FULL").length}/${nb.length}`);
  }
  return out.join("\n");
}
// The long form: network type, cost, who the DR is and the timers.
function showOspfIfDetail(s, only) {
  const st = s.net.st, d = s.dev, rid = st.rids[d.name];
  const out = [];
  for (const i of st.oifs[d.name] || []) {
    if (only && i.name !== only) continue;
    const nb = (st.nbrs[d.name] || []).filter(n => n.iface === i.name);
    out.push(`${i.name} is up, line protocol is up`, `  Internet Address ${intToIp(i.ip)}/${maskLen(i.mask)}, Area ${i.area}`,
      `  Process ID ${i.pid}, Router ID ${rid != null ? intToIp(rid) : "0.0.0.0"}, Network Type ${i.loop ? "LOOPBACK" : i.ntype === "p2p" ? "POINT_TO_POINT" : "BROADCAST"}, Cost: ${i.cost}`);
    if (i.loop) { out.push("  Loopback interface is treated as a stub Host", ""); continue; }
    out.push(`  Transmit Delay is 1 sec, State ${i.passive && i.ntype !== "p2p" ? "DR" : ospfIfState(i)}${i.ntype === "p2p" ? "" : ", Priority " + i.pri}`);
    if (i.dr) out.push(`  Designated Router (ID) ${intToIp(i.dr.rid)}, Interface address ${intToIp(i.dr.ip)}`);
    if (i.bdr) out.push(`  Backup Designated router (ID) ${intToIp(i.bdr.rid)}, Interface address ${intToIp(i.bdr.ip)}`);
    out.push(`  Timer intervals configured, Hello ${i.hello}, Dead ${i.dead}, Wait ${i.dead}, Retransmit 5`);
    if (i.passive) out.push("    No Hellos (Passive interface)");
    out.push(`  Neighbor Count is ${nb.length}, Adjacent neighbor count is ${nb.filter(n => n.state === "FULL").length}`);
    for (const n of nb) if (n.state === "FULL") out.push(`    Adjacent with neighbor ${intToIp(n.rid)}${n.role === "DR" ? "  (Designated Router)" : n.role === "BDR" ? "  (Backup Designated Router)" : ""}`);
    out.push("");
  }
  return out.join("\n").trimEnd();
}
function showIpProtocols(s) {
  const d = s.dev, out = [];
  for (const [pid, p] of Object.entries(d.ospf || {})) {
    const rid = s.net.st.rids[d.name];
    out.push(`Routing Protocol is "ospf ${pid}"`, "  Outgoing update filter list for all interfaces is not set", "  Incoming update filter list for all interfaces is not set");
    out.push(`  Router ID ${rid != null ? intToIp(rid) : "0.0.0.0"}`, "  Maximum path: 4", "  Routing for Networks:");
    for (const nw of p.networks) out.push(`    ${intToIp(nw.ip)} ${intToIp(nw.wild)} area ${nw.area}`);
    const pas = p.passiveDefault ? d.ifOrder.filter(n => !p.noPassive.includes(n) && d.ifaces[n].ip != null) : p.passive;
    if (pas.length) { out.push("  Passive Interface(s):"); for (const n of pas) out.push(`    ${n}`); }
    out.push("  Routing Information Sources:", "    Gateway         Distance      Last Update");
    for (const n of s.net.st.nbrs[d.name] || []) out.push(`    ${pad(intToIp(n.rid), 15)}      110      00:02:11`);
    out.push("  Distance: (default is 110)", "");
  }
  return out.join("\n");
}

function showAcls(s) {
  const out = [];
  for (const [name, acl] of Object.entries(s.dev.acls)) {
    out.push(`${acl.type === "standard" ? "Standard" : "Extended"} IP access list ${name}`);
    for (const e of acl.entries) out.push(`    ${e.seq} ${aclRuleText(acl.type, e)}${e.hits ? ` (${e.hits} match${e.hits > 1 ? "es" : ""})` : ""}`);
  }
  return out.join("\n");
}

function showNat(s) {
  const d = s.dev;
  if (!d.natRules.length) return "";
  const out = ["Pro  Inside global         Inside local          Outside local         Outside global"];
  for (const t of d.natLog) {
    const p = t.port;
    out.push(`${pad(t.proto, 4)} ${pad(intToIp(t.global) + ":" + p, 21)} ${pad(intToIp(t.local) + ":" + p, 21)} ${pad(intToIp(t.peer) + ":" + p, 21)} ${intToIp(t.peer)}:${p}`);
  }
  for (const r of d.natRules) if (r.type === "static") out.push(`---  ${pad(intToIp(r.global), 21)} ${pad(intToIp(r.local), 21)} ${pad("---", 21)} ---`);
  return out.length > 1 ? out.join("\n") : "";
}

function showDhcpBinding(s) {
  const out = ["IP address       Client-ID/              Lease expiration        Type", "                 Hardware address"];
  for (const l of s.net.st.leases[s.dev.name] || []) out.push(`${pad(intToIp(l.ip), 16)} ${pad(fakeMac(l.client), 23)} ${pad("--", 23)} Automatic`);
  return out.join("\n");
}
function showDhcpPool(s) {
  const d = s.dev, out = [];
  for (const [name, p] of Object.entries(d.dhcp.pools)) {
    const leased = (s.net.st.leases[d.name] || []).filter(l => l.pool === name).length;
    out.push(`Pool ${name} :`, ` Leased addresses               : ${leased}`);
    if (p.net != null) out.push(` Subnet                         : ${intToIp(p.net)}/${maskLen(p.mask)}`, ` Default router                 : ${p.gw != null ? intToIp(p.gw) : "not set"}`);
    out.push("");
  }
  return out.join("\n");
}

function showMac(s) {
  const d = s.dev;
  const out = ["          Mac Address Table", "-------------------------------------------", "", "Vlan    Mac Address       Type        Ports", "----    -----------       --------    -----"];
  for (const n of d.ifOrder) {
    const i = d.ifaces[n];
    if (!i.sw || !s.net.st.status(d.name, n).up) continue;
    const p = s.net.peer(d.name, n);
    if (!p || s.net.devs[p.dev].kind === "switch") continue;
    const sticky = i.sw.ps.on && i.sw.ps.sticky;
    out.push(`${String(s.net.st.trunking(d.name, n) ? i.sw.native : i.sw.accessVlan).padStart(4)}    ${fakeMac(p.dev)}    ${sticky ? "STATIC " : "DYNAMIC"}     ${shortIf(n)}`);
  }
  return out.join("\n");
}

function showCdp(s) {
  const d = s.dev;
  const out = ["Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge", "                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone", "", "Device ID    Local Intrfce   Holdtme    Capability   Platform    Port ID"];
  for (const n of d.ifOrder) {
    if (ifKind(n) !== "phys" || !s.net.st.status(d.name, n).up) continue;
    const p = s.net.peer(d.name, n);
    if (!p) continue;
    const o = s.net.devs[p.dev];
    if (isHost(o) || o.misc.includes("no cdp run") || d.misc.includes("no cdp run")) continue;
    const sh = x => shortIf(x).replace(/^([A-Za-z]+)/, (m) => ({ Fa: "Fas ", Gi: "Gig ", Se: "Ser " }[m] || m));
    out.push(`${pad(o.hostname, 12)} ${pad(sh(n), 15)} ${pad(120 + (n.length % 50), 10)} ${pad(o.kind === "router" ? "R" : "S", 12)} ${pad(o.kind === "router" ? "ISR4321" : "2960", 11)} ${sh(p.ifn)}`);
  }
  return out.join("\n");
}

function showVersion(s) {
  const d = s.dev, r = d.kind === "router";
  return [
    `Cisco IOS Software, ${r ? "ISR4300 Software (X86_64_LINUX_IOSD-UNIVERSALK9-M)" : "C2960 Software (C2960-LANBASEK9-M)"}, Version 15.2(4)E, RELEASE SOFTWARE (fc2)`,
    "Simulated device - CCNA: On Call training lab", "",
    `${d.hostname} uptime is 2 hours, 14 minutes`, `System image file is "flash:${r ? "isr4300-universalk9.bin" : "c2960-lanbasek9-mz.152-4.E.bin"}"`, "",
    r ? "cisco ISR4321/K9 (1RU) processor with 1687137K/6147K bytes of memory." : "cisco WS-C2960-8TC-L (PowerPC405) processor with 65536K bytes of memory.",
    `${d.ifOrder.filter(n => n.startsWith("Fast")).length} FastEthernet interfaces`, `${d.ifOrder.filter(n => n.startsWith("Gig") && !n.includes(".")).length} Gigabit Ethernet interfaces`, "",
    "Configuration register is 0x2102",
  ].join("\n");
}

function showPortSec(s, name) {
  const d = s.dev;
  if (name) {
    const i = d.ifaces[name];
    if (!i || !i.sw) return INVALID;
    const ps = i.sw.ps, up = s.net.st.status(d.name, name).up;
    const p = s.net.peer(d.name, name);
    const learned = ps.on && up && p ? 1 : 0;
    const v = ps.violation[0].toUpperCase() + ps.violation.slice(1);
    return [
      `Port Security              : ${ps.on ? "Enabled" : "Disabled"}`, `Port Status                : ${!ps.on ? "Secure-down" : up ? "Secure-up" : "Secure-down"}`,
      `Violation Mode             : ${v}`, "Aging Time                 : 0 mins", "Aging Type                 : Absolute",
      `Maximum MAC Addresses      : ${ps.max}`, `Total MAC Addresses        : ${learned}`, "Configured MAC Addresses   : 0",
      `Sticky MAC Addresses       : ${ps.sticky ? learned : 0}`, `Last Source Address:Vlan   : ${learned ? fakeMac(p.dev) + ":" + i.sw.accessVlan : "0000.0000.0000:0"}`, "Security Violation Count   : 0",
    ].join("\n");
  }
  const out = ["Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action", "                (Count)       (Count)          (Count)", "---------------------------------------------------------------------------"];
  for (const n of d.ifOrder) {
    const i = d.ifaces[n];
    if (!i.sw || !i.sw.ps.on) continue;
    const learned = s.net.st.status(d.name, n).up ? 1 : 0;
    out.push(`${shortIf(n).padStart(11)} ${String(i.sw.ps.max).padStart(14)} ${String(learned).padStart(12)} ${"0".padStart(18)} ${(i.sw.ps.violation[0].toUpperCase() + i.sw.ps.violation.slice(1)).padStart(16)}`);
  }
  out.push("---------------------------------------------------------------------------");
  return out.join("\n");
}

// is this port a member that is bundled into a port-channel right now?
const isBundled = (s, n) => { const b = s.net.st.bundle[`${s.dev.name}|${n}`]; return !!b && b.state === "P"; };
const vlanTag = v => `VLAN${String(v).padStart(4, "0")}`;

// Every up port that carries VLAN v, as spanning tree sees it: a bundled
// member is represented by its port-channel.
function stpPorts(s, v) {
  const d = s.dev, st = s.net.st, tree = st.stp[d.name][v];
  const rows = [];
  for (const n of d.ifOrder) {
    const i = d.ifaces[n];
    if (!i.sw || !st.status(d.name, n).up || isBundled(s, n)) continue;
    const carries = st.trunking(d.name, n) ? !i.sw.allowed || i.sw.allowed.includes(v) : i.sw.accessVlan === v;
    if (!carries) continue;
    const known = tree && tree.ports[n];
    const cost = i.sw.stpCost ?? (n.startsWith("Gig") ? 4 : n.startsWith("Port") ? 3 : 19);
    rows.push({ n, ...(known || { role: "Desg", state: "FWD", cost }), edge: !known && i.sw.portfast });
  }
  return rows;
}

function showSpanningTree(s, only) {
  const d = s.dev, st = s.net.st, out = [];
  for (const v of Object.keys(d.vlans).map(Number).sort((a, b) => a - b)) {
    if (only != null && v !== only) continue;
    const rows = stpPorts(s, v);
    if (!rows.length) continue;
    const own = { prio: (d.stp.prio[v] ?? 32768) + v, mac: fakeMac(d.name, 99) };
    const tree = st.stp[d.name][v] || { root: { dev: d.name, ...own }, cost: 0, rootPort: null };
    out.push(vlanTag(v), `  Spanning tree enabled protocol ${d.stp.mode === "rapid-pvst" ? "rstp" : "ieee"}`,
      `  Root ID    Priority    ${tree.root.prio}`, `             Address     ${tree.root.mac}`);
    if (tree.root.dev === d.name) out.push("             This bridge is the root");
    else out.push(`             Cost        ${tree.cost}`, `             Port        ${d.ifOrder.indexOf(tree.rootPort) + 1} (${tree.rootPort})`);
    out.push("             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec", "",
      `  Bridge ID  Priority    ${own.prio}  (priority ${own.prio - v} sys-id-ext ${v})`, `             Address     ${own.mac}`, "",
      "Interface           Role Sts Cost      Prio.Nbr Type", "------------------- ---- --- --------- -------- --------------------------------");
    for (const r of rows) {
      out.push(`${pad(shortIf(r.n), 19)} ${pad(r.role, 4)} ${pad(r.state + (r.note ? "*" : ""), 4)}${pad(r.cost, 9)} 128.${pad(d.ifOrder.indexOf(r.n) + 1, 4)} ${r.edge ? "P2p Edge" : "P2p"}${r.note ? " " + r.note : ""}`);
    }
    out.push("");
  }
  if (!out.length) return only != null ? `Spanning tree instance(s) for vlan ${only} does not exist.` : "No spanning tree instance exists.";
  return out.join("\n");
}

function showStpSummary(s) {
  const d = s.dev, st = s.net.st;
  const vlans = Object.keys(d.vlans).map(Number).sort((a, b) => a - b).filter(v => stpPorts(s, v).length);
  const mine = vlans.filter(v => !st.stp[d.name][v] || st.stp[d.name][v].root.dev === d.name);
  const out = [`Switch is in ${d.stp.mode} mode`, `Root bridge for: ${mine.length ? mine.map(vlanTag).join(", ") : "none"}`, "",
    "Name                   Blocking Listening Learning Forwarding STP Active", "---------------------- -------- --------- -------- ---------- ----------"];
  for (const v of vlans) {
    const rows = stpPorts(s, v), blk = rows.filter(r => r.state !== "FWD").length;
    out.push(`${pad(vlanTag(v), 22)} ${String(blk).padStart(8)} ${"0".padStart(9)} ${"0".padStart(8)} ${String(rows.length - blk).padStart(10)} ${String(rows.length).padStart(10)}`);
  }
  return out.join("\n");
}

function showStpInconsistent(s) {
  const d = s.dev, st = s.net.st, rows = [];
  for (const v of Object.keys(d.vlans).map(Number).sort((a, b) => a - b)) {
    for (const [n, p] of Object.entries((st.stp[d.name][v] || { ports: {} }).ports)) if (p.note) rows.push(`${pad(vlanTag(v), 20)} ${pad(n, 24)} Root Inconsistent`);
  }
  return ["Name                 Interface                Inconsistency", "-------------------- ------------------------ ------------------", ...rows, "",
    `Number of inconsistent ports (segments) in the system : ${rows.length}`].join("\n");
}

const CHANNEL_PROTO = { active: "LACP", passive: "LACP", desirable: "PAgP", auto: "PAgP", on: "-" };
function showEtherchannel(s) {
  const d = s.dev, st = s.net.st, groups = {};
  for (const n of d.ifOrder) { const c = d.ifaces[n].channel; if (c) (groups[c.id] ||= []).push(n); }
  const ids = Object.keys(groups).map(Number).sort((a, b) => a - b);
  const out = ["Flags:  D - down        P - bundled in port-channel", "        I - stand-alone s - suspended", "        R - Layer3      S - Layer2", "        U - in use", "",
    `Number of channel-groups in use: ${ids.length}`, `Number of aggregators:           ${ids.length}`, "",
    "Group  Port-channel  Protocol    Ports", "------+-------------+-----------+-----------------------------------------------"];
  for (const id of ids) {
    const members = groups[id].map(n => { const b = st.bundle[`${d.name}|${n}`]; return `${shortIf(n)}(${b ? b.state : "D"})`; });
    const inUse = groups[id].some(n => isBundled(s, n));
    out.push(`${pad(id, 6)} ${pad(`Po${id}(S${inUse ? "U" : "D"})`, 15)} ${pad(CHANNEL_PROTO[d.ifaces[groups[id][0]].channel.mode], 9)} ${members.map(m => pad(m, 11)).join(" ")}`.trimEnd());
  }
  return out.join("\n");
}

function showArp(s) {
  const d = s.dev, st = s.net.st;
  const out = ["Protocol  Address          Age (min)  Hardware Addr   Type   Interface"];
  for (const i of st.l3[d.name]) out.push(`Internet  ${pad(intToIp(i.ip), 16)} ${pad("-", 10)} ${fakeMac(d.name, d.ifOrder.indexOf(i.name))}  ARPA   ${i.name}`);
  return out.join("\n");
}

// ---------------------------------------------------------------- remote access checks
// Used by the PC "ssh"/"telnet" commands and by level objectives.
export function findOwner(net, ip) {
  const st = net.st;
  return net.order.find(dn => !isHost(net.devs[dn]) && st.owns(dn, ip)) || null;
}
export function remoteAccess(net, from, ip, proto) {
  const st = net.st;
  const port = proto === "ssh" ? 22 : 23;
  const r = st.reach(from, ip, { proto: "tcp", dport: port });
  if (!r.ok) return { ok: false, reason: "timeout" };
  const d = net.devs[r.target];
  if (isHost(d)) return { ok: false, reason: "refused" };
  const vty = d.lines.vty;
  if (vty.accessClass && d.acls[vty.accessClass]) {
    const src = st.pcs[from] ? st.pcs[from].ip : null;
    const acl = d.acls[vty.accessClass];
    const hit = acl.entries.find(e => e.src.any || ((src ^ e.src.ip) & ~e.src.wild) === 0);
    if (!hit || hit.action !== "permit") return { ok: false, reason: "refused" };
  }
  const allowed = vty.transport === "all" || vty.transport.split(" ").includes(proto);
  if (!allowed) return { ok: false, reason: "refused" };
  if (proto === "ssh" && !d.rsa) return { ok: false, reason: "refused" };
  if (vty.login === "line" && !vty.password) return { ok: false, reason: "nopassword", dev: d.name };
  return { ok: true, dev: d.name, login: vty.login };
}
export function checkLogin(d, user, pass) {
  const vty = d.lines.vty;
  if (vty.login === "local") return !!d.users[user] && d.users[user].pw === pass;
  if (vty.login === "line") return vty.password === pass;
  return true;
}

function filterOutput(out, op, pat) {
  if (out.startsWith("%") || out.includes("% Invalid")) return out;
  const lines = out.split("\n"), p = pat.toLowerCase();
  const has = l => l.toLowerCase().includes(p);
  if ("include".startsWith(op)) return lines.filter(has).join("\n");
  if ("exclude".startsWith(op)) return lines.filter(l => !has(l)).join("\n");
  if ("begin".startsWith(op)) { const i = lines.findIndex(has); return i < 0 ? "" : lines.slice(i).join("\n"); }
  if ("section".startsWith(op)) {
    const keep = [];
    for (let i = 0; i < lines.length; i++) {
      if (!has(lines[i]) || lines[i].startsWith(" ")) continue;
      keep.push(lines[i]);
      while (i + 1 < lines.length && lines[i + 1].startsWith(" ")) keep.push(lines[++i]);
    }
    return keep.join("\n");
  }
  return "% Invalid output modifier (use include, exclude, begin or section)";
}

// ---------------------------------------------------------------- session
const PROMPTS = { config: "(config)", if: "(config-if)", line: "(config-line)", router: "(config-router)", vlan: "(config-vlan)", dhcp: "(dhcp-config)" };

export class IosSession {
  constructor(net, devName, opts = {}) {
    this.net = net;
    this.dev = net.devs[devName];
    this.mode = opts.mode || "user";
    this.ctx = {};
    this.pending = null;
    this.remote = !!opts.remote;
    this.closed = false;
    this.history = [];
    this.count = 0;       // commands entered (for scoring)
  }

  get prompt() {
    if (this.pending) return this.pending.prompt;
    const h = this.dev.hostname;
    if (this.mode === "user") return h + ">";
    if (this.mode === "priv") return h + "#";
    if (this.mode === "if") return h + (this.ctx.ifs.length > 1 ? "(config-if-range)#" : this.ctx.ifs[0].includes(".") ? "(config-subif)#" : "(config-if)#");
    if (this.mode === "acl") return h + (this.ctx.aclType === "standard" ? "(config-std-nacl)#" : "(config-ext-nacl)#");
    return h + PROMPTS[this.mode] + "#";
  }
  get hidden() { return !!(this.pending && this.pending.hidden); }

  exec(line) {
    let out;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      out = p.fn(line) || "";
    } else {
      const text = line.trim();
      if (!text || text.startsWith("!")) return this.flushLogs("");
      this.history.push(text);
      this.count++;
      out = this.run(text) || "";
    }
    this.net.touch();
    this.net.collectEvents();
    return this.flushLogs(out);
  }

  flushLogs(out) {
    const logs = this.net.takeLogs(this.dev.name);
    if (!logs.length) return out;
    return (out ? out + "\n" : "") + logs.join("\n");
  }

  run(text) {
    const kind = this.dev.kind;
    // output filters come first so "do show run | section ospf" works too
    const pipe = /^(.*?)\s+\|\s*(\S+)\s+(.+)$/.exec(text);
    if (pipe && /^(do\s+)?sh/i.test(pipe[1])) {
      const out = this.run(pipe[1]) || "";
      return filterOutput(out, pipe[2].toLowerCase(), pipe[3].trim());
    }
    const cfgMode = this.mode !== "user" && this.mode !== "priv";
    if (cfgMode) {
      const m = /^do\s+(.*)$/i.exec(text);
      if (m) return this.runIn("priv", m[1], true);
    }
    let r = parse(this.mode, kind, text);
    if (r.err && SUB.split(",").includes(this.mode)) {
      const g = parse("config", kind, text);
      if (!g.err) { this.mode = "config"; this.ctx = {}; r = g; }
    }
    if (r.err) return this.errorText(r, text) + this.modeTip(text);
    return r.cmd.fn(this, ...r.args);
  }

  // The game's coaching, not IOS: when a command is rejected only because it
  // was typed in the wrong mode, say which mode it belongs to.
  modeTip(text) {
    const kind = this.dev.kind;
    const ok = m => !parse(m, kind, text).err;
    const tip = t => "\nTip: " + t;
    const exec = this.mode === "user" || this.mode === "priv";
    if (!exec && ok("priv")) return tip(`"${text}" is a privileged EXEC command, so it is not accepted in configuration mode. Type "do ${text}", or "end" first.`);
    if (this.mode === "user" && ok("priv")) return tip('this command needs privileged mode. Type "enable" first.');
    if (exec && ok("config")) return tip(`this is a configuration command. Type ${this.mode === "user" ? '"enable", then ' : ""}"configure terminal" first.`);
    const SUBMODES = [
      ["if", "an interface", "interface g0/1"], ["line", "a line", "line console 0"], ["router", "a routing process", "router ospf 1"],
      ["vlan", "a VLAN", "vlan 10"], ["dhcp", "a DHCP pool", "ip dhcp pool NAME"], ["acl", "a named access list", "ip access-list extended NAME"],
    ];
    for (const [m, what, how] of SUBMODES) {
      if (m === this.mode || !ok(m)) continue;
      return tip(`this command configures ${what}. ${exec ? "In configuration mode, select" : "Select"} one first, for example "${how}".`);
    }
    return "";
  }

  runIn(mode, text, keep) {
    const saved = [this.mode, this.ctx];
    this.mode = mode;
    const r = parse(mode, this.dev.kind, text);
    const out = r.err ? this.errorText(r, text) : r.cmd.fn(this, ...r.args);
    if (keep) this.restoreAfterPending(saved);
    return out;
  }

  errorText(r, text) {
    if (r.err === "ambiguous") return `% Ambiguous command:  "${text}"`;
    if (r.err === "incomplete") return "% Incomplete command.";
    if (r.pos === 0 && (this.mode === "user" || this.mode === "priv") && /^[a-z][\w.-]*$/i.test(text)) {
      return this.dev.domainLookup
        ? `Translating "${text}"...domain server (255.255.255.255)\n% Unknown command or computer name, or unable to find computer address`
        : `Translating "${text}"\n% Unknown command or computer name, or unable to find computer address`;
    }
    return `${" ".repeat(this.prompt.length + r.pos)}^\n% Invalid input detected at '^' marker.`;
  }

  // "?" help for a partial line
  help(line) {
    const mode = this.mode, kind = this.dev.kind;
    const endsSpace = /\s$/.test(line) || line === "";
    const toks = tokenize(line);
    const partial = endsSpace ? null : toks.pop();
    let w = walk(mode, kind, toks, line);
    if (w.err && SUB.split(",").includes(mode)) w = walk("config", kind, toks, line);
    if (w.err) return "% Unrecognized command";
    const opts = new Set();
    let cr = false;
    for (const a of w.alive) {
      if (a.done) { cr = true; continue; }
      const pt = a.c.toks[toks.length];
      if (!pt) { if (!partial) cr = true; continue; }
      if (pt.lits) for (const l of pt.lits) { if (!partial || l.startsWith(partial.t.toLowerCase())) opts.add(l); }
      else if (!partial || conv(pt.p, partial.t) !== undefined || pt.p === "rest") opts.add(PARAM_HELP[pt.p]);
    }
    if (mode !== "user" && mode !== "priv" && !toks.length) {
      for (const l of ["do", "end", "exit"]) if (!partial || l.startsWith(partial.t.toLowerCase())) opts.add(l);
    }
    const list = [...opts].sort();
    if (!list.length && !cr) return "% Unrecognized command";
    if (partial) return list.join("  ");
    const rows = list.map(x => "  " + x);
    if (cr) rows.push("  <cr>");
    return rows.join("\n");
  }

  // tab completion: returns the completed line (or the same line)
  complete(line) {
    if (/\s$/.test(line) || !line) return line;
    const toks = tokenize(line);
    const partial = toks.pop();
    let w = walk(this.mode, this.dev.kind, toks, line);
    if (w.err && SUB.split(",").includes(this.mode)) w = walk("config", this.dev.kind, toks, line);
    if (w.err) return line;
    const opts = new Set();
    for (const a of w.alive) {
      const pt = !a.done && a.c.toks[toks.length];
      if (pt && pt.lits) for (const l of pt.lits) if (l.startsWith(partial.t.toLowerCase())) opts.add(l);
    }
    if (opts.size !== 1) return line;
    return line.slice(0, partial.pos) + [...opts][0] + " ";
  }

  // put the session back in its config mode once a "do ..." command (and any
  // prompt it raised) has finished
  restoreAfterPending(saved) {
    if (!this.pending) { [this.mode, this.ctx] = saved; return; }
    const p = this.pending, fn = p.fn;
    p.fn = line => { const out = fn(line); this.restoreAfterPending(saved); return out; };
  }

  ask(prompt, fn, hidden = false) { this.pending = { prompt, fn, hidden }; }
  get ifs() { return this.ctx.ifs.map(n => this.dev.ifaces[n]); }
}

// ---------------------------------------------------------------- exec commands
const needPriv = s => s.mode === "priv";

reg(EXEC, "enable", s => {
  if (s.mode === "priv") return;
  const d = s.dev, secret = d.enableSecret || d.enablePassword;
  if (!secret) {
    if (s.remote) return "% No password set";
    s.mode = "priv";
    return;
  }
  let tries = 0;
  const askPw = () => s.ask("Password: ", pw => {
    if (pw === secret) { s.mode = "priv"; return; }
    if (++tries >= 3) return "% Bad secrets";
    askPw();
  }, true);
  askPw();
});
reg("priv", "disable", s => { s.mode = "user"; });
reg(EXEC, "exit|logout|quit", s => {
  if (s.remote) { s.closed = true; return; }
  s.mode = "user";
  const con = s.dev.lines.con;
  const banner = `\n${s.dev.hostname} con0 is now available\n\nPress RETURN to get started.\n${s.dev.banner ? "\n" + s.dev.banner + "\n" : ""}`;
  if (con.login === "line" && con.password) {
    const askPw = () => s.ask("Password: ", pw => { if (pw !== con.password) { askPw(); return "% Login invalid"; } }, true);
    askPw();
    return banner + "\nUser Access Verification\n";
  }
  return banner;
});
reg("priv", "configure terminal", s => { s.mode = "config"; s.ctx = {}; return "Enter configuration commands, one per line.  End with CNTL/Z."; });
reg("priv", "configure", s => { s.mode = "config"; s.ctx = {}; return "Enter configuration commands, one per line.  End with CNTL/Z."; });

function saveConfig(s) {
  s.dev.startup = runningConfig(s.dev);
  return "Building configuration...\n[OK]";
}
reg("priv", "copy running-config startup-config", s => { s.ask("Destination filename [startup-config]? ", () => saveConfig(s)); });
reg("priv", "copy startup-config running-config", () => "% Not simulated: merging the saved configuration back into the running one.\nTip: to undo your changes, use the Reset lab button. To save them, the order is \"copy running-config startup-config\".");
reg("priv", "write", saveConfig);
reg("priv", "write memory", saveConfig);
reg("priv", "reload", () => "% Reload is disabled in this lab. Use the Reset Lab button to start the ticket over.");
reg("priv", "erase startup-config", s => { s.dev.startup = null; return "[OK]\nErase of nvram: complete"; });
reg(EXEC, "terminal <rest>", () => {});
reg("priv", "clear ip nat translation <rest>", s => { s.dev.natLog = []; });
// Restart OSPF: the neighbours see this router leave and hold their election
// without it, then it comes back with whatever router ID its configuration gives.
reg("priv", "clear ip ospf process", s => {
  if (!Object.keys(s.dev.ospf).length) return;
  s.ask("Reset ALL OSPF processes? [no]: ", a => {
    if (!/^y/i.test(a.trim())) return;
    const d = s.dev;
    d.ospfRestarting = true;
    s.net.touch();
    s.net.collectEvents();
    d.ospfRestarting = false;
    d.ospfRid = null;
    s.net.touch();
  });
}, ["router"]);
reg("priv", "clear <rest>", () => {});
reg("priv", "debug <rest>", () => "% Debugging is not available in this lab.");
reg("priv", "undebug all", () => "All possible debugging has been turned off");

function iosPing(s, ip) {
  const head = `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${intToIp(ip)}, timeout is 2 seconds:\n`;
  const r = s.net.st.reach(s.dev.name, ip, { user: true });
  if (r.ok) return head + "!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 1/1/4 ms";
  const sym = r.reason === "acl" || (r.reason === "noroute" && r.at !== s.dev.name) ? "U.U.U" : ".....";
  return head + sym + "\nSuccess rate is 0 percent (0/5)";
}
reg(EXEC, "ping <ip>", iosPing);
reg(EXEC, "ping <word>", (s, w) => `Translating "${w}"...domain server (255.255.255.255)\n% Unrecognized host or address, or protocol not running.`);

export function traceHops(net, from, ip) {
  // one line per router hop on the request path, then the destination if reached
  const st = net.st;
  const r = st.reach(from, ip);
  const path = r.stage === "reply" ? r.reqHops : r.hops;
  const hops = [];
  for (const h of path || []) {
    if (h.to === (r.target || null) && (r.ok || r.stage === "reply")) continue;
    const d = net.devs[h.to];
    if (d.kind !== "router") continue;
    const i = d.ifaces[h.toIf];
    hops.push(i.ip != null ? intToIp(i.ip) : "*");
  }
  const reached = r.ok;
  if (reached) hops.push(intToIp(ip));
  return { hops, reached };
}
reg(EXEC, "traceroute <ip>", (s, ip) => {
  const t = traceHops(s.net, s.dev.name, ip);
  const out = [`Type escape sequence to abort.\nTracing the route to ${intToIp(ip)}`, ""];
  t.hops.forEach((h, i) => out.push(`  ${i + 1}   ${h}     1 msec    0 msec    1 msec`));
  if (!t.reached) for (let i = 0; i < 3; i++) out.push(`  ${t.hops.length + i + 1}   *     *     *`);
  return out.join("\n");
});

// show ...
const show = (pat, fn, kinds) => reg(EXEC, "show " + pat, fn, kinds);
const NEED_PRIV = INVALID + '\nTip: this command needs privileged mode. Type "enable" first.';
show("running-config", s => needPriv(s) ? `Building configuration...\n\nCurrent configuration : ${runningConfig(s.dev).length} bytes\n${runningConfig(s.dev)}` : NEED_PRIV);
show("startup-config", s => !needPriv(s) ? NEED_PRIV : s.dev.startup || "startup-config is not present");
show("ip interface brief", showIpIntBrief);
show("interfaces", s => showInterfaces(s));
show("interfaces <if>", (s, n) => showInterfaces(s, n));
show("interfaces trunk", showTrunk, ["switch"]);
show("interfaces status", showIntStatus, ["switch"]);
show("interfaces <if> switchport", showSwitchport, ["switch"]);
show("interfaces switchport", s => s.dev.ifOrder.filter(n => s.dev.ifaces[n].sw).map(n => showSwitchport(s, n)).join("\n\n"), ["switch"]);
show("vlan", showVlan, ["switch"]);
show("vlan brief", showVlan, ["switch"]);
show("ip route", showIpRoute);
show("ip ospf neighbor", showOspfNbr, ["router"]);
show("ip ospf interface brief", showOspfIf, ["router"]);
show("ip ospf interface", s => showOspfIfDetail(s), ["router"]);
show("ip ospf interface <if>", (s, n) => showOspfIfDetail(s, n), ["router"]);
show("ip ospf", s => showIpProtocols(s), ["router"]);
show("ip protocols", showIpProtocols);
show("access-lists", showAcls);
show("ip access-lists", showAcls);
show("ip nat translations", showNat, ["router"]);
show("ip nat statistics", s => `Total active translations: ${s.dev.natLog.length + s.dev.natRules.filter(r => r.type === "static").length}\nOutside interfaces:\n  ${s.dev.ifOrder.filter(n => s.dev.ifaces[n].nat === "outside").join(", ")}\nInside interfaces:\n  ${s.dev.ifOrder.filter(n => s.dev.ifaces[n].nat === "inside").join(", ")}`, ["router"]);
show("ip dhcp binding", showDhcpBinding, ["router"]);
show("ip dhcp pool", showDhcpPool, ["router"]);
show("mac address-table", showMac, ["switch"]);
show("mac-address-table", showMac, ["switch"]);
show("cdp neighbors", showCdp);
show("version", showVersion);
show("port-security", s => showPortSec(s), ["switch"]);
show("port-security interface <if>", showPortSec, ["switch"]);
show("spanning-tree", s => showSpanningTree(s), ["switch"]);
show("spanning-tree vlan <num>", showSpanningTree, ["switch"]);
show("spanning-tree summary", showStpSummary, ["switch"]);
show("spanning-tree inconsistentports", showStpInconsistent, ["switch"]);
show("etherchannel summary", showEtherchannel, ["switch"]);
show("etherchannel", showEtherchannel, ["switch"]);
show("arp", showArp);
show("ip arp", showArp);
show("history", s => s.history.map(h => "  " + h).join("\n"));
show("clock", () => "*09:41:07.123 UTC Mon Mar 1 2027");
show("users", s => `    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00`);
show("ip ssh", s => s.dev.rsa ? `SSH Enabled - version ${s.dev.sshVersion === 2 ? "2.0" : "1.99"}\nAuthentication timeout: 120 secs; Authentication retries: 3` : "SSH Disabled - version 1.99\n%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).");
show("flash", () => "Directory of flash:/\n\n    1  -rw-    4670455   <no date>  ios-image.bin\n\n64016384 bytes total (59345929 bytes free)");

// ---------------------------------------------------------------- global config
const misc = line => s => { if (!s.dev.misc.includes(line)) s.dev.misc.push(line); };
const unmisc = prefix => s => { s.dev.misc = s.dev.misc.filter(x => !x.startsWith(prefix)); };

reg(CFG_ALL, "end", s => { s.mode = "priv"; s.ctx = {}; });
reg("config", "exit", s => { s.mode = "priv"; });
reg(SUB, "exit", s => { s.mode = "config"; s.ctx = {}; });

reg("config", "hostname <word>", (s, w) => {
  if (!/^[a-z][\w-]{0,62}$/i.test(w)) return "% Hostname contains one or more illegal characters.";
  s.dev.hostname = w;
});
reg("config", "no hostname", s => { s.dev.hostname = s.dev.kind === "router" ? "Router" : "Switch"; });
reg("config", "enable secret <word>", (s, w) => { s.dev.enableSecret = w; });
reg("config", "enable password <word>", (s, w) => { s.dev.enablePassword = w; });
reg("config", "no enable secret", s => { s.dev.enableSecret = null; });
reg("config", "no enable password", s => { s.dev.enablePassword = null; });
reg("config", "service password-encryption", s => { s.dev.pwEncrypt = true; });
reg("config", "no service password-encryption", s => { s.dev.pwEncrypt = false; });
reg("config", "service <rest>", (s, r) => misc("service " + r)(s));
reg("config", "banner motd <rest>", (s, r) => {
  const delim = r[0];
  const rest = r.slice(1);
  const end = rest.indexOf(delim);
  if (end >= 0) { s.dev.banner = rest.slice(0, end); return; }
  const lines = rest ? [rest] : [];
  const more = () => s.ask("", l => {
    const e = l.indexOf(delim);
    if (e >= 0) { if (e > 0) lines.push(l.slice(0, e)); s.dev.banner = lines.join("\n"); return; }
    lines.push(l);
    more();
  });
  more();
  return `Enter TEXT message.  End with the character '${delim}'.`;
});
reg("config", "no banner motd", s => { s.dev.banner = null; });
reg("config", "ip domain-lookup", s => { s.dev.domainLookup = true; });
reg("config", "no ip domain-lookup", s => { s.dev.domainLookup = false; });
reg("config", "ip domain lookup", s => { s.dev.domainLookup = true; });        // the spelling newer IOS releases print
reg("config", "no ip domain lookup", s => { s.dev.domainLookup = false; });
reg("config", "ip domain-name <word>", (s, w) => { s.dev.domainName = w; });
reg("config", "ip domain name <word>", (s, w) => { s.dev.domainName = w; });
reg("config", "no ip domain-name", s => { s.dev.domainName = null; });
reg("config", "ip name-server <ip>", (s, ip) => misc("ip name-server " + intToIp(ip))(s));
reg("config", "username <word> secret|password <word>", (s, u, kind, pw) => { s.dev.users[u] = { kind, pw }; });
reg("config", "username <word> privilege <num> secret|password <word>", (s, u, priv, kind, pw) => { s.dev.users[u] = { kind, pw, priv }; });
reg("config", "no username <word>", (s, u) => { delete s.dev.users[u]; });

function genKeys(s, bits) {
  const d = s.dev;
  if (d.hostname === "Router" || d.hostname === "Switch") return `% Please define a hostname other than ${d.hostname}.`;
  if (!d.domainName) return "% Please define a domain-name first.";
  const make = n => {
    if (!Number.isInteger(n) || n < 360 || n > 4096) return "% Modulus must be between 360 and 4096.";
    d.rsa = n;
    return `% Generating ${n} bit RSA keys, keys will be non-exportable...[OK]\n%SSH-5-ENABLED: SSH 1.99 has been enabled`;
  };
  if (bits != null) return `The name for the keys will be: ${d.hostname}.${d.domainName}\n` + make(bits);
  s.ask("How many bits in the modulus [512]: ", l => make(l.trim() ? Number(l.trim()) : 512));
  return `The name for the keys will be: ${d.hostname}.${d.domainName}\nChoose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n`;
}
reg("config", "crypto key generate rsa", s => genKeys(s));
reg("config", "crypto key generate rsa modulus <num>", genKeys);
reg("config", "crypto key generate rsa general-keys modulus <num>", genKeys);
reg("config", "crypto key zeroize rsa", s => { s.dev.rsa = null; });
reg("config", "ip ssh version <num>", (s, n) => {
  if (n !== 1 && n !== 2) return INVALID;
  if (n === 2 && s.dev.rsa && s.dev.rsa < 768) return "Please create RSA keys (of at least 768 bits size) to enable SSH v2.";
  s.dev.sshVersion = n;
});
reg("config", "ip ssh <rest>", (s, r) => misc("ip ssh " + r)(s));

reg("config", "line console <num>", s => { s.mode = "line"; s.ctx = { line: "con" }; });
reg("config", "line vty <num> <num>", (s, a, b) => { s.mode = "line"; s.ctx = { line: "vty" }; s.dev.lines.vty.last = Math.max(s.dev.lines.vty.last, b); });
reg("config", "line vty <num>", s => { s.mode = "line"; s.ctx = { line: "vty" }; });

reg("config", "interface <if>", (s, n) => {
  const i = ensureIface(s.dev, n);
  if (!i) return INVALID;
  if (ifKind(n) === "vlan" && !s.dev.vlans[Number(n.slice(4))]) { /* SVI can exist before the VLAN does */ }
  s.mode = "if";
  s.ctx = { ifs: [n] };
});
reg("config", "interface range <rest>", (s, r) => {
  const names = parseIfRange(s.dev, r);
  if (!names) return INVALID;
  s.mode = "if";
  s.ctx = { ifs: names };
});
reg("config", "no interface <if>", (s, n) => {
  if (ifKind(n) === "po") for (const m of s.dev.ifOrder.map(x => s.dev.ifaces[x])) if (m.channel && `Port-channel${m.channel.id}` === n) m.channel = null;
  if (!removeIface(s.dev, n)) return "% Removal of physical interfaces is not permitted.";
});

reg("config", "vlan <word>", (s, w) => {
  const list = parseVlanList(w);
  if (!list) return INVALID;
  for (const v of list) if (!s.dev.vlans[v]) s.dev.vlans[v] = { name: "VLAN" + String(v).padStart(4, "0") };
  s.mode = "vlan";
  s.ctx = { vlans: list };
}, ["switch"]);
reg("config", "no vlan <num>", (s, v) => {
  if (v === 1) return "Default VLAN 1 may not be deleted.";
  delete s.dev.vlans[v];
}, ["switch"]);
reg("vlan", "name <word>", (s, w) => {
  if (s.ctx.vlans.length !== 1) return "% Cannot name a range of VLANs.";
  s.dev.vlans[s.ctx.vlans[0]].name = w;
});
reg("vlan", "no name", s => { for (const v of s.ctx.vlans) s.dev.vlans[v].name = "VLAN" + String(v).padStart(4, "0"); });

// static routes
function addRoute(s, net, mask, via, ad) {
  if (maskLen(mask) === null) return "%Inconsistent address and mask";
  if (netOf(net, mask) !== net) return "%Inconsistent address and mask";
  const r = { net, mask, ad: ad ?? 1, nh: typeof via === "number" ? via : null, iface: typeof via === "string" ? via : null };
  if (r.iface && !s.dev.ifaces[r.iface]) return INVALID;
  s.dev.routes = s.dev.routes.filter(x => !(x.net === net && x.mask === mask && x.nh === r.nh && x.iface === r.iface));
  s.dev.routes.push(r);
}
reg("config", "ip route <ip> <ip> <ip>", addRoute, ["router"]);
reg("config", "ip route <ip> <ip> <ip> <num>", addRoute, ["router"]);
reg("config", "ip route <ip> <ip> <if>", addRoute, ["router"]);
reg("config", "ip route <ip> <ip> <if> <num>", addRoute, ["router"]);
const delRoute = (s, net, mask, via) => {
  const before = s.dev.routes.length;
  s.dev.routes = s.dev.routes.filter(x => !(x.net === net && x.mask === mask && (via === undefined || x.nh === via || x.iface === via)));
  if (before === s.dev.routes.length) return "%No matching route to delete";
};
reg("config", "no ip route <ip> <ip>", delRoute, ["router"]);
reg("config", "no ip route <ip> <ip> <ip>", delRoute, ["router"]);
reg("config", "no ip route <ip> <ip> <if>", delRoute, ["router"]);
reg("config", "no ip route <ip> <ip> <ip> <num>", delRoute, ["router"]);
reg("config", "ip routing", () => {}, ["router"]);
reg("config", "ip default-gateway <ip>", (s, ip) => { s.dev.defaultGw = ip; }, ["switch"]);
reg("config", "no ip default-gateway", s => { s.dev.defaultGw = null; }, ["switch"]);

// OSPF
reg("config", "router ospf <num>", (s, pid) => {
  if (pid < 1 || pid > 65535) return INVALID;
  s.dev.ospf[pid] ||= { routerId: null, networks: [], passive: [], passiveDefault: false, noPassive: [], defaultOriginate: false, always: false, misc: [] };
  s.mode = "router";
  s.ctx = { pid };
}, ["router"]);
reg("config", "no router ospf <num>", (s, pid) => { delete s.dev.ospf[pid]; }, ["router"]);
const proc = s => s.dev.ospf[s.ctx.pid];
reg("router", "network <ip> <ip> area <num>", (s, ip, wild, area) => {
  if (maskLen(~wild >>> 0) === null) return "% OSPF: Invalid wildcard mask";
  const p = proc(s);
  ip = (ip & ~wild) >>> 0;
  p.networks = p.networks.filter(n => !(n.ip === ip && n.wild === wild));
  p.networks.push({ ip, wild, area });
});
reg("router", "no network <ip> <ip> area <num>", (s, ip, wild) => {
  const p = proc(s);
  ip = (ip & ~wild) >>> 0;
  p.networks = p.networks.filter(n => !(n.ip === ip && n.wild === wild));
});
// A new router ID is used at once only while the router has no neighbours;
// otherwise it waits for "clear ip ospf process", as on IOS.
const RID_LATER = '% OSPF: Reload or use "clear ip ospf process" command, for this to take effect';
reg("router", "router-id <ip>", (s, ip) => {
  const d = s.dev, busy = (s.net.st.nbrs[d.name] || []).length > 0;
  proc(s).routerId = ip;
  if (d.ospfRid === ip) return;
  if (busy) return RID_LATER;
  d.ospfRid = ip;
});
reg("router", "no router-id", s => {
  const d = s.dev, busy = (s.net.st.nbrs[d.name] || []).length > 0;
  proc(s).routerId = null;
  if (busy) return RID_LATER;
  d.ospfRid = null;
});
reg("router", "passive-interface <if>", (s, n) => {
  if (!s.dev.ifaces[n]) return INVALID;
  const p = proc(s);
  p.noPassive = p.noPassive.filter(x => x !== n);
  if (!p.passiveDefault && !p.passive.includes(n)) p.passive.push(n);
});
reg("router", "passive-interface default", s => { const p = proc(s); p.passiveDefault = true; p.passive = []; p.noPassive = []; });
reg("router", "no passive-interface default", s => { const p = proc(s); p.passiveDefault = false; p.noPassive = []; });
reg("router", "no passive-interface <if>", (s, n) => {
  const p = proc(s);
  p.passive = p.passive.filter(x => x !== n);
  if (p.passiveDefault && !p.noPassive.includes(n)) p.noPassive.push(n);
});
reg("router", "default-information originate", s => { proc(s).defaultOriginate = true; proc(s).always = false; });
reg("router", "default-information originate always", s => { proc(s).defaultOriginate = true; proc(s).always = true; });
reg("router", "no default-information originate", s => { proc(s).defaultOriginate = false; });
reg("router", "auto-cost reference-bandwidth <num>", (s, n) => {
  if (n < 1 || n > 4294967) return INVALID;
  const p = proc(s);
  p.misc = p.misc.filter(x => !x.startsWith("auto-cost"));
  if (n !== 100) p.misc.push("auto-cost reference-bandwidth " + n);
  return "% OSPF: Reference bandwidth is changed.\n        Please ensure reference bandwidth is consistent across all routers.";
});
reg("router", "no auto-cost reference-bandwidth", s => { const p = proc(s); p.misc = p.misc.filter(x => !x.startsWith("auto-cost")); });
reg("router", "log-adjacency-changes", () => {});

// ACLs
reg("config", "access-list <num> <rest>", (s, n, r) => {
  const type = aclTypeOfNumber(n);
  if (!type) return INVALID;
  if (/^remark\b/i.test(r)) return;
  if (!addAclRule(s.dev, String(n), type, r)) return INVALID;
});
reg("config", "no access-list <num>", (s, n) => { delete s.dev.acls[String(n)]; });
reg("config", "ip access-list standard|extended <word>", (s, type, name) => {
  if (/^\d+$/.test(name) && aclTypeOfNumber(Number(name)) !== type) return INVALID;
  if (s.dev.acls[name] && s.dev.acls[name].type !== type) return `% Access list ${name} already exists with a different type.`;
  s.dev.acls[name] ||= { type, entries: [] };
  s.mode = "acl";
  s.ctx = { acl: name, aclType: type };
});
reg("config", "no ip access-list standard|extended <word>", (s, type, name) => { delete s.dev.acls[name]; });
const aclLine = (s, text, seq) => { if (!addAclRule(s.dev, s.ctx.acl, s.ctx.aclType, text, seq)) return INVALID; };
reg("acl", "permit <rest>", (s, r) => aclLine(s, "permit " + r));
reg("acl", "deny <rest>", (s, r) => aclLine(s, "deny " + r));
reg("acl", "<num> permit <rest>", (s, n, r) => aclLine(s, "permit " + r, n));
reg("acl", "<num> deny <rest>", (s, n, r) => aclLine(s, "deny " + r, n));
reg("acl", "remark <rest>", () => {});
reg("acl", "no <num>", (s, n) => {
  const acl = s.dev.acls[s.ctx.acl];
  acl.entries = acl.entries.filter(e => e.seq !== n);
});
reg("acl", "no permit|deny <rest>", (s, act, r) => {
  const acl = s.dev.acls[s.ctx.acl];
  const rule = parseAclRule(acl.type, act + " " + r);
  if (!rule) return INVALID;
  const text = aclRuleText(acl.type, rule);
  acl.entries = acl.entries.filter(e => aclRuleText(acl.type, e) !== text);
});

// NAT
reg("config", "ip nat inside source list <word> interface <if> overload", (s, acl, iface) => {
  if (!s.dev.ifaces[iface]) return INVALID;
  s.dev.natRules = s.dev.natRules.filter(r => !(r.type === "overload" && r.acl === acl));
  s.dev.natRules.push({ type: "overload", acl, iface });
}, ["router"]);
reg("config", "ip nat inside source list <word> interface <if>", () => "% In this lab, add the 'overload' keyword so many inside hosts can share the address (PAT).", ["router"]);
reg("config", "no ip nat inside source list <word> interface <if> overload", (s, acl) => { s.dev.natRules = s.dev.natRules.filter(r => !(r.type === "overload" && r.acl === acl)); }, ["router"]);
reg("config", "no ip nat inside source list <word>", (s, acl) => { s.dev.natRules = s.dev.natRules.filter(r => !(r.type === "overload" && r.acl === acl)); }, ["router"]);
reg("config", "ip nat inside source static <ip> <ip>", (s, local, global) => {
  s.dev.natRules = s.dev.natRules.filter(r => !(r.type === "static" && r.local === local));
  s.dev.natRules.push({ type: "static", local, global });
}, ["router"]);
reg("config", "no ip nat inside source static <ip> <ip>", (s, local) => { s.dev.natRules = s.dev.natRules.filter(r => !(r.type === "static" && r.local === local)); }, ["router"]);

// DHCP server
const exclude = (s, lo, hi = lo) => {
  if (hi < lo) return "% Range [low, high] is invalid.";
  if (!s.dev.dhcp.excluded.some(([a, b]) => a === lo && b === hi)) s.dev.dhcp.excluded.push([lo, hi]);
};
reg("config", "ip dhcp excluded-address <ip>", exclude, ["router"]);
reg("config", "ip dhcp excluded-address <ip> <ip>", exclude, ["router"]);
reg("config", "no ip dhcp excluded-address <ip>", (s, lo) => { s.dev.dhcp.excluded = s.dev.dhcp.excluded.filter(([a]) => a !== lo); }, ["router"]);
reg("config", "no ip dhcp excluded-address <ip> <ip>", (s, lo, hi) => { s.dev.dhcp.excluded = s.dev.dhcp.excluded.filter(([a, b]) => !(a === lo && b === hi)); }, ["router"]);
reg("config", "ip dhcp pool <word>", (s, name) => {
  s.dev.dhcp.pools[name] ||= { net: null, mask: null, gw: null, dns: null, misc: [] };
  s.mode = "dhcp";
  s.ctx = { pool: name };
}, ["router"]);
reg("config", "no ip dhcp pool <word>", (s, name) => { delete s.dev.dhcp.pools[name]; }, ["router"]);
const pool = s => s.dev.dhcp.pools[s.ctx.pool];
reg("dhcp", "network <ip> <mask>", (s, ip, mask) => { const p = pool(s); p.net = netOf(ip, mask); p.mask = mask; });
reg("dhcp", "no network", s => { const p = pool(s); p.net = null; p.mask = null; });
reg("dhcp", "default-router <ip>", (s, ip) => { pool(s).gw = ip; });
reg("dhcp", "no default-router", s => { pool(s).gw = null; });
reg("dhcp", "dns-server <ip>", (s, ip) => { pool(s).dns = ip; });
reg("dhcp", "no dns-server", s => { pool(s).dns = null; });
reg("dhcp", "domain-name <word>", (s, w) => { const p = pool(s); p.misc = p.misc.filter(x => !x.startsWith("domain-name")); p.misc.push("domain-name " + w); });
reg("dhcp", "lease <rest>", (s, r) => { const p = pool(s); p.misc = p.misc.filter(x => !x.startsWith("lease")); p.misc.push("lease " + r); });

// accepted but not simulated (kept in the running-config)
reg("config", "ntp server <ip>", (s, ip) => misc("ntp server " + intToIp(ip))(s));
reg("config", "logging <ip>", (s, ip) => misc("logging host " + intToIp(ip))(s));
reg("config", "logging host <ip>", (s, ip) => misc("logging host " + intToIp(ip))(s));
reg("config", "logging trap <word>", (s, w) => misc("logging trap " + w)(s));
reg("config", "snmp-server <rest>", (s, r) => misc("snmp-server " + r)(s));
reg("config", "clock timezone <rest>", (s, r) => misc("clock timezone " + r)(s));
reg("config", "cdp run", unmisc("no cdp run"));
reg("config", "no cdp run", misc("no cdp run"));
reg("config", "lldp run", misc("lldp run"));
reg("config", "no lldp run", unmisc("lldp run"));
reg("config", "spanning-tree mode pvst|rapid-pvst", (s, m) => { s.dev.stp.mode = m; }, ["switch"]);
const PRIORITIES = Array.from({ length: 16 }, (_, i) => i * 4096);
reg("config", "spanning-tree vlan <word> priority <num>", (s, list, n) => {
  const vlans = parseVlanList(list);
  if (!vlans) return INVALID;
  if (!PRIORITIES.includes(n)) return "% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  " + PRIORITIES.join(" ");
  for (const v of vlans) s.dev.stp.prio[v] = n;
}, ["switch"]);
// "root primary" picks a priority that beats the current root; "root secondary" is a fixed 28672
reg("config", "spanning-tree vlan <word> root primary|secondary", (s, list, which) => {
  const vlans = parseVlanList(list);
  if (!vlans) return INVALID;
  const d = s.dev, failed = [];
  for (const v of vlans) {
    if (which === "secondary") { d.stp.prio[v] = 28672; continue; }
    const tree = s.net.st.stp[d.name][v];
    const mine = d.stp.prio[v] ?? 32768;
    if (!tree || tree.root.dev === d.name) { d.stp.prio[v] = Math.min(mine, 24576); continue; }
    const current = tree.root.prio - v;
    if (current > 24576) d.stp.prio[v] = 24576;
    else if (current >= 4096) d.stp.prio[v] = current - 4096;
    else failed.push(v);
  }
  if (failed.length) return `% Failed to make the bridge root for vlan ${failed.join(",")}\n% The current root already has priority 0. Raise that switch's priority, or set this one to 0.`;
}, ["switch"]);
reg("config", "no spanning-tree vlan <word> priority", (s, list) => { for (const v of parseVlanList(list) || []) delete s.dev.stp.prio[v]; }, ["switch"]);
reg("config", "no spanning-tree vlan <word> root", (s, list) => { for (const v of parseVlanList(list) || []) delete s.dev.stp.prio[v]; }, ["switch"]);
reg("config", "spanning-tree portfast default", misc("spanning-tree portfast default"), ["switch"]);
reg("config", "ipv6 unicast-routing", misc("ipv6 unicast-routing"), ["router"]);

// ---------------------------------------------------------------- line config
const lineOf = s => s.dev.lines[s.ctx.line];
reg("line", "password <word>", (s, w) => { lineOf(s).password = w; });
reg("line", "no password", s => { lineOf(s).password = null; });
reg("line", "login", s => {
  lineOf(s).login = "line";
  if (!lineOf(s).password) return "% Login disabled on line, until 'password' is set";
});
reg("line", "login local", s => { lineOf(s).login = "local"; });
reg("line", "no login", s => { lineOf(s).login = "none"; });
const transport = (s, ...p) => { if (s.ctx.line !== "vty") return; lineOf(s).transport = [...new Set(p)].sort().join(" "); };
reg("line", "transport input ssh|telnet|all|none", transport);
reg("line", "transport input ssh|telnet ssh|telnet", (s, a, b) => { if (s.ctx.line === "vty") lineOf(s).transport = a === b ? a : "all"; });
reg("line", "access-class <word> in", (s, w) => { lineOf(s).accessClass = w; });
reg("line", "no access-class <word> in", s => { lineOf(s).accessClass = null; });
const lineMisc = (s, text, prefix) => { const l = lineOf(s); l.misc = l.misc.filter(x => !x.startsWith(prefix)); l.misc.push(text); };
reg("line", "exec-timeout <num>", (s, a) => lineMisc(s, `exec-timeout ${a} 0`, "exec-timeout"));
reg("line", "exec-timeout <num> <num>", (s, a, b) => lineMisc(s, `exec-timeout ${a} ${b}`, "exec-timeout"));
reg("line", "logging synchronous", s => lineMisc(s, "logging synchronous", "logging synchronous"));
reg("line", "history size <num>", (s, n) => lineMisc(s, `history size ${n}`, "history size"));

// ---------------------------------------------------------------- interface config
const each = (s, fn) => { for (const i of s.ifs) { const r = fn(i); if (r) return r; } };

reg("if", "shutdown", s => each(s, i => { i.shutdown = true; i.errdisabled = null; }));
reg("if", "no shutdown", s => each(s, i => { i.shutdown = false; }));
reg("if", "description <rest>", (s, r) => each(s, i => { i.desc = r; }));
reg("if", "no description", s => each(s, i => { i.desc = ""; }));
reg("if", "ip address <ip> <ip>", (s, ip, mask) => each(s, i => {
  const d = s.dev;
  if (i.sw) return "% IP addresses may not be configured on L2 links.";
  if (d.kind === "router" && ifKind(i.name) === "sub" && i.dot1q == null) return "% Configuring IP routing on a LAN subinterface is only allowed if that\nsubinterface is already configured as part of an IEEE 802.10, IEEE 802.1Q,\nor ISL vLAN.\nTip: type \"encapsulation dot1q <vlan>\" on the subinterface first, then the address.";
  const len = maskLen(mask);
  if (len === null || len === 0) return `Bad mask 0x${mask.toString(16).toUpperCase()} for address ${intToIp(ip)}`;
  if (len < 31 && (ip === netOf(ip, mask) || ip === bcastOf(ip, mask))) return `Bad mask /${len} for address ${intToIp(ip)}`;
  for (const n of d.ifOrder) {
    const o = d.ifaces[n];
    if (o === i || o.ip == null) continue;
    const m = (o.mask & mask) >>> 0;
    if (((o.ip ^ ip) & m) === 0) return `% ${intToIp(netOf(ip, mask))} overlaps with ${n}`;
  }
  i.ip = ip;
  i.mask = mask;
}));
reg("if", "no ip address", s => each(s, i => { i.ip = null; i.mask = null; }));
reg("if", "ip address dhcp", () => "% DHCP client on router interfaces is not simulated in this lab.");
reg("if", "duplex auto|full|half", (s, v) => each(s, i => { i.misc = i.misc.filter(x => !x.startsWith("duplex")); if (v !== "auto") i.misc.push("duplex " + v); }));
reg("if", "speed <word>", (s, v) => each(s, i => { i.misc = i.misc.filter(x => !x.startsWith("speed")); if (v !== "auto") i.misc.push("speed " + v); }));
reg("if", "clock rate <num>", (s, n) => each(s, i => { i.misc = i.misc.filter(x => !x.startsWith("clock rate")); i.misc.push("clock rate " + n); }), ["router"]);
reg("if", "bandwidth <num>", (s, n) => each(s, i => { if (n < 1) return INVALID; i.misc = i.misc.filter(x => !x.startsWith("bandwidth")); i.misc.push("bandwidth " + n); }));
reg("if", "no bandwidth", s => each(s, i => { i.misc = i.misc.filter(x => !x.startsWith("bandwidth")); }));
reg("if", "cdp enable", () => {});
reg("if", "no cdp enable", () => {});

// switchport
const swOnly = ["switch"];
const membersOf = (d, po) => d.ifOrder.map(n => d.ifaces[n]).filter(m => m.channel && `Port-channel${m.channel.id}` === po);
// layer 2 settings typed on a port-channel are copied to its member ports, as IOS does
const sw = (s, fn) => each(s, i => {
  if (!i.sw) return "% Command rejected: not a switching port.";
  const r = fn(i.sw, i);
  if (!r && ifKind(i.name) === "po") for (const m of membersOf(s.dev, i.name)) fn(m.sw, m);
  return r;
});
reg("if", "switchport", () => {}, swOnly);
reg("if", "switchport mode access|trunk", (s, m) => sw(s, x => { x.mode = m; }), swOnly);
const DTP_CONFLICT = "Command rejected: Conflict between 'nonegotiate' and 'dynamic' status.";
reg("if", "switchport mode dynamic auto|desirable", (s, m) => sw(s, x => { if (x.nonegotiate) return DTP_CONFLICT; x.mode = null; x.dtp = m; }), swOnly);
reg("if", "no switchport mode", s => sw(s, x => { if (x.nonegotiate) return DTP_CONFLICT; x.mode = null; x.dtp = "auto"; }), swOnly);
reg("if", "switchport nonegotiate", s => sw(s, x => { if (!x.mode) return DTP_CONFLICT; x.nonegotiate = true; }), swOnly);
reg("if", "no switchport nonegotiate", s => sw(s, x => { x.nonegotiate = false; }), swOnly);
reg("if", "switchport trunk encapsulation dot1q", () => {}, swOnly);
reg("if", "switchport access vlan <num>", (s, v) => {
  if (v < 1 || v > 4094) return INVALID;
  let msg;
  if (!s.dev.vlans[v]) { s.dev.vlans[v] = { name: "VLAN" + String(v).padStart(4, "0") }; msg = `% Access VLAN does not exist. Creating vlan ${v}`; }
  return sw(s, x => { x.accessVlan = v; }) || msg;
}, swOnly);
reg("if", "no switchport access vlan", s => sw(s, x => { x.accessVlan = 1; }), swOnly);
reg("if", "switchport trunk native vlan <num>", (s, v) => sw(s, x => { x.native = v; }), swOnly);
reg("if", "no switchport trunk native vlan", s => sw(s, x => { x.native = 1; }), swOnly);
reg("if", "switchport trunk allowed vlan <rest>", (s, r) => {
  const m = /^(add|remove|except)?\s*(.*)$/i.exec(r.trim());
  const op = (m[1] || "").toLowerCase(), arg = m[2].trim().toLowerCase();
  if (!op && arg === "all") return sw(s, x => { x.allowed = null; });
  if (!op && arg === "none") return sw(s, x => { x.allowed = []; });
  const list = parseVlanList(arg);
  if (!list) return INVALID;
  return sw(s, x => {
    const all = Array.from({ length: 4094 }, (_, k) => k + 1);
    if (!op) x.allowed = list;
    else if (op === "add") x.allowed = x.allowed ? [...new Set([...x.allowed, ...list])].sort((a, b) => a - b) : null;
    else if (op === "remove") x.allowed = (x.allowed || all).filter(v => !list.includes(v));
    else x.allowed = all.filter(v => !list.includes(v));
  });
}, swOnly);
reg("if", "no switchport trunk allowed vlan", s => sw(s, x => { x.allowed = null; }), swOnly);
reg("if", "switchport port-security", s => sw(s, (x, i) => {
  if (!x.mode) return `Command rejected: ${i.name} is a dynamic port.`;        // a static access or static trunk port is accepted
  x.ps.on = true;
}), swOnly);
reg("if", "no switchport port-security", s => sw(s, x => { x.ps.on = false; }), swOnly);
reg("if", "switchport port-security maximum <num>", (s, n) => sw(s, x => { x.ps.max = n; }), swOnly);
reg("if", "switchport port-security violation shutdown|restrict|protect", (s, v) => sw(s, x => { x.ps.violation = v; }), swOnly);
reg("if", "switchport port-security mac-address sticky", s => sw(s, x => { x.ps.sticky = true; }), swOnly);
reg("if", "no switchport port-security mac-address sticky", s => sw(s, x => { x.ps.sticky = false; }), swOnly);
reg("if", "spanning-tree portfast", s => sw(s, x => { x.portfast = true; }) || "%Warning: portfast should only be enabled on ports connected to a single\n host. Connecting hubs, concentrators, switches, bridges, etc... to this\n interface when portfast is enabled, can cause temporary bridging loops.", swOnly);
reg("if", "no spanning-tree portfast", s => sw(s, x => { x.portfast = false; }), swOnly);
reg("if", "spanning-tree bpduguard enable", s => sw(s, x => { x.bpduguard = true; }), swOnly);
reg("if", "no spanning-tree bpduguard enable", s => sw(s, x => { x.bpduguard = false; }), swOnly);
reg("if", "spanning-tree bpduguard disable", s => sw(s, x => { x.bpduguard = false; }), swOnly);
reg("if", "channel-group <num> mode active|passive|on|desirable|auto", (s, id, mode) => {
  if (id < 1 || id > 6) return "% Invalid group number: this switch supports channel groups 1 to 6.";
  const d = s.dev, name = `Port-channel${id}`;
  for (const i of s.ifs) if (!i.sw || ifKind(i.name) !== "phys") return "% Command rejected: only physical switch ports can join a channel group.";
  const existing = membersOf(d, name).find(m => !s.ifs.includes(m));
  if (existing && CHANNEL_PROTO[existing.channel.mode] !== CHANNEL_PROTO[mode]) {
    return `% Command rejected (${name}): mode ${mode} does not match the protocol of ${shortIf(existing.name)}, which is already in this group as ${existing.channel.mode}.`;
  }
  const fresh = !d.ifaces[name];
  const po = ensureIface(d, name);
  if (fresh) {                                  // a new port-channel starts with the first member's settings
    const from = s.ifs[0].sw;
    Object.assign(po.sw, { mode: from.mode, accessVlan: from.accessVlan, allowed: from.allowed ? [...from.allowed] : null, native: from.native });
  }
  for (const i of s.ifs) i.channel = { id, mode };
  if (fresh) return `Creating a port-channel interface Port-channel ${id}`;
}, swOnly);
reg("if", "no channel-group", s => each(s, i => { i.channel = null; }), swOnly);
reg("if", "spanning-tree guard root|loop|none", (s, g) => sw(s, x => { x.guard = g === "none" ? null : g; }), swOnly);
reg("if", "no spanning-tree guard", s => sw(s, x => { x.guard = null; }), swOnly);
reg("if", "no spanning-tree guard root|loop", s => sw(s, x => { x.guard = null; }), swOnly);
reg("if", "spanning-tree cost <num>", (s, n) => sw(s, x => { x.stpCost = n; }), swOnly);
reg("if", "no spanning-tree cost", s => sw(s, x => { x.stpCost = null; }), swOnly);

// router interface features
const rOnly = ["router"];
reg("if", "encapsulation dot1q <num>", (s, v) => each(s, i => {
  if (!i.name.includes(".")) return "% Encapsulation is configured on subinterfaces (for example GigabitEthernet0/0.10).";
  i.dot1q = v; i.dot1qNative = false;
}), rOnly);
reg("if", "encapsulation dot1q <num> native", (s, v) => each(s, i => {
  if (!i.name.includes(".")) return "% Encapsulation is configured on subinterfaces (for example GigabitEthernet0/0.10).";
  i.dot1q = v; i.dot1qNative = true;
}), rOnly);
reg("if", "ip nat inside|outside", (s, dir) => each(s, i => { i.nat = dir; }), rOnly);
reg("if", "no ip nat inside|outside", s => each(s, i => { i.nat = null; }), rOnly);
reg("if", "ip access-group <word> in|out", (s, name, dir) => each(s, i => { if (dir === "in") i.aclIn = name; else i.aclOut = name; }), rOnly);
reg("if", "no ip access-group <word> in|out", (s, name, dir) => each(s, i => { if (dir === "in") i.aclIn = null; else i.aclOut = null; }), rOnly);
reg("if", "no ip access-group in|out", (s, dir) => each(s, i => { if (dir === "in") i.aclIn = null; else i.aclOut = null; }), rOnly);
reg("if", "ip helper-address <ip>", (s, ip) => each(s, i => { if (!i.helpers.includes(ip)) i.helpers.push(ip); }), rOnly);
reg("if", "no ip helper-address <ip>", (s, ip) => each(s, i => { i.helpers = i.helpers.filter(h => h !== ip); }), rOnly);
reg("if", "no ip helper-address", s => each(s, i => { i.helpers = []; }), rOnly);
reg("if", "ip ospf <num> area <num>", (s, pid, area) => {
  s.dev.ospf[pid] ||= { routerId: null, networks: [], passive: [], passiveDefault: false, noPassive: [], defaultOriginate: false, always: false, misc: [] };
  return each(s, i => { i.ospfArea = { pid, area }; });
}, rOnly);
reg("if", "no ip ospf <num> area <num>", s => each(s, i => { i.ospfArea = null; }), rOnly);
reg("if", "ip ospf cost <num>", (s, n) => each(s, i => { i.ospfCost = n; }), rOnly);
reg("if", "no ip ospf cost", s => each(s, i => { i.ospfCost = null; }), rOnly);
reg("if", "ip ospf priority <num>", (s, n) => each(s, i => { i.ospfPri = n; }), rOnly);
reg("if", "no ip ospf priority", s => each(s, i => { i.ospfPri = null; }), rOnly);
reg("if", "ip ospf hello-interval <num>", (s, n) => each(s, i => { i.ospfHello = n === 10 ? null : n; }), rOnly);
reg("if", "no ip ospf hello-interval", s => each(s, i => { i.ospfHello = null; }), rOnly);
reg("if", "ip ospf dead-interval <num>", (s, n) => each(s, i => { i.ospfDead = n; }), rOnly);
reg("if", "no ip ospf dead-interval", s => each(s, i => { i.ospfDead = null; }), rOnly);
reg("if", "ip ospf network point-to-point|broadcast", (s, t) => each(s, i => {
  if (ifKind(i.name) === "loop") return "% OSPF: Network type cannot be changed on a loopback in this lab.";
  const def = i.name.startsWith("Serial") ? "p2p" : "broadcast", want = t === "broadcast" ? "broadcast" : "p2p";
  i.ospfNet = want === def ? null : want;
}), rOnly);
reg("if", "no ip ospf network", s => each(s, i => { i.ospfNet = null; }), rOnly);

// Run a list of config lines against a device (used to preconfigure levels).
export function applyConfig(net, devName, lines) {
  const s = new IosSession(net, devName, { mode: "config" });
  const errors = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    net.touch();
    const out = s.pending ? (() => { const p = s.pending; s.pending = null; return p.fn(line) || ""; })() : s.run(line) || "";
    if (/% (Invalid|Incomplete|Ambiguous)|overlaps with|rejected|Bad mask|Inconsistent|illegal|only allowed/.test(out)) errors.push(`${devName}: "${line}" -> ${out.trim()}`);
  }
  net.touch();
  return errors;
}
