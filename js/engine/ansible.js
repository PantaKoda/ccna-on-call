// A small simulation of Ansible for the labs: an INI inventory, a playbook in a
// subset of YAML, and two network modules (ios_config, ios_command) plus ping.
// It drives the same simulated IOS devices as the consoles do, over the
// simulated network: a switch that cannot be reached by SSH is "unreachable".

import { ipToInt } from "./ip.js";
import { IosSession, remoteAccess, runningConfig } from "./ios.js";

// ---------------------------------------------------------------- inventory
export function parseInventory(text) {
  const hosts = {}, groups = {};
  let group = null;
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/[#;].*$/, "").trim();
    if (!line) continue;
    const g = /^\[([\w-]+)(:vars|:children)?\]$/.exec(line);
    if (g) { group = g[2] ? null : g[1]; if (group) groups[group] ||= []; continue; }
    if (line.startsWith("[")) continue;
    const [name, ...rest] = line.split(/\s+/);
    if (name.includes("=")) continue;             // a variable line outside a host entry
    const vars = Object.fromEntries(rest.filter(x => x.includes("=")).map(x => { const i = x.indexOf("="); return [x.slice(0, i), x.slice(i + 1)]; }));
    hosts[name] = { ...hosts[name], ...vars };
    if (group && !groups[group].includes(name)) groups[group].push(name);
  }
  return { hosts, groups };
}

function selectHosts(inv, pattern) {
  const out = [], unknown = [];
  for (const p of String(pattern).split(/[,:]/).map(x => x.trim()).filter(Boolean)) {
    const names = p === "all" ? Object.keys(inv.hosts) : inv.groups[p] ? inv.groups[p] : inv.hosts[p] ? [p] : null;
    if (!names) { unknown.push(p); continue; }
    for (const n of names) if (!out.includes(n)) out.push(n);
  }
  return { hosts: out, unknown };
}

// ---------------------------------------------------------------- YAML subset
class YamlError extends Error {}
const fail = (n, msg) => { throw new YamlError(`line ${n}: ${msg}`); };

function scalar(s) {
  s = s.trim();
  if (s.length > 1 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) return s.slice(1, -1);
  if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(",").map(x => scalar(x)).filter(x => x !== "");
  return s;
}

// Mappings, lists and plain values, structured by indentation. Enough for a playbook.
export function parseYaml(text) {
  const rows = [];
  String(text).split("\n").forEach((raw, i) => {
    if (/^\s*\t/.test(raw)) fail(i + 1, "tab characters cannot be used for indentation; use spaces");
    const line = raw.replace(/(^|\s)#.*$/, "");
    if (!line.trim() || line.trim() === "---") return;
    rows.push({ indent: line.match(/^ */)[0].length, text: line.trim(), n: i + 1 });
  });
  let pos = 0;
  const isItem = r => r.text === "-" || r.text.startsWith("- ");
  const block = indent => (isItem(rows[pos]) ? list(indent) : map(indent));
  function list(indent) {
    const out = [];
    while (pos < rows.length && rows[pos].indent === indent && isItem(rows[pos])) {
      const row = rows[pos], rest = row.text.slice(1).trim();
      if (!rest) { pos++; if (pos >= rows.length || rows[pos].indent <= indent) fail(row.n, "empty list item"); out.push(block(rows[pos].indent)); }
      else if (/^[\w.-]+:(\s|$)/.test(rest)) {
        const inner = indent + (row.text.length - rest.length);     // the column where the key starts
        rows[pos] = { indent: inner, text: rest, n: row.n };
        out.push(map(inner));
      } else { pos++; out.push(scalar(rest)); }
    }
    if (pos < rows.length && rows[pos].indent > indent) fail(rows[pos].n, "this line is indented further than the list it follows");
    return out;
  }
  function map(indent) {
    const out = {};
    while (pos < rows.length && rows[pos].indent === indent && !isItem(rows[pos])) {
      const row = rows[pos], m = /^([\w.-]+):(?:\s+(.*))?$/.exec(row.text);
      if (!m) fail(row.n, `expected "key: value", found "${row.text}"`);
      pos++;
      if (m[2] !== undefined && m[2] !== "") out[m[1]] = scalar(m[2]);
      else if (pos < rows.length && rows[pos].indent > indent) out[m[1]] = block(rows[pos].indent);
      else if (pos < rows.length && rows[pos].indent === indent && isItem(rows[pos])) out[m[1]] = list(indent);
      else out[m[1]] = null;
    }
    if (pos < rows.length && rows[pos].indent > indent) fail(rows[pos].n, "this line is indented further than the lines above it");
    return out;
  }
  if (!rows.length) return null;
  const doc = block(rows[0].indent);
  if (pos < rows.length) fail(rows[pos].n, "this line does not line up with anything above it");
  return doc;
}

// ---------------------------------------------------------------- playbook
const MODULES = ["ios_config", "ios_command", "ping"];
const moduleName = k => k.replace(/^(cisco\.ios\.|ansible\.builtin\.|ansible\.netcommon\.)/, "").replace(/^cli_config$/, "ios_config").replace(/^cli_command$/, "ios_command");
const asList = v => (v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

export function parsePlaybook(text) {
  const doc = parseYaml(text);
  if (!Array.isArray(doc)) throw new YamlError("a playbook must be a list of plays; the first play starts with \"- name:\" or \"- hosts:\"");
  return doc.map((p, i) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new YamlError(`play ${i + 1} is not a mapping`);
    if (typeof p.hosts !== "string" && !Array.isArray(p.hosts)) throw new YamlError(`play ${i + 1} ("${p.name || "unnamed"}") has no "hosts:" line`);
    if (!Array.isArray(p.tasks)) throw new YamlError(`play "${p.name || i + 1}" has no "tasks:" list`);
    const tasks = p.tasks.map((t, k) => {
      if (!t || typeof t !== "object" || Array.isArray(t)) throw new YamlError(`task ${k + 1} in play "${p.name || i + 1}" is not a mapping`);
      const keys = Object.keys(t).filter(x => !["name", "register", "when", "tags", "vars"].includes(x));
      const mod = keys.find(x => MODULES.includes(moduleName(x)));
      if (!mod) throw new YamlError(`couldn't resolve module/action '${keys[0] || "?"}' in task "${t.name || k + 1}". This lab supports ios_config, ios_command and ping`);
      const a = t[mod] || {};
      if (typeof a !== "object" || Array.isArray(a)) throw new YamlError(`the arguments of ${mod} in task "${t.name || k + 1}" must be indented under it as "key: value" lines`);
      const name = moduleName(mod);
      if (name === "ios_config" && !asList(a.lines).length) throw new YamlError(`task "${t.name || k + 1}": ios_config needs a "lines:" list`);
      if (name === "ios_command" && !asList(a.commands).length) throw new YamlError(`task "${t.name || k + 1}": ios_command needs a "commands:" list`);
      return { name: t.name || name, module: name, lines: asList(a.lines), parents: asList(a.parents), commands: asList(a.commands) };
    });
    return { name: p.name || String(p.hosts), hosts: Array.isArray(p.hosts) ? p.hosts.join(",") : p.hosts, tasks };
  });
}

// ---------------------------------------------------------------- running
const REJECT = /% (Invalid input|Incomplete command|Ambiguous command|Unknown command)|^% .*(overlaps|rejected)|Command rejected/m;

function connect(net, from, inv, host) {
  const addr = inv.hosts[host] && inv.hosts[host].ansible_host;
  const ip = ipToInt(addr || host);
  if (ip === null) return { error: `Failed to connect to the host via ssh: Could not resolve hostname ${addr || host}. Add ansible_host=<address> to the inventory.` };
  const r = remoteAccess(net, from, ip, "ssh");
  if (!r.ok) return { error: `Failed to connect to the host via ssh: connect to host ${addr || host} port 22: ${r.reason === "timeout" ? "Connection timed out" : "Connection refused"}` };
  return { dev: r.dev };
}

function runConfig(net, devName, task, check) {
  const d = net.devs[devName];
  const snap = check ? structuredClone(d) : null;
  const state = () => runningConfig(d) + JSON.stringify(d.vlans || {});
  const before = state();
  const s = new IosSession(net, devName, { mode: "config" });
  let error = null;
  for (const line of [...task.parents, ...task.lines]) {
    net.touch();
    const out = s.run(line.trim()) || "";
    if (s.pending) s.pending = null;
    if (REJECT.test(out)) { error = `${line.trim()}\r\n${out.trim().split("\n").pop()}`; break; }
  }
  const changed = state() !== before;
  if (check) { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, snap); }
  net.touch();
  return { error, changed };
}

function runCommands(net, devName, task) {
  const s = new IosSession(net, devName, { mode: "priv" });
  const outs = [];
  for (const c of task.commands) {
    const out = s.run(c.trim()) || "";
    if (REJECT.test(out) || /^Translating /.test(out)) return { error: `${c.trim()}\r\n% Invalid input detected`, outs };
    outs.push(out);
  }
  return { outs };
}

const bar = t => t + " " + "*".repeat(Math.max(3, 78 - t.length));

// ansible <pattern> -m <module> [-a "<args>"]
export function runAdhoc(net, from, invText, pattern, module, args) {
  const inv = parseInventory(invText);
  const sel = selectHosts(inv, pattern);
  const out = sel.unknown.map(p => `[WARNING]: Could not match supplied host pattern, ignoring: ${p}`);
  if (!sel.hosts.length) return [...out, "[WARNING]: No hosts matched, nothing to do"].join("\n");
  const mod = moduleName(module || "ping");
  if (!["ping", "ios_command"].includes(mod)) return `ERROR! This lab's ad-hoc mode supports -m ping and -m ios_command. Use a playbook for ${module}.`;
  if (mod === "ios_command" && !args) return 'ERROR! ios_command needs a command: -a "show vlan brief"';
  for (const h of sel.hosts) {
    const c = connect(net, from, inv, h);
    if (c.error) { out.push(`${h} | UNREACHABLE! => {`, `    "changed": false,`, `    "msg": "${c.error}",`, `    "unreachable": true`, "}"); continue; }
    if (mod === "ping") { out.push(`${h} | SUCCESS => {`, `    "changed": false,`, `    "ping": "pong"`, "}"); continue; }
    const r = runCommands(net, c.dev, { commands: [String(args).replace(/^commands=/, "")] });
    if (r.error) out.push(`${h} | FAILED! => {`, `    "msg": "${r.error.replace(/\r\n/g, " ")}"`, "}");
    else out.push(`${h} | SUCCESS =>`, r.outs[0] || "(no output)", "");
  }
  return out.join("\n");
}

// ansible-playbook [--check] <playbook>. Returns { text, results, check }.
export function runPlaybook(net, from, invText, playbookText, { check = false } = {}) {
  let plays;
  try { plays = parsePlaybook(playbookText); }
  catch (e) { return { text: `ERROR! We were unable to read the playbook: ${e.message}`, results: null, check }; }
  const inv = parseInventory(invText);
  const out = [], stats = {};
  const stat = h => (stats[h] ||= { ok: 0, changed: 0, unreachable: 0, failed: 0 });
  for (const play of plays) {
    const sel = selectHosts(inv, play.hosts);
    for (const p of sel.unknown) out.push(`[WARNING]: Could not match supplied host pattern, ignoring: ${p}`);
    out.push("", bar(`PLAY [${play.name}]`));
    if (!sel.hosts.length) { out.push("skipping: no hosts matched"); continue; }
    const live = new Map();
    for (const h of sel.hosts) {
      const c = connect(net, from, inv, h);
      if (c.error) { stat(h).unreachable++; live.set(h, null); out.push(`fatal: [${h}]: UNREACHABLE! => {"changed": false, "msg": "${c.error}", "unreachable": true}`); }
      else live.set(h, c.dev);
    }
    for (const task of play.tasks) {
      if (![...live.values()].some(Boolean)) break;
      out.push("", bar(`TASK [${task.name}]`));
      for (const [h, dev] of live) {
        if (!dev) continue;
        const r = task.module === "ios_config" ? runConfig(net, dev, task, check) : task.module === "ios_command" ? runCommands(net, dev, task) : {};
        if (r.error) { stat(h).failed++; live.set(h, null); out.push(`fatal: [${h}]: FAILED! => {"changed": false, "msg": "${r.error.replace(/\r\n/g, " -> ")}"}`); }
        else if (r.changed) { stat(h).ok++; stat(h).changed++; out.push(`changed: [${h}]`); }
        else { stat(h).ok++; out.push(`ok: [${h}]`); }
      }
    }
  }
  out.push("", bar("PLAY RECAP"));
  for (const [h, s] of Object.entries(stats)) out.push(`${h.padEnd(26)} : ok=${String(s.ok).padEnd(4)} changed=${String(s.changed).padEnd(4)} unreachable=${String(s.unreachable).padEnd(4)} failed=${s.failed}`);
  if (!Object.keys(stats).length) out.push("(no hosts were targeted)");
  if (check) out.push("", "Check mode: nothing was changed on the devices.");
  net.collectEvents();
  return { text: out.join("\n").trimStart(), results: stats, check };
}

export { YamlError };
