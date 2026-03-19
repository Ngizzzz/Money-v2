// ═══════════════════════════════════════════════════════════════
// MONEY PWA — app.js  (with Wallet feature)
// ═══════════════════════════════════════════════════════════════

// ─── Categories ───────────────────────────────────────────────
const CATS = {
  expense: [
    {id:'makan',label:'Makan',icon:'🍜'},{id:'transport',label:'Transport',icon:'🚗'},
    {id:'belanja',label:'Belanja',icon:'🛍️'},{id:'hiburan',label:'Hiburan',icon:'🎮'},
    {id:'kesehatan',label:'Kesehatan',icon:'💊'},{id:'tagihan',label:'Tagihan',icon:'📄'},
    {id:'pendidikan',label:'Pendidikan',icon:'📚'},{id:'lainnya',label:'Lainnya',icon:'📦'},
  ],
  income: [
    {id:'gaji',label:'Gaji',icon:'💼'},{id:'freelance',label:'Freelance',icon:'💻'},
    {id:'bisnis',label:'Bisnis',icon:'🏪'},{id:'investasi',label:'Investasi',icon:'📈'},
    {id:'hadiah',label:'Hadiah',icon:'🎁'},{id:'lainnya',label:'Lainnya',icon:'📦'},
  ]
};
const COLORS = ['#d4f54e','#4ef5b0','#4eb8f5','#f5a64e','#f54e6a','#c44ef5','#f54ec4','#4ef5e0'];
const ALL_CATS = [...CATS.expense, ...CATS.income];
const catInfo = id => ALL_CATS.find(c => c.id === id) || {label:id, icon:'📦'};

// ─── State ────────────────────────────────────────────────────
let txs      = [];
let wallets  = []; // [{id, name, icon, items:[{id,name,balance,counted}]}]
let cfg      = {scriptUrl:''};
let currentType = 'expense';
let selectedCat = '';
let currentPage = 'beranda';

// ─── Boot ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  loadStorage();
  initTheme();
  setDefaultDate();
  renderCats();
  populateWalletSelects();
  updateBalance();
  renderRecent();
  setupNav();
  setupTypeToggle();
  setupForm();
  setupSettings();
  setupWalletPage();
  setupModals();
  setupEditTxModal();
  setupLaporanFilter();
  updateConnBadge();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  setupPWAInstall();
  if (cfg.scriptUrl) await loadFromSheets();
  setInterval(async () => {
    if (cfg.scriptUrl && !modalOpen && !isFormActive()) {
      console.log('[Money] auto-refresh:', new Date().toLocaleTimeString());
      await loadFromSheets();
    }
  }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && cfg.scriptUrl && !modalOpen && !isFormActive()) loadFromSheets(); });
  window.addEventListener('focus', () => { if (cfg.scriptUrl && !modalOpen && !isFormActive()) loadFromSheets(); });
});

// ─── Cookie helpers ───────────────────────────────────────────
function setCookie(name, value, days) {
  const d = new Date(); d.setTime(d.getTime() + days*86400000);
  document.cookie = name+'='+encodeURIComponent(value)+';expires='+d.toUTCString()+';path=/;SameSite=Strict';
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )'+name+'=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

// ─── Storage ──────────────────────────────────────────────────
function loadStorage() {
  try {
    txs     = JSON.parse(localStorage.getItem('txs')     || '[]');
    wallets = JSON.parse(localStorage.getItem('wallets') || '[]');
    cfg     = JSON.parse(localStorage.getItem('cfg')     || '{}');
    cfg     = {scriptUrl:'', ...cfg};
    if (!cfg.scriptUrl) cfg.scriptUrl = getCookie('money_script_url');
  } catch { txs=[]; wallets=[]; cfg={scriptUrl:getCookie('money_script_url')||''}; }
}
function persist() {
  localStorage.setItem('txs',     JSON.stringify(txs));
  localStorage.setItem('wallets', JSON.stringify(wallets));
  localStorage.setItem('cfg',     JSON.stringify(cfg));
  if (cfg.scriptUrl) setCookie('money_script_url', cfg.scriptUrl, 365);
}

// ─── Format ───────────────────────────────────────────────────
const fmt    = v => 'Rp ' + Math.abs(Math.round(v)).toLocaleString('id-ID');
const fmtDate= s => new Date(s).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
const fmtMon = s => { const d=new Date(s+'-01'); return d.toLocaleDateString('id-ID',{month:'long',year:'numeric'}); };

// ─── Balance ──────────────────────────────────────────────────
function calcWalletBalance(item) {
  // Saldo item = saldo awal + semua transaksi yang melibatkan item ini
  let bal = item.initialBalance || 0;
  txs.forEach(tx => {
    if (tx.type === 'income'   && tx.walletId === item.id) bal += tx.amount;
    if (tx.type === 'expense'  && tx.walletId === item.id) bal -= tx.amount;
    if (tx.type === 'transfer' && tx.walletTo   === item.id) bal += tx.amount;
    if (tx.type === 'transfer' && tx.walletFrom === item.id) bal -= tx.amount;
    if (tx.type === 'adjustment' && tx.walletId === item.id) bal += tx.amount; // bisa +/-
  });
  return bal;
}

function updateBalance() {
  const inc  = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp  = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

  // Saldo bersih = total saldo dompet yang dihitung (jika ada dompet)
  // Jika belum ada dompet, gunakan inc - exp
  let bal;
  const countedItems = wallets.flatMap(cat => cat.items.filter(i => i.counted !== false));
  if (countedItems.length > 0) {
    bal = countedItems.reduce((s, item) => s + calcWalletBalance(item), 0);
  } else {
    bal = inc - exp;
  }

  const el = document.getElementById('balance-val');
  el.textContent = (bal<0?'- ':'')+fmt(bal);
  el.classList.toggle('negative', bal<0);
  document.getElementById('total-in').textContent  = fmt(inc);
  document.getElementById('total-out').textContent = fmt(exp);
}

// ─── Wallet helpers ───────────────────────────────────────────
function allWalletItems() {
  return wallets.flatMap(cat => cat.items.map(item => ({...item, catName:cat.name, catIcon:cat.icon})));
}
function findWalletItem(id) {
  for (const cat of wallets) {
    const item = cat.items.find(i => i.id === id);
    if (item) return item;
  }
  return null;
}

// ─── Populate wallet selects ──────────────────────────────────
function populateWalletSelects() {
  const items = allWalletItems();
  const makeOptions = (skipId='', withBlank=false) => 
    (withBlank ? '<option value="">-- Pilih --</option>' : '<option value="" disabled selected>Pilih dompet...</option>') +
    wallets.map(cat => `<optgroup label="${cat.icon} ${cat.name}">` +
      cat.items.filter(i=>i.id!==skipId).map(i =>
        `<option value="${i.id}">${i.name} (${fmt(calcWalletBalance(i))})</option>`
      ).join('') + '</optgroup>'
    ).join('');

  const single = document.getElementById('inp-wallet');
  const from   = document.getElementById('inp-wallet-from');
  const to     = document.getElementById('inp-wallet-to');
  if (single) single.innerHTML = makeOptions('', false);
  if (from)   from.innerHTML   = makeOptions('', true);
  if (to)     to.innerHTML     = makeOptions('', true);
  if (from) from.addEventListener('change', () => {
    if (to) to.innerHTML = makeOptions(from.value);
  });
}

// ─── Navigation ───────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.addEventListener('click', () => switchPage(b.dataset.page))
  );
}
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page===page));
  if (page==='riwayat') renderHistory();
  if (page==='laporan') renderCharts();
  if (page==='dompet')  renderWalletPage();
}

// ─── Type Toggle ──────────────────────────────────────────────
function setupTypeToggle() {
  btn('tbtn-expense',  () => setType('expense'));
  btn('tbtn-income',   () => setType('income'));
  btn('tbtn-transfer', () => setType('transfer'));
}
function setType(type) {
  currentType = type;
  selectedCat = '';
  ['expense','income','transfer'].forEach(t => {
    document.getElementById('tbtn-'+t).classList.toggle('active', t===type);
  });
  document.getElementById('tbtn-expense').classList.toggle('expense', true);
  document.getElementById('tbtn-income').classList.toggle('income', true);
  document.getElementById('tbtn-transfer').classList.toggle('transfer', true);

  const catSection    = document.getElementById('cat-section');
  const singleRow     = document.getElementById('wallet-single-row');
  const transferRows  = document.getElementById('wallet-transfer-rows');

  if (type === 'transfer') {
    catSection.style.display   = 'none';
    singleRow.style.display    = 'none';
    transferRows.style.display = 'block';
  } else {
    catSection.style.display   = 'block';
    singleRow.style.display    = 'flex';
    transferRows.style.display = 'none';
  }

  const saveBtn = document.getElementById('btn-save');
  saveBtn.className = 'btn-save '+type;
  saveBtn.textContent = type==='expense' ? '+ Simpan Pengeluaran' :
                        type==='income'  ? '+ Simpan Pemasukan' :
                                           '↔ Simpan Transfer';
  renderCats();
  populateWalletSelects();
}

// ─── Categories ───────────────────────────────────────────────
function renderCats() {
  const grid = document.getElementById('cat-grid');
  const cats = CATS[currentType] || [];
  grid.innerHTML = cats.map(c => `
    <button class="cat-btn ${c.id===selectedCat?'sel '+currentType:''}" data-cat="${c.id}">
      <span class="ci">${c.icon}</span>${c.label}
    </button>`).join('');
  grid.querySelectorAll('.cat-btn').forEach(b =>
    b.addEventListener('click', () => { selectedCat=b.dataset.cat; renderCats(); })
  );
}

function setDefaultDate() {
  const d = new Date().toISOString().split('T')[0];
  document.getElementById('inp-date').value = d;
  const ad = document.getElementById('adjust-date');
  if (ad) ad.value = d;
}

// ─── Save Transaction ─────────────────────────────────────────
function setupForm() { btn('btn-save', saveTransaction); }

async function saveTransaction() {
  const amount   = parseFloat(document.getElementById('inp-amount').value);
  const date     = document.getElementById('inp-date').value;
  const note     = document.getElementById('inp-note').value.trim();
  const walletId = document.getElementById('inp-wallet')?.value || '';
  const wFrom    = document.getElementById('inp-wallet-from')?.value || '';
  const wTo      = document.getElementById('inp-wallet-to')?.value || '';

  if (!amount || amount<=0) return toast('Masukkan jumlah yang valid','error');
  if (!date) return toast('Pilih tanggal','error');
  if (currentType !== 'transfer' && !selectedCat) return toast('Pilih kategori','error');
  if (currentType !== 'transfer' && !walletId) return toast('Pilih dompet','error');
  if (currentType === 'transfer' && (!wFrom || !wTo)) return toast('Pilih dompet asal & tujuan','error');
  if (currentType === 'transfer' && wFrom===wTo) return toast('Dompet asal & tujuan harus berbeda','error');

  let tx;
  if (currentType === 'transfer') {
    const fromItem = findWalletItem(wFrom);
    const toItem   = findWalletItem(wTo);
    tx = {
      id: Date.now().toString(), type:'transfer', amount, date, note,
      label: `Transfer: ${fromItem?.name||wFrom} → ${toItem?.name||wTo}`,
      icon: '↔', walletFrom: wFrom, walletTo: wTo, synced: false
    };
  } else {
    const ci = catInfo(selectedCat);
    tx = {
      id: Date.now().toString(), type:currentType, amount, date, note,
      category:selectedCat, label:ci.label, icon:ci.icon,
      walletId, synced:false
    };
  }

  txs.unshift(tx);
  persist();
  updateBalance();
  renderRecent();
  populateWalletSelects();
  if (currentPage==='dompet') renderWalletPage();

  document.getElementById('inp-amount').value = '';
  document.getElementById('inp-note').value   = '';
  document.getElementById('inp-wallet').value = '';
  document.getElementById('inp-wallet-from').value = '';
  document.getElementById('inp-wallet-to').value   = '';
  selectedCat = '';
  renderCats();
  toast('✓ Tersimpan!','success');
  if (cfg.scriptUrl) syncTxToSheets([tx]);
  syncWalletBalancesAfterTx();
}

// ─── Render helpers ───────────────────────────────────────────
function renderRecent() {
  const sorted = [...txs].sort((a,b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id);
  });
  renderTxList(document.getElementById('recent-list'), sorted.slice(0,5));
}
function renderHistory() {
  populateFilters();
  const month = document.getElementById('f-month').value;
  const cat   = document.getElementById('f-cat').value;
  let list    = [...txs];
  if (month) list = list.filter(t=>t.date.startsWith(month));
  if (cat)   list = list.filter(t=>t.category===cat||t.type===cat);
  // Urutkan dari terbaru ke terlama
  list.sort((a,b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.id.localeCompare(a.id); // jika tanggal sama, urut by ID (waktu input)
  });
  renderTxList(document.getElementById('history-list'), list);
  document.getElementById('f-month').onchange = renderHistory;
  document.getElementById('f-cat').onchange   = renderHistory;
}
function populateFilters() {
  const months = [...new Set(txs.map(t=>t.date.slice(0,7)))].sort().reverse();
  const mSel = document.getElementById('f-month'); const cur=mSel.value;
  mSel.innerHTML = '<option value="">Semua Bulan</option>'+months.map(m=>`<option value="${m}" ${m===cur?'selected':''}>${fmtMon(m)}</option>`).join('');
  const cSel = document.getElementById('f-cat'); const curC=cSel.value;
  const cats = [...new Set(txs.filter(t=>t.category).map(t=>t.category))];
  cSel.innerHTML = '<option value="">Semua Kategori</option>'+cats.map(c=>{const i=catInfo(c);return `<option value="${c}" ${c===curC?'selected':''}>${i.icon} ${i.label}</option>`;}).join('');
}
function renderTxList(container, list) {
  if (!list.length) { container.innerHTML='<div class="empty">Belum ada transaksi.</div>'; return; }
  container.innerHTML = list.map(tx => {
    const walletLabel = tx.type==='transfer' ? '' :
      (tx.walletId ? ` · ${findWalletItem(tx.walletId)?.name||''}` : '');
    return `<div class="tx-item" data-tx-id="${tx.id}" style="cursor:pointer">
      <div class="tx-ico ${tx.type}">${tx.icon||'📦'}</div>
      <div class="tx-body">
        <div class="tx-cat">${tx.label}</div>
        <div class="tx-meta">${tx.note||tx.date}${walletLabel}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amt ${tx.type}">${tx.type==='expense'?'- ':tx.type==='income'?'+':'↔'}${fmt(tx.amount)}</div>
        <div class="tx-date">${fmtDate(tx.date)}</div>
      </div>
      <button class="tx-del" data-id="${tx.id}" title="Hapus">✕</button>
    </div>`;
  }).join('');
  // Click on tx item to view/edit
  container.querySelectorAll('.tx-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.tx-del')) return;
      openEditTx(item.dataset.txId);
    });
  });
  container.querySelectorAll('.tx-del').forEach(b =>
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
      txs = txs.filter(t=>t.id!==id);
      persist(); updateBalance(); renderRecent();
      populateWalletSelects();
      if (currentPage==='riwayat') renderHistory();
      if (currentPage==='dompet')  renderWalletPage();
      if (cfg.scriptUrl) deleteTxFromSheets(id);
      syncWalletBalancesAfterTx();
    })
  );
}

// ─── Wallet Page ──────────────────────────────────────────────
function setupWalletPage() {
  btn('btn-add-wallet-cat', () => openModalWcat());
}

function renderWalletPage() {
  let totalCounted = 0, totalAll = 0;
  wallets.forEach(cat => cat.items.forEach(item => {
    const bal = calcWalletBalance(item);
    totalAll += bal;
    if (item.counted !== false) totalCounted += bal;
  }));
  document.getElementById('w-total-counted').textContent = fmt(totalCounted);
  document.getElementById('w-total-all').textContent     = fmt(totalAll);

  const container = document.getElementById('wallet-cats-list');
  if (!wallets.length) { container.innerHTML='<div class="empty">Belum ada dompet. Tambah kategori dulu!</div>'; return; }

  container.innerHTML = wallets.map(cat => {
    const catTotal = cat.items.reduce((s,i)=>s+calcWalletBalance(i),0);
    return `<div class="wallet-cat-card">
      <div class="wallet-cat-hdr" data-catid="${cat.id}">
        <div class="wallet-cat-hdr-left">
          <span class="wallet-cat-icon">${cat.icon||'📁'}</span>
          <div class="wallet-cat-info">
            <div class="wallet-cat-name">${cat.name}</div>
            <div class="wallet-cat-total">${fmt(catTotal)}</div>
          </div>
        </div>
        <div class="wallet-cat-actions">
          <button class="wallet-item-btn" data-edit-cat="${cat.id}" title="Edit">✏️</button>
          <button class="wallet-item-btn del" data-del-cat="${cat.id}" title="Hapus">🗑️</button>
          <span class="wcat-toggle" data-toggle="${cat.id}">▼</span>
        </div>
      </div>
      <div class="wallet-items" id="wcat-items-${cat.id}">
        ${cat.items.map(item => {
          const bal = calcWalletBalance(item);
          const counted = item.counted !== false;
          return `<div class="wallet-item">
            <div class="wallet-item-left">
              <div class="wallet-item-name">${item.name}</div>
              <div class="wallet-item-sub">Saldo awal: ${fmt(item.initialBalance||0)}</div>
            </div>
            <div class="wallet-item-right">
              <div class="wallet-item-bal ${bal<0?'negative':''}">${fmt(bal)}</div>
              <span class="counted-badge ${counted?'yes':'no'}">${counted?'Dihitung':'Tidak'}</span>
              <button class="wallet-item-btn" data-adjust="${item.id}" title="Sesuaikan saldo">⚖️</button>
              <button class="wallet-item-btn" data-edit-item="${item.id}" data-cat="${cat.id}" title="Edit">✏️</button>
              <button class="wallet-item-btn del" data-del-item="${item.id}" data-cat="${cat.id}" title="Hapus">🗑️</button>
            </div>
          </div>`;
        }).join('')}
        <button class="wallet-add-item-btn" data-add-item="${cat.id}">＋ Tambah ${cat.name}</button>
      </div>
    </div>`;
  }).join('');

  // Toggle expand/collapse — tetap terbuka sampai diklik lagi
  container.querySelectorAll('.wallet-cat-hdr').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const id    = hdr.dataset.catid;
      const items = document.getElementById('wcat-items-'+id);
      const tog   = hdr.querySelector('.wcat-toggle');
      const isOpen = items.classList.contains('open');
      // Tutup semua dulu
      container.querySelectorAll('.wallet-items').forEach(el => el.classList.remove('open'));
      container.querySelectorAll('.wcat-toggle').forEach(el => el.classList.remove('open'));
      // Kalau sebelumnya tertutup, buka yang ini
      if (!isOpen) {
        items.classList.add('open');
        tog.classList.add('open');
      }
    });
  });

  // Edit category
  container.querySelectorAll('[data-edit-cat]').forEach(b =>
    b.addEventListener('click', () => openModalWcat(b.dataset.editCat))
  );
  // Delete category
  container.querySelectorAll('[data-del-cat]').forEach(b =>
    b.addEventListener('click', () => {
      if (!confirm('Hapus kategori ini beserta semua dompet di dalamnya?')) return;
      wallets = wallets.filter(c=>c.id!==b.dataset.delCat);
      persist(); renderWalletPage(); populateWalletSelects();
      toast('Kategori dihapus');
      if (cfg.scriptUrl) syncWalletsToSheets();
      if (cfg.scriptUrl) syncWalletsToSheets();
    })
  );
  // Add item
  container.querySelectorAll('[data-add-item]').forEach(b =>
    b.addEventListener('click', () => openModalWitem(b.dataset.addItem))
  );
  // Edit item
  container.querySelectorAll('[data-edit-item]').forEach(b =>
    b.addEventListener('click', () => openModalWitem(b.dataset.cat, b.dataset.editItem))
  );
  // Delete item
  container.querySelectorAll('[data-del-item]').forEach(b =>
    b.addEventListener('click', () => {
      if (!confirm('Hapus dompet ini?')) return;
      const cat = wallets.find(c=>c.id===b.dataset.cat);
      if (cat) cat.items = cat.items.filter(i=>i.id!==b.dataset.delItem);
      persist(); renderWalletPage(); populateWalletSelects();
      toast('Dompet dihapus');
      if (cfg.scriptUrl) syncWalletsToSheets();
      if (cfg.scriptUrl) syncWalletsToSheets();
    })
  );
  // Adjust balance
  container.querySelectorAll('[data-adjust]').forEach(b =>
    b.addEventListener('click', () => openModalAdjust(b.dataset.adjust))
  );
}

// ─── Modals ───────────────────────────────────────────────────
// Toggle counted button
function setCountedToggle(val) {
  const hiddenInput = document.getElementById('witem-counted');
  const yesBtn = document.getElementById('witem-counted-yes');
  const noBtn  = document.getElementById('witem-counted-no');
  if (!hiddenInput) return;
  hiddenInput.value = val ? 'true' : 'false';
  yesBtn.className = 'toggle-btn' + (val  ? ' active yes-btn' : '');
  noBtn.className  = 'toggle-btn' + (!val ? ' active no-btn'  : '');
}

function setupModals() {
  btn('close-modal-wcat',   () => closeModal('modal-wcat'));
  btn('close-modal-witem',  () => closeModal('modal-witem'));
  btn('close-modal-adjust', () => closeModal('modal-adjust'));
  btn('btn-save-wcat',   saveWalletCat);
  btn('btn-save-witem',  saveWalletItem);
  btn('btn-save-adjust', saveAdjustBalance);
  document.querySelectorAll('.modal-overlay').forEach(m =>
    m.addEventListener('click', e => { if (e.target===m) m.classList.remove('open'); })
  );
}
let modalOpen = false;

// Cek apakah user sedang aktif mengisi form transaksi
function isFormActive() {
  const amount = document.getElementById('inp-amount');
  const note   = document.getElementById('inp-note');
  const wFrom  = document.getElementById('inp-wallet-from');
  const wTo    = document.getElementById('inp-wallet-to');
  const wSingle= document.getElementById('inp-wallet');
  // Aktif jika ada nilai di amount/note ATAU dropdown dompet sudah dipilih
  if (amount && amount.value && parseFloat(amount.value) > 0) return true;
  if (note   && note.value.trim()) return true;
  if (wFrom  && wFrom.value)  return true;
  if (wTo    && wTo.value)    return true;
  if (wSingle && wSingle.value) return true;
  return false;
}
function openModal(id)  {
  document.getElementById(id).classList.add('open');
  modalOpen = true;
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  // Cek apakah masih ada modal lain yang terbuka
  modalOpen = document.querySelectorAll('.modal-overlay.open').length > 0;
}

function openModalWcat(editId='') {
  document.getElementById('wcat-edit-id').value = editId;
  if (editId) {
    const cat = wallets.find(c=>c.id===editId);
    document.getElementById('wcat-name').value = cat?.name||'';
    document.getElementById('wcat-icon').value = cat?.icon||'';
    document.getElementById('modal-wcat-title').textContent = 'Edit Kategori';
  } else {
    document.getElementById('wcat-name').value = '';
    document.getElementById('wcat-icon').value = '';
    document.getElementById('modal-wcat-title').textContent = 'Tambah Kategori Dompet';
  }
  openModal('modal-wcat');
}
function saveWalletCat() {
  const name   = document.getElementById('wcat-name').value.trim();
  const icon   = document.getElementById('wcat-icon').value.trim() || '📁';
  const editId = document.getElementById('wcat-edit-id').value;
  if (!name) return toast('Masukkan nama kategori','error');
  if (editId) {
    const cat = wallets.find(c=>c.id===editId);
    if (cat) { cat.name=name; cat.icon=icon; }
  } else {
    wallets.push({id:Date.now().toString(), name, icon, items:[]});
  }
  persist(); renderWalletPage(); populateWalletSelects();
  closeModal('modal-wcat');
  toast('✓ Kategori disimpan','success');
  if (cfg.scriptUrl) syncWalletsToSheets();
}

function openModalWitem(catId, editId='') {
  document.getElementById('witem-cat-id').value  = catId;
  document.getElementById('witem-edit-id').value = editId;
  if (editId) {
    const item = findWalletItem(editId);
    document.getElementById('witem-name').value    = item?.name||'';
    document.getElementById('witem-balance').value = item?.initialBalance||0;
    setCountedToggle(item?.counted !== false);
    document.getElementById('modal-witem-title').textContent = 'Edit Dompet';
  } else {
    document.getElementById('witem-name').value    = '';
    document.getElementById('witem-balance').value = '';
    setCountedToggle(true);
    document.getElementById('modal-witem-title').textContent = 'Tambah Dompet';
  }
  openModal('modal-witem');
}
function saveWalletItem() {
  const catId  = document.getElementById('witem-cat-id').value;
  const editId = document.getElementById('witem-edit-id').value;
  const name   = document.getElementById('witem-name').value.trim();
  const bal    = parseFloat(document.getElementById('witem-balance').value) || 0;
  const counted= document.getElementById('witem-counted').value !== 'false';
  if (!name) return toast('Masukkan nama dompet','error');
  const cat = wallets.find(c=>c.id===catId);
  if (!cat) return;
  if (editId) {
    const item = cat.items.find(i=>i.id===editId);
    if (item) { item.name=name; item.initialBalance=bal; item.counted=counted; }
  } else {
    cat.items.push({id:Date.now().toString(), name, initialBalance:bal, counted});
  }
  persist(); renderWalletPage(); populateWalletSelects();
  closeModal('modal-witem');
  toast('✓ Dompet disimpan','success');
  if (cfg.scriptUrl) syncWalletsToSheets();
}

function openModalAdjust(walletId) {
  const item = findWalletItem(walletId);
  if (!item) return;
  const currentBal = calcWalletBalance(item);
  document.getElementById('adjust-wallet-id').value            = walletId;
  document.getElementById('adjust-wallet-name').textContent    = item.name;
  document.getElementById('adjust-wallet-current').textContent = fmt(currentBal);
  // Prefill dengan saldo sekarang — user tinggal ubah ke nilai baru
  document.getElementById('adjust-new-balance').value = Math.round(currentBal);
  document.getElementById('adjust-date').value        = new Date().toISOString().split('T')[0];
  openModal('modal-adjust');
  // Fokus ke input agar mudah diedit
  setTimeout(() => {
    const inp = document.getElementById('adjust-new-balance');
    if (inp) { inp.focus(); inp.select(); }
  }, 300);
}
function saveAdjustBalance() {
  const walletId  = document.getElementById('adjust-wallet-id').value;
  const newBal    = parseFloat(document.getElementById('adjust-new-balance').value);
  const date      = document.getElementById('adjust-date').value;
  if (isNaN(newBal)) return toast('Masukkan saldo baru','error');
  const item      = findWalletItem(walletId);
  if (!item) return;
  const currentBal= calcWalletBalance(item);
  const diff      = newBal - currentBal;
  if (diff === 0) { closeModal('modal-adjust'); return toast('Saldo tidak berubah'); }

  // Catat selisih sebagai transaksi penyesuaian
  const tx = {
    id:      Date.now().toString(),
    type:    'adjustment',
    amount:  diff,  // bisa positif atau negatif
    date,
    label:   `Penyesuaian Saldo: ${item.name}`,
    icon:    '⚖️',
    walletId,
    note:    `Saldo lama: ${fmt(currentBal)} → Saldo baru: ${fmt(newBal)}`,
    synced:  false
  };
  txs.unshift(tx);
  persist(); updateBalance(); renderRecent();
  renderWalletPage(); populateWalletSelects();
  closeModal('modal-adjust');
  toast(`✓ Selisih ${diff>0?'+':''}${fmt(diff)} dicatat`,'success');
  if (cfg.scriptUrl) syncTxToSheets([tx]);
  syncWalletBalancesAfterTx();
}

// ─── Charts ───────────────────────────────────────────────────
let activeChart = 'expense-pie';

function renderCharts() {
  setupChartTabs();
  updateLaporanFilterInfo();
  renderActiveChart();
}

function setupChartTabs() {
  const tabs = document.querySelectorAll('.chart-tab');
  if (!tabs.length || tabs[0]._bound) return;
  tabs.forEach(tab => {
    tab._bound = true;
    tab.addEventListener('click', () => {
      activeChart = tab.dataset.chart;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.chart-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('chart-'+activeChart).classList.add('active');
      renderActiveChart();
    });
  });
}

function renderActiveChart() {
  if (activeChart === 'expense-pie') renderDonut('expense');
  if (activeChart === 'income-pie')  renderDonut('income');
  if (activeChart === 'wallet-pie')  renderWalletDonut();
  if (activeChart === 'cashflow')    renderBar();
}

function renderDonut(type) {
  const isExpense = type === 'expense';
  const canvasId  = isExpense ? 'c-pie-expense' : 'c-pie-income';
  const legendId  = isExpense ? 'legend-expense' : 'legend-income';
  const accentColor = isExpense ? '#f54e6a' : '#4ef5b0';
  const emptyMsg  = isExpense ? 'Belum ada pengeluaran' : 'Belum ada pemasukan';

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const W = canvas.offsetWidth || 320; canvas.width = W;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,W,180);

  const filtered = getFilteredTxsForLaporan().filter(t => t.type === type);
  const totals = {};
  filtered.forEach(t => totals[t.label] = (totals[t.label]||0) + t.amount);
  const labels = Object.keys(totals), data = Object.values(totals);
  const total  = data.reduce((a,b)=>a+b,0);
  const legend = document.getElementById(legendId);

  if (!total) {
    ctx.fillStyle='#4a4858'; ctx.font='13px Syne'; ctx.textAlign='center';
    ctx.fillText(emptyMsg, W/2, 90); legend.innerHTML=''; return;
  }

  const cx=90, cy=88, r=70; let angle=-Math.PI/2;
  data.forEach((v,i) => {
    const slice=(v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+slice); ctx.closePath();
    ctx.fillStyle=COLORS[i%COLORS.length]; ctx.fill(); angle+=slice;
  });
  // Donut hole
  const bgColor = document.documentElement.classList.contains('light') ? '#f5f4f0' : '#0d0d10';
  ctx.beginPath(); ctx.arc(cx,cy,r*0.52,0,Math.PI*2); ctx.fillStyle=bgColor; ctx.fill();
  // Center text
  ctx.fillStyle='#eeeae2'; ctx.textAlign='center'; ctx.font='500 11px Syne';
  ctx.fillText(isExpense?'Keluar':'Masuk', cx, cy-5);
  ctx.font='500 12px JetBrains Mono'; ctx.fillStyle=accentColor;
  ctx.fillText(total>=1e6?'Rp '+(total/1e6).toFixed(1)+'jt':fmt(total), cx, cy+12);
  // Side list
  labels.slice(0,5).forEach((lbl,i) => {
    const pct = Math.round(data[i]/total*100);
    ctx.fillStyle=COLORS[i%COLORS.length]; ctx.fillRect(W-130,22+i*30,8,8);
    ctx.fillStyle='#8a8799'; ctx.font='10px Syne'; ctx.textAlign='left'; ctx.fillText(lbl,W-118,30+i*30);
    ctx.fillStyle='#eeeae2'; ctx.font='500 10px JetBrains Mono'; ctx.fillText(pct+'%',W-118,42+i*30);
  });
  legend.innerHTML = labels.map((l,i)=>`<div class="leg-item"><div class="leg-dot" style="background:${COLORS[i%COLORS.length]}"></div>${l}</div>`).join('');
}

function renderWalletDonut() {
  const canvas = document.getElementById('c-pie-wallet');
  if (!canvas) return;
  const W = canvas.offsetWidth||320; canvas.width=W;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,W,180);
  const legend = document.getElementById('legend-wallet');

  const items = allWalletItems();
  if (!items.length) {
    ctx.fillStyle='#4a4858'; ctx.font='13px Syne'; ctx.textAlign='center';
    ctx.fillText('Belum ada dompet',W/2,90); legend.innerHTML=''; return;
  }

  const labels=[], data=[];
  items.forEach(item => {
    const bal = calcWalletBalance(item);
    if (bal > 0) { labels.push(item.name); data.push(bal); }
  });

  if (!labels.length) {
    ctx.fillStyle='#4a4858'; ctx.font='13px Syne'; ctx.textAlign='center';
    ctx.fillText('Semua saldo dompet 0',W/2,90); legend.innerHTML=''; return;
  }

  const total = data.reduce((a,b)=>a+b,0);
  const cx=90, cy=88, r=70; let angle=-Math.PI/2;
  data.forEach((v,i) => {
    const slice=(v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+slice); ctx.closePath();
    ctx.fillStyle=COLORS[i%COLORS.length]; ctx.fill(); angle+=slice;
  });
  const bgColor = document.documentElement.classList.contains('light') ? '#f5f4f0' : '#0d0d10';
  ctx.beginPath(); ctx.arc(cx,cy,r*0.52,0,Math.PI*2); ctx.fillStyle=bgColor; ctx.fill();
  ctx.fillStyle='#eeeae2'; ctx.textAlign='center'; ctx.font='500 11px Syne'; ctx.fillText('Total',cx,cy-5);
  ctx.font='500 12px JetBrains Mono'; ctx.fillStyle='#d4f54e';
  ctx.fillText(total>=1e6?'Rp '+(total/1e6).toFixed(1)+'jt':fmt(total),cx,cy+12);
  labels.slice(0,5).forEach((lbl,i) => {
    const pct=Math.round(data[i]/total*100);
    ctx.fillStyle=COLORS[i%COLORS.length]; ctx.fillRect(W-130,22+i*30,8,8);
    ctx.fillStyle='#8a8799'; ctx.font='10px Syne'; ctx.textAlign='left'; ctx.fillText(lbl,W-118,30+i*30);
    ctx.fillStyle='#eeeae2'; ctx.font='500 10px JetBrains Mono'; ctx.fillText(pct+'%',W-118,42+i*30);
  });
  legend.innerHTML = labels.map((l,i)=>`<div class="leg-item"><div class="leg-dot" style="background:${COLORS[i%COLORS.length]}"></div>${l}</div>`).join('');
}

function renderBar() {
  const canvas=document.getElementById('c-bar');
  if (!canvas) return;
  const W=canvas.offsetWidth||320; canvas.width=W;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,W,150);
  // Bar chart gunakan semua data atau filter sesuai pilihan
  const filteredForBar = getFilteredTxsForLaporan();
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);months.push(d.toISOString().slice(0,7));}
  const inc=months.map(m=>filteredForBar.filter(t=>t.type==='income'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0));
  const exp=months.map(m=>filteredForBar.filter(t=>t.type==='expense'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0));
  const max=Math.max(...inc,...exp,1);
  const pL=10,pR=10,pB=24,pT=14,cW=W-pL-pR,cH=150-pB-pT,gW=cW/months.length,bW=gW*0.3;
  months.forEach((m,i)=>{
    const x=pL+i*gW+gW*0.08,iH=(inc[i]/max)*cH,eH=(exp[i]/max)*cH;
    ctx.fillStyle='#4ef5b0'; ctx.fillRect(x,pT+cH-iH,bW,iH);
    ctx.fillStyle='#f54e6a'; ctx.fillRect(x+bW+2,pT+cH-eH,bW,eH);
    const d=new Date(m+'-01');
    ctx.fillStyle='#4a4858'; ctx.font='9px Syne'; ctx.textAlign='center';
    ctx.fillText(d.toLocaleDateString('id-ID',{month:'short'}),x+bW,150-6);
  });
  ctx.fillStyle='#4ef5b0'; ctx.fillRect(W-110,5,8,8); ctx.fillStyle='#8a8799'; ctx.font='9px Syne'; ctx.textAlign='left'; ctx.fillText('Pemasukan',W-98,13);
  ctx.fillStyle='#f54e6a'; ctx.fillRect(W-110,19,8,8); ctx.fillStyle='#8a8799'; ctx.fillText('Pengeluaran',W-98,27);
}

// ─── Google Sheets Sync ───────────────────────────────────────
async function syncAll() {
  const unsynced = txs.filter(t=>!t.synced);
  if (!unsynced.length) return toast('Semua data sudah tersinkronisasi ✓');
  if (!cfg.scriptUrl)   return toast('Atur Script URL dulu','error');
  setSyncDot('');
  await syncTxToSheets(unsynced);
}

async function syncTxToSheets(list) {
  if (!cfg.scriptUrl || !list.length) return;
  try {
    const rows = list.map(tx => {
      // Cari nama kategori dompet untuk nama sheet
      let walletSheetName = '';
      if (tx.walletId) {
        for (const cat of wallets) {
          if (cat.items.find(i=>i.id===tx.walletId)) { walletSheetName=cat.name; break; }
        }
      } else if (tx.walletFrom) {
        for (const cat of wallets) {
          if (cat.items.find(i=>i.id===tx.walletFrom)) { walletSheetName=cat.name; break; }
        }
      }
      return [
        tx.date,
        tx.type==='income'?'Pemasukan':tx.type==='expense'?'Pengeluaran':tx.type==='transfer'?'Transfer':'Penyesuaian',
        tx.label, tx.amount, tx.note||'', tx.id,
        tx.walletId||tx.walletFrom||'', tx.walletTo||'',
        walletSheetName
      ];
    });
    const res  = await fetch(cfg.scriptUrl.trim(),{method:'POST',body:JSON.stringify({action:'add',rows})});
    const data = await res.json();
    if (data.success) {
      const ids = new Set(list.map(t=>t.id));
      txs = txs.map(t=>ids.has(t.id)?{...t,synced:true}:t);
      persist(); setSyncDot('ok');
    }
  } catch { setSyncDot('err'); }
}

async function deleteTxFromSheets(id) {
  if (!cfg.scriptUrl) return;
  try { await fetch(cfg.scriptUrl.trim(),{method:'POST',body:JSON.stringify({action:'delete',id})}); }
  catch(e) { console.error(e); }
}

function setSyncDot(state) {
  const dot=document.getElementById('sync-dot');
  dot.className='sync-dot'+(state?' '+state:'');
}

// ─── Load from Sheets ─────────────────────────────────────────
async function loadFromSheets() {
  if (!cfg.scriptUrl) return;
  try {
    const res  = await fetch(cfg.scriptUrl.trim()+'?t='+Date.now());
    const data = await res.json();
    if (!data.success) return;
    txs = (data.rows||[]).map(r=>{
      const cat=ALL_CATS.find(c=>c.label===r.label)||{id:r.label,icon:'📦'};
      return {...r,category:cat.id,icon:r.icon||cat.icon,synced:true};
    });
    // Load wallets if returned from Sheets
    if (data.wallets && data.wallets.length) {
      // Simpan wallet dari Sheets tapi JANGAN overwrite currentBalance
      // currentBalance selalu dihitung fresh dari calcWalletBalance
      wallets = data.wallets.map(cat => ({
        ...cat,
        items: cat.items.map(item => {
          // Pertahankan initialBalance dari Sheets, tapi hapus currentBalance
          const { currentBalance, ...rest } = item;
          return rest;
        })
      }));
    }
    persist();
    updateBalance();
    renderRecent();
    populateWalletSelects();
    if (currentPage==='riwayat') renderHistory();
    if (currentPage==='laporan') renderCharts();
    if (currentPage==='dompet')  renderWalletPage();
    setSyncDot('ok');
  } catch(e) { console.error('loadFromSheets:',e); setSyncDot('err'); }
}

// ─── Sync Wallets to Sheets ──────────────────────────────────
async function syncWalletsToSheets() {
  if (!cfg.scriptUrl || !wallets.length) return;
  try {
    const walletsWithBal = wallets.map(cat => ({
      ...cat,
      items: cat.items.map(item => ({
        ...item,
        currentBalance: Math.round(calcWalletBalance(item))
      }))
    }));
    const res = await fetch(cfg.scriptUrl.trim(), {
      method: 'POST',
      body: JSON.stringify({ action: 'sync_wallets', wallets: walletsWithBal })
    });
    const data = await res.json();
    if (!data.success) console.error('syncWalletsToSheets error:', data.error);
  } catch(e) { console.error('syncWalletsToSheets:', e); }
}

// Sync wallet balances setiap kali transaksi berubah
async function syncWalletBalancesAfterTx() {
  if (cfg.scriptUrl && wallets.length) {
    await syncWalletsToSheets();
  }
}

// ─── Settings ─────────────────────────────────────────────────
function btn(id, fn) { const el=document.getElementById(id); if(el) el.addEventListener('click',fn); }
function setupSettings() {
  btn('btn-settings',     openSettings);
  btn('close-settings',   closeSettings);
  btn('btn-save-settings',saveSettings);
  btn('btn-sync',         syncAll);
  btn('btn-load-sheets',  async()=>{ closeSettings(); await loadFromSheets(); });
  btn('btn-export-csv',   exportCSV);
  btn('btn-clear',        clearData);
  btn('btn-theme',        ()=>applyTheme(document.documentElement.classList.contains('light')?'dark':'light'));
  btn('theme-dark',       ()=>applyTheme('dark'));
  btn('theme-light',      ()=>applyTheme('light'));
  const el=document.getElementById('inp-scripturl');
  if(el) el.value=cfg.scriptUrl||'';
  updateThemeButtons(localStorage.getItem('theme')||'dark');
}
function openSettings()  { document.getElementById('settings-panel').classList.add('open'); }
function closeSettings() { document.getElementById('settings-panel').classList.remove('open'); }
function saveSettings() {
  cfg.scriptUrl=document.getElementById('inp-scripturl').value.trim();
  persist(); updateConnBadge(); toast('✓ Pengaturan disimpan!','success');
}
function updateConnBadge() {
  const el=document.getElementById('conn-badge');
  if(cfg.scriptUrl){el.textContent='● Terhubung';el.className='conn-badge';}
  else{el.textContent='Belum terhubung';el.className='conn-badge none';}
}

// ─── Theme ────────────────────────────────────────────────────
function initTheme() { applyTheme(localStorage.getItem('theme')||'dark'); }
function applyTheme(theme) {
  const html=document.documentElement, btn=document.getElementById('btn-theme');
  if(theme==='light'){html.classList.add('light');if(btn)btn.textContent='☀️';document.querySelector('meta[name="theme-color"]').setAttribute('content','#f5f4f0');}
  else{html.classList.remove('light');if(btn)btn.textContent='🌙';document.querySelector('meta[name="theme-color"]').setAttribute('content','#0d0d10');}
  localStorage.setItem('theme',theme);
  updateThemeButtons(theme);
}
function updateThemeButtons(theme) {
  const d=document.getElementById('theme-dark'),l=document.getElementById('theme-light');
  if(!d) return;
  const a='border-color:var(--lime);background:var(--lime-d);color:var(--lime)';
  d.style.cssText=theme==='dark'?a:''; l.style.cssText=theme==='light'?a:'';
}

// ─── Sync Wallets to Sheets ──────────────────────────────────


// ─── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  const header=['Tanggal','Tipe','Kategori','Jumlah (Rp)','Catatan','Dompet'];
  const rows=txs.map(t=>[t.date,t.type,t.label,t.amount,t.note||'',t.walletId?findWalletItem(t.walletId)?.name||'':'']);
  const csv=[header,...rows].map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`money-${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); toast('✓ CSV diunduh!','success');
}

// ─── Clear data ───────────────────────────────────────────────
function clearData() {
  if(!confirm('Hapus semua data lokal?')) return;
  txs=[]; wallets=[]; persist(); updateBalance(); renderRecent();
  populateWalletSelects(); closeSettings(); toast('Data lokal dihapus.');
}

// ─── Toast ────────────────────────────────────────────────────
let toastTimer;
function toast(msg,type='') {
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast show'+(type?' '+type:'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

// ─── Edit Transaction ──────────────────────────────────────────
let editTxType = 'expense';
let editTxCat  = '';

function openEditTx(txId) {
  const tx = txs.find(t => t.id === txId);
  if (!tx) return;

  editTxType = tx.type;
  editTxCat  = tx.category || '';

  document.getElementById('tx-edit-id').value       = txId;
  document.getElementById('tx-edit-amount').value   = tx.amount;
  document.getElementById('tx-edit-date').value     = tx.date;
  document.getElementById('tx-edit-note').value     = tx.note || '';
  document.getElementById('modal-tx-title').textContent = tx.type === 'transfer' ? 'Edit Transfer' : 'Edit Transaksi';

  // Set type toggle
  ['expense','income','transfer'].forEach(t => {
    const b = document.getElementById('tx-tbtn-'+t);
    if (b) b.classList.toggle('active', t === tx.type);
  });

  // Show/hide sections
  const catSection     = document.getElementById('tx-edit-cat-section');
  const walletSingle   = document.getElementById('tx-edit-wallet-single');
  const walletTransfer = document.getElementById('tx-edit-wallet-transfer');
  if (tx.type === 'transfer') {
    catSection.style.display     = 'none';
    walletSingle.style.display   = 'none';
    walletTransfer.style.display = 'block';
  } else {
    catSection.style.display     = 'block';
    walletSingle.style.display   = 'flex';
    walletTransfer.style.display = 'none';
  }

  // Populate wallet selects
  const makeOpts = (skipId='') => wallets.map(cat =>
    `<optgroup label="${cat.icon} ${cat.name}">` +
    cat.items.filter(i=>i.id!==skipId).map(i =>
      `<option value="${i.id}">${i.name}</option>`
    ).join('') + '</optgroup>'
  ).join('');

  const wSingle = document.getElementById('tx-edit-wallet');
  const wFrom   = document.getElementById('tx-edit-wallet-from');
  const wTo     = document.getElementById('tx-edit-wallet-to');
  if (wSingle) { wSingle.innerHTML = '<option value="" disabled>Pilih dompet...</option>' + makeOpts(); wSingle.value = tx.walletId || ''; }
  if (wFrom)   { wFrom.innerHTML   = '<option value="" disabled>Pilih...</option>' + makeOpts(); wFrom.value = tx.walletFrom || ''; }
  if (wTo)     { wTo.innerHTML     = '<option value="" disabled>Pilih...</option>' + makeOpts(); wTo.value = tx.walletTo || ''; }

  // Render categories
  renderEditCatGrid(tx.type, tx.category);

  openModal('modal-tx-edit');
}

function renderEditCatGrid(type, selectedCatId) {
  const grid = document.getElementById('tx-edit-cat-grid');
  if (!grid) return;
  const cats = CATS[type] || [];
  grid.innerHTML = cats.map(c => `
    <button class="cat-btn ${c.id===selectedCatId?'sel '+type:''}" data-cat="${c.id}">
      <span class="ci">${c.icon}</span>${c.label}
    </button>`).join('');
  grid.querySelectorAll('.cat-btn').forEach(b => {
    b.addEventListener('click', () => {
      editTxCat = b.dataset.cat;
      renderEditCatGrid(editTxType, editTxCat);
    });
  });
}

function setupEditTxModal() {
  btn('close-modal-tx-edit', () => closeModal('modal-tx-edit'));
  btn('btn-save-tx-edit',    saveEditTx);

  // Type toggle in edit modal
  ['expense','income','transfer'].forEach(t => {
    btn('tx-tbtn-'+t, () => {
      editTxType = t;
      editTxCat  = '';
      ['expense','income','transfer'].forEach(x => {
        const b = document.getElementById('tx-tbtn-'+x);
        if (b) b.classList.toggle('active', x===t);
      });
      const catSection     = document.getElementById('tx-edit-cat-section');
      const walletSingle   = document.getElementById('tx-edit-wallet-single');
      const walletTransfer = document.getElementById('tx-edit-wallet-transfer');
      if (t === 'transfer') {
        catSection.style.display     = 'none';
        walletSingle.style.display   = 'none';
        walletTransfer.style.display = 'block';
      } else {
        catSection.style.display     = 'block';
        walletSingle.style.display   = 'flex';
        walletTransfer.style.display = 'none';
      }
      renderEditCatGrid(t, '');
    });
  });
}

async function saveEditTx() {
  const txId   = document.getElementById('tx-edit-id').value;
  const amount = parseFloat(document.getElementById('tx-edit-amount').value);
  const date   = document.getElementById('tx-edit-date').value;
  const note   = document.getElementById('tx-edit-note').value.trim();
  const wallet = document.getElementById('tx-edit-wallet')?.value || '';
  const wFrom  = document.getElementById('tx-edit-wallet-from')?.value || '';
  const wTo    = document.getElementById('tx-edit-wallet-to')?.value || '';

  if (!amount || amount <= 0) return toast('Masukkan jumlah yang valid','error');
  if (!date) return toast('Pilih tanggal','error');
  if (editTxType !== 'transfer' && !editTxCat) return toast('Pilih kategori','error');
  if (editTxType !== 'transfer' && !wallet) return toast('Pilih dompet','error');
  if (editTxType === 'transfer' && (!wFrom || !wTo)) return toast('Pilih dompet asal & tujuan','error');
  if (editTxType === 'transfer' && wFrom === wTo) return toast('Dompet asal & tujuan harus berbeda','error');

  const oldTx = txs.find(t => t.id === txId);
  if (!oldTx) return;

  let updatedTx;
  if (editTxType === 'transfer') {
    const fromItem = findWalletItem(wFrom);
    const toItem   = findWalletItem(wTo);
    updatedTx = { ...oldTx, type:'transfer', amount, date, note,
      label: `Transfer: ${fromItem?.name||wFrom} → ${toItem?.name||wTo}`,
      icon: '↔', walletFrom: wFrom, walletTo: wTo };
  } else {
    const ci = catInfo(editTxCat);
    updatedTx = { ...oldTx, type: editTxType, amount, date, note,
      category: editTxCat, label: ci.label, icon: ci.icon,
      walletId: wallet, synced: false };
  }

  txs = txs.map(t => t.id === txId ? updatedTx : t);
  persist(); updateBalance(); renderRecent(); populateWalletSelects();
  if (currentPage === 'riwayat') renderHistory();
  if (currentPage === 'dompet')  renderWalletPage();
  closeModal('modal-tx-edit');
  toast('✓ Transaksi diperbarui!','success');

  // Sync to Sheets
  if (cfg.scriptUrl) {
    await updateTxInSheets(updatedTx);
    syncWalletBalancesAfterTx();
  }
}

async function updateTxInSheets(tx) {
  if (!cfg.scriptUrl) return;
  try {
    const row = [
      tx.date,
      tx.type==='income'?'Pemasukan':tx.type==='expense'?'Pengeluaran':tx.type==='transfer'?'Transfer':'Penyesuaian',
      tx.label, tx.amount, tx.note||'', tx.id,
      tx.walletId||tx.walletFrom||'', tx.walletTo||''
    ];
    await fetch(cfg.scriptUrl.trim(), {
      method: 'POST',
      body: JSON.stringify({ action: 'update', id: tx.id, row })
    });
  } catch(e) { console.error('updateTxInSheets:', e); }
}

// ─── Laporan Filter ───────────────────────────────────────────
let laporanPeriod   = 'all';
let laporanDateFrom = '';
let laporanDateTo   = '';

function setupLaporanFilter() {
  document.querySelectorAll('.lf-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      laporanPeriod = tab.dataset.period;
      document.querySelectorAll('.lf-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const customRange = document.getElementById('laporan-custom-range');
      if (customRange) customRange.style.display = laporanPeriod === 'custom' ? 'flex' : 'none';
      updateLaporanFilterInfo();
      renderCharts();
    });
  });

  const fromInput = document.getElementById('laporan-date-from');
  const toInput   = document.getElementById('laporan-date-to');
  if (fromInput) fromInput.addEventListener('change', () => {
    laporanDateFrom = fromInput.value;
    updateLaporanFilterInfo();
    renderCharts();
  });
  if (toInput) toInput.addEventListener('change', () => {
    laporanDateTo = toInput.value;
    updateLaporanFilterInfo();
    renderCharts();
  });
}

function updateLaporanFilterInfo() {
  const el = document.getElementById('laporan-filter-info');
  if (!el) return;
  const now = new Date();
  if (laporanPeriod === 'month') {
    el.textContent = now.toLocaleDateString('id-ID', {month:'long', year:'numeric'});
  } else if (laporanPeriod === 'year') {
    el.textContent = 'Tahun ' + now.getFullYear();
  } else if (laporanPeriod === 'custom') {
    if (laporanDateFrom && laporanDateTo)
      el.textContent = fmtDate(laporanDateFrom) + ' – ' + fmtDate(laporanDateTo);
    else el.textContent = 'Pilih rentang tanggal';
  } else {
    el.textContent = 'Semua waktu';
  }
}

function getFilteredTxsForLaporan() {
  const now = new Date();
  return txs.filter(tx => {
    if (laporanPeriod === 'month') {
      return tx.date.startsWith(now.toISOString().slice(0,7));
    } else if (laporanPeriod === 'year') {
      return tx.date.startsWith(String(now.getFullYear()));
    } else if (laporanPeriod === 'custom') {
      if (laporanDateFrom && tx.date < laporanDateFrom) return false;
      if (laporanDateTo   && tx.date > laporanDateTo)   return false;
      return true;
    }
    return true; // 'all'
  });
}

// ─── PWA Install ──────────────────────────────────────────────
let deferredPrompt = null;

function setupPWAInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.classList.add('show');
  });

  btn('pwa-install-btn', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.classList.remove('show');
    if (outcome === 'accepted') toast('✓ Aplikasi berhasil diinstall!','success');
  });

  btn('pwa-banner-close', () => {
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.classList.remove('show');
  });

  // iOS Safari — tidak support beforeinstallprompt, tampilkan instruksi manual
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isInStandaloneMode) {
    const banner = document.getElementById('pwa-banner');
    if (banner) {
      banner.querySelector('.pwa-banner-text').textContent = '📱 Di Safari: tap ↑ lalu "Add to Home Screen"';
      banner.querySelector('#pwa-install-btn').style.display = 'none';
      banner.classList.add('show');
    }
  }
}
