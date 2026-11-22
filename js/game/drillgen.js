// Question generators for the drills. There is no DOM in here: every question
// is built from a seeded random source, so the tests can rebuild thousands of
// them and check each answer by a second, independent calculation.
//
// A question is one of two shapes:
//   { kind: "choice", prompt, exhibit, options: [...], answer: index, explain, meta }
//   { kind: "fields", prompt, exhibit, fields: [{ label, answer, check }], explain, meta }
// `check` names how a typed answer is compared (see checkField). `meta` holds
// the raw numbers behind the question, for the tests.

import { ipToInt, intToIp, lenMask, netOf } from "../engine/ip.js";

// ---------------------------------------------------------------- randomness
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const x = {
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    bool: (p = 0.5) => next() < p,
    shuffle: arr => { const b = arr.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; },
    sample: (arr, n) => x.shuffle(arr).slice(0, n),
  };
  return x;
}

const ip4 = (a, b, c, d) => ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
const pfx = (net, len) => `${intToIp(net)}/${len}`;
const list = words => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

// ---------------------------------------------------------------- IPv6 text
// An address is eight 16-bit groups. These three functions are all the IPv6
// arithmetic the drills need.
export function v6parse(text) {
  const s = String(text).trim().toLowerCase();
  if (!/^[0-9a-f:]+$/.test(s) || s.split("::").length > 2) return null;
  const groups = part => (part === "" ? [] : part.split(":"));
  const [head, tail] = s.split("::");
  const a = groups(head), b = tail === undefined ? null : groups(tail);
  if ([...a, ...(b || [])].some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  const fill = b === null ? 0 : 8 - a.length - b.length;
  if (b === null ? a.length !== 8 : fill < 1) return null;
  return [...a, ...Array(fill).fill("0"), ...(b || [])].map(g => parseInt(g, 16));
}
export const v6full = g => g.map(n => n.toString(16).padStart(4, "0")).join(":");
// The shortest standard form (RFC 5952): lowercase, no leading zeros, and "::"
// for the longest run of two or more zero groups, the leftmost one on a tie.
export function v6short(g) {
  let best = -1, bestLen = 1;
  for (let i = 0; i < 8; i++) {
    if (g[i] !== 0) continue;
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  const hex = arr => arr.map(n => n.toString(16)).join(":");
  return best < 0 ? hex(g) : `${hex(g.slice(0, best))}::${hex(g.slice(best + bestLen))}`;
}

// ---------------------------------------------------------------- checking a typed answer
const parsePrefix = text => {
  const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})\s*$/.exec(String(text));
  const net = m ? ipToInt(m[1]) : null;
  return net === null || Number(m[2]) > 32 ? null : { net, len: Number(m[2]) };
};
export function checkField(field, typed) {
  const raw = String(typed).trim();
  switch (field.check) {
    case "number": return raw.replace(/[,\s.]/g, "") === String(field.answer);
    case "prefix": { const a = parsePrefix(raw), b = parsePrefix(field.answer); return !!a && a.net === b.net && a.len === b.len; }
    // the same address written in any valid way
    case "ipv6": { const a = v6parse(raw), b = v6parse(field.answer); return !!a && a.every((n, i) => n === b[i]); }
    // exactly this spelling (upper or lower case)
    case "ipv6-text": return raw.toLowerCase() === field.answer;
    default: return raw.toLowerCase() === String(field.answer).toLowerCase();
  }
}

// ================================================================ 1. routing table lookup
const SOURCE = {
  S: { name: "static", ad: 1, metric: () => 0 },
  D: { name: "EIGRP", ad: 90, metric: x => x.pick([2816, 3072, 28416, 30720]) },
  O: { name: "OSPF", ad: 110, metric: x => x.pick([2, 11, 20, 65, 130]) },
  R: { name: "RIP", ad: 120, metric: x => x.int(1, 6) },
};
const routeLine = r => (r.code === "C"
  ? `C        ${pfx(r.net, r.len)} is directly connected, ${r.iface}`
  : `${r.len === 0 ? "S*" : r.code + " "}       ${pfx(r.net, r.len)} [${r.ad}/${r.metric}] via ${intToIp(r.nh)}${r.code === "S" ? "" : `, 00:${String(10 + (r.metric % 40)).padStart(2, "0")}:${String(r.len + 11).padStart(2, "0")}, GigabitEthernet0/1`}`);
const outcome = r => (!r ? "Drop it: no route matches" : r.code === "C" ? `Deliver it directly out of ${r.iface}` : `Forward it to ${intToIp(r.nh)}`);

function routeTable(x) {
  const a = x.int(1, 200), b = x.int(1, 250), lan = x.int(1, 250);
  const hops = x.shuffle([2, 6, 10, 14, 18, 22]).map(n => ip4(10, 0, 0, n));
  const codes = x.shuffle(["S", "D", "O", "R", x.pick(["O", "D"])]);
  const route = (net, len, k) => { const s = SOURCE[codes[k]]; return { net, len, code: codes[k], ad: s.ad, metric: s.metric(x), nh: hops[k] }; };
  const p16 = ip4(10, a, 0, 0), p24 = ip4(10, a, b, 0), p28 = (p24 + 16 * x.int(1, 14)) >>> 0;
  const routes = [route(p16, 16, 0), route(p24, 24, 1), route(p28, 28, 2)];
  // a host route for one address of the /24 that lies outside the /28
  const hostIp = (p24 + (((p28 & 255) + 40) % 240) + 3) >>> 0;
  if (x.bool(0.45)) routes.push(route(hostIp, 32, 3));
  const hasDefault = x.bool(0.6);
  if (hasDefault) routes.push({ net: 0, len: 0, code: "S", ad: 1, metric: 0, nh: ip4(203, 0, 113, 1) });
  routes.push({ net: ip4(10, 0, 0, 0), len: 24, code: "C", iface: "GigabitEthernet0/1" }, { net: ip4(192, 168, lan, 0), len: 24, code: "C", iface: "GigabitEthernet0/0" });
  if (hasDefault) routes.push({ net: ip4(203, 0, 113, 0), len: 30, code: "C", iface: "Serial0/0/0" });

  // where the packet is going: each choice lands in a different part of the table
  const inside = (net, len, avoid) => { for (;;) { const d = (net + x.int(1, 2 ** (32 - len) - 2)) >>> 0; if (!avoid.some(r => ((d ^ r.net) & lenMask(r.len)) === 0)) return d; } };
  const host = routes.find(r => r.len === 32);
  const spots = ["in28", "in24", "in24", "in16", "in16", "away", "away", "lan", ...(host ? ["host", "host"] : [])];
  const dst = {
    in28: () => inside(p28, 28, host ? [host] : []),
    in24: () => inside(p24, 24, [{ net: p28, len: 28 }, ...(host ? [host] : [])]),
    in16: () => inside(p16, 16, [{ net: p24, len: 24 }]),
    away: () => ip4(x.pick([172, 198, 8, 151]), x.int(16, 31), x.int(1, 250), x.int(1, 250)),
    lan: () => ip4(192, 168, lan, x.int(2, 250)),
    host: () => hostIp,
  }[x.pick(spots)]();

  const matches = routes.filter(r => ((dst ^ r.net) & lenMask(r.len)) === 0).sort((p, q) => q.len - p.len);
  const best = matches[0] || null;
  const others = x.shuffle(routes.filter(r => r !== best && r.code !== "C").map(outcome)).slice(0, 3);
  const options = x.shuffle([...new Set([outcome(best), ...others, outcome(null), ...(best && best.code === "C" ? [] : [outcome(routes.find(r => r.iface === "GigabitEthernet0/0"))])])]);
  const named = matches.map(r => pfx(r.net, r.len));
  const sorted = routes.slice().sort((p, q) => p.net - q.net || p.len - q.len);
  return {
    kind: "choice",
    prompt: `A packet arrives for **${intToIp(dst)}**. What does this router do with it?`,
    exhibit: [hasDefault ? "Gateway of last resort is 203.0.113.1 to network 0.0.0.0" : "Gateway of last resort is not set", "", ...sorted.map(routeLine)].join("\n"),
    options, answer: options.indexOf(outcome(best)),
    explain: !best ? "No entry contains this address and there is no default route, so the router drops the packet and reports the destination as unreachable."
      : matches.length === 1 ? `Only ${named[0]} contains this address${best.len === 0 ? ": nothing more specific matches, so the default route is used" : ""}.`
        : `The address is inside ${list(named)}. The longest prefix wins, so /${best.len} decides. Administrative distance and metric play no part here: they only choose between routes to the *same* prefix.`,
    meta: { type: "lookup", routes, dst, best },
  };
}

// Several sources offer the same prefix: which one goes into the table?
function routeSource(x) {
  const net = ip4(10, x.int(1, 200), x.int(1, 250), 0), hops = x.shuffle([2, 6, 10, 14]).map(n => ip4(10, 0, 0, n));
  const mode = x.pick(["protocols", "protocols", "metric", "mixed"]);
  const codes = mode === "protocols" ? x.sample(["D", "O", "R"], 3) : mode === "metric" ? [x.pick(["O", "R", "D"])] : (c => [c, c, x.pick(["D", "O", "R"].filter(k => k !== c))])(x.pick(["O", "R"]));
  if (mode === "metric") codes.push(codes[0], codes[0]);
  const used = new Set();
  const cands = codes.map((code, k) => {
    const s = SOURCE[code];
    let metric;
    do metric = s.metric(x); while (used.has(code + metric));
    used.add(code + metric);
    return { code, name: s.name, ad: s.ad, metric, nh: hops[k] };
  });
  const best = cands.slice().sort((p, q) => p.ad - q.ad || p.metric - q.metric)[0];
  const text = c => `The ${c.name} route through ${intToIp(c.nh)}`;
  const options = x.shuffle(cands.map(text));
  const sameSource = cands.filter(c => c.code === best.code).length > 1;
  return {
    kind: "choice",
    prompt: `A router hears about **${pfx(net, 24)}** from ${cands.length} places at once. Which one does it put in its routing table?`,
    exhibit: cands.map(c => `${c.name.padEnd(6)} via ${intToIp(c.nh).padEnd(10)}  administrative distance ${String(c.ad).padStart(3)}, metric ${c.metric}`).join("\n"),
    options, answer: options.indexOf(text(best)),
    explain: mode === "metric" ? `All three come from ${best.name}, so the lowest metric wins: ${best.metric}.`
      : `These are routes to the same prefix, so administrative distance decides first, and ${best.name} (${best.ad}) is the lowest. ${sameSource ? `Two ${best.name} routes remain, and between those the lower metric (${best.metric}) wins.` : "Metrics of different protocols are never compared with each other."}`,
    meta: { type: "source", cands, best },
  };
}

// ================================================================ 2. VLSM and summarisation
function vlsmPlan(x) {
  const big = x.bool(0.35), baseLen = big ? 23 : 24, size = 2 ** (32 - baseLen);
  const base = big ? ip4(172, 16, 2 * x.int(0, 100), 0) : ip4(192, 168, x.int(1, 250), 0);
  let lens;
  do lens = x.sample(big ? [24, 25, 26, 27, 28, 30] : [25, 26, 27, 28, 29, 30], x.int(3, 4)).sort((p, q) => p - q);
  while (lens.reduce((sum, l) => sum + 2 ** (32 - l), 0) > size);
  let at = base;
  const needs = lens.map(len => {
    const usable = 2 ** (32 - len) - 2;
    const hosts = len === 30 ? 2 : x.int(Math.floor(usable / 2) + 1, usable);     // too many for the next size down
    const n = { hosts, net: at, len };
    at = (at + 2 ** (32 - len)) >>> 0;
    return n;
  });
  const label = n => (n.len === 30 ? "Link between two routers (2 addresses)" : `${n.hosts} hosts`);
  return {
    kind: "fields",
    prompt: `Carve **${pfx(base, baseLen)}** into one subnet for each segment below. Give each the smallest subnet that fits, hand them out **largest first**, and start each at the lowest free address. Answer as network/prefix, for example 10.1.2.64/27.`,
    exhibit: null,
    fields: x.shuffle(needs).map(n => ({ label: label(n), answer: pfx(n.net, n.len), check: "prefix" })),
    explain: needs.map(n => `${label(n)}: /${n.len} has ${2 ** (32 - n.len) - 2} usable addresses, so ${pfx(n.net, n.len)}.`).join(" ") + " Each subnet starts where the one before it ended.",
    meta: { type: "plan", base, baseLen, needs },
  };
}
function summary(x) {
  const second = x.int(16, 31), aligned = x.bool(0.5);
  const count = aligned ? x.pick([2, 4, 4, 8]) : x.pick([2, 3, 4]);
  let start;
  if (aligned) start = count * x.int(0, Math.floor(240 / count));
  else do start = x.int(1, 240); while (start % count === 0 || (count === 3 && start % 4 === 0));
  const nets = Array.from({ length: count }, (_, k) => ip4(172, second, start + k, 0));
  // the shortest prefix that still holds the first and the last subnet
  let len = 24;
  while (netOf(nets[0], lenMask(len)) !== netOf(nets.at(-1), lenMask(len))) len--;
  const net = netOf(nets[0], lenMask(len)), covers = 2 ** (24 - len);
  const bits = n => n.toString(2).padStart(8, "0");
  return {
    kind: "fields",
    prompt: "One route has to cover all of these subnets. Give the **most specific** summary that includes every one of them, and say how many /24 networks that summary covers in total.",
    exhibit: nets.map(n => pfx(n, 24)).join("\n"),
    fields: [{ label: "Summary route", answer: pfx(net, len), check: "prefix" }, { label: "/24 networks it covers", answer: String(covers), check: "number" }],
    explain: `In the third octet, ${start} is ${bits(start)} and ${start + count - 1} is ${bits(start + count - 1)}: they share their first ${len - 16} bits, so the prefix is 16 + ${len - 16} = /${len}. `
      + (covers === count ? `A /${len} covers exactly these ${count} networks.` : `A /${len} covers ${covers} networks, ${covers - count} more than you listed: these subnets do not start on a multiple of a block size, so no exact summary exists.`),
    meta: { type: "summary", nets, net, len, covers },
  };
}

// ================================================================ 3. IPv6
const hexWord = x => x.int(1, 0xffff);
function v6groups(x) {
  // 2001:db8 and then a mix of values, short values and zero runs
  const shape = x.pick(["run", "run", "two-equal", "two-different", "single", "tail"]);
  const g = [0x2001, 0x0db8, ...Array.from({ length: 6 }, () => (x.bool(0.5) ? hexWord(x) : x.int(1, 0xff)))];
  const zero = (from, n) => { for (let i = from; i < from + n; i++) g[i] = 0; };
  if (shape === "run") zero(x.int(2, 4), x.int(2, 3));
  if (shape === "two-equal") { zero(2, 2); zero(5, 2); }
  if (shape === "two-different") { const first = x.bool(); zero(2, first ? 2 : 3); zero(first ? 5 : 6, first ? 3 : 2); }
  if (shape === "single") { zero(x.int(2, 3), 1); zero(x.int(5, 6), 1); }
  if (shape === "tail") { const from = x.int(4, 6); zero(from, 8 - from); }     // the address ends in zeros
  return g;
}
function v6compress(x) {
  const g = v6groups(x);
  return {
    kind: "fields", prompt: "Write this IPv6 address in its **shortest** standard form.", exhibit: v6full(g),
    fields: [{ label: "Shortest form", answer: v6short(g), check: "ipv6-text" }],
    explain: "Drop the leading zeros of every group. Then replace the longest run of all-zero groups with `::`, once only: the leftmost run if two are equally long, and never a single zero group, which is written as `0`.",
    meta: { type: "compress", g },
  };
}
function v6expand(x) {
  const g = v6groups(x);
  return {
    kind: "fields", prompt: "Write this IPv6 address in full: eight groups of four hexadecimal digits.", exhibit: v6short(g),
    fields: [{ label: "Full form", answer: v6full(g), check: "ipv6-text" }],
    explain: "Pad every group to four digits with leading zeros. The `::` stands for as many all-zero groups as it takes to reach eight groups in total.",
    meta: { type: "expand", g },
  };
}
function v6eui(x) {
  const mac = [x.pick([0x00, 0x02, 0x0a, 0x52, 0xfc, 0x3c, 0xa4, 0x00, 0x1e]), ...Array.from({ length: 5 }, () => x.int(0, 255))];
  const prefix = [0x2001, 0x0db8, x.int(1, 0xffff), x.int(1, 0xff)];
  const flipped = mac[0] ^ 0x02;
  const id = [(flipped << 8) | mac[1], (mac[2] << 8) | 0xff, 0xfe00 | mac[3], (mac[4] << 8) | mac[5]];
  const h2 = n => n.toString(16).padStart(2, "0");
  const macText = x.bool() ? `${h2(mac[0])}${h2(mac[1])}.${h2(mac[2])}${h2(mac[3])}.${h2(mac[4])}${h2(mac[5])}` : mac.map(h2).join(":");
  const bit = (mac[0] >> 1) & 1;
  return {
    kind: "fields",
    prompt: `An interface with the MAC address **${macText}** builds its address in the prefix **${v6short([...prefix, 0, 0, 0, 0])}/64** with modified EUI-64. What is the full address?`,
    exhibit: null,
    fields: [{ label: "IPv6 address", answer: v6short([...prefix, ...id]), check: "ipv6" }],
    explain: `Split the MAC address in the middle and insert \`fffe\`: ${h2(mac[0])}${h2(mac[1])}:${h2(mac[2])}ff:fe${h2(mac[3])}:${h2(mac[4])}${h2(mac[5])}. Then flip the seventh bit of the first byte: ${h2(mac[0])} is ${mac[0].toString(2).padStart(8, "0")}, and with that bit turned ${bit ? "off" : "on"} it becomes ${flipped.toString(2).padStart(8, "0")}, which is ${h2(flipped)}. Flipping means ${bit ? "subtracting" : "adding"} 2 here; it is not always "add 2".`,
    meta: { type: "eui", mac, prefix, id },
  };
}
function v6count(x) {
  const [from, to] = x.pick([[48, 64], [56, 64], [48, 52], [48, 56], [52, 56], [60, 64], [52, 64], [44, 48]]);
  const n = 2 ** (to - from);
  return {
    kind: "fields",
    prompt: `A site is given a **/${from}** prefix. How many **/${to}** subnets can be made from it?`,
    exhibit: null,
    fields: [{ label: `Number of /${to} subnets`, answer: String(n), check: "number" }],
    explain: `${to} - ${from} = ${to - from} bits are left for numbering subnets, and 2 to the power of ${to - from} is ${n.toLocaleString("en-US")}. Each hexadecimal digit of the address is four of those bits.`,
    meta: { type: "count", from, to, n },
  };
}

// ================================================================ 4. access list tracing
const anyAddr = { any: true };
const netSpec = (ip, wild) => ({ ip, wild });
const specText = s => (s.any ? "any" : s.wild === 0 ? `host ${intToIp(s.ip)}` : `${intToIp(s.ip)} ${intToIp(s.wild)}`);
const specHas = (s, ip) => s.any || ((ip ^ s.ip) & ~s.wild) === 0;
const portText = p => (!p ? "" : p.op === "range" ? ` range ${p.n} ${p.m}` : ` ${p.op} ${p.n}`);
const portHas = (p, n) => !p || (n != null && (p.op === "eq" ? n === p.n : p.op === "lt" ? n < p.n : p.op === "gt" ? n > p.n : n >= p.n && n <= p.m));
export const aclLineText = l => `${l.action} ${l.proto} ${specText(l.src)} ${specText(l.dst)}${portText(l.dport)}${l.est ? " established" : ""}${l.icmp ? " " + l.icmp : ""}`;
// Why a line does not match a packet, or null when it does.
function mismatch(l, p) {
  if (l.proto !== "ip" && l.proto !== p.proto) return `it is for ${l.proto.toUpperCase()}, and this packet is ${p.proto.toUpperCase()}`;
  if (!specHas(l.src, p.src)) return `the source ${intToIp(p.src)} is outside ${specText(l.src)}`;
  if (!specHas(l.dst, p.dst)) return `the destination ${intToIp(p.dst)} is outside ${specText(l.dst)}`;
  if (!portHas(l.dport, p.dport)) return `the destination port is ${p.dport}`;
  if (l.est && !p.reply) return "`established` needs a packet from a session that is already open, and this is the first packet of a new one";
  if (l.icmp === "echo" && p.reply) return "it matches echo requests, and this is a reply";
  if (l.icmp === "echo-reply" && !p.reply) return "it matches echo replies, and this is a request";
  return null;
}
const pktText = p => {
  const ends = `from **${intToIp(p.src)}** to **${intToIp(p.dst)}**`;
  if (p.proto === "icmp") return `An ICMP ${p.reply ? "echo reply (the answer to a ping)" : "echo request (a ping)"} ${ends}.`;
  if (p.proto === "udp") return `A UDP packet ${ends}, destination port ${p.dport}.`;
  return `A TCP packet ${ends}, destination port ${p.dport}. ${p.reply ? "It belongs to a session that is already open (the ACK flag is set)." : "It is the first packet of a new session (SYN only)."}`;
};

function aclTrace(x) {
  const t = 4 * x.int(1, 60), s = x.int(1, 250);                  // 192.168.t.0 to 192.168.(t+3).0 fit one 0.0.3.255 wildcard
  const lan = k => ip4(192, 168, t + k, 0), W24 = 255, W22 = 1023, W23 = 511;
  const servers = ip4(10, s, 0, 0), srv = ip4(10, s, 0, 10), web = ip4(198, 51, 100, x.int(2, 250)), pub = ip4(203, 0, 113, x.int(2, 250));
  const hostIn = k => (lan(k) + x.int(2, 250)) >>> 0;
  const L = (action, proto, src, dst, more = {}) => ({ action, proto, src, dst, ...more });
  const eq = n => ({ dport: { op: "eq", n } });
  const tcp = (src, dst, dport, reply = false) => ({ proto: "tcp", src, dst, sport: 49152 + x.int(0, 9000), dport, reply });
  const udp = (src, dst, dport) => ({ proto: "udp", src, dst, sport: 49152 + x.int(0, 9000), dport, reply: false });
  const icmp = (src, dst, reply) => ({ proto: "icmp", src, dst, sport: null, dport: null, reply });
  const port = x.pick([80, 443, 8080]), k = x.int(0, 3), other = (k + x.int(1, 3)) % 4;

  const shapes = [
    // a broad deny that sits above the permit it was meant to follow
    () => ({ name: "USERS-IN", lines: [L("deny", "ip", netSpec(lan(k), W24), netSpec(servers, W24)), L("permit", "tcp", netSpec(lan(k), W24), netSpec(srv, 0), eq(port)),
      L("permit", "tcp", netSpec(lan(0), W22), netSpec(srv, 0), eq(port)), L("deny", "ip", netSpec(lan(0), W22), netSpec(servers, W24)), L("permit", "ip", anyAddr, anyAddr)],
      packets: [tcp(hostIn(k), srv, port), tcp(hostIn(other), srv, port), tcp(hostIn(other), srv, 22), tcp(hostIn(k), web, 443), icmp(hostIn(other), servers + 20, false), udp((lan(0) + 4 * 256 + 9) >>> 0, srv, 53)] }),
    // what may come back in from the Internet
    () => ({ name: "INTERNET-IN", lines: [L("permit", "tcp", anyAddr, anyAddr, { est: true }), L("permit", "icmp", anyAddr, anyAddr, { icmp: "echo-reply" }), L("permit", "tcp", anyAddr, netSpec(pub, 0), eq(443)),
      ...(x.bool() ? [L("deny", "ip", anyAddr, anyAddr)] : [])],
      packets: [tcp(web, hostIn(k), 51000 + x.int(0, 900), true), tcp(web, hostIn(k), 22), tcp(web, pub, 443), tcp(web, pub, 80), icmp(web, hostIn(k), true), icmp(web, hostIn(k), false), udp(web, hostIn(k), 53)] }),
    // a wildcard typed as 0.0.0.0, and ports
    () => ({ name: "LAN-OUT", lines: [L("deny", "ip", netSpec(lan(k), 0), anyAddr), L("permit", "tcp", netSpec(lan(k), W24), anyAddr, eq(80)), L("permit", "tcp", netSpec(lan(k), W24), anyAddr, eq(443)),
      L("deny", "tcp", anyAddr, anyAddr, { dport: { op: "lt", n: 1024 } }), L("permit", "udp", anyAddr, anyAddr, eq(53))],
      packets: [tcp(hostIn(k), web, 80), tcp(hostIn(k), web, 443), tcp(hostIn(k), web, 22), tcp(hostIn(k), web, 8080), udp(hostIn(k), web, 53), icmp(hostIn(k), web, false), tcp(hostIn(other), web, 80)] }),
    // wildcards that cover two and four networks
    () => ({ name: "SITE-IN", lines: [L("permit", "ip", netSpec(lan(0), W23), netSpec(servers, W24)), L("deny", "ip", netSpec(lan(0), W22), anyAddr), L("permit", "ip", anyAddr, anyAddr)],
      packets: [tcp(hostIn(1), srv, port), tcp(hostIn(2), srv, port), tcp(hostIn(1), web, 443), tcp((lan(0) + 4 * 256 + 20) >>> 0, srv, port), icmp(hostIn(0), servers + 20, false), icmp(hostIn(3), web, false)] }),
  ];
  const { name, lines, packets } = x.pick(shapes)();
  const pkt = x.pick(packets);
  const hit = lines.findIndex(l => mismatch(l, pkt) === null);
  const seq = i => 10 * (i + 1);
  const options = [...lines.map((l, i) => `Line ${seq(i)} (${l.action})`), "No line matches: the implicit deny at the end drops it"];
  const why = lines.slice(0, hit < 0 ? lines.length : hit).map((l, i) => `Line ${seq(i)} does not match: ${mismatch(l, pkt)}.`);
  return {
    kind: "choice", ordered: true,
    prompt: `${pktText(pkt)} Which line of this access list decides what happens to it?`,
    exhibit: [`Extended IP access list ${name}`, ...lines.map((l, i) => `    ${seq(i)} ${aclLineText(l)}`)].join("\n"),
    options, answer: hit < 0 ? lines.length : hit,
    explain: [...why, hit < 0 ? "Nothing matched, so the packet is denied by the rule you cannot see." : `Line ${seq(hit)} is the first line that matches, so the packet is ${lines[hit].action === "permit" ? "permitted" : "denied"} and the lines below it are never read.`].join(" "),
    meta: { type: "acl", lines, pkt, hit },
  };
}

// ================================================================ the four drills
export const DRILLS = {
  routing: { noun: "Lookup", make: x => (x.bool(0.3) ? routeSource(x) : routeTable(x)) },
  vlsm: { noun: "Plan", make: x => (x.bool(0.55) ? vlsmPlan(x) : summary(x)) },
  ipv6: { noun: "Address", make: x => x.pick([v6compress, v6compress, v6expand, v6eui, v6eui, v6count])(x) },
  acl: { noun: "Packet", make: aclTrace },
};
export const makeDrillQuestion = (kind, x) => DRILLS[kind].make(x);
