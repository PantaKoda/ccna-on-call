// Drill tests: build many questions of each drill from different seeds and
// check every answer a second way, independent of the generator.
// Run with: node tests/run-drills.mjs
import { DRILLS, rng, makeDrillQuestion, checkField, v6parse, v6short, v6full, aclLineText } from "../js/game/drillgen.js";
import { intToIp, lenMask } from "../js/engine/ip.js";
import { aclPermit } from "../js/engine/network.js";
import { Lab } from "../js/game/lab.js";

const SEEDS = 600;
const problems = [];
const bad = (kind, seed, text) => { if (problems.length < 25) problems.push(`${kind} seed ${seed}: ${text}`); };
const mask = len => lenMask(len);
const inNet = (ip, net, len) => ((ip ^ net) & mask(len)) === 0;

const verify = {
  // longest prefix match, written out the slow way
  lookup(q, m) {
    let best = null;
    for (const r of m.routes) if (inNet(m.dst, r.net, r.len) && (!best || r.len > best.len)) best = r;
    const want = !best ? "Drop it" : best.code === "C" ? best.iface : intToIp(best.nh);
    if (!q.options[q.answer].includes(want)) return `expected ${want}, the answer is "${q.options[q.answer]}"`;
    const same = m.routes.filter(r => m.routes.some(o => o !== r && o.net === r.net && o.len === r.len));
    if (same.length) return "two routes to the same prefix in one table";
  },
  source(q, m) {
    const lowestAd = Math.min(...m.cands.map(c => c.ad));
    const pool = m.cands.filter(c => c.ad === lowestAd), lowest = Math.min(...pool.map(c => c.metric));
    const winners = pool.filter(c => c.metric === lowest);
    if (winners.length !== 1) return "no single winner";
    if (!q.options[q.answer].includes(intToIp(winners[0].nh))) return "wrong winner";
  },
  plan(q, m) {
    const size = len => 2 ** (32 - len), end = m.base + size(m.baseLen);
    let at = m.base, prev = 0;
    for (const n of m.needs.slice().sort((a, b) => a.net - b.net)) {
      if (n.net !== at) return "subnets are not handed out back to back from the start of the block";
      if (n.net % size(n.len) !== 0) return "a subnet does not start on a multiple of its size";
      if (size(n.len) - 2 < n.hosts) return "a subnet is too small for its hosts";
      if (n.len < 30 && size(n.len + 1) - 2 >= n.hosts) return "a smaller subnet would have fitted";
      if (n.len < prev) return "not largest first";
      prev = n.len;
      at += size(n.len);
    }
    if (at > end) return "the plan runs past the end of the block";
    if (new Set(q.fields.map(f => f.label)).size !== q.fields.length) return "two fields have the same label";
  },
  summary(q, m) {
    // the longest prefix that contains every listed /24
    let len = 24;
    for (; len > 0; len--) if (m.nets.every(n => inNet(n, m.nets[0], len))) break;
    const net = (m.nets[0] & mask(len)) >>> 0;
    if (len !== m.len || net !== m.net) return `expected ${intToIp(net)}/${len}`;
    if (m.covers !== 2 ** (24 - len)) return "wrong count of covered networks";
    if (m.covers < m.nets.length) return "the summary covers fewer networks than were listed";
  },
  compress(q, m) {
    const s = q.fields[0].answer, back = v6parse(s);
    if (!back || back.some((n, i) => n !== m.g[i])) return `"${s}" is not the same address`;
    if (/(^|:)0[0-9a-f]/.test(s)) return `"${s}" keeps a leading zero`;
    if (s !== s.toLowerCase() || s.split("::").length > 2) return `"${s}" is not in standard form`;
    // no other spelling of the same address may be shorter
    const runs = [];
    for (let i = 0; i < 8; i++) if (m.g[i] === 0) { let j = i; while (j < 8 && m.g[j] === 0) j++; runs.push([i, j - i]); i = j; }
    const longest = Math.max(1, ...runs.map(r => r[1]));
    if (longest >= 2) {
      const first = runs.find(r => r[1] === longest)[0];
      const expect = `${m.g.slice(0, first).map(n => n.toString(16)).join(":")}::${m.g.slice(first + longest).map(n => n.toString(16)).join(":")}`;
      if (s !== expect) return `expected ${expect}, got ${s}`;
    } else if (s.includes("::")) return `"${s}" uses :: for a single zero group`;
  },
  expand(q, m) {
    const s = q.fields[0].answer;
    if (!/^([0-9a-f]{4}:){7}[0-9a-f]{4}$/.test(s)) return `"${s}" is not eight groups of four digits`;
    if (v6parse(s).some((n, i) => n !== m.g[i]) || v6parse(q.exhibit).some((n, i) => n !== m.g[i])) return "the two forms are different addresses";
  },
  eui(q, m) {
    // the same calculation on one 64-bit number
    let mac = 0n;
    for (const b of m.mac) mac = (mac << 8n) | BigInt(b);
    const id = (((mac >> 24n) ^ 0x020000n) << 40n) | (0xfffen << 24n) | (mac & 0xffffffn);
    const got = v6parse(q.fields[0].answer).slice(4).reduce((acc, n) => (acc << 16n) | BigInt(n), 0n);
    if (got !== id) return "wrong interface identifier";
    if (v6parse(q.fields[0].answer).slice(0, 4).some((n, i) => n !== m.prefix[i])) return "wrong prefix";
  },
  count(q, m) { if (Number(q.fields[0].answer) !== 2 ** (m.to - m.from)) return "wrong number of subnets"; },
  // the simulator's own access list code must reach the same verdict
  acl(q, m) {
    const lab = new Lab({ id: "t", topology: { devices: [{ name: "R1", kind: "router", config: ["ip access-list extended T", ...m.lines.map(aclLineText)] }], links: [] }, objectives: [] });
    const d = lab.net.devs.R1;
    if (d.acls.T.entries.length !== m.lines.length) return "the simulator did not accept every line";
    const permitted = aclPermit(d, "T", m.pkt, true);
    const hit = d.acls.T.entries.findIndex(e => e.hits);
    if (hit !== m.hit) return `the simulator matched line index ${hit}, the drill says ${m.hit}`;
    if (permitted !== (m.hit >= 0 && m.lines[m.hit].action === "permit")) return "the simulator disagrees on permit or deny";
    if (q.answer !== (m.hit < 0 ? m.lines.length : m.hit)) return "the answer does not point at the matching line";
  },
};

for (const kind of Object.keys(DRILLS)) {
  const seen = new Set(), types = {};
  for (let seed = 1; seed <= SEEDS; seed++) {
    let q;
    try { q = makeDrillQuestion(kind, rng(seed)); } catch (e) { bad(kind, seed, "threw " + e.message); continue; }
    types[q.meta.type] = (types[q.meta.type] || 0) + 1;
    seen.add(q.prompt + "|" + (q.exhibit || "") + "|" + (q.fields ? q.fields.map(f => f.label).join() : ""));
    if (!q.prompt || !q.explain) bad(kind, seed, "no prompt or explanation");
    if (q.kind === "choice") {
      if (!(q.answer >= 0 && q.answer < q.options.length)) bad(kind, seed, "answer index out of range");
      if (new Set(q.options).size !== q.options.length) bad(kind, seed, "duplicate options");
      if (q.options.length < 3 || q.options.length > 6) bad(kind, seed, `${q.options.length} options`);
    } else {
      for (const f of q.fields) {
        if (!checkField(f, f.answer)) bad(kind, seed, `its own answer "${f.answer}" is marked wrong`);
        if (checkField(f, "") || checkField(f, "0") || checkField(f, "::")) bad(kind, seed, "an empty or junk answer is marked right");
      }
    }
    const err = verify[q.meta.type](q, q.meta);
    if (err) bad(kind, seed, err);
  }
  if (seen.size < SEEDS * 0.5) problems.push(`${kind}: only ${seen.size} different questions in ${SEEDS} seeds`);
  if (!problems.length) console.log(`ok   drill ${kind.padEnd(8)} (${SEEDS} seeds, ${seen.size} different; ${Object.entries(types).map(([t, n]) => `${t} ${n}`).join(", ")})`);
}

// how typed answers are judged
const t = (name, cond) => { if (!cond) problems.push("checkField: " + name); };
t("a prefix with spaces is accepted", checkField({ check: "prefix", answer: "10.1.2.64/27" }, " 10.1.2.64 /27 "));
t("the wrong prefix length is refused", !checkField({ check: "prefix", answer: "10.1.2.64/27" }, "10.1.2.64/26"));
t("an address without a prefix is refused", !checkField({ check: "prefix", answer: "10.1.2.64/27" }, "10.1.2.64"));
t("thousands separators are accepted", checkField({ check: "number", answer: "65536" }, "65,536"));
t("EUI-64 is accepted in any valid spelling", checkField({ check: "ipv6", answer: "2001:db8:1:2:21b:2cff:fe3d:4e5f" }, "2001:0DB8:0001:0002:021B:2CFF:FE3D:4E5F"));
t("a different address is refused", !checkField({ check: "ipv6", answer: "2001:db8:1:2:21b:2cff:fe3d:4e5f" }, "2001:db8:1:2:1b:2cff:fe3d:4e5f"));
t("the shortest form must really be the shortest", !checkField({ check: "ipv6-text", answer: "2001:db8::1" }, "2001:db8:0:0:0:0:0:1") && checkField({ check: "ipv6-text", answer: "2001:db8::1" }, "2001:DB8::1"));
t("v6short picks the leftmost of two equal runs", v6short([0x2001, 0xdb8, 0, 0, 1, 0, 0, 1]) === "2001:db8::1:0:0:1");
t("v6short leaves a single zero group alone", v6short([0x2001, 0xdb8, 0, 1, 1, 1, 1, 1]) === "2001:db8:0:1:1:1:1:1");
t("v6parse refuses two double colons", v6parse("2001::db8::1") === null && v6parse("1:2:3:4:5:6:7") === null);
t("v6full pads every group", v6full(v6parse("::1")) === "0000:0000:0000:0000:0000:0000:0000:0001");

if (problems.length) {
  console.log("FAIL drills");
  for (const p of problems) console.log("   - " + p);
  process.exit(1);
}
console.log("\nall drill checks pass");
