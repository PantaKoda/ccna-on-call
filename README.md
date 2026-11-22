# CCNA: On Call

A network engineering game for people studying for the CCNA 200-301 exam. You study a topic, then play the on-call network engineer at a fictional company: tickets come in, you open a console on a simulated router, switch or PC, and fix the network with IOS-style commands. Objectives tick off live as the simulated network starts working. Once you have solved a lab you can replay it as a fresh random variant, as often as you like.

It is a static web app (plain HTML, CSS and ES modules, no build step, no backend). Progress is saved in the browser's localStorage.

> This is an independent study project. It is not affiliated with, endorsed by or sponsored by Cisco Systems. Cisco, CCNA and IOS are trademarks of Cisco Systems, Inc.

## What is in it

- **Two exam versions.** The first screen asks which blueprint you are studying for: **200-301 v1.1** (six domains) or **v2.0** (five domains). The topics, theory, exams and labs are then arranged by that blueprint's domains and weights. In v1.1, anything v2.0 dropped is marked **v1 exclusive**; in v2.0, new material is marked **New in v2**. Progress is shared and you can switch at any time.
- **Two ways to browse.** *Career path*: 5 tiers, each harder than the last, with 26 hands-on labs (27 in v2.0), 6 drills (subnetting twice, IPv6 addresses, VLSM and summarisation, routing table lookup, access list tracing) and 5 promotion exams. *Topics*: the same content grouped into 26 topics under the exam's domains, each with a theory page, a quick check and its labs.
- **Theory first.** Every topic has a study page with the key ideas, the commands and the common mistakes. The same page opens in a side drawer during a lab.
- **Random variants on demand.** After you solve a lab, a **New variant** button appears on it. Each press builds a new version of the same skill from a random seed: different addresses, VLAN numbers and names, and for troubleshooting a different fault. 25 of the 27 labs have variants (30 templates; some labs have a build version and a troubleshooting version). There is no schedule: you decide when and how often. Each solved variant earns the lab's XP again under the same star rules.
- **A network simulator** that runs in the browser: VLANs and trunks, per-VLAN spanning tree (root election, port roles, root guard, BPDU guard), EtherChannel (LACP, PAgP and static), router-on-a-stick, layer 3 switching (SVIs and routed ports), static and default routes, OSPF (adjacencies, cost from bandwidth, a DR/BDR election that is not pre-emptive, point-to-point links, timers, passive interfaces, default origination), trunk negotiation (DTP), DHCP server and relay, NAT (PAT and static), standard and extended ACLs, SSH/Telnet access rules, port security.
- **An IOS-style command line**: user/privileged/config modes, command abbreviation (`sh ip int br`), `?` help, Tab completion, `do`, `no` forms, `| include / exclude / begin / section`, console log messages (`%LINK-3-UPDOWN`, `%OSPF-5-ADJCHG`), and over thirty `show` commands.
- **A PC command prompt**: `ipconfig`, `ping`, `tracert`, `ssh`, `telnet`, `curl`, plus an IP settings bar for static/DHCP addressing.
- **A simulated Ansible control node** (v2.0): an inventory and a playbook you edit in the browser, `ansible` and `ansible-playbook` (with `--check`), and the `ios_config`, `ios_command` and `ping` modules, run against the simulated switches over simulated SSH. No containers or real Ansible involved.
- **Scoring**: three stars per level (minus one per hint, minus one for going over par time), XP from tickets and from variants, and a rank that rises as you clear tiers. A solved lab is marked clearly on its screen and on its card.
- **Exam questions by topic**, with the ones you missed coming back first, including "choose two" questions marked the way the real exam marks them. If you install your own question bank, every question is labelled **Book** or **Custom** and you can choose which to use.
- **Handbook**: a searchable command reference plus every theory page, one click away during any ticket.
- **Coaching**: when a command is rejected only because you are in the wrong mode, a tip says which mode it belongs in.
- **Light and dark mode**, following your system setting until you pick one. Command lines and code use **JetBrains Mono** (SIL Open Font License, bundled in `css/fonts/` with its licence); text uses the system font.
- **Cockpit view**, an optional look: the screens become glass panels in a spaceship orbiting a ringed gas giant, with the view rolling slowly as the ship orbits. The **Bridge** button plays the ship's own ambient score (generated live with the Web Audio API in three moods, no audio files) or your own music: files or a whole folder, kept in the browser's storage on your computer and never uploaded. The desktop app instead plays a folder straight from disk, and can find an X3 game's soundtrack in your Steam libraries (`desktop/music.mjs`). The Bridge also picks the planet, the roll speed (or holds still, the default under reduced motion), the glass opacity and the canopy frame. Inside a lab the cockpit keeps the system font and adds glow to the console and map. With Full graphics the view is ray-traced on the GPU in WebGL 2 (`js/ui/spacegl.js`: ring and planet shadows, atmosphere, bloom, lens flare), using textures made in Blender: `content/space/` holds them and `tools/blender/space_textures.py` renders them again (`blender -b --factory-startup --python tools/blender/space_textures.py`, about a minute on a GPU). Code: `js/ui/cockpit.js` (switch, Bridge, frame), `js/ui/space.js` (the light view, canvas 2D), `js/ui/music.js` (the score and the player), `css/cockpit.css`.

| Tier | Rank | Topics |
| --- | --- | --- |
| 1 Orientation Week | Intern | console modes, passwords and banners, subnetting, interface addressing, switch management IP, IPv6 addresses |
| 2 Access Layer | Junior Engineer | VLANs, trunks, router-on-a-stick, port security |
| 3 Routing Rotation | Network Engineer | static routes, VLSM and summarisation, default routes, routing table lookup, layer 3 switching, floating and host routes, OSPF, OSPF troubleshooting, OSPF tuning |
| 4 Services and Security | Senior Engineer | DHCP, DHCP relay, NAT/PAT, extended ACLs, ACL tracing, ACL troubleshooting, SSH hardening, Ansible (v2.0) |
| 5 Incident Lead | Lead Engineer | a five-fault outage, a full branch build, the final exam |

## Run it locally

```bash
node tools/serve.mjs        # http://localhost:8080
```

Any static file server works, as long as it serves `.js` files with a JavaScript MIME type (ES modules need that). Opening `index.html` straight from disk does not work, because browsers block module scripts on `file://`.

To try any level without playing the ones before it, add `?unlock=all` to the URL: `http://localhost:8080/?unlock=all`.

## Tests

```bash
npm test                      # plays every lab's scripted solution, then the simulator behaviour tests
node tests/run-levels.mjs ospf-broken -v    # one level, with the full console transcript
node tests/run-sim.mjs        # only the simulator behaviour tests (OSPF, DTP, static routes, login)
node tests/run-drills.mjs     # only the drill tests: 600 generated questions per drill, each answer checked a second way
```

Each lab ships with a solution script. The test builds the lab, checks the objectives are not already met, types the solution into the simulated consoles and checks every objective is met at the end. It runs every variant template over 40 random seeds the same way, and checks that the question bank is well formed, that every topic has a theory page, and that every ticket and skill belongs to a topic. The Docker build runs the same test and fails if a level can no longer be completed.

## Desktop app

The same game also ships as a desktop app for Windows, macOS and Linux, built with Electron. It shows the very same files as the web version (served on a private `app://` origin), so every change reaches both.

```bash
npm install
npm run desktop                     # run from the source tree
npm run desktop -- --unlock-all     # with every level open
npm run desktop -- --fake-update    # pretend a new release is out, to try the update button
npm run desktop:dist                # build the installer for this OS into dist/
```

- **Downloads.** Every GitHub release has installers attached: `.exe` for Windows (installs for the current user, no administrator prompt), `.dmg` for macOS (Apple silicon and Intel), `.AppImage` for Linux. The builds are not code-signed yet, so Windows SmartScreen and macOS Gatekeeper warn on first start (on a Mac: right-click the app, Open).
- **Its own progress.** The desktop app keeps progress in its own data folder for the signed-in computer account (`%APPDATA%\CCNA On Call` on Windows, `~/Library/Application Support/CCNA On Call` on macOS, `~/.config/CCNA On Call` on Linux), apart from any browser running the web version, and apart from other accounts on the same computer. A copy run from the source tree uses `CCNA On Call (dev)` instead.
- **Updates.** The app checks GitHub for a newer release when it starts and every four hours. When one is out it shows a system notification and an **Update** button in the top bar; pressing it downloads the new version and restarts the game on it, progress kept. Windows and the Linux AppImage update in place. macOS only installs updates into a signed app, so on a Mac the button opens the download page until the builds are signed. **Check for updates** is in the home screen footer and the File menu.
- **Your own data packs.** File > Import (or **Import data pack** in the footer) copies a `questions.js` or `notes.js` (see [data/README.md](data/README.md)) into the app's data folder, where it survives updates. `npm run desktop:personal` builds an installer with the packs from `data/` inside, into `dist/personal/`; it copies them into the data folder on first start. That build holds your personal content: keep it on your own devices and never attach it to a release. The public builds contain only what is in this repository.

Code: `desktop/main.mjs` (window, storage, updates, menu), `desktop/preload.cjs` (the `window.ccnaDesktop` bridge), `desktop/files.mjs` (which file each `app://` request gets), `js/ui/desktop.js` (the update button and footer links; does nothing in a browser), `desktop/builder.config.cjs` (electron-builder) and `.github/workflows/desktop.yml` (the builds).

## Docker

```bash
docker build -t ccna-on-call .
docker run --rm -p 8080:80 ccna-on-call      # http://localhost:8080
```

or `docker compose up --build`.

The image is nginx serving the static files (about 95 MB). It listens on **port 80** and answers a health check at **`/healthz`**.

### Deploying on Coolify

1. In Coolify: **New resource -> Application**, pick this repository and branch.
2. Build pack: **Dockerfile** (the `Dockerfile` in the repository root).
3. **Ports exposes: `80`**. Health check path: `/healthz`.
4. Set your domain and deploy. No environment variables or volumes are needed.

Alternatively, push the built image to a registry and deploy it in Coolify as a **Docker image** resource with the same port.

## Content and your own material

Everything in this repository was written for the project: the simulator, the levels, the variant templates, the theory pages (`content/theory.md`), the exam questions (`js/game/questions.js`) and the handbook (`js/game/handbook.js`).

You can swap in your own question bank or handbook by placing `questions.js` or `notes.js` in `data/`. Those two files are ignored by git on purpose, so content you only hold a personal licence for (questions from a book you bought, for instance) cannot be committed by accident. See [data/README.md](data/README.md) for the formats.

When an imported bank is present the game keeps the two sources apart: each exam question carries a **Book** or **Custom** badge, the Topics screen shows how many of each a topic has, and a selector on the home screen switches between both, book only and custom only. With both selected, a quiz draws about half from each. Imported questions are sorted into topics by their wording.

## Project layout

```
index.html, css/style.css     page shell and styles
js/engine/                    the simulator (no DOM; also runs under Node)
  ip.js                         IPv4 helpers
  network.js                    devices, links, L2 domains, routing, OSPF, DHCP, NAT, ACLs, forwarding
  ios.js                        IOS-style command line: modes, parser, show commands, running-config
  host.js                       PC command prompt
  ansible.js                    simulated Ansible: inventory, playbook (YAML subset), modules
js/game/
  lab.js                        builds a lab from a level definition, evaluates objectives
  checks.js                     objective checks (ping works, VLAN exists, config saved ...)
  levels/tier1.js ... tier5.js  the story tickets
  topics.js                     the two exam blueprints, topics and where each sits in them, question-to-topic matching
  practice.js                   variant templates: generators that build a random version of a lab from a seed
  drillgen.js                   question generators for the drills (routing lookup, VLSM, IPv6, ACL tracing)
  questions.js                  exam question bank
  handbook.js                   command reference shown in the Handbook
js/ui/                        screens: home (career path and topics), study page, lab workspace, terminal, network map, drills, handbook
content/theory.md             the theory pages, one section per topic
data/                         optional personal data packs (git-ignored)
desktop/                      desktop app (Electron): main process, preload bridge, file serving, build config, icon
.github/workflows/desktop.yml builds the desktop installers and attaches them to each release
tools/serve.mjs               dev server
tools/release.mjs             cuts a release (version, changelog, tag, push)
tools/desktop-personal.mjs    desktop build with your own data packs inside (keep private)
tools/import-data.mjs         builds data packs from the companion practice app
tests/run-levels.mjs          level, variant template, topic and question bank tests
tests/run-sim.mjs             simulator behaviour tests on small purpose-built networks
tests/run-drills.mjs          drill tests: every generated answer is recomputed independently
tests/run-desktop.mjs         desktop app file serving and data pack checks (no Electron needed)
Dockerfile, nginx.conf        production image
CHANGELOG.md                  what changed in each version
```

## Adding a level

Add an object to one of the `js/game/levels/tierN.js` files. A lab looks like this:

```js
{
  id: "my-level", tier: 2, type: "lab", xp: 200, par: 600,       // par = seconds for the time star
  title: "Short title", from: "Who sent the ticket", subject: "Ticket subject line",
  brief: ["Paragraphs. `code` and **bold** are supported."],
  details: [["Label", "value"]],                                  // optional addressing table
  skills: ["commands this level teaches"],
  topology: {
    devices: [
      { name: "R1", kind: "router", hostname: "HQ-R1", x: 500, y: 100,
        config: ["interface g0/0", "ip address 10.0.0.1 255.255.255.0", "no shutdown"] },
      { name: "SW1", kind: "switch", x: 500, y: 260 },
      { name: "PC1", kind: "pc", x: 500, y: 420, ip: { mode: "static", ip: "10.0.0.10", mask: "255.255.255.0", gw: "10.0.0.1" } },
    ],
    links: ["R1:g0/0 SW1:g0/1", "SW1:fa0/1 PC1"],
  },
  objectives: [{ text: "PC1 can ping its gateway", check: C.ping("PC1", "10.0.0.1") }],
  hints: ["gentle nudge", "more specific", "nearly the answer"],
  solution: [{ on: "SW1", cmds: ["enable", "configure terminal", "..."] }],
  debrief: "One takeaway shown on the result screen.",
}
```

- `config` lines are typed into the device in global configuration mode when the lab is built, so a level can start half-configured or deliberately broken.
- `locked: true` makes a device visible but not manageable (an ISP router, for example).
- Routers have `G0/0`-`G0/2` and `S0/0/0`-`S0/0/1`; switches have `Fa0/1`-`Fa0/8` and `G0/1`-`G0/2`. Pass `ports: [...]` to change that.
- Objective checks live in `js/game/checks.js`; a check is just a function `(net, lab) => boolean`, so one-off checks can be written inline.
- Run `npm test` after adding a level: it proves the solution really completes it.

The subnetting drill uses `type: "subnet"` with `params: { count, minLen, maxLen }`, the generated drills use `type: "drill"` with `params: { kind, count }` where `kind` names a generator in `js/game/drillgen.js`, and exams use `type: "quiz"` with `params: { domains, count, pass }`.

Exam questions are added to `js/game/questions.js`: either under an exam domain as `[question, [options], indexOfAnswer, explanation]`, or in the `BY_TOPIC` list with an explicit topic. Give a list of indexes instead of one (`[0, 1]`) and the quiz shows it as a "choose two" question: exactly that many options must be picked, and it counts as right only when all of them are. Add new questions at the end of `BY_TOPIC`, because a question's id is its position and the game remembers by id which ones were missed.

## Adding variants to a lab

A template in `js/game/practice.js` is a generator: `gen(x)` receives a seeded random helper (`x.int`, `x.pick`, `x.sample`, `x.bool`) and returns the same fields as a lab (`subject`, `brief`, `details`, `topology`, `objectives`, `hints`, `solution`), built from the random values. Name the lab it is a variant of in the `AFTER` map. A lab can have several templates; the New variant button alternates between them.

`npm test` builds every template with 40 seeds and plays the generated solution each time, so a variant that cannot be completed is caught before release. `PRACTICE_SEEDS=500 npm test` runs more.

## Adding or editing theory

`content/theory.md` holds one page per topic, separated by `<!-- topic: id -->` lines. Pages are plain Markdown (headings, tables, lists, code blocks, block quotes). A new topic also needs an entry in `TOPICS` and `TOPIC_ORDER` in `js/game/topics.js`.

## The two exam versions

`js/game/topics.js` holds both blueprints (`EXAMS`). Content is shared and tagged, never duplicated:

| What | How it is tagged | Effect |
| --- | --- | --- |
| Topic | `v1` and `v2` give its domain in each exam; `null` means that exam does not have it | A topic with `v2: null` is shown only in v1.1, marked "v1 exclusive" |
| Theory section | `{v1}` or `{v2}` at the end of a `##` heading | Shown only in that exam, with a badge |
| Exam question | a seventh item `"v1"` or `"v2"`, or the `V1_ONLY` list | Drawn only in that exam |
| Lab | `only: "v2"` (or `"v1"`) | Part of that exam's career path only |
| Promotion exam | `params.domains` (v1.1) and `params.v2domains` (v2.0) | Draws questions by the chosen exam's domains |

Untagged content belongs to both. The AI topics of v2.0 (agentic AI, choosing prompts) are not covered yet.

## Releases

Changes are listed in [CHANGELOG.md](CHANGELOG.md), and every version is a git tag and a GitHub release. The version of a running copy is shown at the bottom of the career screen.

```bash
node tools/release.mjs patch      # or minor, major, or an explicit version
```

The script expects the changes to be committed and described under `## [Unreleased]` in the changelog. It runs the tests, bumps the version, dates the changelog section, commits, tags, pushes and publishes the GitHub release. `--no-push` stops after the local commit and tag.

Pushing the tag starts the **Desktop builds** workflow, which builds the Windows, macOS and Linux installers and attaches them, with the `latest*.yml` files the updater reads, to that release (about 10 minutes). Installed desktop apps then offer the update. The workflow also runs on pull requests that touch the desktop app, and by hand from the Actions tab, keeping the installers as a workflow artifact instead.

## Known limits of the simulator

It models what the CCNA labs need, not all of IOS. Several v2.0 topics are theory and questions only for that reason: IPv6 and OSPFv3, wireless, virtualization, VPNs, HSRP and VRRP, AAA servers, DHCP snooping, storm control and RA guard. Not simulated yet: IPv6, HSRP, wireless, and `debug`. Spanning tree is computed, not timed: the tree is worked out again after every command, so there are no listening or learning delays and no convergence to wait for, loop guard is accepted without effect, and BPDU filter is not modelled. A switch routes once `ip routing` is on: SVIs, routed ports (`no switchport`), static routes and OSPF work there, while NAT, access lists and DHCP pools stay router-only. EtherChannel is layer 2 only (no routed port-channels), and a member port takes its VLAN settings from the port-channel interface rather than being suspended when its own settings differ. OSPF is computed the same way: a router alone on a link becomes its designated router at once (the 40-second wait is not simulated), neighbours go straight to their final state, an MTU mismatch is not modelled, and it is single-area IPv4 only. Port security is accepted on a trunk but only enforced on access ports. Unknown commands are rejected the way IOS rejects them rather than silently accepted.
