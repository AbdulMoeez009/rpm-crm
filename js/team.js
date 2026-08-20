/* ══════════════════════════════════════
   TEAM MANAGEMENT (admin only)
══════════════════════════════════════ */
let teamUsers = [];
let unsubscribeTeam = null;

function startTeamListener() {
  if (unsubscribeTeam) unsubscribeTeam();
  unsubscribeTeam = db.collection('users').onSnapshot(
    snapshot => {
      teamUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      const pending = teamUsers.filter(u => !u.approved).length;
      const badge = document.getElementById('sb-pending-count');
      if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline-block'; }
      else { badge.style.display = 'none'; }
      const activePage = document.querySelector('.page.active');
      if (activePage && activePage.id === 'page-team') renderTeam();
    },
    err => console.error(err)
  );
}

function renderTeam() {
  const pending = teamUsers.filter(u => !u.approved);
  const approved = teamUsers.filter(u => u.approved);
  const roleKeys = Object.keys(ROLE_LABELS);

  // Checkbox row used both for "approve with these roles" and "edit roles"
  const roleCheckboxes = (u, onChangeFn) => roleKeys.map(rk => `
    <label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px;font-weight:600;cursor:pointer;">
      <input type="checkbox" id="role-${u.uid}-${rk}" value="${rk}"
        ${rolesOf(u).includes(rk) ? 'checked' : ''}
        ${onChangeFn ? `onchange="${onChangeFn}('${u.uid}','${rk}',this.checked)"` : ''}
        style="width:14px;height:14px;accent-color:#2563eb;cursor:pointer;">
      ${ROLE_LABELS[rk]}
    </label>
  `).join('');

  const pendingWrap = document.getElementById('team-pending-table');
  if (pending.length === 0) {
    pendingWrap.innerHTML = `<div class="empty-state"><p>No pending requests.</p></div>`;
  } else {
    pendingWrap.innerHTML = `
      <table><thead><tr><th>Name</th><th>Email</th><th>Requested</th><th>Assign Role(s)</th><th>Actions</th></tr></thead>
      <tbody>
        ${pending.map(u => `
          <tr>
            <td>${escapeHtml(u.name || '—')}</td>
            <td>${u.email}</td>
            <td>${u.createdAt ? fmtDate(u.createdAt.slice(0,10)) : '—'}</td>
            <td>${roleCheckboxes(u, null)}</td>
            <td>
              <div class="action-btns">
                <button class="btn btn-sm btn-success" onclick="approveUser('${u.uid}')">✓ Approve</button>
                <button class="btn btn-sm btn-danger" onclick="rejectUser('${u.uid}')">✕ Reject</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody></table>
    `;
  }

  const approvedWrap = document.getElementById('team-approved-table');
  if (approved.length === 0) {
    approvedWrap.innerHTML = `<div class="empty-state"><p>No approved members yet.</p></div>`;
  } else {
    approvedWrap.innerHTML = `
      <table><thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Actions</th></tr></thead>
      <tbody>
        ${approved.map(u => `
          <tr>
            <td>${escapeHtml(u.name || '—')}${u.uid === currentUid ? ' <span style="color:var(--muted);font-size:11px">(you)</span>' : ''}</td>
            <td>${u.email}</td>
            <td>${u.uid !== currentUid ? roleCheckboxes(u, 'updateUserRole') :
                  (rolesOf(u).map(rk => `<span class="badge badge-hot">${ROLE_LABELS[rk] || rk}</span>`).join(' ') || '<span style="font-size:11px;color:var(--muted)">No roles</span>')}</td>
            <td>
              <div class="action-btns">
                ${u.uid !== currentUid ? `
                  <button class="btn btn-sm btn-danger" onclick="rejectUser('${u.uid}')">Remove Access</button>
                ` : '<span style="font-size:11px;color:var(--muted)">—</span>'}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody></table>
    `;
  }
}

// Reads whichever role checkboxes are ticked for a given pending user, then
// approves them with exactly those roles in one write.
async function approveUser(uid) {
  const roleKeys = Object.keys(ROLE_LABELS);
  const selected = roleKeys.filter(rk => document.getElementById(`role-${uid}-${rk}`)?.checked);
  if (selected.length === 0) {
    showToast('❌ Pick at least one role before approving', 'error');
    return;
  }
  try {
    await db.collection('users').doc(uid).update({ approved: true, roles: selected });
    showToast('User approved!', 'success');
  } catch (e) {
    showToast('❌ Fail: ' + e.message, 'error');
  }
}

async function rejectUser(uid) {
  if (!confirm('Remove this user\'s access? They will not be able to log in again until re-approved.')) return;
  try {
    await db.collection('users').doc(uid).update({ approved: false });
    showToast('Access removed.', 'error');
  } catch (e) {
    showToast('❌ Fail: ' + e.message, 'error');
  }
}

// Toggle a single role on/off for an already-approved user (each checkbox
// fires this independently, so someone can hold e.g. Dialer + Closer at once).
async function updateUserRole(uid, roleKey, checked) {
  try {
    const fv = firebase.firestore.FieldValue;
    await db.collection('users').doc(uid).update({
      roles: checked ? fv.arrayUnion(roleKey) : fv.arrayRemove(roleKey)
    });
    showToast(`${ROLE_LABELS[roleKey]} ${checked ? 'added' : 'removed'}`, 'success');
  } catch (e) {
    showToast('❌ Fail: ' + e.message, 'error');
  }
}

