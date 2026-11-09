/* Runs before first paint so the saved theme and accent never flash. */
(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem('theme');
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    var accent = localStorage.getItem('accent');
    if (accent && /^#[0-9a-f]{6}$/.test(accent)) {
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--on-accent', localStorage.getItem('onAccent') === '#ffffff' ? '#ffffff' : '#0d2126');
    }
  } catch (e) { /* storage unavailable: defaults apply */ }
})();
