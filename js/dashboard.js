/* ══════════════════════════════════════
   DASHBOARD
══════════════════════════════════════ */
function openDashboardPipelineStage(stage) {
  showPage('leads', document.getElementById('nav-leads'));
  document.getElementById('lead-record-view').value = 'active';
  document.getElementById('search-input').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-stage').value = stage;
  document.getElementById('filter-city').value = '';
  document.getElementById('filter-industry').value = '';
  renderLeadsTable();
}

function openDashboardLeads(status = '') {
  showPage('leads', document.getElementById('nav-leads'));
  document.getElementById('lead-record-view').value = 'active';
  document.getElementById('filter-status').value = status;
  document.getElementById('search-input').value = '';
  renderLeadsTable();
}

function renderDashboard() {
  const currentLeads = activeLeads();
  const previousStats = ['dash-stats', 'dash-revenue-stats'].map(id =>
    [...document.querySelectorAll(`#${id} .stat-val`)].map(element => element.textContent)
  );
  const total = currentLeads.length;
  const hot = currentLeads.filter(l => l.status === 'Hot').length;
  const warm = currentLeads.filter(l => l.status === 'Warm').length;
  const due = currentLeads.filter(l => l.followupDate && daysUntil(l.followupDate) <= 0).length;

  // Stat cards
  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card stat-blue">
      <div class="stat-label">Total Leads</div>
      <div class="stat-val">${total}</div>
      <div class="stat-desc">In your CRM</div>
    </div>
    <div class="stat-card stat-red">
      <div class="stat-label">🔥 Hot Leads</div>
      <div class="stat-val">${hot}</div>
      <div class="stat-desc">Ready to close</div>
    </div>
    <div class="stat-card stat-orange">
      <div class="stat-label">🌤 Warm Leads</div>
      <div class="stat-val">${warm}</div>
      <div class="stat-desc">Nurture them</div>
    </div>
    <div class="stat-card stat-green">
      <div class="stat-label">⏰ Follow-Ups Today</div>
      <div class="stat-val">${due}</div>
      <div class="stat-desc">${due > 0 ? 'Action needed!' : 'All clear'}</div>
    </div>
  `;

  // Follow-up strip
  document.getElementById('followup-strip-wrap').innerHTML = followupStripHtml();

  // This month's revenue (mini version — full breakdown lives on the Revenue page)
  const rev = computeMonthlyRevenue(0);
  document.getElementById('dash-revenue-stats').innerHTML = `
    <div class="stat-card stat-green">
      <div class="stat-label">💰 Team Total</div>
      <div class="stat-val">${fmtPrice(rev.teamTotal)}</div>
      <div class="stat-desc">${rev.teamCount} deal${rev.teamCount===1?'':'s'} closed this month</div>
    </div>
    <div class="stat-card stat-blue">
      <div class="stat-label">🙋 Your Revenue</div>
      <div class="stat-val">${fmtPrice(rev.myTotal)}</div>
      <div class="stat-desc">${rev.myCount} deal${rev.myCount===1?'':'s'} you closed</div>
    </div>
  `;
  ['dash-stats', 'dash-revenue-stats'].forEach((id, groupIndex) => {
    document.querySelectorAll(`#${id} .stat-val`).forEach((element, index) => {
      animateCountChange(element, previousStats[groupIndex][index]);
    });
  });

  // Pipeline preview (mini version)
  const board = document.getElementById('dash-pipeline');
  board.innerHTML = STAGES.map(stage => {
    const cols = currentLeads.filter(l => l.stage === stage);
    return `<div class="pipeline-col ${COL_CLASS[stage]}">
      <button type="button" class="pipeline-header pipeline-stage-action" onclick="openDashboardPipelineStage('${stage}')" aria-label="View ${cols.length} leads in ${stage}">
        <span>${stage}</span><span class="pipeline-count">${cols.length}</span>
      </button>
      <div class="pipeline-cards">
        ${cols.slice(0,3).map(l => `
          <div class="pipeline-card" role="button" tabindex="0" data-keyboard-activate aria-label="Open ${escapeHtml(l.ownerName || l.bizName)}" onclick="openDetail('${l.id}', this)">
            <div class="pc-name">${l.status === 'Hot' ? '🔥 ' : ''}${escapeHtml(l.ownerName || l.bizName)}</div>
            <div class="pc-biz">${escapeHtml(l.bizName)}</div>
          </div>
        `).join('')}
        ${cols.length > 3 ? `<div style="font-size:11px;color:var(--muted);padding:4px 0;text-align:center">+${cols.length-3} more</div>` : ''}
        ${cols.length === 0 ? `<div style="font-size:12px;color:var(--muted);padding:8px 0;text-align:center">Empty</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // Hot leads mini table
  const hotLeads = currentLeads.filter(l => l.status === 'Hot');
  if (hotLeads.length === 0) {
    document.getElementById('hot-leads-table').innerHTML = `<div class="empty-state"><p>No hot leads yet</p><div class="empty-description">Mark a lead as Hot to see it in this list.</div><button class="btn btn-ghost empty-action" onclick="openDashboardLeads('Hot')">View leads</button></div>`;
  } else {
    document.getElementById('hot-leads-table').innerHTML = `
      <table><thead><tr>
        <th>Lead</th><th>Phone</th><th>Stage</th><th>Follow-Up</th><th>Dialer</th><th>Action</th>
      </tr></thead><tbody>
        ${hotLeads.map(l => `<tr class="hot-row">
          <td><div class="lead-name">🔥 ${escapeHtml(l.ownerName||'—')}</div><div class="lead-biz">${escapeHtml(l.bizName)}</div></td>
          <td>${escapeHtml(l.phone1||'—')}</td>
          <td>${stageBadge(l.stage)}</td>
          <td>${followupHtml(l.followupDate)}</td>
          <td>${escapeHtml(l.dialer||'—')}</td>
          <td><button class="btn btn-sm btn-primary" onclick="openDetail('${l.id}', this.closest('tr').querySelector('.table-person'))">View</button></td>
        </tr>`).join('')}
      </tbody></table>
    `;
  }

  // Upcoming renewals — any client with a renewalDate within the next 30 days
  // (or already overdue), soonest first.
  const renewalRows = clients
    .filter(c => c.renewalDate)
    .map(c => ({ ...c, daysLeft: daysUntil(c.renewalDate) }))
    .filter(c => c.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (renewalRows.length === 0) {
    document.getElementById('dash-renewals-table').innerHTML = `<div class="empty-state"><p>No upcoming renewals</p><div class="empty-description">Renewals due in the next 30 days will appear here.</div></div>`;
  } else {
    document.getElementById('dash-renewals-table').innerHTML = `
      <table><thead><tr>
        <th>Client</th><th>Package</th><th>Monthly Fee</th><th>Renewal Date</th><th>Status</th><th>Support Manager</th><th>Action</th>
      </tr></thead><tbody>
        ${renewalRows.map(c => `<tr class="${c.daysLeft < 0 ? 'hot-row' : ''}">
          <td>${escapeHtml(c.businessName)}</td>
          <td>${escapeHtml(c.servicePackage || '—')}</td>
          <td>${c.monthlyFee ? '$' + escapeHtml(String(c.monthlyFee)) : '—'}</td>
          <td>${c.renewalDate} ${c.daysLeft < 0 ? `<span style="color:var(--hot);font-weight:700;">(${Math.abs(c.daysLeft)}d overdue)</span>` : `<span style="color:var(--muted);">(in ${c.daysLeft}d)</span>`}</td>
          <td><span class="badge ${{Active:'badge-hot',Paused:'badge-warm',Churned:'badge-cold'}[c.status] || 'badge-cold'}">${escapeHtml(c.status || 'Active')}</span></td>
          <td>${escapeHtml(c.supportEmail || 'Unassigned')}</td>
          <td><button class="btn btn-sm btn-primary" onclick="openClientDetail('${c.id}')">View</button></td>
        </tr>`).join('')}
      </tbody></table>
    `;
  }
}

