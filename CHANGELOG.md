# Changelog

Every change to the game is listed here, newest first. Versions follow [semantic versioning](https://semver.org): a new level or feature raises the minor number, a fix or small tweak raises the patch number. Each version is also a git tag and a GitHub release.

## [Unreleased]

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
