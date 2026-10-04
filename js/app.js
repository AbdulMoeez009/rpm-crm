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
let toastTimer = null;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2800);
}

function showSessionTransition(title, subtitle) {
  const screen = document.getElementById('session-transition');
  screen.querySelector('.session-transition-title').textContent = title;
  screen.querySelector('.session-transition-subtitle').textContent = subtitle;
  screen.classList.add('show');
  clearTimeout(showSessionTransition.timer);
  showSessionTransition.timer = setTimeout(() => screen.classList.remove('show'), 1500);
}

async function withButtonLoading(buttonId, loadingLabel, operation) {
  const button = document.getElementById(buttonId);
  if (!button) return operation();
  const original = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = loadingLabel;
  try {
    return await operation();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = original;
  }
}

function animateCountChange(element, previousText = '') {
  const currentText = element.textContent;
  const numberPattern = /^([^\d-]*)(-?\d[\d,]*(?:\.\d+)?)(.*)$/;
  const previous = previousText.match(numberPattern);
  const current = currentText.match(numberPattern);
  if (!previous || !current) return;
  const start = Number(previous[2].replace(/,/g, ''));
  const end = Number(current[2].replace(/,/g, ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return;
  const prefix = current[1];
  const suffix = current[3];
  const decimals = (current[2].split('.')[1] || '').length;
  const startedAt = performance.now();
  element.dataset.counting = 'true';
  const frame = now => {
    const progress = Math.min(1, (now - startedAt) / 460);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (end - start) * eased;
    const formatted = value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    element.textContent = `${prefix}${formatted}${suffix}`;
    if (progress < 1) requestAnimationFrame(frame);
    else delete element.dataset.counting;
  };
  requestAnimationFrame(frame);
}

if (matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.addEventListener('pointermove', event => {
    const button = event.target.closest('.btn-primary');
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    const offsetX = (event.clientX - bounds.left - bounds.width / 2) / bounds.width;
    const offsetY = (event.clientY - bounds.top - bounds.height / 2) / bounds.height;
    button.style.setProperty('--mag-x', `${(offsetX * 2).toFixed(1)}px`);
    button.style.setProperty('--mag-y', `${(offsetY * 2).toFixed(1)}px`);
  });
  document.addEventListener('pointerout', event => {
    const button = event.target.closest('.btn-primary');
    if (button && !button.contains(event.relatedTarget)) {
      button.style.removeProperty('--mag-x');
      button.style.removeProperty('--mag-y');
    }
  });
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
  const label = document.getElementById('settings-theme-label');
  if (label) label.textContent = saved === 'dark' ? 'Switch to light' : 'Switch to dark';
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
