// ─── Constants ────────────────────────────────────────────────
const CATS = {
  expense: [
    { id:'makan',      label:'Makan',      icon:'🍜' },
    { id:'transport',  label:'Transport',  icon:'🚗' },
    { id:'belanja',    label:'Belanja',    icon:'🛍️' },
    { id:'hiburan',    label:'Hiburan',    icon:'🎮' },
    { id:'kesehatan',  label:'Kesehatan',  icon:'💊' },
    { id:'tagihan',    label:'Tagihan',    icon:'📄' },
    { id:'pendidikan', label:'Pendidikan', icon:'📚' },
    { id:'lainnya',    label:'Lainnya',    icon:'📦' },
  ],
  income: [
    { id:'gaji',      label:'Gaji',      icon:'💼' },
    { id:'freelance', label:'Freelance', icon:'💻' },
    { id:'bisnis',    label:'Bisnis',    icon:'🏪' },
    { id:'investasi', label:'Investasi', icon:'📈' },
    { id:'hadiah',    label:'Hadiah',    icon:'🎁' },
    { id:'lainnya',   label:'Lainnya',   icon:'📦' },
  ]
};
const COLORS = ['#d4f54e','#4ef5b0','#4eb8f5','#f5a64e','#f54e6a','#c44ef5','#f54ec4','#4ef5e0'];
const ALL_CATS = [...CATS.expense, ...CATS.income];
const catInfo = id => ALL_CATS.find(c => c.id === id) || { label: id, icon: '📦' };

// ─── State ────────────────────────────────────────────────────
let txs = [];
let cfg = { scriptUrl: '' };
let currentType = 'expense';
let selectedCat = '';
let currentPage = 'beranda';

// ─── Boot ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  loadStorage();
  initTheme();
  setDefaultDate();
  renderCats();
  updateBalance();
  renderRecent();
  setupNav();
  setupTypeToggle();
  setupForm();
  setupSettings();
  updateConnBadge();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  if (cfg.scriptUrl) await loadFromSheets();

  // Auto-refresh setiap 15 detik
  setInterval(async () => {
    if (cfg.scriptUrl) {
      console.log('[Money] auto-refresh:', new Date().toLocaleTimeString());
      await loadFromSheets();
    }
  }, 15000);

  // Refresh saat tab aktif kembali
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && cfg.scriptUrl) loadFromSheets();
  });

  // Refresh saat window fokus kembali
  window.addEventListener('focus', () => {
    if (cfg.scriptUrl) loadFromSheets();
  });
});

// ─── Storage ──────────────────────────────────────────────────
// ─── Cookie helpers (untuk scriptUrl agar tahan hard refresh) ──
function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Strict';
}
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : '';
}

function loadStorage() {
  try {
    txs = JSON.parse(localStorage.getItem('txs') || '[]');
    cfg = JSON.parse(localStorage.getItem('cfg') || '{}');
    cfg = { scriptUrl: '', ...cfg };
    // Fallback ke cookie jika scriptUrl kosong
    if (!cfg.scriptUrl) cfg.scriptUrl = getCookie('money_script_url');
  } catch {
    txs = [];
    cfg = { scriptUrl: getCookie('money_script_url') || '' };
  }
}
function persist() {
  localStorage.setItem('txs', JSON.stringify(txs));
  localStorage.setItem('cfg', JSON.stringify(cfg));
  // Simpan scriptUrl di cookie (tahan 365 hari, tidak hilang saat hard refresh)
  if (cfg.scriptUrl) setCookie('money_script_url', cfg.scriptUrl, 365);
}

// ─── Theme ────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
}
function applyTheme(theme) {
  const html = document.documentElement;
  const btn  = document.getElementById('btn-theme');
  if (theme === 'light') {
    html.classList.add('light');
    if (btn) btn.textContent = '☀️';
    document.querySelector('meta[name="theme-color"]').setAttribute('content','#f5f4f0');
  } else {
    html.classList.remove('light');
    if (btn) btn.textContent = '🌙';
    document.querySelector('meta[name="theme-color"]').setAttribute('content','#0d0d10');
  }
  localStorage.setItem('theme', theme);
  updateThemeButtons(theme);
}
function updateThemeButtons(theme) {
  const darkBtn  = document.getElementById('theme-dark');
  const lightBtn = document.getElementById('theme-light');
  if (!darkBtn) return;
  const active = 'border-color: var(--lime); background: var(--lime-d); color: var(--lime);';
  darkBtn.style.cssText  = theme === 'dark'  ? active : '';
  lightBtn.style.cssText = theme === 'light' ? active : '';
}

// ─── Format helpers ───────────────────────────────────────────
const fmt = v => 'Rp ' + Math.abs(Math.round(v)).toLocaleString('id-ID');
const fmtDate = s => new Date(s).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
const fmtMonth = s => { const d = new Date(s+'-01'); return d.toLocaleDateString('id-ID', { month:'long', year:'numeric' }); };

// ─── Balance ──────────────────────────────────────────────────
function updateBalance() {
  const inc = txs.filter(t => t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp = txs.filter(t => t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const bal = inc - exp;
  const el = document.getElementById('balance-val');
  el.textContent = (bal < 0 ? '- ' : '') + fmt(bal);
  el.classList.toggle('negative', bal < 0);
  document.getElementById('total-in').textContent  = fmt(inc);
  document.getElementById('total-out').textContent = fmt(exp);
}

// ─── Navigation ───────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });
}
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'riwayat') renderHistory();
  if (page === 'laporan') renderCharts();
}

// ─── Type Toggle ──────────────────────────────────────────────
function setupTypeToggle() {
  document.getElementById('tbtn-expense').addEventListener('click', () => setType('expense'));
  document.getElementById('tbtn-income').addEventListener('click', () => setType('income'));
}
function setType(type) {
  currentType = type;
  selectedCat = '';
  document.getElementById('tbtn-expense').classList.toggle('active', type==='expense');
  document.getElementById('tbtn-income').classList.toggle('active', type==='income');
  const btn = document.getElementById('btn-save');
  btn.className = 'btn-save ' + type;
  btn.textContent = '+ Simpan ' + (type==='expense' ? 'Pengeluaran' : 'Pemasukan');
  renderCats();
}

// ─── Categories ───────────────────────────────────────────────
function renderCats() {
  const grid = document.getElementById('cat-grid');
  grid.innerHTML = CATS[currentType].map(c => `
    <button class="cat-btn ${c.id===selectedCat?'sel '+currentType:''}" data-cat="${c.id}">
      <span class="ci">${c.icon}</span>${c.label}
    </button>`).join('');
  grid.querySelectorAll('.cat-btn').forEach(b =>
    b.addEventListener('click', () => { selectedCat = b.dataset.cat; renderCats(); })
  );
}

// ─── Default date ─────────────────────────────────────────────
function setDefaultDate() {
  document.getElementById('inp-date').value = new Date().toISOString().split('T')[0];
}

// ─── Save Transaction ─────────────────────────────────────────
function setupForm() {
  document.getElementById('btn-save').addEventListener('click', saveTransaction);
}
async function saveTransaction() {
  const amount = parseFloat(document.getElementById('inp-amount').value);
  const date   = document.getElementById('inp-date').value;
  const note   = document.getElementById('inp-note').value.trim();

  if (!amount || amount <= 0) return toast('Masukkan jumlah yang valid', 'error');
  if (!selectedCat)           return toast('Pilih kategori dulu', 'error');
  if (!date)                  return toast('Pilih tanggal', 'error');

  const ci = catInfo(selectedCat);
  const tx = {
    id: Date.now().toString(),
    type: currentType, amount, category: selectedCat,
    label: ci.label, icon: ci.icon, note, date, synced: false
  };

  txs.unshift(tx);
  persist();
  updateBalance();
  renderRecent();

  document.getElementById('inp-amount').value = '';
  document.getElementById('inp-note').value   = '';
  selectedCat = '';
  renderCats();
  toast('✓ Tersimpan!', 'success');

  if (cfg.scriptUrl) syncOne(tx);
}

// ─── Recent list ──────────────────────────────────────────────
function renderRecent() {
  renderTxList(document.getElementById('recent-list'), txs.slice(0, 5));
}

// ─── History ──────────────────────────────────────────────────
function renderHistory() {
  populateFilters();
  const month = document.getElementById('f-month').value;
  const cat   = document.getElementById('f-cat').value;
  let list = [...txs];
  if (month) list = list.filter(t => t.date.startsWith(month));
  if (cat)   list = list.filter(t => t.category === cat);
  renderTxList(document.getElementById('history-list'), list);

  document.getElementById('f-month').onchange = renderHistory;
  document.getElementById('f-cat').onchange   = renderHistory;
}

function populateFilters() {
  const months = [...new Set(txs.map(t => t.date.slice(0,7)))].sort().reverse();
  const mSel = document.getElementById('f-month');
  const cur  = mSel.value;
  mSel.innerHTML = '<option value="">Semua Bulan</option>' +
    months.map(m => `<option value="${m}" ${m===cur?'selected':''}>${fmtMonth(m)}</option>`).join('');

  const cats = [...new Set(txs.map(t => t.category))];
  const cSel = document.getElementById('f-cat');
  const curC = cSel.value;
  cSel.innerHTML = '<option value="">Semua Kategori</option>' +
    cats.map(c => { const i = catInfo(c); return `<option value="${c}" ${c===curC?'selected':''}>${i.icon} ${i.label}</option>`; }).join('');
}

// ─── Tx list renderer ─────────────────────────────────────────
function renderTxList(container, list) {
  if (!list.length) { container.innerHTML = '<div class="empty">Belum ada transaksi.</div>'; return; }
  container.innerHTML = list.map(tx => `
    <div class="tx-item">
      <div class="tx-ico ${tx.type}">${tx.icon}</div>
      <div class="tx-body">
        <div class="tx-cat">${tx.label}</div>
        <div class="tx-meta">${tx.note || tx.date}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amt ${tx.type}">${tx.type==='expense'?'- ':'+'}${fmt(tx.amount)}</div>
        <div class="tx-date">${fmtDate(tx.date)}</div>
      </div>
      <button class="tx-del" data-id="${tx.id}">✕</button>
    </div>`).join('');
  container.querySelectorAll('.tx-del').forEach(b =>
    b.addEventListener('click', async () => {
      const deletedId = b.dataset.id;
      txs = txs.filter(t => t.id !== deletedId);
      persist(); updateBalance(); renderRecent();
      if (currentPage === 'riwayat') renderHistory();
      if (cfg.scriptUrl) deleteFromSheets(deletedId);
    })
  );
}

// ─── Charts ───────────────────────────────────────────────────
function renderCharts() { renderPie(); renderBar(); }

function renderPie() {
  const canvas = document.getElementById('c-pie');
  const W = canvas.offsetWidth || 320;
  canvas.width = W;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, 180);

  const exp = txs.filter(t => t.type==='expense');
  const totals = {};
  exp.forEach(t => totals[t.label] = (totals[t.label]||0) + t.amount);
  const labels = Object.keys(totals), data = Object.values(totals);
  const total  = data.reduce((a,b)=>a+b, 0);

  const legend = document.getElementById('pie-legend');
  if (!total) {
    ctx.fillStyle = '#4a4858'; ctx.font = '13px Syne'; ctx.textAlign = 'center';
    ctx.fillText('Belum ada pengeluaran', W/2, 90);
    legend.innerHTML = ''; return;
  }

  const cx = 90, cy = 88, r = 70;
  let angle = -Math.PI / 2;
  data.forEach((v, i) => {
    const slice = (v/total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath(); ctx.fillStyle = COLORS[i % COLORS.length]; ctx.fill();
    angle += slice;
  });
  // Donut
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.52, 0, Math.PI*2);
  ctx.fillStyle = '#14141a'; ctx.fill();
  // Center text
  ctx.fillStyle = '#eeeae2'; ctx.textAlign = 'center';
  ctx.font = '500 11px Syne'; ctx.fillText('Total', cx, cy - 5);
  ctx.font = '500 12px JetBrains Mono'; ctx.fillStyle = '#f54e6a';
  ctx.fillText(total >= 1e6 ? 'Rp '+(total/1e6).toFixed(1)+'jt' : fmt(total), cx, cy+12);

  // Side list
  const listX = 180;
  labels.slice(0,5).forEach((lbl, i) => {
    const pct = Math.round(data[i]/total*100);
    ctx.fillStyle = COLORS[i%COLORS.length];
    ctx.fillRect(listX, 22 + i*30, 8, 8);
    ctx.fillStyle = '#8a8799'; ctx.font = '10px Syne'; ctx.textAlign = 'left';
    ctx.fillText(lbl, listX+14, 30 + i*30);
    ctx.fillStyle = '#eeeae2'; ctx.font = '500 10px JetBrains Mono';
    ctx.fillText(pct+'%', listX+14, 42 + i*30);
  });

  legend.innerHTML = labels.map((l,i) => `
    <div class="leg-item">
      <div class="leg-dot" style="background:${COLORS[i%COLORS.length]}"></div>${l}
    </div>`).join('');
}

function renderBar() {
  const canvas = document.getElementById('c-bar');
  const W = canvas.offsetWidth || 320;
  canvas.width = W;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, 150);

  const months = [];
  for (let i=5; i>=0; i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i);
    months.push(d.toISOString().slice(0,7));
  }
  const inc = months.map(m => txs.filter(t=>t.type==='income'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0));
  const exp = months.map(m => txs.filter(t=>t.type==='expense'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0));
  const max = Math.max(...inc, ...exp, 1);

  const pL=10, pR=10, pB=24, pT=14;
  const cW = W-pL-pR, cH = 150-pB-pT;
  const gW = cW / months.length;
  const bW = gW * 0.3;

  months.forEach((m, i) => {
    const x = pL + i*gW + gW*0.08;
    const iH = (inc[i]/max)*cH, eH = (exp[i]/max)*cH;
    // Income
    ctx.fillStyle = '#4ef5b0';
    ctx.fillRect(x, pT+cH-iH, bW, iH);
    // Expense
    ctx.fillStyle = '#f54e6a';
    ctx.fillRect(x+bW+2, pT+cH-eH, bW, eH);
    // Label
    const d = new Date(m+'-01');
    ctx.fillStyle = '#4a4858'; ctx.font = '9px Syne'; ctx.textAlign = 'center';
    ctx.fillText(d.toLocaleDateString('id-ID',{month:'short'}), x+bW, 150-6);
  });

  // Legend
  ctx.fillStyle='#4ef5b0'; ctx.fillRect(W-110,5,8,8);
  ctx.fillStyle='#8a8799'; ctx.font='9px Syne'; ctx.textAlign='left';
  ctx.fillText('Pemasukan', W-98,13);
  ctx.fillStyle='#f54e6a'; ctx.fillRect(W-110,19,8,8);
  ctx.fillStyle='#8a8799'; ctx.fillText('Pengeluaran', W-98,27);
}

// ─── Google Sheets Sync (via Apps Script) ─────────────────────
async function syncAll() {
  const unsynced = txs.filter(t => !t.synced);
  if (!unsynced.length) return toast('Semua data sudah tersinkronisasi ✓');
  if (!cfg.scriptUrl) return toast('Atur Script URL dulu di Pengaturan', 'error');

  setSyncDot('');
  try {
    const rows = unsynced.map(tx => [
      tx.date, tx.type==='income'?'Pemasukan':'Pengeluaran',
      tx.label, tx.amount, tx.note||'', tx.id
    ]);
    const res = await fetch(cfg.scriptUrl.trim(), {
      method: 'POST',
      body: JSON.stringify({ rows })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal');
    txs = txs.map(t => unsynced.find(u=>u.id===t.id) ? {...t,synced:true} : t);
    persist();
    setSyncDot('ok');
    toast(`✓ ${unsynced.length} transaksi disinkronkan!`, 'success');
  } catch(e) {
    setSyncDot('err');
    toast('Sync gagal: '+e.message, 'error');
  }
}

async function syncOne(tx) {
  if (!cfg.scriptUrl) return;
  try {
    const rows = [[tx.date, tx.type==='income'?'Pemasukan':'Pengeluaran', tx.label, tx.amount, tx.note||'', tx.id]];
    const res = await fetch(cfg.scriptUrl.trim(), {
      method: 'POST',
      body: JSON.stringify({ rows })
    });
    const data = await res.json();
    if (data.success) {
      txs = txs.map(t => t.id===tx.id ? {...t,synced:true} : t);
      persist(); setSyncDot('ok');
    }
  } catch { setSyncDot('err'); }
}


function setSyncDot(state) {
  const dot = document.getElementById('sync-dot');
  dot.className = 'sync-dot' + (state ? ' '+state : '');
}

// ─── Settings ─────────────────────────────────────────────────
function btn(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
function setupSettings() {
  btn('btn-settings', openSettings);
  btn('close-settings', closeSettings);
  btn('btn-save-settings', saveSettings);
  btn('btn-sync', syncAll);
  btn('btn-export-csv', exportCSV);
  btn('btn-clear', clearData);
  btn('btn-load-sheets', async () => { closeSettings(); await loadFromSheets(); });
  btn('btn-theme', () => {
    const isLight = document.documentElement.classList.contains('light');
    applyTheme(isLight ? 'dark' : 'light');
  });
  btn('theme-dark', () => applyTheme('dark'));
  btn('theme-light', () => applyTheme('light'));

  // Prefill
  document.getElementById('inp-scripturl').value = cfg.scriptUrl || '';

  // Sync theme button active state
  updateThemeButtons(localStorage.getItem('theme') || 'dark');
}

function openSettings()  { document.getElementById('settings-panel').classList.add('open'); }
function closeSettings() { document.getElementById('settings-panel').classList.remove('open'); }

function saveSettings() {
  cfg.scriptUrl = document.getElementById('inp-scripturl').value.trim();
  persist();
  updateConnBadge();
  toast('✓ Pengaturan disimpan!', 'success');
}

function updateConnBadge() {
  const el = document.getElementById('conn-badge');
  if (cfg.scriptUrl) {
    el.textContent = '● Terhubung';
    el.className = 'conn-badge';
  } else {
    el.textContent = 'Belum terhubung';
    el.className = 'conn-badge none';
  }
}

// ─── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  const header = ['Tanggal','Tipe','Kategori','Jumlah (Rp)','Catatan'];
  const rows = txs.map(t => [t.date, t.type==='income'?'Pemasukan':'Pengeluaran', t.label, t.amount, t.note||'']);
  const csv  = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `money-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('✓ CSV diunduh!', 'success');
}

// ─── Clear data ───────────────────────────────────────────────
function clearData() {
  if (!confirm('Yakin ingin menghapus semua data lokal?')) return;
  txs = []; persist(); updateBalance(); renderRecent(); closeSettings();
  toast('Data lokal dihapus.');
}

// ─── Toast ────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' '+type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ─── Load from Sheets ─────────────────────────────────────────
// Sheets adalah sumber kebenaran utama — selalu replace data lokal
async function loadFromSheets() {
  if (!cfg.scriptUrl) return;
  try {
    const res  = await fetch(cfg.scriptUrl.trim() + '?t=' + Date.now());
    const data = await res.json();
    if (!data.success) return;

    const allCats = [...CATS.expense, ...CATS.income];

    // Replace data lokal sepenuhnya dengan data dari Sheets
    txs = (data.rows || []).map(r => {
      const cat = allCats.find(c => c.label === r.label) || { id: r.label, icon: '📦' };
      return { ...r, category: cat.id, icon: cat.icon, synced: true };
    });

    persist();
    updateBalance();
    renderRecent();
    if (currentPage === 'riwayat') renderHistory();
    if (currentPage === 'laporan') renderCharts();
    setSyncDot('ok');
  } catch(e) {
    console.error('loadFromSheets error:', e);
    setSyncDot('err');
  }
}

// ─── Delete from Sheets ───────────────────────────────────────
async function deleteFromSheets(id) {
  try {
    await fetch(cfg.scriptUrl.trim(), {
      method: 'POST',
      body: JSON.stringify({ action: 'delete', id })
    });
  } catch(e) {
    console.error('Gagal hapus dari Sheets:', e);
  }
}
