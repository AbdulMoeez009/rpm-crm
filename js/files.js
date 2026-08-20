/* ── Files (per-client, categorized, stored in Firebase Storage) ── */
let clientFiles = [];
let unsubscribeFiles = null;
const FILE_ICON = { Contracts:'📄', Invoices:'🧾', Logo:'🎨', 'Website Files':'🌐', Reports:'📊', Screenshots:'🖼️', Videos:'🎬', Credentials:'🔑', Documents:'📁' };

function startFilesListenerForClient(clientId) {
  if (unsubscribeFiles) { unsubscribeFiles(); unsubscribeFiles = null; }
  unsubscribeFiles = filesCol.where('clientId', '==', clientId).onSnapshot(
    snapshot => {
      clientFiles = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      clientFiles.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
      renderFilesList();
    },
    err => console.error(err)
  );
}

function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderFilesList() {
  const wrap = document.getElementById('cdp-files-list');
  if (!wrap) return; // drawer might have closed already

  if (clientFiles.length === 0) {
    wrap.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:10px 0;">No files uploaded yet.</div>`;
    return;
  }

  wrap.innerHTML = clientFiles.map(f => `
    <div style="display:flex;align-items:center;gap:8px;padding:9px 4px;border-bottom:1px solid var(--border);font-size:13px;">
      <span style="font-size:16px;">${FILE_ICON[f.category] || '📁'}</span>
      <div style="flex:1;min-width:0;">
        <a href="${f.url}" target="_blank" rel="noopener" style="font-weight:600;color:var(--text);text-decoration:none;word-break:break-all;">${escapeHtml(f.fileName)}</a>
        <div style="font-size:11px;color:var(--muted);">${f.category} · ${fmtFileSize(f.size)} · by ${escapeHtml(f.uploadedByName || '—')}</div>
      </div>
      <a href="${f.url}" target="_blank" rel="noopener" class="btn btn-sm btn-ghost">Open</a>
      <button class="btn-icon" onclick="deleteClientFile('${f.id}', '${f.storagePath}')" title="Delete file">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>
  `).join('');
}

async function uploadClientFile(clientId) {
  const input = document.getElementById('file-input');
  const category = document.getElementById('file-category').value;
  const btn = document.getElementById('file-upload-btn');
  const file = input.files[0];

  if (!file) { showToast('❌ Choose a file first', 'error'); return; }
  if (file.size > 25 * 1024 * 1024) { showToast('❌ File too large (max 25MB)', 'error'); return; }

  const storagePath = `clients/${clientId}/${category}/${Date.now()}_${file.name}`;
  btn.disabled = true;
  btn.textContent = '⏳ Uploading...';

  try {
    const ref = storage.ref(storagePath);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    await filesCol.add({
      clientId,
      category,
      fileName: file.name,
      size: file.size,
      url,
      storagePath,
      uploadedBy: currentUid,
      uploadedByName: currentUserEmail,
      uploadedAt: new Date().toISOString(),
    });
    input.value = '';
    showToast('File uploaded!', 'success');
  } catch (e) {
    showToast('❌ Upload failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⬆ Upload';
  }
}

async function deleteClientFile(fileId, storagePath) {
  if (!confirm('Delete this file? This cannot be undone.')) return;
  try {
    await storage.ref(storagePath).delete();
    await filesCol.doc(fileId).delete();
    showToast('File deleted.', 'error');
  } catch (e) {
    showToast('❌ Delete failed: ' + e.message, 'error');
  }
}

