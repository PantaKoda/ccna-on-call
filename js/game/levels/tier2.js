import { C } from "../checks.js";
import { stpLab, rogueLab, channelLab } from "../practice.js";

const M24 = "255.255.255.0";
const pc = (name, x, y, ip, gw) => ({ name, kind: "pc", x, y, ip: { mode: "static", ip, mask: M24, gw } });

export default [
  {
    id: "vlans-101", tier: 2, type: "lab", xp: 160, par: 420,
    title: "Two Teams, One Switch",
    from: "Marcus Lindqvist, Security",
    subject: "Separate Sales and Engineering traffic",
    brief: [
      "Sales and Engineering share one switch on the second floor, and today every PC can see every other PC's broadcasts. Security wants the two teams in separate VLANs.",
      "Create the VLANs, name them, and put each team's ports in the right one as access ports. PCs in the same team must still reach each other.",
    ],
    details: [["VLAN 10", "SALES - ports Fa0/1 and Fa0/2"], ["VLAN 20", "ENG - ports Fa0/3 and Fa0/4"]],
    skills: ["vlan", "name", "interface range", "switchport mode access", "switchport access vlan", "show vlan brief"],
    topology: {
      devices: [
        { name: "SW1", kind: "switch", hostname: "FL2-SW1", x: 500, y: 150 },
        pc("PC-S1", 170, 400, "192.168.10.11"), pc("PC-S2", 390, 400, "192.168.10.12"),
        pc("PC-E1", 610, 400, "192.168.20.11"), pc("PC-E2", 830, 400, "192.168.20.12"),
      ],
      links: ["SW1:fa0/1 PC-S1", "SW1:fa0/2 PC-S2", "SW1:fa0/3 PC-E1", "SW1:fa0/4 PC-E2"],
    },
    objectives: [
      { text: "VLAN 10 exists and is named `SALES`", check: C.vlan("SW1", 10, "SALES") },
      { text: "VLAN 20 exists and is named `ENG`", check: C.vlan("SW1", 20, "ENG") },
      { text: "Fa0/1 and Fa0/2 are access ports in VLAN 10", check: C.accessVlan("SW1", ["fa0/1", "fa0/2"], 10) },
      { text: "Fa0/3 and Fa0/4 are access ports in VLAN 20", check: C.accessVlan("SW1", ["fa0/3", "fa0/4"], 20) },
      { text: "PC-S1 can ping PC-S2, and PC-E1 can ping PC-E2", check: C.all(C.ping("PC-S1", "192.168.10.12"), C.ping("PC-E1", "192.168.20.12")) },
    ],
    hints: [
      "VLANs are created in global configuration with `vlan 10`; that opens a sub-mode where `name SALES` works.",
      "`interface range fa0/1 - 2` configures both ports at once. Each needs `switchport mode access` and `switchport access vlan 10`.",
      "Check the result with `show vlan brief`: each VLAN lists the ports assigned to it.",
    ],
    solution: [{ on: "SW1", cmds: ["enable", "configure terminal", "vlan 10", "name SALES", "vlan 20", "name ENG", "exit", "interface range fa0/1 - 2", "switchport mode access", "switchport access vlan 10", "interface range fa0/3 - 4", "switchport mode access", "switchport access vlan 20", "end"] }],
    debrief: "A VLAN is a separate broadcast domain. Without a router (or layer 3 switch), hosts in VLAN 10 and VLAN 20 cannot talk to each other at all, even on the same switch.",
  },

  {
    id: "trunk-line", tier: 2, type: "lab", xp: 180, par: 540,
    title: "Trunk Line",
    from: "Priya Raman, Service Desk",
    subject: "New switch on floor 3: users can't reach their teams",
    brief: [
      "Facilities racked a second switch, **FL3-SW2**, and uplinked it to FL2-SW1 on the gigabit ports. The floor 3 users are in Sales and Engineering too, but they can't reach their teammates downstairs.",
      "FL2-SW1 already has the VLANs and access ports. Build the same VLANs on the new switch, assign its ports, and turn the link between the switches into an 802.1Q trunk that carries **only** VLANs 10 and 20.",
    ],
    details: [["Uplink", "G0/1 on both switches"], ["FL3-SW2 Fa0/1", "VLAN 10 (SALES)"], ["FL3-SW2 Fa0/2", "VLAN 20 (ENG)"], ["Allowed on trunk", "10 and 20 only"]],
    skills: ["switchport mode trunk", "switchport trunk allowed vlan", "show interfaces trunk"],
    topology: {
      devices: [
        { name: "SW1", kind: "switch", hostname: "FL2-SW1", x: 280, y: 170, config: ["vlan 10", "name SALES", "vlan 20", "name ENG", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20"] },
        { name: "SW2", kind: "switch", hostname: "FL3-SW2", x: 720, y: 170 },
        pc("PC-S1", 160, 410, "192.168.10.11"), pc("PC-E1", 400, 410, "192.168.20.11"),
        pc("PC-S2", 600, 410, "192.168.10.12"), pc("PC-E2", 840, 410, "192.168.20.12"),
      ],
      links: ["SW1:g0/1 SW2:g0/1", "SW1:fa0/1 PC-S1", "SW1:fa0/2 PC-E1", "SW2:fa0/1 PC-S2", "SW2:fa0/2 PC-E2"],
    },
    objectives: [
      { text: "FL3-SW2 has VLAN 10 (SALES) and VLAN 20 (ENG)", check: C.all(C.vlan("SW2", 10, "SALES"), C.vlan("SW2", 20, "ENG")) },
      { text: "FL3-SW2 Fa0/1 is an access port in VLAN 10, Fa0/2 in VLAN 20", check: C.all(C.accessVlan("SW2", ["fa0/1"], 10), C.accessVlan("SW2", ["fa0/2"], 20)) },
      { text: "G0/1 is a trunk on both switches", check: C.all(C.trunk("SW1", "g0/1"), C.trunk("SW2", "g0/1")) },
      { text: "Both trunks allow only VLANs 10 and 20", check: C.all(C.trunkAllows("SW1", "g0/1", [10, 20]), C.trunkAllows("SW2", "g0/1", [10, 20])) },
      { text: "PC-S1 can ping PC-S2 across the trunk", check: C.ping("PC-S1", "192.168.10.12") },
      { text: "PC-E1 can ping PC-E2 across the trunk", check: C.ping("PC-E1", "192.168.20.12") },
    ],
    hints: [
      "A VLAN that doesn't exist on a switch is not forwarded by it, so FL3-SW2 needs VLANs 10 and 20 created locally.",
      "An access port carries one VLAN; a trunk tags frames so it can carry many. Both ends of the link must be trunks: `switchport mode trunk`.",
      "Restrict the trunk with `switchport trunk allowed vlan 10,20` on G0/1 of both switches, then verify with `show interfaces trunk`.",
    ],
    solution: [
      { on: "SW2", cmds: ["enable", "configure terminal", "vlan 10", "name SALES", "vlan 20", "name ENG", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan 10,20", "end"] },
      { on: "SW1", cmds: ["enable", "configure terminal", "interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan 10,20", "end"] },
    ],
    debrief: "`switchport trunk allowed vlan 10,20` replaces the whole list. To add one later without wiping the rest, use `switchport trunk allowed vlan add 30`.",
  },

  {
    id: "router-on-a-stick", tier: 2, type: "lab", xp: 200, par: 540,
    title: "Router on a Stick",
    from: "Dana Okafor, NOC Team Lead",
    subject: "Sales needs to reach the Engineering build server",
    brief: [
      "The VLAN split worked a little too well: Sales can no longer reach anything in Engineering. Traffic between VLANs has to be routed.",
      "HQ-R1 has one spare gigabit port cabled to the switch. Use 802.1Q subinterfaces on that single link, one per VLAN, so the router becomes the default gateway for both. The PCs already point at the .1 address of their subnet.",
    ],
    details: [["Trunk", "FL2-SW1 G0/1 to HQ-R1 G0/0"], ["G0/0.10", "VLAN 10 - 192.168.10.1 /24"], ["G0/0.20", "VLAN 20 - 192.168.20.1 /24"]],
    skills: ["subinterfaces", "encapsulation dot1q", "inter-VLAN routing"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "HQ-R1", x: 500, y: 90 },
        { name: "SW1", kind: "switch", hostname: "FL2-SW1", x: 500, y: 250, config: ["vlan 10", "name SALES", "vlan 20", "name ENG", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20"] },
        pc("PC-S1", 300, 420, "192.168.10.11", "192.168.10.1"), pc("PC-E1", 700, 420, "192.168.20.11", "192.168.20.1"),
      ],
      links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC-S1", "SW1:fa0/2 PC-E1"],
    },
    objectives: [
      { text: "FL2-SW1 G0/1 is a trunk", check: C.trunk("SW1", "g0/1") },
      { text: "HQ-R1 G0/0 is up/up", check: C.ifaceUp("R1", "g0/0") },
      { text: "G0/0.10 tags VLAN 10 and has 192.168.10.1/24", check: C.all(C.dot1q("R1", "g0/0.10", 10), C.ifaceIp("R1", "g0/0.10", "192.168.10.1", M24)) },
      { text: "G0/0.20 tags VLAN 20 and has 192.168.20.1/24", check: C.all(C.dot1q("R1", "g0/0.20", 20), C.ifaceIp("R1", "g0/0.20", "192.168.20.1", M24)) },
      { text: "PC-S1 can ping PC-E1", check: C.ping("PC-S1", "192.168.20.11") },
      { text: "Save HQ-R1's configuration", check: C.saved("R1") },
    ],
    hints: [
      "Three pieces: the switch port facing the router must be a trunk, the physical router port must be up, and each VLAN needs its own subinterface.",
      "Create a subinterface with `interface g0/0.10`. It needs `encapsulation dot1q 10` *before* it will accept an IP address for that VLAN.",
      "The physical interface gets no IP address, only `no shutdown`. Check with `show ip interface brief` on the router and `show interfaces trunk` on the switch.",
    ],
    solution: [
      { on: "SW1", cmds: ["enable", "configure terminal", "interface g0/1", "switchport mode trunk", "end"] },
      { on: "R1", cmds: ["enable", "configure terminal", "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1q 20", "ip address 192.168.20.1 255.255.255.0", "end", "write memory"] },
    ],
    debrief: "The subinterface number (.10) is only a label; the VLAN is chosen by `encapsulation dot1q`. Matching them is a convention that makes configs readable.",
  },

  {
    id: "port-security", tier: 2, type: "lab", xp: 220, par: 600,
    title: "Rogue in the Lobby",
    from: "Marcus Lindqvist, Security",
    subject: "Visitor plugged a laptop into a lobby kiosk port",
    brief: [
      "Reception caught a visitor unplugging a kiosk and connecting their own laptop. Nothing was taken, but the lobby switch needs hardening today.",
      "On the two kiosk ports: allow only one MAC address, learn it automatically and keep it (sticky), and drop frames from any other device while logging the attempt, without shutting the port. Treat them as edge ports for spanning tree. Finally, shut down every unused access port.",
    ],
    details: [["Kiosk ports", "Fa0/1 and Fa0/2"], ["Maximum MACs", "1, sticky"], ["Violation action", "restrict"], ["Edge protection", "PortFast + BPDU Guard"], ["Unused ports", "Fa0/3 to Fa0/8: shut down"]],
    skills: ["switchport port-security", "violation restrict", "mac-address sticky", "spanning-tree portfast", "bpduguard", "shutdown"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "HQ-R1", x: 500, y: 90, config: ["interface g0/0", "ip address 192.168.30.1 255.255.255.0", "no shutdown"] },
        { name: "SW1", kind: "switch", hostname: "LOBBY-SW1", x: 500, y: 250 },
        pc("KIOSK1", 300, 420, "192.168.30.11", "192.168.30.1"), pc("KIOSK2", 700, 420, "192.168.30.12", "192.168.30.1"),
      ],
      links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 KIOSK1", "SW1:fa0/2 KIOSK2"],
    },
    objectives: [
      { text: "Fa0/1 and Fa0/2 are static access ports", check: net => ["FastEthernet0/1", "FastEthernet0/2"].every(n => net.devs.SW1.ifaces[n].sw.mode === "access") },
      { text: "Port security is on with a maximum of 1 sticky MAC address", check: C.portSecurity("SW1", ["fa0/1", "fa0/2"], { max: 1, sticky: true }) },
      { text: "The violation mode is `restrict`", check: C.portSecurity("SW1", ["fa0/1", "fa0/2"], { violation: "restrict" }) },
      { text: "PortFast and BPDU Guard are enabled on both kiosk ports", check: C.edgePort("SW1", ["fa0/1", "fa0/2"]) },
      { text: "Unused ports Fa0/3 to Fa0/8 are shut down", check: C.ifaceShut("SW1", ["fa0/3", "fa0/4", "fa0/5", "fa0/6", "fa0/7", "fa0/8"]) },
      { text: "The kiosks still reach their gateway", check: C.all(C.ping("KIOSK1", "192.168.30.1"), C.ping("KIOSK2", "192.168.30.1")) },
      { text: "Save the configuration", check: C.saved("SW1") },
    ],
    hints: [
      "Port security is refused on a dynamic port. Set `switchport mode access` first, then `switchport port-security` to turn the feature on.",
      "The feature has sub-options on the same port: `switchport port-security maximum 1`, `... violation restrict`, `... mac-address sticky`.",
      "Edge ports: `spanning-tree portfast` and `spanning-tree bpduguard enable`. Unused ports: `interface range fa0/3 - 8` then `shutdown`. Verify with `show port-security`.",
    ],
    solution: [{ on: "SW1", cmds: ["enable", "configure terminal", "interface range fa0/1 - 2", "switchport mode access", "switchport port-security", "switchport port-security maximum 1", "switchport port-security violation restrict", "switchport port-security mac-address sticky", "spanning-tree portfast", "spanning-tree bpduguard enable", "interface range fa0/3 - 8", "shutdown", "end", "write memory"] }],
    debrief: "Violation modes: `protect` drops silently, `restrict` drops and counts/logs, `shutdown` (the default) err-disables the port until someone re-enables it.",
  },

  {
    id: "root-bridge", tier: 2, type: "lab", xp: 240, par: 780,
    title: "Root of the Problem",
    from: "Dana Okafor, NOC Team Lead",
    skills: ["spanning-tree mode rapid-pvst", "root primary and secondary", "bridge priority", "root guard", "show spanning-tree"],
    ...stpLab({ site: "TOWER", vlans: [{ id: 10, name: "SALES" }, { id: 20, name: "ENG" }], roots: { 10: "DSW1", 20: "DSW1" }, left: 4096, exact: null, guard: true }),
    debrief: "Spanning tree never broke anything here, which is why nobody noticed: with the wrong root the network still works, on a worse path. The root bridge decides which links forward, so it is chosen on purpose, with a backup, and root guard keeps the choice from being overruled by whatever gets plugged in below.",
  },

  {
    id: "rogue-switch", tier: 2, type: "lab", xp: 240, par: 540,
    title: "The Switch Under the Table",
    from: "Marcus Lindqvist, Security",
    skills: ["tracing the root port", "show spanning-tree inconsistentports", "BPDU guard", "err-disabled ports", "show cdp neighbors"],
    ...rogueLab({ site: "TOWER", vlans: [{ id: 10, name: "SALES" }, { id: 20, name: "ENG" }], root: "DSW1", port: 5, rv: 0, prio: 0, guarded: true }),
    debrief: "Two protections did two different jobs. Root guard kept the false root away from the distribution switches, at the price of cutting off the access switch below it. BPDU guard stopped the switch at the port it was plugged into, which is where it should have been stopped in the first place. An err-disabled port stays down: once someone has unplugged the switch, bounce the port with `shutdown` and `no shutdown`.",
  },

  {
    id: "port-channel", tier: 2, type: "lab", xp: 240, par: 660,
    title: "Two Cables, One Link",
    from: "Priya Raman, Service Desk",
    skills: ["channel-group", "LACP active and passive", "interface port-channel", "show etherchannel summary"],
    ...channelLab({ site: "WHARF", vlans: [{ id: 10, name: "SALES" }, { id: 20, name: "ENG" }], ports: ["g0/1", "g0/2"], group: 1, fault: null }),
    debrief: "Adding a cable between two switches adds no bandwidth by itself: spanning tree blocks it. A port channel is one logical port to spanning tree and to the VLAN configuration, so configure the `port-channel` interface and let the switch copy the settings to the members.",
  },

  {
    id: "exam-2", tier: 2, type: "quiz", xp: 180, par: 720,
    title: "Access Layer Sign-off",
    from: "Dana Okafor, NOC Team Lead",
    subject: "Promotion check: network access",
    brief: ["You've been handling the access layer on your own. Pass this check on switching, VLANs and wireless and you join the routing rotation."],
    params: { domains: [2], v2domains: [2], count: 10, pass: 70 },
    v2: { subject: "Promotion check: switching and network access", brief: ["You've been handling the access layer on your own. Pass this check on switching and network access and you join the routing rotation."] },
    skills: ["Network access"],
  },
];
