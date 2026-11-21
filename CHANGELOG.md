# Changelog

Every change to the game is listed here, newest first. Versions follow [semantic versioning](https://semver.org): a new level or feature raises the minor number, a fix or small tweak raises the patch number. Each version is also a git tag and a GitHub release.

## [Unreleased]

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
