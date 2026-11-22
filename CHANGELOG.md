# Changelog

Every change to the game is listed here, newest first. Versions follow [semantic versioning](https://semver.org): a new level or feature raises the minor number, a fix or small tweak raises the patch number. Each version is also a git tag and a GitHub release.

## [Unreleased]

### Added

- The cockpit view is now drawn on your graphics card: a sharp gas giant at any screen size, rings that cast a shadow on the planet (and the planet on the rings), a glowing atmosphere at its edge, thousands of stars, and the sun blooming through the camera lens with a flare. Choose Light on the Bridge (Graphics) for the previous, lighter view; browsers without WebGL 2 use it automatically.
- Two new planets made in Blender, Kestrel Prime (warm belts and a great storm) and Cryon (an ice giant), with their own rings, plus a Blender-made sky full of nebulae and a cratered moon. Kestrel Prime is the planet you see first.
- Sunlight on the Bridge (Full graphics): Day side shows the line between day and night across the planet, and Sunrise puts the sun just breaking over its edge, with a thin lit crescent and a lens streak.

## [0.17.0] - 2026-11-22

### Added

- A cockpit view: press Cockpit in the top bar and the game's screens turn into glass panels in a spaceship orbiting a ringed planet, with the stars and the planet turning slowly behind them. Press Classic to go back. Your progress is the same in both views.
- The Bridge button in the cockpit view: music and the view outside. The ship's own ambient score is made live by the game in three moods. Or play your own music: a whole folder (such as a game soundtrack) or single files, dropped in or chosen. It has play, pause, next, previous, shuffle, a track list and a live spectrum. Short clips under 25 seconds are skipped. Your files stay on your computer and are never uploaded.
- The desktop app can find an X3 game's soundtrack in your Steam libraries and play it straight from the game folder, without copying it.
- The Bridge also picks the planet outside (ochre, ice or ember), how fast the ship rolls (gentle, cinematic or hold), how see-through the glass panels are, and whether the canopy frame and flight readout show. Roll starts on hold if your system asks for reduced motion.
- Typing sounds for the consoles: pick one from the Keys list in the console's title bar. Soft is a quiet laptop keyboard, Space is a starship console's soft tuned blips, and Mechanical is a deep tactile thock. It works in both views and is off until you pick one.
- Command lines, addresses and code now use JetBrains Mono, a monospaced font made for reading code. In the cockpit view the small readout labels use it too.
- In the cockpit view, a lab keeps the plain system font for easy reading, and its console and network map glow: a lit prompt, amber log lines, glowing ports, the open device in amber and flowing EtherChannel links.

### Fixed

- The Drill label on the IPv6 drill's card was drawn as a tall empty box.

## [0.16.0] - 2026-11-22

### Added

- A desktop app for Windows, macOS and Linux, with the same game as the web version. Installers are attached to every GitHub release from now on.
- The desktop app keeps its own progress, separate from any browser, in its data folder for your computer account. File > Open data folder shows where.
- When a new version is out, the desktop app shows a notice and an Update button in the top bar. Pressing it downloads the new version and restarts the game on it; your progress stays. On a Mac the button opens the download page for now. Check for updates is also in the footer and the File menu.
- The desktop app can import your own question bank or handbook (File > Import, or Import data pack in the footer). It is kept with your progress, so it survives updates.

## [0.15.0] - 2026-11-22

### Added

- Four new drills. Like Subnet Sprint, each one builds new questions every time, marks them at once and explains the answer.
  - **Colons and Zeros** (tier 1, IPv6): write an address in its shortest form, write one in full, build a modified EUI-64 address from a MAC address, and count the subnets in a prefix. The MAC addresses include ones where the flipped bit turns off, not on.
  - **Cut to Fit** (tier 3, subnetting): carve a block into subnets of different sizes, largest first; and find the one route that covers a list of subnets, including lists that no route covers exactly.
  - **Which Way Out?** (tier 3, routing): given a routing table with overlapping prefixes from different sources, say what the router does with a packet, including tables with no default route. Some questions ask instead which of several routes to the same network gets installed.
  - **First Match Wins** (tier 4, access lists): given an access list and one packet, say which line decides. The lists include a deny that hides a permit, `host` lines that match almost nothing, wildcards that cover two or four networks, `established`, `echo-reply` and the implicit deny.
- The drills are part of the career path and appear under their topic. A topic's side panel now says "Labs and drills".

### Changed

- Tests: every drill is generated 600 times and each answer is worked out a second way. The access list drill is checked against the simulator's own access list code.

## [0.14.0] - 2026-11-22

### Added

- Switches in the simulator can route. `ip routing` turns a switch into a layer 3 switch: it then routes between its SVIs, `show ip route` prints a routing table, static routes work, and it ignores `ip default-gateway`, as a real one does.
- `no switchport` makes a switch port a routed port that takes an IP address and belongs to no VLAN; `switchport` turns it back and removes the address. `show interfaces status` lists such a port as `routed`.
- An SVI now follows the real rule for coming up: its VLAN must exist and at least one active port must carry it.
- OSPF runs on a routing switch too, over SVIs and routed ports, and `ip helper-address` is accepted on them.
- New lab "Retire the Stick" (tier 3), after "The Way Out": move inter-VLAN routing from a router-on-a-stick to the distribution switch. You switch on routing, build three SVIs, turn the uplink into a routed port and add a default route. One SVI stays down until you work out why.
- A variant template for it with a build form (sometimes with a hidden reason for an SVI to stay down) and a troubleshooting form with six faults: routing switched off, an SVI shut down, a VLAN missing from the switch, a VLAN missing from the trunk, the uplink turned back into a switch port, and a missing default route.
- Theory: the layer 3 switch section on the inter-VLAN routing page now covers `ip routing`, SVIs, routed ports, why `ip default-gateway` stops mattering, and why an SVI stays down. Five new questions (one of them "choose two"), and a handbook table for the commands. The bank now has 227.

### Fixed

- `tracert` and `traceroute` count a routing switch as a hop.

## [0.13.1] - 2026-11-22

Follows a second review of the material.

### Fixed

- Questions about Ansible now appear in both exams. Ansible is in both blueprints but sits in a different topic in each, so these questions used to show only in v1.1 (the imported ones) or only in v2.0 (most of the built-in ones). They now follow the exam you study: under "Automation and programmability" in v1.1 and "Network operations and Ansible" in v2.0, without a "v1 exclusive" or "New in v2" badge.
- `ip ospf priority`, `ip ospf cost`, `ip ospf hello-interval` and `ip ospf dead-interval` reject numbers outside the ranges IOS accepts (priority 0 to 255, the others 1 to 65535).
- Theory: stateful DHCPv6 is "A off, M on", with the three interface commands that set the flags and what a host does when both are on; the spanning tree tie-breaker list no longer contradicts its own first line, and its last step is the port ID, not only the number; the width of a 2.4 GHz channel is given the same way in the theory and in two questions.
- A handbook table had two rows on one line of its source.

## [0.13.0] - 2026-11-22

### Added

- "Choose two" questions in the exams and quick checks. They are marked the way the real exam marks them: you must pick exactly the number asked for, and the question counts as right only when every pick is right. The options have square markers, a line under the question says how many to choose and how many you have picked, and after checking, every correct option is shown.
- 26 questions of this kind, at least one for most topics. The bank now has 222.
- An imported question bank can use the same format: give a list of answers instead of one.

## [0.12.0] - 2026-11-22

### Added

- New lab "The Rule That Never Fires" (tier 4), after "Guests Stay in the Lobby". Two access lists were edited overnight and three complaints came in: guests cannot open the intranet page, a guest laptop can ping staff PCs, and nobody can load a website although pings to the Internet work. Every line is valid, so there is no error to read: you test from the PCs, read the match counters and repair the lists by sequence number.
- A variant template for it with eight possible faults, two per variant: a deny above the permit it shadows, the wrong port, a wildcard of 0.0.0.0, a missing final permit, a list applied in the wrong direction, and on the Internet link a missing `established` line, a missing `echo-reply` line, or the list applied outbound.
- `established` and `echo-reply` now do what they say in an access list: the first matches only the replies of a TCP session, the second only ping replies. Before, both keywords were accepted and ignored.
- `show ip interface` and `show ip interface <interface>`, which name the access list applied in each direction.
- Theory: "When an access list does the wrong thing" on the access list page. Five new questions on the same faults; the bank now has 196. New handbook rows for editing by sequence number and for return traffic.

## [0.11.0] - 2026-11-22

### Added

- New lab "Shortest Is Not Fastest" (tier 3), after "Silent Neighbours". OSPF already runs on four routers and three things need tidying: traffic takes a slow copper link because OSPF sees it as equal to gigabit, two links between router pairs hold needless elections, and the oldest router is the designated router of the core LAN. You raise the reference bandwidth, make the links point-to-point, and move the DR role with priorities and `clear ip ospf process`.
- A variant template for it. Each variant picks whether to fix the path with the reference bandwidth (1000 or 10000) or with a fixed cost on the slow link, which core router should become designated router, and new addresses.
- Theory: "Tuning a running network" on the OSPF page, with a worked cost count for two paths and an order to work in. Three new questions on path cost, priority 0 and one-sided cost changes. The bank now has 191.
- `show ip route ospf`, `show ip route static` and `show ip route connected`.

## [0.10.0] - 2026-11-22

This release follows a review of all the learning material for accuracy. Most of its points were right and are fixed here; a few were not and are left as they were.

### Added

- OSPF in the simulator is closer to IOS. The designated router election is no longer pre-emptive: a DR keeps its role until it leaves the link, and priority 0 never stands. Two routers that are neither DR nor BDR show each other as `2WAY/DROTHER`.
- `clear ip ospf process` (with its yes/no question) restarts OSPF. A `router-id` typed on a router that already has neighbours now waits for it, with the same message IOS prints.
- `ip ospf network point-to-point` works: no DR on that link, and the neighbour shows `FULL/ -`. One end of each type still reaches FULL but learns no routes, as on real routers.
- OSPF cost now comes from the interface bandwidth: `auto-cost reference-bandwidth` and `bandwidth` change it, and `ip ospf cost` overrides both.
- `ip ospf dead-interval`, and `show ip ospf interface <interface>` with the network type, cost, DR, BDR and timers.
- Switch ports negotiate trunks (DTP). `switchport mode dynamic desirable` forms a trunk with a `dynamic auto` or trunk port, two `dynamic auto` ports stay access links, and `switchport nonegotiate` stops a trunk from answering. `show interfaces trunk` and `show interfaces switchport` show the mode.
- A static route is installed when its next hop can be reached through another route, not only through a connected subnet (a recursive lookup). The default route does not count.
- Theory: following one packet end to end (which addresses change at each hop), VLSM, route summarisation, the DTP table, OSPF neighbour states, the three router advertisement flags with duplicate address detection, SNMPv3 security levels, the spanning tree tie-breakers, HSRP and VRRP virtual MAC addresses, and ACL details (editing by sequence number, the router's own traffic, `established`).
- 15 new questions on the points above. The bank now has 188.
- New handbook rows for the OSPF and trunk commands.

### Changed

- A router subinterface refuses an IP address until `encapsulation dot1q` is set, as the theory page already said.
- A local account with `privilege 15` lands at the `#` prompt when it logs in over SSH or Telnet.
- `no ip domain lookup` is accepted as well as `no ip domain-lookup`.
- Port security is accepted on a static trunk; it is still refused on a dynamic port.
- In the "Fix a broken VLAN path" variant, the uplink fault is now a port forced to access mode. A port merely left at its default would negotiate a trunk by itself.
- With an imported question bank: questions from its mixed practice exams are now used in the v1.1 promotion exams (they were silently left out), questions printed twice are shown once, and far fewer land in the wrong topic. A wrong answer that mentions SNMP or an ACL no longer pulls a question into that topic.

### Fixed

- Theory corrections: router to PC needs a crossover cable; what each side of a duplex mismatch counts; frame size with a VLAN tag; `/31` and `/32` as the exceptions to "minus 2"; the WPA3 ciphers; the backup port role and why Cisco prints `BLK`; `root primary` is worked out once, not kept up to date; the two forms of BPDU Filter; what really happens with `on` against LACP; metric and administrative distance build the table, longest match forwards the packet; static route next hops; router ID changes; DNS zone transfers; what the SCP server needs; `enable` without a secret; and what Ansible's ping module means on network devices.
- Three questions corrected to match (static next hop, EtherChannel `on`, Ansible ping), and three questions that were filed under the wrong topic.
- The capstone's worked solution makes the user-facing subinterfaces passive in OSPF.

## [0.9.2] - 2026-11-22

### Fixed

- On a phone the top bar no longer runs off the side of the screen, so pages stop scrolling sideways. Below 560 px the bar shortens its labels (the exam chip shows only the version, and the logo stands in for the name when a Home link is next to it).

## [0.9.1] - 2026-11-21

### Added

- Subnetting theory: a worked example that takes 10.45.170.77/19 through binary step by step (place values, mask, block size, network, broadcast, host range, host count), with what each value is used for, then a quick recipe without binary and two examples.

### Changed

- Sub-headings on theory pages have space above them, so long sections are easier to scan.

## [0.9.0] - 2026-11-21

### Added

- New lab "The Switch Under the Table" (tier 2), a sequel to "Root of the Problem": an unknown switch is plugged into an access port and claims the spanning tree root, and root guard has cut the access switch off to contain it. Trace it with `show spanning-tree inconsistentports`, the root port and `show cdp neighbors`, then stop it at its port with PortFast and BPDU guard.
- A variant template for it with two forms: root guard already in place (an outage for one VLAN), or no root guard yet, where the tree has quietly re-rooted and you add root guard as well. The port, the VLAN and the priority the switch announces change each time.
- Theory: a short section on tracing a switch that should not be there. Two new questions on the same subject.

## [0.8.0] - 2026-11-21

### Added

- The simulator now runs spanning tree. Each VLAN gets its own tree with a root bridge, root, designated and alternate ports and path costs, and `show spanning-tree`, `show spanning-tree vlan`, `show spanning-tree summary` and `show spanning-tree inconsistentports` show it. New commands: `spanning-tree mode`, `spanning-tree vlan <list> priority`, `root primary`, `root secondary`, `spanning-tree guard root` and `spanning-tree cost`.
- The simulator now bundles EtherChannels. `channel-group <n> mode active|passive|on|desirable|auto` negotiates like the real protocols (two passive ends stay apart, `on` against LACP is suspended), the switch creates the port-channel interface, settings typed there are copied to the members, and `show etherchannel summary` shows the flags.
- BPDU guard now works: a guarded port with a switch on the other end goes err-disabled, with the log messages, and stays down until you bounce it. Root guard holds a port that hears a better root.
- New lab "Root of the Problem" (tier 2): an access switch has become the spanning tree root. Move the root to the distribution switch with a backup, switch to Rapid PVST+, and add root guard.
- New lab "Two Cables, One Link" (tier 2): a second uplink that spanning tree blocks. Bundle both into an LACP EtherChannel and set the trunk on the port-channel interface.
- Four variant templates for them: root placement with one root or one per VLAN and with exact priorities; misplaced protection to find (root guard or BPDU guard on the wrong port, three faults); building a channel of two or three links; and a channel that does not form (six faults).
- The network map shows a port blocked by spanning tree in amber, with the VLANs in its tooltip, and draws bundled links thicker.
- Theory for the topic now covers reading `show spanning-tree`, what `root primary` really sets, where each protection belongs, and the EtherChannel member flags. Eight new questions and two handbook sections go with it.

### Changed

- `show interfaces status` reports `err-disabled` and `suspended` ports.

## [0.7.0] - 2026-11-21

### Added

- New lab "Plan B" (tier 3): add floating static routes over a backup serial link on both routers, a host route that keeps one server's traffic on the backup link, then prove the failover by shutting the main link and bringing it back.
- New lab "Far From the Server" (tier 4): serve a branch from a DHCP server at another site, with a pool for the remote subnet and `ip helper-address` on the branch router.
- Variants for both: random addresses and distances for the floating-route lab, and for DHCP relay a build version and a troubleshooting version with five possible faults (helper on the wrong interface, helper to the wrong address, pool for the wrong subnet, no route back, wrong gateway in the pool).
- The network map draws two links between the same pair of devices side by side, so a main and a backup link can both be read.

### Fixed

- A lab you had already closed can no longer become locked when a new lab is added earlier in the career path.
- The "Solved" tag on a lab's ticket now appears only if you really solved it.

## [0.6.0] - 2026-11-21

### Added

- A choice of exam on the first screen: CCNA 200-301 **v1.1** (six domains) or **v2.0** (five domains). Topics, theory, promotion exams and the career path follow the blueprint you pick, grouped by its domains with their exam weights. Switch at any time with the Exam button in the top bar; progress is shared.
- "v1 exclusive" marks. In v1.1, the topic, theory sections and questions that v2.0 dropped carry a badge (the whole Automation and programmability topic; NTP, QoS, FTP/TFTP, network designs, VRF, wireless controller details, BPDU Filter, and the threats and firewalls sections). In v2.0 they are hidden.
- "New in v2" marks for material only v2.0 asks for: OSPFv3, storm control, RA guard, secure file transfer with SCP/SFTP, and the network operations topic.
- A lab on Ansible (v2.0): fix an inventory and a playbook on a control PC with a built-in file editor, then run `ansible` and `ansible-playbook` against three remote switches that have no console. Includes `--check`, ad-hoc show commands, and a variant template with four kinds of fault.
- Seven new theory pages: IPv6 (types, EUI-64, prefix sizes, static routes), virtualization, client troubleshooting on Windows, macOS and Linux, wireless (bands, RF behaviour, interference, security), IPsec and VPNs, syslog and SNMP, and network operations with Ansible.
- New theory sections on existing pages: cables and interface errors, Rapid PVST+ roles with root, loop and BPDU guard, EtherChannel configuration, ports for phones and access points with PoE, HSRP and VRRP status, host routes, OSPF point-to-point links, a router as DHCP client, DNS record types and diagnosis, AAA client configuration, DHCP snooping and ARP inspection configuration, and reading logs, extended ping and packet captures.
- 57 more custom exam questions covering the new material, so every topic in both exams has at least four.

### Changed

- The Topics screen is grouped by the chosen exam's domains instead of the game's own tracks.
- Ansible reports "changed" when a VLAN is created, not only when the running configuration changes.

## [0.5.0] - 2026-11-21

### Added

- Every solved variant now earns points. A variant is worth the same XP as its original lab under the same rules: full points with no hints and inside the par time, less otherwise. Each new variant can earn them again.
- A solved lab or variant is clearly marked. The ticket gets a green "Solved" banner with your stars, the XP earned and your time, the ticket window turns green, and the top bar shows a "Solved" tag. This stays if you keep exploring the lab.
- Opening a lab you solved before shows a "Solved" tag on its ticket.

### Changed

- Home cards for solved labs have a green outline and say "Solved", with a second line for the variants you solved and the XP they earned.
- The progress bar on the home screen now tracks the career path only (XP from tickets). XP from variants is added to your total and shown separately, so the bar can no longer overflow.

## [0.4.0] - 2026-11-21

### Changed

- Random variants are now on demand. Once you have solved a lab, a **New variant** button appears on it; each press builds a fresh random version of that lab (different addresses, names, or a different fault), as many times as you like. Inside a variant, "Original lab" takes you back.
- Lab cards show how many variants of that lab you have solved.

### Added

- Variants for First Console (a new device name and a different show command each time), so 16 of the 18 labs now have them.

### Removed

- The review queue and its "Review due" banner on the home screen, along with the timed schedule and mastery levels. Nothing prompts you to repeat a lab any more.
- The separate Practice cards on the Topics screen; variants are reached from the lab itself.

## [0.3.1] - 2026-11-21

### Fixed

- Tickets you closed before version 0.3.0 now count for the review queue: their skills are queued the next time you open the game, due straight away.

## [0.3.0] - 2026-11-21

### Added

- Topics view. The home screen now switches between the career path and a view grouped by topic. Each of the 19 topics has a theory page, a quick check, its tickets and its practice labs side by side.
- Theory pages for every topic: key ideas, commands, how to check your work and common mistakes. A "Theory" button in each lab opens the page in a side drawer without leaving the lab, and the Handbook lists all of them.
- Practice labs that change every time. 17 skills are generated from a random seed with different addresses, VLAN numbers, names and, for the troubleshooting ones, a different fault. Two subnetting practice sets work the same way.
- Spaced review. Closing a ticket queues the skills it taught; each comes back as a fresh variant after 15 minutes, then 1, 3, 7, 16 and 35 days. The home screen shows what is due and each skill shows a mastery level.
- Quick checks: up to six exam questions on one topic. Questions you got wrong come back first, then ones you have not seen.
- Source labels for exam questions. With an imported bank installed, every question shows a "Book" or "Custom" badge, the Topics screen counts both per topic, and a selector chooses book only, custom only or both (about half of each).
- 36 more custom exam questions, so every topic has at least four.
- After a failed or imperfect exam, the result lists the topics worth revisiting, linked to their theory pages.

### Changed

- A PC whose default gateway is outside its own subnet can no longer reach other networks, as on a real PC.
- The top bar link back from an activity now reads "Home".

## [0.2.0] - 2026-11-21

### Added

- Light mode. A button in the top bar switches between light and dark; the choice is remembered, and until you choose, the game follows your system setting.
- Wrong-mode tips in the console. When a command is rejected only because of the mode you are in, a tip says where it belongs: for example `show running-config` typed in configuration mode suggests `do show running-config` or `end`, and `hostname` typed at the `#` prompt suggests `configure terminal`.
- `copy startup-config running-config` now explains that it is not simulated instead of pointing at a syntax error.

### Fixed

- A command the device rejected no longer completes an objective. Typing `show running-config` in configuration mode used to tick "Display the running configuration" in First Console even though the switch answered `% Invalid input`.

## [0.1.0] - 2026-11-21

### Added

- Network simulator that runs in the browser: VLANs and trunks, router-on-a-stick, static and default routes, OSPF, DHCP server and relay, NAT (PAT and static), standard and extended ACLs, SSH/Telnet access rules and port security.
- IOS-style command line with modes, command abbreviation, `?` help, Tab completion, `do`, `no` forms, output filters (`| include`, `exclude`, `begin`, `section`), console log messages and over thirty `show` commands.
- PC command prompt (`ipconfig`, `ping`, `tracert`, `ssh`, `telnet`, `curl`) and an IP settings bar for static or DHCP addressing.
- 25 levels in 5 tiers: 18 hands-on labs, 2 subnetting drills and 5 promotion exams.
- Scoring with stars, XP and ranks, saved in the browser.
- Built-in exam question bank (70 questions over the six CCNA domains) and a searchable command handbook.
- Support for personal data packs in `data/`, which are git-ignored.
- Level tests that play each lab's scripted solution, and checks on the question bank.
- Docker image (nginx) with the tests as a build gate and a `/healthz` health check.
- Changelog, version number shown on the career screen, and a release script (`tools/release.mjs`).
