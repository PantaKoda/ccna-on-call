// Applies the saved theme before the page paints (loaded as a plain script in
// <head>, so there is no flash of the wrong theme). With nothing saved, the
// system preference decides.
(function () {
  var KEY = "ccna-on-call-theme";
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  var theme = saved === "light" || saved === "dark" ? saved
    : window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.theme = theme;

  window.ccnaTheme = {
    get: function () { return document.documentElement.dataset.theme; },
    set: function (t) {
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem(KEY, t); } catch (e) { /* storage unavailable */ }
    },
  };

  // The cockpit view (js/ui/cockpit.js) is a skin over either theme: the
  // attribute is set here too, so a cockpit page never flashes the classic look.
  var SKIN = "ccna-on-call-skin";
  var skin = null;
  try { skin = localStorage.getItem(SKIN); } catch (e) { /* storage unavailable */ }
  if (skin === "cockpit") document.documentElement.dataset.skin = "cockpit";

  window.ccnaSkin = {
    get: function () { return document.documentElement.dataset.skin || "classic"; },
    set: function (s) {
      if (s === "cockpit") document.documentElement.dataset.skin = "cockpit";
      else delete document.documentElement.dataset.skin;
      try { localStorage.setItem(SKIN, s === "cockpit" ? "cockpit" : "classic"); } catch (e) { /* storage unavailable */ }
    },
  };
})();
