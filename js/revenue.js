/* ══════════════════════════════════════
   REVENUE (monthly — resets to 0 on the 1st, full history kept forever)
   Everyone sees the TEAM total + their OWN total. Only admins see the
   full deal-by-deal breakdown of who closed what.
══════════════════════════════════════ */
let revenueEntries = [];       // synced live from the shared 'revenue' collection
let unsubscribeRevenue = null;
// 0 = current month, -1 = last month, -2 = two months ago, etc.
let revenueMonthOffset = 0;

function startRevenueListener() {
  if (unsubscribeRevenue) unsubscribeRevenue();
  unsubscribeRevenue = revenueCol.onSnapshot(
    snapshot => {
      revenueEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const activePage = document.querySelector('.page.active');
      if (activePage && activePage.id === 'page-revenue') renderRevenue();
      if (activePage && activePage.id === 'page-dashboard') renderDashboard();
    },
    err => console.error(err)
  );
}

function getRevenueTargetDate() {
  const d = new Date();
  d.setDate(1); // avoid month-length overflow issues (e.g. Jan 31 -> Mar 3)
  d.setMonth(d.getMonth() + revenueMonthOffset);
  return d; // day is always 1st of the target month
}

// Shared helper: compute team total, personal total, and deal counts for a given
// month offset (0 = current month). Used by both the Dashboard and Revenue page.
function computeMonthlyRevenue(monthOffset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthOffset);
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  const closed = revenueEntries.filter(e => e.closedDate && e.closedDate.slice(0, 7) === monthKey);
  const myClosed = closed.filter(e => e.ownerUid === currentUid || e.closerUid === currentUid);

  return {
    date: d,
    teamTotal: closed.reduce((sum, e) => sum + (Number(e.price) || 0), 0),
    myTotal: myClosed.reduce((sum, e) => sum + (Number(e.price) || 0), 0),
    teamCount: closed.length,
    myCount: myClosed.length,
  };
}

function shiftRevenueMonth(delta) {
  // Don't allow navigating into the future past the current month
  if (revenueMonthOffset + delta > 0) return;
  revenueMonthOffset += delta;
  renderRevenue();
}

function renderRevenue() {
  const target = getRevenueTargetDate();
  const monthKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;

  document.getElementById('revenue-month-label').textContent =
    target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) +
    (revenueMonthOffset === 0 ? ' (This Month)' : '');
  document.getElementById('revenue-next-btn').style.opacity = revenueMonthOffset === 0 ? '0.4' : '1';
  document.getElementById('revenue-next-btn').style.pointerEvents = revenueMonthOffset === 0 ? 'none' : 'auto';

  // Everyone can see closed deals across the WHOLE team for revenue purposes —
  // this collection only holds price/owner/close-date, no private contact info.
  const closedThisMonth = revenueEntries.filter(e => e.closedDate && e.closedDate.slice(0, 7) === monthKey);
  const myClosedThisMonth = closedThisMonth.filter(e => e.ownerUid === currentUid || e.closerUid === currentUid);
  const rev = computeMonthlyRevenue(revenueMonthOffset);

  document.getElementById('revenue-stats').innerHTML = `
    <div class="stat-card stat-green">
      <div class="stat-label">💰 Team Total Revenue</div>
      <div class="stat-val">${fmtPrice(rev.teamTotal)}</div>
      <div class="stat-desc">${target.toLocaleDateString('en-US', { month:'long', year:'numeric' })} — whole team</div>
    </div>
    <div class="stat-card stat-blue">
      <div class="stat-label">🙋 Your Revenue</div>
      <div class="stat-val">${fmtPrice(rev.myTotal)}</div>
      <div class="stat-desc">${rev.myCount} deal${rev.myCount===1?'':'s'} you closed</div>
    </div>
    <div class="stat-card stat-orange">
      <div class="stat-label">Team Deals Closed</div>
      <div class="stat-val">${rev.teamCount}</div>
      <div class="stat-desc">Total closed-won leads</div>
    </div>
  `;

  // Detailed breakdown table: admins see everyone's deals; regular users see only their own.
  const rowsToShow = isAdmin ? closedThisMonth : myClosedThisMonth;
  const tableWrap = document.getElementById('revenue-table');
  document.getElementById('revenue-table-title').textContent =
    isAdmin ? 'Closed Deals — Whole Team (This Month)' : 'Your Closed Deals (This Month)';

  if (rowsToShow.length === 0) {
    paginateRows('revenue', [], 'revenue-pagination', 'renderRevenue');
    tableWrap.innerHTML = `<div class="empty-state"><p>No deals closed this month.</p></div>`;
  } else {
    const sorted = [...rowsToShow].sort((a, b) => (b.closedDate || '').localeCompare(a.closedDate || ''));
    const visibleRows = paginateRows('revenue', sorted, 'revenue-pagination', 'renderRevenue');
    tableWrap.innerHTML = `
      <table><thead><tr>
        <th>Business</th>${isAdmin ? '<th>Closed By</th>' : ''}<th>Dialer</th><th>Closer</th><th>Closed Date</th><th>Price</th>
      </tr></thead><tbody>
        ${visibleRows.map(e => `
          <tr>
            <td><div class="lead-name">${e.bizName || '—'}</div></td>
            ${isAdmin ? `<td>${e.ownerEmail || '—'}</td>` : ''}
            <td>${e.dialer || '—'}</td>
            <td>${e.closer || '—'}</td>
            <td>${fmtDate(e.closedDate)}</td>
            <td class="lead-price">${fmtPrice(e.price)}</td>
          </tr>
        `).join('')}
      </tbody></table>
    `;
  }
}

