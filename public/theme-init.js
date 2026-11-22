// The theme is applied before the first paint (so there is no light → dark flash). It lives as a file,
// not inline in index.html: the content security policy (CSP) does not allow inline scripts.
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t !== 'dark' && t !== 'light') {
      t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
