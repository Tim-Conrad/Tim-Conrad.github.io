/* Runs before first paint so the saved theme never flashes. */
(function () {
  /* (and marks that scripts run: parts that a script opens, such as the rest of a timeline, may start closed) */
  document.documentElement.classList.add('js');
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch (e) { /* storage unavailable: the system setting applies */ }
})();
