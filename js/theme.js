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
})();
