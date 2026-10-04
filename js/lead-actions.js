const LEAD_IMPORT_FIELDS = [
  ['bizName', 'Business Name'], ['ownerName', 'Owner Name'], ['dialer', 'Dialer Name'],
  ['phone1', 'Phone (Primary)'], ['phone2', 'Phone (Secondary)'],
  ['email1', 'Email (Primary)'], ['email2', 'Email (Secondary)'],
  ['industry', 'Industry'], ['city', 'City'], ['price', 'Price'], ['services', 'Services'],
  ['yelp', 'Yelp URL'], ['gmb', 'GMB URL'], ['website', 'Website URL'],
  ['status', 'Lead Status'], ['stage', 'Pipeline Stage'],
  ['followupDate', 'Next Follow-Up Date'], ['lastContact', 'Last Contact Date'],
];
let pendingLeadImport = null;

function normalizedPhone(value) { return String(value || '').replace(/\D/g, ''); }
function normalizedEmail(value) { return String(value || '').trim().toLowerCase(); }
function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function findPotentialLeadDuplicates(candidate, excludedId = null) {
  const phoneValues = [candidate.phone1, candidate.phone2].map(normalizedPhone).filter(value => value.length >= 7);
  const emailValues = [candidate.email1, candidate.email2].map(normalizedEmail).filter(Boolean);
  return leads.filter(lead => {
    if (lead.id === excludedId || lead.archivedAt) return false;
    const existingPhones = [lead.phone1, lead.phone2].map(normalizedPhone).filter(Boolean);
    const existingEmails = [lead.email1, lead.email2].map(normalizedEmail).filter(Boolean);
    return phoneValues.some(value => existingPhones.includes(value)) || emailValues.some(value => existingEmails.includes(value));
  });
}

async function archiveLead(id) {
  const lead = leads.find(item => item.id === id);
  if (!lead || lead.archivedAt) return;
  if (!confirm(`Archive ${lead.bizName || 'this lead'}? You can restore it later.`)) return;
  try {
    await leadsCol.doc(id).update({ archivedAt: new Date().toISOString(), archivedBy: currentUid || '' });
    showToast('Lead archived. Restore it from Archived leads.', 'success');
    if (viewingId === id) closeDetail();
  } catch (error) {
    showToast(`Could not archive lead: ${error.message || 'Check your connection and retry.'}`, 'error');
  }
}

async function restoreLead(id) {
  try {
    await leadsCol.doc(id).update({ archivedAt: '', archivedBy: '' });
    showToast('Lead restored.', 'success');
    if (viewingId === id) closeDetail();
  } catch (error) {
    showToast(`Could not restore lead: ${error.message || 'Check your connection and retry.'}`, 'error');
  }
}

function deleteLead(id) { return archiveLead(id); }

function escapeCsvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ══════════════════════════════════════
   EXPORT TO CSV (opens in Excel)
══════════════════════════════════════ */
function exportCSV() {
  const exportLeads = leads.filter(lead => !lead.archivedAt);
  if (exportLeads.length === 0) { showToast('No active leads to export.', 'error'); return; }

  const headers = [
    'ID','Dialer Name','Closer Name','Business Name','Owner Name','Industry','City','Price',
    'Services','Phone (Primary)','Phone (Secondary)','Email (Primary)','Email (Secondary)',
    'Yelp URL','GMB URL','Website URL','Lead Status','Pipeline Stage',
    'Next Follow-Up Date','Last Contact Date','Closed Date','Notes','Date Added'
  ];

  const rows = exportLeads.map(l => [
    l.id, l.dialer, l.closer, l.bizName, l.ownerName, l.industry, l.city, l.price,
    l.services, l.phone1, l.phone2, l.email1, l.email2,
    l.yelp, l.gmb, l.website, l.status, l.stage,
    l.followupDate, l.lastContact, l.closedDate, l.notes, l.dateAdded
  ].map(escapeCsvCell));

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadBlob(`\uFEFF${csv}`, 'text/csv;charset=utf-8;', `RPM_CRM_${today()}.csv`);
  showToast('Active leads exported to CSV.', 'success');
}

async function downloadCrmBackup() {
  try {
    const leadRecords = [];
    for (let offset = 0; offset < leads.length; offset += 20) {
      const chunk = leads.slice(offset, offset + 20);
      const records = await Promise.all(chunk.map(async lead => {
        const activity = await leadsCol.doc(lead.id).collection('activity').get();
        return { ...lead, activity: activity.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
      }));
      leadRecords.push(...records);
    }
    const backup = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      records: { leads: leadRecords, clients, tasks: allTasks, revenue: revenueEntries },
      counts: { leads: leadRecords.length, clients: clients.length, tasks: allTasks.length, revenue: revenueEntries.length },
    };
    downloadBlob(JSON.stringify(backup, null, 2), 'application/json', `RPM_CRM_Backup_${today()}.json`);
    showToast('CRM backup downloaded.', 'success');
  } catch (error) {
    showToast(`Backup failed: ${error.message || 'Check your connection and retry.'}`, 'error');
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted && char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  if (rows.length < 2) throw new Error('CSV needs a header and at least one data row.');
  return rows;
}

function guessLeadImportMapping(headers) {
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    bizName: ['businessname', 'business', 'company', 'companyname'], ownerName: ['ownername', 'owner', 'contactname'],
    dialer: ['dialername', 'dialer'], phone1: ['phoneprimary', 'primaryphone', 'phone', 'phone1'],
    phone2: ['phonesecondary', 'secondaryphone', 'phone2'], email1: ['emailprimary', 'primaryemail', 'email', 'email1'],
    email2: ['emailsecondary', 'secondaryemail', 'email2'], industry: ['industry'], city: ['city'], price: ['price', 'value'],
    services: ['services', 'service'], yelp: ['yelpurl', 'yelp'], gmb: ['gmburl', 'gmb', 'googlebusinessprofile'],
    website: ['websiteurl', 'website', 'url'], status: ['leadstatus', 'status'], stage: ['pipelinestage', 'stage'],
    followupDate: ['nextfollowupdate', 'followupdate', 'followupdate'], lastContact: ['lastcontactdate', 'lastcontact'],
  };
  return Object.fromEntries(LEAD_IMPORT_FIELDS.map(([key]) => {
    const found = headers.findIndex(header => aliases[key]?.includes(normalize(header)) || normalize(header) === normalize(LEAD_IMPORT_FIELDS.find(field => field[0] === key)[1]));
    return [key, found < 0 ? '' : String(found)];
  }));
}

async function handleLeadImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('CSV is too large. Limit imports to 5 MB.', 'error'); return; }
  try {
    const rows = parseCsv(await file.text());
    if (rows.length > 301) throw new Error('Import up to 300 leads at a time to keep validation and sync reliable.');
    const headers = rows[0];
    pendingLeadImport = { headers, rows: rows.slice(1), mapping: guessLeadImportMapping(headers) };
    renderImportPreview();
    document.getElementById('import-preview-overlay').classList.add('show');
  } catch (error) {
    showToast(`CSV could not be read: ${error.message}`, 'error');
  }
}

function mappedImportRows() {
  if (!pendingLeadImport) return [];
  const mapped = pendingLeadImport.rows.map((cells, index) => {
    const lead = {};
    LEAD_IMPORT_FIELDS.forEach(([key]) => {
      const column = pendingLeadImport.mapping[key];
      if (column !== '') lead[key] = cells[Number(column)] || '';
    });
    const issues = [];
    if (!lead.bizName?.trim()) issues.push('Business name missing');
    if (!lead.dialer?.trim()) issues.push('Dialer name missing');
    if (!normalizedPhone(lead.phone1) || normalizedPhone(lead.phone1).length < 7) issues.push('Primary phone invalid');
    if (!lead.email1?.trim() || !isValidEmail(lead.email1)) issues.push('Primary email invalid');
    if (lead.status && !['Cold', 'Warm', 'Hot'].includes(lead.status)) issues.push('Unknown status');
    if (lead.stage && !STAGES.includes(lead.stage)) issues.push('Unknown stage');
    if (lead.price && !Number.isFinite(Number(lead.price))) issues.push('Price must be numeric');
    ['followupDate', 'lastContact'].forEach(field => {
      if (lead[field] && !isValidIsoDate(lead[field])) issues.push(`${field === 'followupDate' ? 'Follow-up' : 'Last contact'} date must be a real date in YYYY-MM-DD format`);
    });
    const duplicates = findPotentialLeadDuplicates(lead);
    if (duplicates.length) issues.push(`Possible duplicate: ${duplicates[0].bizName || duplicates[0].phone1}`);
    return { index, lead, issues, duplicate: duplicates.length > 0 };
  });
  mapped.forEach((record, index) => {
    if (record.issues.some(issue => issue.startsWith('Possible duplicate:'))) return;
    const phone = [record.lead.phone1, record.lead.phone2].map(normalizedPhone).filter(Boolean);
    const emails = [record.lead.email1, record.lead.email2].map(normalizedEmail).filter(Boolean);
    const earlier = mapped.slice(0, index).find(other => {
      const otherPhones = [other.lead.phone1, other.lead.phone2].map(normalizedPhone).filter(Boolean);
      const otherEmails = [other.lead.email1, other.lead.email2].map(normalizedEmail).filter(Boolean);
      return phone.some(value => otherPhones.includes(value)) || emails.some(value => otherEmails.includes(value));
    });
    if (earlier) {
      record.duplicate = true;
      record.issues.push(`Duplicate in CSV row ${earlier.index + 2}`);
    }
  });
  return mapped;
}

function renderImportPreview() {
  const { headers, mapping } = pendingLeadImport;
  const mappingRoot = document.getElementById('import-preview-mapping');
  mappingRoot.innerHTML = LEAD_IMPORT_FIELDS.map(([key, label]) => `
    <label>${escapeHtml(label)}
      <select data-import-field="${key}" onchange="updateImportMapping(this)">
        <option value="">Skip</option>
        ${headers.map((header, index) => `<option value="${index}" ${mapping[key] === String(index) ? 'selected' : ''}>${escapeHtml(header || `Column ${index + 1}`)}</option>`).join('')}
      </select>
    </label>
  `).join('');

  const records = mappedImportRows();
  const validCount = records.filter(row => row.issues.length === 0).length;
  document.getElementById('import-preview-summary').textContent = `${records.length} rows · ${validCount} ready · ${records.length - validCount} need review`;
  document.getElementById('import-preview-table').innerHTML = `
    <table><thead><tr><th>Import</th><th>Business</th><th>Phone</th><th>Email</th><th>Validation</th></tr></thead><tbody>
      ${records.map(({ index, lead, issues }) => `<tr>
        <td><input type="checkbox" data-import-row="${index}" ${issues.length ? '' : 'checked'} ${issues.length ? 'disabled' : ''} aria-label="Import row ${index + 1}"></td>
        <td>${escapeHtml(lead.bizName || '—')}</td><td>${escapeHtml(lead.phone1 || '—')}</td><td>${escapeHtml(lead.email1 || '—')}</td>
        <td class="${issues.length ? 'import-issue' : 'import-ready'}">${issues.length ? escapeHtml(issues.join('; ')) : 'Ready'}</td>
      </tr>`).join('')}
    </tbody></table>`;
  document.getElementById('import-confirm-button').disabled = validCount === 0;
}

function updateImportMapping(select) {
  pendingLeadImport.mapping[select.dataset.importField] = select.value;
  renderImportPreview();
}

function closeImportPreview() {
  document.getElementById('import-preview-overlay').classList.remove('show');
  pendingLeadImport = null;
}

function closeImportPreviewOnOverlay(event) {
  if (event.target === document.getElementById('import-preview-overlay')) closeImportPreview();
}

async function importPreviewRows() {
  if (!pendingLeadImport) return;
  const selected = new Set([...document.querySelectorAll('[data-import-row]:checked')].map(input => Number(input.dataset.importRow)));
  const records = mappedImportRows().filter(row => selected.has(row.index) && row.issues.length === 0);
  if (!records.length) return;
  if (!navigator.onLine) { showToast('You are offline. Reconnect before importing.', 'error'); return; }
  const button = document.getElementById('import-confirm-button');
  button.disabled = true;
  button.textContent = 'Importing…';
  let imported = 0;
  try {
    for (const { lead } of records) {
      if (findPotentialLeadDuplicates(lead).length) continue;
      const data = { ...lead, status: lead.status || 'Cold', stage: lead.stage || 'New Lead', dateAdded: today(), ownerUid: currentUid, ownerEmail: currentUserEmail };
      if (data.stage === 'Closed Won') data.closedDate = today();
      const ref = await leadsCol.add(data);
      imported += 1;
      await syncRevenueEntry(ref.id, data);
      await syncClientFromLead(ref.id, data);
    }
    closeImportPreview();
    showToast(`${imported} lead${imported === 1 ? '' : 's'} imported.`, 'success');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Import valid rows';
    showToast(`Import stopped after ${imported} rows: ${error.message || 'Check your connection and retry.'}`, 'error');
  }
}

function escapeIcs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function downloadFollowupsCalendar() {
  const scheduled = leads.filter(lead => !lead.archivedAt && lead.followupDate);
  if (!scheduled.length) { showToast('No active follow-ups to add to calendar.', 'error'); return; }
  const events = scheduled.map(lead => {
    const date = lead.followupDate.replace(/-/g, '');
    const nextDay = new Date(`${lead.followupDate}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const end = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, '0')}${String(nextDay.getDate()).padStart(2, '0')}`;
    return ['BEGIN:VEVENT', `UID:${lead.id}@rpm-crm`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${escapeIcs(`Follow up: ${lead.bizName}`)}`, `DESCRIPTION:${escapeIcs(`${lead.ownerName || ''} | ${lead.phone1 || ''} | ${lead.email1 || ''}`)}`, 'END:VEVENT'].join('\r\n');
  });
  downloadBlob(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RPM CRM//Follow-ups//EN', ...events, 'END:VCALENDAR'].join('\r\n'), 'text/calendar;charset=utf-8', `RPM_Followups_${today()}.ics`);
  showToast(`Calendar file downloaded with ${scheduled.length} follow-up${scheduled.length === 1 ? '' : 's'}.`, 'success');
}

