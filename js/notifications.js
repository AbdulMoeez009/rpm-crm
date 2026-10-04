async function notifyUser(userId, type, message, extra = {}) {
  if (!userId || userId === currentUid) return; // don't notify yourself
  try {
    await notificationsCol.add({
      userId, type, message, ...extra,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('notify failed', e);
  }
}

function startNotificationsListener() {
  if (unsubscribeNotifications) { unsubscribeNotifications(); unsubscribeNotifications = null; }
  unsubscribeNotifications = notificationsCol.where('userId', '==', currentUid).onSnapshot(
    snapshot => {
      notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      notifications.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      renderNotifBadge();
      renderNotifDropdown();
    },
    err => console.error(err)
  );
}

function renderNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const unread = notifications.filter(n => !n.read).length;
  if (unread > 0) { badge.textContent = unread > 9 ? '9+' : unread; badge.style.display = 'flex'; }
  else { badge.style.display = 'none'; }
}

const NOTIF_ICON = { lead_assigned: '📋', task_assigned: '✅', renewal: '📅' };

function renderNotifDropdown() {
  const wrap = document.getElementById('notif-dropdown');
  if (!wrap) return;

  if (notifications.length === 0) {
    wrap.innerHTML = `<div style="padding:20px;text-align:center;font-size:12px;color:var(--muted);">No notifications yet.</div>`;
    return;
  }

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);">
      <span style="font-weight:700;font-size:13px;">Notifications</span>
      <button class="btn btn-ghost btn-sm" onclick="markAllNotifsRead()" style="font-size:11px;padding:3px 8px;">Mark all read</button>
    </div>
    <div style="max-height:360px;overflow-y:auto;">
      ${notifications.slice(0, 30).map(n => `
        <div role="button" tabindex="0" data-keyboard-activate onclick="handleNotifClick('${n.id}', '${n.type}', '${n.clientId || ''}', '${n.leadId || ''}')"
          style="display:flex;gap:10px;padding:11px 14px;border-bottom:1px solid var(--border);cursor:pointer;${n.read ? '' : 'background:var(--bg);'}">
          <span style="font-size:16px;">${NOTIF_ICON[n.type] || '🔔'}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;${n.read ? 'color:var(--muted);' : 'font-weight:600;'}">${escapeHtml(n.message)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">${fmtRelativeTime(n.createdAt)}</div>
          </div>
          ${!n.read ? '<span style="width:7px;height:7px;border-radius:50%;background:#2563eb;flex-shrink:0;margin-top:5px;"></span>' : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function fmtRelativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function toggleNotifDropdown() {
  const wrap = document.getElementById('notif-dropdown');
  wrap.style.display = wrap.style.display === 'block' ? 'none' : 'block';
  closeGlobalSearch(); // don't let both dropdowns be open at once
}

async function markAllNotifsRead() {
  const unread = notifications.filter(n => !n.read);
  try {
    await Promise.all(unread.map(n => notificationsCol.doc(n.id).update({ read: true })));
  } catch (e) { console.error(e); }
}

function handleNotifClick(id, type, clientId, leadId) {
  notificationsCol.doc(id).update({ read: true }).catch(e => console.error(e));
  document.getElementById('notif-dropdown').style.display = 'none';
  if (clientId) { showPage('clients', document.getElementById('nav-clients')); openClientDetail(clientId); }
  else if (leadId) { showPage('leads', null); openDetail(leadId); }
}

