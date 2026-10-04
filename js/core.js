/* ══════════════════════════════════════
   STATE & PERSISTENCE (now backed by Firestore — real-time & shared)
══════════════════════════════════════ */
let leads = [];       // kept in sync live via Firestore onSnapshot
let editingId = null; // ID of lead being edited
let viewingId = null; // ID of lead in detail panel

// Subscribe to the 'leads' collection — every change pushes here instantly and
// re-renders the UI automatically.
// Admins see everyone's leads. Non-admins see the UNION of two things:
//   1) leads they personally added (ownerUid == them) — e.g. a Dialer's own leads
//   2) leads assigned to THEM as the Closer (closerUid == them)
// Firestore can't OR across two different fields in a single query, so for
// non-admins we run two live listeners and merge the results client-side,
// de-duped by doc id (a lead someone both added AND is the closer on just
// appears once).
function startLeadsListener() {
  if (unsubscribeLeads) { unsubscribeLeads(); unsubscribeLeads = null; }

  if (isAdmin) {
    unsubscribeLeads = leadsCol.orderBy('dateAdded', 'desc').onSnapshot(
      snapshot => {
        leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateFilterDropdowns();
        renderAll();
        updateSidebarBadges();
      },
      err => { console.error(err); showToast('❌ Data sync error: ' + err.message, 'error'); }
    );
    return;
  }

  let ownedLeads = {};
  let closerLeads = {};
  const rebuild = () => {
    const merged = { ...ownedLeads, ...closerLeads };
    leads = Object.values(merged).sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
    populateFilterDropdowns();
    renderAll();
    updateSidebarBadges();
  };

  const unsubOwned = leadsCol.where('ownerUid', '==', currentUid).onSnapshot(
    snap => { ownedLeads = {}; snap.docs.forEach(d => { ownedLeads[d.id] = { id: d.id, ...d.data() }; }); rebuild(); },
    err => { console.error(err); showToast('❌ Data sync error: ' + err.message, 'error'); }
  );
  const unsubCloser = leadsCol.where('closerUid', '==', currentUid).onSnapshot(
    snap => { closerLeads = {}; snap.docs.forEach(d => { closerLeads[d.id] = { id: d.id, ...d.data() }; }); rebuild(); },
    err => console.error(err)
  );

  unsubscribeLeads = () => { unsubOwned(); unsubCloser(); };
}

// Pipeline stage order
const STAGES = ['New Lead','Contacted','Follow-Up','Interested','Closed Won','Closed Lost'];

// Stage CSS class map
const STAGE_CLASS = {
  'New Lead': 'stage-new',
  'Contacted': 'stage-contacted',
  'Follow-Up': 'stage-followup',
  'Interested': 'stage-interested',
  'Closed Won': 'stage-won',
  'Closed Lost': 'stage-lost',
};

// Pipeline column color classes
const COL_CLASS = {
  'New Lead': 'col-new',
  'Contacted': 'col-contacted',
  'Follow-Up': 'col-followup',
  'Interested': 'col-interested',
  'Closed Won': 'col-won',
  'Closed Lost': 'col-lost',
};

// Data now lives in Firestore — this just keeps the sidebar counters fresh.
function save() {
  updateSidebarBadges();
}

/* ══════════════════════════════════════
   NAVIGATION
══════════════════════════════════════ */
function showPage(name, el) {
  // hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (el) el.classList.add('active');

  // set topbar title
  const titles = { dashboard:'Dashboard', leads:'All Leads', pipeline:'Pipeline Board', followups:'Follow-Ups', revenue:'Revenue', clients:'Clients', tasks:'Tasks', team:'Team Management' };
  document.getElementById('page-title').textContent = titles[name] || '';

  // render appropriate view
  if (name === 'dashboard') renderDashboard();
  if (name === 'leads') { populateFilterDropdowns(); renderLeadsTable(); }
  if (name === 'pipeline') renderPipeline();
  if (name === 'followups') renderFollowups();
  if (name === 'revenue') renderRevenue();
  if (name === 'clients') renderClientsTable();
  if (name === 'tasks') renderGlobalTasksPage();
  if (name === 'team') renderTeam();
}

document.addEventListener('keydown', event => {
  const customControl = event.target.closest('[data-keyboard-activate]');
  if (customControl && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    customControl.click();
    return;
  }

  const currentNavItem = event.target.closest('.nav-item');
  if (!currentNavItem) return;
  const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 :
    ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
  if (!direction) return;

  const navItems = [...document.querySelectorAll('.nav-item')].filter(item => item.getClientRects().length);
  const nextIndex = navItems.indexOf(currentNavItem) + direction;
  if (nextIndex >= 0 && nextIndex < navItems.length) {
    event.preventDefault();
    navItems[nextIndex].focus();
  }
});

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
// Get today's date as YYYY-MM-DD string
function today() {
  return new Date().toISOString().slice(0, 10);
}

// Format a YYYY-MM-DD string to readable form
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// Format a full ISO timestamp (date + time) — used for activity log entries
function fmtDateTime(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) +
    ' at ' + dt.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' });
}

// Format a price number as currency
function fmtPrice(p) {
  if (p === undefined || p === null || p === '') return '—';
  const n = Number(p);
  if (isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// How many days until/since a date
function daysUntil(d) {
  if (!d) return null;
  const diff = new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00');
  return Math.round(diff / 86400000);
}

// Follow-up date display with urgency color
function followupHtml(dateStr) {
  if (!dateStr) return '<span style="color:var(--muted)">—</span>';
  const days = daysUntil(dateStr);
  let cls = 'followup-ok';
  let label = fmtDate(dateStr);
  if (days < 0) { cls = 'followup-due'; label = `OVERDUE (${Math.abs(days)}d)`; }
  else if (days === 0) { cls = 'followup-due'; label = 'TODAY'; }
  else if (days <= 2) { cls = 'followup-soon'; label = `In ${days}d (${fmtDate(dateStr)})`; }
  return `<span class="${cls}">${label}</span>`;
}

// Status badge HTML
function statusBadge(s) {
  const map = { Hot:'badge-hot', Warm:'badge-warm', Cold:'badge-cold' };
  const icon = { Hot:'🔥', Warm:'🌤', Cold:'❄️' };
  return `<span class="badge ${map[s]||'badge-cold'}">${icon[s]||''} ${s}</span>`;
}

// Pipeline stage badge HTML
function stageBadge(s) {
  return `<span class="badge badge-pipeline ${STAGE_CLASS[s]||'stage-new'}">${s}</span>`;
}

/* ══════════════════════════════════════
   SIDEBAR BADGES
══════════════════════════════════════ */
function updateSidebarBadges() {
  document.getElementById('sb-leads-count').textContent = leads.length;

  // count follow-ups due today or overdue
  const due = leads.filter(l => l.followupDate && daysUntil(l.followupDate) <= 0).length;
  const badge = document.getElementById('sb-followup-count');
  if (due > 0) {
    badge.textContent = due;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

/* ══════════════════════════════════════
   TODAY'S FOLLOW-UP STRIP
══════════════════════════════════════ */
function followupStripHtml() {
  const due = leads.filter(l => l.followupDate && daysUntil(l.followupDate) <= 0);
  if (due.length === 0) return '';
  const chips = due.map(l =>
    `<button type="button" class="followup-chip" onclick="openDetail('${l.id}')">
      ${l.status === 'Hot' ? '🔥 ' : ''}${l.ownerName || l.bizName}
    </button>`
  ).join('');
  return `<div class="followup-strip">
    <span class="fs-title">⏰ ${due.length} Follow-Up${due.length>1?'s':''} Due Today:</span>
    ${chips}
  </div>`;
}

