// A Windows-style command prompt for simulated PCs and servers.

import { ipToInt, intToIp, bcastOf } from "./ip.js";
import { fakeMac, isHost, ifKind } from "./network.js";
import { IosSession, remoteAccess, checkLogin, traceHops } from "./ios.js";
import { runAdhoc, runPlaybook } from "./ansible.js";

const FILE_HELP = [
  "",
  "This PC is an Ansible control node:",
  "dir                                   List the files on this PC",
  "type <file>                           Show a file (edit files with the Files bar above)",
  "ansible <hosts> -m ping               Check Ansible can log in to the hosts",
  'ansible <hosts> -m ios_command -a "show vlan brief"',
  "ansible-playbook <playbook> [--check] Run a playbook (--check only reports what would change)",
].join("\n");

// split a command line into arguments, keeping "quoted text" together
function splitArgs(text) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const HELP = [
  "ipconfig [/all | /renew | /release]   Show or refresh this PC's IP settings",
  "arp -a                                Show this PC's ARP cache (local IP to MAC table)",
  "ping <ip>                             Test reachability",
  "tracert <ip>                          Show the routers on the path",
  "ssh -l <user> <ip>                    Open an SSH session to a device",
  "telnet <ip>                           Open a Telnet session to a device",
  "curl http://<ip>                      Request a web page",
  "cls                                   Clear the screen",
  "",
  "Set a static address or switch to DHCP with the IP settings bar above this window.",
].join("\n");

// Format a Cisco dotted MAC ("00ab.cdef.1200") as Windows hyphenated ("00-ab-cd-ef-12-00").
const winMac = mac => mac.replace(/\./g, "").match(/../g).join("-");


// Apply IP settings to a host. Strings or integers are accepted.
export function setHostIp(net, devName, cfg) {
  const d = net.devs[devName];
  const num = v => (v == null || v === "" ? null : typeof v === "number" ? v : ipToInt(v));
  if (cfg.mode === "dhcp") d.ipcfg = { mode: "dhcp", ip: null, mask: null, gw: null, dns: null };
  else d.ipcfg = { mode: "static", ip: num(cfg.ip), mask: num(cfg.mask), gw: num(cfg.gw), dns: num(cfg.dns) };
  net.touch();
}

export class HostSession {
  constructor(net, devName) {
    this.net = net;
    this.dev = net.devs[devName];
    this.remote = null;
    this.pending = null;
    this.history = [];
    this.count = 0;
  }
  get prompt() {
    if (this.pending) return this.pending.prompt;
    return this.remote ? this.remote.prompt : "C:\\>";
  }
  get hidden() { return this.pending ? !!this.pending.hidden : this.remote ? this.remote.hidden : false; }
  get mode() { return this.remote ? this.remote.mode : "host"; }
  help(line) { return this.remote ? this.remote.help(line) : null; }
  complete(line) { return this.remote ? this.remote.complete(line) : line; }
  ask(prompt, fn, hidden = false) { this.pending = { prompt, fn, hidden }; }

  exec(line) {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      return p.fn(line) || "";
    }
    if (this.remote) {
      const out = this.remote.exec(line);
      if (line.trim()) { this.history.push(line.trim()); this.count++; }
      if (this.remote.closed) {
        const name = this.remote.dev.hostname;
        this.remote = null;
        return (out ? out + "\n" : "") + `[Connection to ${name} closed by foreign host]`;
      }
      return out;
    }
    const text = line.trim();
    if (!text) return "";
    this.history.push(text);
    this.count++;
    const [cmd, ...args] = splitArgs(text);
    const fn = COMMANDS[cmd.toLowerCase()];
    if (!fn) return `'${cmd}' is not recognized as an internal or external command,\noperable program or batch file.`;
    return fn(this, args) || "";
  }
}

function failIp(net, r) {
  // address of the router that reported the failure (its ingress interface)
  const path = r.stage === "reply" ? r.reqHops : r.hops;
  const hop = [...(path || [])].reverse().find(h => h.to === r.at);
  if (!hop) return null;
  const i = net.devs[r.at].ifaces[hop.toIf];
  return i && i.ip != null ? intToIp(i.ip) : null;
}

function inventoryOf(s, args) {
  const i = args.indexOf("-i");
  const name = i >= 0 ? args[i + 1] : "inventory.ini";
  const text = s.dev.files && s.dev.files[name];
  return text == null ? { error: `ERROR! Unable to find the inventory file "${name}". Type "dir" to list the files here.` } : { text, name };
}
const NO_ANSIBLE = name => `'${name}' is not recognized as an internal or external command,\noperable program or batch file.`;

const COMMANDS = {
  help: s => HELP + (s.dev.files ? FILE_HELP : ""),
  "?": s => HELP + (s.dev.files ? FILE_HELP : ""),

  dir(s) {
    if (!s.dev.files) return " Directory of C:\\Users\\user\n\n               0 File(s)";
    const names = Object.keys(s.dev.files);
    return [" Directory of C:\\ansible", "", ...names.map(n => `${String(s.dev.files[n].length).padStart(8)} ${n}`), `${String(names.length).padStart(8)} File(s)`].join("\n");
  },
  ls(s) { return COMMANDS.dir(s); },
  type(s, args) {
    if (!args[0]) return "The syntax of the command is incorrect. Usage: type <file>";
    const text = s.dev.files && s.dev.files[args[0]];
    return text == null ? "The system cannot find the file specified." : text.replace(/\n+$/, "");
  },
  cat(s, args) { return COMMANDS.type(s, args); },

  ansible(s, args) {
    if (!s.dev.files) return NO_ANSIBLE("ansible");
    const inv = inventoryOf(s, args);
    if (inv.error) return inv.error;
    const flags = new Set(["-i", "-m", "-a"]);
    const pattern = args.find((a, i) => !a.startsWith("-") && !flags.has(args[i - 1]));
    const m = args.indexOf("-m"), a = args.indexOf("-a");
    if (!pattern) return 'Usage: ansible <hosts> -m ping        (hosts is "all", a group or a host from the inventory)';
    return runAdhoc(s.net, s.dev.name, inv.text, pattern, m >= 0 ? args[m + 1] : "ping", a >= 0 ? args[a + 1] : "");
  },

  "ansible-playbook"(s, args) {
    if (!s.dev.files) return NO_ANSIBLE("ansible-playbook");
    const inv = inventoryOf(s, args);
    if (inv.error) return inv.error;
    const file = args.find((a, i) => !a.startsWith("-") && args[i - 1] !== "-i");
    if (!file) return "Usage: ansible-playbook <playbook.yml> [--check]";
    const text = s.dev.files[file];
    if (text == null) return `ERROR! the playbook: ${file} could not be found`;
    const run = runPlaybook(s.net, s.dev.name, inv.text, text, { check: args.includes("--check") || args.includes("-C") });
    if (run.results && !run.check) s.net.ansibleLast = { playbook: file, results: run.results };
    return run.text;
  },
  cls: () => "\f",
  clear: () => "\f",

  ipconfig(s, args) {
    const net = s.net, d = s.dev;
    const opt = (args[0] || "").toLowerCase();
    if (opt === "/release" || opt === "/renew") {
      if (d.ipcfg.mode !== "dhcp") return "The operation failed as no adapter is in the state permissible for\nthis operation. (This PC uses a static address.)";
      if (opt === "/release") delete net.leaseMemo[d.name];
      net.touch();
    } else if (opt && opt !== "/all") return `Error: unrecognized or incomplete command line.\n\nUSAGE:\n    ipconfig [/all | /renew | /release]`;
    const c = net.st.pcs[d.name];
    const up = net.st.status(d.name, "eth0").up;
    const out = ["", "Ethernet adapter Ethernet0:", ""];
    if (!up) { out.push("   Media State . . . . . . . . . . . : Media disconnected"); return out.join("\n"); }
    const v = x => (x != null ? intToIp(x) : "");
    if (opt === "/all") {
      out.push(`   Physical Address. . . . . . . . . : ${winMac(fakeMac(d.name)).toUpperCase()}`);
      out.push(`   DHCP Enabled. . . . . . . . . . . : ${d.ipcfg.mode === "dhcp" ? "Yes" : "No"}`);
    }
    if (c.via === "apipa") out.push(`   Autoconfiguration IPv4 Address. . : ${v(c.ip)}`);
    else out.push(`   IPv4 Address. . . . . . . . . . . : ${c.ip != null ? v(c.ip) : "0.0.0.0"}`);
    out.push(`   Subnet Mask . . . . . . . . . . . : ${c.mask != null ? v(c.mask) : "0.0.0.0"}`);
    out.push(`   Default Gateway . . . . . . . . . : ${v(c.gw)}`);
    if (opt === "/all") {
      if (c.via === "dhcp") {
        const srv = net.devs[c.server];
        const sip = net.st.l3[c.server].find(i => ((i.ip ^ c.ip) & c.mask) === 0) || net.st.l3[c.server][0];
        out.push(`   DHCP Server . . . . . . . . . . . : ${sip ? intToIp(sip.ip) : srv.hostname}`);
      }
      out.push(`   DNS Servers . . . . . . . . . . . : ${v(c.dns)}`);
    }
    if (c.via === "apipa") out.push("", "   (No DHCP server answered, so Windows assigned itself a 169.254.x.x address.)");
    return out.join("\n");
  },

  arp(s, args) {
    const opt = (args[0] || "").toLowerCase();
    if (opt !== "-a" && opt !== "/a") {
      return "Displays the ARP cache (IPv4 to MAC mappings on the local subnet).\n\n  ARP -a   Displays current ARP entries.";
    }
    const net = s.net, d = s.dev, st = net.st;
    const c = st.pcs[d.name];
    if (!st.status(d.name, "eth0").up || c.ip == null) return "No ARP Entries Found.";
    const root = st.find(`${d.name}|eth0`);
    const rows = [];
    const seen = new Set();
    const pad = (x, n) => String(x).padEnd(n);
    const add = (ip, mac, type) => {
      const k = `${ip}|${type}`;
      if (seen.has(k)) return;
      seen.add(k);
      rows.push(`  ${pad(intToIp(ip), 22)}${pad(mac, 22)}${type}`);
    };
    for (const on of net.order) {
      if (on === d.name) continue;
      if (isHost(net.devs[on])) {
        const oc = st.pcs[on];
        if (oc.ip == null || !st.status(on, "eth0").up) continue;
        if (st.find(`${on}|eth0`) === root && ((oc.ip ^ c.ip) & c.mask) === 0) {
          add(oc.ip, winMac(fakeMac(on, 0)), "dynamic");
        }
      } else {
        const od = net.devs[on];
        for (const i of st.l3[on] || []) {
          if (ifKind(i.name) === "loop" || i.name.startsWith("Serial")) continue;
          if (st.find(i.key) === root && ((i.ip ^ c.ip) & c.mask) === 0) {
            const idx = od.ifOrder.indexOf(i.name.split(".")[0]);
            add(i.ip, winMac(fakeMac(on, idx >= 0 ? idx : 0)), "dynamic");
          }
        }
      }
    }
    if (c.mask != null && c.mask !== 0xffffffff) {
      add(bcastOf(c.ip, c.mask), "ff-ff-ff-ff-ff-ff", "static");
    }
    add(0xffffffff, "ff-ff-ff-ff-ff-ff", "static");
    return [
      "",
      `Interface: ${intToIp(c.ip)} --- 0x2`,
      `  ${pad("Internet Address", 22)}${pad("Physical Address", 22)}Type`,
      ...rows,
    ].join("\n");
  },

  ping(s, args) {
    const ip = ipToInt(args[0] || "");
    if (ip === null) return args[0] ? `Ping request could not find host ${args[0]}. Please check the name and try again.` : "Usage: ping <ip address>";
    const net = s.net, r = net.st.reach(s.dev.name, ip, { user: true });
    const t = intToIp(ip);
    const out = ["", `Pinging ${t} with 32 bytes of data:`];
    let line, ok = 0;
    if (r.ok) {
      const ttl = (net.devs[r.target].kind === "pc" || net.devs[r.target].kind === "server" ? 128 : 255) - Math.max(0, r.hops.length - 1);
      line = `Reply from ${t}: bytes=32 time${r.hops.length > 2 ? "=" + r.hops.length + "ms" : "<1ms"} TTL=${ttl}`;
      ok = 4;
    } else if (r.reason === "noip" || (r.reason === "noroute" && r.at === s.dev.name)) line = "PING: transmit failed. General failure.";
    else if (r.stage === "request" && r.reason === "arp" && r.at === s.dev.name) line = `Reply from ${intToIp(net.st.pcs[s.dev.name].ip)}: Destination host unreachable.`;
    else if (r.stage === "request" && r.reason === "noroute") line = `Reply from ${failIp(net, r) || t}: Destination host unreachable.`;
    else if (r.stage === "request" && r.reason === "acl") line = `Reply from ${failIp(net, r) || t}: Destination net unreachable.`;
    else line = "Request timed out.";
    for (let i = 0; i < 4; i++) out.push(line);
    out.push("", `Ping statistics for ${t}:`, `    Packets: Sent = 4, Received = ${ok}, Lost = ${4 - ok} (${ok ? 0 : 100}% loss),`);
    return out.join("\n");
  },

  tracert(s, args) {
    const ip = ipToInt(args[0] || "");
    if (ip === null) return "Usage: tracert <ip address>";
    const t = traceHops(s.net, s.dev.name, ip);
    const out = ["", `Tracing route to ${intToIp(ip)} over a maximum of 30 hops:`, ""];
    t.hops.forEach((h, i) => out.push(`  ${String(i + 1).padStart(2)}    <1 ms    <1 ms    <1 ms  ${h}`));
    if (!t.reached) for (let i = 0; i < 3; i++) out.push(`  ${String(t.hops.length + i + 1).padStart(2)}     *        *        *     Request timed out.`);
    out.push("", t.reached ? "Trace complete." : "Trace stopped: destination not reached.");
    return out.join("\n");
  },

  ssh(s, args) {
    let user = null, host = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-l") user = args[++i];
      else if (args[i].includes("@")) [user, host] = args[i].split("@");
      else host = args[i];
    }
    const ip = ipToInt(host || "");
    if (ip === null || !user) return "Usage: ssh -l <username> <ip address>";
    const r = remoteAccess(s.net, s.dev.name, ip, "ssh");
    if (!r.ok) {
      if (r.reason === "timeout") return `ssh: connect to host ${host} port 22: Connection timed out`;
      if (r.reason === "nopassword") return "% Password required, but none set\n[Connection closed by foreign host]";
      return `ssh: connect to host ${host} port 22: Connection refused`;
    }
    return login(s, r.dev, user, r.login);
  },

  telnet(s, args) {
    const ip = ipToInt(args[0] || "");
    if (ip === null) return "Usage: telnet <ip address>";
    const r = remoteAccess(s.net, s.dev.name, ip, "telnet");
    const head = `Trying ${args[0]} ...`;
    if (!r.ok) {
      if (r.reason === "timeout") return `${head}\n% Connection timed out; remote host not responding`;
      if (r.reason === "nopassword") return `${head}Open\n\n[Connection to ${args[0]} closed by foreign host]\n% Password required, but none set`;
      return `${head}\n% Connection refused by remote host`;
    }
    if (r.login === "local") {
      s.ask("Username: ", u => login(s, r.dev, u.trim(), r.login));
      return `${head}Open\n\nUser Access Verification\n`;
    }
    return `${head}Open\n` + (login(s, r.dev, "", r.login) || "");
  },

  curl(s, args) {
    const url = args.find(a => !a.startsWith("-"));
    if (!url) return "curl: try 'curl http://<ip address>'";
    const m = /^(?:(https?):\/\/)?([\d.]+)(?::(\d+))?(\/.*)?$/i.exec(url);
    const ip = m ? ipToInt(m[2]) : null;
    if (ip === null) return `curl: (6) Could not resolve host: ${url}`;
    const port = m[3] ? Number(m[3]) : (m[1] || "").toLowerCase() === "https" ? 443 : 80;
    const r = s.net.st.reach(s.dev.name, ip, { proto: "tcp", dport: port, user: true });
    if (!r.ok) return `curl: (28) Failed to connect to ${m[2]} port ${port}: Connection timed out`;
    const t = s.net.devs[r.target];
    const svc = port === 443 ? "https" : port === 80 ? "http" : String(port);
    if (!(t.services || []).includes(svc)) return `curl: (7) Failed to connect to ${m[2]} port ${port}: Connection refused`;
    return `<html>\n  <head><title>${t.name}</title></head>\n  <body><h1>${t.note || t.name} - it works</h1></body>\n</html>`;
  },
};

function login(s, devName, user, mode) {
  const d = s.net.devs[devName];
  const open = () => {
    // a local account with privilege 15 lands straight at the # prompt
    const top = mode === "local" && d.users[user] && d.users[user].priv === 15;
    s.remote = new IosSession(s.net, devName, { remote: true, mode: top ? "priv" : "user" });
    return d.banner ? d.banner + "\n" : "";
  };
  if (mode === "none") return open();
  let tries = 0;
  const askPw = () => s.ask("Password: ", pw => {
    if (checkLogin(d, user, pw)) return open();
    if (++tries >= 3) return "% Authentication failed\n[Connection closed by foreign host]";
    askPw();
    return "% Login invalid";
  }, true);
  askPw();
  return "";
}
