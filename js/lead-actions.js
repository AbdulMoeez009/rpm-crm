/* ══════════════════════════════════════
   DELETE
══════════════════════════════════════ */
async function deleteLead(id) {
  if (!confirm('Delete this lead? This cannot be undone.')) return;
  try {
    await leadsCol.doc(id).delete();
    try { await revenueCol.doc(id).delete(); } catch (e) { /* fine if none existed */ }
    showToast('Lead deleted.', 'error');
  } catch (e) {
    showToast('❌ Delete fail: ' + e.message, 'error');
  }
}

/* ══════════════════════════════════════
   EXPORT TO CSV (opens in Excel)
══════════════════════════════════════ */
function exportCSV() {
  if (leads.length === 0) { showToast('No leads to export!', 'error'); return; }

  const headers = [
    'ID','Dialer Name','Closer Name','Business Name','Owner Name','Industry','City','Price',
    'Services','Phone (Primary)','Phone (Secondary)','Email (Primary)','Email (Secondary)',
    'Yelp URL','GMB URL','Website URL','Lead Status','Pipeline Stage',
    'Next Follow-Up Date','Last Contact Date','Closed Date','Notes','Date Added'
  ];

  const rows = leads.map(l => [
    l.id, l.dialer, l.closer, l.bizName, l.ownerName, l.industry, l.city, l.price,
    l.services, l.phone1, l.phone2, l.email1, l.email2,
    l.yelp, l.gmb, l.website, l.status, l.stage,
    l.followupDate, l.lastContact, l.closedDate, l.notes, l.dateAdded
  ].map(v => `"${String(v||'').replace(/"/g,'""')}"`)); // wrap in quotes for CSV safety

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RPM_CRM_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported to Excel!', 'success');
}

