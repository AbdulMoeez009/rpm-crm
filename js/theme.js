/* ══════════════════════════════════════
   DARK / LIGHT MODE TOGGLE
══════════════════════════════════════ */
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('lf_theme', newTheme); // remember preference
  document.getElementById('theme-toggle').textContent = newTheme === 'dark' ? '☀️' : '🌙';
  const label = document.getElementById('settings-theme-label');
  if (label) label.textContent = newTheme === 'dark' ? 'Switch to light' : 'Switch to dark';
}



