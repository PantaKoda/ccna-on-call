import { C } from "../checks.js";

const M24 = "255.255.255.0";

export default [
  {
    id: "first-console", tier: 1, type: "lab", xp: 100, par: 240,
    title: "First Console",
    from: "Dana Okafor, NOC Team Lead",
    subject: "Welcome aboard: name the new warehouse switch",
    brief: [
      "Welcome to the Kestrel Freight NOC. Your laptop is cabled to the console port of a factory-fresh switch that ships to the warehouse tomorrow.",
      "Click the switch on the network map to open its console. Get into configuration mode, give it its real name, check your work and save it so the name survives a power cycle.",
      "Stuck on a command? Type `?` at any prompt to see what IOS accepts there, and press `Tab` to complete a word.",
    ],
    details: [["New hostname", "WH-SW1"]],
    skills: ["enable", "configure terminal", "hostname", "show running-config", "copy running-config startup-config"],
    topology: {
      devices: [
        { name: "SW1", kind: "switch", hostname: "Switch", x: 500, y: 170 },
        { name: "PC1", kind: "pc", x: 300, y: 390, ip: { mode: "static", ip: "192.168.1.10", mask: M24 } },
        { name: "PC2", kind: "pc", x: 700, y: 390, ip: { mode: "static", ip: "192.168.1.11", mask: M24 } },
      ],
      links: ["SW1:fa0/1 PC1", "SW1:fa0/2 PC2"],
    },
    objectives: [
      { text: "Enter privileged EXEC mode on the switch", check: C.reachedMode("SW1", "priv") },
      { text: "Enter global configuration mode", check: C.reachedMode("SW1", "config") },
      { text: "Set the hostname to `WH-SW1`", check: C.hostname("SW1", "WH-SW1") },
      { text: "Display the running configuration", check: C.ran("SW1", /^(do\s+)?sh\S*\s+ru/i) },
      { text: "Save the configuration to NVRAM", check: C.saved("SW1") },
    ],
    hints: [
      "The prompt tells you where you are: `>` is user mode, `#` is privileged mode, `(config)#` is global configuration. `enable` moves you up one level.",
      "From `Switch#`, `configure terminal` enters global configuration. The hostname command lives there.",
      "`end` (or Ctrl+Z) returns to privileged mode. Then `show running-config`, and `copy running-config startup-config` to save. Press Enter at the filename question.",
    ],
    solution: [{ on: "SW1", cmds: ["enable", "configure terminal", "hostname WH-SW1", "end", "show running-config", "copy running-config startup-config", ""] }],
    debrief: "Every change you type lands in the running configuration (RAM). Only `copy running-config startup-config` writes it to NVRAM, so an unsaved switch forgets everything at the next reload.",
  },

  {
    id: "lock-it-down", tier: 1, type: "lab", xp: 120, par: 300,
    title: "Lock It Down",
    from: "Marcus Lindqvist, Security",
    subject: "Audit finding: branch router has no passwords",
    brief: [
      "The quarterly audit found **BR-R1** wide open: anyone with a console cable gets full control. Fix it before the auditor's re-test this afternoon.",
      "Protect privileged mode with an encrypted secret, require a password on the console line, make sure no password sits in the config as clear text, and add a legal warning banner.",
    ],
    details: [
      ["Enable secret", "K3strel!ops"],
      ["Console password", "c0nsole-7"],
      ["Banner must contain", "the word \"authorized\""],
    ],
    skills: ["enable secret", "line console 0", "password / login", "service password-encryption", "banner motd"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "BR-R1", x: 500, y: 150, config: ["interface g0/0", "ip address 192.168.5.1 255.255.255.0", "no shutdown"], saved: false },
        { name: "SW1", kind: "switch", hostname: "BR-SW1", x: 500, y: 300 },
        { name: "PC1", kind: "pc", x: 500, y: 440, ip: { mode: "static", ip: "192.168.5.10", mask: M24, gw: "192.168.5.1" } },
      ],
      links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC1"],
    },
    objectives: [
      { text: "Set the enable secret to `K3strel!ops`", check: C.enableSecret("R1", "K3strel!ops") },
      { text: "Console line: password `c0nsole-7` with `login`", check: C.linePassword("R1", "con", "c0nsole-7") },
      { text: "Encrypt clear-text passwords in the config", check: C.pwEncryption("R1") },
      { text: "Add a MOTD banner containing \"authorized\"", check: C.bannerHas("R1", "authorized") },
      { text: "Save the configuration", check: C.saved("R1") },
    ],
    hints: [
      "`enable secret` is a global configuration command. The console line has its own sub-mode: `line console 0`.",
      "On the line you need two commands: `password c0nsole-7` and then `login` (without `login` the password is never asked for).",
      "`service password-encryption` hides clear-text passwords. A banner looks like `banner motd #Authorized access only#` - the first character is the delimiter.",
    ],
    solution: [{ on: "R1", cmds: ["enable", "configure terminal", "enable secret K3strel!ops", "line console 0", "password c0nsole-7", "login", "exit", "service password-encryption", "banner motd #Authorized access only#", "end", "write memory"] }],
    debrief: "`enable secret` is stored as a hash and always wins over `enable password`. `service password-encryption` only applies weak type-7 obfuscation, which stops shoulder-surfing but not a determined attacker.",
  },

  {
    id: "subnet-sprint-1", tier: 1, type: "subnet", xp: 100, par: 420,
    title: "Subnet Sprint",
    from: "Dana Okafor, NOC Team Lead",
    subject: "IP plan review before the Finance move",
    brief: [
      "Before you touch the Finance LAN I want to know you can read an IP plan without a calculator. Work out each subnet from one host address.",
    ],
    params: { count: 5, minLen: 24, maxLen: 30 },
    skills: ["subnet mask", "network address", "broadcast address", "usable host range"],
    debrief: "The block size is 256 minus the interesting mask octet. Networks start at multiples of the block size; the broadcast is one below the next network.",
  },

  {
    id: "desk-move", tier: 1, type: "lab", xp: 140, par: 420,
    title: "Desk Move",
    from: "Priya Raman, Service Desk",
    subject: "Finance wing has no network",
    brief: [
      "Finance moved into the new wing over the weekend. The cabling is done, but nobody configured the gateway and the first PC has no address.",
      "The wing uses **192.168.40.64/27**. House rule: the router takes the **first** usable address, and the manager's PC takes the **last** usable address. The printer is already set up correctly.",
      "Configure the router interface, then click **PC-FIN1** and use its IP settings bar. Prove it works with `ping` from the PC.",
    ],
    details: [["Subnet", "192.168.40.64/27"], ["Gateway", "first usable address, on HQ-R1 G0/0"], ["PC-FIN1", "last usable address"], ["Printer", "192.168.40.70 (already configured)"]],
    skills: ["interface", "ip address", "no shutdown", "PC IP settings", "ping"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "HQ-R1", x: 500, y: 110 },
        { name: "SW1", kind: "switch", hostname: "FIN-SW1", x: 500, y: 260 },
        { name: "PC-FIN1", kind: "pc", x: 300, y: 420 },
        { name: "PRN-FIN", kind: "server", x: 700, y: 420, note: "Finance printer", ip: { mode: "static", ip: "192.168.40.70", mask: "255.255.255.224", gw: "192.168.40.65" } },
      ],
      links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC-FIN1", "SW1:fa0/2 PRN-FIN"],
    },
    objectives: [
      { text: "HQ-R1 G0/0 has the first usable address of 192.168.40.64/27", check: C.ifaceIp("R1", "g0/0", "192.168.40.65", "255.255.255.224") },
      { text: "HQ-R1 G0/0 is up/up", check: C.ifaceUp("R1", "g0/0") },
      { text: "PC-FIN1 has the last usable address, the right mask and gateway", check: C.hostIp("PC-FIN1", "192.168.40.94", "255.255.255.224", "192.168.40.65") },
      { text: "PC-FIN1 can ping its gateway", check: C.ping("PC-FIN1", "192.168.40.65") },
      { text: "PC-FIN1 can ping the printer", check: C.ping("PC-FIN1", "192.168.40.70") },
      { text: "Save HQ-R1's configuration", check: C.saved("R1") },
    ],
    hints: [
      "A /27 has a block size of 32, so this subnet runs from .64 to .95. The mask is 255.255.255.224.",
      "First usable is .65 (router), last usable is .94 (PC), broadcast is .95. Router interfaces are shut down by default.",
      "On HQ-R1: `interface g0/0`, `ip address 192.168.40.65 255.255.255.224`, `no shutdown`. On the PC: static, 192.168.40.94, mask 255.255.255.224, gateway 192.168.40.65.",
    ],
    solution: [
      { on: "R1", cmds: ["enable", "configure terminal", "interface g0/0", "ip address 192.168.40.65 255.255.255.224", "no shutdown", "end", "copy running-config startup-config", ""] },
      { pc: "PC-FIN1", ip: { mode: "static", ip: "192.168.40.94", mask: "255.255.255.224", gw: "192.168.40.65" } },
    ],
    debrief: "Router interfaces start administratively down; switch ports start up. `show ip interface brief` is the quickest way to see both the address and the up/up status.",
  },

  {
    id: "switch-mgmt", tier: 1, type: "lab", xp: 150, par: 420,
    title: "Out of Reach",
    from: "Monitoring (automated)",
    subject: "ALERT: ACC-SW1 not responding to polls",
    brief: [
      "Monitoring cannot reach the access switch **ACC-SW1**, because nobody ever gave it a management address. A layer 2 switch still needs an IP on a VLAN interface (SVI) to be managed, plus a default gateway to answer hosts in other subnets.",
      "Give the switch its management address and make it reachable from the admin workstation, which lives in a different subnet behind HQ-R1.",
    ],
    details: [["Management SVI", "interface Vlan1"], ["Address", "192.168.1.2 /24"], ["Default gateway", "192.168.1.1 (HQ-R1)"], ["Test from", "ADMIN-PC (10.0.99.10)"]],
    skills: ["interface vlan 1", "ip default-gateway", "show ip interface brief"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "HQ-R1", x: 500, y: 130, config: ["interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.99.1 255.255.255.0", "no shutdown"] },
        { name: "SW1", kind: "switch", hostname: "ACC-SW1", x: 320, y: 290 },
        { name: "PC1", kind: "pc", x: 320, y: 440, ip: { mode: "static", ip: "192.168.1.10", mask: M24, gw: "192.168.1.1" } },
        { name: "ADMIN-PC", kind: "pc", x: 720, y: 290, ip: { mode: "static", ip: "10.0.99.10", mask: M24, gw: "10.0.99.1" } },
      ],
      links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC1", "R1:g0/1 ADMIN-PC"],
    },
    objectives: [
      { text: "Interface Vlan1 on ACC-SW1 has 192.168.1.2/24", check: C.ifaceIp("SW1", "vlan1", "192.168.1.2", M24) },
      { text: "Interface Vlan1 is up/up", check: C.ifaceUp("SW1", "vlan1") },
      { text: "The switch's default gateway is 192.168.1.1", check: C.defaultGw("SW1", "192.168.1.1") },
      { text: "ADMIN-PC can ping the switch", check: C.ping("ADMIN-PC", "192.168.1.2") },
      { text: "Save ACC-SW1's configuration", check: C.saved("SW1") },
    ],
    hints: [
      "The management address goes on `interface vlan 1`, not on a physical port. That interface is shut down by default.",
      "Without `ip default-gateway`, the switch can only answer hosts in its own subnet, so ADMIN-PC's pings arrive but the replies never leave.",
      "`interface vlan 1`, `ip address 192.168.1.2 255.255.255.0`, `no shutdown`, `exit`, `ip default-gateway 192.168.1.1`.",
    ],
    solution: [{ on: "SW1", cmds: ["enable", "configure terminal", "interface vlan 1", "ip address 192.168.1.2 255.255.255.0", "no shutdown", "exit", "ip default-gateway 192.168.1.1", "end", "copy running-config startup-config", ""] }],
    debrief: "`ip default-gateway` is for devices that do not route (layer 2 switches). A router or layer 3 switch uses `ip route 0.0.0.0 0.0.0.0 <next-hop>` instead.",
  },

  {
    id: "exam-1", tier: 1, type: "quiz", xp: 150, par: 600,
    title: "Probation Review",
    from: "Dana Okafor, NOC Team Lead",
    subject: "End of orientation: fundamentals check",
    brief: ["Orientation week is over. Pass this fundamentals check and you move from intern to junior engineer, with access to the access-layer tickets."],
    params: { domains: [1], v2domains: [1], count: 8, pass: 70 },
    skills: ["Network fundamentals"],
  },
];
