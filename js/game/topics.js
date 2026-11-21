// Topics tie everything together: a theory page, the story tickets that teach
// the topic, the practice labs that repeat it, and the exam questions about it.

export const TRACKS = [
  { id: "foundations", name: "Foundations" },
  { id: "switching", name: "Switching" },
  { id: "routing", name: "Routing" },
  { id: "services", name: "IP services" },
  { id: "security", name: "Security" },
  { id: "automation", name: "Automation" },
  { id: "capstone", name: "Putting it together" },
];

// `match` classifies exam questions into the topic (first match wins, in this
// order). Topics with `domain` and no match are the catch-all for that exam
// domain.
export const TOPICS = [
  { id: "ospf", track: "routing", name: "OSPF", blurb: "Link-state routing: neighbours, areas, cost and the router ID.",
    match: /\bospf\b|link[- ]state|router[- ]id\b|designated router|\bbdr\b|hello (timer|interval)|\blsa\b/i },
  { id: "nat", track: "services", name: "NAT and PAT", blurb: "Translating private addresses so they can reach the Internet.",
    match: /\bnat\b|\bpat\b|inside (local|global)|outside (local|global)|address translation/i },
  { id: "security", track: "security", name: "Security concepts", domain: 5, blurb: "Threats, AAA, passwords and layer 2 attack defences.",
    match: /dhcp snooping|arp inspection|\bdai\b|\baaa\b|tacacs|radius|phishing|social engineering|multi-?factor|802\.1x/i },
  { id: "dhcp", track: "services", name: "DHCP", blurb: "Handing out addresses automatically, and relaying requests across subnets.",
    match: /\bdhcp\b|helper-address|\bapipa\b|169\.254/i },
  { id: "l2security", track: "switching", name: "Port security", blurb: "Limiting which devices may use a switch port.",
    match: /port[- ]security|sticky|err-?disabled|violation mode/i },
  { id: "acl", track: "security", name: "Access lists", blurb: "Permit and deny rules, wildcard masks and where to apply them.",
    match: /access[- ]list|\bacls?\b|access-group|access-class|implicit deny/i },
  { id: "access", track: "security", name: "Secure remote access", blurb: "SSH, VTY lines and local accounts.",
    match: /\bssh\b|\btelnet\b|\bvty\b|crypto key|login local|transport input/i },
  { id: "intervlan", track: "switching", name: "Inter-VLAN routing", blurb: "Router on a stick: one trunk, one subinterface per VLAN.",
    match: /router[- ]on[- ]a[- ]stick|subinterface|inter-?vlan|encapsulation dot1q|\bsvi\b/i },
  { id: "vlans", track: "switching", name: "VLANs and trunks", blurb: "Separate broadcast domains on one switch, and carrying them between switches.",
    match: /\bvlans?\b|\btrunk|802\.1q|\bdtp\b|native vlan|\bvtp\b/i },
  { id: "static", track: "routing", name: "Static and default routes", blurb: "Telling a router by hand where networks are.",
    match: /static route|default route|\bip route\b|floating|gateway of last resort|stub network/i },
  { id: "routing", track: "routing", name: "How routers choose a path", domain: 3, blurb: "Longest match, administrative distance, metrics and gateway redundancy.",
    match: /administrative distance|longest (prefix|match)|routing table|\bhsrp\b|\bvrrp\b|next[- ]hop|\bmetric\b/i },
  { id: "subnetting", track: "foundations", name: "Subnetting", blurb: "Networks, broadcasts and host ranges from an address and a mask.",
    match: /\bsubnet|\bcidr\b|\.\d{1,3}\/\d{1,2}\b|broadcast address|network address|usable host|block size|\bvlsm\b/i },
  { id: "cli", track: "foundations", name: "Console and device basics", blurb: "IOS modes, saving your work and basic device setup.",
    match: /running[- ]config|startup[- ]config|\bnvram\b|privileged|user exec|global configuration|enable secret|enable password|password-encryption|\bhostname\b|banner|console (line|port|password)/i },
  { id: "addressing", track: "foundations", name: "Interfaces and addressing", blurb: "Addresses on router interfaces, hosts and switch management.",
    match: /\bip address\b|default[- ]gateway|administratively down|show ip interface brief|no shutdown/i },
  { id: "automation", track: "automation", name: "Automation and programmability", domain: 6, blurb: "Controllers, REST APIs, JSON and configuration tools." },
  { id: "services", track: "services", name: "Network services", domain: 4, blurb: "NTP, syslog, SNMP, DNS and quality of service." },
  { id: "switching", track: "switching", name: "Switching concepts", domain: 2, blurb: "Spanning tree, EtherChannel, discovery protocols and wireless." },
  { id: "fundamentals", track: "foundations", name: "Network fundamentals", domain: 1, blurb: "The OSI and TCP/IP models, Ethernet, cabling and IPv6." },
  { id: "capstone", track: "capstone", name: "Troubleshooting and full builds", blurb: "A method for outages, and building a site from a design." },
];

// The order topics are shown in (a sensible study order inside each track).
export const TOPIC_ORDER = [
  "fundamentals", "cli", "subnetting", "addressing",
  "switching", "vlans", "intervlan", "l2security",
  "routing", "static", "ospf",
  "services", "dhcp", "nat",
  "security", "acl", "access",
  "automation", "capstone",
];
export const TOPIC_BY_ID = new Map(TOPICS.map(t => [t.id, t]));

// Which topic each story ticket teaches.
export const LEVEL_TOPIC = {
  "first-console": "cli", "lock-it-down": "cli",
  "subnet-sprint-1": "subnetting", "subnet-sprint-2": "subnetting",
  "desk-move": "addressing", "switch-mgmt": "addressing",
  "vlans-101": "vlans", "trunk-line": "vlans",
  "router-on-a-stick": "intervlan",
  "port-security": "l2security",
  "static-routes": "static", "default-route": "static",
  "ospf-single-area": "ospf", "ospf-broken": "ospf",
  "dhcp-pools": "dhcp", "nat-edge": "nat", "acl-guard": "acl", "ssh-hardening": "access",
  "p1-outage": "capstone", "greenfield-branch": "capstone",
};

const strip = html => String(html).replace(/<[^>]+>/g, " ");

// Works for the built-in questions and for an imported bank alike: the wording
// of the question decides, and the exam domain is the fallback.
export function topicOfQuestion(q) {
  if (q.t && TOPIC_BY_ID.has(q.t)) return q.t;     // set explicitly by the author
  // the question text decides; the options are only consulted if it says nothing
  for (const text of [strip(q.q), q.o.map(strip).join(" ")]) {
    for (const t of TOPICS) if (t.match && t.match.test(text)) return t.id;
  }
  const general = TOPICS.find(t => t.domain === q.ch);
  return general ? general.id : "fundamentals";
}

// "<!-- topic: id -->" markers split the theory file into pages.
export function splitTheory(md) {
  const pages = {};
  const parts = md.split(/^<!-- topic: ([\w-]+) -->\s*$/m);
  for (let i = 1; i < parts.length; i += 2) pages[parts[i]] = parts[i + 1].trim();
  return pages;
}
