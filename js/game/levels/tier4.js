import { C } from "../checks.js";

const M24 = "255.255.255.0";
const M30 = "255.255.255.252";
const pc = (name, x, y, ip, gw) => ({ name, kind: "pc", x, y, ip: { mode: "static", ip, mask: M24, gw } });
const dhcpPc = (name, x, y) => ({ name, kind: "pc", x, y, ip: { mode: "dhcp" } });
const ifc = (n, ip, mask) => [`interface ${n}`, `ip address ${ip} ${mask}`, "no shutdown"];

export default [
  {
    id: "dhcp-pools", tier: 4, type: "lab", xp: 260, par: 660,
    title: "Hand Out the Addresses",
    from: "Priya Raman, Service Desk",
    subject: "New PCs come up with 169.254 addresses",
    brief: [
      "The old DHCP server was decommissioned on Friday. Every PC that restarted since then gave itself a 169.254.x.x address and can't reach anything.",
      "Make **HQ-R1** the DHCP server for both LANs. Keep the first ten addresses of each subnet out of the pools: they're reserved for gateways, printers and switches. Clients need a default gateway and DNS server too.",
      "Open a PC and run `ipconfig` to watch it pick up a lease.",
    ],
    details: [["Staff LAN (G0/0)", "192.168.10.0/24, gateway .1"], ["Guest LAN (G0/1)", "192.168.20.0/24, gateway .1"], ["Reserved in each", ".1 to .10"], ["DNS server", "8.8.8.8"], ["Printer", "192.168.10.5 (static)"]],
    skills: ["ip dhcp excluded-address", "ip dhcp pool", "network", "default-router", "dns-server", "show ip dhcp binding"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "HQ-R1", x: 500, y: 90, config: [...ifc("g0/0", "192.168.10.1", M24), ...ifc("g0/1", "192.168.20.1", M24)] },
        { name: "SW1", kind: "switch", hostname: "STAFF-SW", x: 280, y: 240 },
        { name: "SW2", kind: "switch", hostname: "GUEST-SW", x: 720, y: 240 },
        dhcpPc("PC-S1", 130, 420), dhcpPc("PC-S2", 300, 420),
        { name: "PRN1", kind: "server", x: 460, y: 420, note: "Printer", ip: { mode: "static", ip: "192.168.10.5", mask: M24, gw: "192.168.10.1" } },
        dhcpPc("PC-G1", 720, 420),
      ],
      links: ["R1:g0/0 SW1:g0/1", "R1:g0/1 SW2:g0/1", "SW1:fa0/1 PC-S1", "SW1:fa0/2 PC-S2", "SW1:fa0/3 PRN1", "SW2:fa0/1 PC-G1"],
    },
    objectives: [
      { text: "PC-S1 and PC-S2 lease addresses in 192.168.10.0/24 above .10", check: C.all(C.dhcpLease("PC-S1", "192.168.10.0/24", 11), C.dhcpLease("PC-S2", "192.168.10.0/24", 11)) },
      { text: "PC-G1 leases an address in 192.168.20.0/24 above .10", check: C.dhcpLease("PC-G1", "192.168.20.0/24", 11) },
      { text: "Staff clients receive their default gateway (PC-S1 can ping 192.168.20.1)", check: C.ping("PC-S1", "192.168.20.1") },
      { text: "Guest clients receive their default gateway (PC-G1 can ping the printer)", check: C.ping("PC-G1", "192.168.10.5") },
      { text: "Both pools hand out DNS server 8.8.8.8", check: net => ["PC-S1", "PC-G1"].every(p => net.st.pcs[p].dns === ((8 << 24) | (8 << 16) | (8 << 8) | 8) >>> 0) },
    ],
    hints: [
      "Exclusions are global commands and come first: `ip dhcp excluded-address 192.168.10.1 192.168.10.10`. Then each subnet gets its own `ip dhcp pool <NAME>`.",
      "Inside a pool: `network 192.168.10.0 255.255.255.0`, `default-router 192.168.10.1`, `dns-server 8.8.8.8`. The router matches a pool to the interface the request arrived on.",
      "Run `ipconfig /all` on a PC to see the lease and where it came from, and `show ip dhcp binding` on the router to list what was handed out.",
    ],
    solution: [{ on: "R1", cmds: ["enable", "configure terminal", "ip dhcp excluded-address 192.168.10.1 192.168.10.10", "ip dhcp excluded-address 192.168.20.1 192.168.20.10", "ip dhcp pool STAFF", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 8.8.8.8", "ip dhcp pool GUEST", "network 192.168.20.0 255.255.255.0", "default-router 192.168.20.1", "dns-server 8.8.8.8", "end"] }],
    debrief: "A 169.254.x.x (APIPA) address on a Windows PC means \"I asked for DHCP and nobody answered\". It's a symptom of the DHCP path, never a valid address to troubleshoot from.",
  },

  {
    id: "nat-edge", tier: 4, type: "lab", xp: 300, par: 780,
    title: "One Address, Many Hosts",
    from: "Dana Okafor, NOC Team Lead",
    subject: "New Internet circuit: configure NAT on the edge",
    brief: [
      "The new Internet circuit is live on **EDGE-R1**. Routing works as far as the ISP, but the ISP has no idea where 192.168.1.0/24 is (private addresses aren't routed on the Internet), so nothing comes back.",
      "Configure **PAT** so every inside host shares the router's outside address. Then publish the web server: outside users must reach it on the public address 203.0.113.5.",
    ],
    details: [["Inside", "G0/0 - 192.168.1.0/24"], ["Outside", "G0/1 - 203.0.113.2/29"], ["PAT", "all of 192.168.1.0/24, overload on G0/1"], ["Web server", "192.168.1.100 published as 203.0.113.5"], ["Tests", "PCs ping 8.8.8.8; REMOTE-USER runs curl http://203.0.113.5"]],
    skills: ["ip nat inside / outside", "access-list", "ip nat inside source list ... overload", "ip nat inside source static", "show ip nat translations"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "EDGE-R1", x: 430, y: 170, config: [...ifc("g0/0", "192.168.1.1", M24), ...ifc("g0/1", "203.0.113.2", "255.255.255.248"), "ip route 0.0.0.0 0.0.0.0 203.0.113.1"] },
        { name: "ISP", kind: "router", hostname: "ISP", x: 720, y: 170, locked: true, note: "Internet (8.8.8.8)", config: [...ifc("g0/0", "203.0.113.1", "255.255.255.248"), ...ifc("g0/1", "198.51.100.1", M24), "interface loopback0", "ip address 8.8.8.8 255.255.255.255"] },
        { name: "SW1", kind: "switch", hostname: "LAN-SW1", x: 300, y: 300 },
        pc("PC1", 110, 440, "192.168.1.10", "192.168.1.1"), pc("PC2", 300, 440, "192.168.1.11", "192.168.1.1"),
        { name: "SRV-WEB", kind: "server", x: 490, y: 440, note: "Kestrel Freight customer portal", services: ["http"], ip: { mode: "static", ip: "192.168.1.100", mask: M24, gw: "192.168.1.1" } },
        pc("REMOTE-USER", 880, 360, "198.51.100.50", "198.51.100.1"),
      ],
      links: ["R1:g0/0 SW1:g0/1", "R1:g0/1 ISP:g0/0", "ISP:g0/1 REMOTE-USER", "SW1:fa0/1 PC1", "SW1:fa0/2 PC2", "SW1:fa0/3 SRV-WEB"],
    },
    objectives: [
      { text: "G0/0 is the NAT inside interface and G0/1 is outside", check: C.all(C.natRole("R1", "g0/0", "inside"), C.natRole("R1", "g0/1", "outside")) },
      { text: "A PAT (overload) rule exists on EDGE-R1", check: C.natOverload("R1") },
      { text: "PC1 and PC2 can ping 8.8.8.8", check: C.all(C.ping("PC1", "8.8.8.8"), C.ping("PC2", "8.8.8.8")) },
      { text: "The web server is statically mapped to 203.0.113.5", check: C.natStatic("R1", "192.168.1.100", "203.0.113.5") },
      { text: "REMOTE-USER can load http://203.0.113.5", check: C.tcp("REMOTE-USER", "203.0.113.5", 80) },
    ],
    hints: [
      "NAT needs three things: interfaces marked `ip nat inside` / `ip nat outside`, an ACL that says *which* inside addresses to translate, and a rule that ties them together.",
      "`access-list 1 permit 192.168.1.0 0.0.0.255`, then `ip nat inside source list 1 interface g0/1 overload`. `overload` is what makes it PAT.",
      "The server needs a one-to-one mapping that also works for connections coming *in*: `ip nat inside source static 192.168.1.100 203.0.113.5`. Check with `show ip nat translations` after a ping.",
    ],
    solution: [{ on: "R1", cmds: ["enable", "configure terminal", "access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat inside source list 1 interface g0/1 overload", "ip nat inside source static 192.168.1.100 203.0.113.5", "interface g0/0", "ip nat inside", "interface g0/1", "ip nat outside", "end"] }],
    debrief: "Inside local = the private address, inside global = how the host appears outside. PAT keeps conversations apart by port number, so thousands of hosts can share one inside global address.",
  },

  {
    id: "acl-guard", tier: 4, type: "lab", xp: 320, par: 840,
    title: "Guests Stay in the Lobby",
    from: "Marcus Lindqvist, Security",
    subject: "Guest Wi-Fi can reach the server VLAN",
    brief: [
      "A penetration tester sat in reception, joined the guest network, and pinged the file servers. Guest traffic must be fenced in **today**.",
      "Write one extended ACL and apply it where guest traffic enters the router. The policy, in order of importance: guests may use the intranet portal over HTTP; guests may reach nothing else on the server LAN and nothing at all on the staff LAN; guests keep their Internet access. Staff must be unaffected.",
    ],
    details: [["Guest LAN", "192.168.20.0/24 on G0/1"], ["Staff LAN", "192.168.10.0/24 on G0/0"], ["Server LAN", "10.0.0.0/24 on G0/2"], ["Intranet portal", "10.0.0.10, TCP port 80"], ["Internet test", "8.8.8.8"]],
    skills: ["ip access-list extended", "permit tcp ... eq", "deny ip", "implicit deny", "ip access-group ... in", "show access-lists"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "HQ-R1", x: 480, y: 220, config: [...ifc("g0/0", "192.168.10.1", M24), ...ifc("g0/1", "192.168.20.1", M24), ...ifc("g0/2", "10.0.0.1", M24), ...ifc("s0/0/0", "203.0.113.2", M30), "ip route 0.0.0.0 0.0.0.0 203.0.113.1"] },
        { name: "ISP", kind: "router", hostname: "ISP", x: 820, y: 220, locked: true, note: "Internet (8.8.8.8)", config: [...ifc("s0/0/0", "203.0.113.1", M30), "interface loopback0", "ip address 8.8.8.8 255.255.255.255", "ip route 192.168.0.0 255.255.0.0 203.0.113.2", "ip route 10.0.0.0 255.255.255.0 203.0.113.2"] },
        pc("PC-STAFF", 180, 110, "192.168.10.10", "192.168.10.1"),
        pc("PC-GUEST", 180, 340, "192.168.20.10", "192.168.20.1"),
        { name: "SRV1", kind: "server", x: 480, y: 440, note: "Kestrel Freight intranet portal", services: ["http"], ip: { mode: "static", ip: "10.0.0.10", mask: M24, gw: "10.0.0.1" } },
      ],
      links: ["R1:g0/0 PC-STAFF", "R1:g0/1 PC-GUEST", "R1:g0/2 SRV1", "R1:s0/0/0 ISP:s0/0/0"],
    },
    objectives: [
      { text: "An ACL is applied inbound on the guest interface (G0/1)", check: C.aclApplied("R1", "g0/1", "in") },
      { text: "PC-GUEST can load the portal: `curl http://10.0.0.10`", check: C.tcp("PC-GUEST", "10.0.0.10", 80) },
      { text: "PC-GUEST cannot ping the server", check: C.all(C.noPing("PC-GUEST", "10.0.0.10"), C.ifaceUp("R1", "g0/2")) },
      { text: "PC-GUEST cannot ping the staff PC", check: C.all(C.noPing("PC-GUEST", "192.168.10.10"), C.ifaceUp("R1", "g0/0")) },
      { text: "PC-GUEST can still ping the Internet (8.8.8.8)", check: C.ping("PC-GUEST", "8.8.8.8") },
      { text: "PC-STAFF is unaffected: it pings the server and the Internet", check: C.all(C.ping("PC-STAFF", "10.0.0.10"), C.ping("PC-STAFF", "8.8.8.8")) },
    ],
    hints: [
      "ACLs are read top-down and stop at the first match, and every ACL ends in an invisible `deny ip any any`. Put the narrow permit first, then the denies, then a final `permit ip any any`.",
      "Start with `ip access-list extended GUEST-IN`. The first line: `permit tcp 192.168.20.0 0.0.0.255 host 10.0.0.10 eq 80`.",
      "Then `deny ip 192.168.20.0 0.0.0.255 10.0.0.0 0.0.0.255`, `deny ip 192.168.20.0 0.0.0.255 192.168.10.0 0.0.0.255`, `permit ip any any`. Apply it with `ip access-group GUEST-IN in` on G0/1.",
    ],
    solution: [{ on: "R1", cmds: ["enable", "configure terminal", "ip access-list extended GUEST-IN", "permit tcp 192.168.20.0 0.0.0.255 host 10.0.0.10 eq 80", "deny ip 192.168.20.0 0.0.0.255 10.0.0.0 0.0.0.255", "deny ip 192.168.20.0 0.0.0.255 192.168.10.0 0.0.0.255", "permit ip any any", "interface g0/1", "ip access-group GUEST-IN in", "end"] }],
    debrief: "Extended ACLs belong close to the source so unwanted traffic is dropped before it is routed. `show access-lists` shows a match counter on every line, which tells you which rule a packet actually hit.",
  },

  {
    id: "ssh-hardening", tier: 4, type: "lab", xp: 320, par: 840,
    title: "No More Telnet",
    from: "Marcus Lindqvist, Security",
    subject: "Audit finding: management over Telnet with a shared password",
    brief: [
      "HQ-R1 still accepts **Telnet** with a shared line password, so every keystroke crosses the network in clear text. The audit deadline is tomorrow.",
      "Move remote management to **SSH version 2** with a named local account, refuse Telnet, and only accept management sessions from the management subnet.",
      "Try it from ADMIN-PC when you're done: `ssh -l admin 10.0.99.1`.",
    ],
    details: [["Domain name", "kestrel.lan"], ["Local user", "admin, with a secret of your choice"], ["RSA key size", "2048 bits"], ["VTY lines 0-4", "SSH only, local login"], ["Allowed source", "10.0.99.0/24 only (standard ACL 10 on the VTY lines)"]],
    skills: ["ip domain-name", "username ... secret", "crypto key generate rsa", "ip ssh version 2", "transport input ssh", "login local", "access-class"],
    topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "HQ-R1", x: 500, y: 150, config: [...ifc("g0/0", "10.0.99.1", M24), ...ifc("g0/1", "192.168.10.1", M24), "line vty 0 4", "password cisco", "login", "transport input telnet"], saved: false },
        pc("ADMIN-PC", 280, 380, "10.0.99.10", "10.0.99.1"),
        pc("PC-USER", 720, 380, "192.168.10.10", "192.168.10.1"),
      ],
      links: ["R1:g0/0 ADMIN-PC", "R1:g0/1 PC-USER"],
    },
    objectives: [
      { text: "The domain name is `kestrel.lan`", check: C.domainName("R1", "kestrel.lan") },
      { text: "A local user `admin` exists with a secret", check: C.userSecret("R1", "admin") },
      { text: "RSA keys of at least 2048 bits are generated", check: C.rsaBits("R1", 2048) },
      { text: "SSH version 2 is enforced", check: C.sshV2("R1") },
      { text: "ADMIN-PC can open an SSH session as `admin`", check: C.ssh("ADMIN-PC", "10.0.99.1", "admin") },
      { text: "Telnet to HQ-R1 is refused", check: C.noTelnet("ADMIN-PC", "10.0.99.1") },
      { text: "PC-USER (outside the management subnet) cannot SSH in", check: C.all(C.noSsh("PC-USER", "192.168.10.1"), C.ping("PC-USER", "192.168.10.1")) },
      { text: "Save the configuration", check: C.saved("R1") },
    ],
    hints: [
      "RSA keys are named after hostname + domain, so `ip domain-name kestrel.lan` comes before `crypto key generate rsa modulus 2048`. Create the account with `username admin secret <password>`.",
      "On the VTY lines (`line vty 0 4`): `transport input ssh` refuses Telnet, and `login local` makes the lines use the local username database instead of the line password.",
      "Restrict the source with a standard ACL applied to the lines, not to an interface: `access-list 10 permit 10.0.99.0 0.0.0.255`, then `access-class 10 in` under `line vty 0 4`.",
    ],
    solution: [{ on: "R1", cmds: ["enable", "configure terminal", "ip domain-name kestrel.lan", "username admin secret Str0ng!Pass", "crypto key generate rsa modulus 2048", "ip ssh version 2", "access-list 10 permit 10.0.99.0 0.0.0.255", "line vty 0 4", "transport input ssh", "login local", "access-class 10 in", "end", "write memory"] }],
    debrief: "`access-class` filters who may open a session *to the device itself*; `ip access-group` filters traffic passing *through* an interface. Mixing them up is a classic exam trap.",
  },

  {
    id: "exam-4", tier: 4, type: "quiz", xp: 260, par: 840,
    title: "Senior Engineer Board",
    from: "Dana Okafor, NOC Team Lead",
    subject: "Promotion check: IP services and security",
    brief: ["Services and security are yours now. Pass this board and you carry the incident pager as lead engineer."],
    params: { domains: [4, 5], count: 12, pass: 70 },
    skills: ["IP services", "Security fundamentals"],
  },
];
