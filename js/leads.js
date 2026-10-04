/* ══════════════════════════════════════
   ALL LEADS TABLE
══════════════════════════════════════ */
function populateFilterDropdowns() {
  // Build unique city and industry options from data
  const cities = [...new Set(leads.map(l => l.city).filter(Boolean))].sort();
  const industries = [...new Set(leads.map(l => l.industry).filter(Boolean))].sort();

  const citySelect = document.getElementById('filter-city');
  const curCity = citySelect.value;
  citySelect.innerHTML = `<option value="">All Cities</option>` + cities.map(c => `<option value="${c}" ${c===curCity?'selected':''}>${c}</option>`).join('');

  const indSelect = document.getElementById('filter-industry');
  const curInd = indSelect.value;
  indSelect.innerHTML = `<option value="">All Industries</option>` + industries.map(i => `<option value="${i}" ${i===curInd?'selected':''}>${i}</option>`).join('');
}

function clearFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-stage').value = '';
  document.getElementById('filter-city').value = '';
  document.getElementById('filter-industry').value = '';
  renderLeadsTable();
}

// Sorting state for the All Leads table
let leadsSortField = null;
let leadsSortDir = 'asc'; // 'asc' | 'desc'

function sortLeadsBy(field) {
  if (leadsSortField === field) {
    leadsSortDir = leadsSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    leadsSortField = field;
    leadsSortDir = 'asc';
  }
  renderLeadsTable();
}

function applyLeadsSort(arr) {
  if (!leadsSortField) return arr;
  const field = leadsSortField;
  const dir = leadsSortDir === 'asc' ? 1 : -1;
  return [...arr].sort((a, b) => {
    let av = a[field], bv = b[field];
    if (field === 'price') {
      av = Number(av) || 0;
      bv = Number(bv) || 0;
      return (av - bv) * dir;
    }
    // Dates and text both sort fine as strings; empty values always sink to the bottom
    av = (av || '').toString().toLowerCase();
    bv = (bv || '').toString().toLowerCase();
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return av.localeCompare(bv) * dir;
  });
}

function updateSortArrows() {
  document.querySelectorAll('.sort-arrow').forEach(el => el.textContent = '');
  if (!leadsSortField) return;
  const el = document.getElementById('sort-arrow-' + leadsSortField);
  if (el) el.textContent = leadsSortDir === 'asc' ? '▲' : '▼';
}

function renderLeadsTable() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const fs = document.getElementById('filter-status').value;
  const fst = document.getElementById('filter-stage').value;
  const fc = document.getElementById('filter-city').value;
  const fi = document.getElementById('filter-industry').value;

  // Apply all filters
  let filtered = leads.filter(l => {
    const matchQ = !q || [l.ownerName, l.bizName, l.phone1, l.phone2, l.email1, l.email2, l.dialer, l.city, l.industry]
      .some(v => (v||'').toLowerCase().includes(q));
    const matchS = !fs || l.status === fs;
    const matchSt = !fst || l.stage === fst;
    const matchC = !fc || l.city === fc;
    const matchI = !fi || l.industry === fi;
    return matchQ && matchS && matchSt && matchC && matchI;
  });
  filtered = applyLeadsSort(filtered);
  updateSortArrows();

  const tbody = document.getElementById('leads-tbody');
  const empty = document.getElementById('leads-empty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = filtered.map(l => `
      <tr class="${l.status==='Hot'?'hot-row':''}">
        <td>
          <div class="lead-name">${l.status==='Hot'?'🔥 ':''}${l.ownerName||'—'}</div>
          <div class="lead-biz">${l.bizName}${l.city?' · '+l.city:''}</div>
        </td>
        <td>${l.dialer||'—'}</td>
        <td>
          ${l.phone1 ? `<div>${l.phone1}</div>` : '—'}
          ${l.phone2 ? `<div style="color:var(--muted);font-size:12px">${l.phone2}</div>` : ''}
        </td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.services||'—'}</td>
        <td class="lead-price">${fmtPrice(l.price)}</td>
        <td>${statusBadge(l.status)}</td>
        <td>${stageBadge(l.stage)}</td>
        <td>${followupHtml(l.followupDate)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-primary" onclick="openDetail('${l.id}')">View</button>
            <button class="btn btn-sm btn-ghost" onclick="openLeadModal('${l.id}')">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteLead('${l.id}')">Del</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

/* ══════════════════════════════════════
   PIPELINE BOARD
══════════════════════════════════════ */
function renderPipeline() {
  const board = document.getElementById('pipeline-board');
  board.innerHTML = STAGES.map(stage => {
    const cols = leads.filter(l => l.stage === stage);
    return `<div class="pipeline-col ${COL_CLASS[stage]}" style="width:220px;">
      <div class="pipeline-header">${stage} <span class="pipeline-count">${cols.length}</span></div>
      <div class="pipeline-cards">
        ${cols.map(l => `
          <div class="pipeline-card" role="button" tabindex="0" data-keyboard-activate aria-label="Open ${l.ownerName || l.bizName}" onclick="openDetail('${l.id}')">
            <div class="pc-name">${l.status==='Hot'?'🔥 ':''}${l.ownerName||l.bizName}</div>
            <div class="pc-biz">${l.bizName}</div>
            <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">
              ${statusBadge(l.status)}
              ${l.price ? `<span style="font-size:11px;font-weight:700;color:var(--green)">${fmtPrice(l.price)}</span>` : ''}
              ${l.followupDate && daysUntil(l.followupDate) <= 0 ? '<span style="font-size:10px;color:var(--hot);font-weight:700">⏰ DUE</span>' : ''}
            </div>
          </div>
        `).join('')}
        ${cols.length === 0 ? `<div style="font-size:12px;color:var(--muted);padding:16px 0;text-align:center">No leads here</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════
   FOLLOW-UPS VIEW
══════════════════════════════════════ */
function renderFollowups() {
  // show strip at top
  document.getElementById('followup-strip-wrap2').innerHTML = followupStripHtml();

  // all leads that have a follow-up date, sorted by urgency
  const withDate = leads
    .filter(l => l.followupDate)
    .sort((a, b) => new Date(a.followupDate) - new Date(b.followupDate));

  const tbody = document.getElementById('followups-tbody');
  const empty = document.getElementById('followups-empty');

  if (withDate.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = withDate.map(l => `
      <tr class="${l.status==='Hot'?'hot-row':''}">
        <td><div class="lead-name">${l.status==='Hot'?'🔥 ':''}${l.ownerName||'—'}</div></td>
        <td>${l.bizName}</td>
        <td>${l.dialer||'—'}</td>
        <td>${l.phone1||'—'}</td>
        <td>${followupHtml(l.followupDate)}</td>
        <td>${l.lastContact ? fmtDate(l.lastContact) : '—'}</td>
        <td>${statusBadge(l.status)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-primary" onclick="openDetail('${l.id}')">View</button>
            <button class="btn btn-sm btn-ghost" onclick="openLeadModal('${l.id}')">Edit</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

