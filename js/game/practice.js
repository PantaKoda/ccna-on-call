// Lab variants: each template here is a generator that builds a fresh variant
// of a story lab from a random seed (different addresses, VLAN numbers, names,
// and for the troubleshooting ones a different fault), so a solved lab can be
// repeated on demand without memorising one answer. The level tests run every generator over many
// seeds and play its solution.

import { C } from "./checks.js";
import { intToIp, lenMask } from "../engine/ip.js";

// ---------------------------------------------------------------- randomness
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dice(seed) {
  const r = mulberry(seed);
  const x = {
    int: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: arr => arr[Math.floor(r() * arr.length)],
    bool: (p = 0.5) => r() < p,
    shuffle: arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    sample: (arr, n) => x.shuffle(arr).slice(0, n),
  };
  return x;
}

// ---------------------------------------------------------------- helpers
const ip4 = (a, b, c, d) => ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
const A = intToIp;
const M24 = "255.255.255.0", M30 = "255.255.255.252";
const SITES = ["DOCK", "YARD", "PIER", "DEPOT", "HANGAR", "MILL", "QUAY", "FORGE", "ANNEX", "LOFT"];
const VLAN_NAMES = ["SALES", "ENG", "HR", "FINANCE", "GUEST", "VOICE", "OPS", "LAB", "PRINT", "CCTV", "ADMIN", "STORES"];
const VLAN_IDS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 200];
const SENDERS = ["Dana Okafor, NOC Team Lead", "Priya Raman, Service Desk", "Marcus Lindqvist, Security", "Monitoring (automated)"];
const ifc = (n, ip, mask) => [`interface ${n}`, `ip address ${ip} ${mask}`, "no shutdown"];
const pc = (name, x, y, ip, mask, gw) => ({ name, kind: "pc", x, y, ip: { mode: "static", ip, mask, gw } });
const dhcpPc = (name, x, y) => ({ name, kind: "pc", x, y, ip: { mode: "dhcp" } });
const cfg = (...cmds) => ["enable", "configure terminal", ...cmds, "end"];
const cap = s => s[0].toUpperCase() + s.slice(1);
const ISP = (x, y, cmds) => ({ name: "ISP", kind: "router", hostname: "ISP", x, y, locked: true, note: "Internet (8.8.8.8)", config: [...cmds, "interface loopback0", "ip address 8.8.8.8 255.255.255.255"] });

// ---------------------------------------------------------------- the Ansible lab
// Shared by the story lab (fixed values) and its variants (random values).
// `faults` chooses what is wrong with the files on the control node:
//   host  - the third switch is missing from the inventory
//   line  - the playbook never puts the port in the VLAN
//   group - the play targets a group that is not in the inventory
//   port  - the playbook configures the wrong interface
export function ansibleRollout({ vid, vname, port, site, faults }) {
  const mg = "10.0.99", cams = `192.168.${vid}`, yml = `${vname.toLowerCase()}.yml`;
  const has = f => faults.includes(f);
  const wrongPort = port === 8 ? 7 : port + 1;
  const inventory = n => ["# Access switches, managed over SSH", "[access]", ...Array.from({ length: n }, (_, i) => `SW${i + 1} ansible_host=${mg}.1${i + 1}`), ""].join("\n");
  const playbook = (group, portNo, vlanLine) => [
    `- name: Roll out the ${vname} VLAN`, `  hosts: ${group}`, "  tasks:",
    `    - name: Create VLAN ${vid}`, "      ios_config:", `        parents: vlan ${vid}`, "        lines:", `          - name ${vname}`,
    "    - name: Camera port", "      ios_config:", `        parents: interface FastEthernet0/${portNo}`, "        lines:", "          - switchport mode access",
    ...(vlanLine ? [`          - switchport access vlan ${vid}`] : []), ""].join("\n");
  const sw = (n, x, y, uplinks) => ({
    name: `SW${n}`, kind: "switch", hostname: `${site}-SW${n}`, x, y, locked: true,
    lockMsg: "It is at another site with no console cable attached. Manage it from ADMIN-PC with Ansible.",
    config: ["interface vlan 1", `ip address ${mg}.1${n} ${M24}`, "no shutdown", "exit", "ip domain-name kestrel.lan", "username ansible privilege 15 secret Aut0mate-9",
      "crypto key generate rsa modulus 2048", "ip ssh version 2", "line vty 0 4", "transport input ssh", "login local", "exit", ...uplinks.flatMap(p => [`interface ${p}`, "switchport mode trunk"])],
  });
  const all = ["SW1", "SW2", "SW3"], ports = [`fa0/${port}`];
  return {
    subject: `Roll out VLAN ${vid} (${vname}) to three sites with Ansible`,
    brief: [`A camera is being installed at each of three sites, and every access switch needs **VLAN ${vid}** named **${vname}**, with port **Fa0/${port}** as an access port in it. The switches are at other sites: there is no console to plug into.`,
      "The last change like this was typed by hand on each switch and came out different on every one, so this one goes through **Ansible**. A colleague started an inventory and a playbook on ADMIN-PC and then went on leave. They are not finished, and nobody has run them.",
      "Click **ADMIN-PC**. Use `dir` and `type` to read the files, the **Files** bar above the prompt to edit them, and `ansible-playbook` to run the change. Check the result on the switches through Ansible too."],
    details: [["Control node", `ADMIN-PC (${mg}.10)`], ["Switches", `SW1 ${mg}.11, SW2 ${mg}.12, SW3 ${mg}.13 (SSH user already set up)`], ["Required on each", `VLAN ${vid} named ${vname}; Fa0/${port} an access port in it`],
      ["Files", `inventory.ini and ${yml}`], ["Useful", `ansible all -m ping · ansible-playbook ${yml} --check · ansible all -m ios_command -a "show vlan brief"`]],
    topology: {
      devices: [
        { name: "ADMIN-PC", kind: "pc", x: 160, y: 120, ip: { mode: "static", ip: `${mg}.10`, mask: M24 },
          files: { "inventory.ini": inventory(has("host") ? 2 : 3), [yml]: playbook(has("group") ? "switches" : "access", has("port") ? wrongPort : port, !has("line")) } },
        sw(1, 500, 120, ["g0/1", "g0/2"]), sw(2, 300, 300, ["g0/1"]), sw(3, 700, 300, ["g0/1"]),
        pc("CAM1", 760, 120, `${cams}.11`, M24), pc("CAM2", 300, 460, `${cams}.12`, M24), pc("CAM3", 700, 460, `${cams}.13`, M24),
      ],
      links: ["ADMIN-PC SW1:fa0/1", "SW1:g0/1 SW2:g0/1", "SW1:g0/2 SW3:g0/1", `SW1:fa0/${port} CAM1`, `SW2:fa0/${port} CAM2`, `SW3:fa0/${port} CAM3`],
    },
    objectives: [
      { text: "The inventory lists all three switches with their addresses", check: C.inventoryHas("ADMIN-PC", [`${mg}.11`, `${mg}.12`, `${mg}.13`]) },
      { text: `VLAN ${vid} exists and is named \`${vname}\` on all three switches`, check: C.all(...all.map(s => C.vlan(s, vid, vname))) },
      { text: `Fa0/${port} is an access port in VLAN ${vid} on all three switches`, check: C.all(...all.map(s => C.accessVlan(s, ports, vid))) },
      { text: "The cameras can reach each other (CAM1 pings CAM2 and CAM3)", check: C.all(C.ping("CAM1", `${cams}.12`), C.ping("CAM1", `${cams}.13`)) },
      { text: "The last playbook run reached all three switches with nothing failed or unreachable", check: C.ansibleClean(all) },
    ],
    hints: ["Start with `ansible all -m ping`. It shows which switches Ansible can log in to. A switch that is missing from the inventory is never touched, and nothing warns you about it.",
      "Read the playbook top down. `hosts:` must name a group that exists in the inventory, `parents:` is the mode to enter (check the interface number), and `lines:` must hold every command the port needs: its mode *and* its VLAN. New lines must be indented exactly like their neighbours.",
      `Run \`ansible-playbook ${yml} --check\` to see what would change, then without \`--check\`. Verify with \`ansible all -m ios_command -a "show vlan brief"\`. A second run should report ok for every task.`],
    solution: [
      { pc: "ADMIN-PC", file: "inventory.ini", content: inventory(3) },
      { pc: "ADMIN-PC", file: yml, content: playbook("access", port, true) },
      { on: "ADMIN-PC", cmds: ["ansible all -m ping", `ansible-playbook ${yml}`, `ansible-playbook ${yml}`] },
    ],
  };
}

// ---------------------------------------------------------------- floating and host routes
// Two routers joined by a primary link and a backup serial link. Shared by the
// story lab and its variants.
export function floatingLab({ site, br, hq, p, b, ad, hostRoute }) {
  const brLan = `192.168.${br}`, hqLan = `192.168.${hq}`, P = `10.0.${p}`, B = `10.0.${b}`, srv = `${hqLan}.50`;
  const failover = net => !net.st.status("BR-R1", "GigabitEthernet0/1").up && net.st.reach("PC-BR", ((192 << 24) | (168 << 16) | (hq << 8) | 10) >>> 0).ok;
  return {
    subject: `${site} has one link to HQ and no plan B`,
    brief: [`The ${site} branch reaches HQ over one Ethernet circuit. A backup serial line was installed last month and is up, but nothing uses it: when the main circuit failed on Tuesday the branch was offline for two hours.`,
      `Add **floating static routes** on both routers so traffic moves to the serial line when the main circuit is down, and moves back by itself when it returns. Use administrative distance **${ad}** for them.${hostRoute ? ` Payroll's server (${srv}) is a special case: finance wants its traffic from the branch on the serial line **all the time**, which calls for a **host route**.` : ""}`,
      "Then prove it: shut the main link, check the branch still reaches HQ, and bring the link back up before you close the ticket."],
    details: [["Branch LAN", `${brLan}.0/24 (PC-BR is .10)`], ["HQ LAN", `${hqLan}.0/24 (PC-HQ is .10${hostRoute ? ", payroll server is .50" : ""})`],
      ["Main link", `G0/1 on both routers, ${P}.0/30 (HQ is .1, branch is .2)`], ["Backup link", `S0/0/0 on both routers, ${B}.0/30 (HQ is .1, branch is .2)`],
      ["Floating routes", `administrative distance ${ad}, on both routers`], hostRoute && ["Payroll server", `${srv}: always through the backup link from the branch`]].filter(Boolean),
    topology: {
      devices: [
        { name: "BR-R1", kind: "router", hostname: "BR-R1", x: 240, y: 170, config: [...ifc("g0/0", `${brLan}.1`, M24), ...ifc("g0/1", `${P}.2`, M30), ...ifc("s0/0/0", `${B}.2`, M30), `ip route ${hqLan}.0 ${M24} ${P}.1`] },
        { name: "HQ-R1", kind: "router", hostname: "HQ-R1", x: 700, y: 170, config: [...ifc("g0/0", `${hqLan}.1`, M24), ...ifc("g0/1", `${P}.1`, M30), ...ifc("s0/0/0", `${B}.1`, M30), `ip route ${brLan}.0 ${M24} ${P}.2`] },
        { name: "HQ-SW", kind: "switch", hostname: "HQ-SW1", x: 700, y: 310 },
        pc("PC-BR", 240, 430, `${brLan}.10`, M24, `${brLan}.1`), pc("PC-HQ", 600, 440, `${hqLan}.10`, M24, `${hqLan}.1`),
        ...(hostRoute ? [{ name: "SRV-PAY", kind: "server", x: 820, y: 440, note: "Payroll", services: ["http"], ip: { mode: "static", ip: srv, mask: M24, gw: `${hqLan}.1` } }] : []),
      ],
      links: ["BR-R1:g0/1 HQ-R1:g0/1", "BR-R1:s0/0/0 HQ-R1:s0/0/0", "BR-R1:g0/0 PC-BR", "HQ-R1:g0/0 HQ-SW:g0/1", "HQ-SW:fa0/1 PC-HQ", ...(hostRoute ? ["HQ-SW:fa0/2 SRV-PAY"] : [])],
    },
    objectives: [
      { text: `BR-R1 has a floating route to the HQ LAN through the backup link, with distance ${ad}`, check: C.floating("BR-R1", `${hqLan}.0/24`, `${B}.1`, ad) },
      { text: `HQ-R1 has a floating route to the branch LAN through the backup link, with distance ${ad}`, check: C.floating("HQ-R1", `${brLan}.0/24`, `${B}.2`, ad) },
      hostRoute && { text: `BR-R1 sends traffic for the payroll server (${srv}) through the backup link with a host route`, check: C.all(C.routeVia("BR-R1", srv, `${B}.1`, 32), C.ping("PC-BR", srv)) },
      { text: "Failover proven: with the main link down, PC-BR still reaches PC-HQ", check: C.sticky("failover", failover) },
      { text: "The main link is up and carrying the traffic: BR-R1 reaches the HQ LAN through G0/1", check: C.all(C.ifaceUp("BR-R1", "g0/1"), C.routeVia("BR-R1", `${hqLan}.10`, `${P}.1`, 24), C.ping("PC-BR", `${hqLan}.10`)) },
      { text: "Save both routers", check: C.all(C.savedChanged("BR-R1"), C.savedChanged("HQ-R1")) },
    ].filter(Boolean),
    hints: [`A floating static route is an ordinary static route with a number on the end: \`ip route <network> <mask> <next-hop> ${ad}\`. The number is its administrative distance. Because it is higher than 1, the route stays out of the table while the main route is there.`,
      `The backup next hop is the other router's address on the serial link (${B}.1 from the branch, ${B}.2 from HQ). Both routers need one, or replies have no way back.${hostRoute ? ` A host route uses the mask 255.255.255.255 and needs no distance: the longest match already makes it win.` : ""}`,
      "To test: on BR-R1, `interface g0/1` then `shutdown`, and ping PC-HQ from PC-BR. `show ip route` now shows the route through the serial link. Then `no shutdown`, and the original route returns."],
    solution: [
      { on: "BR-R1", cmds: cfg(`ip route ${hqLan}.0 ${M24} ${B}.1 ${ad}`, ...(hostRoute ? [`ip route ${srv} 255.255.255.255 ${B}.1`] : [])) },
      { on: "HQ-R1", cmds: [...cfg(`ip route ${brLan}.0 ${M24} ${B}.2 ${ad}`), "write memory"] },
      { on: "BR-R1", cmds: ["configure terminal", "interface g0/1", "shutdown", "end", "show ip route"] },
      { on: "PC-BR", cmds: [`ping ${hqLan}.10`] },
      { on: "BR-R1", cmds: ["configure terminal", "interface g0/1", "no shutdown", "end", "write memory"] },
    ],
  };
}

// ---------------------------------------------------------------- DHCP relay
// Branch clients, DHCP server at HQ, a router in between. `fault` is null for
// the build version, or names the one thing that is broken:
//   wrong-if  - the helper address is on the WAN interface instead of the LAN
//   wrong-ip  - the helper points at an address that is not the server
//   pool-net  - the pool on the server is for the wrong subnet
//   no-route  - the server has no route back to the branch LAN
//   gateway   - the pool hands out a gateway that does not exist
export function relayLab({ site, hq, br, w, ex, dns, fault }) {
  const hqLan = `192.168.${hq}`, brLan = `192.168.${br}`, wan = `10.0.${w}`, server = `${wan}.1`, wrongNet = `192.168.${br === 250 ? 249 : br + 1}`;
  const pool = (name, net, gw) => [`ip dhcp pool ${name}`, `network ${net}.0 ${M24}`, `default-router ${gw}`, `dns-server ${dns}`, "exit"];
  const hqCfg = [...ifc("g0/0", `${hqLan}.1`, M24), ...ifc("g0/1", `${wan}.1`, M30), "exit", `ip dhcp excluded-address ${hqLan}.1 ${hqLan}.${ex}`, ...pool("HQ", hqLan, `${hqLan}.1`),
    ...(fault !== "no-route" ? [`ip route ${brLan}.0 ${M24} ${wan}.2`] : []),
    ...(fault ? [`ip dhcp excluded-address ${brLan}.1 ${brLan}.${ex}`, ...pool("BRANCH", fault === "pool-net" ? wrongNet : brLan, fault === "gateway" ? `${brLan}.254` : `${brLan}.1`)] : [])];
  const brCfg = [...ifc("g0/0", `${brLan}.1`, M24), ...(fault && fault !== "wrong-if" ? [`ip helper-address ${fault === "wrong-ip" ? `${wan}.9` : server}`] : []),
    ...ifc("g0/1", `${wan}.2`, M30), ...(fault === "wrong-if" ? [`ip helper-address ${server}`] : []), "exit", `ip route 0.0.0.0 0.0.0.0 ${wan}.1`];
  const fix = {
    "wrong-if": [{ on: "BR-R1", cmds: cfg("interface g0/1", `no ip helper-address ${server}`, "interface g0/0", `ip helper-address ${server}`) }],
    "wrong-ip": [{ on: "BR-R1", cmds: cfg("interface g0/0", `no ip helper-address ${wan}.9`, `ip helper-address ${server}`) }],
    "pool-net": [{ on: "HQ-R1", cmds: cfg("ip dhcp pool BRANCH", `network ${brLan}.0 ${M24}`) }],
    "no-route": [{ on: "HQ-R1", cmds: cfg(`ip route ${brLan}.0 ${M24} ${wan}.2`) }],
    gateway: [{ on: "HQ-R1", cmds: cfg("ip dhcp pool BRANCH", `default-router ${brLan}.1`) }],
  };
  const build = [
    { on: "HQ-R1", cmds: cfg(`ip dhcp excluded-address ${brLan}.1 ${brLan}.${ex}`, "ip dhcp pool BRANCH", `network ${brLan}.0 ${M24}`, `default-router ${brLan}.1`, `dns-server ${dns}`) },
    { on: "BR-R1", cmds: cfg("interface g0/0", `ip helper-address ${server}`) },
  ];
  return {
    subject: fault ? `${site} branch PCs get no address` : `${site} branch needs DHCP from HQ`,
    brief: fault
      ? [`The ${site} branch was set up yesterday to take its addresses from the DHCP server at HQ, and it does not work: the branch PCs ${fault === "gateway" ? "get an address but reach nothing outside their own LAN" : "come up with 169.254 addresses"}. HQ's own PCs are fine.`,
        "There is exactly one fault, on one of the two routers. A relayed request has to get from the branch router to the server, match a pool for the **branch** subnet, and the answer has to find its way back."]
      : [`The ${site} branch has no DHCP server of its own, and its PCs have given themselves 169.254 addresses. HQ-R1 already serves the HQ LAN.`,
        "A DHCP request is a broadcast, and routers do not forward broadcasts. Add a pool for the branch subnet on **HQ-R1**, and make **BR-R1** relay the branch's requests to it."],
    details: [["DHCP server", `HQ-R1, reached at ${server}`], ["Branch LAN", `${brLan}.0/24 on BR-R1 G0/0, gateway .1`], ["Reserved", `.1 to .${ex} in each subnet`], ["DNS server", dns],
      ["WAN link", `${wan}.0/30 (HQ is .1, branch is .2)`], ["Test target", `intranet server ${hqLan}.5`]],
    topology: {
      devices: [
        { name: "HQ-R1", kind: "router", hostname: "HQ-R1", x: 700, y: 110, config: hqCfg, saved: false },
        { name: "BR-R1", kind: "router", hostname: "BR-R1", x: 260, y: 110, config: brCfg, saved: false },
        { name: "HQ-SW", kind: "switch", hostname: "HQ-SW1", x: 700, y: 270 }, { name: "BR-SW", kind: "switch", hostname: "BR-SW1", x: 260, y: 270 },
        dhcpPc("PC-B1", 150, 430), dhcpPc("PC-B2", 370, 430), dhcpPc("PC-H1", 600, 430),
        { name: "SRV1", kind: "server", x: 810, y: 430, note: "Intranet", services: ["http"], ip: { mode: "static", ip: `${hqLan}.5`, mask: M24, gw: `${hqLan}.1` } },
      ],
      links: ["BR-R1:g0/1 HQ-R1:g0/1", "BR-R1:g0/0 BR-SW:g0/1", "HQ-R1:g0/0 HQ-SW:g0/1", "BR-SW:fa0/1 PC-B1", "BR-SW:fa0/2 PC-B2", "HQ-SW:fa0/1 PC-H1", "HQ-SW:fa0/2 SRV1"],
    },
    objectives: [
      { text: `BR-R1 relays DHCP requests from its LAN interface (G0/0) to ${server}`, check: C.helper("BR-R1", "g0/0", server) },
      { text: `PC-B1 and PC-B2 lease addresses in ${brLan}.0/24 above .${ex}`, check: C.all(C.dhcpLease("PC-B1", `${brLan}.0/24`, ex + 1), C.dhcpLease("PC-B2", `${brLan}.0/24`, ex + 1)) },
      { text: "The branch PCs received a working gateway (both can ping the intranet server)", check: C.all(C.ping("PC-B1", `${hqLan}.5`), C.ping("PC-B2", `${hqLan}.5`)) },
      { text: "HQ's own PC still has its lease", check: C.dhcpLease("PC-H1", `${hqLan}.0/24`, ex + 1) },
    ],
    hints: fault
      ? ["Follow the request. On BR-R1: `show running-config | include helper` and note which interface it is under; it must be the one facing the clients. Can BR-R1 ping the address it points at?",
        "On HQ-R1: `show ip dhcp pool` lists each pool's subnet, and `show ip route` shows whether HQ knows the way back to the branch LAN. The server answers to the relay's LAN address, so without that route the offer is lost.",
        "If the PCs get an address but cannot leave their LAN, run `ipconfig` on one and compare the gateway it received with the router's real address."]
      : ["Two routers need work. The server needs a pool whose `network` is the **branch** subnet, with exclusions first. The branch router needs one line on the interface that faces the clients.",
        `On HQ-R1: \`ip dhcp excluded-address ${brLan}.1 ${brLan}.${ex}\`, \`ip dhcp pool BRANCH\`, \`network ${brLan}.0 ${M24}\`, \`default-router ${brLan}.1\`, \`dns-server ${dns}\`.`,
        `On BR-R1: \`interface g0/0\`, \`ip helper-address ${server}\`. Then \`ipconfig /all\` on a branch PC shows the lease and which server gave it.`],
    solution: fault ? fix[fault] : build,
  };
}

// ---------------------------------------------------------------- spanning tree
// Two distribution switches and one access switch in a triangle. Shared by the
// story lab, its build variants and its troubleshooting variants.
const listOf = a => (a.length === 1 ? String(a[0]) : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const portName = p => p[0].toUpperCase() + p.slice(1);
const TRI = ["DSW1", "DSW2", "ASW1"];
const otherDsw = d => (d === "DSW1" ? "DSW2" : "DSW1");
function stpTriangle(site, [a, b], extra) {
  const base = [`vlan ${a.id}`, `name ${a.name}`, `vlan ${b.id}`, `name ${b.name}`, "exit"];
  const up = ["g0/1", "g0/2"].flatMap(p => [`interface ${p}`, "switchport mode trunk", `switchport trunk allowed vlan ${a.id},${b.id}`]);
  const acc = (p, v) => [`interface ${p}`, "switchport mode access", `switchport access vlan ${v}`];
  const srv = (name, x, v) => ({ name, kind: "server", x, y: 270, note: v.name, ip: { mode: "static", ip: `192.168.${v.id}.5`, mask: M24 } });
  return {
    devices: [
      { name: "DSW1", kind: "switch", hostname: `${site}-DSW1`, x: 300, y: 110, config: [...base, ...up, ...acc("fa0/1", a.id), "exit", ...extra.DSW1] },
      { name: "DSW2", kind: "switch", hostname: `${site}-DSW2`, x: 700, y: 110, config: [...base, ...up, ...acc("fa0/1", b.id), "exit", ...extra.DSW2] },
      { name: "ASW1", kind: "switch", hostname: `${site}-ASW1`, x: 500, y: 290, config: [...base, ...up, ...acc("fa0/1", a.id), ...acc("fa0/2", b.id), "exit", ...extra.ASW1] },
      srv("SRV-A", 110, a), srv("SRV-B", 890, b),
      pc("PC-A", 380, 450, `192.168.${a.id}.11`, M24), pc("PC-B", 620, 450, `192.168.${b.id}.11`, M24),
    ],
    links: ["DSW1:g0/1 DSW2:g0/1", "DSW1:g0/2 ASW1:g0/1", "DSW2:g0/2 ASW1:g0/2", "DSW1:fa0/1 SRV-A", "DSW2:fa0/1 SRV-B", "ASW1:fa0/1 PC-A", "ASW1:fa0/2 PC-B"],
  };
}
const EDGE = ["interface range fa0/1 - 2", "spanning-tree portfast", "spanning-tree bpduguard enable", "exit"];
const stpPings = ([a, b]) => C.all(C.ping("PC-A", `192.168.${a.id}.5`), C.ping("PC-B", `192.168.${b.id}.5`));

// Put the root bridge where the design wants it.
//   roots - which distribution switch must be root for each VLAN, e.g. { 10: "DSW1", 20: "DSW2" }
//   left  - the priority somebody left on the access switch
//   exact - null to leave the method to the player, or { primary, secondary }: priorities the ticket demands
//   guard - also ask for root guard on the distribution ports that face the access switch
export function stpLab({ site, vlans, roots, left, exact, guard }) {
  const [a, b] = vlans, ids = [a.id, b.id], vl = ids.join(","), Site = cap(site.toLowerCase());
  const byRoot = d => ids.filter(v => roots[v] === d);
  const rootsUsed = ["DSW1", "DSW2"].filter(d => byRoot(d).length), split = rootsUsed.length === 2;
  const alt = v => (roots[v] === "DSW1" ? "g0/2" : "g0/1");          // ASW1's uplink to the switch that is not the root
  const setPrio = (d, mine) => {
    const v = (mine ? byRoot(d) : byRoot(otherDsw(d))).join(",");
    if (!v) return [];
    return [exact ? `spanning-tree vlan ${v} priority ${mine ? exact.primary : exact.secondary}` : `spanning-tree vlan ${v} root ${mine ? "primary" : "secondary"}`];
  };
  const dsw = d => [...cfg("spanning-tree mode rapid-pvst", ...setPrio(d, true), ...setPrio(d, false), ...(guard ? ["interface g0/2", "spanning-tree guard root"] : [])), "show spanning-tree", "write memory"];
  const plan = split
    ? `**DSW1** is the root for VLAN ${listOf(byRoot("DSW1"))} and the backup for VLAN ${listOf(byRoot("DSW2"))}; **DSW2** is the other way round. Each VLAN then uses a different uplink from the access switch, so both cables carry traffic`
    : `**${rootsUsed[0]}** is the root for VLAN ${listOf(ids)}, and **${otherDsw(rootsUsed[0])}** takes over if it fails`;
  return {
    subject: `${Site}: the smallest switch in the building is the spanning tree root`,
    brief: [`Something odd showed up at the ${Site} site: traffic between the two distribution switches takes the long way round, through the access switch, and the direct link between them carries nothing. \`show spanning-tree\` explains it. **ASW1** is the root bridge: somebody set a low priority on it during a test and never took it off.`,
      `Put the root where the design wants it: ${plan}. Return ASW1 to the default priority, and move all three switches to **Rapid PVST+** while you are there.${exact ? ` The design document gives exact priorities: **${exact.primary}** for a root and **${exact.secondary}** for its backup.` : ""}`,
      ...(guard ? ["Then make sure it cannot happen again: put **root guard** on the distribution ports that face the access switch, so nothing plugged in below them can take the root over."] : [])],
    details: [["Switches", "DSW1 and DSW2 (distribution), ASW1 (access)"], ["VLANs", `${a.id} (${a.name}) and ${b.id} (${b.name})`], ["Spanning tree mode", "Rapid PVST+ on all three"],
      ...rootsUsed.map(d => [`VLAN ${listOf(byRoot(d))}`, `root ${d}${exact ? ` (priority ${exact.primary})` : ""}, backup ${otherDsw(d)}${exact ? ` (priority ${exact.secondary})` : ""}`]),
      ["ASW1", "default priority (32768) in both VLANs"], guard && ["Root guard", "G0/2 of DSW1 and G0/2 of DSW2 (they face ASW1)"],
      ["Useful", "show spanning-tree vlan <id> · show spanning-tree summary"]].filter(Boolean),
    topology: stpTriangle(site, vlans, { DSW1: [], DSW2: [], ASW1: [...EDGE, `spanning-tree vlan ${vl} priority ${left}`] }),
    objectives: [
      { text: "All three switches run Rapid PVST+", check: C.stpMode(TRI, "rapid-pvst") },
      ...rootsUsed.map(d => ({ text: `${d} is the root bridge for VLAN ${listOf(byRoot(d))}${exact ? `, with priority ${exact.primary}` : ""}`,
        check: C.all(...byRoot(d).flatMap(v => [C.stpRoot(d, v), ...(exact ? [C.stpPriority(d, v, exact.primary)] : [])])) })),
      ...rootsUsed.map(d => ({ text: `${otherDsw(d)} is next in line for VLAN ${listOf(byRoot(d))}${exact ? `, with priority ${exact.secondary}` : `: it becomes the root if ${d} fails`}`,
        check: C.all(...byRoot(d).flatMap(v => [C.stpRoot(d, v), C.stpBackup(otherDsw(d), v), ...(exact ? [C.stpPriority(otherDsw(d), v, exact.secondary)] : [])])) })),
      { text: `ASW1 is back on the default priority (32768) for VLAN ${listOf(ids)}`, check: C.all(...ids.map(v => C.stpPriority("ASW1", v, 32768))) },
      { text: `The blocked port is now on the access switch: ASW1 blocks ${split ? ids.map(v => `${portName(alt(v))} in VLAN ${v}`).join(" and ") : `${portName(alt(a.id))} in both VLANs`}`,
        check: C.all(...ids.map(v => C.stpRole("ASW1", alt(v), v, "Altn"))) },
      guard && { text: "Root guard is on G0/2 of DSW1 and of DSW2, and no port is root-inconsistent", check: C.all(C.rootGuardOnly({ DSW1: ["g0/2"], DSW2: ["g0/2"], ASW1: [] }), C.stpClean(TRI)) },
      { text: "PC-A still reaches SRV-A, and PC-B still reaches SRV-B", check: stpPings(vlans) },
      { text: "Save all three switches", check: C.all(...TRI.map(d => C.savedChanged(d))) },
    ].filter(Boolean),
    hints: [`\`show spanning-tree vlan ${a.id}\` names the root bridge in its first block and the switch you are on in the second. The lowest bridge ID wins: priority first, then MAC address. Every VLAN has its own tree, so look at VLAN ${b.id} as well.`,
      exact
        ? `\`spanning-tree vlan <list> priority <n>\` sets a priority directly, in multiples of 4096. \`no spanning-tree vlan ${vl} priority\` on ASW1 returns it to 32768. The mode is the global command \`spanning-tree mode rapid-pvst\`.`
        : `On the switch that must be root: \`spanning-tree vlan <list> root primary\`. On its backup: \`spanning-tree vlan <list> root secondary\`. \`root primary\` chooses a priority below the current root's, so clear ASW1 first with \`no spanning-tree vlan ${vl} priority\`: if the current root sits at 0, nothing can go below it and the command says so.`,
      guard
        ? "Root guard is an interface command: `spanning-tree guard root` on G0/2 of each distribution switch. A port that turns root-inconsistent is still hearing a better bridge ID from below; `show spanning-tree inconsistentports` lists them."
        : "`show spanning-tree vlan <id>` on ASW1 lists each port's role: Root is the uplink in use and Altn is the blocked one. Finish by saving all three switches."],
    solution: [
      { on: "ASW1", cmds: [...cfg("spanning-tree mode rapid-pvst", `no spanning-tree vlan ${vl} priority`), "write memory"] },
      { on: "DSW1", cmds: dsw("DSW1") }, { on: "DSW2", cmds: dsw("DSW2") },
    ],
  };
}

// The same triangle after a hardening change landed on the wrong ports. One fault:
//   guard-uplink - root guard is on the access switch's uplinks instead of the distribution ports facing it
//   bpdu-uplink  - PortFast and BPDU guard are on the access switch's uplinks instead of its PC ports
//   guard-core   - root guard is on the link between the distribution switches instead of the port facing ASW1
export function stpGuardLab({ site, vlans, root, fault }) {
  const [a, b] = vlans, ids = [a.id, b.id], vl = ids.join(","), sec = otherDsw(root), Site = cap(site.toLowerCase());
  const alt = root === "DSW1" ? "g0/2" : "g0/1";
  const guardOn = p => [`interface ${p}`, "spanning-tree guard root", "exit"];
  const dsw = d => ["spanning-tree mode rapid-pvst", `spanning-tree vlan ${vl} priority ${d === root ? 24576 : 28672}`,
    ...(fault === "guard-uplink" ? [] : guardOn(fault === "guard-core" && d === sec ? "g0/1" : "g0/2"))];
  const asw = ["spanning-tree mode rapid-pvst",
    ...(fault === "bpdu-uplink" ? ["interface range g0/1 - 2", "spanning-tree portfast", "spanning-tree bpduguard enable", "exit"] : EDGE),
    ...(fault === "guard-uplink" ? ["interface range g0/1 - 2", "spanning-tree guard root", "exit"] : [])];
  const fix = {
    "guard-uplink": [{ on: "ASW1", cmds: [...cfg("interface range g0/1 - 2", "no spanning-tree guard root"), "write memory"] },
      ...["DSW1", "DSW2"].map(d => ({ on: d, cmds: [...cfg("interface g0/2", "spanning-tree guard root"), "show spanning-tree inconsistentports", "write memory"] }))],
    "bpdu-uplink": [{ on: "ASW1", cmds: ["enable", "show interfaces status", "configure terminal", "interface range g0/1 - 2", "no spanning-tree portfast", "no spanning-tree bpduguard enable", "shutdown", "no shutdown",
      "interface range fa0/1 - 2", "spanning-tree portfast", "spanning-tree bpduguard enable", "end", "write memory"] }],
    "guard-core": [{ on: sec, cmds: ["enable", "show spanning-tree inconsistentports", "configure terminal", "interface g0/1", "no spanning-tree guard root", "interface g0/2", "spanning-tree guard root", "end", "write memory"] }],
  };
  const outage = fault !== "guard-core";
  return {
    subject: outage ? `${Site}: the access switch dropped off the network after last night's change` : `${Site}: a port is stuck in "root inconsistent" since last night's change`,
    brief: [`A hardening change went in at the ${Site} site last night: root guard on the distribution switches, PortFast and BPDU guard on the PC ports. It was pasted in by hand, and something landed on the wrong port. ${outage ? "Since then PC-A and PC-B reach nothing beyond their own switch." : "Nothing is down, but monitoring shows a blocked port between the two distribution switches, and their traffic is taking the long way through ASW1."}`,
      "Find what sits on the wrong port, take it off there, and put it where the design below says it belongs. Do not remove protection from the right ports to make the symptom go away."],
    details: [["Root bridge", `${root} for VLAN ${listOf(ids)}, backup ${sec} (already set)`], ["Root guard", "belongs on G0/2 of DSW1 and G0/2 of DSW2: the ports facing the access switch"],
      ["Edge protection", "PortFast and BPDU guard belong on Fa0/1 and Fa0/2 of ASW1: the PC ports"], ["Cabling", "DSW1 G0/1 to DSW2 G0/1 · DSW1 G0/2 to ASW1 G0/1 · DSW2 G0/2 to ASW1 G0/2"],
      ["Useful", "show interfaces status · show spanning-tree inconsistentports · show running-config"]],
    topology: stpTriangle(site, vlans, { DSW1: dsw("DSW1"), DSW2: dsw("DSW2"), ASW1: asw }),
    objectives: [
      { text: "No port on the three switches is err-disabled or root-inconsistent", check: C.stpClean(TRI) },
      { text: "Root guard is on G0/2 of DSW1 and of DSW2, and on no other port", check: C.rootGuardOnly({ DSW1: ["g0/2"], DSW2: ["g0/2"], ASW1: [] }) },
      { text: "PortFast and BPDU guard are on ASW1's PC ports (Fa0/1 and Fa0/2) and on no uplink", check: C.edgeOnly("ASW1", ["fa0/1", "fa0/2"]) },
      { text: `${root} is the root bridge for both VLANs, and the only blocked port is ASW1 ${portName(alt)}`, check: C.all(...ids.flatMap(v => [C.stpRoot(root, v), C.stpRole("ASW1", alt, v, "Altn")])) },
      { text: "PC-A reaches SRV-A, and PC-B reaches SRV-B", check: stpPings(vlans) },
      { text: "Save every switch you changed", check: C.savedIfChanged(TRI) },
    ],
    hints: ["Two commands find a port that spanning tree protection has stopped. `show interfaces status` marks a port `err-disabled` (that is BPDU guard), and `show spanning-tree inconsistentports` lists the ports root guard is holding. Run both on each switch.",
      "Root guard belongs where the root must never appear, so never on a port that leads *towards* the root. BPDU guard belongs where no switch must ever appear, so never on an uplink. Compare `show running-config` on each switch with the design in the ticket.",
      "Remove with `no spanning-tree guard root`, `no spanning-tree portfast` and `no spanning-tree bpduguard enable`, in interface mode. A port that BPDU guard disabled stays down until you bounce it: `shutdown`, then `no shutdown`."],
    solution: fix[fault],
  };
}

// The same triangle with a switch nobody knows plugged into an access port of
// ASW1. It claims the root for one VLAN.
//   port    - the Fa0/x port of ASW1 it is plugged into
//   rv      - which of the two VLANs that port is in (0 or 1)
//   prio    - the priority the unknown switch announces
//   guarded - root guard is already on the distribution switches, so they have
//             cut ASW1 off in that VLAN; otherwise the tree has re-rooted and
//             the player adds root guard as well
export function rogueLab({ site, vlans, root, port, rv, prio, guarded }) {
  const [a, b] = vlans, ids = [a.id, b.id], vl = ids.join(","), v = vlans[rv], sec = otherDsw(root), Site = cap(site.toLowerCase());
  const edge = Array.from({ length: 8 }, (_, i) => `fa0/${i + 1}`), srv = `192.168.${v.id}.5`;
  const dsw = d => ["spanning-tree mode rapid-pvst", `spanning-tree vlan ${vl} priority ${d === root ? 24576 : 28672}`, ...(guarded ? ["interface g0/2", "spanning-tree guard root", "exit"] : [])];
  const topology = stpTriangle(site, vlans, { DSW1: dsw("DSW1"), DSW2: dsw("DSW2"),
    ASW1: ["spanning-tree mode rapid-pvst", `interface fa0/${port}`, "switchport mode access", `switchport access vlan ${v.id}`, "exit"] });
  topology.devices.push(
    { name: "SW-X", kind: "switch", hostname: "Switch", x: 770, y: 395, locked: true, note: "Not in the inventory",
      lockMsg: "It is under a table in a meeting room and nobody on site can get to it. Deal with it from the port it is plugged into.",
      config: [`vlan ${v.id}`, "exit", "interface range fa0/1 - 2", "switchport mode access", `switchport access vlan ${v.id}`, "exit", `spanning-tree vlan ${v.id} priority ${prio}`] },
    pc("LAPTOP", 890, 480, `192.168.${v.id}.77`, M24));
  topology.links.push(`ASW1:fa0/${port} SW-X:fa0/1`, "SW-X:fa0/2 LAPTOP");
  const secure = [...cfg("interface range fa0/1 - 8", "spanning-tree portfast", "spanning-tree bpduguard enable"), "show interfaces status", "write memory"];
  return {
    subject: guarded ? `${Site}: ${v.name} users on the access switch lost the network` : `${Site}: the spanning tree root is a switch nobody recognises`,
    brief: guarded
      ? [`At 09:12 this morning the ${v.name} users on ASW1 at the ${Site} site lost the network. ${vlans[1 - rv].name} is fine. Root guard is on the distribution switches, and both report an inconsistent port towards ASW1: something below them is claiming to be the root bridge for VLAN ${v.id}.`,
        `Root guard has contained it by cutting the access switch off in that VLAN, which is also why those users are down. Find what is claiming the root and cut it off at its port. Then give ASW1 the edge protection it never got: **PortFast and BPDU guard** on every access port. Root guard releases its ports by itself once the false root goes quiet.`,
        "You cannot log in to the unknown switch, and nobody is on site to unplug it."]
      : [`Monitoring logged a spanning tree change at the ${Site} site at 09:12 this morning, and the tree has not gone back. \`show spanning-tree vlan ${v.id}\` on ${root} now names a root bridge with priority ${prio + v.id} and an address that is not in the inventory. ${root} was the root yesterday.`,
        "Somebody has plugged a switch into the network. Follow the root port from switch to switch until you reach it, cut it off at its port, and then close the hole: **PortFast and BPDU guard** on every access port of ASW1, and **root guard** on the distribution ports that face it.",
        "You cannot log in to the unknown switch, and nobody is on site to unplug it."],
    details: [["Root bridge", `${root} for VLAN ${listOf(ids)}, backup ${sec}`], ["Edge protection", "PortFast and BPDU guard on Fa0/1 to Fa0/8 of ASW1"],
      ["Root guard", guarded ? "already on G0/2 of DSW1 and of DSW2: leave it there" : "G0/2 of DSW1 and G0/2 of DSW2 (they face ASW1)"], ["Unknown switch", "no console access, nobody on site"],
      ["Useful", "show spanning-tree vlan <id> · show spanning-tree inconsistentports · show cdp neighbors · show interfaces status"]],
    topology,
    objectives: [
      { text: `All three switches agree again that ${root} is the root bridge for VLAN ${listOf(ids)}`, check: C.all(...ids.map(id => C.stpRootIs(TRI, id, root))) },
      { text: "The unknown switch is cut off at ASW1 (its port is err-disabled or shut down), and the laptop behind it reaches nothing", check: C.all(C.cutOff("ASW1", `fa0/${port}`), C.noPing("LAPTOP", srv)) },
      { text: "PortFast and BPDU guard are on all eight access ports of ASW1 (Fa0/1 to Fa0/8) and on no uplink", check: C.edgeOnly("ASW1", edge) },
      { text: "Root guard is on G0/2 of DSW1 and of DSW2, and no port is root-inconsistent", check: C.all(C.rootGuardOnly({ DSW1: ["g0/2"], DSW2: ["g0/2"], ASW1: [] }), C.stpConsistent(TRI)) },
      { text: "PC-A reaches SRV-A, and PC-B reaches SRV-B", check: stpPings(vlans) },
      { text: "Save every switch you changed", check: C.savedIfChanged(TRI) },
    ],
    hints: [guarded
      ? `\`show spanning-tree inconsistentports\` on a distribution switch names the port that hears the false root, and that port leads to ASW1. On ASW1, \`show spanning-tree vlan ${v.id}\` shows the Root ID and the \`Port\` that leads to it: an access port. \`show cdp neighbors\` tells you what is on the other end.`
      : `\`show spanning-tree vlan ${v.id}\` on ${root}: the Root ID block is no longer this switch, and its \`Port\` line says which interface leads towards the root. Go to the switch at the other end of that port and ask again. The trail ends at an access port; \`show cdp neighbors\` tells you what is plugged into it.`,
      "BPDU guard is the tool for an access port: `interface range fa0/1 - 8`, `spanning-tree portfast`, `spanning-tree bpduguard enable`. The moment it is on, a port with a switch behind it goes err-disabled, and `show interfaces status` shows which one.",
      guarded
        ? "Nothing needs changing on the distribution switches. Run `show spanning-tree inconsistentports` there again: the list is empty, because root guard recovers by itself. Save ASW1."
        : `Then root guard: \`interface g0/2\`, \`spanning-tree guard root\` on DSW1 and on DSW2. If you add it while the unknown switch is still connected, those ports turn root-inconsistent and ASW1 loses VLAN ${v.id} until you cut the switch off. That is root guard doing its job.`],
    solution: guarded
      ? [{ on: root, cmds: ["enable", "show spanning-tree inconsistentports"] }, { on: "ASW1", cmds: ["enable", `show spanning-tree vlan ${v.id}`, "show cdp neighbors", ...secure.slice(1)] }]
      : [{ on: root, cmds: ["enable", `show spanning-tree vlan ${v.id}`] }, { on: "ASW1", cmds: ["enable", `show spanning-tree vlan ${v.id}`, "show cdp neighbors", ...secure.slice(1)] },
        ...["DSW1", "DSW2"].map(d => ({ on: d, cmds: [...cfg("interface g0/2", "spanning-tree guard root"), "write memory"] }))],
  };
}

// ---------------------------------------------------------------- EtherChannel
// Two switches joined by two or three parallel cables. `fault` is null for the
// build version (separate trunks, so spanning tree blocks all but one), or
// names what is wrong with a channel that already exists:
//   passive - both ends are LACP passive, so nobody starts the negotiation
//   on      - SW2 is forced "on" while SW1 speaks LACP
//   pagp    - SW2 uses a PAgP mode
//   missing - one cable on SW2 was never put in the group
//   allowed - SW2's port-channel does not allow the second VLAN
//   shut    - one member port on SW1 is shut down
export function channelLab({ site, vlans, ports, group, fault }) {
  const [a, b] = vlans, ids = [a.id, b.id], vl = ids.join(","), n = ports.length, Site = cap(site.toLowerCase());
  const names = listOf(ports.map(portName)), range = `${ports[0]} - ${ports[n - 1].split("/")[1]}`, last = ports[n - 1];
  const speed = ports[0].startsWith("g") ? "gigabit" : "100 Mb/s", words = ["", "", "two", "three"][n];
  const base = [`vlan ${a.id}`, `name ${a.name}`, `vlan ${b.id}`, `name ${b.name}`, "exit", "interface fa0/1", "switchport mode access", `switchport access vlan ${a.id}`,
    "interface fa0/2", "switchport mode access", `switchport access vlan ${b.id}`, "exit"];
  const trunk = p => [`interface ${p}`, "switchport mode trunk", ...(fault ? [`switchport trunk allowed vlan ${vl}`] : [])];
  const member = (p, mode) => [...trunk(p), `channel-group ${group} mode ${mode}`];
  const sw1 = fault ? [...ports.flatMap(p => member(p, fault === "passive" ? "passive" : "active")), ...(fault === "shut" ? [`interface ${ports[0]}`, "shutdown"] : [])] : ports.flatMap(trunk);
  const sw2 = fault
    ? [...ports.flatMap(p => (fault === "missing" && p === last ? trunk(p) : member(p, fault === "on" ? "on" : fault === "pagp" ? "desirable" : "passive"))),
      ...(fault === "allowed" ? [`interface port-channel ${group}`, `switchport trunk allowed vlan ${a.id}`] : [])]
    : ports.flatMap(trunk);
  const build = mode => [...cfg(`interface range ${range}`, `channel-group ${group} mode ${mode}`, "exit", `interface port-channel ${group}`, "switchport mode trunk", `switchport trunk allowed vlan ${vl}`), "show etherchannel summary", "write memory"];
  const one = (on, ...cmds) => [{ on, cmds: ["enable", "show etherchannel summary", "configure terminal", ...cmds, "end", "show etherchannel summary", "write memory"] }];
  const fix = {
    passive: one("SW1", `interface range ${range}`, `channel-group ${group} mode active`),
    on: one("SW2", `interface range ${range}`, `channel-group ${group} mode passive`),
    pagp: one("SW2", `interface range ${range}`, `channel-group ${group} mode passive`),
    missing: one("SW2", `interface ${last}`, `channel-group ${group} mode passive`),
    allowed: one("SW2", `interface port-channel ${group}`, `switchport trunk allowed vlan ${vl}`),
    shut: one("SW1", `interface ${ports[0]}`, "no shutdown"),
  };
  const symptom = {
    passive: "every cable is up, yet spanning tree is blocking between the two switches again, as if there were no channel at all",
    on: "nothing crosses between the two switches at all", pagp: "nothing crosses between the two switches at all",
    missing: "the channel is running on fewer cables than were installed, and spanning tree is blocking again",
    allowed: `the ${b.name} users on SW2 cannot reach their teammates on SW1, while ${a.name} works`,
    shut: "the channel is running on fewer cables than were installed",
  };
  const both = f => C.all(f("SW1"), f("SW2"));
  return {
    subject: fault ? `${Site}: the new EtherChannel is not doing its job` : `${Site}: the extra uplink carries no traffic`,
    brief: fault
      ? [`The EtherChannel between SW1 and SW2 at the ${Site} site was configured yesterday, and it is not right: ${symptom[fault]}.`,
        "There is exactly one fault, on one of the two switches. Start with `show etherchannel summary` on both: the flag beside each member port says whether it joined the bundle. The design below is what the channel should look like when you are done."]
      : [`SW2 at the ${Site} site reaches SW1 over a ${speed} uplink that is full at peak hours. Facilities ran ${n === 2 ? "a second cable" : "two more cables"} last week, and it made no difference: spanning tree sees parallel links between the same two switches, which is a loop, and blocks ${n === 2 ? "one of them" : "all but one"}.`,
        `Bundle the ${words} cables into **one EtherChannel** with LACP. Spanning tree then sees a single link, nothing is blocked, and the traffic is shared across all of them. Finish on the **port-channel** interface: it must be a trunk that carries only the two user VLANs.`],
    details: [["Member ports", `${names}, the same on both switches`], ["Channel group", `${group} (interface Port-channel${group})`], ["Protocol", "LACP: SW1 active, SW2 passive"],
      ["Port-channel", `trunk, allowed VLANs ${a.id} and ${b.id} only`], ["VLANs", `${a.id} ${a.name}: PC-A1 and PC-A2 · ${b.id} ${b.name}: PC-B1 and PC-B2`],
      ["Useful", "show etherchannel summary · show spanning-tree · show interfaces trunk"]],
    topology: {
      devices: [
        { name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 290, y: 170, config: [...base, ...sw1] },
        { name: "SW2", kind: "switch", hostname: `${site}-SW2`, x: 710, y: 170, config: [...base, ...sw2] },
        pc("PC-A1", 170, 410, `192.168.${a.id}.11`, M24), pc("PC-B1", 410, 410, `192.168.${b.id}.11`, M24),
        pc("PC-A2", 590, 410, `192.168.${a.id}.12`, M24), pc("PC-B2", 830, 410, `192.168.${b.id}.12`, M24),
      ],
      links: [...ports.map(p => `SW1:${p} SW2:${p}`), "SW1:fa0/1 PC-A1", "SW1:fa0/2 PC-B1", "SW2:fa0/1 PC-A2", "SW2:fa0/2 PC-B2"],
    },
    objectives: [
      { text: `${names} of SW1 are bundled in Port-channel ${group}`, check: C.bundled("SW1", group, n) },
      { text: `${names} of SW2 are bundled in Port-channel ${group}`, check: C.bundled("SW2", group, n) },
      { text: "LACP negotiates the channel: SW1 is active, SW2 is passive", check: C.all(C.channelMode("SW1", group, "active"), C.channelMode("SW2", group, "passive")) },
      { text: `Port-channel ${group} is a trunk on both switches and allows only VLANs ${a.id} and ${b.id}`, check: both(d => C.poTrunk(d, group, ids)) },
      !fault && { text: "Spanning tree sees one link between the switches and blocks nothing", check: C.all(both(d => C.bundled(d, group, n)), ...ids.map(v => C.noBlocked(["SW1", "SW2"], v))) },
      { text: "PC-A1 pings PC-A2, and PC-B1 pings PC-B2", check: C.all(C.ping("PC-A1", `192.168.${a.id}.12`), C.ping("PC-B1", `192.168.${b.id}.12`)) },
      fault ? { text: "Save every switch you changed", check: C.savedIfChanged(["SW1", "SW2"]) } : { text: "Save both switches", check: both(d => C.savedChanged(d)) },
    ].filter(Boolean),
    hints: fault
      ? [`\`show etherchannel summary\` on each switch: \`(P)\` is bundled, \`(I)\` is a port running on its own because the other end did not negotiate, \`(s)\` is suspended and \`(D)\` is down. Count the member ports as well: are all ${words} listed?`,
        "`show running-config` shows the `channel-group` line of every member. LACP forms with active/active or active/passive. `on` speaks no protocol and `desirable`/`auto` are PAgP, so neither works against an LACP end. To change the mode of a whole group, select all its members with `interface range`.",
        "If the bundle is complete and one VLAN still fails, compare `show interfaces trunk` on both switches. The allowed list is set on the `port-channel` interface and must match at both ends."]
      : [`\`show spanning-tree vlan ${a.id}\` on each switch shows why the extra cabling is idle: on one of them a parallel port has the role Altn and the state BLK. An EtherChannel turns the cables into one logical port.`,
        `\`interface range ${range}\`, then \`channel-group ${group} mode active\` on SW1 and \`mode passive\` on SW2. LACP needs at least one active end. The switch creates \`interface Port-channel${group}\` by itself.`,
        `\`interface port-channel ${group}\`, \`switchport mode trunk\`, \`switchport trunk allowed vlan ${vl}\`: what you set there is copied to the member ports. In \`show etherchannel summary\`, look for \`Po${group}(SU)\` and a \`(P)\` beside each member.`],
    solution: fault ? fix[fault] : [{ on: "SW1", cmds: build("active") }, { on: "SW2", cmds: build("passive") }],
  };
}

// ---------------------------------------------------------------- OSPF tuning
// Four routers that already run OSPF. CORE1, CORE2 and EDGE share the core LAN,
// so that LAN holds a DR election. DIST reaches CORE1 over gigabit and EDGE
// directly over old 100 Mb/s copper, which OSPF prefers until the costs are fixed.
//   steer "ref"   raise the reference bandwidth on every router
//   steer "cost"  put a fixed cost on the copper link
//   dr            which core router should become the designated router
export function ospfTuneLab({ site, office, servers, core, links, steer, ref, cost, dr }) {
  const want = dr, other = dr === "CORE1" ? "CORE2" : "CORE1";
  const lanO = `10.${office}.0`, lanS = `10.${servers}.0`, lanC = `10.0.${core}`, up = `10.255.${links[0]}`, old = `10.255.${links[1]}`;
  const srv = `${lanS}.10`, W24 = "0.0.0.255", W30 = "0.0.0.3", P2P = "ip ospf network point-to-point";
  const all = ["CORE1", "CORE2", "EDGE", "DIST"];
  // the router that should end up in charge starts with the lowest router ID, so at first it holds no role at all
  const rid = { [want]: "1.1.1.1", [other]: "2.2.2.2", EDGE: "3.3.3.3", DIST: "4.4.4.4" };
  const ospf = (name, nets, passive) => ["router ospf 1", `router-id ${rid[name]}`, ...nets.map(([n, w]) => `network ${n}.0 ${w} area 0`), ...(passive ? [`passive-interface ${passive}`] : [])];
  const withFa = ["GigabitEthernet0/0", "GigabitEthernet0/1", "FastEthernet0/0"];
  const priority = (net, dev) => net.devs[dev].ifaces["GigabitEthernet0/0"].ospfPri ?? 1;

  const refCmds = steer === "ref" ? ["router ospf 1", `auto-cost reference-bandwidth ${ref}`] : [];
  const costCmd = steer === "cost" ? [`ip ospf cost ${cost}`] : [];
  const top = ["interface g0/0", "ip ospf priority 200"];
  const fix = {
    CORE1: [...refCmds, "interface g0/1", P2P, ...(want === "CORE1" ? top : [])],
    CORE2: [...refCmds, ...(want === "CORE2" ? top : [])],
    EDGE: [...refCmds, "interface fa0/0", P2P, ...costCmd, "interface g0/0", "ip ospf priority 0"],
    DIST: [...refCmds, "interface g0/1", P2P, "interface fa0/0", P2P, ...costCmd],
  };
  const touched = all.filter(d => fix[d].length);

  return {
    subject: "Three things to tidy after the OSPF migration",
    brief: [
      `OSPF has been running at ${site} for a week, and the graphs show three things to tidy. Nothing is down, so look before you change anything.`,
      `**1. The slow link is doing the work.** The office (behind DIST) reaches the servers (behind EDGE) over the old 100 Mb/s copper link, while the gigabit path through CORE1 sits idle. ${steer === "ref"
        ? `OSPF gives both speeds the same cost. Fix that at the root: set the reference bandwidth to **${ref}** on every router.`
        : `Keep that link as a backup only: give it an OSPF cost of **${cost}** at both ends.`}`,
      "**2. Two-router links should not hold elections.** Each link from DIST joins exactly two routers. Make both of them point-to-point, at both ends.",
      `**3. The wrong router is in charge of the core LAN.** EDGE, the oldest router on site, is the designated router. **${want}** should hold that role with ${other} as its backup, and EDGE should never be elected.`,
    ],
    details: [["Core LAN (G0/0)", `${lanC}.0/24: CORE1 .1, CORE2 .2, EDGE .3`], ["DIST to CORE1", `${up}.0/30, gigabit, G0/1 at both ends`], ["DIST to EDGE", `${old}.0/30, 100 Mb/s copper, Fa0/0 at both ends`],
      ["Office", `${lanO}.0/24 on DIST G0/0 (PC-A is .10)`], ["Servers", `${lanS}.0/24 on EDGE G0/1 (SRV is .10)`], ["OSPF", "Process 1, area 0, already running on all four routers"]],
    topology: {
      devices: [
        { name: "CORE-SW", kind: "switch", hostname: "CORE-SW", x: 500, y: 200, note: "Core LAN", ports: ["GigabitEthernet0/1", "GigabitEthernet0/2", "GigabitEthernet0/3", "GigabitEthernet0/4"] },
        { name: "CORE1", kind: "router", hostname: "CORE1", x: 270, y: 200, config: [...ifc("g0/0", `${lanC}.1`, M24), ...ifc("g0/1", `${up}.1`, M30), ...ospf("CORE1", [[lanC, W24], [up, W30]])] },
        { name: "CORE2", kind: "router", hostname: "CORE2", x: 500, y: 80, config: [...ifc("g0/0", `${lanC}.2`, M24), ...ospf("CORE2", [[lanC, W24]])] },
        { name: "EDGE", kind: "router", hostname: "EDGE", x: 730, y: 200, note: "Oldest router on site", ports: withFa,
          config: [...ifc("g0/0", `${lanC}.3`, M24), ...ifc("g0/1", `${lanS}.1`, M24), ...ifc("fa0/0", `${old}.2`, M30), ...ospf("EDGE", [[lanC, W24], [lanS, W24], [old, W30]], "g0/1")] },
        { name: "DIST", kind: "router", hostname: "DIST", x: 270, y: 400, ports: withFa,
          config: [...ifc("g0/0", `${lanO}.1`, M24), ...ifc("g0/1", `${up}.2`, M30), ...ifc("fa0/0", `${old}.1`, M30), ...ospf("DIST", [[lanO, W24], [up, W30], [old, W30]], "g0/0")] },
        pc("PC-A", 100, 400, `${lanO}.10`, M24, `${lanO}.1`),
        { name: "SRV", kind: "server", x: 900, y: 200, note: "Servers", services: ["http"], ip: { mode: "static", ip: srv, mask: M24, gw: `${lanS}.1` } },
      ],
      links: ["CORE1:g0/0 CORE-SW:g0/1", "CORE2:g0/0 CORE-SW:g0/2", "EDGE:g0/0 CORE-SW:g0/3", "DIST:g0/1 CORE1:g0/1", "DIST:fa0/0 EDGE:fa0/0", "DIST:g0/0 PC-A", "EDGE:g0/1 SRV"],
    },
    objectives: [
      steer === "ref"
        ? { text: `All four routers use a reference bandwidth of ${ref} Mb/s`, check: C.ospfRef(all, ref) }
        : { text: `The copper link (Fa0/0) has OSPF cost ${cost} on DIST and on EDGE`, check: C.all(C.ospfCost("DIST", "fa0/0", cost), C.ospfCost("EDGE", "fa0/0", cost)) },
      { text: "Office and servers talk through CORE1: DIST and EDGE both route that way", check: C.all(C.routeVia("DIST", srv, `${up}.1`, 24), C.routeVia("EDGE", `${lanO}.10`, `${lanC}.1`, 24)) },
      { text: "Both links from DIST are point-to-point at each end (the neighbours show FULL/ -)", check: C.all(C.ospfP2p("DIST", "g0/1"), C.ospfP2p("CORE1", "g0/1"), C.ospfP2p("DIST", "fa0/0"), C.ospfP2p("EDGE", "fa0/0")) },
      { text: `On the core LAN, EDGE has priority 0 and ${want} has a higher priority than ${other}`, check: net => priority(net, "EDGE") === 0 && priority(net, want) > priority(net, other) && priority(net, other) > 0 },
      { text: `${want} is the designated router of the core LAN and ${other} is the backup`, check: C.all(C.ospfRole(want, "g0/0", "DR"), C.ospfRole(other, "g0/0", "BDR")) },
      { text: "PC-A still reaches the server (ping and HTTP)", check: C.all(C.ping("PC-A", srv), C.tcp("PC-A", srv, 80)) },
      { text: "Every router you changed is saved", check: C.savedIfChanged(all) },
    ],
    hints: [
      `Look first. On DIST, \`show ip route\` shows which neighbour leads to the server LAN, and \`show ip ospf interface brief\` shows what each interface costs: with the default reference bandwidth, FastEthernet and gigabit both cost 1, so the path with fewer hops wins. ${steer === "ref"
        ? `The fix goes under \`router ospf 1\` on every router: \`auto-cost reference-bandwidth ${ref}\`.`
        : `The fix is \`ip ospf cost ${cost}\` under \`interface fa0/0\`, on DIST and on EDGE.`}`,
      "`ip ospf network point-to-point` goes on the interface, at both ends of each link: G0/1 on DIST and CORE1, Fa0/0 on DIST and EDGE. While only one end is changed the neighbour still shows FULL, but its routes disappear. With both done, `show ip ospf neighbor` shows `FULL/  -`.",
      `\`show ip ospf interface g0/0\` names the DR and the BDR. Raising a priority does not unseat a designated router. \`ip ospf priority 0\` on EDGE makes it step down at once, and the backup takes over. If the role then sits on ${other}, restart OSPF there with \`clear ip ospf process\` and answer yes: ${want} is promoted, and ${other} comes back as the backup.`,
    ],
    solution: [
      ...touched.map(d => ({ on: d, cmds: cfg(...fix[d]) })),
      { on: other, cmds: ["enable", "clear ip ospf process", "yes"] },
      ...touched.map(d => ({ on: d, cmds: ["write memory"] })),
    ],
  };
}

// ---------------------------------------------------------------- broken access lists
// One router and two access lists that used to work, with faults typed into them.
//   guest faults (the list on the guest interface)
//     order      the broad deny sits above the narrow permit, so the permit never fires
//     port       the permit names the wrong port
//     wildcard   the staff deny has wildcard 0.0.0.0 and matches a single address
//     nopermit   the final "permit ip any any" is missing
//     direction  the list is applied outbound instead of inbound
//   wan fault (the list on the Internet link)
//     noest      no "established" line: pings come back, web pages do not
//     noecho     no "echo-reply" line: web pages load, pings fail
//     out        the list is applied outbound instead of inbound
export function aclFaultLab({ site, staff, guest, servers, port, who, guestFaults, wanFault }) {
  const a = `192.168.${staff}`, b = `192.168.${guest}`, s = `10.${servers}.0`, srv = `${s}.10`, web = "198.51.100.10";
  const has = f => guestFaults.includes(f);
  const G = `${who}-IN`, W = "INTERNET-IN", low = who.toLowerCase(), gpc = `PC-${who}`, wrongPort = port === 80 ? 8080 : 80;
  const url = `${port === 443 ? "https" : "http"}://${srv}${port === 8080 ? ":8080" : ""}`;
  const permit = p => `permit tcp ${b}.0 0.0.0.255 host ${srv} eq ${p}`;
  const denySrv = `deny ip ${b}.0 0.0.0.255 ${s}.0 0.0.0.255`, denyStaff = w => `deny ip ${b}.0 0.0.0.255 ${a}.0 ${w}`;
  const EST = "permit tcp any any established", ECHO = "permit icmp any any echo-reply";
  const first = permit(has("port") ? wrongPort : port);
  const config = [
    ...ifc("g0/0", `${a}.1`, M24), ...ifc("g0/1", `${b}.1`, M24), ...ifc("g0/2", `${s}.1`, M24), ...ifc("s0/0/0", "203.0.113.2", M30), "exit", "ip route 0.0.0.0 0.0.0.0 203.0.113.1",
    `ip access-list extended ${G}`, ...(has("order") ? [denySrv, first] : [first, denySrv]), denyStaff(has("wildcard") ? "0.0.0.0" : "0.0.0.255"), ...(has("nopermit") ? [] : ["permit ip any any"]), "exit",
    `ip access-list extended ${W}`, ...(wanFault === "noest" ? [] : [EST]), ...(wanFault === "noecho" ? [] : [ECHO]), "exit",
    "interface g0/1", `ip access-group ${G} ${has("direction") ? "out" : "in"}`, "interface s0/0/0", `ip access-group ${W} ${wanFault === "out" ? "out" : "in"}`,
  ];

  // what the service desk heard, the last hint, and the commands that put it right
  const seqPermit = has("order") ? 20 : 10;
  const guestInfo = {
    order: [`${cap(low)} users can no longer open the internal server page.`, `In ${G}, the deny for the whole server LAN sits above the permit for port ${port}, so the permit never gets a turn. Remove the deny with \`no 10\` and put it back lower down with \`25 ${denySrv}\`.`, ["no 10", `25 ${denySrv}`]],
    port: [`${cap(low)} users can no longer open the internal server page.`, `In ${G}, the permit names port ${wrongPort}, and the server listens on ${port}. Remove that line by its number and enter it again with the right port.`, [`no ${seqPermit}`, `${seqPermit} ${permit(port)}`]],
    wildcard: [`A ${low} laptop was seen pinging staff PCs.`, `In ${G}, the staff deny ends in \`host ${a}.0\`. Its wildcard was typed as 0.0.0.0, so it matches one address that no PC has. Replace line 30 with the wildcard 0.0.0.255.`, ["no 30", `30 ${denyStaff("0.0.0.255")}`]],
    nopermit: [`${cap(low)} users have lost their Internet access.`, `${G} no longer ends with \`permit ip any any\`, so the invisible deny at the end drops everything the lines above did not permit, Internet traffic included.`, ["permit ip any any"]],
    direction: [`A scan from the ${low} network reached the staff PCs and every server.`, `${G} is applied \`out\` on G0/1, where it sees traffic going to the ${low} hosts instead of coming from them. Remove it with \`no ip access-group ${G} out\` and apply it \`in\`.`, null],
  };
  const wanInfo = {
    noest: ["Nobody inside can load a website, although pings to the Internet work.", `${W} lets ping replies back in but has no line for TCP. Add \`${EST}\`.`, [EST]],
    noecho: ["Pings to the Internet fail for everyone, although websites load.", `${W} lets TCP replies back in but not ping replies. Add \`${ECHO}\`.`, [ECHO]],
    out: ["Nobody inside reaches the Internet at all, and the security team saw an outside address reach an internal PC.", `${W} is applied \`out\` on S0/0/0, so it filters what leaves and lets everything in. Remove it with \`no ip access-group ${W} out\` and apply it \`in\`.`, null],
  };
  const guestLines = guestFaults.flatMap(f => guestInfo[f][2] || []), wanLines = (wanInfo[wanFault] || [])[2] || [];
  const fix = [
    ...(guestLines.length ? [`ip access-list extended ${G}`, ...guestLines, "exit"] : []),
    ...(wanLines.length ? [`ip access-list extended ${W}`, ...wanLines, "exit"] : []),
    ...(has("direction") ? ["interface g0/1", `no ip access-group ${G} out`, `ip access-group ${G} in`] : []),
    ...(wanFault === "out" ? ["interface s0/0/0", `no ip access-group ${W} out`, `ip access-group ${W} in`] : []),
  ];
  const complaints = [...new Set([...guestFaults.map(f => guestInfo[f][0]), ...(wanInfo[wanFault] ? [wanInfo[wanFault][0]] : [])])];
  const inboundOnly = (net, n, name) => { const i = net.devs.R1.ifaces[n]; return i.aclIn === name && !i.aclOut && !!net.devs.R1.acls[name]; };

  return {
    subject: "Complaints after last night's access list change",
    brief: [
      `Two access lists on **${site}-R1** were edited in last night's change window, and the change record says only "tidied up the ACLs". The policy itself was fine, so do not redesign it: find what was changed and put it right.`,
      `**The policy.** ${cap(low)} hosts may use the internal server on **TCP port ${port}** and nothing else on the server LAN. They may reach nothing on the staff LAN, and they keep their Internet access. Staff are not restricted. From the Internet, only answers to conversations started inside may come in: the return traffic of TCP sessions, and ping replies.`,
      `**This morning's complaints.** ${complaints.join(" ")} Each complaint has one cause.`,
    ],
    details: [[`${cap(low)} LAN`, `${b}.0/24 on G0/1 (${gpc} is .10)`], ["Staff LAN", `${a}.0/24 on G0/0 (PC-STAFF is .10)`], ["Server LAN", `${s}.0/24 on G0/2`],
      ["Internal server", `${srv}, TCP ${port}: curl ${url}`], ["Internet test", `${web}: ping it, and curl http://${web}`], ["Access lists", `${G} on G0/1, ${W} on S0/0/0`]],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: `${site}-R1`, x: 480, y: 220, config },
        { name: "ISP", kind: "router", hostname: "ISP", x: 800, y: 220, locked: true, note: "Internet", config: [...ifc("s0/0/0", "203.0.113.1", M30), ...ifc("g0/0", "198.51.100.1", M24), "exit", "ip route 192.168.0.0 255.255.0.0 203.0.113.2", "ip route 10.0.0.0 255.0.0.0 203.0.113.2"] },
        pc("PC-STAFF", 180, 110, `${a}.10`, M24, `${a}.1`), pc(gpc, 180, 340, `${b}.10`, M24, `${b}.1`),
        { name: "SRV1", kind: "server", x: 480, y: 440, note: "Internal server", services: ["http", "https", "8080"], ip: { mode: "static", ip: srv, mask: M24, gw: `${s}.1` } },
        { name: "WEB", kind: "server", x: 800, y: 440, note: "A public website", services: ["http", "https"], ip: { mode: "static", ip: web, mask: M24, gw: "198.51.100.1" } },
      ],
      links: ["R1:g0/0 PC-STAFF", `R1:g0/1 ${gpc}`, "R1:g0/2 SRV1", "R1:s0/0/0 ISP:s0/0/0", "ISP:g0/0 WEB"],
    },
    objectives: [
      { text: `${gpc} can use the internal server on TCP ${port}`, check: C.tcp(gpc, srv, port) },
      { text: `${gpc} cannot ping the server or the staff PC`, check: C.all(C.noPing(gpc, srv), C.noPing(gpc, `${a}.10`), C.ifaceUp("R1", "g0/0"), C.ifaceUp("R1", "g0/2")) },
      { text: `${gpc} reaches the Internet: the ping and the web page`, check: C.all(C.ping(gpc, web), C.tcp(gpc, web, 80)) },
      { text: "PC-STAFF is unrestricted: it reaches the server and the Internet (ping and web page)", check: C.all(C.ping("PC-STAFF", srv), C.ping("PC-STAFF", web), C.tcp("PC-STAFF", web, 80)) },
      { text: "Nothing on the Internet can start a conversation with an inside host", check: C.all(C.noPing("WEB", `${a}.10`), C.noTcp("WEB", srv, port), C.ifaceUp("R1", "s0/0/0")) },
      { text: `${G} is applied inbound on G0/1 and ${W} inbound on S0/0/0, and nowhere else on those interfaces`, check: net => inboundOnly(net, "GigabitEthernet0/1", G) && inboundOnly(net, "Serial0/0/0", W) },
      { text: "The repaired configuration is saved", check: C.savedChanged("R1") },
    ],
    hints: [
      "Test before you read. From each PC, run the ping and the `curl` from the ticket and note what fails. Then run `show access-lists` on the router: the match counters show which line each test really hit. A line that should have matched but shows no matches has another line above it taking the traffic first.",
      "`show ip interface g0/1` and `show ip interface s0/0/0` name the list on each interface and its direction: `in` filters packets arriving there. Then read each list against the policy: the order (the first match wins), the port, the wildcard mask (a `host` in the output means the wildcard was 0.0.0.0), and whether the list ends by permitting what is left. For the Internet list, ask what the answer to a ping and the answer to a web request look like on their way back in.",
      [...guestFaults.map(f => guestInfo[f][1]), ...(wanInfo[wanFault] ? [wanInfo[wanFault][1]] : [])].join(" "),
    ],
    solution: [{ on: "R1", cmds: [...cfg(...fix), "write memory"] }],
  };
}

// ---------------------------------------------------------------- generators
const pickVlans = x => { const ids = x.sample(VLAN_IDS, 2).sort((m, n) => m - n), names = x.sample(VLAN_NAMES, 2); return ids.map((id, i) => ({ id, name: names[i] })); };
const CHANNEL_PORTS = [["g0/1", "g0/2"], ["fa0/7", "fa0/8"], ["fa0/5", "fa0/6"], ["fa0/6", "fa0/7", "fa0/8"], ["fa0/3", "fa0/4", "fa0/5"]];
const SKILLS = [
  // ---------- console and device basics
  {
    id: "cli-name", topic: "cli", name: "Name a device and save it", par: 180,
    gen(x) {
      const kind = x.pick(["switch", "router"]);
      const name = `${x.pick(SITES)}-${kind === "switch" ? "SW" : "R"}${x.int(1, 9)}`;
      const look = x.pick([["show running-config", "Display the running configuration", /^(do\s+)?sh\S*\s+ru/i], ["show version", "Display the software version", /^(do\s+)?sh\S*\s+ver/i], ["show ip interface brief", "List the interfaces and their status", /^(do\s+)?sh\S*\s+ip\s+int\S*\s+br/i]]);
      return {
        subject: `Name the new ${kind} ${name}`,
        brief: [`Another factory-fresh ${kind} is on your bench. Give it its name, take a look at it, and save the configuration so the name survives a power cycle.`],
        details: [["Hostname", name], ["Also run", look[0]]],
        topology: { devices: [{ name: "D1", kind, hostname: kind === "switch" ? "Switch" : "Router", x: 500, y: 180 }, pc("PC1", 500, 400, "192.168.1.10", M24, "192.168.1.1")], links: [`D1:${kind === "switch" ? "fa0/1" : "g0/0"} PC1`] },
        objectives: [
          { text: `Set the hostname to \`${name}\``, check: C.hostname("D1", name) },
          { text: look[1], check: C.ran("D1", look[2]) },
          { text: "Save the configuration to NVRAM", check: C.saved("D1") },
        ],
        hints: ["`enable`, then `configure terminal`, then the `hostname` command. Show commands and the save are privileged EXEC commands, so type `end` first or put `do` in front.",
          `\`hostname ${name}\`, \`end\`, \`${look[0]}\`, \`copy running-config startup-config\`.`],
        solution: [{ on: "D1", cmds: ["enable", "configure terminal", `hostname ${name}`, "end", look[0], "copy running-config startup-config", ""] }],
      };
    },
  },
  {
    id: "cli-setup", topic: "cli", name: "Name and secure a device", par: 300,
    gen(x) {
      const kind = x.pick(["switch", "router"]);
      const name = `${x.pick(SITES)}-${kind === "switch" ? "SW" : "R"}${x.int(1, 4)}`;
      const secret = x.pick(["Harb0ur!7", "K3strel-42", "Fr8-Yard!9", "N0c-Shift3", "Dockside77"]);
      const conPw = x.pick(["c0ns-41", "line-con9", "cab1e-22", "r4ck-con7"]);
      const word = x.pick(["authorized", "restricted", "monitored", "private"]);
      const extra = x.sample(["secret", "console", "banner", "encrypt"], x.int(2, 3));
      const has = k => extra.includes(k);
      return {
        subject: `Prepare ${name} before it ships`,
        brief: [`A factory-fresh ${kind} is on your bench, cabled to your laptop's console port. Give it its name, apply the baseline below and save it so the settings survive the trip.`],
        details: [["Hostname", name], has("secret") && ["Enable secret", secret], has("console") && ["Console password", `${conPw} (with login)`],
          has("encrypt") && ["Clear-text passwords", "must be obscured"], has("banner") && ["Banner", `must contain "${word}"`]].filter(Boolean),
        topology: { devices: [{ name: "D1", kind, hostname: kind === "switch" ? "Switch" : "Router", x: 500, y: 180 }, pc("PC1", 500, 400, "192.168.1.10", M24, "192.168.1.1")], links: [`D1:${kind === "switch" ? "fa0/1" : "g0/0"} PC1`] },
        objectives: [
          { text: `Set the hostname to \`${name}\``, check: C.hostname("D1", name) },
          has("secret") && { text: `Set the enable secret to \`${secret}\``, check: C.enableSecret("D1", secret) },
          has("console") && { text: `Console line: password \`${conPw}\` with \`login\``, check: C.linePassword("D1", "con", conPw) },
          has("encrypt") && { text: "Obscure clear-text passwords in the configuration", check: C.pwEncryption("D1") },
          has("banner") && { text: `Add a MOTD banner containing "${word}"`, check: C.bannerHas("D1", word) },
          { text: "Save the configuration", check: C.saved("D1") },
        ].filter(Boolean),
        hints: ["Everything here is a global configuration command except the console password, which lives under `line console 0`, and the save, which is a privileged EXEC command.",
          "Pattern: `enable secret X`, `line console 0` / `password X` / `login`, `service password-encryption`, `banner motd #text#`, then `end` and `copy running-config startup-config`."],
        solution: [{ on: "D1", cmds: ["enable", "configure terminal", `hostname ${name}`, ...(has("secret") ? [`enable secret ${secret}`] : []),
          ...(has("console") ? ["line console 0", `password ${conPw}`, "login", "exit"] : []), ...(has("encrypt") ? ["service password-encryption"] : []),
          ...(has("banner") ? [`banner motd #${cap(word)} access only#`] : []), "end", "copy running-config startup-config", ""] }],
      };
    },
  },

  // ---------- interfaces and addressing
  {
    id: "addr-lan", topic: "addressing", name: "Address a new LAN", par: 420,
    gen(x) {
      const len = x.pick([25, 26, 27, 28]), size = 2 ** (32 - len), mask = A(lenMask(len));
      const base = x.bool() ? ip4(192, 168, x.int(1, 250), 0) : ip4(10, x.int(0, 250), x.int(0, 250), 0);
      const net = base + x.int(0, 256 / size - 1) * size;
      const gwFirst = x.bool();
      const gw = gwFirst ? net + 1 : net + size - 2, host = gwFirst ? net + size - 2 : net + 1;
      const prn = net + x.int(2, size - 3);
      const dept = x.pick(["FIN", "HR", "OPS", "LAB", "QA"]), site = x.pick(SITES);
      return {
        subject: `${dept} has moved and has no network`,
        brief: [`The ${dept} team moved into a new area this morning. The cabling is done, but the gateway was never configured and the first PC has no address.`,
          `The area uses **${A(net)}/${len}**. The router takes the **${gwFirst ? "first" : "last"}** usable address and PC-${dept}1 takes the **${gwFirst ? "last" : "first"}** usable address. The printer is already set up correctly.`],
        details: [["Subnet", `${A(net)}/${len}`], ["Gateway", `${gwFirst ? "first" : "last"} usable address, on ${site}-R1 G0/0`], [`PC-${dept}1`, `${gwFirst ? "last" : "first"} usable address`], ["Printer", `${A(prn)} (already configured)`]],
        topology: {
          devices: [{ name: "R1", kind: "router", hostname: `${site}-R1`, x: 500, y: 110 }, { name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 500, y: 260 },
            { name: `PC-${dept}1`, kind: "pc", x: 300, y: 420 }, { name: "PRN1", kind: "server", x: 700, y: 420, note: "Printer", ip: { mode: "static", ip: A(prn), mask, gw: A(gw) } }],
          links: ["R1:g0/0 SW1:g0/1", `SW1:fa0/1 PC-${dept}1`, "SW1:fa0/2 PRN1"],
        },
        objectives: [
          { text: `${site}-R1 G0/0 has the ${gwFirst ? "first" : "last"} usable address of ${A(net)}/${len}`, check: C.ifaceIp("R1", "g0/0", A(gw), mask) },
          { text: "G0/0 is up/up", check: C.ifaceUp("R1", "g0/0") },
          { text: `PC-${dept}1 has the ${gwFirst ? "last" : "first"} usable address, the right mask and gateway`, check: C.hostIp(`PC-${dept}1`, A(host), mask, A(gw)) },
          { text: `PC-${dept}1 can ping its gateway and the printer`, check: C.all(C.ping(`PC-${dept}1`, A(gw)), C.ping(`PC-${dept}1`, A(prn))) },
          { text: "Save the router's configuration", check: C.saved("R1") },
        ],
        hints: [`A /${len} has a block size of ${size}. Find the multiple of ${size} at or below ${A(net).split(".")[3]}: that is the network. The broadcast is ${size - 1} above it.`,
          `The subnet runs from ${A(net)} to ${A(net + size - 1)}; usable hosts are ${A(net + 1)} to ${A(net + size - 2)}. The mask is ${mask}. Router interfaces need \`no shutdown\`.`],
        solution: [{ on: "R1", cmds: ["enable", "configure terminal", "interface g0/0", `ip address ${A(gw)} ${mask}`, "no shutdown", "end", "copy running-config startup-config", ""] },
          { pc: `PC-${dept}1`, ip: { mode: "static", ip: A(host), mask, gw: A(gw) } }],
      };
    },
  },
  {
    id: "addr-svi", topic: "addressing", name: "Give a switch a management address", par: 360,
    gen(x) {
      const o = x.int(1, 250), mo = x.int(1, 250), site = x.pick(SITES);
      const lan = ip4(192, 168, o, 0), gw = lan + x.pick([1, 254]), sw = lan + x.int(2, 20), adm = ip4(10, 0, mo, 0);
      return {
        subject: `ALERT: ${site}-SW1 not responding to polls`,
        brief: [`Monitoring cannot reach **${site}-SW1**: it was installed without a management address. Give it one on its VLAN 1 interface and make it reachable from the admin workstation, which is in another subnet behind the router.`],
        details: [["Management SVI", "interface Vlan1"], ["Address", `${A(sw)} /24`], ["Default gateway", `${A(gw)} (${site}-R1)`], ["Test from", `ADMIN-PC (${A(adm + 10)})`]],
        topology: {
          devices: [{ name: "R1", kind: "router", hostname: `${site}-R1`, x: 500, y: 130, config: [...ifc("g0/0", A(gw), M24), ...ifc("g0/1", A(adm + 1), M24)] },
            { name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 320, y: 290 }, pc("PC1", 320, 440, A(lan + 50), M24, A(gw)), pc("ADMIN-PC", 720, 290, A(adm + 10), M24, A(adm + 1))],
          links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC1", "R1:g0/1 ADMIN-PC"],
        },
        objectives: [
          { text: `Interface Vlan1 has ${A(sw)}/24 and is up/up`, check: C.all(C.ifaceIp("SW1", "vlan1", A(sw), M24), C.ifaceUp("SW1", "vlan1")) },
          { text: `The switch's default gateway is ${A(gw)}`, check: C.defaultGw("SW1", A(gw)) },
          { text: "ADMIN-PC can ping the switch", check: C.ping("ADMIN-PC", A(sw)) },
          { text: "Save the switch's configuration", check: C.saved("SW1") },
        ],
        hints: ["The address goes on `interface vlan 1`, which is shut down by default. A layer 2 switch also needs `ip default-gateway` to answer hosts outside its own subnet.",
          `\`interface vlan 1\`, \`ip address ${A(sw)} ${M24}\`, \`no shutdown\`, \`exit\`, \`ip default-gateway ${A(gw)}\`.`],
        solution: [{ on: "SW1", cmds: ["enable", "configure terminal", "interface vlan 1", `ip address ${A(sw)} ${M24}`, "no shutdown", "exit", `ip default-gateway ${A(gw)}`, "end", "copy running-config startup-config", ""] }],
      };
    },
  },
  {
    id: "addr-fault", topic: "addressing", name: "Find why a PC is cut off", par: 420,
    gen(x) {
      const a = x.int(1, 120), b = x.int(130, 250), site = x.pick(SITES);
      const lan = ip4(192, 168, a, 0), srv = ip4(192, 168, b, 0);
      const fault = x.pick(["pc-gw", "pc-mask", "r-shut", "sw-port", "r-srv", "r-ip"]);
      const pc1 = { mode: "static", ip: A(lan + 10), mask: fault === "pc-mask" ? "255.255.255.252" : M24, gw: A(lan + (fault === "pc-gw" ? 254 : 1)) };
      const r1 = [...ifc("g0/0", A(lan + (fault === "r-ip" ? 2 : 1)), M24), ...(fault === "r-shut" ? ["shutdown"] : []), ...ifc("g0/1", A(srv + 1), M24), ...(fault === "r-srv" ? ["shutdown"] : [])];
      const fix = {
        "pc-gw": [{ pc: "PC1", ip: { mode: "static", ip: A(lan + 10), mask: M24, gw: A(lan + 1) } }],
        "pc-mask": [{ pc: "PC1", ip: { mode: "static", ip: A(lan + 10), mask: M24, gw: A(lan + 1) } }],
        "r-shut": [{ on: "R1", cmds: cfg("interface g0/0", "no shutdown") }],
        "sw-port": [{ on: "SW1", cmds: cfg("interface fa0/1", "no shutdown") }],
        "r-srv": [{ on: "R1", cmds: cfg("interface g0/1", "no shutdown") }],
        "r-ip": [{ on: "R1", cmds: cfg("interface g0/0", `ip address ${A(lan + 1)} ${M24}`) }],
      }[fault];
      const onlyPc1 = ["pc-gw", "pc-mask", "sw-port"].includes(fault);
      return {
        subject: "PC1 cannot reach the file server",
        brief: [`The user on **PC1** cannot open anything on the file server. ${onlyPc1 ? "The colleague on PC2, at the next desk, works normally." : "PC2 at the next desk has the same problem."}`,
          "There is exactly one fault. Compare what you see with the documented design below, find it and fix it. It may be on the PC, the switch or the router."],
        details: [["User LAN", `${A(lan)}/24, gateway ${A(lan + 1)} on ${site}-R1 G0/0`], ["PC1 / PC2", `${A(lan + 10)} / ${A(lan + 11)}`], ["Server LAN", `${A(srv)}/24, gateway ${A(srv + 1)} on G0/1`], ["File server", A(srv + 10)]],
        topology: {
          devices: [{ name: "R1", kind: "router", hostname: `${site}-R1`, x: 500, y: 120, config: r1 },
            { name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 300, y: 270, config: fault === "sw-port" ? ["interface fa0/1", "shutdown"] : [] },
            { name: "PC1", kind: "pc", x: 180, y: 430, ip: pc1 }, pc("PC2", 420, 430, A(lan + 11), M24, A(lan + 1)),
            { name: "SRV1", kind: "server", x: 760, y: 270, note: "File server", services: ["http"], ip: { mode: "static", ip: A(srv + 10), mask: M24, gw: A(srv + 1) } }],
          links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC1", "SW1:fa0/2 PC2", "R1:g0/1 SRV1"],
        },
        objectives: [
          { text: `PC1 can ping the file server (${A(srv + 10)})`, check: C.ping("PC1", A(srv + 10)) },
          { text: "PC2 can ping the file server", check: C.ping("PC2", A(srv + 10)) },
          { text: "PC1 and PC2 can ping each other", check: C.ping("PC1", A(lan + 11)) },
        ],
        hints: ["Start at the PC: `ipconfig`, then ping your own gateway. If the gateway does not answer, look at the PC's settings, its switch port and the router interface, in that order.",
          "`show ip interface brief` on the router and `show interfaces status` on the switch show at a glance which interface is down and what address the gateway really has."],
        solution: fix,
      };
    },
  },

  // ---------- VLANs and trunks
  {
    id: "vlan-access", topic: "vlans", name: "Create VLANs and assign ports", par: 420,
    gen(x) {
      const [v1, v2] = x.sample(VLAN_IDS, 2).sort((p, q) => p - q), [n1, n2] = x.sample(VLAN_NAMES, 2);
      const ports = x.sample([1, 2, 3, 4, 5, 6, 7, 8], 4);
      const p1 = ports.slice(0, 2).sort(), p2 = ports.slice(2).sort(), site = x.pick(SITES);
      const host = (v, n) => `192.168.${v}.${10 + n}`;
      const devs = [{ name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 500, y: 150 },
        pc("PC-A1", 170, 400, host(v1, 1), M24), pc("PC-A2", 390, 400, host(v1, 2), M24), pc("PC-B1", 610, 400, host(v2, 1), M24), pc("PC-B2", 830, 400, host(v2, 2), M24)];
      const port = p => [`interface fa0/${p}`, "switchport mode access"];
      return {
        subject: `Separate ${n1} and ${n2} on ${site}-SW1`,
        brief: [`Two teams share one switch and see each other's broadcasts. Put each team in its own VLAN: create and name the VLANs, then make each team's ports access ports in the right one.`],
        details: [[`VLAN ${v1}`, `${n1} - Fa0/${p1[0]} and Fa0/${p1[1]} (PC-A1, PC-A2)`], [`VLAN ${v2}`, `${n2} - Fa0/${p2[0]} and Fa0/${p2[1]} (PC-B1, PC-B2)`]],
        topology: { devices: devs, links: [`SW1:fa0/${p1[0]} PC-A1`, `SW1:fa0/${p1[1]} PC-A2`, `SW1:fa0/${p2[0]} PC-B1`, `SW1:fa0/${p2[1]} PC-B2`] },
        objectives: [
          { text: `VLAN ${v1} exists and is named \`${n1}\``, check: C.vlan("SW1", v1, n1) },
          { text: `VLAN ${v2} exists and is named \`${n2}\``, check: C.vlan("SW1", v2, n2) },
          { text: `Fa0/${p1[0]} and Fa0/${p1[1]} are access ports in VLAN ${v1}`, check: C.accessVlan("SW1", p1.map(p => `fa0/${p}`), v1) },
          { text: `Fa0/${p2[0]} and Fa0/${p2[1]} are access ports in VLAN ${v2}`, check: C.accessVlan("SW1", p2.map(p => `fa0/${p}`), v2) },
          { text: "Each PC can still ping its teammate", check: C.all(C.ping("PC-A1", host(v1, 2)), C.ping("PC-B1", host(v2, 2))) },
        ],
        hints: ["`vlan <id>` creates a VLAN and opens a sub-mode where `name` works. Each port needs `switchport mode access` and `switchport access vlan <id>`.",
          "`show vlan brief` lists each VLAN with the ports in it. The ports are not consecutive here, so configure them one at a time or use `interface range fa0/x , fa0/y`."],
        solution: [{ on: "SW1", cmds: cfg(`vlan ${v1}`, `name ${n1}`, `vlan ${v2}`, `name ${n2}`, "exit", ...p1.flatMap(p => [...port(p), `switchport access vlan ${v1}`]), ...p2.flatMap(p => [...port(p), `switchport access vlan ${v2}`])) }],
      };
    },
  },
  {
    id: "vlan-trunk", topic: "vlans", name: "Trunk two switches together", par: 540,
    gen(x) {
      const [v1, v2] = x.sample(VLAN_IDS, 2).sort((p, q) => p - q), [n1, n2] = x.sample(VLAN_NAMES, 2);
      const up = x.pick(["g0/1", "g0/2"]), U = up.toUpperCase(), site = x.pick(SITES);
      const host = (v, n) => `192.168.${v}.${10 + n}`;
      const access = [`vlan ${v1}`, `name ${n1}`, `vlan ${v2}`, `name ${n2}`, "interface fa0/1", "switchport mode access", `switchport access vlan ${v1}`, "interface fa0/2", "switchport mode access", `switchport access vlan ${v2}`];
      const trunk = [`interface ${up}`, "switchport mode trunk", `switchport trunk allowed vlan ${v1},${v2}`];
      return {
        subject: `New switch ${site}-SW2: users can't reach their teams`,
        brief: [`A second switch, **${site}-SW2**, was racked and uplinked to ${site}-SW1 on ${U}. Its users belong to the same two VLANs as the users on SW1 but cannot reach them.`,
          `SW1 already has the VLANs and access ports. Build the same on SW2, then turn ${U} into an 802.1Q trunk on both switches that carries **only** VLANs ${v1} and ${v2}.`],
        details: [["Uplink", `${U} on both switches`], [`${site}-SW2 Fa0/1`, `VLAN ${v1} (${n1})`], [`${site}-SW2 Fa0/2`, `VLAN ${v2} (${n2})`], ["Allowed on the trunk", `${v1} and ${v2} only`]],
        topology: {
          devices: [{ name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 280, y: 170, config: access }, { name: "SW2", kind: "switch", hostname: `${site}-SW2`, x: 720, y: 170 },
            pc("PC-A1", 160, 410, host(v1, 1), M24), pc("PC-B1", 400, 410, host(v2, 1), M24), pc("PC-A2", 600, 410, host(v1, 2), M24), pc("PC-B2", 840, 410, host(v2, 2), M24)],
          links: [`SW1:${up} SW2:${up}`, "SW1:fa0/1 PC-A1", "SW1:fa0/2 PC-B1", "SW2:fa0/1 PC-A2", "SW2:fa0/2 PC-B2"],
        },
        objectives: [
          { text: `SW2 has VLAN ${v1} (${n1}) and VLAN ${v2} (${n2})`, check: C.all(C.vlan("SW2", v1, n1), C.vlan("SW2", v2, n2)) },
          { text: `SW2 Fa0/1 is an access port in VLAN ${v1}, Fa0/2 in VLAN ${v2}`, check: C.all(C.accessVlan("SW2", ["fa0/1"], v1), C.accessVlan("SW2", ["fa0/2"], v2)) },
          { text: `${U} is a trunk on both switches, allowing only ${v1} and ${v2}`, check: C.all(C.trunk("SW1", up), C.trunk("SW2", up), C.trunkAllows("SW1", up, [v1, v2]), C.trunkAllows("SW2", up, [v1, v2])) },
          { text: "PC-A1 can ping PC-A2, and PC-B1 can ping PC-B2", check: C.all(C.ping("PC-A1", host(v1, 2)), C.ping("PC-B1", host(v2, 2))) },
        ],
        hints: ["A switch only forwards VLANs it knows, so SW2 needs both VLANs created. Both ends of the uplink must be trunks.",
          `On ${U} of each switch: \`switchport mode trunk\` and \`switchport trunk allowed vlan ${v1},${v2}\`. Check with \`show interfaces trunk\`.`],
        solution: [{ on: "SW2", cmds: cfg(...access, ...trunk) }, { on: "SW1", cmds: cfg(...trunk) }],
      };
    },
  },
  {
    id: "vlan-fault", topic: "vlans", name: "Fix a broken VLAN path", par: 480,
    gen(x) {
      const [v1, v2] = x.sample(VLAN_IDS, 2).sort((p, q) => p - q), [n1, n2] = x.sample(VLAN_NAMES, 2), site = x.pick(SITES);
      const fault = x.pick(["allowed", "wrong-vlan", "no-trunk", "no-vlan", "port-shut"]);
      const host = (v, n) => `192.168.${v}.${10 + n}`;
      const base = (f1, f2, trunk) => [`vlan ${v1}`, `name ${n1}`, `vlan ${v2}`, `name ${n2}`, "interface fa0/1", "switchport mode access", `switchport access vlan ${f1}`,
        "interface fa0/2", "switchport mode access", `switchport access vlan ${f2}`, "interface g0/1", ...trunk];
      const good = ["switchport mode trunk", `switchport trunk allowed vlan ${v1},${v2}`];
      // an uplink merely left at its default would still negotiate a trunk with the far end (DTP), so this fault forces it to access
      const sw1 = base(v1, v2, fault === "no-trunk" ? ["switchport mode access", `switchport trunk allowed vlan ${v1},${v2}`] : good);
      const sw2 = [...base(v1, fault === "wrong-vlan" ? v1 : v2, fault === "allowed" ? ["switchport mode trunk", `switchport trunk allowed vlan ${v1}`] : good),
        ...(fault === "no-vlan" ? ["exit", `no vlan ${v2}`] : []), ...(fault === "port-shut" ? ["interface fa0/1", "shutdown"] : [])];
      const fix = {
        allowed: [{ on: "SW2", cmds: cfg("interface g0/1", `switchport trunk allowed vlan add ${v2}`) }],
        "wrong-vlan": [{ on: "SW2", cmds: cfg("interface fa0/2", `switchport access vlan ${v2}`) }],
        "no-trunk": [{ on: "SW1", cmds: cfg("interface g0/1", "switchport mode trunk") }],
        "no-vlan": [{ on: "SW2", cmds: cfg(`vlan ${v2}`, `name ${n2}`) }],
        "port-shut": [{ on: "SW2", cmds: cfg("interface fa0/1", "no shutdown") }],
      }[fault];
      return {
        subject: "Users on the second switch cannot reach their team",
        brief: [`After last night's change window, some users on **${site}-SW2** can no longer reach teammates on ${site}-SW1. Nobody recorded what was changed.`,
          "There is exactly one fault, on one of the two switches. Use the show commands to find where the path between teammates breaks, then fix it."],
        details: [[`VLAN ${v1} ${n1}`, "Fa0/1 on both switches (PC-A1, PC-A2)"], [`VLAN ${v2} ${n2}`, "Fa0/2 on both switches (PC-B1, PC-B2)"], ["Uplink", `G0/1 on both switches: trunk, VLANs ${v1} and ${v2}`]],
        topology: {
          devices: [{ name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 280, y: 170, config: sw1 }, { name: "SW2", kind: "switch", hostname: `${site}-SW2`, x: 720, y: 170, config: sw2 },
            pc("PC-A1", 160, 410, host(v1, 1), M24), pc("PC-B1", 400, 410, host(v2, 1), M24), pc("PC-A2", 600, 410, host(v1, 2), M24), pc("PC-B2", 840, 410, host(v2, 2), M24)],
          links: ["SW1:g0/1 SW2:g0/1", "SW1:fa0/1 PC-A1", "SW1:fa0/2 PC-B1", "SW2:fa0/1 PC-A2", "SW2:fa0/2 PC-B2"],
        },
        objectives: [
          { text: `PC-A1 can ping PC-A2 (VLAN ${v1})`, check: C.ping("PC-A1", host(v1, 2)) },
          { text: `PC-B1 can ping PC-B2 (VLAN ${v2})`, check: C.ping("PC-B1", host(v2, 2)) },
        ],
        hints: ["Ping from each PC first to see which VLAN is affected. Then check four things along the path: the access port's VLAN, whether the VLAN exists on each switch, whether the uplink is really trunking, and the allowed list.",
          "`show vlan brief` (does the VLAN exist, is the port in it?), `show interfaces trunk` (is G0/1 listed at all, and which VLANs are allowed?) and `show interfaces status` (is a port disabled?) on both switches."],
        solution: fix,
      };
    },
  },

  // ---------- inter-VLAN routing
  {
    id: "roas", topic: "intervlan", name: "Route between VLANs on one link", par: 540,
    gen(x) {
      const n = x.pick([2, 2, 3]), vids = x.sample(VLAN_IDS, n).sort((p, q) => p - q), names = x.sample(VLAN_NAMES, n), site = x.pick(SITES), gwHost = x.pick([1, 254]);
      const sub = v => `192.168.${v}`;
      const pcs = vids.map((v, i) => pc(`PC-${names[i]}`, n === 2 ? 300 + i * 400 : 200 + i * 300, 420, `${sub(v)}.11`, M24, `${sub(v)}.${gwHost}`));
      const sw = vids.flatMap((v, i) => [`vlan ${v}`, `name ${names[i]}`, `interface fa0/${i + 1}`, "switchport mode access", `switchport access vlan ${v}`]);
      return {
        subject: `${names[0]} needs to reach ${names[n - 1]}`,
        brief: [`The VLANs on ${site}-SW1 are isolated from each other, and now the teams need to exchange traffic. ${site}-R1 has one port cabled to the switch.`,
          `Use 802.1Q subinterfaces on that single link, one per VLAN, so the router becomes the default gateway for each. The PCs already point at the .${gwHost} address of their subnet.`],
        details: [["Trunk", `${site}-SW1 G0/1 to ${site}-R1 G0/0`], ...vids.map((v, i) => [`G0/0.${v}`, `VLAN ${v} ${names[i]} - ${sub(v)}.${gwHost} /24`])],
        topology: {
          devices: [{ name: "R1", kind: "router", hostname: `${site}-R1`, x: 500, y: 90 }, { name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 500, y: 250, config: sw }, ...pcs],
          links: ["R1:g0/0 SW1:g0/1", ...pcs.map((p, i) => `SW1:fa0/${i + 1} ${p.name}`)],
        },
        objectives: [
          { text: `${site}-SW1 G0/1 is a trunk and ${site}-R1 G0/0 is up`, check: C.all(C.trunk("SW1", "g0/1"), C.ifaceUp("R1", "g0/0")) },
          ...vids.map(v => ({ text: `G0/0.${v} tags VLAN ${v} and has ${sub(v)}.${gwHost}/24`, check: C.all(C.dot1q("R1", `g0/0.${v}`, v), C.ifaceIp("R1", `g0/0.${v}`, `${sub(v)}.${gwHost}`, M24)) })),
          { text: `${pcs[0].name} can ping ${pcs[n - 1].name}`, check: C.ping(pcs[0].name, `${sub(vids[n - 1])}.11`) },
          { text: "Save the router's configuration", check: C.saved("R1") },
        ],
        hints: ["Three pieces: the switch port facing the router must be a trunk, the physical router port needs `no shutdown` (and no IP address), and each VLAN needs a subinterface.",
          `For each VLAN: \`interface g0/0.<vlan>\`, \`encapsulation dot1q <vlan>\`, then the IP address. The encapsulation must come before the address.`],
        solution: [{ on: "SW1", cmds: cfg("interface g0/1", "switchport mode trunk") },
          { on: "R1", cmds: ["enable", "configure terminal", "interface g0/0", "no shutdown", ...vids.flatMap(v => [`interface g0/0.${v}`, `encapsulation dot1q ${v}`, `ip address ${sub(v)}.${gwHost} ${M24}`]), "end", "write memory"] }],
      };
    },
  },

  // ---------- port security
  {
    id: "port-sec", topic: "l2security", name: "Lock down access ports", par: 480,
    gen(x) {
      const k = x.pick([2, 3]), max = x.pick([1, 2, 3]), mode = x.pick(["restrict", "protect", "shutdown"]), edge = x.bool(0.6), site = x.pick(SITES);
      const secure = Array.from({ length: k }, (_, i) => `fa0/${i + 1}`), unused = Array.from({ length: 8 - k }, (_, i) => `fa0/${k + 1 + i}`);
      const why = { restrict: "drop frames from other devices and log the attempt, without shutting the port", protect: "silently drop frames from other devices, without shutting the port or logging", shutdown: "disable the port when another device appears" }[mode];
      const net = `192.168.${x.int(30, 99)}`;
      const pcs = secure.map((p, i) => pc(`KIOSK${i + 1}`, k === 2 ? 300 + i * 400 : 200 + i * 300, 420, `${net}.${11 + i}`, M24, `${net}.1`));
      return {
        subject: `Harden the public ports on ${site}-SW1`,
        brief: [`The ports in the public area of ${site} need port security. Allow at most **${max}** MAC address${max > 1 ? "es" : ""} per port, learned automatically and kept (sticky). When the limit is broken the switch must ${why}.`,
          `${edge ? "Treat these ports as edge ports for spanning tree (PortFast and BPDU Guard). " : ""}Shut down every unused FastEthernet port.`],
        details: [["Secure ports", `Fa0/1 to Fa0/${k}`], ["Maximum MAC addresses", `${max}, sticky`], ["Violation mode", mode], edge && ["Edge protection", "PortFast + BPDU Guard"], ["Unused ports", `Fa0/${k + 1} to Fa0/8: shut down`]].filter(Boolean),
        topology: {
          devices: [{ name: "R1", kind: "router", hostname: `${site}-R1`, x: 500, y: 90, config: ifc("g0/0", `${net}.1`, M24) }, { name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 500, y: 250 }, ...pcs],
          links: ["R1:g0/0 SW1:g0/1", ...pcs.map((p, i) => `SW1:${secure[i]} ${p.name}`)],
        },
        objectives: [
          { text: `Fa0/1 to Fa0/${k} are static access ports with port security on`, check: C.all(net2 => secure.every(p => net2.devs.SW1.ifaces[`FastEthernet0/${p.split("/")[1]}`].sw.mode === "access"), C.portSecurity("SW1", secure, {})) },
          { text: `Maximum ${max} sticky MAC address${max > 1 ? "es" : ""} per port`, check: C.portSecurity("SW1", secure, { max, sticky: true }) },
          { text: `The violation mode is \`${mode}\``, check: C.portSecurity("SW1", secure, { violation: mode }) },
          edge && { text: "PortFast and BPDU Guard are enabled on the secure ports", check: C.edgePort("SW1", secure) },
          { text: `Fa0/${k + 1} to Fa0/8 are shut down`, check: C.ifaceShut("SW1", unused) },
          { text: "The connected devices still reach their gateway", check: C.all(...pcs.map(p => C.ping(p.name, `${net}.1`))) },
          { text: "Save the configuration", check: C.saved("SW1") },
        ].filter(Boolean),
        hints: ["Port security is refused on a dynamic port, so `switchport mode access` comes first. The bare `switchport port-security` line turns the feature on; the other lines only set options.",
          `\`interface range fa0/1 - ${k}\`, then \`switchport port-security maximum ${max}\`, \`switchport port-security violation ${mode}\`, \`switchport port-security mac-address sticky\`. Unused ports: \`interface range fa0/${k + 1} - 8\` and \`shutdown\`.`],
        solution: [{ on: "SW1", cmds: ["enable", "configure terminal", `interface range fa0/1 - ${k}`, "switchport mode access", "switchport port-security", `switchport port-security maximum ${max}`, `switchport port-security violation ${mode}`,
          "switchport port-security mac-address sticky", ...(edge ? ["spanning-tree portfast", "spanning-tree bpduguard enable"] : []), `interface range fa0/${k + 1} - 8`, "shutdown", "end", "write memory"] }],
      };
    },
  },

  // ---------- static routing
  {
    id: "static-chain", topic: "static", name: "Route a chain of routers by hand", par: 600,
    gen(x) {
      const n = x.pick([2, 3, 3]), lans = x.sample(Array.from({ length: 16 }, (_, i) => 16 + i), n), l = x.sample(Array.from({ length: 60 }, (_, i) => i + 1), n - 1);
      const lan = i => `172.${lans[i]}.0`, link = i => `10.0.${l[i]}`;
      const devs = [], links = [], sol = [];
      for (let i = 0; i < n; i++) {
        const c = [...ifc("g0/0", `${lan(i)}.1`, M24)];
        if (i > 0) c.push(...ifc("g0/1", `${link(i - 1)}.2`, M30));
        if (i < n - 1) c.push(...ifc(i === 0 ? "g0/1" : "g0/2", `${link(i)}.1`, M30));
        const px = n === 2 ? 280 + i * 440 : 200 + i * 300;
        devs.push({ name: `R${i + 1}`, kind: "router", hostname: `R${i + 1}`, x: px, y: 170, config: c }, pc(`PC${i + 1}`, px, 410, `${lan(i)}.10`, M24, `${lan(i)}.1`));
        links.push(`R${i + 1}:g0/0 PC${i + 1}`);
        if (i < n - 1) links.push(`R${i + 1}:${i === 0 ? "g0/1" : "g0/2"} R${i + 2}:g0/1`);
        const routes = [];
        for (let j = 0; j < n; j++) if (j !== i) routes.push(`ip route ${lan(j)}.0 ${M24} ${j < i ? `${link(i - 1)}.1` : `${link(i)}.2`}`);
        sol.push({ on: `R${i + 1}`, cmds: cfg(...routes) });
      }
      const names = Array.from({ length: n }, (_, i) => `R${i + 1}`);
      return {
        subject: "The site links are up but nothing routes",
        brief: [`${n === 2 ? "Two" : "Three"} routers are cabled in a line and every interface is addressed and up, but each router only knows its own connected networks.`,
          "No routing protocol is approved yet. Add the **static routes** each router needs so that every LAN reaches every other LAN. A reply needs a route back."],
        details: [...names.map((r, i) => [`${r} LAN`, `${lan(i)}.0/24 (PC${i + 1} is .10)`]), ...l.map((_, i) => [`R${i + 1} - R${i + 2} link`, `${link(i)}.0/30 (R${i + 1} is .1, R${i + 2} is .2)`])],
        topology: { devices: devs, links },
        objectives: [
          ...Array.from({ length: n - 1 }, (_, i) => ({ text: `PC${i + 1} can ping PC${i + 2}`, check: C.ping(`PC${i + 1}`, `${lan(i + 1)}.10`) })),
          n === 3 && { text: "PC1 can ping PC3 (two router hops away)", check: C.ping("PC1", `${lan(2)}.10`) },
          { text: "Only static routing is used", check: C.all(C.noOspf(names), net => names.every(r => net.devs[r].routes.length > 0)) },
        ].filter(Boolean),
        hints: ["Run `show ip route` on each router and list which LANs are missing. Each missing LAN needs `ip route <network> <mask> <next-hop>`.",
          "The next hop is always the neighbour's address on the link you share with it. A router in the middle needs a route in each direction."],
        solution: sol,
      };
    },
  },
  {
    id: "static-default", topic: "static", name: "Give a stub site a way out", par: 540,
    gen(x) {
      const b = x.int(20, 120), h = x.int(130, 250), w = x.int(1, 250), blk = x.int(1, 30) * 4, site = x.pick(SITES);
      const br = `192.168.${b}`, hq = `192.168.${h}`, wan = `10.${w}.0`, isp = `203.0.113`;
      return {
        subject: `${site} branch has no Internet`,
        brief: [`The ${site} branch reaches nothing beyond its own LAN, and HQ lost its Internet access after an ISP change.`,
          "The branch has one way out, through HQ. HQ sends everything it does not know to the ISP. Use **default routes** where they fit, and give HQ a route back to the branch LAN. The ISP router is not ours and already routes our address space back to HQ."],
        details: [["Branch LAN", `${br}.0/24`], ["BR-R1 to HQ-R1", `${wan}.0/30 (HQ is .1, BR is .2)`], ["HQ LAN", `${hq}.0/24`], ["HQ-R1 to ISP", `${isp}.${blk}/30 (ISP is .${blk + 1}, HQ is .${blk + 2})`], ["Internet test", "8.8.8.8"]],
        topology: {
          devices: [{ name: "BR-R1", kind: "router", hostname: "BR-R1", x: 200, y: 170, config: [...ifc("g0/0", `${br}.1`, M24), ...ifc("g0/1", `${wan}.2`, M30)] },
            { name: "HQ-R1", kind: "router", hostname: "HQ-R1", x: 500, y: 170, config: [...ifc("g0/0", `${hq}.1`, M24), ...ifc("g0/1", `${wan}.1`, M30), ...ifc("g0/2", `${isp}.${blk + 2}`, M30)] },
            ISP(800, 170, [...ifc("g0/0", `${isp}.${blk + 1}`, M30), `ip route 192.168.0.0 255.255.0.0 ${isp}.${blk + 2}`, `ip route 10.0.0.0 255.0.0.0 ${isp}.${blk + 2}`]),
            pc("PC-BR", 200, 410, `${br}.10`, M24, `${br}.1`), pc("PC-HQ", 500, 410, `${hq}.10`, M24, `${hq}.1`)],
          links: ["BR-R1:g0/1 HQ-R1:g0/1", "HQ-R1:g0/2 ISP:g0/0", "BR-R1:g0/0 PC-BR", "HQ-R1:g0/0 PC-HQ"],
        },
        objectives: [
          { text: "BR-R1 has a default route toward HQ", check: C.hasRoute("BR-R1", "0.0.0.0/0", "S") },
          { text: "HQ-R1 has a default route toward the ISP", check: C.hasRoute("HQ-R1", "0.0.0.0/0", "S") },
          { text: "PC-HQ can ping 8.8.8.8", check: C.ping("PC-HQ", "8.8.8.8") },
          { text: "PC-BR can ping 8.8.8.8 and PC-HQ", check: C.all(C.ping("PC-BR", "8.8.8.8"), C.ping("PC-BR", `${hq}.10`)) },
        ],
        hints: ["A default route is a static route to `0.0.0.0 0.0.0.0`. The next hop must be an address on a directly connected link.",
          "The branch and HQ each need a default route. HQ also needs a specific route to the branch LAN, otherwise replies for the branch follow HQ's default out to the ISP."],
        solution: [{ on: "BR-R1", cmds: cfg(`ip route 0.0.0.0 0.0.0.0 ${wan}.1`) }, { on: "HQ-R1", cmds: cfg(`ip route 0.0.0.0 0.0.0.0 ${isp}.${blk + 1}`, `ip route ${br}.0 ${M24} ${wan}.2`) }],
      };
    },
  },

  // ---------- OSPF
  {
    id: "ospf-build", topic: "ospf", name: "Bring up OSPF", par: 720,
    gen(x) {
      const tri = x.bool(), pid = x.pick([1, 10, 50, 100]), lans = x.sample(Array.from({ length: 150 }, (_, i) => i + 1), 3), l = x.sample(Array.from({ length: 200 }, (_, i) => i + 1), 3);
      const lan = i => `10.${lans[i]}.0`, link = k => `10.255.${l[k]}`;
      // links: 0 = R1-R2, 1 = R2-R3, 2 = R1-R3 (triangle only)
      const ports = [[["g0/1", 0, 1]], [["g0/1", 0, 2], ["g0/2", 1, 1]], [["g0/1", 1, 2]]];
      if (tri) { ports[0].push(["g0/2", 2, 1]); ports[2] = [["g0/1", 2, 2], ["g0/2", 1, 2]]; }
      const pos = tri ? [[500, 90], [240, 300], [760, 300]] : [[200, 170], [500, 170], [800, 170]];
      const pcPos = tri ? [[760, 90], [110, 450], [890, 450]] : [[200, 410], [500, 410], [800, 410]];
      const devs = [], sol = [];
      for (let i = 0; i < 3; i++) {
        devs.push({ name: `R${i + 1}`, kind: "router", hostname: `R${i + 1}`, x: pos[i][0], y: pos[i][1], config: [...ifc("g0/0", `${lan(i)}.1`, M24), ...ports[i].flatMap(([p, k, h]) => ifc(p, `${link(k)}.${h}`, M30))] },
          pc(`PC${i + 1}`, pcPos[i][0], pcPos[i][1], `${lan(i)}.10`, M24, `${lan(i)}.1`));
        sol.push({ on: `R${i + 1}`, cmds: cfg(`router ospf ${pid}`, `router-id ${i + 1}.${i + 1}.${i + 1}.${i + 1}`, `network ${lan(i)}.0 0.0.0.255 area 0`, ...ports[i].map(([, k]) => `network ${link(k)}.0 0.0.0.3 area 0`), "passive-interface g0/0") });
      }
      const links = ["R1:g0/1 R2:g0/1", tri ? "R1:g0/2 R3:g0/1" : null, `R2:g0/2 R3:${tri ? "g0/2" : "g0/1"}`, "R1:g0/0 PC1", "R2:g0/0 PC2", "R3:g0/0 PC3"].filter(Boolean);
      const nb = tri ? [2, 2, 2] : [1, 2, 1];
      return {
        subject: `Enable OSPF across the three sites${tri ? " (ring)" : ""}`,
        brief: [`Change control approved OSPF for the three sites, which are cabled ${tri ? "in a ring, so there are two paths between any pair" : "in a line"}. Every interface is addressed and up.`,
          `Enable **OSPF process ${pid}** in **area 0** on all three routers with the router IDs below, and advertise every connected network. The LAN interfaces (G0/0) must be advertised but must not send hellos.`],
        details: [["Process / area", `${pid} / 0`], ["Router IDs", "R1 1.1.1.1, R2 2.2.2.2, R3 3.3.3.3"], ["LANs (G0/0)", [0, 1, 2].map(i => `${lan(i)}.0/24`).join(", ")],
          ["R1 - R2", `${link(0)}.0/30`], ["R2 - R3", `${link(1)}.0/30`], tri && ["R1 - R3", `${link(2)}.0/30`], ["Wildcards", "/24 = 0.0.0.255, /30 = 0.0.0.3"]].filter(Boolean),
        topology: { devices: devs, links },
        objectives: [
          { text: "Router IDs are 1.1.1.1, 2.2.2.2 and 3.3.3.3", check: C.all(C.routerId("R1", "1.1.1.1"), C.routerId("R2", "2.2.2.2"), C.routerId("R3", "3.3.3.3")) },
          { text: `Every adjacency is FULL (R1 has ${nb[0]}, R2 has ${nb[1]}, R3 has ${nb[2]})`, check: C.all(C.ospfNeighbors("R1", nb[0]), C.ospfNeighbors("R2", nb[1]), C.ospfNeighbors("R3", nb[2])) },
          { text: "All three LAN interfaces are advertised and passive", check: C.all(C.ospfPassive("R1", "g0/0"), C.ospfPassive("R2", "g0/0"), C.ospfPassive("R3", "g0/0")) },
          { text: "PC1 can ping PC2 and PC3", check: C.all(C.ping("PC1", `${lan(1)}.10`), C.ping("PC1", `${lan(2)}.10`)) },
        ],
        hints: [`Start each router with \`router ospf ${pid}\` and \`router-id\`. One \`network <address> <wildcard> area 0\` line per connected network, then \`passive-interface g0/0\`.`,
          "Watch for the `%OSPF-5-ADJCHG ... to FULL` message. If a neighbour does not come up, compare both ends: `show ip protocols` lists the networks each router advertises."],
        solution: sol,
      };
    },
  },
  {
    id: "ospf-tune", topic: "ospf", name: "Tune OSPF paths and the designated router", par: 900,
    gen(x) {
      const [office, servers] = x.sample(Array.from({ length: 150 }, (_, i) => i + 1), 2), links = x.sample(Array.from({ length: 200 }, (_, i) => i + 1), 2);
      return ospfTuneLab({ site: x.pick(SITES), office, servers, core: x.int(0, 50), links, steer: x.pick(["ref", "cost"]), ref: x.pick([1000, 10000]), cost: x.pick([50, 100, 200]), dr: x.pick(["CORE1", "CORE2"]) });
    },
  },
  {
    id: "ospf-fault", topic: "ospf", name: "Find why OSPF neighbours are down", par: 720,
    gen(x) {
      const lans = x.sample(Array.from({ length: 150 }, (_, i) => i + 1), 3), l = x.sample(Array.from({ length: 200 }, (_, i) => i + 1), 2);
      const lan = i => `10.${lans[i]}.0`, link = k => `10.255.${l[k]}`;
      const faults = x.sample(["area", "passive", "no-lan", "hello", "dup-rid", "shut"], x.pick([1, 1, 2]));
      const has = f => faults.includes(f);
      const r1 = [...ifc("g0/0", `${lan(0)}.1`, M24), ...ifc("g0/1", `${link(0)}.1`, M30), ...(has("hello") ? ["ip ospf hello-interval 5"] : []),
        "router ospf 1", "router-id 1.1.1.1", `network ${link(0)}.0 0.0.0.3 area 0`, ...(has("no-lan") ? [] : [`network ${lan(0)}.0 0.0.0.255 area 0`]), "passive-interface g0/0"];
      const r2 = [...ifc("g0/0", `${lan(1)}.1`, M24), ...ifc("g0/1", `${link(0)}.2`, M30), ...ifc("g0/2", `${link(1)}.1`, M30), ...(has("shut") ? ["shutdown"] : []),
        "router ospf 1", "router-id 2.2.2.2", `network ${lan(1)}.0 0.0.0.255 area 0`, `network ${link(0)}.0 0.0.0.3 area 0`, `network ${link(1)}.0 0.0.0.3 area ${has("area") ? 1 : 0}`, "passive-interface g0/0"];
      const r3 = [...ifc("g0/0", `${lan(2)}.1`, M24), ...ifc("g0/1", `${link(1)}.2`, M30),
        "router ospf 1", `router-id ${has("dup-rid") ? "2.2.2.2" : "3.3.3.3"}`, `network ${lan(2)}.0 0.0.0.255 area 0`, `network ${link(1)}.0 0.0.0.3 area 0`, `passive-interface ${has("passive") ? "g0/1" : "g0/0"}`];
      const sol = [];
      const f1 = [...(has("hello") ? ["interface g0/1", "no ip ospf hello-interval"] : []), ...(has("no-lan") ? ["router ospf 1", `network ${lan(0)}.0 0.0.0.255 area 0`] : [])];
      const f2 = [...(has("shut") ? ["interface g0/2", "no shutdown"] : []), ...(has("area") ? ["router ospf 1", `no network ${link(1)}.0 0.0.0.3 area 1`, `network ${link(1)}.0 0.0.0.3 area 0`] : [])];
      const f3 = [...(has("dup-rid") || has("passive") ? ["router ospf 1"] : []), ...(has("dup-rid") ? ["router-id 3.3.3.3"] : []), ...(has("passive") ? ["no passive-interface g0/1", "passive-interface g0/0"] : [])];
      if (f1.length) sol.push({ on: "R1", cmds: cfg(...f1) });
      if (f2.length) sol.push({ on: "R2", cmds: cfg(...f2) });
      if (f3.length) sol.push({ on: "R3", cmds: cfg(...f3) });
      return {
        subject: "ALERT: sites unreachable after OSPF maintenance",
        brief: ["A contractor adjusted OSPF on the three site routers last night. This morning the sites cannot all reach each other.",
          `There ${faults.length === 1 ? "is **one fault**" : "are **two faults**"} somewhere on the three routers. The design is simple: OSPF process 1, everything in area 0, router IDs 1.1.1.1, 2.2.2.2 and 3.3.3.3, and only the LAN interfaces (G0/0) passive.`],
        details: [["LANs (G0/0)", [0, 1, 2].map(i => `R${i + 1}: ${lan(i)}.0/24`).join(", ")], ["R1 - R2 link", `${link(0)}.0/30 (G0/1 on both)`], ["R2 - R3 link", `${link(1)}.0/30 (R2 G0/2, R3 G0/1)`], ["Design", "process 1, area 0, default timers"]],
        topology: {
          devices: [{ name: "R1", kind: "router", hostname: "R1", x: 200, y: 170, config: r1 }, { name: "R2", kind: "router", hostname: "R2", x: 500, y: 170, config: r2 }, { name: "R3", kind: "router", hostname: "R3", x: 800, y: 170, config: r3 },
            pc("PC1", 200, 410, `${lan(0)}.10`, M24, `${lan(0)}.1`), pc("PC2", 500, 410, `${lan(1)}.10`, M24, `${lan(1)}.1`), pc("PC3", 800, 410, `${lan(2)}.10`, M24, `${lan(2)}.1`)],
          links: ["R1:g0/1 R2:g0/1", "R2:g0/2 R3:g0/1", "R1:g0/0 PC1", "R2:g0/0 PC2", "R3:g0/0 PC3"],
        },
        objectives: [
          { text: "R1 and R2 are FULL neighbours", check: C.ospfNeighbor("R1", "R2") },
          { text: "R2 and R3 are FULL neighbours", check: C.ospfNeighbor("R2", "R3") },
          { text: "PC1 can ping PC3", check: C.ping("PC1", `${lan(2)}.10`) },
          { text: "PC3 can ping PC2", check: C.ping("PC3", `${lan(1)}.10`) },
        ],
        hints: ["Run `show ip ospf neighbor` on R2 first: it should list both R1 and R3. For a missing neighbour, compare the two ends of that link: same area, same timers, different router IDs, not passive, interface up.",
          "`show ip protocols` shows the router ID, the networks advertised and the passive interfaces. `show running-config | section ospf` and `show running-config | include hello` reveal odd settings. If neighbours are fine but a LAN is unreachable, a network statement is missing."],
        solution: sol,
      };
    },
  },

  // ---------- DHCP
  {
    id: "dhcp-pool", topic: "dhcp", name: "Serve addresses with DHCP", par: 540,
    gen(x) {
      const two = x.bool(), ex = x.pick([5, 10, 20]), dns = x.pick(["8.8.8.8", "1.1.1.1", "9.9.9.9"]), site = x.pick(SITES);
      const [o1, o2, o3] = x.sample(Array.from({ length: 200 }, (_, i) => i + 10), 3), [n1, n2] = x.sample(["STAFF", "GUEST", "OFFICE", "FLOOR", "LAB", "VISITOR"], 2);
      const a = `192.168.${o1}`, b = `192.168.${o2}`, s = `10.0.${o3}`;
      const devs = [{ name: "R1", kind: "router", hostname: `${site}-R1`, x: 500, y: 90, config: [...ifc("g0/0", `${a}.1`, M24), ...(two ? ifc("g0/1", `${b}.1`, M24) : []), ...ifc("g0/2", `${s}.1`, M24)] },
        { name: "SW1", kind: "switch", hostname: `${n1}-SW`, x: 260, y: 250 }, dhcpPc("PC-A1", 140, 420), dhcpPc("PC-A2", 360, 420),
        { name: "SRV1", kind: "server", x: 800, y: 90, note: "Intranet", services: ["http"], ip: { mode: "static", ip: `${s}.10`, mask: M24, gw: `${s}.1` } }];
      const links = ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC-A1", "SW1:fa0/2 PC-A2", "R1:g0/2 SRV1"];
      if (two) { devs.push({ name: "SW2", kind: "switch", hostname: `${n2}-SW`, x: 720, y: 250 }, dhcpPc("PC-B1", 720, 420)); links.push("R1:g0/1 SW2:g0/1", "SW2:fa0/1 PC-B1"); }
      const dnsInt = dns.split(".").reduce((n, p) => n * 256 + Number(p), 0);
      const clients = ["PC-A1", "PC-A2", ...(two ? ["PC-B1"] : [])];
      const pool = (name, net) => [`ip dhcp pool ${name}`, `network ${net}.0 ${M24}`, `default-router ${net}.1`, `dns-server ${dns}`];
      return {
        subject: "PCs come up with 169.254 addresses",
        brief: [`The old DHCP server is gone, and every PC that restarted gave itself a 169.254.x.x address. Make **${site}-R1** the DHCP server for ${two ? "both LANs" : "the LAN"}.`,
          `Keep the first **${ex}** addresses of ${two ? "each subnet" : "the subnet"} out of the pool: they are reserved for gateways and printers. Clients need a default gateway and the DNS server ${dns}.`],
        details: [[`${n1} LAN (G0/0)`, `${a}.0/24, gateway .1`], two && [`${n2} LAN (G0/1)`, `${b}.0/24, gateway .1`], ["Reserved", `.1 to .${ex}`], ["DNS server", dns], ["Test target", `intranet server ${s}.10`]].filter(Boolean),
        topology: { devices: devs, links },
        objectives: [
          { text: `PC-A1 and PC-A2 lease addresses in ${a}.0/24 above .${ex}`, check: C.all(C.dhcpLease("PC-A1", `${a}.0/24`, ex + 1), C.dhcpLease("PC-A2", `${a}.0/24`, ex + 1)) },
          two && { text: `PC-B1 leases an address in ${b}.0/24 above .${ex}`, check: C.dhcpLease("PC-B1", `${b}.0/24`, ex + 1) },
          { text: "Clients receive their default gateway (every PC can ping the intranet server)", check: C.all(...clients.map(p => C.ping(p, `${s}.10`))) },
          { text: `Clients receive DNS server ${dns}`, check: net => clients.every(p => net.st.pcs[p].dns === dnsInt) },
        ].filter(Boolean),
        hints: [`Exclusions are global commands and come first: \`ip dhcp excluded-address ${a}.1 ${a}.${ex}\`. Then each subnet gets its own \`ip dhcp pool NAME\`.`,
          "Inside a pool: `network`, `default-router` and `dns-server`. Run `ipconfig /all` on a PC to see what it received, and `show ip dhcp binding` on the router."],
        solution: [{ on: "R1", cmds: cfg(`ip dhcp excluded-address ${a}.1 ${a}.${ex}`, ...(two ? [`ip dhcp excluded-address ${b}.1 ${b}.${ex}`] : []), ...pool(n1, a), ...(two ? pool(n2, b) : [])) }],
      };
    },
  },

  // ---------- NAT
  {
    id: "nat-pat", topic: "nat", name: "Share one public address (PAT)", par: 600,
    gen(x) {
      const inside = x.pick([`192.168.${x.int(1, 250)}`, `172.16.${x.int(1, 250)}`, `10.${x.int(1, 250)}.${x.int(1, 250)}`]), blk = x.int(1, 30) * 8, pub = `203.0.113`, withStatic = x.bool(), acl = x.pick([1, 5, 10, 20]), site = x.pick(SITES);
      const M29 = "255.255.255.248", srvPub = `${pub}.${blk + 5}`;
      return {
        subject: `Configure NAT on ${site}-R1`,
        brief: [`The Internet circuit on **${site}-R1** is live, but the ISP has no route to the private network ${inside}.0/24, so nothing comes back.`,
          `Configure **PAT** so every inside host shares the router's outside address.${withStatic ? ` Then publish the web server: outside users must reach it on the public address ${srvPub}.` : ""}`],
        details: [["Inside", `G0/0 - ${inside}.0/24`], ["Outside", `G0/1 - ${pub}.${blk + 2}/29 (ISP is .${blk + 1})`], ["PAT", `all of ${inside}.0/24, overload on G0/1, ACL ${acl}`], withStatic && ["Web server", `${inside}.100 published as ${srvPub}`], ["Tests", `PCs ping 8.8.8.8${withStatic ? `; REMOTE-USER runs curl http://${srvPub}` : ""}`]].filter(Boolean),
        topology: {
          devices: [{ name: "R1", kind: "router", hostname: `${site}-R1`, x: 430, y: 170, config: [...ifc("g0/0", `${inside}.1`, M24), ...ifc("g0/1", `${pub}.${blk + 2}`, M29), `ip route 0.0.0.0 0.0.0.0 ${pub}.${blk + 1}`] },
            ISP(720, 170, [...ifc("g0/0", `${pub}.${blk + 1}`, M29), ...ifc("g0/1", "198.51.100.1", M24)]),
            { name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 300, y: 300 }, pc("PC1", 110, 440, `${inside}.10`, M24, `${inside}.1`), pc("PC2", 300, 440, `${inside}.11`, M24, `${inside}.1`),
            { name: "SRV-WEB", kind: "server", x: 490, y: 440, note: "Customer portal", services: ["http"], ip: { mode: "static", ip: `${inside}.100`, mask: M24, gw: `${inside}.1` } },
            pc("REMOTE-USER", 880, 360, "198.51.100.50", M24, "198.51.100.1")],
          links: ["R1:g0/0 SW1:g0/1", "R1:g0/1 ISP:g0/0", "ISP:g0/1 REMOTE-USER", "SW1:fa0/1 PC1", "SW1:fa0/2 PC2", "SW1:fa0/3 SRV-WEB"],
        },
        objectives: [
          { text: "G0/0 is the NAT inside interface and G0/1 is outside", check: C.all(C.natRole("R1", "g0/0", "inside"), C.natRole("R1", "g0/1", "outside")) },
          { text: "A PAT (overload) rule exists", check: C.natOverload("R1") },
          { text: "PC1 and PC2 can ping 8.8.8.8", check: C.all(C.ping("PC1", "8.8.8.8"), C.ping("PC2", "8.8.8.8")) },
          withStatic && { text: `The web server is mapped to ${srvPub} and REMOTE-USER can load it`, check: C.all(C.natStatic("R1", `${inside}.100`, srvPub), C.tcp("REMOTE-USER", srvPub, 80)) },
        ].filter(Boolean),
        hints: ["NAT needs three things: interfaces marked inside and outside, an ACL naming the inside addresses, and a rule tying them together with `overload`.",
          `\`access-list ${acl} permit ${inside}.0 0.0.0.255\`, then \`ip nat inside source list ${acl} interface g0/1 overload\`.${withStatic ? ` The server needs a one-to-one mapping: \`ip nat inside source static <private> <public>\`.` : ""}`],
        solution: [{ on: "R1", cmds: cfg(`access-list ${acl} permit ${inside}.0 0.0.0.255`, `ip nat inside source list ${acl} interface g0/1 overload`, ...(withStatic ? [`ip nat inside source static ${inside}.100 ${srvPub}`] : []), "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside") }],
      };
    },
  },

  // ---------- access lists
  {
    id: "acl-fault", topic: "acl", name: "Find the faults in two access lists", par: 720,
    gen(x) {
      const [staff, guest] = x.sample(Array.from({ length: 200 }, (_, i) => i + 10), 2);
      return aclFaultLab({ site: x.pick(SITES), staff, guest, servers: x.int(0, 200), port: x.pick([80, 443, 8080]), who: x.pick(["GUEST", "CONTRACTOR", "IOT", "LAB"]),
        guestFaults: [x.pick(["order", "port", "wildcard", "nopermit", "direction"])], wanFault: x.pick(["noest", "noecho", "out"]) });
    },
  },
  {
    id: "acl-filter", topic: "acl", name: "Filter traffic with an access list", par: 720,
    gen(x) {
      const std = x.bool(0.4), [oa, ob, os] = x.sample(Array.from({ length: 200 }, (_, i) => i + 10), 3), site = x.pick(SITES);
      const a = `192.168.${oa}`, b = `192.168.${ob}`, s = `10.${os}.0`, port = x.pick([80, 443, 8080]), who = x.pick(["GUEST", "CONTRACTOR", "IOT", "LAB"]);
      const svc = port === 443 ? "https" : port === 80 ? "http" : String(port), url = `${port === 443 ? "https" : "http"}://${s}.10${port === 8080 ? ":8080" : ""}`;
      const router = { name: "R1", kind: "router", hostname: `${site}-R1`, x: 480, y: 220, config: [...ifc("g0/0", `${a}.1`, M24), ...ifc("g0/1", `${b}.1`, M24), ...ifc("g0/2", `${s}.1`, M24), ...ifc("s0/0/0", "203.0.113.2", M30), "ip route 0.0.0.0 0.0.0.0 203.0.113.1"] };
      const isp = ISP(820, 220, [...ifc("s0/0/0", "203.0.113.1", M30), "ip route 192.168.0.0 255.255.0.0 203.0.113.2", "ip route 10.0.0.0 255.0.0.0 203.0.113.2"]);
      const srv = { name: "SRV1", kind: "server", x: 480, y: 440, note: "Internal server", services: ["http", "https", "8080"], ip: { mode: "static", ip: `${s}.10`, mask: M24, gw: `${s}.1` } };
      const applied = net => net.devs.R1.ifOrder.some(n => { const i = net.devs.R1.ifaces[n]; return (i.aclIn && net.devs.R1.acls[i.aclIn]) || (i.aclOut && net.devs.R1.acls[i.aclOut]); });
      if (std) {
        const bad = x.pick([10, 11]), good = bad === 10 ? 11 : 10, n = x.pick([10, 20, 50]);
        return {
          subject: "Quarantine one PC from the server LAN",
          brief: [`Security flagged the machine at **${a}.${bad}** (PC${bad - 9}) as infected. Until it is rebuilt it must not reach anything on the server LAN, but its user still needs the Internet and the rest of the office.`,
            "Nothing else may be affected. This calls for a **standard** access list, which can only match the source address, so think about where to apply it."],
          details: [["Office LAN", `${a}.0/24 on G0/0`], ["Quarantined host", `${a}.${bad}`], ["Server LAN", `${s}.0/24 on G0/2 (server ${s}.10)`], ["Internet test", "8.8.8.8"]],
          topology: { devices: [router, isp, pc("PC1", 180, 110, `${a}.10`, M24, `${a}.1`), pc("PC2", 180, 340, `${a}.11`, M24, `${a}.1`), { name: "SW1", kind: "switch", hostname: `${site}-SW1`, x: 300, y: 220 }, srv],
            links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC1", "SW1:fa0/2 PC2", "R1:g0/2 SRV1", "R1:s0/0/0 ISP:s0/0/0"] },
          objectives: [
            { text: "An access list is applied on the router", check: applied },
            { text: `PC${bad - 9} (${a}.${bad}) cannot ping the server`, check: C.all(C.noPing(`PC${bad - 9}`, `${s}.10`), C.ifaceUp("R1", "g0/2"), C.ifaceUp("R1", "g0/0")) },
            { text: `PC${good - 9} can still ping the server`, check: C.ping(`PC${good - 9}`, `${s}.10`) },
            { text: `PC${bad - 9} can still ping the Internet (8.8.8.8)`, check: C.ping(`PC${bad - 9}`, "8.8.8.8") },
          ],
          hints: ["A standard ACL matches only the source. Applied inbound on the office interface it would cut the host off from everything, so apply it as close to the destination as possible: outbound on the server-facing interface.",
            `\`access-list ${n} deny host ${a}.${bad}\`, \`access-list ${n} permit any\`, then on G0/2: \`ip access-group ${n} out\`. Without the permit line the implicit deny blocks everyone.`],
          solution: [{ on: "R1", cmds: cfg(`access-list ${n} deny host ${a}.${bad}`, `access-list ${n} permit any`, "interface g0/2", `ip access-group ${n} out`) }],
        };
      }
      return {
        subject: `${cap(who.toLowerCase())} network can reach the server LAN`,
        brief: [`A scan from the ${who.toLowerCase()} network reached the internal servers. Fence that network in with one **extended** access list applied where its traffic enters the router.`,
          `Policy: ${who.toLowerCase()} hosts may use the internal server on **TCP port ${port}** only; they may reach nothing else on the server LAN and nothing on the staff LAN; they keep their Internet access. Staff must be unaffected.`],
        details: [[`${who} LAN`, `${b}.0/24 on G0/1`], ["Staff LAN", `${a}.0/24 on G0/0`], ["Server LAN", `${s}.0/24 on G0/2`], ["Allowed service", `${s}.10, TCP port ${port} (test: curl ${url})`], ["Internet test", "8.8.8.8"]],
        topology: { devices: [router, isp, pc("PC-STAFF", 180, 110, `${a}.10`, M24, `${a}.1`), pc(`PC-${who}`, 180, 340, `${b}.10`, M24, `${b}.1`), srv],
          links: ["R1:g0/0 PC-STAFF", `R1:g0/1 PC-${who}`, "R1:g0/2 SRV1", "R1:s0/0/0 ISP:s0/0/0"] },
        objectives: [
          { text: "An ACL is applied inbound on G0/1", check: C.aclApplied("R1", "g0/1", "in") },
          { text: `PC-${who} can reach the server on TCP ${port}`, check: C.tcp(`PC-${who}`, `${s}.10`, port) },
          { text: `PC-${who} cannot ping the server or the staff PC`, check: C.all(C.noPing(`PC-${who}`, `${s}.10`), C.noPing(`PC-${who}`, `${a}.10`), C.ifaceUp("R1", "g0/2"), C.ifaceUp("R1", "g0/0")) },
          { text: `PC-${who} can still ping the Internet (8.8.8.8)`, check: C.ping(`PC-${who}`, "8.8.8.8") },
          { text: "PC-STAFF is unaffected: it pings the server and the Internet", check: C.all(C.ping("PC-STAFF", `${s}.10`), C.ping("PC-STAFF", "8.8.8.8")) },
        ],
        hints: ["ACLs are read top-down and stop at the first match, with an invisible deny at the end. Put the narrow permit first, then the denies, then `permit ip any any`.",
          `First line: \`permit tcp ${b}.0 0.0.0.255 host ${s}.10 eq ${port}\`. Then one \`deny ip\` line for each protected network, the final permit, and \`ip access-group NAME in\` on G0/1.`],
        solution: [{ on: "R1", cmds: cfg(`ip access-list extended ${who}-IN`, `permit tcp ${b}.0 0.0.0.255 host ${s}.10 eq ${port}`, `deny ip ${b}.0 0.0.0.255 ${s}.0 0.0.0.255`, `deny ip ${b}.0 0.0.0.255 ${a}.0 0.0.0.255`, "permit ip any any", "interface g0/1", `ip access-group ${who}-IN in`) }],
      };
    },
  },

  // ---------- secure remote access
  {
    id: "ssh-setup", topic: "access", name: "Replace Telnet with SSH", par: 660,
    gen(x) {
      const site = x.pick(SITES), domain = x.pick(["kestrel.lan", "corp.kestrel.net", "yard.internal", "ops.example"]), user = x.pick(["admin", "netops", "oncall"]), bits = x.pick([1024, 2048, 4096]), restrict = x.bool(0.6);
      const m = x.int(1, 250), u = x.int(1, 250), acl = x.pick([5, 10, 15, 20]), mg = `10.0.${m}`, us = `192.168.${u}`;
      return {
        subject: `Audit finding: ${site}-R1 is managed over Telnet`,
        brief: [`**${site}-R1** accepts Telnet with a shared line password, so every keystroke crosses the network in clear text.`,
          `Move remote management to **SSH version 2** with a named local account and refuse Telnet.${restrict ? " Only the management subnet may open a session." : ""}`],
        details: [["Domain name", domain], ["Local user", `${user}, with a secret of your choice`], ["RSA key size", `${bits} bits`], ["VTY lines 0-4", "SSH only, local login"], restrict && ["Allowed source", `${mg}.0/24 only (standard ACL ${acl} on the VTY lines)`], ["Test", `from ADMIN-PC: ssh -l ${user} ${mg}.1`]].filter(Boolean),
        topology: {
          devices: [{ name: "R1", kind: "router", hostname: `${site}-R1`, x: 500, y: 150, config: [...ifc("g0/0", `${mg}.1`, M24), ...ifc("g0/1", `${us}.1`, M24), "line vty 0 4", "password cisco", "login", "transport input telnet"], saved: false },
            pc("ADMIN-PC", 280, 380, `${mg}.10`, M24, `${mg}.1`), pc("PC-USER", 720, 380, `${us}.10`, M24, `${us}.1`)],
          links: ["R1:g0/0 ADMIN-PC", "R1:g0/1 PC-USER"],
        },
        objectives: [
          { text: `The domain name is \`${domain}\` and user \`${user}\` exists with a secret`, check: C.all(C.domainName("R1", domain), C.userSecret("R1", user)) },
          { text: `RSA keys of at least ${bits} bits exist and SSH version 2 is enforced`, check: C.all(C.rsaBits("R1", bits), C.sshV2("R1")) },
          { text: `ADMIN-PC can open an SSH session as \`${user}\``, check: C.ssh("ADMIN-PC", `${mg}.1`, user) },
          { text: "Telnet is refused", check: C.noTelnet("ADMIN-PC", `${mg}.1`) },
          restrict && { text: "PC-USER (outside the management subnet) cannot SSH in", check: C.all(C.noSsh("PC-USER", `${us}.1`), C.ping("PC-USER", `${us}.1`)) },
          { text: "Save the configuration", check: C.saved("R1") },
        ].filter(Boolean),
        hints: ["The RSA key is named after hostname and domain, so `ip domain-name` comes before `crypto key generate rsa modulus <bits>`. SSH also needs a `username ... secret ...`.",
          `Under \`line vty 0 4\`: \`transport input ssh\` and \`login local\`.${restrict ? ` Restrict the source with a standard ACL applied to the lines: \`access-class ${acl} in\`.` : ""}`],
        solution: [{ on: "R1", cmds: ["enable", "configure terminal", `ip domain-name ${domain}`, `username ${user} secret Pr4ctice!Pw`, `crypto key generate rsa modulus ${bits}`, "ip ssh version 2",
          ...(restrict ? [`access-list ${acl} permit ${mg}.0 0.0.0.255`] : []), "line vty 0 4", "transport input ssh", "login local", ...(restrict ? [`access-class ${acl} in`] : []), "end", "write memory"] }],
      };
    },
  },


  // ---------- floating and host routes
  {
    id: "static-floating", topic: "static", name: "Add a backup path with floating routes", par: 720,
    gen(x) {
      const [br, hq] = x.sample(Array.from({ length: 200 }, (_, i) => i + 10), 2), [p, b] = x.sample(Array.from({ length: 200 }, (_, i) => i + 1), 2);
      return floatingLab({ site: cap(x.pick(SITES).toLowerCase()), br, hq, p, b, ad: x.pick([150, 200, 210, 250]), hostRoute: x.bool() });
    },
  },

  // ---------- DHCP relay
  {
    id: "relay-build", topic: "dhcp", name: "Relay DHCP to a server at another site", par: 600,
    gen(x) {
      const [hq, br] = x.sample(Array.from({ length: 200 }, (_, i) => i + 10), 2);
      return relayLab({ site: cap(x.pick(SITES).toLowerCase()), hq, br, w: x.int(1, 250), ex: x.pick([10, 20]), dns: x.pick(["8.8.8.8", "1.1.1.1", "9.9.9.9"]), fault: null });
    },
  },
  {
    id: "relay-fault", topic: "dhcp", name: "Find why DHCP relay fails", par: 600,
    gen(x) {
      const [hq, br] = x.sample(Array.from({ length: 200 }, (_, i) => i + 10), 2);
      return relayLab({ site: cap(x.pick(SITES).toLowerCase()), hq, br, w: x.int(1, 250), ex: x.pick([10, 20]), dns: x.pick(["8.8.8.8", "1.1.1.1", "9.9.9.9"]), fault: x.pick(["wrong-if", "wrong-ip", "pool-net", "no-route", "gateway"]) });
    },
  },

  // ---------- spanning tree
  {
    id: "stp-root", topic: "switching", name: "Put the root bridge where it belongs", par: 720,
    gen(x) {
      const vlans = pickVlans(x), shape = x.pick(["DSW1", "DSW2", "split"]);
      const roots = { [vlans[0].id]: shape === "split" ? "DSW1" : shape, [vlans[1].id]: shape === "split" ? "DSW2" : shape };
      const primary = x.pick([4096, 8192, 16384]);
      return stpLab({ site: x.pick(SITES), vlans, roots, left: x.pick([0, 4096, 8192, 12288]), exact: x.bool(0.4) ? { primary, secondary: primary + x.pick([4096, 8192]) } : null, guard: x.bool() });
    },
  },
  {
    id: "stp-guards", topic: "switching", name: "Find the misplaced spanning tree protection", par: 600,
    gen(x) {
      return stpGuardLab({ site: x.pick(SITES), vlans: pickVlans(x), root: x.pick(["DSW1", "DSW2"]), fault: x.pick(["guard-uplink", "bpdu-uplink", "guard-core"]) });
    },
  },

  {
    id: "rogue-root", topic: "switching", name: "Cut off a switch that claims the root", par: 540,
    gen(x) {
      return rogueLab({ site: x.pick(SITES), vlans: pickVlans(x), root: x.pick(["DSW1", "DSW2"]), port: x.int(3, 8), rv: x.int(0, 1), prio: x.pick([0, 4096, 8192]), guarded: x.bool() });
    },
  },

  // ---------- EtherChannel
  {
    id: "channel-build", topic: "switching", name: "Bundle parallel links into an EtherChannel", par: 600,
    gen(x) {
      return channelLab({ site: x.pick(SITES), vlans: pickVlans(x), ports: x.pick(CHANNEL_PORTS), group: x.int(1, 6), fault: null });
    },
  },
  {
    id: "channel-fault", topic: "switching", name: "Find why an EtherChannel does not form", par: 540,
    gen(x) {
      return channelLab({ site: x.pick(SITES), vlans: pickVlans(x), ports: x.pick(CHANNEL_PORTS), group: x.int(1, 6), fault: x.pick(["passive", "on", "pagp", "missing", "allowed", "shut"]) });
    },
  },

  // ---------- Ansible (v2.0 blueprint)
  {
    id: "ansible-vlan", topic: "netops", name: "Roll out a VLAN with Ansible", par: 780,
    gen(x) {
      const vid = x.pick([30, 40, 50, 60, 70, 80, 90]), vname = x.pick(["CCTV", "VOICE", "PRINT", "GUEST", "LAB", "STORES", "DOORS"]);
      return ansibleRollout({ vid, vname, port: x.int(3, 8), site: x.pick(SITES), faults: x.sample(["host", "line", "group", "port"], 2) });
    },
  },
];

// Which story lab each template is a variant of. A lab can have more than one
// (for example a build version and a troubleshooting version).
const AFTER = {
  "stp-root": "root-bridge", "stp-guards": "root-bridge", "rogue-root": "rogue-switch", "channel-build": "port-channel", "channel-fault": "port-channel",
  "ansible-vlan": "ansible-rollout", "static-floating": "floating-backup", "relay-build": "dhcp-relay", "relay-fault": "dhcp-relay",
  "cli-name": "first-console", "cli-setup": "lock-it-down", "addr-lan": "desk-move", "addr-fault": "desk-move", "addr-svi": "switch-mgmt",
  "vlan-access": "vlans-101", "vlan-trunk": "trunk-line", "vlan-fault": "trunk-line", roas: "router-on-a-stick", "port-sec": "port-security",
  "static-chain": "static-routes", "static-default": "default-route", "ospf-build": "ospf-single-area", "ospf-fault": "ospf-broken", "ospf-tune": "ospf-tuning",
  "dhcp-pool": "dhcp-pools", "nat-pat": "nat-edge", "acl-filter": "acl-guard", "acl-fault": "acl-broken", "ssh-setup": "ssh-hardening",
};
for (const k of SKILLS) k.after = AFTER[k.id];

export { SKILLS };
export const SKILL_BY_ID = new Map(SKILLS.map(k => [k.id, k]));
export const variantsOf = levelId => SKILLS.filter(k => k.after === levelId);

// Build one playable variant from a template and a seed.
export function makePractice(skillId, seed = (Math.random() * 2 ** 31) | 0) {
  const skill = SKILL_BY_ID.get(skillId);
  if (!skill) return null;
  const x = dice(seed);
  const from = x.pick(SENDERS);
  return { id: `variant:${skill.id}`, practice: true, type: "lab", skill: skill.id, origin: skill.after, topic: skill.topic, seed, title: skill.name, par: skill.par, xp: 0, from, ...skill.gen(x) };
}

// A fresh random variant of a story lab, or null if it has none. When the lab
// has several templates, `avoid` keeps the same one from coming up twice in a row.
export function makeVariant(levelId, avoid) {
  const options = variantsOf(levelId);
  if (!options.length) return null;
  const pool = options.length > 1 && avoid ? options.filter(k => k.id !== avoid) : options;
  return makePractice(pool[Math.floor(Math.random() * pool.length)].id);
}
