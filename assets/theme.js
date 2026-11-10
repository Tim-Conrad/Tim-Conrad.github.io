/* Runs before first paint so the saved theme never flashes. */
(function () {
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch (e) { /* storage unavailable: the system setting applies */ }
})();
