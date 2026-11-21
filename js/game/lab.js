// Builds a playable lab (network + console sessions) from a level definition
// and evaluates its objectives.

import { ipToInt } from "../engine/ip.js";
import { Net, makeDevice, normIf, isHost } from "../engine/network.js";
import { IosSession, applyConfig, runningConfig } from "../engine/ios.js";
import { HostSession, setHostIp } from "../engine/host.js";

function endpoint(net, text) {
  const [dev, ifRaw] = text.split(":");
  const d = net.devs[dev];
  if (!d) throw new Error(`link: unknown device "${dev}"`);
  if (isHost(d)) return [dev, "eth0"];
  const ifn = normIf(ifRaw || "");
  if (!ifn || !d.ifaces[ifn]) throw new Error(`link: unknown interface "${text}"`);
  return [dev, ifn];
}

export class Lab {
  constructor(level) {
    this.level = level;
    this.net = new Net();
    this.sessions = {};
    this.seen = new Set();      // "mode:SW1:priv" style facts about what the player has done
    this.cmdLog = {};           // device -> commands typed
    this.commands = 0;
    const errors = [];
    const topo = level.topology;
    for (const spec of topo.devices) {
      const d = this.net.add(makeDevice(spec));
      this.cmdLog[d.name] = [];
      if (isHost(d) && spec.ip) setHostIp(this.net, d.name, spec.ip);
    }
    for (const l of topo.links) {
      const [a, b] = l.trim().split(/\s+/);
      this.net.link(...endpoint(this.net, a), ...endpoint(this.net, b));
    }
    for (const spec of topo.devices) {
      if (!spec.config) continue;
      errors.push(...applyConfig(this.net, spec.name, spec.config));
      const d = this.net.devs[spec.name];
      if (spec.saved !== false) d.startup = runningConfig(d);
    }
    if (errors.length) throw new Error(`Level "${level.id}" has config errors:\n` + errors.join("\n"));
    this.initial = {};
    for (const dn of this.net.order) if (!isHost(this.net.devs[dn])) this.initial[dn] = runningConfig(this.net.devs[dn]);
    this.net.touch();
    this.net.collectEvents();
    for (const dn of this.net.order) this.net.takeLogs(dn);
  }

  session(devName) {
    if (!this.sessions[devName]) {
      const d = this.net.devs[devName];
      this.sessions[devName] = isHost(d) ? new HostSession(this.net, devName) : new IosSession(this.net, devName);
    }
    return this.sessions[devName];
  }

  // Run one line on a device console and record it.
  exec(devName, line) {
    const s = this.session(devName);
    const wasPrompt = !!s.pending;
    const out = s.exec(line);
    if (!wasPrompt && line.trim()) {
      const target = s.remote ? s.remote.dev.name : devName;
      // only commands the device accepted count toward "ran this command" objectives
      const rejected = /% (Invalid input|Incomplete command|Ambiguous command|Unknown command|Not simulated)/.test(out);
      if (!rejected) (this.cmdLog[target] ||= []).push(line.trim());
      this.commands++;
    }
    const cur = s.remote || s;
    if (cur.mode && cur.dev) this.seen.add(`mode:${cur.dev.name}:${cur.mode}`);
    this.net.touch();
    this.progress();
    return out;
  }

  setHostIp(devName, cfg) {
    setHostIp(this.net, devName, cfg);
    this.net.collectEvents();
  }

  // replace the content of a text file on a PC (the Files bar does this)
  setFile(devName, name, content) {
    const d = this.net.devs[devName];
    d.files ||= {};
    d.files[name] = String(content).replace(/\r\n/g, "\n");
  }

  // one step of a scripted solution: commands, PC IP settings or a file edit
  runStep(step) {
    if (step.file) this.setFile(step.pc, step.file, step.content);
    else if (step.pc) this.setHostIp(step.pc, step.ip);
    else for (const c of step.cmds) this.exec(step.on, c);
  }

  // -> [{text, done}]
  progress() {
    return this.level.objectives.map(o => {
      let done = false;
      try { done = !!o.check(this.net, this); } catch { done = false; }
      return { text: o.text, done };
    });
  }
  get complete() { return this.progress().every(o => o.done); }

  // Play a scripted solution (used by the tests and the "show solution" panel).
  runSolution(steps = this.level.solution) {
    for (const step of steps) this.runStep(step);
  }
}

export const ip = s => {
  const v = ipToInt(s);
  if (v === null) throw new Error("bad ip " + s);
  return v;
};
