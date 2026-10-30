// Tema ilk boyamadan önce uygulanır (açık → koyu parlaması olmasın). index.html'de satır içi değil
// dosya olarak durur: içerik güvenliği politikası (CSP) satır içi betiğe izin vermez.
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t !== 'dark' && t !== 'light') {
      t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
