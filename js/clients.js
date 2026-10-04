/* ══════════════════════════════════════
   CLIENTS (Support module)
   Populated two ways: automatically the moment a lead hits "Closed Won"
   (see syncClientFromLead above), or manually via the "+ Add Client" button
   for deals closed outside the normal lead pipeline (e.g. referrals).
══════════════════════════════════════ */
let clients = [];
let unsubscribeClients = null;
let editingClientId = null;   // set while the Add/Edit Client modal is open
let activeClientId = null;    // set while the client detail drawer is open

// Single source of truth for the onboarding checklist — add/remove items here
// and both the modal-free checklist UI and the progress counter pick it up.
const ONBOARDING_ITEMS = [
  { key: 'websiteAccess',        label: 'Website Access' },
  { key: 'hostingAccess',        label: 'Hosting Access' },
  { key: 'domainAccess',         label: 'Domain Access' },
  { key: 'googleAds',            label: 'Google Ads' },
  { key: 'facebookAds',          label: 'Facebook Ads' },
  { key: 'googleAnalytics',      label: 'Google Analytics' },
  { key: 'searchConsole',        label: 'Google Search Console' },
  { key: 'googleBusinessProfile',label: 'Google Business Profile' },
  { key: 'logo',                 label: 'Logo' },
  { key: 'brandAssets',          label: 'Brand Assets' },
  { key: 'documents',            label: 'Business Documents' },
];

// Admins see every client. Everyone else sees only clients they're connected
// to in some way: assigned to them as Support Manager, the deal they closed,
// or the lead they originally brought in. Same merge-and-dedupe approach as
// the leads listener (Firestore can't OR across 3 different fields at once).
function startClientsListener() {
  if (unsubscribeClients) { unsubscribeClients(); unsubscribeClients = null; }

  if (isAdmin) {
    unsubscribeClients = clientsCol.orderBy('businessName').onSnapshot(
      snapshot => {
        clients = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const activePage = document.querySelector('.page.active');
        if (activePage && activePage.id === 'page-clients') renderClientsTable();
        if (activeClientId) refreshClientDetailIfOpen();
        checkRenewalNotifications();
      },
      err => { console.error(err); showToast('❌ Clients sync error: ' + err.message, 'error'); }
    );
    return;
  }

  let bySupport = {}, byCloser = {}, byOwner = {};
  const rebuild = () => {
    const merged = { ...byOwner, ...byCloser, ...bySupport };
    clients = Object.values(merged).sort((a, b) => (a.businessName || '').localeCompare(b.businessName || ''));
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-clients') renderClientsTable();
    if (activeClientId) refreshClientDetailIfOpen();
    checkRenewalNotifications();
  };
  const onErr = err => { console.error(err); showToast('❌ Clients sync error: ' + err.message, 'error'); };

  const unsub1 = clientsCol.where('supportUid', '==', currentUid).onSnapshot(
    snap => { bySupport = {}; snap.docs.forEach(d => { bySupport[d.id] = { id: d.id, ...d.data() }; }); rebuild(); }, onErr);
  const unsub2 = clientsCol.where('closerUid', '==', currentUid).onSnapshot(
    snap => { byCloser = {}; snap.docs.forEach(d => { byCloser[d.id] = { id: d.id, ...d.data() }; }); rebuild(); }, onErr);
  const unsub3 = clientsCol.where('ownerUid', '==', currentUid).onSnapshot(
    snap => { byOwner = {}; snap.docs.forEach(d => { byOwner[d.id] = { id: d.id, ...d.data() }; }); rebuild(); }, onErr);

  unsubscribeClients = () => { unsub1(); unsub2(); unsub3(); };
}

// Runs once per session (not on every snapshot) and creates a renewal-due
// notification for each client renewing within 3 days — using a deterministic
// doc id (renewal_{clientId}) so re-running never creates duplicates or
// resurrects one someone already marked read.
let renewalCheckDone = false;
async function checkRenewalNotifications() {
  if (renewalCheckDone) return;
  renewalCheckDone = true;
  const soon = clients.filter(c => c.renewalDate && c.supportUid &&
    daysUntil(c.renewalDate) <= 3 && daysUntil(c.renewalDate) >= 0);
  for (const c of soon) {
    try {
      const ref = notificationsCol.doc(`renewal_${c.id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({
          userId: c.supportUid,
          type: 'renewal',
          message: `Renewal due soon: ${c.businessName} (${c.renewalDate})`,
          clientId: c.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) { console.error('renewal notif failed', e); }
  }
}

function onboardingProgress(c) {
  const ob = c.onboarding || {};
  const done = ONBOARDING_ITEMS.filter(i => ob[i.key]).length;
  return { done, total: ONBOARDING_ITEMS.length };
}

function renderClientsTable() {
  const search = (document.getElementById('client-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('client-filter-status')?.value || '';
  const renewalSoonOnly = document.getElementById('client-filter-renewal-soon')?.checked || false;

  let rows = clients.filter(c => {
    const matchesSearch = !search ||
      (c.businessName || '').toLowerCase().includes(search) ||
      (c.ownerName || '').toLowerCase().includes(search) ||
      (c.phone1 || '').toLowerCase().includes(search) ||
      (c.email1 || '').toLowerCase().includes(search);
    const matchesStatus = !statusFilter || c.status === statusFilter;
    const matchesRenewal = !renewalSoonOnly || (c.renewalDate && daysUntil(c.renewalDate) <= 30);
    return matchesSearch && matchesStatus && matchesRenewal;
  });

  const tbody = document.getElementById('clients-tbody');
  const emptyEl = document.getElementById('clients-empty');
  if (!tbody) return;
  const visibleRows = paginateRows('clients', rows, 'clients-pagination', 'renderClientsTable');

  if (rows.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = 'flex';
      emptyEl.querySelector('p').textContent = clients.length ? 'No clients match these filters' : 'No clients yet';
      emptyEl.querySelector('.empty-description').textContent = clients.length
        ? 'Try changing your search or filters to see more results.'
        : 'Add a client or close a lead as won to start managing delivery.';
      emptyEl.querySelector('.empty-action').style.display = clients.length ? 'none' : 'inline-flex';
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const statusClass = { Active: 'badge-green', Paused: 'badge-warm', Churned: 'badge-cold' };

  tbody.innerHTML = visibleRows.map(c => {
    const prog = onboardingProgress(c);
    return `
      <tr>
        <td>
          <div class="table-person">
            <span class="table-avatar">${escapeHtml((c.businessName || '?').trim().charAt(0).toUpperCase())}</span>
            <div><div class="lead-name">${escapeHtml(c.businessName || '—')}</div><div class="lead-biz">${escapeHtml(c.ownerName || '')}</div></div>
          </div>
        </td>
        <td>${escapeHtml(c.servicePackage || '—')}</td>
        <td>${c.monthlyFee ? '$' + c.monthlyFee : '—'}</td>
        <td>${escapeHtml(c.phone1 || '—')}</td>
        <td>${c.renewalDate || '—'}</td>
        <td>${prog.done}/${prog.total} onboarded</td>
        <td><span class="badge ${statusClass[c.status] || 'badge-cold'}">${escapeHtml(c.status || 'Active')}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-primary" onclick="openClientDetail('${c.id}')">View</button>
            <button class="btn btn-sm btn-ghost" onclick="openClientModal('${c.id}')">Edit</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Small helper — client data can come from a lead the user typed, so escape
// it before dropping into innerHTML (same reason leads table does this).
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ── Add / Edit Client modal ── */
function openClientModal(id = null) {
  editingClientId = id;
  document.getElementById('client-modal-title').textContent = id ? 'Edit Client' : 'Add New Client';

  const fields = ['cf-bizname','cf-owner','cf-industry','cf-city','cf-phone1','cf-phone2',
    'cf-email1','cf-email2','cf-package','cf-fee','cf-renewal','cf-support-email'];

  if (id) {
    const c = clients.find(x => x.id === id);
    if (!c) return;
    document.getElementById('cf-bizname').value = c.businessName || '';
    document.getElementById('cf-owner').value = c.ownerName || '';
    document.getElementById('cf-industry').value = c.industry || '';
    document.getElementById('cf-city').value = c.city || '';
    document.getElementById('cf-phone1').value = c.phone1 || '';
    document.getElementById('cf-phone2').value = c.phone2 || '';
    document.getElementById('cf-email1').value = c.email1 || '';
    document.getElementById('cf-email2').value = c.email2 || '';
    document.getElementById('cf-package').value = c.servicePackage || '';
    document.getElementById('cf-fee').value = c.monthlyFee || '';
    document.getElementById('cf-renewal').value = c.renewalDate || '';
    document.getElementById('cf-support-email').value = c.supportEmail || '';
    document.getElementById('cf-status').value = c.status || 'Active';
  } else {
    fields.forEach(fid => { const el = document.getElementById(fid); if (el) el.value = ''; });
    document.getElementById('cf-status').value = 'Active';
  }

  document.getElementById('save-client-submit').textContent = id ? 'Save Changes' : 'Create Client';
  openDialog('client-modal-overlay');
}

function closeClientModal() {
  closeDialog('client-modal-overlay');
  editingClientId = null;
}

function closeClientModalOnOverlay(e) {
  if (e.target === document.getElementById('client-modal-overlay')) closeClientModal();
}

async function saveClient() {
  const businessName = document.getElementById('cf-bizname').value.trim();
  const phone1 = document.getElementById('cf-phone1').value.trim();

  if (!businessName) { showToast('❌ Business Name is required!', 'error'); return; }
  if (!phone1)        { showToast('❌ Primary Phone is required!', 'error'); return; }

  const data = {
    businessName,
    ownerName: document.getElementById('cf-owner').value.trim(),
    industry: document.getElementById('cf-industry').value.trim(),
    city: document.getElementById('cf-city').value.trim(),
    phone1,
    phone2: document.getElementById('cf-phone2').value.trim(),
    email1: document.getElementById('cf-email1').value.trim(),
    email2: document.getElementById('cf-email2').value.trim(),
    servicePackage: document.getElementById('cf-package').value.trim(),
    monthlyFee: document.getElementById('cf-fee').value.trim(),
    renewalDate: document.getElementById('cf-renewal').value,
    supportEmail: document.getElementById('cf-support-email').value.trim(),
    status: document.getElementById('cf-status').value,
  };

  const saved = await withButtonLoading('save-client-submit', editingClientId ? 'Saving…' : 'Creating…', async () => {
    try {
      if (editingClientId) {
        await clientsCol.doc(editingClientId).update(data);
        showToast('Client updated successfully', 'success');
      } else {
      // Manually-added client — no source lead, so give it its own onboarding
      // checklist starting fresh and tag it 'manual' for reporting later.
      data.source = 'manual';
      data.leadId = null;
      data.ownerUid = currentUid;
      data.createdAt = today();
      data.onboarding = ONBOARDING_ITEMS.reduce((acc, i) => ({ ...acc, [i.key]: false }), {});
        await clientsCol.add(data);
        showToast('Client created successfully', 'success');
      }
      return true;
    } catch (e) {
      showToast('Unable to save client. Please try again.', 'error');
      console.error(e);
      return false;
    }
  });
  if (!saved) return;
  closeClientModal();
}

async function deleteClient(id) {
  if (!confirm('Delete this client? This cannot be undone.')) return;
  try {
    await clientsCol.doc(id).delete();
    showToast('Client deleted.', 'error');
    closeClientDetail();
  } catch (e) {
    showToast('❌ Delete fail: ' + e.message, 'error');
  }
}

/* ── Client detail drawer (profile + onboarding checklist) ── */
function openClientDetail(id) {
  activeClientId = id;
  clientTasks = [];
  clientFiles = [];
  renderClientDetail();
  startTasksListenerForClient(id);
  startFilesListenerForClient(id);
  openDialog('client-detail-overlay');
}

function closeClientDetail() {
  closeDialog('client-detail-overlay');
  activeClientId = null;
  if (unsubscribeTasks) { unsubscribeTasks(); unsubscribeTasks = null; }
  clientTasks = [];
  if (unsubscribeFiles) { unsubscribeFiles(); unsubscribeFiles = null; }
  clientFiles = [];
}

function closeClientDetailOnOverlay(e) {
  if (e.target === document.getElementById('client-detail-overlay')) closeClientDetail();
}

// Called whenever the live listener updates data while the drawer is open,
// so ticking a checkbox reflects instantly even if another tab changed it.
function refreshClientDetailIfOpen() {
  const overlay = document.getElementById('client-detail-overlay');
  if (overlay && overlay.classList.contains('show')) renderClientDetail();
}

function renderClientDetail() {
  const c = clients.find(x => x.id === activeClientId);
  if (!c) { closeClientDetail(); return; }

  document.getElementById('cdp-name').textContent = c.businessName || 'Untitled';
  document.getElementById('cdp-sub').textContent = [c.ownerName, c.industry, c.city].filter(Boolean).join(' · ');

  const prog = onboardingProgress(c);
  document.getElementById('cdp-progress').textContent = `${prog.done}/${prog.total} onboarding items complete`;

  document.getElementById('cdp-body').innerHTML = `
    <div class="modal-section">
      <div class="modal-section-title">Profile</div>
      <div class="form-grid">
        <div class="field"><label>Service Package</label><div>${escapeHtml(c.servicePackage || '—')}</div></div>
        <div class="field"><label>Monthly Fee</label><div>${c.monthlyFee ? '$' + escapeHtml(String(c.monthlyFee)) : '—'}</div></div>
        <div class="field"><label>Renewal Date</label><div>${c.renewalDate || '—'}</div></div>
        <div class="field"><label>Support Manager</label><div>${escapeHtml(c.supportEmail || 'Unassigned')}</div></div>
        <div class="field"><label>Phone</label><div>${escapeHtml(c.phone1 || '—')}</div></div>
        <div class="field"><label>Email</label><div>${escapeHtml(c.email1 || '—')}</div></div>
        <div class="field"><label>Source</label><div>${c.source === 'auto' ? 'Auto-converted from lead' : 'Manually added'}</div></div>
        <div class="field"><label>Status</label><div><span class="badge ${{Active:'badge-hot',Paused:'badge-warm',Churned:'badge-cold'}[c.status] || 'badge-cold'}">${escapeHtml(c.status || 'Active')}</span></div></div>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Onboarding Checklist</div>
      <div class="checklist">
        ${ONBOARDING_ITEMS.map(i => `
          <label class="checklist-item">
            <input type="checkbox" ${c.onboarding && c.onboarding[i.key] ? 'checked' : ''}
              onchange="toggleOnboardingItem('${c.id}', '${i.key}', this.checked)">
            <span>${i.label}</span>
          </label>
        `).join('')}
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Tasks</div>
      <div class="form-grid" style="margin-bottom:10px;">
        <input id="task-title" placeholder="Task title..." class="full" style="grid-column:1/-1;">
        <select id="task-assignee"><option value="">— Assign to —</option>${teamUsers.filter(u=>u.approved).map(u=>`<option value="${u.uid}">${escapeHtml(u.name||u.email)}</option>`).join('')}</select>
        <select id="task-priority">
          <option value="Low">Low</option>
          <option value="Medium" selected>Medium</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </select>
        <input id="task-due" type="date">
        <button class="btn btn-primary btn-sm" onclick="addTask('${c.id}')">+ Add Task</button>
      </div>
      <div id="cdp-tasks-list"></div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Files</div>
      <div class="form-grid" style="margin-bottom:10px;">
        <select id="file-category">${FILE_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}</select>
        <input id="file-input" type="file" style="grid-column:span 1;">
        <button class="btn btn-primary btn-sm" onclick="uploadClientFile('${c.id}')" id="file-upload-btn">⬆ Upload</button>
      </div>
      <div id="cdp-files-list"></div>
    </div>
  `;
  renderTasksList();
  renderFilesList();
}

async function toggleOnboardingItem(clientId, key, checked) {
  try {
    await clientsCol.doc(clientId).update({ [`onboarding.${key}`]: checked });
  } catch (e) {
    showToast('❌ Could not update checklist: ' + e.message, 'error');
  }
}

