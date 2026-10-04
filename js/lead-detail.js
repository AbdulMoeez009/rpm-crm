/* ══════════════════════════════════════
   DETAIL PANEL
══════════════════════════════════════ */
let activeLeadSharedElement = null;

function openDetail(id, sourceElement = null) {
  if (document.startViewTransition && sourceElement && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    activeLeadSharedElement = sourceElement.querySelector('.table-avatar, .pc-name, .lead-name') || sourceElement;
    activeLeadSharedElement.style.viewTransitionName = 'lead-identity';
    document.startViewTransition(() => {
      activeLeadSharedElement.style.viewTransitionName = '';
      document.getElementById('dp-name').style.viewTransitionName = 'lead-identity';
      openDetailContent(id);
    }).finished.finally(() => {
      document.getElementById('dp-name').style.viewTransitionName = '';
    });
    return;
  }
  openDetailContent(id);
}

function openDetailContent(id) {
  const l = leads.find(x => x.id === id);
  if (!l) return;
  viewingId = id;

  document.getElementById('dp-name').textContent = l.ownerName || '—';
  document.getElementById('dp-biz').textContent = l.bizName;
  document.getElementById('dp-badges').innerHTML = `
    ${statusBadge(l.status)}
    ${stageBadge(l.stage)}
    ${l.industry ? `<span class="badge" style="background:#f3f4f6;color:#374151">${escapeHtml(l.industry)}</span>` : ''}
    ${l.city ? `<span class="badge" style="background:#f3f4f6;color:#374151">📍 ${escapeHtml(l.city)}</span>` : ''}
    ${l.price ? `<span class="badge" style="background:var(--green-bg);color:var(--green)">${fmtPrice(l.price)}</span>` : ''}
  `;

  // Build detail body
  const row = (label, val, link) => {
    if (!val) return '';
    let display = escapeHtml(val);
    if (link) {
      try {
        const url = new URL(val, window.location.href);
        if (['http:', 'https:'].includes(url.protocol)) display = `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(val)}</a>`;
      } catch (_) {}
    }
    return `<div class="detail-row"><span class="dr-label">${label}</span><span class="dr-val">${display}</span></div>`;
  };

  document.getElementById('dp-body').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Assignment</div>
      ${row('Dialer', l.dialer)}
      ${row('Closer', l.closer)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Contact Info</div>
      ${row('Phone (Primary)', l.phone1)}
      ${row('Phone (Secondary)', l.phone2)}
      ${row('Email (Primary)', l.email1)}
      ${row('Email (Secondary)', l.email2)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Business</div>
      ${row('Business Name', l.bizName)}
      ${row('Owner Name', l.ownerName)}
      ${row('Industry', l.industry)}
      ${row('City', l.city)}
      ${row('Price', l.price ? fmtPrice(l.price) : '')}
      ${row('Services', l.services)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Online Presence</div>
      ${row('Yelp', l.yelp, true)}
      ${row('GMB', l.gmb, true)}
      ${row('Website', l.website, true)}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Follow-Up</div>
      ${row('Next Follow-Up', l.followupDate ? followupHtml(l.followupDate) : '')}
      ${row('Last Contact', l.lastContact ? fmtDate(l.lastContact) : '')}
      ${row('Closed Date', l.closedDate ? fmtDate(l.closedDate) : '')}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">📞 Activity / Call Log</div>
      ${l.notes ? `<div style="font-size:12px;color:var(--muted);background:var(--bg);padding:8px 10px;border-radius:6px;border:1px dashed var(--border);margin-bottom:10px;line-height:1.5;">
        <strong>Legacy note (before activity log):</strong><br>${escapeHtml(l.notes).replace(/\n/g,'<br>')}
      </div>` : ''}
      <div id="dp-activity-list" style="margin-bottom:10px;">
        <div style="font-size:12px;color:var(--muted);">Loading...</div>
      </div>
      <select id="dp-activity-type" aria-label="Activity type" style="margin-bottom:6px;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:7px 9px;font:inherit;">
        <option value="note">Note</option><option value="call">Call</option><option value="message">Message</option>
      </select>
      <textarea id="dp-activity-input" placeholder="Log a call, update, or note..." style="width:100%;min-height:56px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:8px 10px;font-size:13px;font-family:var(--font);resize:vertical;"></textarea>
      <button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="addActivityEntry('${l.id}')">+ Add Entry</button>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:8px">Added: ${fmtDate(l.dateAdded)}</div>
  `;

  loadActivityLog(l.id);

  // Build stage dropdown — current stage pre-selected
  const stageOptions = STAGES.map(s =>
    `<option value="${s}" ${s === l.stage ? 'selected' : ''}>${s}</option>`
  ).join('');

  document.getElementById('dp-actions').innerHTML = `
    ${l.archivedAt ? `<button class="btn btn-primary btn-sm" onclick="restoreLead('${l.id}')">Restore Lead</button>` : `<button class="btn btn-primary btn-sm" onclick="openLeadModal('${l.id}');closeDetail()">✏️ Edit Lead</button>`}
    <select id="dp-stage-select" ${l.archivedAt ? 'disabled' : ''} onchange="changeStageFromPanel('${l.id}', this.value)"
      style="background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);
             padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;outline:none;">
      ${stageOptions}
    </select>
    ${l.archivedAt ? '' : `<button class="btn btn-danger btn-sm" onclick="archiveLead('${l.id}')">Archive</button>`}
  `;

  openDialog('detail-overlay');
}

function closeDetail() {
  const closePanel = () => closeDialog('detail-overlay');
  if (document.startViewTransition && activeLeadSharedElement?.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.getElementById('dp-name').style.viewTransitionName = 'lead-identity';
    document.startViewTransition(() => {
      document.getElementById('dp-name').style.viewTransitionName = '';
      activeLeadSharedElement.style.viewTransitionName = 'lead-identity';
      closePanel();
    }).finished.finally(clearLeadSharedElement);
  } else {
    closePanel();
    clearLeadSharedElement();
  }
  viewingId = null;
}

function clearLeadSharedElement() {
  if (activeLeadSharedElement) activeLeadSharedElement.style.viewTransitionName = '';
  document.getElementById('dp-name').style.viewTransitionName = '';
  activeLeadSharedElement = null;
}

function closeDetailOnOverlay(e) {
  if (e.target === document.getElementById('detail-overlay')) closeDetail();
}

/* ══════════════════════════════════════
   ACTIVITY LOG (call log — replaces the old single Notes field)
   Stored as a Firestore subcollection: leads/{leadId}/activity/{entryId}
══════════════════════════════════════ */
async function loadActivityLog(leadId) {
  const container = document.getElementById('dp-activity-list');
  if (!container) return; // panel may already be closed
  try {
    const snap = await leadsCol.doc(leadId).collection('activity').orderBy('createdAt', 'desc').get();
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const lead = leads.find(item => item.id === leadId);
    const indexedText = entries.map(entry => `${entry.type || 'note'}: ${entry.text || ''}`).join('\n').slice(0, 4000);
    if (lead && indexedText && indexedText !== lead.activitySearch) {
      leadsCol.doc(leadId).update({ activitySearch: indexedText }).catch(() => {});
    }
    renderActivityList(entries);
  } catch (e) {
    container.innerHTML = `<div class="activity-load-error"><span>Could not load activity history.</span><button class="btn btn-ghost btn-sm" onclick="loadActivityLog('${leadId}')">Retry</button></div>`;
    console.error(e);
  }
}

function renderActivityList(entries) {
  const container = document.getElementById('dp-activity-list');
  if (!container) return; // panel may already be closed
  if (entries.length === 0) {
    container.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:4px 0 8px;">No activity logged yet — add the first call or update below.</div>`;
    return;
  }
  container.innerHTML = entries.map(e => `
    <div style="border-left:2px solid var(--accent-light);padding:4px 0 8px 10px;margin-bottom:6px;">
      <div style="font-size:11px;color:var(--muted);margin-bottom:2px;"><strong>${escapeHtml((e.type || 'note').toUpperCase())}</strong> · ${escapeHtml(e.authorEmail || 'Unknown')} · ${fmtDateTime(e.createdAt)}</div>
      <div style="font-size:13px;color:var(--text);line-height:1.5;">${escapeHtml(e.text || '').replace(/\n/g,'<br>')}</div>
    </div>
  `).join('');
}

async function addActivityEntry(leadId) {
  const input = document.getElementById('dp-activity-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const type = document.getElementById('dp-activity-type')?.value || 'note';
  const lead = leads.find(item => item.id === leadId);
  const activityRef = leadsCol.doc(leadId).collection('activity').doc();
  try {
    const batch = db.batch();
    batch.set(activityRef, {
      text,
      type,
      authorUid: currentUid,
      authorEmail: currentUserEmail,
      createdAt: new Date().toISOString(),
    });
    const leadUpdate = { activitySearch: `${lead?.activitySearch || ''}\n${type}: ${text}`.slice(-4000) };
    if (type === 'call') leadUpdate.lastContact = today();
    batch.update(leadsCol.doc(leadId), leadUpdate);
    await batch.commit();
    input.value = '';
    await loadActivityLog(leadId); // refresh the list to show the new entry
  } catch (e) {
    showToast('❌ Could not add entry: ' + e.message, 'error');
  }
}

// Change stage directly from dropdown in detail panel
async function changeStageFromPanel(id, newStage) {
  const l = leads.find(x => x.id === id);
  if (!l || l.stage === newStage) return; // no change needed
  // Revenue tracking: stamp a closed date the moment a lead becomes "Closed Won"
  // (so its price counts toward that month's revenue), and clear it if the lead
  // is moved back out of Closed Won (so it stops counting).
  const update = { stage: newStage };
  const stageText = `Stage changed from ${l.stage || 'New Lead'} to ${newStage}`;
  const activityRef = leadsCol.doc(id).collection('activity').doc();
  const nextActivitySearch = `${l.activitySearch || ''}\n${stageText}`.slice(-4000);
  let newClosedDate = l.closedDate;
  if (newStage === 'Closed Won') { update.closedDate = today(); newClosedDate = update.closedDate; }
  else if (l.stage === 'Closed Won') { update.closedDate = ''; newClosedDate = ''; }
  try {
    update.activitySearch = nextActivitySearch;
    const batch = db.batch();
    batch.update(leadsCol.doc(id), update);
    batch.set(activityRef, {
      type: 'stage', text: stageText, fromStage: l.stage || 'New Lead', toStage: newStage,
      authorUid: currentUid, authorEmail: currentUserEmail, createdAt: new Date().toISOString(),
    });
    await batch.commit();
    const merged = { ...l, ...update, stage: newStage, closedDate: newClosedDate };
    await syncRevenueEntry(id, merged);
    await syncClientFromLead(id, merged);
    showToast(`Stage → ${newStage}`, 'success');
  } catch (e) {
    showToast('❌ Update fail: ' + e.message, 'error');
    return;
  }
  openDetail(id); // refresh the panel badges (listener also re-renders the page)
}

