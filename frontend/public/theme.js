// Apply the saved appearance before the app paints; no account data is stored here.
(function () {
  var theme = 'light';
  try {
    if (localStorage.getItem('homapon-theme') === 'dark') theme = 'dark';
  } catch {
    // Storage can be unavailable in private or restricted browsers.
  }
  document.documentElement.dataset.theme = theme;
})();
