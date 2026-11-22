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
console.log(fails ? `\n${fails} FAILED` : "\nall simulator checks pass");
process.exit(fails ? 1 : 0);
