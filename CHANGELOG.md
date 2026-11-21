# Changelog

Every change to the game is listed here, newest first. Versions follow [semantic versioning](https://semver.org): a new level or feature raises the minor number, a fix or small tweak raises the patch number. Each version is also a git tag and a GitHub release.

## [Unreleased]

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
