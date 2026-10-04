/* ══════════════════════════════════════
   DETAIL PANEL
══════════════════════════════════════ */
function openDetail(id) {
  const l = leads.find(x => x.id === id);
  if (!l) return;
  viewingId = id;

  document.getElementById('dp-name').textContent = l.ownerName || '—';
  document.getElementById('dp-biz').textContent = l.bizName;
  document.getElementById('dp-badges').innerHTML = `
    ${statusBadge(l.status)}
    ${stageBadge(l.stage)}
    ${l.industry ? `<span class="badge" style="background:#f3f4f6;color:#374151">${l.industry}</span>` : ''}
    ${l.city ? `<span class="badge" style="background:#f3f4f6;color:#374151">📍 ${l.city}</span>` : ''}
    ${l.price ? `<span class="badge" style="background:var(--green-bg);color:var(--green)">${fmtPrice(l.price)}</span>` : ''}
  `;

  // Build detail body
  const row = (label, val, link) => {
    if (!val) return '';
    const display = link ? `<a href="${val}" target="_blank">${val}</a>` : val;
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
        <strong>Legacy note (before activity log):</strong><br>${l.notes.replace(/\n/g,'<br>')}
      </div>` : ''}
      <div id="dp-activity-list" style="margin-bottom:10px;">
        <div style="font-size:12px;color:var(--muted);">Loading...</div>
      </div>
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
    <button class="btn btn-primary btn-sm" onclick="openLeadModal('${l.id}');closeDetail()">✏️ Edit Lead</button>
    <select id="dp-stage-select" onchange="changeStageFromPanel('${l.id}', this.value)"
      style="background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text);
             padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;outline:none;">
      ${stageOptions}
    </select>
    <button class="btn btn-danger btn-sm" onclick="deleteLead('${l.id}');closeDetail()">Delete</button>
  `;

  openDialog('detail-overlay');
}

function closeDetail() {
  closeDialog('detail-overlay');
  viewingId = null;
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
    renderActivityList(entries);
  } catch (e) {
    container.innerHTML = `<div style="font-size:12px;color:var(--hot);">Could not load activity log.</div>`;
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
      <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">${e.authorEmail || 'Unknown'} · ${fmtDateTime(e.createdAt)}</div>
      <div style="font-size:13px;color:var(--text);line-height:1.5;">${(e.text || '').replace(/\n/g,'<br>')}</div>
    </div>
  `).join('');
}

async function addActivityEntry(leadId) {
  const input = document.getElementById('dp-activity-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  try {
    await leadsCol.doc(leadId).collection('activity').add({
      text,
      authorUid: currentUid,
      authorEmail: currentUserEmail,
      createdAt: new Date().toISOString(),
    });
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
  let newClosedDate = l.closedDate;
  if (newStage === 'Closed Won') { update.closedDate = today(); newClosedDate = update.closedDate; }
  else if (l.stage === 'Closed Won') { update.closedDate = ''; newClosedDate = ''; }
  try {
    await leadsCol.doc(id).update(update);
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

