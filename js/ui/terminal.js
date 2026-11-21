// A small terminal widget: scrollback + one input line. It drives a session
// object that exposes prompt, hidden, exec(line), help(line), complete(line).

import { h } from "./dom.js";

export class Terminal {
  constructor({ session, exec, onAfter, intro }) {
    this.session = session;
    this.execFn = exec;
    this.onAfter = onAfter || (() => {});
    this.hist = [];
    this.histPos = 0;
    this.out = h("div", { class: "term-out" });
    this.promptEl = h("span", { class: "term-prompt" });
    this.input = h("input", { class: "term-input", type: "text", spellcheck: "false", autocomplete: "off", autocapitalize: "off", autocorrect: "off", "aria-label": "Command line" });
    this.el = h("div", { class: "term" }, this.out, h("label", { class: "term-line" }, this.promptEl, this.input));
    this.el.addEventListener("mouseup", () => { if (!String(getSelection())) this.focus(); });
    this.input.addEventListener("keydown", e => this.key(e));
    // IOS answers "?" the moment it is typed. Watching the input event (not the
    // key) also works with on-screen keyboards.
    this.input.addEventListener("input", () => {
      const v = this.input.value;
      if (!v.endsWith("?") || this.session.hidden) return;
      const line = v.slice(0, -1);
      const help = this.session.help(line);
      if (help == null) return;              // PC prompt: "?" is just a character
      this.input.value = line;
      this.print(this.session.prompt + line + "?");
      this.print(help);
    });
    if (intro) this.print(intro);
    this.sync();
  }

  focus() { this.input.focus({ preventScroll: true }); }

  print(text, cls) {
    if (text === "" || text == null) return;
    this.out.append(h("div", { class: "term-row" + (cls ? " " + cls : "") }, text));
    while (this.out.childElementCount > 600) this.out.firstElementChild.remove();
    this.scroll();
  }
  scroll() { this.el.scrollTop = this.el.scrollHeight; }

  sync() {
    this.promptEl.textContent = this.session.prompt;
    const hidden = this.session.hidden;
    if ((this.input.type === "password") !== hidden) this.input.type = hidden ? "password" : "text";
  }

  run(line) {
    const hidden = this.session.hidden;
    this.print(this.session.prompt + (hidden ? "" : line) || " ");
    if (line.trim() && !hidden) { this.hist.push(line); }
    this.histPos = this.hist.length;
    const out = this.execFn(line);
    if (out === "\f") this.out.replaceChildren();
    else if (out) for (const part of out.split("\n")) this.print(part || " ", /^%[A-Z]+-\d-/.test(part) ? "log" : part.startsWith("%") ? "warn" : part.startsWith("Tip: ") ? "tip" : "");
    this.sync();
    this.scroll();
    this.onAfter();
  }

  key(e) {
    const inp = this.input;
    if (e.key === "Enter") {
      e.preventDefault();
      const line = inp.value;
      inp.value = "";
      this.run(line);
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      if (this.histPos > 0) inp.value = this.hist[--this.histPos];
    } else if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      if (this.histPos < this.hist.length) inp.value = this.hist[++this.histPos] || "";
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (!this.session.hidden) inp.value = this.session.complete(inp.value);
    } else if (e.ctrlKey && e.key.toLowerCase() === "c" && !String(getSelection())) {
      e.preventDefault();
      this.print(this.session.prompt + inp.value + "^C");
      inp.value = "";
    } else if (e.ctrlKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      inp.value = "";
      const m = this.session.mode;
      if (m && !["user", "priv", "host"].includes(m)) this.run("end");
    } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      this.out.replaceChildren();
    } else if (e.ctrlKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      inp.setSelectionRange(0, 0);
    } else if (e.ctrlKey && e.key.toLowerCase() === "e") {
      e.preventDefault();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }
}
