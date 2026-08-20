/* ══════════════════════════════════════
   RENDER ALL (refresh whatever is active)
══════════════════════════════════════ */
function renderAll() {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const id = activePage.id;
  if (id === 'page-dashboard') renderDashboard();
  if (id === 'page-leads') renderLeadsTable();
  if (id === 'page-pipeline') renderPipeline();
  if (id === 'page-followups') renderFollowups();
  if (id === 'page-revenue') renderRevenue();
}

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
// Apply saved theme and set toggle icon correctly
(function initTheme() {
  const saved = localStorage.getItem('lf_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
})();

// Note: startup rendering now happens inside auth.onAuthStateChanged() above —
// the dashboard loads automatically once a user successfully logs in.

// Check for overdue follow-ups and notify (runs once per login, ~2s after data loads)
let notifiedThisSession = false;
auth.onAuthStateChanged(user => {
  if (!user || notifiedThisSession) return;
  notifiedThisSession = true;
  setTimeout(() => {
    const due = leads.filter(l => l.followupDate && daysUntil(l.followupDate) <= 0).length;
    if (due > 0 && 'Notification' in window) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') {
          new Notification('RPM CRM', {
            body: `⏰ You have ${due} follow-up${due>1?'s':''} due today!`,
            icon: '📞'
          });
        }
      });
    }
  }, 2500);
});
