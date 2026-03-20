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
  if (el) { el.textContent = (bal<0?'- ':'')+fmt(bal); el.classList.toggle('negative', bal<0); }
  const ti = document.getElementById('total-in');
  const to = document.getElementById('total-out');
  if (ti) ti.textContent = fmt(inc);
  if (to) to.textContent = fmt(exp);

  // Update desktop balance jika di desktop
  if (typeof isDesktop === 'function' && isDesktop()) updateDesktopBalance();
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
// Simple list without month separators (for recent/home)
function renderTxListSimple(container, list) {
  if (!list.length) { container.innerHTML='<div class="empty">Belum ada transaksi.</div>'; return; }
  container.innerHTML = list.map(tx => {
    const walletLabel = tx.type==='transfer' ? '' : (tx.walletId ? ` · ${findWalletItem(tx.walletId)?.name||''}` : '');
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
  container.querySelectorAll('.tx-item').forEach(item => {
    item.addEventListener('click', e => { if(e.target.closest('.tx-del')) return; openEditTx(item.dataset.txId); });
  });
  container.querySelectorAll('.tx-del').forEach(b =>
    b.addEventListener('click', async () => {
      const id = b.dataset.id;
      txs = txs.filter(t=>t.id!==id);
      persist(); updateBalance(); renderRecent();
      populateWalletSelects(); populateDesktopWalletSelects();
      if(currentPage==='riwayat') renderHistory();
      if(currentDPage==='riwayat') renderDesktopHistory();
      if(currentPage==='dompet') renderWalletPage();
      if(currentDPage==='dompet') renderDesktopWallet();
      if(cfg.scriptUrl) deleteTxFromSheets(id);
      syncWalletBalancesAfterTx();
    })
  );
}

function renderTxList(container, list) {
  if (!list.length) { container.innerHTML='<div class="empty">Belum ada transaksi.</div>'; return; }
  let html = '';
  let lastMonth = '';
  list.forEach(tx => {
    const month = tx.date.slice(0,7);
    if (month !== lastMonth) {
      const monthIncome  = list.filter(t=>t.date.startsWith(month)&&t.type==='income').reduce((s,t)=>s+t.amount,0);
      const monthExpense = list.filter(t=>t.date.startsWith(month)&&t.type==='expense').reduce((s,t)=>s+t.amount,0);
      const monthTotal   = monthIncome - monthExpense;
      html += `<div class="tx-month-separator">
        <span class="tx-month-label">${fmtMon(month)}</span>
        <span class="tx-month-total ${monthTotal>=0?'income':'expense'}">${monthTotal>=0?'+':'-'}${fmt(monthTotal)}</span>
      </div>`;
      lastMonth = month;
    }
    const walletLabel = tx.type==='transfer' ? '' :
      (tx.walletId ? ` · ${findWalletItem(tx.walletId)?.name||''}` : '');
    html += `<div class="tx-item" data-tx-id="${tx.id}" style="cursor:pointer">
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
  });
  container.innerHTML = html;
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
            <div class="wallet-cat-total">${fmt(catTotal)} <span class="wallet-cat-pct">(${totalAll>0?Math.round(Math.max(0,catTotal)/totalAll*100):0}%)</span></div>
          </div>
        </div>
        <div class="wallet-cat-actions">
          <button class="wallet-item-btn" data-edit-cat="${cat.id}" title="Edit">✏️</button>
          <button class="wallet-item-btn del" data-del-cat="${cat.id}" title="Hapus">🗑️</button>
          <span class="wcat-toggle" data-toggle="${cat.id}">▼</span>
        </div>
      </div>
      <div class="wallet-items" id="wcat-items-${cat.id}">
        ${(()=>{
          const catPos = cat.items.reduce((s,i)=>s+Math.max(0,calcWalletBalance(i)),0);
          return cat.items.map(item => {
            const bal = calcWalletBalance(item);
            const counted = item.counted !== false;
            const pct = catPos>0 ? Math.round(Math.max(0,bal)/catPos*100) : 0;
            return `<div class="wallet-item">
              <div class="wallet-item-left">
                <div class="wallet-item-name">${item.name} <span class="wallet-cat-pct">(${pct}%)</span></div>
                <div class="wallet-item-sub">Saldo awal: ${fmt(item.initialBalance||0)}</div>
                <div class="wallet-item-pct-bar"><div class="wallet-item-pct-fill" style="width:${pct}%"></div></div>
              </div>
              <div class="wallet-item-right">
                <div class="wallet-item-bal ${bal<0?'negative':''}">${fmt(bal)}</div>
                <span class="counted-badge ${counted?'yes':'no'}">${counted?'✓':'✗'}</span>
                <button class="wallet-item-btn" data-adjust="${item.id}" title="Sesuaikan saldo">⚖️</button>
                <button class="wallet-item-btn" data-edit-item="${item.id}" data-cat="${cat.id}" title="Edit">✏️</button>
                <button class="wallet-item-btn del" data-del-item="${item.id}" data-cat="${cat.id}" title="Hapus">🗑️</button>
              </div>
            </div>`;
          }).join('');
        })()}
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
function openSettings() {
  document.getElementById('settings-panel').classList.add('open');
}
function closeSettings() {
  document.getElementById('settings-panel').classList.remove('open');
}
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

// ════════════════════════════════════════════════════════════════
// DESKTOP LAYOUT
// ════════════════════════════════════════════════════════════════
const isDesktop = () => window.innerWidth >= 768;

function initDesktop() {
  if (!isDesktop()) return;
  setupDesktopNav();
  setupDesktopForm();
  setupDesktopWallet();
  setupDesktopLaporan();
  syncDesktopButtons();
  updateDesktopBalance();
  renderDesktopRecent();
  renderDesktopCharts();
  setupResizable();
  setupChartResizeObserver();
}

// ─── Desktop Nav ──────────────────────────────────────────────
let currentDPage = 'beranda';
const dPageTitles = { beranda:'Beranda', dompet:'Dompet', riwayat:'Riwayat', laporan:'Laporan' };

function setupDesktopNav() {
  document.querySelectorAll('.sidebar-nav-btn').forEach(b => {
    b.addEventListener('click', () => switchDPage(b.dataset.dpage));
  });
  btn('d-btn-settings', () => {
    openSettings();
    // Prefill scriptUrl
    const el = document.getElementById('inp-scripturl');
    if (el) el.value = cfg.scriptUrl || '';
    updateConnBadge();
    updateThemeButtons(localStorage.getItem('theme')||'dark');
  });
  btn('d-btn-sync',    syncAll);
  btn('d-btn-theme',   () => applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light'));
}

function switchDPage(page) {
  currentDPage = page;
  document.querySelectorAll('.desktop-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.dpage === page));
  const el = document.getElementById('dpage-'+page);
  if (el) el.classList.add('active');
  document.getElementById('d-page-title').textContent = dPageTitles[page] || page;
  if (page === 'riwayat') renderDesktopHistory();
  if (page === 'dompet')  renderDesktopWallet();
  if (page === 'laporan') {
    // Setup row resizers after page is visible
    requestAnimationFrame(() => {
      setupLaporanRowResizersOnce();
      renderDesktopCharts();
    });
  }
}

// ─── Desktop Balance ──────────────────────────────────────────
function updateDesktopBalance() {
  if (!isDesktop()) return;
  const inc = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const countedItems = wallets.flatMap(cat => cat.items.filter(i => i.counted !== false));
  const bal = countedItems.length > 0
    ? countedItems.reduce((s, item) => s + calcWalletBalance(item), 0)
    : inc - exp;

  // Summary cards on beranda
  const elBal = document.getElementById('d-balance-val');
  if (elBal) {
    elBal.textContent = (bal<0?'- ':'')+fmt(bal);
    elBal.classList.toggle('negative', bal<0);
  }
  const ti = document.getElementById('d-total-in');
  const to = document.getElementById('d-total-out');
  if (ti) ti.textContent = fmt(inc);
  if (to) to.textContent = fmt(exp);

  // Conn label in sidebar footer
  const cl = document.getElementById('d-conn-label');
  if (cl) { cl.textContent = cfg.scriptUrl ? '● Terhubung' : 'Belum terhubung'; cl.style.color = cfg.scriptUrl ? 'var(--mint)' : 'var(--t3)'; }

  // Render home pie chart
  renderHomePie();
}

function renderHomePie() {
  const canvas = document.getElementById('d-home-pie'); if (!canvas) return;
  const container = canvas.closest('.chart-wrap') || canvas.parentElement;
  const W = Math.max(container.clientWidth - 28, 200);
  const H = Math.max(container.clientHeight - 60, 200);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,W,H);
  const legend = document.getElementById('d-home-legend');

  const exp = txs.filter(t=>t.type==='expense');
  const totals = {}; exp.forEach(t=>totals[t.label]=(totals[t.label]||0)+t.amount);
  const labels = Object.keys(totals), data = Object.values(totals);
  const total = data.reduce((a,b)=>a+b,0);

  if (!total) {
    ctx.fillStyle='#4a4858'; ctx.font='13px Syne'; ctx.textAlign='center';
    ctx.fillText('Belum ada pengeluaran', W/2, H/2);
    if (legend) legend.innerHTML=''; return;
  }

  // Donut centered
  const cx = W/2, cy = H/2, r = Math.min(W, H) * 0.34;
  const innerR = r * 0.54;
  let angle = -Math.PI/2;

  // Draw slices with gap
  const gap = 0.025;
  data.forEach((v,i) => {
    const slice = (v/total)*Math.PI*2 - gap;
    ctx.beginPath();
    ctx.arc(cx,cy,r, angle+gap/2, angle+slice+gap/2);
    ctx.arc(cx,cy,innerR, angle+slice+gap/2, angle+gap/2, true);
    ctx.closePath();
    ctx.fillStyle = COLORS[i%COLORS.length]; ctx.fill();
    angle += (v/total)*Math.PI*2;
  });

  // Donut hole
  const bgC = document.documentElement.classList.contains('light') ? '#ffffff' : '#14141a';
  ctx.beginPath(); ctx.arc(cx,cy,innerR-2,0,Math.PI*2);
  ctx.fillStyle = bgC; ctx.fill();

  // Center text
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8a8799'; ctx.font = '11px Syne';
  ctx.fillText('Total', cx, cy - 8);
  ctx.fillStyle = '#f54e6a';
  ctx.font = '600 14px JetBrains Mono';
  ctx.fillText(total>=1e6 ? 'Rp '+(total/1e6).toFixed(1)+'jt' : fmt(total), cx, cy+10);

  // External labels with leader lines (like reference image)
  angle = -Math.PI/2;
  data.forEach((v,i) => {
    const slice = (v/total)*Math.PI*2;
    const pct = Math.round(v/total*100);
    const midAngle = angle + slice/2;
    const labelR = r * 1.35;
    const lx = cx + Math.cos(midAngle) * labelR;
    const ly = cy + Math.sin(midAngle) * labelR;
    const lineStartX = cx + Math.cos(midAngle) * (r+4);
    const lineStartY = cy + Math.sin(midAngle) * (r+4);
    const lineEndX   = cx + Math.cos(midAngle) * (r+18);
    const lineEndY   = cy + Math.sin(midAngle) * (r+18);

    // Leader line
    ctx.beginPath(); ctx.moveTo(lineStartX,lineStartY);
    ctx.lineTo(lineEndX,lineEndY);
    ctx.strokeStyle = COLORS[i%COLORS.length]; ctx.lineWidth=1.5; ctx.stroke();

    // Horizontal line
    const dir = lx > cx ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(lineEndX,lineEndY);
    ctx.lineTo(lineEndX + dir*16, lineEndY);
    ctx.strokeStyle = COLORS[i%COLORS.length]; ctx.lineWidth=1.5; ctx.stroke();

    // Percentage bold
    ctx.textAlign = lx > cx ? 'left' : 'right';
    const tx2 = lineEndX + dir*20;
    ctx.fillStyle = COLORS[i%COLORS.length];
    ctx.font = '700 13px Syne';
    ctx.fillText(pct+'%', tx2, lineEndY - 2);

    // Label below pct
    ctx.fillStyle = '#8a8799';
    ctx.font = '11px Syne';
    ctx.fillText(labels[i], tx2, lineEndY + 12);

    angle += slice;
  });

  // Hide old legend, using canvas labels instead
  if (legend) legend.style.display = 'none';
}

// ─── Desktop Form ─────────────────────────────────────────────
let dCurrentType = 'expense';
let dSelectedCat = '';

function setupDesktopForm() {
  btn('d-btn-save', saveDesktopTx);
  btn('d-btn-add-tx', () => { switchDPage('beranda'); document.getElementById('d-inp-amount')?.focus(); });
  btn('d-tbtn-expense',  () => setDType('expense'));
  btn('d-tbtn-income',   () => setDType('income'));
  btn('d-tbtn-transfer', () => setDType('transfer'));
  // Set default date
  const dd = document.getElementById('d-inp-date');
  if (dd) dd.value = new Date().toISOString().split('T')[0];
  renderDCats();
  populateDesktopWalletSelects();
}

function setDType(type) {
  dCurrentType = type;
  dSelectedCat = '';
  ['expense','income','transfer'].forEach(t => {
    const b = document.getElementById('d-tbtn-'+t);
    if (b) b.classList.toggle('active', t===type);
  });
  const catSection    = document.getElementById('d-cat-section');
  const singleRow     = document.getElementById('d-wallet-single-row');
  const transferRows  = document.getElementById('d-wallet-transfer-rows');
  if (type === 'transfer') {
    if (catSection)   catSection.style.display   = 'none';
    if (singleRow)    singleRow.style.display    = 'none';
    if (transferRows) transferRows.style.display = 'block';
  } else {
    if (catSection)   catSection.style.display   = 'block';
    if (singleRow)    singleRow.style.display    = 'flex';
    if (transferRows) transferRows.style.display = 'none';
  }
  const saveBtn = document.getElementById('d-btn-save');
  if (saveBtn) {
    saveBtn.className = 'btn-save '+type;
    saveBtn.textContent = type==='expense'?'+ Simpan Pengeluaran':type==='income'?'+ Simpan Pemasukan':'↔ Simpan Transfer';
  }
  renderDCats();
  populateDesktopWalletSelects();
}

function renderDCats() {
  const grid = document.getElementById('d-cat-grid');
  if (!grid) return;
  const cats = CATS[dCurrentType] || [];
  grid.innerHTML = cats.map(c => `
    <button class="cat-btn ${c.id===dSelectedCat?'sel '+dCurrentType:''}" data-cat="${c.id}">
      <span class="ci">${c.icon}</span>${c.label}
    </button>`).join('');
  grid.querySelectorAll('.cat-btn').forEach(b =>
    b.addEventListener('click', () => { dSelectedCat=b.dataset.cat; renderDCats(); })
  );
}

function populateDesktopWalletSelects() {
  const makeOpts = (skipId='') => '<option value="" disabled selected>Pilih dompet...</option>' +
    wallets.map(cat => `<optgroup label="${cat.icon} ${cat.name}">` +
      cat.items.filter(i=>i.id!==skipId).map(i =>
        `<option value="${i.id}">${i.name} (${fmt(calcWalletBalance(i))})</option>`
      ).join('') + '</optgroup>'
    ).join('');

  const ids = ['d-inp-wallet','d-inp-wallet-from','d-inp-wallet-to'];
  ids.forEach(id => { const el=document.getElementById(id); if(el) el.innerHTML=makeOpts(); });
  const wf = document.getElementById('d-inp-wallet-from');
  const wt = document.getElementById('d-inp-wallet-to');
  if (wf) wf.addEventListener('change', () => { if(wt) wt.innerHTML=makeOpts(wf.value); });
}

async function saveDesktopTx() {
  const amount   = parseFloat(document.getElementById('d-inp-amount')?.value);
  const date     = document.getElementById('d-inp-date')?.value;
  const note     = document.getElementById('d-inp-note')?.value.trim() || '';
  const walletId = document.getElementById('d-inp-wallet')?.value || '';
  const wFrom    = document.getElementById('d-inp-wallet-from')?.value || '';
  const wTo      = document.getElementById('d-inp-wallet-to')?.value || '';

  if (!amount || amount<=0) return toast('Masukkan jumlah yang valid','error');
  if (!date) return toast('Pilih tanggal','error');
  if (dCurrentType !== 'transfer' && !dSelectedCat) return toast('Pilih kategori','error');
  if (dCurrentType !== 'transfer' && !walletId) return toast('Pilih dompet','error');
  if (dCurrentType === 'transfer' && (!wFrom || !wTo)) return toast('Pilih dompet asal & tujuan','error');
  if (dCurrentType === 'transfer' && wFrom===wTo) return toast('Dompet asal & tujuan harus berbeda','error');

  let tx;
  if (dCurrentType === 'transfer') {
    const fi = findWalletItem(wFrom), ti = findWalletItem(wTo);
    tx = { id:Date.now().toString(), type:'transfer', amount, date, note,
      label:`Transfer: ${fi?.name||wFrom} → ${ti?.name||wTo}`, icon:'↔',
      walletFrom:wFrom, walletTo:wTo, synced:false };
  } else {
    const ci = catInfo(dSelectedCat);
    tx = { id:Date.now().toString(), type:dCurrentType, amount, date, note,
      category:dSelectedCat, label:ci.label, icon:ci.icon, walletId, synced:false };
  }

  txs.unshift(tx);
  persist();
  updateBalance(); updateDesktopBalance();
  renderDesktopRecent(); renderRecent();
  populateDesktopWalletSelects(); populateWalletSelects();
  if (currentDPage==='dompet') renderDesktopWallet();
  if (currentDPage==='riwayat') renderDesktopHistory();

  document.getElementById('d-inp-amount').value = '';
  document.getElementById('d-inp-note').value   = '';
  dSelectedCat=''; renderDCats();
  toast('✓ Tersimpan!','success');
  if (cfg.scriptUrl) syncTxToSheets([tx]);
  syncWalletBalancesAfterTx();
}

// ─── Desktop Recent ───────────────────────────────────────────
function renderDesktopRecent() {
  const el = document.getElementById('d-recent-list');
  if (!el) return;
  const sorted = [...txs].sort((a,b)=>b.date!==a.date?b.date.localeCompare(a.date):b.id.localeCompare(a.id));
  renderTxListSimple(el, sorted.slice(0,8));
  renderHomePie();
}

// ─── Desktop History ──────────────────────────────────────────
function renderDesktopHistory() {
  const el = document.getElementById('d-history-list');
  if (!el) return;
  populateDesktopFilters();
  const month = document.getElementById('d-f-month')?.value || '';
  const cat   = document.getElementById('d-f-cat')?.value   || '';
  let list = [...txs].sort((a,b)=>b.date!==a.date?b.date.localeCompare(a.date):b.id.localeCompare(a.id));
  if (month) list = list.filter(t=>t.date.startsWith(month));
  if (cat)   list = list.filter(t=>t.category===cat||t.type===cat);
  renderTxListInto(el, list);
  const fm = document.getElementById('d-f-month');
  const fc = document.getElementById('d-f-cat');
  if (fm) fm.onchange = renderDesktopHistory;
  if (fc) fc.onchange = renderDesktopHistory;
}

function populateDesktopFilters() {
  const months = [...new Set(txs.map(t=>t.date.slice(0,7)))].sort().reverse();
  const mSel = document.getElementById('d-f-month'); if(!mSel) return;
  const cur=mSel.value;
  mSel.innerHTML = '<option value="">Semua Bulan</option>'+months.map(m=>`<option value="${m}" ${m===cur?'selected':''}>${fmtMon(m)}</option>`).join('');
  const cSel=document.getElementById('d-f-cat'); if(!cSel) return;
  const curC=cSel.value;
  const cats=[...new Set(txs.filter(t=>t.category).map(t=>t.category))];
  cSel.innerHTML='<option value="">Semua Kategori</option>'+cats.map(c=>{const i=catInfo(c);return`<option value="${c}" ${c===curC?'selected':''}>${i.icon} ${i.label}</option>`;}).join('');
}

function renderTxListInto(container, list) {
  if (!list.length) { container.innerHTML='<div class="empty">Belum ada transaksi.</div>'; return; }
  let html = '';
  let lastMonth = '';
  list.forEach(tx => {
    const month = tx.date.slice(0,7);
    if (month !== lastMonth) {
      const mInc  = list.filter(t=>t.date.startsWith(month)&&t.type==='income').reduce((s,t)=>s+t.amount,0);
      const mExp  = list.filter(t=>t.date.startsWith(month)&&t.type==='expense').reduce((s,t)=>s+t.amount,0);
      const monthTotal = mInc - mExp;
      html += `<div class="tx-month-separator">
        <span class="tx-month-label">${fmtMon(month)}</span>
        <span class="tx-month-total ${monthTotal>=0?'income':'expense'}">${monthTotal>=0?'+':'-'}${fmt(monthTotal)}</span>
      </div>`;
      lastMonth = month;
    }
    const wLabel = tx.type==='transfer' ? '' : (tx.walletId ? ` · ${findWalletItem(tx.walletId)?.name||''}` : '');
    html += `<div class="tx-item" data-tx-id="${tx.id}" style="cursor:pointer">
      <div class="tx-ico ${tx.type}">${tx.icon||'📦'}</div>
      <div class="tx-body">
        <div class="tx-cat">${tx.label}</div>
        <div class="tx-meta">${tx.note||tx.date}${wLabel}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amt ${tx.type}">${tx.type==='expense'?'- ':tx.type==='income'?'+':'↔'}${fmt(tx.amount)}</div>
        <div class="tx-date">${fmtDate(tx.date)}</div>
      </div>
      <button class="tx-del" data-id="${tx.id}">✕</button>
    </div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.tx-item').forEach(item => {
    item.addEventListener('click', e => { if(e.target.closest('.tx-del')) return; openEditTx(item.dataset.txId); });
  });
  container.querySelectorAll('.tx-del').forEach(b =>
    b.addEventListener('click', async () => {
      const id=b.dataset.id;
      txs=txs.filter(t=>t.id!==id);
      persist(); updateBalance(); updateDesktopBalance();
      renderDesktopRecent(); renderRecent();
      populateDesktopWalletSelects(); populateWalletSelects();
      if(currentDPage==='riwayat') renderDesktopHistory();
      if(currentDPage==='dompet')  renderDesktopWallet();
      if(cfg.scriptUrl) deleteTxFromSheets(id);
      syncWalletBalancesAfterTx();
    })
  );
}

// ─── Desktop Wallet ───────────────────────────────────────────
function setupDesktopWallet() {
  btn('d-btn-add-wallet-cat', () => openModalWcat());
}

function renderDesktopWallet() {
  const el = document.getElementById('d-wallet-cats-list');
  if (!el) return;
  // Reuse mobile wallet render but target desktop containers
  let totalCounted=0, totalAll=0;
  wallets.forEach(cat => cat.items.forEach(item => {
    const bal=calcWalletBalance(item);
    totalAll+=bal;
    if(item.counted!==false) totalCounted+=bal;
  }));
  const tc=document.getElementById('d-w-total-counted');
  const ta=document.getElementById('d-w-total-all');
  if(tc) tc.textContent=fmt(totalCounted);
  if(ta) ta.textContent=fmt(totalAll);

  if(!wallets.length){el.innerHTML='<div class="empty">Belum ada dompet.</div>';return;}
  el.innerHTML = wallets.map(cat=>{
    const catTotal=cat.items.reduce((s,i)=>s+calcWalletBalance(i),0);
    return `<div class="wallet-cat-card">
      <div class="wallet-cat-hdr" data-catid="${cat.id}">
        <div class="wallet-cat-hdr-left">
          <span class="wallet-cat-icon">${cat.icon||'📁'}</span>
          <div class="wallet-cat-info">
            <div class="wallet-cat-name">${cat.name}</div>
            <div class="wallet-cat-total">${fmt(catTotal)} <span class="wallet-cat-pct">(${totalAll>0?Math.round(Math.max(0,catTotal)/totalAll*100):0}%)</span></div>
          </div>
        </div>
        <div class="wallet-cat-actions">
          <button class="wallet-item-btn" data-edit-cat="${cat.id}">✏️</button>
          <button class="wallet-item-btn del" data-del-cat="${cat.id}">🗑️</button>
          <span class="wcat-toggle" data-toggle="${cat.id}">▼</span>
        </div>
      </div>
      <div class="wallet-items" id="dwcat-items-${cat.id}">
        ${(()=>{
          const catPos=cat.items.reduce((s,i)=>s+Math.max(0,calcWalletBalance(i)),0);
          return cat.items.map(item=>{
            const bal=calcWalletBalance(item);
            const counted=item.counted!==false;
            const pct=catPos>0?Math.round(Math.max(0,bal)/catPos*100):0;
            return `<div class="wallet-item">
              <div class="wallet-item-left">
                <div class="wallet-item-name">${item.name} <span class="wallet-cat-pct">(${pct}%)</span></div>
                <div class="wallet-item-sub">Saldo awal: ${fmt(item.initialBalance||0)}</div>
                <div class="wallet-item-pct-bar"><div class="wallet-item-pct-fill" style="width:${pct}%"></div></div>
              </div>
              <div class="wallet-item-right">
                <div class="wallet-item-bal ${bal<0?'negative':''}">${fmt(bal)}</div>
                <span class="counted-badge ${counted?'yes':'no'}">${counted?'✓':'✗'}</span>
                <button class="wallet-item-btn" data-adjust="${item.id}">⚖️</button>
                <button class="wallet-item-btn" data-edit-item="${item.id}" data-cat="${cat.id}">✏️</button>
                <button class="wallet-item-btn del" data-del-item="${item.id}" data-cat="${cat.id}">🗑️</button>
              </div>
            </div>`;
          }).join('');
        })()}
        <button class="wallet-add-item-btn" data-add-item="${cat.id}">＋ Tambah ${cat.name}</button>
      </div>
    </div>`;
  }).join('');

  // Wire up all wallet interactions (same as mobile)
  el.querySelectorAll('.wallet-cat-hdr').forEach(hdr=>{
    hdr.addEventListener('click',e=>{
      if(e.target.closest('button')) return;
      const id=hdr.dataset.catid;
      const items=document.getElementById('dwcat-items-'+id);
      const tog=hdr.querySelector('.wcat-toggle');
      const isOpen=items.classList.contains('open');
      el.querySelectorAll('.wallet-items').forEach(x=>x.classList.remove('open'));
      el.querySelectorAll('.wcat-toggle').forEach(x=>x.classList.remove('open'));
      if(!isOpen){items.classList.add('open');tog.classList.add('open');}
    });
  });
  el.querySelectorAll('[data-edit-cat]').forEach(b=>b.addEventListener('click',()=>openModalWcat(b.dataset.editCat)));
  el.querySelectorAll('[data-del-cat]').forEach(b=>b.addEventListener('click',()=>{
    if(!confirm('Hapus kategori ini?')) return;
    wallets=wallets.filter(c=>c.id!==b.dataset.delCat);
    persist(); renderDesktopWallet(); renderWalletPage();
    populateWalletSelects(); populateDesktopWalletSelects();
    if(cfg.scriptUrl) syncWalletsToSheets();
    toast('Kategori dihapus');
  }));
  el.querySelectorAll('[data-add-item]').forEach(b=>b.addEventListener('click',()=>openModalWitem(b.dataset.addItem)));
  el.querySelectorAll('[data-edit-item]').forEach(b=>b.addEventListener('click',()=>openModalWitem(b.dataset.cat,b.dataset.editItem)));
  el.querySelectorAll('[data-del-item]').forEach(b=>b.addEventListener('click',()=>{
    if(!confirm('Hapus dompet ini?')) return;
    const cat=wallets.find(c=>c.id===b.dataset.cat);
    if(cat) cat.items=cat.items.filter(i=>i.id!==b.dataset.delItem);
    persist(); renderDesktopWallet(); renderWalletPage();
    populateWalletSelects(); populateDesktopWalletSelects();
    if(cfg.scriptUrl) syncWalletsToSheets();
    toast('Dompet dihapus');
  }));
  el.querySelectorAll('[data-adjust]').forEach(b=>b.addEventListener('click',()=>openModalAdjust(b.dataset.adjust)));
}

// ─── Desktop Charts ───────────────────────────────────────────
function setupDesktopLaporan() {
  // Filter tabs
  document.querySelectorAll('#dpage-laporan .lf-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      laporanPeriod=tab.dataset.period;
      document.querySelectorAll('#dpage-laporan .lf-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const cr=document.getElementById('d-laporan-custom-range');
      if(cr) cr.style.display=laporanPeriod==='custom'?'flex':'none';
      updateDesktopLaporanInfo();
      renderDesktopCharts();
    });
  });
  const df=document.getElementById('d-laporan-date-from');
  const dt=document.getElementById('d-laporan-date-to');
  if(df) df.addEventListener('change',()=>{ laporanDateFrom=df.value; renderDesktopCharts(); });
  if(dt) dt.addEventListener('change',()=>{ laporanDateTo=dt.value; renderDesktopCharts(); });

  // Chart card click → popup
  document.querySelectorAll('.laporan-donut-card').forEach(card=>{
    card.addEventListener('click',()=> openChartDetailModal(card.dataset.dchart));
  });

  // Close chart modal
  btn('close-modal-chart', ()=> closeModal('modal-chart-detail'));
}

function openChartDetailModal(chartType) {
  const titles = {
    expense:  '📉 Pengeluaran per Kategori',
    income:   '📈 Pemasukan per Kategori',
    wallet:   '🏦 Distribusi Dompet',
    cashflow: '💹 Arus Kas 6 Bulan Terakhir'
  };
  document.getElementById('chart-detail-title').textContent = titles[chartType] || chartType;
  openModal('modal-chart-detail');

  setTimeout(() => {
    const canvas = document.getElementById('d-c-detail');
    const legend = document.getElementById('d-legend-detail');
    if (!canvas) return;

    const modal = document.getElementById('chart-detail-modal');
    if (!modal) return;

    // Calculate available space inside modal
    const modalW = modal.clientWidth;
    const modalH = modal.clientHeight;
    const hdrH   = modal.querySelector('.modal-hdr')?.offsetHeight || 50;
    const legH   = chartType === 'cashflow' ? 0 : 60;
    const padding = 48;

    const W = modalW - padding;
    const H = Math.max(300, modalH - hdrH - legH - padding - 32);

    canvas.width  = W;
    canvas.height = H;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    if (legend) legend.innerHTML = '';

    if (chartType === 'cashflow') {
      renderBarInto('d-c-detail');
    } else if (chartType === 'wallet') {
      renderWalletDonutInto('d-c-detail', 'd-legend-detail');
    } else {
      renderDonutInto(chartType, 'd-c-detail', 'd-legend-detail');
    }
  }, 200);
}

function updateDesktopLaporanInfo() {
  const el=document.getElementById('d-laporan-filter-info');
  if(!el) return;
  const now=new Date();
  if(laporanPeriod==='month') el.textContent=now.toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  else if(laporanPeriod==='year') el.textContent='Tahun '+now.getFullYear();
  else if(laporanPeriod==='custom') el.textContent=(laporanDateFrom&&laporanDateTo)?fmtDate(laporanDateFrom)+' – '+fmtDate(laporanDateTo):'Pilih rentang tanggal';
  else el.textContent='Semua waktu';
}

function renderLaporanDonutCard(cardId) {
  const map = {
    'dcard-expense':  ['expense', 'd-c-pie-expense', 'd-legend-expense'],
    'dcard-income':   ['income',  'd-c-pie-income',  'd-legend-income'],
    'dcard-wallet':   ['wallet',  'd-c-pie-wallet',  'd-legend-wallet'],
    'dcard-cashflow': ['cashflow','d-c-bar',          null],
  };
  const entry = map[cardId]; if (!entry) return;
  const [type, canvasId, legendId] = entry;
  const card   = document.getElementById(cardId);
  const canvas = document.getElementById(canvasId);
  if (!card || !canvas) return;
  // Use clientWidth/clientHeight to stay within card bounds
  const W = Math.max(80,  card.clientWidth  - 28);
  const H = Math.max(60,  card.clientHeight - 36);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width  = W;
  canvas.height = H;
  if      (type === 'cashflow') renderBarInto(canvasId);
  else if (type === 'wallet')   renderWalletDonutInto(canvasId, legendId);
  else                          renderDonutInto(type, canvasId, legendId);
}

function renderDesktopCharts() {
  if(!isDesktop()) return;
  updateDesktopLaporanInfo();
  requestAnimationFrame(() => {
    setTimeout(() => {
      renderLaporanDonutCard('dcard-expense');
      renderLaporanDonutCard('dcard-income');
      renderLaporanDonutCard('dcard-wallet');
      renderLaporanDonutCard('dcard-cashflow');
    }, 80);
  });
}

function renderDonutInto(type, canvasId, legendId) {
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const W = canvas.width  || canvas.offsetWidth  || 400;
  const H = canvas.height || canvas.offsetHeight || 300;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,W,H);

  const isExp  = type === 'expense';
  const accent = isExp ? '#f54e6a' : '#4ef5b0';
  const centerLabel = isExp ? 'Keluar' : 'Masuk';
  const filtered = getFilteredTxsForLaporan().filter(t=>t.type===type);
  const totals = {}; filtered.forEach(t=>totals[t.label]=(totals[t.label]||0)+t.amount);
  const labels = Object.keys(totals), data = Object.values(totals);
  const total  = data.reduce((a,b)=>a+b,0);
  const legend = document.getElementById(legendId);

  if (!total) {
    ctx.fillStyle='#4a4858'; ctx.font='14px Syne'; ctx.textAlign='center';
    ctx.fillText('Belum ada data', W/2, H/2);
    if (legend) legend.innerHTML=''; return;
  }

  // Layout: donut centered, legend on right
  const legW   = Math.min(170, W * 0.36);
  const chartW = W - legW - 16;
  const cx     = chartW / 2;
  const cy     = H / 2;
  const r      = Math.min(chartW * 0.46, H * 0.44);
  const innerR = r * 0.58;

  // Draw slices with gap
  let angle = -Math.PI / 2;
  const gap = 0.025;
  data.forEach((v,i) => {
    const slice = (v/total) * Math.PI * 2 - gap;
    ctx.beginPath();
    ctx.arc(cx, cy, r, angle + gap/2, angle + slice + gap/2);
    ctx.arc(cx, cy, innerR, angle + slice + gap/2, angle + gap/2, true);
    ctx.closePath();
    ctx.fillStyle = COLORS[i%COLORS.length];
    ctx.fill();
    angle += (v/total) * Math.PI * 2;
  });

  // Center text
  const bgC = document.documentElement.classList.contains('light') ? '#ffffff' : '#14141a';
  ctx.beginPath(); ctx.arc(cx, cy, innerR - 2, 0, Math.PI*2);
  ctx.fillStyle = bgC; ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8a8799';
  ctx.font = `${Math.max(10, Math.round(r*0.14))}px Syne`;
  ctx.fillText(centerLabel, cx, cy - r*0.06);
  ctx.fillStyle = accent;
  ctx.font = `600 ${Math.max(11, Math.round(r*0.16))}px JetBrains Mono`;
  ctx.fillText(total>=1e6?'Rp '+(total/1e6).toFixed(1)+'jt':fmt(total), cx, cy + r*0.14);

  // Legend on right side
  const lx0 = chartW + 16;
  const lineH = Math.max(28, H / (labels.length + 1));
  const startY = (H - labels.length * lineH) / 2 + lineH * 0.5;
  labels.forEach((lbl, i) => {
    const pct = Math.round(data[i]/total*100);
    const y   = startY + i * lineH;
    // Color square
    ctx.fillStyle = COLORS[i%COLORS.length];
    ctx.fillRect(lx0, y - 6, 12, 12);
    // Label
    ctx.fillStyle = '#eeeae2';
    ctx.font = `500 ${Math.max(10,Math.round(r*0.13))}px Syne`;
    ctx.textAlign = 'left';
    ctx.fillText(lbl, lx0 + 18, y + 4);
    // Percentage
    ctx.fillStyle = '#8a8799';
    ctx.font = `${Math.max(10,Math.round(r*0.12))}px Syne`;
    ctx.fillText(pct + '%', lx0 + 18, y + 4 + Math.max(12, Math.round(r*0.14)));
  });

  if (legend) legend.style.display = 'none';
}

function renderWalletDonutInto(canvasId, legendId) {
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const W = canvas.width  || canvas.offsetWidth  || 400;
  const H = canvas.height || canvas.offsetHeight || 300;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,W,H);
  const legend = document.getElementById(legendId);
  const items = allWalletItems();
  const labels=[], data=[];
  items.forEach(item=>{ const bal=calcWalletBalance(item); if(bal>0){labels.push(item.name);data.push(bal);} });
  const total = data.reduce((a,b)=>a+b,0);
  if (!total) {
    ctx.fillStyle='#4a4858'; ctx.font='14px Syne'; ctx.textAlign='center';
    ctx.fillText('Belum ada dompet', W/2, H/2);
    if(legend) legend.innerHTML=''; return;
  }

  const legW   = Math.min(170, W*0.36);
  const chartW = W - legW - 16;
  const cx = chartW/2, cy = H/2;
  const r  = Math.min(chartW*0.46, H*0.44);
  const innerR = r * 0.58;
  const gap = 0.025;

  let angle = -Math.PI/2;
  data.forEach((v,i) => {
    const slice = (v/total)*Math.PI*2 - gap;
    ctx.beginPath();
    ctx.arc(cx,cy,r, angle+gap/2, angle+slice+gap/2);
    ctx.arc(cx,cy,innerR, angle+slice+gap/2, angle+gap/2, true);
    ctx.closePath();
    ctx.fillStyle = COLORS[i%COLORS.length]; ctx.fill();
    angle += (v/total)*Math.PI*2;
  });

  const bgC = document.documentElement.classList.contains('light')?'#ffffff':'#14141a';
  ctx.beginPath(); ctx.arc(cx,cy,innerR-2,0,Math.PI*2); ctx.fillStyle=bgC; ctx.fill();
  ctx.textAlign='center';
  ctx.fillStyle='#8a8799'; ctx.font=`${Math.max(10,Math.round(r*0.14))}px Syne`;
  ctx.fillText('Total', cx, cy-r*0.06);
  ctx.fillStyle='#d4f54e'; ctx.font=`600 ${Math.max(11,Math.round(r*0.16))}px JetBrains Mono`;
  ctx.fillText(total>=1e6?'Rp '+(total/1e6).toFixed(1)+'jt':fmt(total), cx, cy+r*0.14);

  const lx0  = chartW + 16;
  const lineH = Math.max(28, H/(labels.length+1));
  const startY = (H - labels.length*lineH)/2 + lineH*0.5;
  labels.forEach((lbl,i) => {
    const pct = Math.round(data[i]/total*100);
    const y   = startY + i*lineH;
    ctx.fillStyle = COLORS[i%COLORS.length];
    ctx.fillRect(lx0, y-6, 12, 12);
    ctx.fillStyle='#eeeae2'; ctx.font=`500 ${Math.max(10,Math.round(r*0.13))}px Syne`;
    ctx.textAlign='left'; ctx.fillText(lbl, lx0+18, y+4);
    ctx.fillStyle='#8a8799'; ctx.font=`${Math.max(10,Math.round(r*0.12))}px Syne`;
    ctx.fillText(pct+'%', lx0+18, y+4+Math.max(12,Math.round(r*0.14)));
  });
  if(legend) legend.style.display='none';
}

function roundRect(ctx, x, y, w, h, radii) {
  const [tl, tr, br, bl] = Array.isArray(radii) ? radii : [radii,radii,radii,radii];
  ctx.beginPath();
  ctx.moveTo(x+tl, y);
  ctx.lineTo(x+w-tr, y); ctx.quadraticCurveTo(x+w, y, x+w, y+tr);
  ctx.lineTo(x+w, y+h-br); ctx.quadraticCurveTo(x+w, y+h, x+w-br, y+h);
  ctx.lineTo(x+bl, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-bl);
  ctx.lineTo(x, y+tl); ctx.quadraticCurveTo(x, y, x+tl, y);
  ctx.closePath();
}

function renderBarInto(canvasId) {
  const canvas=document.getElementById(canvasId); if(!canvas) return;
  // Use parent container size for proper fit
  const parent = canvas.parentElement;
  const titleEl = parent?.querySelector('.ldc-title,.chart-sub');
  const titleH  = titleEl ? titleEl.offsetHeight + 8 : 24;
  const W = parent ? parent.clientWidth  - 28 : (canvas.offsetWidth  || 400);
  const H = parent ? Math.max(120, parent.clientHeight - titleH - 20) : (canvas.offsetHeight || 160);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,W,H);
  const filtered=getFilteredTxsForLaporan();
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);months.push(d.toISOString().slice(0,7));}
  const inc=months.map(m=>filtered.filter(t=>t.type==='income'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0));
  const exp=months.map(m=>filtered.filter(t=>t.type==='expense'&&t.date.startsWith(m)).reduce((s,t)=>s+t.amount,0));
  const max=Math.max(...inc,...exp,1);
  const pL=10,pR=10,pB=24,pT=14,cW=W-pL-pR,cH=180-pB-pT,gW=cW/months.length,bW=gW*0.3;
  months.forEach((m,i)=>{
    const x=pL+i*gW+gW*0.08,iH=(inc[i]/max)*cH,eH=(exp[i]/max)*cH;
    ctx.fillStyle='#4ef5b0';ctx.fillRect(x,pT+cH-iH,bW,iH);
    ctx.fillStyle='#f54e6a';ctx.fillRect(x+bW+2,pT+cH-eH,bW,eH);
    const d=new Date(m+'-01');ctx.fillStyle='#4a4858';ctx.font='9px Syne';ctx.textAlign='center';
    ctx.fillText(d.toLocaleDateString('id-ID',{month:'short'}),x+bW,180-6);
  });
  ctx.fillStyle='#4ef5b0';ctx.fillRect(W-110,5,8,8);ctx.fillStyle='#8a8799';ctx.font='9px Syne';ctx.textAlign='left';ctx.fillText('Pemasukan',W-98,13);
  ctx.fillStyle='#f54e6a';ctx.fillRect(W-110,19,8,8);ctx.fillStyle='#8a8799';ctx.fillText('Pengeluaran',W-98,27);
}

// ─── Sync desktop buttons with mobile theme ───────────────────
function syncDesktopButtons() {
  // Mirror theme button state
  const origApply = applyTheme;
}

// ─── Hook into loadFromSheets to also update desktop ─────────
const _origLoadFromSheets = loadFromSheets;

// ─── Init desktop on load + resize ───────────────────────────
window.addEventListener('resize', () => {
  if(isDesktop()) {
    updateDesktopBalance();
    renderDesktopRecent();
    if(currentDPage==='riwayat') renderDesktopHistory();
    if(currentDPage==='laporan') renderDesktopCharts();
    if(currentDPage==='dompet')  renderDesktopWallet();
  }
});

// Call initDesktop after boot
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if(isDesktop()) initDesktop();
  }, 100);
});

// ─── Auto-resize chart on column resize ──────────────────────
function setupChartResizeObserver() {
  const col3 = document.getElementById('bcol-3');
  if (!col3 || !window.ResizeObserver) return;
  const ro = new ResizeObserver(() => {
    // Debounce
    clearTimeout(window._chartResizeTimer);
    window._chartResizeTimer = setTimeout(() => renderHomePie(), 50);
  });
  ro.observe(col3);
}

// ════════════════════════════════════════════════════════════════
// RESIZABLE PANELS & COLUMNS
// ════════════════════════════════════════════════════════════════
function setupResizable() {
  if (!isDesktop()) return;

  // ── Sidebar resizer ──────────────────────────────────────────
  const sidebarResizer = document.getElementById('sidebar-resizer');
  const sidebar        = document.querySelector('.desktop-sidebar');
  if (sidebarResizer && sidebar) {
    let startX, startW;
    const savedSW = localStorage.getItem('sidebar-width');
    if (savedSW) sidebar.style.width = savedSW;

    sidebarResizer.addEventListener('mousedown', e => {
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      sidebarResizer.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const onMove = e => {
        const newW = Math.max(180, Math.min(400, startW + (e.clientX - startX)));
        sidebar.style.width = newW + 'px';
      };
      const onUp = () => {
        localStorage.setItem('sidebar-width', sidebar.style.width);
        sidebarResizer.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Column resizers ──────────────────────────────────────────
  setupColResizer('col-resizer-1', 'bcol-1', 'bcol-2');
  setupColResizer('col-resizer-2', 'bcol-2', 'bcol-3');
  // Laporan donut column resizers
  setupLaporanColResizer('lap-resizer-1', 'dcard-expense', 'dcard-income');
  setupLaporanColResizer('lap-resizer-2', 'dcard-income',  'dcard-wallet');
}

let _lapRowResizersSetup = false;
function setupLaporanRowResizersOnce() {
  if (_lapRowResizersSetup) return;
  _lapRowResizersSetup = true;
  setupLaporanRowResizer('lap-row-resizer',  'laporan-donut-row', 'laporan-bar-row');
  setupBarBottomResizer('lap-row-resizer-2', 'laporan-bar-row');
}




// ── Vertical row resizer ──────────────────────────────────────
function makeRowResizable(resizerId, topEl, bottomEl, lsKeyTop, lsKeyBot) {
  const resizer = document.getElementById(resizerId);
  if (!resizer || !topEl) return;
  if (lsKeyTop && localStorage.getItem(lsKeyTop)) topEl.style.height = localStorage.getItem(lsKeyTop) + 'px';
  if (lsKeyBot && bottomEl && localStorage.getItem(lsKeyBot)) bottomEl.style.height = localStorage.getItem(lsKeyBot) + 'px';
  resizer.addEventListener('mousedown', e => {
    e.preventDefault();
    const startY = e.clientY, startTH = topEl.offsetHeight, startBH = bottomEl ? bottomEl.offsetHeight : 0;
    resizer.classList.add('dragging');
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:row-resize';
    document.body.appendChild(ov);
    const onMove = e => {
      const d = e.clientY - startY;
      topEl.style.height = Math.max(120, startTH + d) + 'px';
      if (bottomEl) bottomEl.style.height = Math.max(120, startBH - d) + 'px';
      clearTimeout(window._lapRowTimer);
      window._lapRowTimer = setTimeout(() => {
        ['dcard-expense','dcard-income','dcard-wallet','dcard-cashflow'].forEach(id => renderLaporanDonutCard(id));
      }, 30);
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      if (lsKeyTop) localStorage.setItem(lsKeyTop, topEl.offsetHeight);
      if (lsKeyBot && bottomEl) localStorage.setItem(lsKeyBot, bottomEl.offsetHeight);
      document.body.removeChild(ov);
      ov.removeEventListener('mousemove', onMove);
      ov.removeEventListener('mouseup', onUp);
      renderDesktopCharts();
    };
    ov.addEventListener('mousemove', onMove);
    ov.addEventListener('mouseup', onUp);
  });
}

function setupBarBottomResizer(resizerId, barRowId) {
  const barRow = document.getElementById(barRowId);
  if (barRow) makeRowResizable(resizerId, barRow, null, 'lap-h-bottom', null);
}

function setupLaporanRowResizer(resizerId, topId, bottomId) {
  const top = document.getElementById(topId), bottom = document.getElementById(bottomId);
  if (top && bottom) makeRowResizable(resizerId, top, bottom, 'lap-h-top', 'lap-h-bottom');
}

function setupLaporanColResizer(resizerId, leftId, rightId) {
  const resizer = document.getElementById(resizerId);
  const left    = document.getElementById(leftId);
  const right   = document.getElementById(rightId);
  if (!resizer || !left || !right) return;

  // Restore saved
  const sl = localStorage.getItem('lap-w-'+leftId);
  const sr = localStorage.getItem('lap-w-'+rightId);
  if (sl) left.style.flex  = '0 0 '+sl;
  if (sr) right.style.flex = '0 0 '+sr;

  let startX, startLW, startRW;
  resizer.addEventListener('mousedown', e => {
    startX=e.clientX; startLW=left.offsetWidth; startRW=right.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.userSelect='none'; document.body.style.cursor='col-resize';
    const onMove = e => {
      const d=e.clientX-startX;
      const nL=Math.max(160,startLW+d), nR=Math.max(160,startRW-d);
      left.style.flex  = '0 0 '+nL+'px';
      if (rightId !== 'dcard-wallet') right.style.flex = '0 0 '+nR+'px';
      // Re-render charts
      clearTimeout(window._lapResizeTimer);
      window._lapResizeTimer = setTimeout(() => renderDesktopCharts(), 50);
    };
    const onUp = () => {
      localStorage.setItem('lap-w-'+leftId,  left.offsetWidth+'px');
      localStorage.setItem('lap-w-'+rightId, right.offsetWidth+'px');
      resizer.classList.remove('dragging');
      document.body.style.userSelect=''; document.body.style.cursor='';
      renderDesktopCharts();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function setupColResizer(resizerId, leftColId, rightColId) {
  const resizer  = document.getElementById(resizerId);
  const leftCol  = document.getElementById(leftColId);
  const rightCol = document.getElementById(rightColId);
  if (!resizer || !leftCol || !rightCol) return;

  // Restore saved widths (col-3 always flex:1)
  const savedL = localStorage.getItem('col-w-'+leftColId);
  if (savedL) leftCol.style.flex = '0 0 ' + savedL;
  if (rightColId !== 'bcol-3') {
    const savedR = localStorage.getItem('col-w-'+rightColId);
    if (savedR) rightCol.style.flex = '0 0 ' + savedR;
  }

  let startX, startLW, startRW;

  resizer.addEventListener('mousedown', e => {
    startX   = e.clientX;
    startLW  = leftCol.offsetWidth;
    startRW  = rightCol.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMove = e => {
      const delta = e.clientX - startX;
      const newLW = Math.max(180, startLW + delta);
      leftCol.style.flex = '0 0 ' + newLW + 'px';
      // Col-3 always fills remaining space (flex:1)
      if (rightColId !== 'bcol-3') {
        const newRW = Math.max(180, startRW - delta);
        rightCol.style.flex = '0 0 ' + newRW + 'px';
      }
      if (rightColId === 'bcol-3') renderHomePie();
    };
    const onUp = () => {
      localStorage.setItem('col-w-'+leftColId,  leftCol.offsetWidth  + 'px');
      localStorage.setItem('col-w-'+rightColId, rightCol.offsetWidth + 'px');
      resizer.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      renderHomePie();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
