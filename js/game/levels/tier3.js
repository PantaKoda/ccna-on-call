import { C } from "../checks.js";
import { floatingLab } from "../practice.js";

const M24 = "255.255.255.0";
const pc = (name, x, y, ip, gw) => ({ name, kind: "pc", x, y, ip: { mode: "static", ip, mask: M24, gw } });
const ifc = (n, ip, mask) => [`interface ${n}`, `ip address ${ip} ${mask}`, "no shutdown"];
const M30 = "255.255.255.252";

// Three routers in a line: R1 - R2 - R3, each with a LAN.
const lineRouters = extra => [
  { name: "R1", kind: "router", hostname: "R1", x: 200, y: 170, config: [...ifc("g0/0", "10.1.0.1", M24), ...ifc("g0/1", "10.0.12.1", M30), ...(extra.R1 || [])] },
  { name: "R2", kind: "router", hostname: "R2", x: 500, y: 170, config: [...ifc("g0/0", "10.2.0.1", M24), ...ifc("g0/1", "10.0.12.2", M30), ...ifc("g0/2", "10.0.23.1", M30), ...(extra.R2 || [])] },
  { name: "R3", kind: "router", hostname: "R3", x: 800, y: 170, config: [...ifc("g0/0", "10.3.0.1", M24), ...ifc("g0/1", "10.0.23.2", M30), ...(extra.R3 || [])] },
  pc("PC1", 200, 410, "10.1.0.10", "10.1.0.1"), pc("PC2", 500, 410, "10.2.0.10", "10.2.0.1"), pc("PC3", 800, 410, "10.3.0.10", "10.3.0.1"),
];
const lineLinks = ["R1:g0/1 R2:g0/1", "R2:g0/2 R3:g0/1", "R1:g0/0 PC1", "R2:g0/0 PC2", "R3:g0/0 PC3"];
const lineDetails = [
  ["R1 LAN", "10.1.0.0/24 (PC1 .10)"], ["R2 LAN", "10.2.0.0/24 (PC2 .10)"], ["R3 LAN", "10.3.0.0/24 (PC3 .10)"],
  ["R1 - R2 link", "10.0.12.0/30 (R1 .1, R2 .2)"], ["R2 - R3 link", "10.0.23.0/30 (R2 .1, R3 .2)"],
];

export default [
  {
    id: "static-routes", tier: 3, type: "lab", xp: 220, par: 600,
    title: "Three Sites, No Map",
    from: "Dana Okafor, NOC Team Lead",
    subject: "New site links are up but nothing routes",
    brief: [
      "The three depots are cabled and every interface is addressed and up, but each router only knows its own connected networks. A PC in one depot can't reach the others.",
      "Change control hasn't approved a routing protocol yet, so do it by hand: add the **static routes** each router needs so that all three LANs reach each other. Remember that a reply needs a route back.",
    ],
    details: lineDetails,
    skills: ["ip route", "show ip route", "next-hop address", "traceroute"],
    topology: { devices: lineRouters({}), links: lineLinks },
    objectives: [
      { text: "PC1 can ping PC2", check: C.ping("PC1", "10.2.0.10") },
      { text: "PC2 can ping PC3", check: C.ping("PC2", "10.3.0.10") },
      { text: "PC1 can ping PC3 (two router hops away)", check: C.ping("PC1", "10.3.0.10") },
      { text: "Only static routing is used (no routing protocol)", check: C.all(C.noOspf(["R1", "R2", "R3"]), net => ["R1", "R2", "R3"].every(r => net.devs[r].routes.length > 0)) },
    ],
    hints: [
      "`show ip route` on each router shows what it already knows (C = connected). List the LANs that are *missing* from each table; those need static routes.",
      "The syntax is `ip route <network> <mask> <next-hop>`. The next hop is the neighbour's address on the shared link, for example from R1: `ip route 10.2.0.0 255.255.255.0 10.0.12.2`.",
      "R1 needs routes to 10.2.0.0/24 and 10.3.0.0/24 via 10.0.12.2. R3 needs 10.1.0.0/24 and 10.2.0.0/24 via 10.0.23.1. R2 sits in the middle: 10.1.0.0/24 via 10.0.12.1 and 10.3.0.0/24 via 10.0.23.2.",
    ],
    solution: [
      { on: "R1", cmds: ["enable", "configure terminal", "ip route 10.2.0.0 255.255.255.0 10.0.12.2", "ip route 10.3.0.0 255.255.255.0 10.0.12.2", "end"] },
      { on: "R2", cmds: ["enable", "configure terminal", "ip route 10.1.0.0 255.255.255.0 10.0.12.1", "ip route 10.3.0.0 255.255.255.0 10.0.23.2", "end"] },
      { on: "R3", cmds: ["enable", "configure terminal", "ip route 10.1.0.0 255.255.255.0 10.0.23.1", "ip route 10.2.0.0 255.255.255.0 10.0.23.1", "end"] },
    ],
    debrief: "A ping that leaves but never returns is usually a missing return route. `tracert` from the PC shows how far the request got; `show ip route` on the last hop shows why it stopped.",
  },

  {
    id: "subnet-sprint-2", tier: 3, type: "subnet", xp: 160, par: 600,
    title: "Subnet Sprint II",
    from: "Dana Okafor, NOC Team Lead",
    subject: "Address plan for the depot expansion",
    brief: ["The depot expansion uses larger blocks carved out of 172.16.0.0/16 and 10.0.0.0/8. Same drill as before, but the interesting octet is no longer the last one."],
    params: { count: 6, minLen: 17, maxLen: 23 },
    skills: ["subnetting in the third octet", "host counts"],
    debrief: "For a /20 the interesting octet is the third: 256 - 240 = 16, so networks start at .0, .16, .32 ... in that octet, and the last octet runs the full 0 to 255.",
  },

  {
    id: "default-route", tier: 3, type: "lab", xp: 240, par: 600,
    title: "The Way Out",
    from: "Priya Raman, Service Desk",
    subject: "Branch office has no Internet",
    brief: [
      "The new branch reaches nothing beyond its own LAN. HQ can't reach the Internet either since the ISP handover last night.",
      "The branch is a stub: one way out, through HQ. HQ in turn sends everything it doesn't know to the ISP. Use **default routes** where they fit, and give HQ a route back to the branch LAN. The ISP router is not ours; it already routes our address space back to HQ.",
      "8.8.8.8 is the agreed test address on the Internet side.",
    ],
    details: [["Branch LAN", "192.168.50.0/24"], ["BR-R1 to HQ-R1", "10.0.0.0/30 (HQ .1, BR .2)"], ["HQ LAN", "192.168.1.0/24"], ["HQ-R1 to ISP", "203.0.113.0/30 (ISP .1, HQ .2)"], ["Test address", "8.8.8.8"]],
    skills: ["default route", "ip route 0.0.0.0 0.0.0.0", "gateway of last resort"],
    topology: {
      devices: [
        { name: "BR-R1", kind: "router", hostname: "BR-R1", x: 200, y: 170, config: [...ifc("g0/0", "192.168.50.1", M24), ...ifc("g0/1", "10.0.0.2", M30)], saved: false },
        { name: "HQ-R1", kind: "router", hostname: "HQ-R1", x: 500, y: 170, config: [...ifc("g0/0", "192.168.1.1", M24), ...ifc("g0/1", "10.0.0.1", M30), ...ifc("g0/2", "203.0.113.2", M30)], saved: false },
        { name: "ISP", kind: "router", hostname: "ISP", x: 800, y: 170, locked: true, note: "Internet (8.8.8.8)", config: [...ifc("g0/0", "203.0.113.1", M30), "interface loopback0", "ip address 8.8.8.8 255.255.255.255", "ip route 192.168.0.0 255.255.0.0 203.0.113.2", "ip route 10.0.0.0 255.255.255.252 203.0.113.2"] },
        pc("PC-BR", 200, 410, "192.168.50.10", "192.168.50.1"), pc("PC-HQ", 500, 410, "192.168.1.10", "192.168.1.1"),
      ],
      links: ["BR-R1:g0/1 HQ-R1:g0/1", "HQ-R1:g0/2 ISP:g0/0", "BR-R1:g0/0 PC-BR", "HQ-R1:g0/0 PC-HQ"],
    },
    objectives: [
      { text: "BR-R1 has a default route toward HQ", check: C.hasRoute("BR-R1", "0.0.0.0/0", "S") },
      { text: "HQ-R1 has a default route toward the ISP", check: C.hasRoute("HQ-R1", "0.0.0.0/0", "S") },
      { text: "HQ-R1 has a route to the branch LAN", check: C.hasRoute("HQ-R1", "192.168.50.0/24", "S") },
      { text: "PC-HQ can ping 8.8.8.8", check: C.ping("PC-HQ", "8.8.8.8") },
      { text: "PC-BR can ping 8.8.8.8 and PC-HQ", check: C.all(C.ping("PC-BR", "8.8.8.8"), C.ping("PC-BR", "192.168.1.10")) },
      { text: "Save both routers", check: C.all(C.saved("BR-R1"), C.saved("HQ-R1")) },
    ],
    hints: [
      "A default route is a static route to `0.0.0.0 0.0.0.0`: it matches anything that has no more specific entry.",
      "BR-R1: `ip route 0.0.0.0 0.0.0.0 10.0.0.1`. HQ-R1: `ip route 0.0.0.0 0.0.0.0 203.0.113.1`.",
      "HQ-R1 also needs `ip route 192.168.50.0 255.255.255.0 10.0.0.2`, otherwise replies for the branch follow HQ's default route out to the ISP.",
    ],
    solution: [
      { on: "BR-R1", cmds: ["enable", "configure terminal", "ip route 0.0.0.0 0.0.0.0 10.0.0.1", "end", "write memory"] },
      { on: "HQ-R1", cmds: ["enable", "configure terminal", "ip route 0.0.0.0 0.0.0.0 203.0.113.1", "ip route 192.168.50.0 255.255.255.0 10.0.0.2", "end", "write memory"] },
    ],
    debrief: "`show ip route` marks the default as `S*` and prints \"Gateway of last resort\". Routers always prefer the longest matching prefix, so the /24 to the branch beats the /0 default.",
  },

  {
    id: "floating-backup", tier: 3, type: "lab", xp: 260, par: 780,
    title: "Plan B",
    from: "Dana Okafor, NOC Team Lead",
    skills: ["floating static route", "administrative distance", "host route", "testing a failover"],
    ...floatingLab({ site: "Riverside", br: 50, hq: 1, p: 1, b: 2, ad: 200, hostRoute: true }),
    debrief: "The floating route was in the configuration the whole time, but `show ip route` only listed it while the main route was missing: the routing table holds the best route to each prefix, not every route you typed. The host route did not need a distance at all, because a /32 is always the longest match.",
  },

  {
    id: "ospf-single-area", tier: 3, type: "lab", xp: 280, par: 780,
    title: "Let Them Talk",
    from: "Dana Okafor, NOC Team Lead",
    subject: "Change approved: replace static routes with OSPF",
    brief: [
      "Change control approved OSPF. The core is now a triangle, so there are two paths between any pair of sites and static routes won't fail over.",
      "Enable **OSPF process 1** on all three routers in **area 0**, with fixed router IDs, and advertise every connected network. User LANs must be advertised but must not send hellos, so make the LAN interfaces passive.",
    ],
    details: [
      ["Router IDs", "R1 1.1.1.1, R2 2.2.2.2, R3 3.3.3.3"], ["LANs (G0/0)", "10.1.0.0/24, 10.2.0.0/24, 10.3.0.0/24"],
      ["R1 - R2", "10.0.12.0/30"], ["R1 - R3", "10.0.13.0/30"], ["R2 - R3", "10.0.23.0/30"], ["Wildcards", "/24 = 0.0.0.255, /30 = 0.0.0.3"],
    ],
    skills: ["router ospf", "router-id", "network ... area", "passive-interface", "show ip ospf neighbor"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "R1", x: 500, y: 90, config: [...ifc("g0/0", "10.1.0.1", M24), ...ifc("g0/1", "10.0.12.1", M30), ...ifc("g0/2", "10.0.13.1", M30)] },
        { name: "R2", kind: "router", hostname: "R2", x: 240, y: 300, config: [...ifc("g0/0", "10.2.0.1", M24), ...ifc("g0/1", "10.0.12.2", M30), ...ifc("g0/2", "10.0.23.1", M30)] },
        { name: "R3", kind: "router", hostname: "R3", x: 760, y: 300, config: [...ifc("g0/0", "10.3.0.1", M24), ...ifc("g0/1", "10.0.13.2", M30), ...ifc("g0/2", "10.0.23.2", M30)] },
        pc("PC1", 760, 90, "10.1.0.10", "10.1.0.1"), pc("PC2", 110, 450, "10.2.0.10", "10.2.0.1"), pc("PC3", 890, 450, "10.3.0.10", "10.3.0.1"),
      ],
      links: ["R1:g0/1 R2:g0/1", "R1:g0/2 R3:g0/1", "R2:g0/2 R3:g0/2", "R1:g0/0 PC1", "R2:g0/0 PC2", "R3:g0/0 PC3"],
    },
    objectives: [
      { text: "Router IDs are 1.1.1.1, 2.2.2.2 and 3.3.3.3", check: C.all(C.routerId("R1", "1.1.1.1"), C.routerId("R2", "2.2.2.2"), C.routerId("R3", "3.3.3.3")) },
      { text: "R1 has two FULL neighbours", check: C.ospfNeighbors("R1", 2) },
      { text: "R2 and R3 each have two FULL neighbours", check: C.all(C.ospfNeighbors("R2", 2), C.ospfNeighbors("R3", 2)) },
      { text: "All three LAN interfaces (G0/0) are advertised and passive", check: C.all(C.ospfPassive("R1", "g0/0"), C.ospfPassive("R2", "g0/0"), C.ospfPassive("R3", "g0/0")) },
      { text: "PC1 can ping PC2 and PC3", check: C.all(C.ping("PC1", "10.2.0.10"), C.ping("PC1", "10.3.0.10")) },
      { text: "R1 learns 10.3.0.0/24 through OSPF", check: C.hasRoute("R1", "10.3.0.0/24", "O") },
    ],
    hints: [
      "Start with `router ospf 1`, then `router-id 1.1.1.1`. Each `network` statement selects interfaces by address and wildcard mask and places them in an area.",
      "On R1: `network 10.1.0.0 0.0.0.255 area 0`, `network 10.0.12.0 0.0.0.3 area 0`, `network 10.0.13.0 0.0.0.3 area 0`, `passive-interface g0/0`. The other two routers follow the same pattern.",
      "Watch the console: an `%OSPF-5-ADJCHG ... to FULL` message appears the moment two routers agree. `show ip ospf neighbor` lists them, and `show ip route` shows `O` routes.",
    ],
    solution: [
      { on: "R1", cmds: ["enable", "configure terminal", "router ospf 1", "router-id 1.1.1.1", "network 10.1.0.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0", "network 10.0.13.0 0.0.0.3 area 0", "passive-interface g0/0", "end"] },
      { on: "R2", cmds: ["enable", "configure terminal", "router ospf 1", "router-id 2.2.2.2", "network 10.2.0.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.3 area 0", "network 10.0.23.0 0.0.0.3 area 0", "passive-interface g0/0", "end"] },
      { on: "R3", cmds: ["enable", "configure terminal", "router ospf 1", "router-id 3.3.3.3", "network 10.3.0.0 0.0.0.255 area 0", "network 10.0.13.0 0.0.0.3 area 0", "network 10.0.23.0 0.0.0.3 area 0", "passive-interface g0/0", "end"] },
    ],
    debrief: "A passive interface is still advertised; it just stops sending hellos. That keeps user LANs in the routing table without letting a rogue device form an adjacency.",
  },

  {
    id: "ospf-broken", tier: 3, type: "lab", xp: 320, par: 900,
    title: "Silent Neighbours",
    from: "Monitoring (automated)",
    subject: "ALERT: OSPF adjacencies down after maintenance window",
    brief: [
      "A contractor \"tidied up\" OSPF on the depot routers during last night's maintenance window. This morning no adjacency is up and the depots can't reach each other.",
      "Nobody documented what was changed. Find what stops each adjacency from forming and what stops the LANs from being advertised, and fix it. Every router has **at least one** fault. All links belong in area 0.",
    ],
    details: [...lineDetails, ["Design", "OSPF process 1, everything in area 0"]],
    skills: ["show ip ospf neighbor", "show ip protocols", "show run | section ospf", "area mismatch", "hello timers", "passive interfaces"],
    topology: {
      devices: lineRouters({
        R1: ["interface g0/1", "ip ospf hello-interval 5", "router ospf 1", "router-id 1.1.1.1", "network 10.0.12.0 0.0.0.3 area 0"],
        R2: ["router ospf 1", "router-id 2.2.2.2", "network 10.0.12.0 0.0.0.3 area 0", "network 10.2.0.0 0.0.0.255 area 0", "network 10.0.23.0 0.0.0.3 area 1"],
        R3: ["router ospf 1", "router-id 3.3.3.3", "network 10.0.23.0 0.0.0.3 area 0", "network 10.3.0.0 0.0.0.255 area 0", "passive-interface g0/1"],
      }),
      links: lineLinks,
    },
    objectives: [
      { text: "R1 and R2 are FULL neighbours", check: C.ospfNeighbor("R1", "R2") },
      { text: "R2 and R3 are FULL neighbours", check: C.ospfNeighbor("R2", "R3") },
      { text: "R3 learns R1's LAN (10.1.0.0/24) through OSPF", check: C.hasRoute("R3", "10.1.0.0/24", "O") },
      { text: "PC1 can ping PC3", check: C.ping("PC1", "10.3.0.10") },
      { text: "PC3 can ping PC2", check: C.ping("PC3", "10.2.0.10") },
    ],
    hints: [
      "Neighbours only form when both ends agree on area, subnet and hello/dead timers, have different router IDs, and neither side is passive on that link. Compare both ends of each link.",
      "`show ip protocols` lists the networks and passive interfaces of a router. `show running-config | section ospf` and `show running-config | include hello` are quick ways to spot odd settings.",
      "R1: G0/1 has a non-default hello interval, and the LAN network statement is missing. R2: the link to R3 is in area 1. R3: the passive interface is G0/1 (the link to R2) instead of the LAN.",
    ],
    solution: [
      { on: "R1", cmds: ["enable", "configure terminal", "interface g0/1", "no ip ospf hello-interval", "router ospf 1", "network 10.1.0.0 0.0.0.255 area 0", "end"] },
      { on: "R2", cmds: ["enable", "configure terminal", "router ospf 1", "no network 10.0.23.0 0.0.0.3 area 1", "network 10.0.23.0 0.0.0.3 area 0", "end"] },
      { on: "R3", cmds: ["enable", "configure terminal", "router ospf 1", "no passive-interface g0/1", "passive-interface g0/0", "end"] },
    ],
    debrief: "OSPF adjacency checklist: same subnet, same area, same hello/dead timers, unique router IDs, not passive, and matching authentication. `show ip ospf neighbor` being empty means one of those is off.",
  },

  {
    id: "exam-3", tier: 3, type: "quiz", xp: 220, par: 720,
    title: "Routing Rotation Review",
    from: "Dana Okafor, NOC Team Lead",
    subject: "Promotion check: IP connectivity",
    brief: ["You've kept three depots routed through a bad week. Pass the IP connectivity check to take on services and security work as a senior engineer."],
    params: { domains: [3], v2domains: [3], count: 10, pass: 70 },
    v2: { subject: "Promotion check: IP routing", brief: ["You've kept three depots routed through a bad week. Pass the IP routing check to take on services and security work as a senior engineer."] },
    skills: ["IP connectivity"],
  },
];
