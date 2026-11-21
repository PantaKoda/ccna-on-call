# Changelog

Every change to the game is listed here, newest first. Versions follow [semantic versioning](https://semver.org): a new level or feature raises the minor number, a fix or small tweak raises the patch number. Each version is also a git tag and a GitHub release.

## [Unreleased]

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
