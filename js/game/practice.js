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

// ---------------------------------------------------------------- generators
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
      const sw1 = base(v1, v2, fault === "no-trunk" ? [`switchport trunk allowed vlan ${v1},${v2}`] : good);
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

];

// Which story lab each template is a variant of. A lab can have more than one
// (for example a build version and a troubleshooting version).
const AFTER = {
  "cli-name": "first-console", "cli-setup": "lock-it-down", "addr-lan": "desk-move", "addr-fault": "desk-move", "addr-svi": "switch-mgmt",
  "vlan-access": "vlans-101", "vlan-trunk": "trunk-line", "vlan-fault": "trunk-line", roas: "router-on-a-stick", "port-sec": "port-security",
  "static-chain": "static-routes", "static-default": "default-route", "ospf-build": "ospf-single-area", "ospf-fault": "ospf-broken",
  "dhcp-pool": "dhcp-pools", "nat-pat": "nat-edge", "acl-filter": "acl-guard", "ssh-setup": "ssh-hardening",
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
