// Resolve appearance before React or CSS paints. Saved choices override the OS.
(function () {
  var theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  try {
    var saved = localStorage.getItem('homapon-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch {
    // The OS preference still works when storage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
})();
