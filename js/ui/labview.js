// The lab workspace: ticket + objectives, network map, device consoles.

import { h, rich, fmtTime, toast, stars } from "./dom.js";
import { Lab } from "../game/lab.js";
import { isHost } from "../engine/network.js";
import { ipToInt, intToIp, maskLen } from "../engine/ip.js";
import { Terminal } from "./terminal.js";
import { KEY_SOUNDS, keySoundStyle, setKeySound } from "./keysound.js";
import { Topology } from "./topology.js";
import { openHandbook } from "./handbook.js";
import { LEVEL_TOPIC, TOPIC_BY_ID } from "../game/topics.js";

// `actions` are extra buttons for the ticket (the app adds "New variant" here),
// `note` is a line of small print under them, `badge` goes beside the tier tag.
// onDone(result) may return a short label (such as "+120 XP") for the Solved banner.
export function mountLab(root, level, { onDone, actions = [], note = null, badge = null }) {
  let lab = new Lab(level);
  const topic = TOPIC_BY_ID.get(level.topic || LEVEL_TOPIC[level.id]);
  let hints = 0, solutionShown = false, start = Date.now(), finished = false;
  let terms = new Map(), active = null, lastDone = lab.progress().map(o => o.done);

  // ---- ticket window
  const objList = h("ul", { class: "objectives" });
  const hintBox = h("div", { class: "hints" });
  const hintBtn = h("button", { class: "btn small", onclick: askHint });
  const closeBtn = h("button", { class: "btn primary block", hidden: true, onclick: finish }, "Close ticket");
  const solvedBox = h("div", { class: "solved-banner", role: "status", hidden: true });
  const ticket = h("div", { class: "win-body ticket" },
    solvedBox,
    h("div", { class: "ticket-meta" }, h("span", { class: "tag" + (level.practice ? " practice" : "") }, level.practice ? "Variant" : `Tier ${level.tier}`), badge, h("span", { class: "muted small" }, `From: ${level.from}`)),
    h("h2", {}, level.subject),
    h("div", { class: "ticket-actions" },
      topic && h("button", { class: "btn small", onclick: () => openHandbook(topic.id), title: "Open the theory page for this topic without leaving the lab" }, `Theory: ${topic.name}`),
      actions),
    note && h("p", { class: "muted small ticket-note" }, note),
    level.brief.map(p => h("p", { html: rich(p) })),
    level.details && h("table", { class: "details" }, h("tbody", {}, level.details.map(([k, v]) => h("tr", {}, h("th", { scope: "row" }, k), h("td", {}, v))))),
    h("h3", {}, "Objectives"), objList, closeBtn,
    h("h3", {}, "Need a hand?"),
    h("p", { class: "muted small" }, "Each hint costs one star. Type ? in a console for free, context-sensitive help."),
    hintBox, hintBtn,
    level.skills && h("p", { class: "skills muted small" }, "Skills: ", level.skills.join(" · ")));

  // ---- network map
  const topo = new Topology({ onPick: openConsole });

  // ---- console window
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const ipBar = h("form", { class: "ipbar", hidden: true });
  const fileBar = h("div", { class: "filebar", hidden: true });
  const termHost = h("div", { class: "term-host" },
    h("div", { class: "term-empty" }, h("p", {}, "No console open."), h("p", { class: "muted" }, "Click a device on the network map to connect to it.")));

  const statTime = h("span", { class: "stat" });
  const statCmds = h("span", { class: "stat" });
  // typing sounds in the consoles: off, or one of a few styles
  const keysSel = h("select", { class: "keys-sel", "aria-label": "Typing sound" },
    Object.entries(KEY_SOUNDS).map(([id, name]) => h("option", { value: id }, id === "off" ? "Keys off" : name)));
  keysSel.value = keySoundStyle();
  keysSel.addEventListener("change", () => {
    setKeySound(keysSel.value);
    keysBtn.classList.toggle("on", keysSel.value !== "off");
    if (active) terms.get(active)?.focus();
  });
  const keysBtn = h("label", { class: "keys-btn" + (keySoundStyle() !== "off" ? " on" : ""), title: "Sound while you type in a console" }, h("span", { "aria-hidden": "true" }, "⌨"), keysSel);

  root.replaceChildren(
    h("div", { class: "workspace" },
      h("section", { class: "window win-ticket", "aria-label": "Ticket" }, winTitle("Ticket", level.title), ticket),
      h("section", { class: "window win-map", "aria-label": "Network map" },
        winTitle("Network map", "click a device to open its console",
          h("span", { class: "legend" }, h("i", { class: "dot up" }), "up", h("i", { class: "dot blocked" }), "blocked", h("i", { class: "dot down" }), "down")),
        h("div", { class: "win-body map-body" }, topo.el)),
      h("section", { class: "window win-console", "aria-label": "Console" },
        winTitle("Console", null, statTime, statCmds, keysBtn, h("button", { class: "btn ghost small", onclick: resetLab }, "Reset lab")),
        tabs, ipBar, fileBar, termHost)));

  function winTitle(name, sub, ...extra) {
    return h("header", { class: "win-title" }, h("span", { class: "win-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h("strong", {}, name), sub && h("span", { class: "muted small win-sub" }, sub), h("span", { class: "spacer" }), extra);
  }

  const timer = setInterval(tick, 1000);
  function tick() {
    const sec = (Date.now() - start) / 1000;
    statTime.textContent = `${fmtTime(sec)} / par ${fmtTime(level.par)}`;
    statTime.classList.toggle("over", sec > level.par);
    statCmds.textContent = `${lab.commands} cmd`;
  }

  // ---- consoles
  function openConsole(dn) {
    const d = lab.net.devs[dn];
    if (d.locked) { toast(d.lockMsg ? `${d.hostname}: no console here. ${d.lockMsg}` : `${d.hostname} is not ours to manage. ${d.note || ""}`.trim(), "warn"); return; }
    if (!terms.has(dn)) {
      lab.net.takeLogs(dn); // drop log lines that piled up before anyone was watching
      const session = lab.session(dn);
      const intro = isHost(d)
        ? `Kestrel Freight workstation ${d.name}\nType "help" to list the commands this PC supports.\n`
        : `${d.hostname} con0 is now available\n\nPress RETURN to get started.\n`;
      const term = new Terminal({ session, intro, exec: line => lab.exec(dn, line), onAfter: afterCommand });
      terms.set(dn, term);
      termHost.append(term.el);
    }
    active = dn;
    topo.active = dn;
    refresh();
    terms.get(dn).focus();
  }

  function closeConsole(dn) {
    const t = terms.get(dn);
    if (!t) return;
    t.el.remove();
    terms.delete(dn);
    delete lab.sessions[dn];
    if (active === dn) { active = [...terms.keys()].pop() || null; topo.active = active; }
    refresh();
  }

  function afterCommand() {
    // other open consoles show the log lines their device produced meanwhile
    for (const [dn, t] of terms) {
      if (isHost(lab.net.devs[dn])) continue;
      for (const l of lab.net.takeLogs(dn)) t.print(l, "log");
    }
    refresh();
  }

  // ---- PC IP settings bar
  // ---- files on a PC (inventory, playbooks): listed above the prompt, edited in a dialog
  function renderFileBar() {
    const d = active && lab.net.devs[active];
    if (!d || !d.files) { fileBar.hidden = true; return; }
    fileBar.hidden = false;
    fileBar.replaceChildren(h("strong", {}, "Files"), ...Object.keys(d.files).map(name => h("button", { class: "btn small", onclick: () => editFile(active, name), title: `Edit ${name}` }, name)),
      h("span", { class: "muted small" }, "Click a file to edit it. In the prompt: dir, type <file>, ansible-playbook <file>."));
  }
  function editFile(dn, name) {
    const area = h("textarea", { class: "editor", spellcheck: "false", autocomplete: "off", autocapitalize: "off", "aria-label": `Contents of ${name}` });
    area.value = lab.net.devs[dn].files[name];
    const close = () => { box.remove(); const t = terms.get(dn); if (t) t.focus(); };
    const saveIt = () => { lab.setFile(dn, name, area.value); lab.commands++; close(); toast(`${name} saved`, "ok"); afterCommand(); };
    area.addEventListener("keydown", e => {
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); area.setRangeText("  ", area.selectionStart, area.selectionEnd, "end"); }   // YAML wants spaces
      else if (e.key === "Escape") close();
      else if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveIt(); }
    });
    const box = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", "aria-label": `Edit ${name}` },
      h("div", { class: "modal wide" }, h("p", { class: "eyebrow" }, `${dn} \u00b7 file`), h("h2", {}, name),
        h("p", { class: "muted small" }, name.endsWith(".ini") ? "One host per line under its [group]: NAME ansible_host=ADDRESS" : "Indentation is the structure in YAML. Use spaces (Tab inserts two) and line new entries up with their neighbours."),
        area, h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: saveIt }, "Save"), h("button", { class: "btn", onclick: close }, "Cancel"), h("span", { class: "muted small" }, "Ctrl+S saves, Esc cancels"))));
    document.body.append(box);
    area.focus();
  }

  function renderIpBar() {
    const d = active && lab.net.devs[active];
    if (!d || !isHost(d)) { ipBar.hidden = true; return; }
    ipBar.hidden = false;
    if (ipBar.dataset.dev === active) return;      // keep what the player is typing
    ipBar.dataset.dev = active;
    const c = d.ipcfg;
    const v = x => (x != null ? intToIp(x) : "");
    const mode = h("select", { "aria-label": "Addressing mode" }, h("option", { value: "static" }, "Static"), h("option", { value: "dhcp" }, "DHCP"));
    mode.value = c.mode;
    const f = (label, val, ph) => { const i = h("input", { type: "text", value: val, placeholder: ph, spellcheck: "false", autocomplete: "off" }); return [h("label", {}, h("span", {}, label), i), i]; };
    const [ipL, ipI] = f("IP address", v(c.ip), "192.168.1.10");
    const [mL, mI] = f("Subnet mask", v(c.mask), "255.255.255.0");
    const [gL, gI] = f("Default gateway", v(c.gw), "192.168.1.1");
    const msg = h("span", { class: "ipbar-msg small", role: "status" });
    const sync = () => { for (const i of [ipI, mI, gI]) i.disabled = mode.value === "dhcp"; };
    mode.addEventListener("change", sync);
    sync();
    ipBar.replaceChildren(h("strong", {}, `${d.name} IP settings`), h("label", {}, h("span", {}, "Mode"), mode), ipL, mL, gL,
      h("button", { class: "btn small", type: "submit" }, "Apply"), msg);
    ipBar.onsubmit = e => {
      e.preventDefault();
      msg.className = "ipbar-msg small";
      if (mode.value === "dhcp") lab.setHostIp(active, { mode: "dhcp" });
      else {
        const ip = ipToInt(ipI.value), mask = ipToInt(mI.value), gw = gI.value.trim() ? ipToInt(gI.value) : null;
        const bad = ip === null ? "IP address is not valid" : mask === null || maskLen(mask) === null || mask === 0 ? "Subnet mask is not valid" : gI.value.trim() && gw === null ? "Default gateway is not valid"
          : gw !== null && ((gw ^ ip) & mask) !== 0 ? "The default gateway is not in the same subnet as the IP address" : null;
        if (bad) { msg.textContent = bad; msg.classList.add("err"); return; }
        lab.setHostIp(active, { mode: "static", ip, mask, gw });
      }
      lab.commands++;
      msg.textContent = "Applied";
      msg.classList.add("ok");
      afterCommand();
    };
  }

  // ---- refresh everything that reflects lab state
  function refresh() {
    const prog = lab.progress();
    objList.replaceChildren(...prog.map(o => h("li", { class: o.done ? "done" : "" }, h("span", { class: "check", "aria-hidden": "true" }, o.done ? "✓" : ""), h("span", { html: rich(o.text) }), h("span", { class: "sr" }, o.done ? " (done)" : " (open)"))));
    prog.forEach((o, i) => { if (o.done && !lastDone[i]) toast("Objective complete: " + o.text.replace(/[`*]/g, ""), "ok"); });
    lastDone = prog.map(o => o.done);
    const all = prog.every(o => o.done);
    closeBtn.hidden = !all || finished;
    if (all && !finished && !closeBtn.dataset.seen) { closeBtn.dataset.seen = "1"; closeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    if (!all) delete closeBtn.dataset.seen;

    topo.render(lab.net);
    tabs.replaceChildren(...[...terms.keys()].map(dn => {
      const d = lab.net.devs[dn];
      return h("div", { class: "tab" + (dn === active ? " active" : ""), role: "tab", "aria-selected": dn === active },
        h("button", { class: "tab-name", onclick: () => openConsole(dn) }, isHost(d) ? d.name : d.hostname),
        h("button", { class: "tab-x", "aria-label": `Close ${d.name} console`, onclick: () => closeConsole(dn) }, "×"));
    }));
    for (const [dn, t] of terms) { t.el.hidden = dn !== active; t.sync(); }
    termHost.querySelector(".term-empty").hidden = terms.size > 0;
    renderIpBar();
    renderFileBar();
    renderHints();
    tick();
  }

  // ---- hints
  function renderHints() {
    const left = level.hints.length - hints;
    hintBtn.hidden = solutionShown || finished;
    hintBtn.textContent = left > 0 ? `Ask for a hint (${left} left, -1 star)` : "Show the full solution (1 star max)";
  }
  function askHint() {
    if (hints < level.hints.length) {
      hintBox.append(h("div", { class: "bubble" }, h("span", { class: "who" }, "Dana"), h("span", { html: rich(level.hints[hints]) })));
      hints++;
    } else {
      solutionShown = true;
      hintBox.append(h("div", { class: "bubble solution" }, h("span", { class: "who" }, "Solution"),
        level.solution.map(step => step.file
          ? h("div", {}, h("strong", {}, `${step.pc}: ${step.file} should read`), h("pre", {}, step.content))
          : step.pc
          ? h("div", {}, h("strong", {}, step.pc), h("pre", {}, step.ip.mode === "dhcp" ? "IP settings: DHCP" : `IP settings: ${step.ip.ip}  ${step.ip.mask}  gateway ${step.ip.gw || "-"}`))
          : h("div", {}, h("strong", {}, lab.net.devs[step.on].hostname), h("pre", {}, step.cmds.filter(Boolean).join("\n"))))));
    }
    renderHints();
    hintBox.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function resetLab() {
    if (lab.commands > 0 && !confirm("Reset this lab to how it started? Your configuration changes will be lost (the timer and hints stay).")) return;
    lab = new Lab(level);
    for (const t of terms.values()) t.el.remove();
    terms = new Map();
    active = null;
    topo.active = null;
    delete ipBar.dataset.dev;
    lastDone = lab.progress().map(o => o.done);
    refresh();
  }

  function finish() {
    if (finished || !lab.complete) return;
    finished = true;
    clearInterval(timer);
    const seconds = Math.round((Date.now() - start) / 1000);
    let starCount = 3 - hints - (seconds > level.par ? 1 : 0);
    if (solutionShown) starCount = 1;
    starCount = Math.max(1, starCount);
    const label = onDone({ stars: starCount, seconds, hints, solutionShown, detail: [`${lab.commands} commands`, `${hints} hint${hints === 1 ? "" : "s"}`, seconds > level.par ? "over par time" : "within par time"] });
    // leave the screen visibly solved for anyone who keeps exploring
    root.querySelector(".workspace").classList.add("solved");
    closeBtn.hidden = true;
    hintBtn.hidden = true;
    solvedBox.hidden = false;
    solvedBox.replaceChildren(h("strong", {}, "\u2713 Solved"), stars(starCount), label ? h("span", { class: "solved-xp" }, label) : "", h("span", { class: "muted small" }, `in ${fmtTime(seconds)}`));
    ticket.scrollTop = 0;
  }

  refresh();
  return {
    dirty: () => lab.commands > 0 && !finished,
    destroy() { clearInterval(timer); },
  };
}
