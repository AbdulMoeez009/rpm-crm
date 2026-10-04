/* ══════════════════════════════════════
   ADD / EDIT MODAL
══════════════════════════════════════ */
function openLeadModal(id = null, triggerElement = null) {
  if (triggerElement && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    triggerElement.style.viewTransitionName = 'lead-modal-origin';
    document.startViewTransition(() => {
      triggerElement.style.viewTransitionName = '';
      document.getElementById('modal-title').style.viewTransitionName = 'lead-modal-origin';
      openLeadModalContent(id);
    }).finished.finally(() => {
      document.getElementById('modal-title').style.viewTransitionName = '';
    });
    return;
  }
  openLeadModalContent(id);
}

function openLeadModalContent(id = null) {
  editingId = id;
  document.getElementById('modal-title').textContent = id ? 'Edit Lead' : 'Add New Lead';
  document.getElementById('save-lead-submit').textContent = id ? 'Save Changes' : 'Create Lead';

  // Rebuild the Closer / Support Manager dropdowns from the live roster every
  // time the modal opens, so newly-approved team members show up right away.
  const closerSel = document.getElementById('f-closer');
  const supportSel = document.getElementById('f-support');
  closerSel.innerHTML = '<option value="">— Unassigned —</option>' +
    getUsersByRole('closer').map(u => `<option value="${u.uid}">${escapeHtml(u.name || u.email)}</option>`).join('');
  supportSel.innerHTML = '<option value="">— Unassigned —</option>' +
    getUsersByRole('support_manager').map(u => `<option value="${u.uid}">${escapeHtml(u.name || u.email)}</option>`).join('');

  if (id) {
    // populate form with existing data
    const l = leads.find(x => x.id === id);
    document.getElementById('f-dialer').value = l.dialer || '';
    closerSel.value = l.closerUid || '';
    supportSel.value = l.supportUid || '';
    document.getElementById('f-bizname').value = l.bizName || '';
    document.getElementById('f-owner').value = l.ownerName || '';
    document.getElementById('f-industry').value = l.industry || '';
    document.getElementById('f-city').value = l.city || '';
    document.getElementById('f-price').value = l.price || '';
    document.getElementById('f-services').value = l.services || '';
    document.getElementById('f-phone1').value = l.phone1 || '';
    document.getElementById('f-phone2').value = l.phone2 || '';
    document.getElementById('f-email1').value = l.email1 || '';
    document.getElementById('f-email2').value = l.email2 || '';
    document.getElementById('f-yelp').value = l.yelp || '';
    document.getElementById('f-gmb').value = l.gmb || '';
    document.getElementById('f-website').value = l.website || '';
    document.getElementById('f-status').value = l.status || 'Cold';
    document.getElementById('f-stage').value = l.stage || 'New Lead';
    document.getElementById('f-followup-date').value = l.followupDate || '';
    document.getElementById('f-last-contact').value = l.lastContact || '';
  } else {
    // clear form
    ['f-dialer','f-bizname','f-owner','f-industry','f-city','f-price','f-services',
     'f-phone1','f-phone2','f-email1','f-email2','f-yelp','f-gmb','f-website',
     'f-followup-date','f-last-contact'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.value = '';
    });
    closerSel.value = '';
    supportSel.value = '';
    document.getElementById('f-status').value = 'Cold';
    document.getElementById('f-stage').value = 'New Lead';
  }

  openDialog('lead-modal-overlay');
}

function closeLeadModal() {
  closeDialog('lead-modal-overlay');
  editingId = null;
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('lead-modal-overlay')) closeLeadModal();
}

// Validate phone: must have at least 7 digits
function isValidPhone(p) {
  if (!p) return true; // optional field — empty is ok
  return /\d{7,}/.test(p.replace(/[\s\-().+]/g, ''));
}

// Validate email format
function isValidEmail(e) {
  if (!e) return true; // optional field — empty is ok
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// Highlight a field in red on error
function fieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) {
    el.style.borderColor = 'var(--hot)';
    el.style.background = 'var(--hot-bg)';
    el.focus();
    setTimeout(() => { el.style.borderColor = ''; el.style.background = ''; }, 2500);
  }
  showToast(msg, 'error');
}

async function saveLead() {
  const bizName = document.getElementById('f-bizname').value.trim();
  const dialer  = document.getElementById('f-dialer').value.trim();
  const phone1  = document.getElementById('f-phone1').value.trim();
  const email1  = document.getElementById('f-email1').value.trim();

  // ── Required fields ──
  if (!dialer)  { fieldError('f-dialer',  '❌ Dialer Name is required!');   return; }
  if (!bizName) { fieldError('f-bizname', '❌ Business Name is required!'); return; }

  // ── Phone: only primary is required & validated. Secondary is fully optional, no checks. ──
  if (!phone1)                { fieldError('f-phone1', '❌ Primary Phone is required!'); return; }
  if (!isValidPhone(phone1))  { fieldError('f-phone1', '❌ Primary phone is invalid! (min 7 digits)'); return; }

  // ── Email: only primary is required & validated. Secondary is fully optional, no checks. ──
  if (!email1)                { fieldError('f-email1', '❌ Primary Email is required!'); return; }
  if (!isValidEmail(email1))  { fieldError('f-email1', '❌ Primary email format is invalid!'); return; }

  // collect all form values
  const closerUid = document.getElementById('f-closer').value;
  const supportUid = document.getElementById('f-support').value;
  const closerUser = closerUid ? teamUsers.find(u => u.uid === closerUid) : null;
  const supportUser = supportUid ? teamUsers.find(u => u.uid === supportUid) : null;

  const data = {
    dialer,
    closerUid: closerUid || '',
    closer: closerUser ? (closerUser.name || closerUser.email) : '', // display copy, kept for old lists/revenue rows
    supportUid: supportUid || '',
    supportName: supportUser ? (supportUser.name || supportUser.email) : '',
    bizName,
    ownerName: document.getElementById('f-owner').value.trim(),
    industry: document.getElementById('f-industry').value.trim(),
    city: document.getElementById('f-city').value.trim(),
    price: document.getElementById('f-price').value.trim(),
    services: document.getElementById('f-services').value.trim(),
    phone1: document.getElementById('f-phone1').value.trim(),
    phone2: document.getElementById('f-phone2').value.trim(),
    email1: document.getElementById('f-email1').value.trim(),
    email2: document.getElementById('f-email2').value.trim(),
    yelp: document.getElementById('f-yelp').value.trim(),
    gmb: document.getElementById('f-gmb').value.trim(),
    website: document.getElementById('f-website').value.trim(),
    status: document.getElementById('f-status').value,
    stage: document.getElementById('f-stage').value,
    followupDate: document.getElementById('f-followup-date').value,
    lastContact: document.getElementById('f-last-contact').value,
  };

  const saved = await withButtonLoading('save-lead-submit', editingId ? 'Saving…' : 'Creating…', async () => {
    try {
      if (editingId) {
      // update existing lead in Firestore
      const existing = leads.find(l => l.id === editingId);
      // Revenue tracking: stamp closedDate the moment it becomes Closed Won,
      // clear it if it moves back out (so it stops counting toward revenue).
      if (data.stage === 'Closed Won' && (!existing || existing.stage !== 'Closed Won')) {
        data.closedDate = today();
      } else if (data.stage !== 'Closed Won') {
        data.closedDate = '';
      }
      await leadsCol.doc(editingId).update(data);
      const mergedExisting = { ...existing, ...data };
      await syncRevenueEntry(editingId, mergedExisting);
      await syncClientFromLead(editingId, mergedExisting);
      // Only notify if the closer assignment actually changed — don't
      // re-notify on every unrelated edit to the same lead.
      if (data.closerUid && data.closerUid !== (existing?.closerUid || '')) {
        notifyUser(data.closerUid, 'lead_assigned', `New lead assigned to you: ${data.bizName}`, { leadId: editingId });
      }
      showToast('Lead updated!', 'success');
    } else {
      // create new lead in Firestore, tagged with the creator's identity
      data.dateAdded = today();
      data.ownerUid = currentUid;
      data.ownerEmail = currentUserEmail;
      if (data.stage === 'Closed Won') data.closedDate = today();
      const ref = await leadsCol.add(data);
      await syncRevenueEntry(ref.id, data);
      await syncClientFromLead(ref.id, data);
      if (data.closerUid) {
        notifyUser(data.closerUid, 'lead_assigned', `New lead assigned to you: ${data.bizName}`, { leadId: ref.id });
      }
        showToast('Lead added successfully', 'success');
      }
      return true;
    } catch (e) {
      showToast('Unable to save lead. Please try again.', 'error');
      console.error(e);
      return false;
    }
  });
  if (!saved) return;

  closeLeadModal(); // the Firestore listener will refresh the tables automatically
}

