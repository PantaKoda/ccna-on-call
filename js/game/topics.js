// Topics tie everything together: a theory page, the labs that teach the
// topic and the exam questions about it. Each topic says where it sits in each
// version of the exam blueprint, so the game can be studied as v1.1 or v2.0.

// The two blueprints. Domain 0 is the game's own "putting it together" group.
export const EXAMS = {
  v1: {
    id: "v1", name: "CCNA 200-301 v1.1", short: "v1.1",
    blurb: "The blueprint in use since 2024. Six domains, with a full section on automation and programmability.",
    domains: [
      { n: 1, name: "Network Fundamentals", weight: 20 }, { n: 2, name: "Network Access", weight: 20 }, { n: 3, name: "IP Connectivity", weight: 25 },
      { n: 4, name: "IP Services", weight: 10 }, { n: 5, name: "Security Fundamentals", weight: 15 }, { n: 6, name: "Automation and Programmability", weight: 10 },
      { n: 0, name: "Putting it together", weight: 0 },
    ],
  },
  v2: {
    id: "v2", name: "CCNA 200-301 v2.0", short: "v2.0",
    blurb: "The 2026 blueprint. Five domains, more troubleshooting and switching detail, Ansible instead of REST and SDN theory, and AI in network operations.",
    domains: [
      { n: 1, name: "Network Infrastructure and Connectivity", weight: 25 }, { n: 2, name: "Switching and Network Access", weight: 25 }, { n: 3, name: "IP Routing", weight: 20 },
      { n: 4, name: "Network Services and Security", weight: 20 }, { n: 5, name: "AI, and Network Operations and Management", weight: 10 },
      { n: 0, name: "Putting it together", weight: 0 },
    ],
  },
};

// v1 / v2: the domain the topic is shown under in that exam, or null when the
// exam does not include it (so v2: null means "v1 exclusive").
// `match` sorts exam questions into the topic by their wording (first match
// wins, in this order). `domain` marks the catch-all topic for questions of a
// v1.1 domain that match nothing. Topics without a pattern (netops, capstone,
// fundamentals) only receive questions that name them or fall through to them.
export const TOPICS = [
  { id: "ospf", v1: 3, v2: 3, name: "OSPF", blurb: "Link-state routing: neighbours, areas, cost and the router ID.",
    match: /\bospf|link[- ]state|router[- ]id\b|designated router|\bbdr\b|hello (timer|interval)|\blsa\b/i },
  { id: "nat", v1: 4, v2: 4, name: "NAT and PAT", blurb: "Translating private addresses so they can reach the Internet.",
    match: /\bnat\b|\bpat\b|inside (local|global)|outside (local|global)|address translation/i },
  { id: "vpn", v1: 5, v2: 4, name: "IPsec and VPNs", blurb: "Site-to-site and remote-access VPNs, and what IPsec provides.",
    match: /\bipsec\b|\bvpns?\b|\bike\b|\bgre\b|\besp\b|tunnel mode|transport mode/i },
  { id: "wireless", v1: 2, v2: 1, name: "Wireless", blurb: "Bands and channels, RF behaviour, interference and Wi-Fi security.",
    match: /wireless|wi-?fi|\bssids?\b|\bwlcs?\b|access points?|\bwpa\d?\b|802\.11|\bcapwap\b|lightweight ap|\brf\b/i },
  { id: "automation", v1: 6, v2: null, name: "Automation and programmability", domain: 6, blurb: "Controllers, SDN, REST APIs, JSON and configuration tools.",
    match: /\bsdn\b|software[- ]defined|\brest(ful)? apis?\b|\brestful\b|\brestconf\b|\bnetconf\b|\byang\b|\bjson\b|\bxml\b|\bapis?\b|\bpuppet\b|\bchef\b|\bterraform\b|\bansible\b|\bplaybooks?\b|dna center|catalyst center|controller-based|northbound|southbound|\bcrud\b|(control|data|management) plane|configuration management|\bopenflow\b/i },
  { id: "security", v1: 5, v2: 4, name: "Security concepts and layer 2 defences", domain: 5, blurb: "AAA, passwords, and defences such as DHCP snooping and storm control.",
    match: /dhcp snooping|arp inspection|\bdai\b|\baaa\b|tacacs|radius|phishing|social engineering|multi-?factor|802\.1x|storm[- ]control|ra guard/i },
  { id: "dhcp", v1: 4, v2: 1, name: "DHCP", blurb: "Handing out addresses automatically, and relaying requests across subnets.",
    match: /\bdhcp|helper-address|\bapipa\b|169\.254/i },
  { id: "ipv6", v1: 1, v2: 1, name: "IPv6", blurb: "Address format and types, EUI-64, prefix sizes and static routes.",
    match: /\bipv6\b|eui-?64|link-local|unique local|\bslaac\b|global unicast|\bndp\b|::\/|[0-9a-f]{1,4}::/i },
  { id: "switching", v1: 2, v2: 2, name: "Spanning tree, EtherChannel and edge ports", domain: 2, blurb: "Rapid PVST+, port channels, CDP and LLDP, and ports for phones and access points.",
    match: /spanning[- ]tree|\bstp\b|\brstp\b|\bpvst|802\.1[dw]\b|portfast|\bbpdu|root (bridge|port|guard)|designated port|etherchannel|port[- ]channel|\blacp\b|\bpagp\b|channel-group|\bcdp\b|\blldp\b|\bpoe\b|power over ethernet|voice vlan/i },
  { id: "l2security", v1: 5, v2: 4, name: "Port security", blurb: "Limiting which devices may use a switch port.",
    match: /port[- ]security|sticky|err-?disabled|violation mode/i },
  { id: "acl", v1: 5, v2: 4, name: "Access lists", blurb: "Permit and deny rules, wildcard masks and where to apply them.",
    match: /access[- ]list|\bacls?\b|access-group|access-class|implicit deny/i },
  { id: "access", v1: 5, v2: 4, name: "Secure remote access", blurb: "SSH, VTY lines and local accounts.",
    match: /\bssh\b|\btelnet\b|\bvty\b|crypto key|login local|transport input/i },
  { id: "monitoring", v1: 4, v2: 5, name: "Syslog and SNMP", blurb: "Reading log messages, severity levels and facilities, and what SNMP does.",
    match: /\bsyslog\b|\bsnmp|severity level|logging (trap|host|buffered|console)|show logging|\bmib\b/i },
  { id: "services", v1: 4, v2: 4, name: "Network services", domain: 4, blurb: "DNS records, file transfer, and in v1.1 also NTP and quality of service.",
    match: /\bdns\b|name resolution|\bntp\b|stratum|\bqos\b|quality of service|\bdscp\b|\bpolicing\b|\bshaping\b|queu(e)?ing|\btftp\b|\bftp\b|\bscp\b|\bsftp\b/i },
  { id: "intervlan", v1: 2, v2: 2, name: "Inter-VLAN routing", blurb: "Router on a stick: one trunk, one subinterface per VLAN.",
    match: /router[- ]on[- ]a[- ]stick|subinterface|inter-?vlan|encapsulation dot1q|\bsvi\b/i },
  { id: "vlans", v1: 2, v2: 2, name: "VLANs and trunks", blurb: "Separate broadcast domains on one switch, and carrying them between switches.",
    match: /\bvlans?\b|\btrunk|802\.1q|\bdtp\b|native vlan|\bvtp\b/i },
  { id: "static", v1: 3, v2: 3, name: "Static and default routes", blurb: "Telling a router by hand where networks are.",
    match: /static route|default route|\bip route\b|floating|gateway of last resort|stub network|host route/i },
  { id: "routing", v1: 3, v2: 3, name: "How routers choose a path", domain: 3, blurb: "Longest match, administrative distance, metrics and gateway redundancy.",
    match: /administrative distance|longest (prefix|match)|routing table|\bhsrp\b|\bvrrp\b|next[- ]hop|\bmetric\b|first[- ]hop/i },
  { id: "virtualization", v1: 1, v2: 1, name: "Virtualization", blurb: "Hypervisors, virtual machines and containers, and how they attach to the network.",
    match: /hypervisor|virtual machines?|\bvms?\b|containers?\b|virtuali[sz]ation|\bvrf\b/i },
  { id: "clients", v1: 1, v2: 1, name: "Client troubleshooting", blurb: "Checking a Windows, macOS or Linux host: address, gateway, DNS and Wi-Fi.",
    match: /\bipconfig\b|\bifconfig\b|\bnslookup\b|\bnetsh\b|macos|\blinux\b|\bip addr\b|\bnmcli\b/i },
  { id: "subnetting", v1: 1, v2: 1, name: "Subnetting", blurb: "Networks, broadcasts and host ranges from an address and a mask.",
    match: /\bsubnet|\bcidr\b|\.\d{1,3}\/\d{1,2}\b|broadcast address|network address|usable host|block size|\bvlsm\b/i },
  { id: "cli", v1: 1, v2: 1, name: "Console and device basics", blurb: "IOS modes, saving your work and basic device setup.",
    match: /running[- ]config|startup[- ]config|\bnvram\b|privileged|user exec|global configuration|enable secret|enable password|password-encryption|\bhostname\b|banner|console (line|port|password)/i },
  { id: "addressing", v1: 1, v2: 1, name: "Interfaces and addressing", blurb: "Addresses on router interfaces, hosts and switch management.",
    match: /\bip address\b|default[- ]gateway|administratively down|show ip interface brief|no shutdown/i },
  { id: "netops", v1: null, v2: 5, name: "Network operations and Ansible", blurb: "Ways to manage a network, and running changes with Ansible." },
  { id: "fundamentals", v1: 1, v2: 1, name: "Network fundamentals", domain: 1, blurb: "The OSI and TCP/IP models, Ethernet, cabling and interface errors." },
  { id: "capstone", v1: 0, v2: 0, name: "Troubleshooting and full builds", blurb: "A method for outages, the tools to use, and building a site from a design." },
];

// The order topics are shown in inside a domain (a sensible study order).
export const TOPIC_ORDER = [
  "fundamentals", "cli", "subnetting", "addressing", "ipv6", "virtualization", "clients",
  "wireless", "switching", "vlans", "intervlan",
  "routing", "static", "ospf",
  "dhcp", "nat", "services", "monitoring",
  "security", "l2security", "acl", "access", "vpn",
  "automation", "netops", "capstone",
];
export const TOPIC_BY_ID = new Map(TOPICS.map(t => [t.id, t]));

// Topics of one exam version, grouped by its domains, in study order.
export function topicsByDomain(version) {
  return EXAMS[version].domains
    .map(d => ({ ...d, topics: TOPIC_ORDER.map(id => TOPIC_BY_ID.get(id)).filter(t => t[version] === d.n) }))
    .filter(d => d.topics.length);
}
// "v1" or "v2" when the topic exists in only that exam, otherwise null.
export const topicOnly = t => (t.v2 === null ? "v1" : t.v1 === null ? "v2" : null);

// Which topic each story lab teaches.
export const LEVEL_TOPIC = {
  "first-console": "cli", "lock-it-down": "cli",
  "subnet-sprint-1": "subnetting", "subnet-sprint-2": "subnetting", "vlsm-plan": "subnetting",
  "ipv6-sprint": "ipv6", "route-lookup": "routing", "acl-trace": "acl",
  "desk-move": "addressing", "switch-mgmt": "addressing",
  "vlans-101": "vlans", "trunk-line": "vlans",
  "router-on-a-stick": "intervlan", "l3-switch": "intervlan",
  "port-security": "l2security",
  "root-bridge": "switching", "rogue-switch": "switching", "port-channel": "switching",
  "static-routes": "static", "default-route": "static", "floating-backup": "static",
  "ospf-single-area": "ospf", "ospf-broken": "ospf", "ospf-tuning": "ospf",
  "dhcp-pools": "dhcp", "dhcp-relay": "dhcp", "nat-edge": "nat", "acl-guard": "acl", "acl-broken": "acl", "ssh-hardening": "access",
  "ansible-rollout": "netops",
  "p1-outage": "capstone", "greenfield-branch": "capstone",
};

const strip = html => String(html).replace(/<[^>]+>/g, " ");

// Works for the built-in questions and for an imported bank alike.
//
// A question filed under one of the six v1.1 domains is tried against the
// topics of that domain first: its own wording, then its answer options. Only
// then may its wording place it in another domain (a wireless question in the
// fundamentals chapter belongs with the wireless theory). The options are never
// used across domains, because one wrong answer that mentions SNMP or an ACL
// would drag an unrelated question there.
//
// A question with no domain (a mixed practice exam in an imported bank) has
// only its wording and options to go by.
export function topicOfQuestion(q) {
  if (q.t && TOPIC_BY_ID.has(q.t)) return q.t;     // set explicitly by the author
  const text = strip(q.q), options = q.o.map(strip).join(" ");
  const first = (list, s) => list.find(t => t.match && t.match.test(s));
  const general = TOPICS.find(t => t.domain === q.ch);
  if (general) {
    const own = TOPICS.filter(t => t.v1 === q.ch);
    return (first(own, text) || first(own, options) || first(TOPICS, text) || general).id;
  }
  return (first(TOPICS, text) || first(TOPICS, options) || TOPIC_BY_ID.get("fundamentals")).id;
}

// The v1.1 domain a question counts toward: the one it was filed under, or its
// topic's domain when it came from a mixed practice exam.
export function v1DomainOf(q, topicId) {
  return q.ch >= 1 && q.ch <= 6 ? q.ch : TOPIC_BY_ID.get(topicId).v1;
}

// Ansible is examined by both blueprints, but it lives in a different topic in
// each: "Automation and programmability" in v1.1 and "Network operations" in
// v2.0. A question about it follows the exam being studied instead of vanishing
// from the other one. It counts as "about Ansible" when its wording or its
// correct answer says so; a wrong answer that merely names Ansible does not.
const SHARED = { topics: ["automation", "netops"], match: /\bansible\b|\bplaybooks?\b|infrastructure as code|\biac\b/i };
export function inBothExams(q, topicId) {
  if (q.only || !SHARED.topics.includes(topicId)) return false;
  const right = (Array.isArray(q.a) ? q.a : [q.a]).map(k => strip(q.o[k] ?? "")).join(" ");
  return SHARED.match.test(strip(q.q) + " " + right);
}
// The topic a question is shown under in one exam version.
export function topicInExam(q, topicId, version) {
  if (TOPIC_BY_ID.get(topicId)[version] !== null || !inBothExams(q, topicId)) return topicId;
  return SHARED.topics.find(id => id !== topicId);
}

// Is this question part of the given exam version? A question can be limited
// by its own `only` tag or by belonging to a topic the exam does not include.
export function questionOnly(q, topicId) {
  return q.only || topicOnly(TOPIC_BY_ID.get(topicId));
}
export const inExam = (q, topicId, version) => { const only = questionOnly(q, topicId); return !only || only === version; };

// "<!-- topic: id -->" markers split the theory file into pages.
export function splitTheory(md) {
  const pages = {};
  const parts = md.split(/^<!-- topic: ([\w-]+) -->\s*$/m);
  for (let i = 1; i < parts.length; i += 2) pages[parts[i]] = parts[i + 1].trim();
  return pages;
}

// Theory sections can be limited to one exam with a tag on the heading:
//   "## Quality of service {v1}"   or   "## Storm control {v2}"
// Sections tagged for the other exam are dropped; the tag stays on the ones
// that remain so the page can show a "v1 exclusive" or "New in v2" badge.
export function theoryFor(md, version) {
  const out = [];
  let skip = false;
  for (const line of md.split("\n")) {
    const h = /^## .*\{(v1|v2)\}\s*$/.exec(line);
    if (line.startsWith("## ")) skip = !!h && h[1] !== version;
    if (!skip) out.push(line);
  }
  return out.join("\n");
}
