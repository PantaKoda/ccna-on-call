import { C } from "../checks.js";

const M24 = "255.255.255.0";
const M30 = "255.255.255.252";
const dhcpPc = (name, x, y) => ({ name, kind: "pc", x, y, ip: { mode: "dhcp" } });
const ifc = (n, ip, mask) => [`interface ${n}`, `ip address ${ip} ${mask}`, "no shutdown"];

export default [
  {
    id: "p1-outage", tier: 5, type: "lab", xp: 450, par: 1200,
    title: "P1: Branch Down",
    from: "Incident Bridge",
    subject: "P1 INCIDENT: Riverside branch offline after weekend change",
    brief: [
      "**Priority 1.** The Riverside branch came back from a weekend \"cleanup\" change with nobody able to work. Sales PCs get an address but reach nothing outside their own VLAN. Engineering PCs don't even get an address. Nobody reaches the Internet.",
      "You're the incident lead. There is no change record and **at least five separate faults** across the switch and the router. Work from the symptoms: verify layer 2, then addressing, then routing, then NAT. The ISP side is confirmed healthy.",
      "The design: VLAN 10 (Sales) and VLAN 20 (Engineering) trunked to BR-R1, which routes between them, serves DHCP for both, and PATs both subnets to the Internet.",
    ],
    details: [["VLAN 10 SALES", "192.168.10.0/24, gateway .1"], ["VLAN 20 ENG", "192.168.20.0/24, gateway .1"], ["Trunk", "BR-SW1 G0/1 to BR-R1 G0/0"], ["WAN", "BR-R1 G0/1 203.0.113.2/30, ISP is .1"], ["Internet test", "8.8.8.8"]],
    skills: ["structured troubleshooting", "show interfaces trunk", "show ip dhcp pool", "show ip route", "show ip nat translations", "show access-lists"],
    topology: {
      devices: [
        { name: "ISP", kind: "router", hostname: "ISP", x: 800, y: 110, locked: true, note: "Internet (8.8.8.8)", config: [...ifc("g0/0", "203.0.113.1", M30), "interface loopback0", "ip address 8.8.8.8 255.255.255.255"] },
        {
          name: "R1", kind: "router", hostname: "BR-R1", x: 480, y: 110, config: [
            "interface g0/0", "no shutdown",
            "interface g0/0.10", "encapsulation dot1q 10", "ip address 192.168.10.1 255.255.255.0", "ip nat inside",
            "interface g0/0.20", "encapsulation dot1q 20", "ip address 192.168.20.1 255.255.255.0",
            ...ifc("g0/1", "203.0.113.2", M30), "ip nat outside", "exit",
            "ip dhcp excluded-address 192.168.10.1 192.168.10.10", "ip dhcp excluded-address 192.168.20.1 192.168.20.10",
            "ip dhcp pool SALES", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.254", "dns-server 8.8.8.8",
            "ip dhcp pool ENG", "network 192.168.20.0 255.255.255.0", "default-router 192.168.20.1", "dns-server 8.8.8.8", "exit",
            "access-list 1 permit 192.168.10.0 0.0.0.255",
            "ip nat inside source list 1 interface g0/1 overload",
            "ip route 0.0.0.0 0.0.0.0 203.0.113.6",
          ],
        },
        { name: "SW1", kind: "switch", hostname: "BR-SW1", x: 480, y: 270, config: ["vlan 10", "name SALES", "vlan 20", "name ENG", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan 10"] },
        dhcpPc("PC-S1", 300, 430), dhcpPc("PC-E1", 660, 430),
      ],
      links: ["R1:g0/1 ISP:g0/0", "R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC-S1", "SW1:fa0/2 PC-E1"],
    },
    objectives: [
      { text: "PC-E1 gets a DHCP lease in 192.168.20.0/24", check: C.dhcpLease("PC-E1", "192.168.20.0/24", 11) },
      { text: "PC-S1 can ping PC-E1 (inter-VLAN routing works)", check: C.pingHost("PC-S1", "PC-E1") },
      { text: "PC-S1 can ping 8.8.8.8", check: C.ping("PC-S1", "8.8.8.8") },
      { text: "PC-E1 can ping 8.8.8.8", check: C.ping("PC-E1", "8.8.8.8") },
      { text: "Save BR-R1 and BR-SW1 so the fix survives a reload", check: C.all(C.savedChanged("R1"), C.savedChanged("SW1")) },
    ],
    hints: [
      "Layer 2 first: `show interfaces trunk` on BR-SW1. Is every VLAN the branch uses allowed on the uplink? Then on PC-S1, `ipconfig`: does the default gateway it received actually exist?",
      "On BR-R1, `show ip route`: is there a gateway of last resort? A static route whose next hop isn't in a connected subnet never makes it into the table. Compare the next hop with the WAN subnet.",
      "NAT needs every inside interface marked and every inside subnet in the ACL. Check `show running-config | include nat` and `show access-lists`: is VLAN 20 covered by both?",
    ],
    solution: [
      { on: "SW1", cmds: ["enable", "configure terminal", "interface g0/1", "switchport trunk allowed vlan add 20", "end", "write memory"] },
      { on: "R1", cmds: ["enable", "configure terminal", "ip dhcp pool SALES", "default-router 192.168.10.1", "exit", "interface g0/0.20", "ip nat inside", "exit", "access-list 1 permit 192.168.20.0 0.0.0.255", "no ip route 0.0.0.0 0.0.0.0 203.0.113.6", "ip route 0.0.0.0 0.0.0.0 203.0.113.1", "end", "write memory"] },
    ],
    debrief: "The five faults: VLAN 20 missing from the trunk, a wrong default-router in the SALES pool, a default route pointing at a next hop outside the WAN subnet, VLAN 20 missing from the NAT ACL, and `ip nat inside` missing on G0/0.20. Working bottom-up through the layers finds each of them in order.",
  },

  {
    id: "greenfield-branch", tier: 5, type: "lab", xp: 600, par: 1800,
    title: "Greenfield",
    from: "Dana Okafor, NOC Team Lead",
    subject: "Build the Harbour branch from the design document",
    brief: [
      "Your last ticket before the certification board. The Harbour branch opens Monday, and the router and switch are racked, cabled and completely blank. Build the whole site from the design below.",
      "HQ and the ISP are already configured. HQ-R1 runs OSPF area 0 on the WAN link, originates a default route, and does the Internet NAT for every 192.168.x.x network, so the branch just needs to join OSPF and advertise its networks.",
      "No step-by-step this time. Read the design, plan your order of work, and verify as you go.",
    ],
    details: [
      ["Hostnames", "BR-R1 and BR-SW1"],
      ["VLAN 10 STAFF", "192.168.110.0/24 - BR-SW1 Fa0/1"],
      ["VLAN 20 WAREHOUSE", "192.168.120.0/24 - BR-SW1 Fa0/2"],
      ["VLAN 99 MGMT", "192.168.199.0/24 - switch SVI is .2"],
      ["Gateways", ".1 of each VLAN on BR-R1 G0/0 subinterfaces (.10, .20, .99)"],
      ["Trunk", "BR-SW1 G0/1 to BR-R1 G0/0"],
      ["DHCP", "BR-R1 serves VLAN 10 and 20; exclude .1 to .10; DNS 8.8.8.8"],
      ["WAN", "BR-R1 G0/1 = 10.255.0.2/30 (HQ-R1 is .1)"],
      ["OSPF", "process 1, router-id 2.2.2.2, area 0, advertise the WAN link and all three VLAN subnets"],
      ["SSH", "domain kestrel.lan, user admin (secret), 2048-bit keys, VTY: SSH only + local login"],
      ["Finally", "save both devices"],
    ],
    skills: ["everything so far: VLANs, trunks, router-on-a-stick, DHCP, OSPF, SSH, management SVI"],
    topology: {
      devices: [
        { name: "ISP", kind: "router", hostname: "ISP", x: 880, y: 90, locked: true, note: "Internet (8.8.8.8)", config: [...ifc("g0/0", "203.0.113.1", M30), "interface loopback0", "ip address 8.8.8.8 255.255.255.255"] },
        {
          name: "HQ-R1", kind: "router", hostname: "HQ-R1", x: 620, y: 90, locked: true, note: "Headquarters (pre-configured)", config: [
            ...ifc("g0/0", "10.0.0.1", M24), "ip nat inside", ...ifc("g0/1", "10.255.0.1", M30), "ip nat inside", ...ifc("g0/2", "203.0.113.2", M30), "ip nat outside", "exit",
            "router ospf 1", "router-id 1.1.1.1", "network 10.0.0.0 0.0.0.255 area 0", "network 10.255.0.0 0.0.0.3 area 0", "passive-interface g0/0", "default-information originate", "exit",
            "ip route 0.0.0.0 0.0.0.0 203.0.113.1",
            "access-list 1 permit 192.168.0.0 0.0.255.255", "access-list 1 permit 10.0.0.0 0.0.0.255",
            "ip nat inside source list 1 interface g0/2 overload",
          ],
        },
        { name: "SRV1", kind: "server", x: 520, y: 250, note: "Kestrel Freight intranet portal", services: ["http"], ip: { mode: "static", ip: "10.0.0.10", mask: M24, gw: "10.0.0.1" } },
        { name: "ADMIN-PC", kind: "pc", x: 720, y: 250, ip: { mode: "static", ip: "10.0.0.50", mask: M24, gw: "10.0.0.1" } },
        { name: "HQ-SW", kind: "switch", hostname: "HQ-SW1", x: 620, y: 190, locked: true },
        { name: "BR-R1", kind: "router", hostname: "Router", x: 250, y: 90 },
        { name: "BR-SW1", kind: "switch", hostname: "Switch", x: 250, y: 270 },
        dhcpPc("PC-B1", 130, 440), dhcpPc("PC-B2", 370, 440),
      ],
      links: ["HQ-R1:g0/2 ISP:g0/0", "HQ-R1:g0/1 BR-R1:g0/1", "HQ-R1:g0/0 HQ-SW:g0/1", "HQ-SW:fa0/1 SRV1", "HQ-SW:fa0/2 ADMIN-PC", "BR-R1:g0/0 BR-SW1:g0/1", "BR-SW1:fa0/1 PC-B1", "BR-SW1:fa0/2 PC-B2"],
    },
    objectives: [
      { text: "Hostnames are `BR-R1` and `BR-SW1`", check: C.all(C.hostname("BR-R1", "BR-R1"), C.hostname("BR-SW1", "BR-SW1")) },
      { text: "VLANs 10 STAFF, 20 WAREHOUSE and 99 MGMT exist on the switch", check: C.all(C.vlan("BR-SW1", 10, "STAFF"), C.vlan("BR-SW1", 20, "WAREHOUSE"), C.vlan("BR-SW1", 99, "MGMT")) },
      { text: "Fa0/1 is an access port in VLAN 10, Fa0/2 in VLAN 20, G0/1 is a trunk", check: C.all(C.accessVlan("BR-SW1", ["fa0/1"], 10), C.accessVlan("BR-SW1", ["fa0/2"], 20), C.trunk("BR-SW1", "g0/1")) },
      { text: "BR-R1 routes all three VLANs on G0/0 subinterfaces", check: C.all(C.ifaceIp("BR-R1", "g0/0.10", "192.168.110.1", M24), C.ifaceIp("BR-R1", "g0/0.20", "192.168.120.1", M24), C.ifaceIp("BR-R1", "g0/0.99", "192.168.199.1", M24), C.ifaceUp("BR-R1", "g0/0.99")) },
      { text: "PC-B1 and PC-B2 lease addresses above .10 in their VLANs", check: C.all(C.dhcpLease("PC-B1", "192.168.110.0/24", 11), C.dhcpLease("PC-B2", "192.168.120.0/24", 11)) },
      { text: "BR-R1 is a FULL OSPF neighbour of HQ-R1 with router ID 2.2.2.2", check: C.all(C.ospfNeighbor("BR-R1", "HQ-R1"), C.routerId("BR-R1", "2.2.2.2")) },
      { text: "HQ-R1 learns all three branch subnets through OSPF", check: C.all(C.hasRoute("HQ-R1", "192.168.110.0/24", "O"), C.hasRoute("HQ-R1", "192.168.120.0/24", "O"), C.hasRoute("HQ-R1", "192.168.199.0/24", "O")) },
      { text: "PC-B1 reaches the HQ portal (10.0.0.10) and PC-B2 reaches 8.8.8.8", check: C.all(C.tcp("PC-B1", "10.0.0.10", 80), C.ping("PC-B2", "8.8.8.8")) },
      { text: "ADMIN-PC at HQ can ping the switch management address 192.168.199.2", check: C.ping("ADMIN-PC", "192.168.199.2") },
      { text: "ADMIN-PC can SSH to BR-R1 (10.255.0.2) as `admin`; Telnet is refused", check: C.all(C.ssh("ADMIN-PC", "10.255.0.2", "admin"), C.noTelnet("ADMIN-PC", "10.255.0.2"), C.rsaBits("BR-R1", 2048)) },
      { text: "Both devices are saved", check: C.all(C.saved("BR-R1"), C.saved("BR-SW1")) },
    ],
    hints: [
      "A workable order: switch first (hostname, VLANs, access ports, trunk), then the router's subinterfaces, then DHCP, then the WAN interface and OSPF, then SSH, then the switch SVI and gateway, then save both.",
      "The switch SVI is `interface vlan 99` with 192.168.199.2/24 plus `ip default-gateway 192.168.199.1`. It only comes up once VLAN 99 exists and is carried on an active port (the trunk).",
      "OSPF on BR-R1: `router ospf 1`, `router-id 2.2.2.2`, `network 10.255.0.0 0.0.0.3 area 0`, and one network statement per VLAN subnet (wildcard 0.0.0.255). No static default is needed: HQ originates one into OSPF.",
    ],
    solution: [
      {
        on: "BR-SW1", cmds: ["enable", "configure terminal", "hostname BR-SW1", "vlan 10", "name STAFF", "vlan 20", "name WAREHOUSE", "vlan 99", "name MGMT", "exit",
          "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20",
          "interface g0/1", "switchport mode trunk", "interface vlan 99", "ip address 192.168.199.2 255.255.255.0", "no shutdown", "exit", "ip default-gateway 192.168.199.1", "end", "write memory"],
      },
      {
        on: "BR-R1", cmds: ["enable", "configure terminal", "hostname BR-R1", "interface g0/0", "no shutdown",
          "interface g0/0.10", "encapsulation dot1q 10", "ip address 192.168.110.1 255.255.255.0",
          "interface g0/0.20", "encapsulation dot1q 20", "ip address 192.168.120.1 255.255.255.0",
          "interface g0/0.99", "encapsulation dot1q 99", "ip address 192.168.199.1 255.255.255.0",
          "interface g0/1", "ip address 10.255.0.2 255.255.255.252", "no shutdown", "exit",
          "ip dhcp excluded-address 192.168.110.1 192.168.110.10", "ip dhcp excluded-address 192.168.120.1 192.168.120.10",
          "ip dhcp pool STAFF", "network 192.168.110.0 255.255.255.0", "default-router 192.168.110.1", "dns-server 8.8.8.8",
          "ip dhcp pool WAREHOUSE", "network 192.168.120.0 255.255.255.0", "default-router 192.168.120.1", "dns-server 8.8.8.8", "exit",
          "router ospf 1", "router-id 2.2.2.2", "network 10.255.0.0 0.0.0.3 area 0", "network 192.168.110.0 0.0.0.255 area 0", "network 192.168.120.0 0.0.0.255 area 0", "network 192.168.199.0 0.0.0.255 area 0", "exit",
          "ip domain-name kestrel.lan", "username admin secret Harb0ur!Ops", "crypto key generate rsa modulus 2048", "ip ssh version 2",
          "line vty 0 4", "transport input ssh", "login local", "end", "write memory"],
      },
    ],
    debrief: "That was a complete small-branch build: layer 2 segmentation, inter-VLAN routing, address services, dynamic routing and secure management. This is the shape of most real deployment tickets, and of the CCNA lab questions.",
  },

  {
    id: "exam-5", tier: 5, type: "quiz", xp: 400, par: 1200,
    title: "Certification Board",
    from: "Kestrel Freight CTO Office",
    subject: "Final review: all six exam domains",
    brief: ["The last gate. Fifteen questions across all six CCNA domains, including automation and programmability. Pass and you make Network Architect."],
    params: { domains: [1, 2, 3, 4, 5, 6], count: 15, pass: 75 },
    skills: ["All six CCNA domains"],
  },
];
