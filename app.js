/* Смета электрика — логика приложения. Все данные хранятся локально (localStorage). */

const LS_PRICE = 'smeta:priceData';
const LS_ESTIMATES = 'smeta:estimates';
const LS_ACTIVE = 'smeta:activeId';
const LS_HIDDEN = 'smeta:hiddenCodes';
const LS_SHOW_ALL = 'smeta:showAllMode';

let priceData = null;      // {categories:[{id,title,items:[{code,name,unit,price,custom}]}]}
let estimates = {};        // {id: estimate}
let activeId = null;
let collapsedCats = new Set();
let searchQuery = '';
let hiddenCodes = new Set();   // коды позиций, скрытых пользователем из основного списка
let showAllMode = false;       // false = показывать только "Мои" (не скрытые), true = "Все"
let settingsSearchQuery = '';

// ---------- storage ----------

function loadPriceData() {
  const raw = localStorage.getItem(LS_PRICE);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  }
  const cloned = JSON.parse(JSON.stringify(DEFAULT_PRICE_DATA));
  localStorage.setItem(LS_PRICE, JSON.stringify(cloned));
  return cloned;
}
function savePriceData() {
  localStorage.setItem(LS_PRICE, JSON.stringify(priceData));
}

function loadEstimates() {
  const raw = localStorage.getItem(LS_ESTIMATES);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  }
  return {};
}
function saveEstimates() {
  localStorage.setItem(LS_ESTIMATES, JSON.stringify(estimates));
}

function saveActiveId() {
  if (activeId) localStorage.setItem(LS_ACTIVE, activeId);
}

function loadHiddenCodes() {
  const raw = localStorage.getItem(LS_HIDDEN);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw)); } catch (e) { return new Set(); }
}
function saveHiddenCodes() {
  localStorage.setItem(LS_HIDDEN, JSON.stringify([...hiddenCodes]));
}

function loadShowAllMode() {
  return localStorage.getItem(LS_SHOW_ALL) === '1';
}
function saveShowAllMode() {
  localStorage.setItem(LS_SHOW_ALL, showAllMode ? '1' : '0');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function newEstimateObj(name) {
  return {
    id: uid(),
    name: name || 'Смета без названия',
    client: '',
    address: '',
    date: todayISO(),
    comment: '',
    quantities: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ---------- init ----------

function init() {
  priceData = loadPriceData();
  estimates = loadEstimates();
  hiddenCodes = loadHiddenCodes();
  showAllMode = loadShowAllMode();

  if (Object.keys(estimates).length === 0) {
    const e = newEstimateObj('Смета 1');
    estimates[e.id] = e;
    saveEstimates();
  }

  activeId = localStorage.getItem(LS_ACTIVE);
  if (!activeId || !estimates[activeId]) {
    activeId = Object.keys(estimates).sort((a, b) => estimates[b].updatedAt - estimates[a].updatedAt)[0];
  }
  saveActiveId();

  bindEvents();
  document.getElementById('filterMineBtn').classList.toggle('active', !showAllMode);
  document.getElementById('filterAllBtn').classList.toggle('active', showAllMode);
  renderAll();
  registerServiceWorker();
}

function activeEstimate() {
  return estimates[activeId];
}

// ---------- rendering ----------

function renderAll() {
  renderTopbar();
  renderContent();
  renderTotal();
}

function renderTopbar() {
  const est = activeEstimate();
  document.getElementById('estimateName').textContent = est.name;
  const bits = [];
  if (est.client) bits.push(est.client);
  if (est.address) bits.push(est.address);
  document.getElementById('estimateSub').textContent = bits.join(' · ') || 'Нажмите ⚙ для настроек';
}

function matchesSearch(item) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
}

function isHiddenAndInactive(item, est) {
  return hiddenCodes.has(item.code) && (est.quantities[item.code] || 0) === 0;
}

function renderContent() {
  const content = document.getElementById('content');
  const est = activeEstimate();
  content.innerHTML = '';

  let anyVisible = false;

  priceData.categories.forEach(cat => {
    const allMatching = cat.items.filter(matchesSearch);
    if (allMatching.length === 0) return; // раздел не соответствует поиску вовсе

    // В режиме поиска показываем всё (включая скрытые, с бейджем).
    // Иначе, если не "Все" — прячем неактивные скрытые позиции.
    const visibleItems = (searchQuery || showAllMode)
      ? allMatching
      : allMatching.filter(i => !isHiddenAndInactive(i, est));
    const hiddenCount = allMatching.length - visibleItems.length;

    anyVisible = true;

    const catEl = document.createElement('div');
    catEl.dataset.catId = cat.id;

    if (visibleItems.length === 0) {
      // раздел целиком скрыт
      catEl.className = 'category';
      catEl.innerHTML = `
        <div class="category-hidden-collapsed">
          <span>${escapeHtml(cat.title)} — скрыто ${hiddenCount} поз.</span>
          <button data-action="show-all-mode">Показать</button>
        </div>`;
      content.appendChild(catEl);
      return;
    }

    catEl.className = 'category' + (collapsedCats.has(cat.id) && !searchQuery ? ' collapsed' : '');

    const activeCount = cat.items.filter(i => (est.quantities[i.code] || 0) > 0).length;

    const header = document.createElement('div');
    header.className = 'category-header';
    header.dataset.action = 'toggle-cat';
    header.innerHTML = `
      <span>${cat.title}${activeCount ? `<span class="cat-badge">${activeCount}</span>` : ''}</span>
      <span class="chevron">▾</span>
    `;
    catEl.appendChild(header);

    const itemsEl = document.createElement('div');
    itemsEl.className = 'items';

    visibleItems.forEach(item => {
      itemsEl.appendChild(renderItemRow(item, est));
    });

    if (hiddenCount > 0) {
      const note = document.createElement('div');
      note.className = 'hidden-note';
      note.innerHTML = `<span>Скрыто ${hiddenCount} поз.</span><button data-action="show-all-mode">Показать</button>`;
      itemsEl.appendChild(note);
    }

    catEl.appendChild(itemsEl);
    content.appendChild(catEl);
  });

  if (!anyVisible) {
    content.innerHTML = '<div class="empty-state">Ничего не найдено</div>';
  }
}

function renderItemRow(item, est) {
  const qty = est.quantities[item.code] || 0;
  const isHidden = hiddenCodes.has(item.code);
  const row = document.createElement('div');
  row.className = 'item-row' + (qty > 0 ? ' active' : '');
  row.dataset.code = item.code;

  row.innerHTML = `
    <div class="item-main">
      <div class="item-name">${escapeHtml(item.name)}</div>
      <div class="item-meta">
        <span>${item.code}</span>
        <span>·</span>
        <span>${escapeHtml(item.unit || '')}</span>
        <span>·</span>
        <span class="item-price">${formatMoney(item.price)}</span>
        ${item.custom ? '<span class="edit-mode-badge">своя</span>' : ''}
        ${isHidden ? '<span class="hidden-badge">скрыта</span>' : ''}
      </div>
    </div>
    <div class="qty-wrap">
      <button class="qty-btn" data-action="qty-dec" data-code="${item.code}">−</button>
      <input class="qty-input" type="number" inputmode="decimal" step="any" min="0" data-action="qty-input" data-code="${item.code}" value="${qty || ''}" placeholder="0">
      <button class="qty-btn" data-action="qty-inc" data-code="${item.code}">+</button>
    </div>
    <div class="item-line-total" data-role="line-total">${qty > 0 ? formatMoney(qty * item.price) : ''}</div>
  `;
  return row;
}

function renderTotal() {
  document.getElementById('totalSum').textContent = formatMoney(computeTotal()) + ' BYN';
}

function computeTotal() {
  const est = activeEstimate();
  let total = 0;
  priceData.categories.forEach(cat => {
    cat.items.forEach(item => {
      const qty = est.quantities[item.code] || 0;
      total += qty * item.price;
    });
  });
  return total;
}

function formatMoney(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function findItem(code) {
  for (const cat of priceData.categories) {
    const item = cat.items.find(i => i.code === code);
    if (item) return { item, cat };
  }
  return null;
}

// ---------- events ----------

function bindEvents() {
  const content = document.getElementById('content');

  content.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const code = btn.dataset.code;

    if (action === 'toggle-cat') {
      const catEl = btn.closest('.category');
      const catId = catEl.dataset.catId;
      if (collapsedCats.has(catId)) collapsedCats.delete(catId); else collapsedCats.add(catId);
      catEl.classList.toggle('collapsed');
      return;
    }
    if (action === 'qty-inc' || action === 'qty-dec') {
      const est = activeEstimate();
      let qty = est.quantities[code] || 0;
      qty = action === 'qty-inc' ? qty + 1 : Math.max(0, qty - 1);
      setQty(code, qty);
      return;
    }
    if (action === 'show-all-mode') {
      setFilterMode(true);
      return;
    }
  });

  content.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.action === 'qty-input') {
      const val = parseFloat(el.value.replace(',', '.'));
      setQty(el.dataset.code, isNaN(val) || val < 0 ? 0 : val, true);
    }
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    renderContent();
  });

  document.getElementById('filterMineBtn').addEventListener('click', () => setFilterMode(false));
  document.getElementById('filterAllBtn').addEventListener('click', () => setFilterMode(true));

  // settings screen
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsBackBtn').addEventListener('click', closeSettings);
  document.getElementById('settingsAddBtn').addEventListener('click', () => openAddItemModal());
  document.getElementById('settingsShowAllBtn').addEventListener('click', () => {
    if (confirm('Показать все скрытые позиции?')) {
      hiddenCodes.clear();
      saveHiddenCodes();
      renderSettingsContent();
      renderContent();
    }
  });
  document.getElementById('settingsSearchInput').addEventListener('input', e => {
    settingsSearchQuery = e.target.value.trim();
    renderSettingsContent();
  });

  const settingsContent = document.getElementById('settingsContent');
  settingsContent.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const code = btn.dataset.code;
    if (action === 'toggle-hidden') {
      if (hiddenCodes.has(code)) hiddenCodes.delete(code); else hiddenCodes.add(code);
      saveHiddenCodes();
      renderSettingsContent();
      return;
    }
    if (action === 'delete-item') {
      if (confirm('Удалить эту позицию из прайса?')) {
        deleteCustomItem(code);
        renderSettingsContent();
      }
      return;
    }
  });
  settingsContent.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.action === 'price-input') {
      const val = parseFloat(el.value.replace(',', '.'));
      setPrice(el.dataset.code, isNaN(val) || val < 0 ? 0 : val);
    }
  });

  // side menu
  document.getElementById('menuBtn').addEventListener('click', openSideMenu);
  document.getElementById('closeMenuBtn').addEventListener('click', closeSideMenu);
  document.getElementById('sideMenuOverlay').addEventListener('click', closeSideMenu);
  document.getElementById('newEstimateBtn').addEventListener('click', () => {
    const e = newEstimateObj('Смета ' + (Object.keys(estimates).length + 1));
    estimates[e.id] = e;
    activeId = e.id;
    saveEstimates();
    saveActiveId();
    closeSideMenu();
    renderAll();
    openInfoModal();
  });

  // topbar title opens info modal
  document.querySelector('.topbar-title').addEventListener('click', openInfoModal);

  // info modal
  document.getElementById('infoCancelBtn').addEventListener('click', closeInfoModal);
  document.getElementById('infoModalOverlay').addEventListener('click', closeInfoModal);
  document.getElementById('infoSaveBtn').addEventListener('click', saveInfoModal);

  // add item modal
  document.getElementById('addItemCancelBtn').addEventListener('click', closeAddItemModal);
  document.getElementById('addItemOverlay').addEventListener('click', closeAddItemModal);
  document.getElementById('addItemSaveBtn').addEventListener('click', saveAddItemModal);

  // export / actions
  document.getElementById('printBtn').addEventListener('click', printEstimate);
  document.getElementById('excelBtn').addEventListener('click', exportExcel);
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Обнулить все количества в текущей смете?')) {
      activeEstimate().quantities = {};
      touchEstimate();
      renderAll();
    }
  });
}

function setQty(code, qty, skipInputSync) {
  const est = activeEstimate();
  const wasZero = (est.quantities[code] || 0) === 0;
  if (qty > 0) est.quantities[code] = qty; else delete est.quantities[code];
  touchEstimate();

  const found = findItem(code);
  if (!found) return;

  // Скрытая позиция появляется/исчезает из основного списка при переходе через 0 — перерисовываем список целиком.
  if (hiddenCodes.has(code) && !showAllMode && !searchQuery && (wasZero !== (qty === 0))) {
    renderContent();
    renderTotal();
    return;
  }

  const row = document.querySelector(`.item-row[data-code="${cssEscape(code)}"]`);
  if (row) {
    row.classList.toggle('active', qty > 0);
    const lt = row.querySelector('[data-role="line-total"]');
    if (lt) lt.textContent = qty > 0 ? formatMoney(qty * found.item.price) : '';
    if (!skipInputSync) {
      const input = row.querySelector('[data-action="qty-input"]');
      if (input) input.value = qty || '';
    }
    // update category badge
    const catEl = row.closest('.category');
    if (catEl) {
      const activeCount = found.cat.items.filter(i => (est.quantities[i.code] || 0) > 0).length;
      const badgeSpan = catEl.querySelector('.category-header span:first-child');
      badgeSpan.innerHTML = `${found.cat.title}${activeCount ? `<span class="cat-badge">${activeCount}</span>` : ''}`;
    }
  }
  renderTotal();
}

function setPrice(code, price) {
  const found = findItem(code);
  if (!found) return;
  found.item.price = price;
  savePriceData();
  const est = activeEstimate();
  const qty = est.quantities[code] || 0;
  const row = document.querySelector(`.item-row[data-code="${cssEscape(code)}"]`);
  if (row) {
    const lt = row.querySelector('[data-role="line-total"]');
    if (lt) lt.textContent = qty > 0 ? formatMoney(qty * price) : '';
  }
  renderTotal();
}

function cssEscape(s) {
  return s.replace(/[."]/g, '\\$&');
}

function touchEstimate() {
  activeEstimate().updatedAt = Date.now();
  saveEstimates();
}

// ---------- side menu ----------

function openSideMenu() {
  renderSideMenu();
  document.getElementById('sideMenu').classList.remove('hidden');
  document.getElementById('sideMenuOverlay').classList.remove('hidden');
}
function closeSideMenu() {
  document.getElementById('sideMenu').classList.add('hidden');
  document.getElementById('sideMenuOverlay').classList.add('hidden');
}

function renderSideMenu() {
  const list = document.getElementById('estimatesList');
  list.innerHTML = '';
  const sorted = Object.values(estimates).sort((a, b) => b.updatedAt - a.updatedAt);
  sorted.forEach(est => {
    const total = estimateTotal(est);
    const card = document.createElement('div');
    card.className = 'estimate-card' + (est.id === activeId ? ' active' : '');
    card.innerHTML = `
      <div class="estimate-card-main" data-action="switch-estimate" data-id="${est.id}">
        <div class="estimate-card-name">${escapeHtml(est.name)}</div>
        <div class="estimate-card-meta">${escapeHtml(est.client || 'без клиента')} · ${formatMoney(total)} BYN</div>
      </div>
      <button class="estimate-card-del" data-action="delete-estimate" data-id="${est.id}">🗑</button>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('[data-action="switch-estimate"]').forEach(el => {
    el.addEventListener('click', () => {
      activeId = el.dataset.id;
      saveActiveId();
      closeSideMenu();
      renderAll();
    });
  });
  list.querySelectorAll('[data-action="delete-estimate"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (Object.keys(estimates).length <= 1) {
        showToast('Нельзя удалить единственную смету');
        return;
      }
      if (confirm('Удалить эту смету безвозвратно?')) {
        const id = el.dataset.id;
        delete estimates[id];
        saveEstimates();
        if (activeId === id) {
          activeId = Object.keys(estimates).sort((a, b) => estimates[b].updatedAt - estimates[a].updatedAt)[0];
          saveActiveId();
        }
        renderSideMenu();
        renderAll();
      }
    });
  });
}

function estimateTotal(est) {
  let total = 0;
  priceData.categories.forEach(cat => {
    cat.items.forEach(item => {
      const qty = est.quantities[item.code] || 0;
      total += qty * item.price;
    });
  });
  return total;
}

// ---------- filter mode (Мои / Все) ----------

function setFilterMode(showAll) {
  showAllMode = showAll;
  saveShowAllMode();
  document.getElementById('filterMineBtn').classList.toggle('active', !showAllMode);
  document.getElementById('filterAllBtn').classList.toggle('active', showAllMode);
  renderContent();
}

// ---------- settings screen ----------

function openSettings() {
  settingsSearchQuery = '';
  document.getElementById('settingsSearchInput').value = '';
  renderSettingsContent();
  document.getElementById('settingsScreen').classList.remove('hidden');
}
function closeSettings() {
  document.getElementById('settingsScreen').classList.add('hidden');
  renderAll(); // подтягиваем возможные изменения цен/видимости в основной список
}

function renderSettingsContent() {
  const container = document.getElementById('settingsContent');
  container.innerHTML = '';
  let anyVisible = false;

  priceData.categories.forEach(cat => {
    const items = cat.items.filter(i => {
      if (!settingsSearchQuery) return true;
      const q = settingsSearchQuery.toLowerCase();
      return i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q);
    });
    if (items.length === 0) return;
    anyVisible = true;

    const catEl = document.createElement('div');
    catEl.className = 'category';
    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `<span>${escapeHtml(cat.title)}</span>`;
    catEl.appendChild(header);

    const itemsEl = document.createElement('div');
    itemsEl.className = 'items';
    items.forEach(item => itemsEl.appendChild(renderSettingsItemRow(item)));
    catEl.appendChild(itemsEl);
    container.appendChild(catEl);
  });

  if (!anyVisible) container.innerHTML = '<div class="empty-state">Ничего не найдено</div>';

  const bar = document.getElementById('settingsHiddenBar');
  if (hiddenCodes.size > 0) {
    bar.classList.remove('hidden');
    document.getElementById('settingsHiddenCount').textContent = `Скрыто позиций: ${hiddenCodes.size}`;
  } else {
    bar.classList.add('hidden');
  }
}

function renderSettingsItemRow(item) {
  const isHidden = hiddenCodes.has(item.code);
  const row = document.createElement('div');
  row.className = 'settings-item-row' + (isHidden ? ' is-hidden' : '');
  row.dataset.code = item.code;
  row.innerHTML = `
    <div class="settings-item-main">
      <div class="settings-item-name">${escapeHtml(item.name)}</div>
      <div class="settings-item-meta">${item.code} · ${escapeHtml(item.unit || '')}${item.custom ? ' · своя' : ''}</div>
    </div>
    <input class="settings-price-input" type="number" step="0.01" min="0" data-action="price-input" data-code="${item.code}" value="${item.price}">
    <button class="eye-btn${isHidden ? ' is-hidden' : ''}" data-action="toggle-hidden" data-code="${item.code}" title="${isHidden ? 'Показать' : 'Скрыть'}">${isHidden ? '🙈' : '👁'}</button>
    ${item.custom ? `<button class="settings-item-del" data-action="delete-item" data-code="${item.code}">✕</button>` : ''}
  `;
  return row;
}

// ---------- info modal ----------

function openInfoModal() {
  const est = activeEstimate();
  document.getElementById('infoName').value = est.name || '';
  document.getElementById('infoClient').value = est.client || '';
  document.getElementById('infoAddress').value = est.address || '';
  document.getElementById('infoDate').value = est.date || todayISO();
  document.getElementById('infoComment').value = est.comment || '';
  document.getElementById('infoModal').classList.remove('hidden');
  document.getElementById('infoModalOverlay').classList.remove('hidden');
}
function closeInfoModal() {
  document.getElementById('infoModal').classList.add('hidden');
  document.getElementById('infoModalOverlay').classList.add('hidden');
}
function saveInfoModal() {
  const est = activeEstimate();
  est.name = document.getElementById('infoName').value.trim() || 'Смета без названия';
  est.client = document.getElementById('infoClient').value.trim();
  est.address = document.getElementById('infoAddress').value.trim();
  est.date = document.getElementById('infoDate').value || todayISO();
  est.comment = document.getElementById('infoComment').value.trim();
  touchEstimate();
  closeInfoModal();
  renderTopbar();
  showToast('Сохранено');
}

// ---------- add item modal ----------

function openAddItemModal(defaultCatId) {
  const sel = document.getElementById('addItemCat');
  sel.innerHTML = priceData.categories.map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');
  if (defaultCatId) sel.value = defaultCatId;
  document.getElementById('addItemName').value = '';
  document.getElementById('addItemUnit').value = 'шт.';
  document.getElementById('addItemPrice').value = '';
  document.getElementById('addItemModal').classList.remove('hidden');
  document.getElementById('addItemOverlay').classList.remove('hidden');
}
function closeAddItemModal() {
  document.getElementById('addItemModal').classList.add('hidden');
  document.getElementById('addItemOverlay').classList.add('hidden');
}
function saveAddItemModal() {
  const catId = document.getElementById('addItemCat').value;
  const name = document.getElementById('addItemName').value.trim();
  const unit = document.getElementById('addItemUnit').value.trim();
  const price = parseFloat(document.getElementById('addItemPrice').value.replace(',', '.')) || 0;
  if (!name) { showToast('Укажите наименование работы'); return; }

  const cat = priceData.categories.find(c => c.id === catId);
  const code = 'c-' + uid();
  cat.items.push({ code, name, unit, price, custom: true });
  savePriceData();
  closeAddItemModal();
  if (!document.getElementById('settingsScreen').classList.contains('hidden')) {
    renderSettingsContent();
  } else {
    renderContent();
  }
  showToast('Позиция добавлена в прайс');
}

function deleteCustomItem(code) {
  priceData.categories.forEach(cat => {
    cat.items = cat.items.filter(i => i.code !== code);
  });
  savePriceData();
  hiddenCodes.delete(code);
  saveHiddenCodes();
  Object.values(estimates).forEach(est => { delete est.quantities[code]; });
  saveEstimates();
  renderContent();
  renderTotal();
}

// ---------- toast ----------

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toastActionBtn').classList.add('hidden');
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
}

// ---------- export: print / PDF ----------

function buildEstimateRows() {
  const est = activeEstimate();
  const rows = [];
  priceData.categories.forEach(cat => {
    const catItems = cat.items.filter(i => (est.quantities[i.code] || 0) > 0);
    if (catItems.length === 0) return;
    rows.push({ type: 'cat', title: cat.title });
    catItems.forEach(item => {
      const qty = est.quantities[item.code];
      rows.push({
        type: 'item',
        code: item.code,
        name: item.name,
        unit: item.unit,
        price: item.price,
        qty,
        sum: qty * item.price
      });
    });
  });
  return rows;
}

function printEstimate() {
  const est = activeEstimate();
  const rows = buildEstimateRows();
  if (rows.length === 0) {
    showToast('В смете пока нет позиций с количеством');
    return;
  }
  const total = computeTotal();

  let html = `<h1>${escapeHtml(est.name)}</h1>`;
  const metaBits = [];
  if (est.client) metaBits.push('Клиент: ' + escapeHtml(est.client));
  if (est.address) metaBits.push('Объект: ' + escapeHtml(est.address));
  metaBits.push('Дата: ' + (est.date || todayISO()));
  html += `<div class="meta">${metaBits.join(' &nbsp;·&nbsp; ')}</div>`;
  if (est.comment) html += `<div class="meta">${escapeHtml(est.comment)}</div>`;

  html += '<table><thead><tr><th>№</th><th>Наименование работ</th><th>Ед. изм.</th><th>Цена, BYN</th><th>Кол-во</th><th>Сумма, BYN</th></tr></thead><tbody>';
  rows.forEach(r => {
    if (r.type === 'cat') {
      html += `<tr class="cat-row"><td colspan="6">${escapeHtml(r.title)}</td></tr>`;
    } else {
      html += `<tr><td>${r.code}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.unit || '')}</td><td>${formatMoney(r.price)}</td><td>${r.qty}</td><td>${formatMoney(r.sum)}</td></tr>`;
    }
  });
  html += `<tr class="total-row"><td colspan="5">ИТОГО</td><td>${formatMoney(total)}</td></tr>`;
  html += '</tbody></table>';

  document.getElementById('printView').innerHTML = html;
  window.print();
}

// ---------- export: excel ----------

let xlsxLoadPromise = null;
function loadXLSXLib() {
  if (window.XLSX) return Promise.resolve();
  if (xlsxLoadPromise) return xlsxLoadPromise;
  xlsxLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('offline'));
    document.head.appendChild(s);
  });
  return xlsxLoadPromise;
}

async function exportExcel() {
  const rows = buildEstimateRows();
  if (rows.length === 0) {
    showToast('В смете пока нет позиций с количеством');
    return;
  }
  try {
    await loadXLSXLib();
  } catch (e) {
    showToast('Нужен интернет для экспорта в Excel');
    return;
  }
  const est = activeEstimate();
  const aoa = [['№', 'Наименование работ', 'Ед. изм.', 'Цена BYN', 'Кол-во', 'Сумма']];
  rows.forEach(r => {
    if (r.type === 'cat') aoa.push([r.title, '', '', '', '', '']);
    else aoa.push([r.code, r.name, r.unit, r.price, r.qty, r.sum]);
  });
  aoa.push(['', '', '', '', 'ИТОГО', computeTotal()]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 50 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Смета');
  const filename = (est.name || 'Смета').replace(/[\\/:*?"<>|]/g, '_') + '.xlsx';
  XLSX.writeFile(wb, filename);
}

// ---------- service worker ----------

function registerServiceWorker() {
  const versionLabel = document.getElementById('appVersionLabel');
  if (versionLabel) versionLabel.textContent = 'Смета электрика · v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?');

  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(reg);
        }
      });
    });
  }).catch(() => {});

  let refreshingAfterUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingAfterUpdate) return;
    refreshingAfterUpdate = true;
    window.location.reload();
  });
}

function showUpdateBanner(reg) {
  const banner = document.getElementById('updateBanner');
  banner.classList.remove('hidden');
  document.getElementById('updateReloadBtn').onclick = () => {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  };
}

document.addEventListener('DOMContentLoaded', init);
