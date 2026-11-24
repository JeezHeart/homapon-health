// Resolve appearance before React or CSS paints. Defaults to light mode; saved choices override.
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('homapon-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch {
    // Light mode stays the safe default when storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
})();
