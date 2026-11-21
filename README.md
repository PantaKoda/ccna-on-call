# CCNA: On Call

A network engineering game for people studying for the CCNA 200-301 exam. Instead of only answering multiple-choice questions, you play the on-call network engineer at a fictional company: tickets come in, you open a console on a simulated router, switch or PC, and fix the network with IOS-style commands. Objectives tick off live as the simulated network starts working.

It is a static web app (plain HTML, CSS and ES modules, no build step, no backend). Progress is saved in the browser's localStorage.

> This is an independent study project. It is not affiliated with, endorsed by or sponsored by Cisco Systems. Cisco, CCNA and IOS are trademarks of Cisco Systems, Inc.

## What is in it

- **25 levels in 5 tiers**, each harder than the last: 18 hands-on labs, 2 subnetting drills and 5 promotion exams.
- **A network simulator** that runs in the browser: VLANs and trunks, router-on-a-stick, static and default routes, OSPF (adjacencies, costs, DR/BDR, passive interfaces, default origination), DHCP server and relay, NAT (PAT and static), standard and extended ACLs, SSH/Telnet access rules, port security.
- **An IOS-style command line**: user/privileged/config modes, command abbreviation (`sh ip int br`), `?` help, Tab completion, `do`, `no` forms, `| include / exclude / begin / section`, console log messages (`%LINK-3-UPDOWN`, `%OSPF-5-ADJCHG`), and over thirty `show` commands.
- **A PC command prompt**: `ipconfig`, `ping`, `tracert`, `ssh`, `telnet`, `curl`, plus an IP settings bar for static/DHCP addressing.
- **Scoring**: three stars per level (minus one per hint, minus one for going over par time), XP, and a rank that rises as you clear tiers.
- **Handbook**: a searchable command reference, one click away during any ticket.

| Tier | Rank | Topics |
| --- | --- | --- |
| 1 Orientation Week | Intern | console modes, passwords and banners, subnetting, interface addressing, switch management IP |
| 2 Access Layer | Junior Engineer | VLANs, trunks, router-on-a-stick, port security |
| 3 Routing Rotation | Network Engineer | static routes, default routes, OSPF, OSPF troubleshooting |
| 4 Services and Security | Senior Engineer | DHCP, NAT/PAT, extended ACLs, SSH hardening |
| 5 Incident Lead | Lead Engineer | a five-fault outage, a full branch build, the final exam |

## Run it locally

```bash
node tools/serve.mjs        # http://localhost:8080
```

Any static file server works, as long as it serves `.js` files with a JavaScript MIME type (ES modules need that). Opening `index.html` straight from disk does not work, because browsers block module scripts on `file://`.

To try any level without playing the ones before it, add `?unlock=all` to the URL: `http://localhost:8080/?unlock=all`.

## Tests

```bash
npm test                      # plays every lab's scripted solution in the simulator
node tests/run-levels.mjs ospf-broken -v    # one level, with the full console transcript
```

Each lab ships with a solution script. The test builds the lab, checks the objectives are not already met, types the solution into the simulated consoles and checks every objective is met at the end. It also checks that the question bank is well formed and large enough for every exam. The Docker build runs the same test and fails if a level can no longer be completed.

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

Everything in this repository was written for the project: the simulator, the levels, the exam questions (`js/game/questions.js`) and the handbook (`js/game/handbook.js`).

You can swap in your own question bank or handbook by placing `questions.js` or `notes.js` in `data/`. Those two files are ignored by git on purpose, so content you only hold a personal licence for (questions from a book you bought, for instance) cannot be committed by accident. See [data/README.md](data/README.md) for the formats.

## Project layout

```
index.html, css/style.css     page shell and styles
js/engine/                    the simulator (no DOM; also runs under Node)
  ip.js                         IPv4 helpers
  network.js                    devices, links, L2 domains, routing, OSPF, DHCP, NAT, ACLs, forwarding
  ios.js                        IOS-style command line: modes, parser, show commands, running-config
  host.js                       PC command prompt
js/game/
  lab.js                        builds a lab from a level definition, evaluates objectives
  checks.js                     objective checks (ping works, VLAN exists, config saved ...)
  levels/tier1.js ... tier5.js  the levels
  questions.js                  exam question bank
  handbook.js                   command reference shown in the Handbook
js/ui/                        screens: career map, lab workspace, terminal, network map, drills, handbook
data/                         optional personal data packs (git-ignored)
tools/serve.mjs               dev server
tools/import-data.mjs         builds data packs from the companion practice app
tests/run-levels.mjs          level and question bank tests
Dockerfile, nginx.conf        production image
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

Drills use `type: "subnet"` with `params: { count, minLen, maxLen }`, and exams use `type: "quiz"` with `params: { domains, count, pass }`.

Exam questions are added to `js/game/questions.js` as `[question, [options], indexOfAnswer, explanation]` under the right domain.

## Known limits of the simulator

It models what the CCNA labs need, not all of IOS. Not simulated yet: IPv6, spanning-tree topology changes (loops are not detected), EtherChannel bundling (the commands are accepted and saved), HSRP, wireless, and `debug`. Unknown commands are rejected the way IOS rejects them rather than silently accepted.
