// Simulator behaviour tests: small networks built for the purpose, checked
// against what IOS does (OSPF elections, router IDs, cost and timers, static
// route resolution, trunk negotiation, login privilege).
// Run with: node tests/run-sim.mjs
const { Lab } = await import("../js/game/lab.js");

let fails = 0;
const ok = (name, cond, extra = "") => { console.log((cond ? "ok   " : "FAIL ") + name + (cond ? "" : "  " + extra)); if (!cond) fails++; };
const run = (lab, dev, cmds) => cmds.map(c => lab.exec(dev, c)).join("\n");
const cfg = (...c) => ["enable", "configure terminal", ...c, "end"];

// ---- three routers on one LAN, plus R1-R4 on a second link
const ospfLab = () => new Lab({
  id: "t", topology: {
    devices: [
      { name: "SW", kind: "switch" },
      { name: "R1", kind: "router", config: ["interface g0/0", "ip address 10.0.0.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.14.1 255.255.255.252", "no shutdown", "router ospf 1", "network 10.0.0.0 0.0.255.255 area 0", "router-id 1.1.1.1"] },
      { name: "R2", kind: "router", config: ["interface g0/0", "ip address 10.0.0.2 255.255.255.0", "no shutdown", "router ospf 1", "router-id 2.2.2.2", "network 10.0.0.0 0.0.0.255 area 0"] },
      { name: "R3", kind: "router", config: ["interface g0/0", "ip address 10.0.0.3 255.255.255.0", "no shutdown", "router ospf 1", "router-id 3.3.3.3", "network 10.0.0.0 0.0.0.255 area 0"] },
      { name: "R4", kind: "router", config: ["interface g0/1", "ip address 10.0.14.2 255.255.255.252", "no shutdown", "interface loopback0", "ip address 4.4.4.4 255.255.255.255", "router ospf 1", "network 0.0.0.0 255.255.255.255 area 0"] },
    ],
    links: ["R1:g0/0 SW:fa0/1", "R2:g0/0 SW:fa0/2", "R3:g0/0 SW:fa0/3", "R1:g0/1 R4:g0/1"],
  }, objectives: [],
});
{
  const lab = ospfLab(), st = () => lab.net.st;
  ok("router-id typed after network statements is used once the lab boots", st().rids.R1 === 0x01010101);
  ok("R4 takes its loopback as router ID", st().rids.R4 === 0x04040404);
  const role = (dn, ifn) => st().oifs[dn].find(o => o.name === ifn).role;
  ok("highest router ID is DR at boot", role("R3", "GigabitEthernet0/0") === "DR" && role("R2", "GigabitEthernet0/0") === "BDR" && role("R1", "GigabitEthernet0/0") === "DROTHER");
  run(lab, "R1", cfg("interface g0/0", "ip ospf priority 200"));
  ok("raising priority does not pre-empt the DR", role("R3", "GigabitEthernet0/0") === "DR" && role("R1", "GigabitEthernet0/0") === "DROTHER");
  const out = run(lab, "R1", ["enable", "show ip ospf neighbor"]);
  ok("R1 is FULL with DR and BDR", /3\.3\.3\.3\s+1\s+FULL\/DR/.test(out) && /2\.2\.2\.2\s+1\s+FULL\/BDR/.test(out), out);
  run(lab, "R3", ["enable", "clear ip ospf process", "yes"]);
  ok("after the DR restarts, the BDR is promoted and the high priority router is BDR", role("R2", "GigabitEthernet0/0") === "DR" && role("R1", "GigabitEthernet0/0") === "BDR" && role("R3", "GigabitEthernet0/0") === "DROTHER");
  run(lab, "R1", cfg("interface g0/0", "ip ospf priority 0"));
  run(lab, "R2", cfg("interface g0/0", "ip ospf priority 0"));
  ok("priority 0 steps down and never stands", role("R3", "GigabitEthernet0/0") === "DR" && role("R1", "GigabitEthernet0/0") === "DROTHER" && role("R2", "GigabitEthernet0/0") === "DROTHER");
  const o2 = run(lab, "R1", ["show ip ospf neighbor"]);
  ok("two DROTHERs stay at 2WAY", /2\.2\.2\.2\s+0\s+2WAY\/DROTHER/.test(o2), o2);
  ok("routes still flow between DROTHERs", st().rt.R2.some(r => r.proto === "O" && r.net === 0x04040404));
  run(lab, "R3", cfg("interface g0/0", "ip ospf priority 0"));
  ok("with no DR at all the LAN exchanges no routes", !st().rt.R2.some(r => r.proto === "O"));
  run(lab, "R3", cfg("interface g0/0", "no ip ospf priority"));

  // router ID change with neighbours waits for a restart
  const msg = run(lab, "R2", cfg("router ospf 1", "router-id 22.22.22.22"));
  ok("router-id with neighbours asks for a restart", /clear ip ospf process/.test(msg) && st().rids.R2 === 0x02020202, msg);
  run(lab, "R2", ["clear ip ospf process", "no"]);
  ok("answering no keeps the old ID", st().rids.R2 === 0x02020202);
  run(lab, "R2", ["clear ip ospf process", "y"]);
  ok("clear ip ospf process applies the new ID", st().rids.R2 === 0x16161616);

  // point-to-point
  const cost0 = st().oifs.R1.find(o => o.name === "GigabitEthernet0/1").cost;
  run(lab, "R1", cfg("interface g0/1", "ip ospf network point-to-point"));
  ok("mismatched network types learn no routes", !st().rt.R1.some(r => r.proto === "O" && r.net === 0x04040404));
  run(lab, "R4", cfg("interface g0/1", "ip ospf network point-to-point"));
  const o3 = run(lab, "R1", ["show ip ospf neighbor"]);
  ok("point-to-point shows FULL/ - and routes return", /4\.4\.4\.4\s+0\s+FULL\/  -/.test(o3) && st().rt.R1.some(r => r.proto === "O" && r.net === 0x04040404), o3);

  // cost
  ok("gigabit costs 1 by default", cost0 === 1);
  const warn = run(lab, "R1", cfg("router ospf 1", "auto-cost reference-bandwidth 10000"));
  ok("reference bandwidth 10000 makes gigabit cost 10", /Reference bandwidth is changed/.test(warn) && st().oifs.R1.find(o => o.name === "GigabitEthernet0/1").cost === 10);
  run(lab, "R1", cfg("interface g0/1", "bandwidth 100000"));
  ok("bandwidth 100000 makes it cost 100", st().oifs.R1.find(o => o.name === "GigabitEthernet0/1").cost === 100);
  run(lab, "R1", cfg("interface g0/1", "ip ospf cost 7"));
  ok("ip ospf cost wins", st().oifs.R1.find(o => o.name === "GigabitEthernet0/1").cost === 7);

  // number ranges
  const bad = c => /Invalid input/.test(run(lab, "R1", cfg("interface g0/1", c)));
  ok("priority above 255 is refused", bad("ip ospf priority 256") && !bad("ip ospf priority 255"));
  ok("cost 0 and cost 65536 are refused", bad("ip ospf cost 0") && bad("ip ospf cost 65536"));
  ok("hello and dead intervals of 0 are refused", bad("ip ospf hello-interval 0") && bad("ip ospf dead-interval 0"));
  run(lab, "R1", cfg("interface g0/1", "no ip ospf priority", "ip ospf cost 7"));

  // timers
  run(lab, "R1", cfg("interface g0/1", "ip ospf dead-interval 30"));
  ok("dead interval mismatch drops the neighbour", !st().nbrs.R1.some(n => n.dev === "R4"));
  run(lab, "R4", cfg("interface g0/1", "ip ospf dead-interval 30"));
  ok("matching dead interval restores it", st().nbrs.R1.some(n => n.dev === "R4"));
  const det = run(lab, "R1", ["show ip ospf interface g0/1"]);
  ok("show ip ospf interface gives type, cost and timers", /Network Type POINT_TO_POINT, Cost: 7/.test(det) && /Hello 10, Dead 30/.test(det), det);
  const rc = run(lab, "R1", ["show running-config"]);
  ok("running-config lists the new lines", / ip ospf dead-interval 30/.test(rc) && / ip ospf network point-to-point/.test(rc) && / auto-cost reference-bandwidth 10000/.test(rc));
}

// ---- static routes: recursive next hop, and subinterface rule
{
  const lab = new Lab({
    id: "t2", topology: {
      devices: [
        { name: "R1", kind: "router", config: ["interface g0/0", "ip address 10.0.12.1 255.255.255.252", "no shutdown"] },
        { name: "R2", kind: "router", config: ["interface g0/0", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface g0/1", "ip address 10.0.23.1 255.255.255.252", "no shutdown", "ip route 10.3.0.0 255.255.255.0 10.0.23.2"] },
        { name: "R3", kind: "router", config: ["interface g0/1", "ip address 10.0.23.2 255.255.255.252", "no shutdown", "interface loopback0", "ip address 10.3.0.1 255.255.255.0", "ip route 0.0.0.0 0.0.0.0 10.0.23.1"] },
      ],
      links: ["R1:g0/0 R2:g0/0", "R2:g0/1 R3:g0/1"],
    }, objectives: [],
  });
  const st = () => lab.net.st, has = net => st().rt.R1.some(r => r.proto === "S" && r.net === net);
  run(lab, "R1", cfg("ip route 10.3.0.0 255.255.255.0 10.0.23.2"));
  ok("unresolvable next hop: route stays out of the table", !has(0x0a030000));
  run(lab, "R1", cfg("ip route 0.0.0.0 0.0.0.0 10.0.12.2"));
  ok("a default route does not resolve it", !has(0x0a030000));
  run(lab, "R1", cfg("ip route 10.0.23.0 255.255.255.252 10.0.12.2"));
  ok("a route to the next hop installs it (recursive lookup)", has(0x0a030000));
  ok("and packets follow it", st().reach("R1", 0x0a030001, { proto: "icmp" }).ok);
  const only = run(lab, "R1", ["enable", "show ip route static"]).split("\n").filter(l => /^S/.test(l));
  ok("show ip route static lists only static routes", only.length === 3 && !/^C|Codes/m.test(run(lab, "R1", ["show ip route static"])));
  const e = run(lab, "R1", cfg("interface g0/1.10", "ip address 192.168.10.1 255.255.255.0"));
  ok("subinterface refuses an address before encapsulation", /only allowed/.test(e) && lab.net.devs.R1.ifaces["GigabitEthernet0/1.10"].ip == null, e);
  run(lab, "R1", cfg("interface g0/1.10", "encapsulation dot1q 10", "ip address 192.168.10.1 255.255.255.0"));
  ok("and accepts it afterwards", lab.net.devs.R1.ifaces["GigabitEthernet0/1.10"].ip != null);
  ok("no ip domain lookup is accepted", !/Invalid/.test(run(lab, "R1", cfg("no ip domain lookup"))) && lab.net.devs.R1.domainLookup === false);
}

// ---- DTP and port security on a trunk
{
  const lab = new Lab({
    id: "t3", topology: {
      devices: [{ name: "SW1", kind: "switch", config: ["vlan 10"] }, { name: "SW2", kind: "switch", config: ["vlan 10"] }],
      links: ["SW1:g0/1 SW2:g0/1"],
    }, objectives: [],
  });
  const t = () => lab.net.st.trunking("SW1", "GigabitEthernet0/1") && lab.net.st.trunking("SW2", "GigabitEthernet0/1");
  ok("auto + auto stays an access link", !t());
  run(lab, "SW1", cfg("interface g0/1", "switchport mode dynamic desirable"));
  ok("desirable + auto trunks", t());
  const tr = run(lab, "SW2", ["enable", "show interfaces trunk"]);
  ok("show interfaces trunk names the mode", /Gi0\/1\s+auto\s+802\.1q\s+trunking/.test(tr), tr);
  const swp = run(lab, "SW1", ["show interfaces g0/1 switchport"]);
  ok("switchport output shows dynamic desirable, operational trunk", /Administrative Mode: dynamic desirable/.test(swp) && /Operational Mode: trunk/.test(swp) && /Negotiation of Trunking: On/.test(swp), swp);
  run(lab, "SW1", cfg("interface g0/1", "switchport mode access"));
  ok("access + auto is an access link", !t());
  run(lab, "SW1", cfg("interface g0/1", "switchport mode trunk"));
  ok("trunk + auto trunks", t());
  run(lab, "SW1", cfg("interface g0/1", "switchport nonegotiate"));
  ok("trunk nonegotiate + auto: only one end trunks", lab.net.st.trunking("SW1", "GigabitEthernet0/1") && !lab.net.st.trunking("SW2", "GigabitEthernet0/1"));
  const c = run(lab, "SW2", cfg("interface g0/1", "switchport nonegotiate"));
  ok("nonegotiate is refused on a dynamic port", /Conflict/.test(c), c);
  const ps = run(lab, "SW1", cfg("interface g0/1", "switchport port-security"));
  ok("port security is accepted on a static trunk", !/rejected/.test(ps), ps);
  const pd = run(lab, "SW2", cfg("interface g0/2", "switchport port-security"));
  ok("and still refused on a dynamic port", /dynamic port/.test(pd), pd);
}

// ---- privilege 15 over SSH
{
  const lab = new Lab({
    id: "t4", topology: {
      devices: [
        { name: "R1", kind: "router", config: ["interface g0/0", "ip address 10.0.0.1 255.255.255.0", "no shutdown", "ip domain-name lab.test", "username admin privilege 15 secret Lab-Pw1", "username oper secret Lab-Pw2", "crypto key generate rsa modulus 2048", "line vty 0 4", "login local", "transport input ssh"] },
        { name: "PC1", kind: "pc", ip: { ip: "10.0.0.10", mask: "255.255.255.0", gw: "10.0.0.1" } },
      ],
      links: ["R1:g0/0 PC1"],
    }, objectives: [],
  });
  run(lab, "PC1", ["ssh -l admin 10.0.0.1", "Lab-Pw1"]);
  ok("privilege 15 user lands at #", lab.session("PC1").remote && lab.session("PC1").remote.mode === "priv");
  run(lab, "PC1", ["exit", "ssh -l oper 10.0.0.1", "Lab-Pw2"]);
  ok("an ordinary user lands at >", lab.session("PC1").remote && lab.session("PC1").remote.mode === "user");
}
// ---- access lists: return traffic, and where a list is applied
{
  const lab = new Lab({
    id: "t5", topology: {
      devices: [
        { name: "R1", kind: "router", config: ["interface g0/0", "ip address 10.1.0.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.2.0.1 255.255.255.0", "no shutdown", "exit",
          "ip access-list extended BACK-IN", "permit tcp any any established", "exit", "interface g0/1", "ip access-group BACK-IN in"] },
        { name: "IN", kind: "pc", ip: { mode: "static", ip: "10.1.0.10", mask: "255.255.255.0", gw: "10.1.0.1" } },
        { name: "OUT", kind: "server", services: ["http"], ip: { mode: "static", ip: "10.2.0.10", mask: "255.255.255.0", gw: "10.2.0.1" } },
      ],
      links: ["R1:g0/0 IN", "R1:g0/1 OUT"],
    }, objectives: [],
  });
  const IN = 0x0a01000a, OUT = 0x0a02000a, web = { proto: "tcp", dport: 80 }, st = () => lab.net.st;
  ok("established lets the answer to an inside TCP session back in", st().reach("IN", OUT, web).ok);
  ok("but not a session started from outside", !st().reach("OUT", IN, web).ok);
  ok("and not a ping reply", !st().reach("IN", OUT).ok);
  run(lab, "R1", cfg("ip access-list extended BACK-IN", "permit icmp any any echo-reply"));
  ok("echo-reply lets the ping reply in", st().reach("IN", OUT).ok);
  ok("but a ping from outside is still refused", !st().reach("OUT", IN).ok);
  const acl = run(lab, "R1", ["show access-lists"]);
  ok("show access-lists prints both keywords", /any any established/.test(acl) && /any any echo-reply/.test(acl), acl);
  const sii = run(lab, "R1", ["show ip interface g0/1"]);
  ok("show ip interface names the list and its direction", /Inbound  access list is BACK-IN/.test(sii) && /Outgoing access list is not set/.test(sii), sii);
  ok("established is refused on a UDP line", /Invalid/.test(run(lab, "R1", cfg("ip access-list extended BACK-IN", "permit udp any any established"))));
}
// ---- layer 3 switching: ip routing, SVIs, routed ports, routes and OSPF on a switch
{
  const lab = new Lab({
    id: "t6", topology: {
      devices: [
        { name: "DSW", kind: "switch", config: ["vlan 10", "vlan 20", "interface fa0/1", "switchport mode access", "switchport access vlan 10", "interface fa0/2", "switchport mode access", "switchport access vlan 20",
          "interface vlan 10", "ip address 192.168.10.1 255.255.255.0", "interface vlan 20", "ip address 192.168.20.1 255.255.255.0"] },
        { name: "R1", kind: "router", config: ["interface g0/0", "ip address 10.255.0.1 255.255.255.252", "no shutdown", "interface loopback0", "ip address 10.9.9.9 255.255.255.255", "exit", "ip route 192.168.0.0 255.255.0.0 10.255.0.2"] },
        { name: "PA", kind: "pc", ip: { mode: "static", ip: "192.168.10.10", mask: "255.255.255.0", gw: "192.168.10.1" } },
        { name: "PB", kind: "pc", ip: { mode: "static", ip: "192.168.20.10", mask: "255.255.255.0", gw: "192.168.20.1" } },
        { name: "PC", kind: "pc", ip: { mode: "static", ip: "192.168.30.10", mask: "255.255.255.0", gw: "192.168.30.1" } },
      ],
      links: ["DSW:fa0/1 PA", "DSW:fa0/2 PB", "DSW:fa0/3 PC", "DSW:g0/1 R1:g0/0"],
    }, objectives: [],
  });
  const st = () => lab.net.st, A = 0xc0a80a0a, B = 0xc0a8140a, GW = 0xc0a80a01, FAR = 0x0a090909;
  ok("a host reaches its SVI gateway on a layer 2 switch", st().reach("PA", GW).ok);
  ok("but the switch does not route between VLANs yet", !st().reach("PA", B).ok);
  ok("router ospf is refused without ip routing", /IP routing not enabled/.test(run(lab, "DSW", cfg("router ospf 1"))));
  run(lab, "DSW", cfg("ip routing"));
  ok("ip routing lets the SVIs route between VLANs", st().reach("PA", B).ok && st().reach("PB", A).ok);
  ok("show ip route on the switch is now a routing table", /C\s+192\.168\.10\.0\/24 is directly connected, Vlan10/.test(run(lab, "DSW", ["show ip route"])));
  ok("a layer 2 port refuses an address", /L2 links/.test(run(lab, "DSW", cfg("interface g0/1", "ip address 10.255.0.2 255.255.255.252"))));
  ok("and refuses OSPF interface commands", /layer 2 port/.test(run(lab, "DSW", cfg("interface g0/1", "ip ospf cost 5"))));
  run(lab, "DSW", cfg("interface g0/1", "no switchport", "ip address 10.255.0.2 255.255.255.252"));
  ok("no switchport makes a routed port that takes the address", lab.net.devs.DSW.ifaces["GigabitEthernet0/1"].sw === null && st().reach("DSW", 0x0aff0001).ok);
  // every show command must cope with a port that has no layer 2 settings
  const shows = ["show vlan brief", "show interfaces status", "show interfaces trunk", "show interfaces switchport", "show interfaces g0/1 switchport", "show spanning-tree", "show spanning-tree summary",
    "show mac address-table", "show etherchannel summary", "show port-security", "show running-config", "show ip interface brief", "show ip interface", "show cdp neighbors", "show interfaces"];
  const outs = Object.fromEntries(shows.map(c => [c, run(lab, "DSW", [c])]));
  ok("the routed port shows as routed, and as Switchport: Disabled", /Gi0\/1\s+connected\s+routed/.test(outs["show interfaces status"]) && /Switchport: Disabled/.test(outs["show interfaces g0/1 switchport"]), outs["show interfaces status"]);
  ok("running-config lists ip routing and no switchport", /^ip routing$/m.test(outs["show running-config"]) && / no switchport\n ip address 10\.255\.0\.2/.test(outs["show running-config"]));
  ok("the routed port is not in any VLAN", !/Gi0\/1/.test(outs["show vlan brief"]));
  ok("without a route the far network is unreachable", !st().reach("PA", FAR).ok);
  run(lab, "DSW", cfg("ip default-gateway 10.255.0.1"));
  ok("ip default-gateway is ignored once the switch routes", !st().reach("PA", FAR).ok);
  run(lab, "DSW", cfg("ip route 0.0.0.0 0.0.0.0 10.255.0.1"));
  ok("a default route on the switch gets the hosts out", st().reach("PA", FAR).ok && st().reach("PB", FAR).ok);
  const tr = run(lab, "PA", ["tracert 10.9.9.9"]);
  const hopLines = tr.split("\n").filter(l => l.includes(" ms "));
  ok("tracert counts the routing switch as a hop", hopLines.length === 2 && hopLines[0].endsWith("192.168.10.1") && hopLines[1].endsWith("10.9.9.9"), tr);

  // an SVI is up only when its VLAN exists and a port in it is up
  const svi = () => st().status("DSW", "Vlan30").up;
  run(lab, "DSW", cfg("interface vlan 30", "ip address 192.168.30.1 255.255.255.0"));
  ok("an SVI for a VLAN that does not exist stays down", !svi());
  run(lab, "DSW", cfg("vlan 30"));
  ok("and stays down while no port carries the VLAN", !svi());
  run(lab, "DSW", cfg("interface fa0/3", "switchport mode access", "switchport access vlan 30"));
  ok("it comes up with the first active port in the VLAN", svi() && st().reach("PC", A).ok);

  // OSPF between the layer 3 switch and the router
  run(lab, "DSW", cfg("no ip route 0.0.0.0 0.0.0.0", "router ospf 1", "router-id 2.2.2.2", "network 10.255.0.0 0.0.0.3 area 0", "network 192.168.0.0 0.0.255.255 area 0", "passive-interface vlan 10"));
  run(lab, "R1", cfg("no ip route 192.168.0.0 255.255.0.0", "router ospf 1", "router-id 1.1.1.1", "network 10.255.0.0 0.0.0.3 area 0", "network 10.9.9.9 0.0.0.0 area 0"));
  ok("the switch and the router become OSPF neighbours", st().nbrs.DSW.some(n => n.dev === "R1" && n.state === "FULL"), run(lab, "DSW", ["show ip ospf neighbor"]));
  ok("each learns the other's networks", st().rt.DSW.some(r => r.proto === "O" && r.net === FAR) && st().rt.R1.some(r => r.proto === "O" && r.net === 0xc0a81400) && st().reach("PB", FAR).ok);
  ok("an SVI can be passive", st().oifs.DSW.find(o => o.name === "Vlan10").passive);

  run(lab, "DSW", cfg("interface g0/1", "switchport"));
  ok("switchport turns the port back and removes its address", lab.net.devs.DSW.ifaces["GigabitEthernet0/1"].sw !== null && lab.net.devs.DSW.ifaces["GigabitEthernet0/1"].ip === null);
  run(lab, "DSW", cfg("no ip routing"));
  ok("no ip routing stops the routing again", !st().reach("PA", B).ok);
}

// ---- discovery & inspection: CDP detail, LLDP, ARP, multi-switch MAC table, speed negotiation, PC arp -a, Field Report
{
  const lab = new Lab({
    id: "t-disc", topology: {
      devices: [
        { name: "R1", kind: "router", hostname: "CORE-R1", config: ["lldp run", "interface g0/0", "ip address 192.168.10.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.0.99.1 255.255.255.0", "no shutdown"] },
        { name: "SW1", kind: "switch", hostname: "ACC-SW1", config: ["lldp run", "interface vlan 1", "ip address 192.168.10.2 255.255.255.0", "no shutdown"] },
        { name: "SW2", kind: "switch", hostname: "ACC-SW2" },
        { name: "PC1", kind: "pc", ip: { mode: "static", ip: "192.168.10.11", mask: "255.255.255.0", gw: "192.168.10.1" } },
        { name: "PC2", kind: "pc", ip: { mode: "static", ip: "192.168.10.12", mask: "255.255.255.0", gw: "192.168.10.1" } },
        { name: "SRV", kind: "server", ip: { mode: "static", ip: "10.0.99.50", mask: "255.255.255.0", gw: "10.0.99.1" } },
      ],
      links: ["R1:g0/0 SW1:fa0/1", "SW1:g0/1 SW2:g0/1", "SW1:fa0/2 PC1", "SW2:fa0/2 PC2", "R1:g0/1 SRV"],
    },
    report: [
      { id: "r-if", kind: "if", answer: "GigabitEthernet0/1" },
      { id: "r-cidr", kind: "cidr", answer: "192.168.10.0/24" },
      { id: "r-ip", kind: "ip", answer: "192.168.10.2" },
      { id: "r-num", kind: "num", answer: 4 },
      { id: "r-ch", kind: "choice", options: ["A", "B"], answer: 1 },
    ],
    objectives: [],
  });
  const cdpDet = run(lab, "R1", ["show cdp neighbors detail"]);
  ok("show cdp neighbors detail reports neighbour IP and ports", /Device ID: ACC-SW1/.test(cdpDet) && /IP address: 192\.168\.10\.2/.test(cdpDet) && /Port ID \(outgoing port\): FastEthernet0\/1/.test(cdpDet), cdpDet);
  const lldp1 = run(lab, "R1", ["show lldp neighbors"]);
  ok("show lldp neighbors lists LLDP-enabled neighbour", /ACC-SW1\s+Gi0\/0\s+120\s+B\s+Fa0\/1/.test(lldp1), lldp1);
  const lldpDet = run(lab, "R1", ["show lldp neighbors detail"]);
  ok("show lldp neighbors detail includes management IP", /System Name: ACC-SW1/.test(lldpDet) && /IP: 192\.168\.10\.2/.test(lldpDet), lldpDet);
  ok("show lldp neighbors reports disabled when lldp run is off", /LLDP is not enabled/.test(run(lab, "SW2", ["show lldp neighbors"])));
  const r1If = run(lab, "R1", ["show interfaces g0/0"]);
  ok("Gigabit wired to FastEthernet negotiates 100Mb/s", /Full-duplex, 100Mb\/s/.test(r1If), r1If);
  const sw1Stat = run(lab, "SW1", ["show interfaces status"]);
  ok("show interfaces status shows a-100 on Fa0/1 and a-1000 on Gi0/1", /Fa0\/1\s+connected\s+1\s+a-full\s+a-100/.test(sw1Stat) && /Gi0\/1\s+connected\s+1\s+a-full\s+a-1000/.test(sw1Stat), sw1Stat);
  const r1Mac = /address is ([0-9a-f.]+)/.exec(r1If)?.[1];
  const sw1Mac = run(lab, "SW1", ["show mac address-table"]);
  const pc2Mac = /Physical Address[^:]+:\s*([0-9A-F-]+)/.exec(run(lab, "PC2", ["ipconfig /all"]))?.[1].toLowerCase().replace(/-/g, "").replace(/(....)(....)(....)/, "$1.$2.$3");
  ok("switch MAC table matches router interface MAC and learns PC2 behind SW2", r1Mac && sw1Mac.includes(r1Mac) && pc2Mac && new RegExp(pc2Mac.replace(/\./g, "\\.") + "\\s+DYNAMIC\\s+Gi0/1").test(sw1Mac), sw1Mac);
  const r1Arp = run(lab, "R1", ["show ip arp"]);
  ok("router show ip arp lists local hosts and SVI on the connected segment", /192\.168\.10\.11/.test(r1Arp) && /192\.168\.10\.12/.test(r1Arp) && /192\.168\.10\.2/.test(r1Arp) && /10\.0\.99\.50/.test(r1Arp), r1Arp);
  const pcArp = run(lab, "PC1", ["arp -a"]);
  ok("PC arp -a shows local peers, gateway and broadcast, but not remote subnets", /192\.168\.10\.1\b/.test(pcArp) && /192\.168\.10\.12\b/.test(pcArp) && /192\.168\.10\.255/.test(pcArp) && /ff-ff-ff-ff-ff-ff/.test(pcArp) && !/10\.0\.99\.50/.test(pcArp), pcArp);
  ok("Field Report accepts normalized interface, CIDR, IP, number and choice",
    lab.submitAnswer("r-if", "gi0/1").ok && lab.submitAnswer("r-cidr", "192.168.10.0 / 24").ok && lab.submitAnswer("r-ip", "192.168.10.2").ok && lab.submitAnswer("r-num", "4").ok && lab.submitAnswer("r-ch", 1).ok && !lab.submitAnswer("r-if", "fa0/1").ok);
}
console.log(fails ? `\n${fails} FAILED` : "\nall simulator checks pass");
process.exit(fails ? 1 : 0);
