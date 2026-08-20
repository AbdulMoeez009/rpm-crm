/* ── Tasks (per-client, unlimited) ── */
let clientTasks = [];
let unsubscribeTasks = null;
const TASK_STATUSES = ['Pending','Working','Review','Completed','Cancelled'];
const TASK_PRIORITY_CLASS = { Low:'badge-cold', Medium:'badge-warm', High:'badge-hot', Urgent:'badge-hot' };

function startTasksListenerForClient(clientId) {
  if (unsubscribeTasks) { unsubscribeTasks(); unsubscribeTasks = null; }
  unsubscribeTasks = tasksCol.where('clientId', '==', clientId).onSnapshot(
    snapshot => {
      clientTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // newest due-date-less-urgent first, then by due date
      clientTasks.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
      renderTasksList();
    },
    err => console.error(err)
  );
}

function renderTasksList() {
  const wrap = document.getElementById('cdp-tasks-list');
  if (!wrap) return; // drawer might have closed already

  if (clientTasks.length === 0) {
    wrap.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:10px 0;">No tasks yet for this client.</div>`;
    return;
  }

  wrap.innerHTML = clientTasks.map(t => {
    const assignee = teamUsers.find(u => u.uid === t.assignedUid);
    const overdue = t.dueDate && t.dueDate < today() && t.status !== 'Completed' && t.status !== 'Cancelled';
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid var(--border);font-size:13px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;${t.status==='Completed'?'text-decoration:line-through;color:var(--muted);':''}">${escapeHtml(t.title)}</div>
          <div style="font-size:11px;color:var(--muted);">
            ${assignee ? escapeHtml(assignee.name || assignee.email) : 'Unassigned'}
            ${t.dueDate ? ' · Due ' + t.dueDate + (overdue ? ' ⚠️' : '') : ''}
          </div>
        </div>
        <span class="badge ${TASK_PRIORITY_CLASS[t.priority] || 'badge-cold'}">${t.priority || 'Medium'}</span>
        <select onchange="updateTaskStatus('${t.id}', this.value)" style="font-size:12px;padding:4px 6px;">
          ${TASK_STATUSES.map(s => `<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <button class="btn-icon" onclick="deleteTask('${t.id}')" title="Delete task">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    `;
  }).join('');
}

async function addTask(clientId) {
  const title = document.getElementById('task-title').value.trim();
  const assignedUid = document.getElementById('task-assignee').value;
  const priority = document.getElementById('task-priority').value;
  const dueDate = document.getElementById('task-due').value;

  if (!title) { showToast('❌ Task title is required', 'error'); return; }
  const assignee = assignedUid ? teamUsers.find(u => u.uid === assignedUid) : null;

  try {
    await tasksCol.add({
      clientId,
      title,
      assignedUid: assignedUid || '',
      assignedName: assignee ? (assignee.name || assignee.email) : '',
      priority,
      status: 'Pending',
      dueDate: dueDate || '',
      createdBy: currentUid,
      createdAt: today(),
    });
    document.getElementById('task-title').value = '';
    document.getElementById('task-due').value = '';
    if (assignedUid) notifyUser(assignedUid, 'task_assigned', `New task assigned: ${title}`, { clientId });
    showToast('Task added!', 'success');
  } catch (e) {
    showToast('❌ Could not add task: ' + e.message, 'error');
  }
}

async function updateTaskStatus(taskId, status) {
  try {
    await tasksCol.doc(taskId).update({ status });
  } catch (e) {
    showToast('❌ Could not update task: ' + e.message, 'error');
  }
}

async function deleteTask(taskId) {
  if (!confirm('Delete this task?')) return;
  try {
    await tasksCol.doc(taskId).delete();
  } catch (e) {
    showToast('❌ Could not delete task: ' + e.message, 'error');
  }
}

/* ── Global Tasks page (every task this user can see, across all clients) ── */
// Admins see every task. Everyone else sees tasks assigned TO them, plus
// tasks they personally created (e.g. a support manager assigning work to
// their team still needs to see it on their own Tasks page).
function startGlobalTasksListener() {
  if (unsubscribeAllTasks) { unsubscribeAllTasks(); unsubscribeAllTasks = null; }

  if (isAdmin) {
    unsubscribeAllTasks = tasksCol.onSnapshot(
      snapshot => {
        allTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const activePage = document.querySelector('.page.active');
        if (activePage && activePage.id === 'page-tasks') renderGlobalTasksPage();
      },
      err => console.error(err)
    );
    return;
  }

  let byAssignee = {}, byCreator = {};
  const rebuild = () => {
    const merged = { ...byCreator, ...byAssignee };
    allTasks = Object.values(merged);
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-tasks') renderGlobalTasksPage();
  };
  const unsub1 = tasksCol.where('assignedUid', '==', currentUid).onSnapshot(
    snap => { byAssignee = {}; snap.docs.forEach(d => { byAssignee[d.id] = { id: d.id, ...d.data() }; }); rebuild(); },
    err => console.error(err));
  const unsub2 = tasksCol.where('createdBy', '==', currentUid).onSnapshot(
    snap => { byCreator = {}; snap.docs.forEach(d => { byCreator[d.id] = { id: d.id, ...d.data() }; }); rebuild(); },
    err => console.error(err));

  unsubscribeAllTasks = () => { unsub1(); unsub2(); };
}

function renderGlobalTasksPage() {
  // keep the "Assigned To" filter dropdown fresh with current team members
  const assigneeSel = document.getElementById('task-filter-assignee');
  if (assigneeSel && assigneeSel.options.length <= 1) {
    assigneeSel.innerHTML = '<option value="">Everyone</option>' +
      teamUsers.filter(u => u.approved).map(u => `<option value="${u.uid}">${escapeHtml(u.name || u.email)}</option>`).join('');
  }

  const statusFilter = document.getElementById('task-filter-status')?.value || '';
  const priorityFilter = document.getElementById('task-filter-priority')?.value || '';
  const assigneeFilter = document.getElementById('task-filter-assignee')?.value || '';

  let rows = allTasks.filter(t =>
    (!statusFilter || t.status === statusFilter) &&
    (!priorityFilter || t.priority === priorityFilter) &&
    (!assigneeFilter || t.assignedUid === assigneeFilter)
  );
  rows.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  const tbody = document.getElementById('tasks-page-tbody');
  const emptyEl = document.getElementById('tasks-page-empty');
  if (!tbody) return;

  if (rows.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = rows.map(t => {
    const client = clients.find(c => c.id === t.clientId);
    const assignee = teamUsers.find(u => u.uid === t.assignedUid);
    const overdue = t.dueDate && t.dueDate < today() && t.status !== 'Completed' && t.status !== 'Cancelled';
    return `
      <tr>
        <td style="${t.status==='Completed'?'text-decoration:line-through;color:var(--muted);':''}">${escapeHtml(t.title)}</td>
        <td>${client ? escapeHtml(client.businessName) : '<span style="color:var(--muted)">—</span>'}</td>
        <td>${assignee ? escapeHtml(assignee.name || assignee.email) : '<span style="color:var(--muted)">Unassigned</span>'}</td>
        <td><span class="badge ${TASK_PRIORITY_CLASS[t.priority] || 'badge-cold'}">${t.priority || 'Medium'}</span></td>
        <td>${t.dueDate ? t.dueDate + (overdue ? ' ⚠️' : '') : '—'}</td>
        <td>
          <select onchange="updateTaskStatus('${t.id}', this.value)" style="font-size:12px;padding:4px 6px;">
            ${TASK_STATUSES.map(s => `<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>
          <div class="action-btns">
            ${client ? `<button class="btn btn-sm btn-ghost" onclick="openClientDetail('${client.id}')">View Client</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ── Add Task modal (global page — lets you pick which client first) ── */
function openAddTaskModal() {
  const clientSel = document.getElementById('tf-client');
  const assigneeSel = document.getElementById('tf-assignee');

  if (clients.length === 0) {
    showToast('❌ No clients available yet — tasks need a client', 'error');
    return;
  }

  clientSel.innerHTML = clients.map(c => `<option value="${c.id}">${escapeHtml(c.businessName)}</option>`).join('');
  assigneeSel.innerHTML = '<option value="">— Unassigned —</option>' +
    teamUsers.filter(u => u.approved).map(u => `<option value="${u.uid}">${escapeHtml(u.name || u.email)}</option>`).join('');

  document.getElementById('tf-title').value = '';
  document.getElementById('tf-priority').value = 'Medium';
  document.getElementById('tf-due').value = '';

  document.getElementById('task-modal-overlay').classList.add('show');
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').classList.remove('show');
}

function closeTaskModalOnOverlay(e) {
  if (e.target === document.getElementById('task-modal-overlay')) closeTaskModal();
}

async function saveTaskFromModal() {
  const clientId = document.getElementById('tf-client').value;
  const title = document.getElementById('tf-title').value.trim();
  const assignedUid = document.getElementById('tf-assignee').value;
  const priority = document.getElementById('tf-priority').value;
  const dueDate = document.getElementById('tf-due').value;

  if (!clientId) { showToast('❌ Please pick a client', 'error'); return; }
  if (!title)    { showToast('❌ Task title is required', 'error'); return; }

  const assignee = assignedUid ? teamUsers.find(u => u.uid === assignedUid) : null;

  try {
    await tasksCol.add({
      clientId,
      title,
      assignedUid: assignedUid || '',
      assignedName: assignee ? (assignee.name || assignee.email) : '',
      priority,
      status: 'Pending',
      dueDate: dueDate || '',
      createdBy: currentUid,
      createdAt: today(),
    });
    showToast('Task added!', 'success');
    if (assignedUid) notifyUser(assignedUid, 'task_assigned', `New task assigned: ${title}`, { clientId });
    closeTaskModal();
  } catch (e) {
    showToast('❌ Could not add task: ' + e.message, 'error');
  }
}

