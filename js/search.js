/* ══════════════════════════════════════
   GLOBAL SEARCH — leads, clients & tasks, all from data already loaded
   locally by the live listeners above (no extra Firestore reads needed).
══════════════════════════════════════ */
function renderGlobalSearchResults() {
  const wrap = document.getElementById('global-search-results');
  const q = document.getElementById('global-search-input').value.trim().toLowerCase();
  toggleNotifDropdownClosed();

  if (q.length < 2) { wrap.style.display = 'none'; return; }

  const matchedLeads = leads.filter(l =>
    (l.bizName||'').toLowerCase().includes(q) || (l.ownerName||'').toLowerCase().includes(q) ||
    (l.phone1||'').toLowerCase().includes(q) || (l.email1||'').toLowerCase().includes(q)
  ).slice(0, 5);

  const matchedClients = clients.filter(c =>
    (c.businessName||'').toLowerCase().includes(q) || (c.ownerName||'').toLowerCase().includes(q) ||
    (c.phone1||'').toLowerCase().includes(q) || (c.email1||'').toLowerCase().includes(q)
  ).slice(0, 5);

  const matchedTasks = allTasks.filter(t => (t.title||'').toLowerCase().includes(q)).slice(0, 5);

  if (matchedLeads.length === 0 && matchedClients.length === 0 && matchedTasks.length === 0) {
    wrap.innerHTML = `<div style="padding:16px;text-align:center;font-size:12px;color:var(--muted);">No matches for "${escapeHtml(q)}"</div>`;
    wrap.style.display = 'block';
    return;
  }

  const section = (title, items, renderRow) => items.length === 0 ? '' : `
    <div style="padding:6px 14px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;background:var(--bg);">${title}</div>
    ${items.map(renderRow).join('')}
  `;

  wrap.innerHTML =
    section('Leads', matchedLeads, l => `
      <div role="button" tabindex="0" data-keyboard-activate onclick="closeGlobalSearch(); openDetail('${l.id}');" style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);">
        <div style="font-weight:600;font-size:13px;">${escapeHtml(l.bizName||'—')}</div>
        <div style="font-size:11px;color:var(--muted);">${escapeHtml(l.ownerName||'')} · ${escapeHtml(l.phone1||'')}</div>
      </div>
    `) +
    section('Clients', matchedClients, c => `
      <div role="button" tabindex="0" data-keyboard-activate onclick="closeGlobalSearch(); showPage('clients', document.getElementById('nav-clients')); openClientDetail('${c.id}');" style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);">
        <div style="font-weight:600;font-size:13px;">${escapeHtml(c.businessName||'—')}</div>
        <div style="font-size:11px;color:var(--muted);">${escapeHtml(c.ownerName||'')} · ${escapeHtml(c.phone1||'')}</div>
      </div>
    `) +
    section('Tasks', matchedTasks, t => {
      const client = clients.find(c => c.id === t.clientId);
      return `
      <div role="button" tabindex="0" data-keyboard-activate onclick="closeGlobalSearch(); showPage('clients', document.getElementById('nav-clients')); openClientDetail('${t.clientId}');" style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);">
        <div style="font-weight:600;font-size:13px;">${escapeHtml(t.title)}</div>
        <div style="font-size:11px;color:var(--muted);">${client ? escapeHtml(client.businessName) : ''} · ${t.status}</div>
      </div>
    `;});

  wrap.style.display = 'block';
}

function closeGlobalSearch() {
  const wrap = document.getElementById('global-search-results');
  if (wrap) wrap.style.display = 'none';
}

function toggleNotifDropdownClosed() {
  const wrap = document.getElementById('notif-dropdown');
  if (wrap) wrap.style.display = 'none';
}

// Close either dropdown when clicking anywhere outside of them
document.addEventListener('click', e => {
  const searchWrap = document.getElementById('topbar-search-wrap');
  const notifWrap = document.getElementById('topbar-notif-wrap');
  if (searchWrap && !searchWrap.contains(e.target)) closeGlobalSearch();
  if (notifWrap && !notifWrap.contains(e.target)) toggleNotifDropdownClosed();
});

// Keep the shared 'revenue' collection in sync with a lead's closed status.
// Uses the lead's own ID as the revenue doc ID (1:1 mapping) so it's easy to
// create/update/remove. Only non-sensitive fields are copied here.
async function syncRevenueEntry(leadId, lead) {
  if (lead.stage === 'Closed Won' && lead.closedDate) {
    await revenueCol.doc(leadId).set({
      price: lead.price || 0,
      closedDate: lead.closedDate,
      bizName: lead.bizName || '',
      dialer: lead.dialer || '',
      closer: lead.closer || '',
      ownerUid: lead.ownerUid || currentUid,
      ownerEmail: lead.ownerEmail || currentUserEmail,
      closerUid: lead.closerUid || '',
    });
  } else {
    // No longer Closed Won — remove it from the shared revenue ledger
    try { await revenueCol.doc(leadId).delete(); } catch (e) { /* fine if it never existed */ }
  }
}
// Auto-conversion: the moment a lead becomes "Closed Won" this creates a
// matching client record (doc id = leadId, so it's a strict 1:1 link and can
// never duplicate). If the lead already has a client (e.g. re-saved), it only
// merges the basic identity fields — it never overwrites onboarding progress,
// support-manager assignment, or notes the Support team has since entered.
async function syncClientFromLead(leadId, lead) {
  if (lead.stage === 'Closed Won' && lead.closedDate) {
    const existing = await clientsCol.doc(leadId).get();
    if (existing.exists) {
      // Already converted — just keep identity/contact/assignment fields
      // fresh (including a re-assigned Support Manager — that's the transfer
      // mechanism: change it on the lead, it propagates here), without
      // touching onboarding progress or anything Support has since edited.
      await clientsCol.doc(leadId).update({
        businessName: lead.bizName || '',
        ownerName: lead.ownerName || '',
        industry: lead.industry || '',
        city: lead.city || '',
        phone1: lead.phone1 || '',
        phone2: lead.phone2 || '',
        email1: lead.email1 || '',
        email2: lead.email2 || '',
        closerUid: lead.closerUid || '',
        supportUid: lead.supportUid || '',
        supportEmail: lead.supportName || '',
      });
      return;
    }
    // First time this lead is Closed Won — create the client record
    await clientsCol.doc(leadId).set({
      businessName: lead.bizName || '',
      ownerName: lead.ownerName || '',
      industry: lead.industry || '',
      city: lead.city || '',
      phone1: lead.phone1 || '',
      phone2: lead.phone2 || '',
      email1: lead.email1 || '',
      email2: lead.email2 || '',
      servicePackage: lead.services || '',
      monthlyFee: lead.price || 0,
      renewalDate: '',
      closerUid: lead.closerUid || '',
      supportUid: lead.supportUid || '',
      supportEmail: lead.supportName || '',
      status: 'Active',
      onboarding: {
        websiteAccess: false, hostingAccess: false, domainAccess: false,
        googleAds: false, facebookAds: false, googleAnalytics: false,
        searchConsole: false, googleBusinessProfile: false,
        logo: false, brandAssets: false, documents: false,
      },
      source: 'auto',
      leadId: leadId,
      ownerUid: lead.ownerUid || currentUid,
      createdAt: today(),
    });
  }
  // Note: if a deal is moved OUT of Closed Won, we deliberately do NOT delete
  // the client record — a client that's already onboarded shouldn't vanish
  // just because someone edited the originating lead later.
}
let unsubscribeLeads = null;

