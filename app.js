/* Смета электрика — логика приложения. Все данные хранятся локально (localStorage). */

const LS_PRICE = 'smeta:priceData';
const LS_ESTIMATES = 'smeta:estimates';
const LS_ACTIVE = 'smeta:activeId';
const LS_HIDDEN = 'smeta:hiddenCodes';
const LS_SHOW_ALL = 'smeta:showAllMode';
const LS_PRINT_HEADER = 'smeta:printHeaderTheme';

let priceData = null;      // {categories:[{id,title,items:[{code,name,unit,price,custom}]}]}
let estimates = {};        // {id: estimate}
let activeId = null;
let collapsedCats = new Set();
let searchQuery = '';
let hiddenCodes = new Set();   // коды позиций, скрытых пользователем из основного списка
let showAllMode = false;       // false = показывать только "Мои" (не скрытые), true = "Все"
let settingsSearchQuery = '';
let printHeaderTheme = 'dark'; // 'dark' | 'light' — какую картинку вставлять в шапку печати/PDF

// ---------- storage ----------

// Добавляет в сохранённый у пользователя прайс новые позиции/разделы, которые появились
// в DEFAULT_PRICE_DATA после обновления приложения (например, новая работа в прайсе).
// Собственные цены пользователя, скрытые позиции и добавленные им свои работы не трогаем.
function mergeNewDefaultItems(stored) {
  let changed = false;
  DEFAULT_PRICE_DATA.categories.forEach(defCat => {
    let cat = stored.categories.find(c => c.id === defCat.id);
    if (!cat) {
      stored.categories.push(JSON.parse(JSON.stringify(defCat)));
      changed = true;
      return;
    }
    defCat.items.forEach(defItem => {
      const exists = cat.items.some(i => i.code === defItem.code);
      if (!exists) {
        cat.items.push(JSON.parse(JSON.stringify(defItem)));
        changed = true;
      }
    });
  });
  return changed;
}

function loadPriceData() {
  const raw = localStorage.getItem(LS_PRICE);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (mergeNewDefaultItems(parsed)) {
        localStorage.setItem(LS_PRICE, JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) { /* fall through */ }
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
  else localStorage.removeItem(LS_ACTIVE);
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

const PRINT_HEADER_THEMES = ['dark', 'light', 'kids', 'none'];
function loadPrintHeaderTheme() {
  const v = localStorage.getItem(LS_PRINT_HEADER);
  return PRINT_HEADER_THEMES.includes(v) ? v : 'dark';
}
function savePrintHeaderTheme() {
  localStorage.setItem(LS_PRINT_HEADER, printHeaderTheme);
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
  printHeaderTheme = loadPrintHeaderTheme();

  activeId = localStorage.getItem(LS_ACTIVE);
  if (!activeId || !estimates[activeId]) {
    const remaining = Object.keys(estimates).sort((a, b) => estimates[b].updatedAt - estimates[a].updatedAt);
    activeId = remaining.length > 0 ? remaining[0] : null;
  }
  saveActiveId();

  bindEvents();
  document.getElementById('filterMineBtn').classList.toggle('active', !showAllMode);
  document.getElementById('filterAllBtn').classList.toggle('active', showAllMode);
  renderAll();
  registerServiceWorker();
}

function activeEstimate() {
  return activeId ? estimates[activeId] : null;
}

// Создаёт новую смету, делает её активной и сразу открывает форму «Данные сметы»,
// чтобы смета не оставалась безымянной болванкой без клиента/адреса.
function createNewEstimateFlow() {
  const e = newEstimateObj('Смета ' + (Object.keys(estimates).length + 1));
  estimates[e.id] = e;
  activeId = e.id;
  saveEstimates();
  saveActiveId();
  closeSideMenu();
  renderAll();
  openInfoModal();
}

// ---------- rendering ----------

function renderAll() {
  const hasEstimate = !!activeEstimate();
  document.getElementById('searchBar').classList.toggle('hidden', !hasEstimate);
  document.getElementById('comboBar').classList.toggle('hidden', !hasEstimate);
  document.getElementById('content').classList.toggle('hidden', !hasEstimate);
  document.querySelector('.totalbar').classList.toggle('hidden', !hasEstimate);
  document.getElementById('emptyEstimateState').classList.toggle('hidden', hasEstimate);

  renderTopbar();
  if (hasEstimate) {
    renderContent();
    renderTotal();
  }
}

function renderTopbar() {
  const est = activeEstimate();
  const editBtn = document.getElementById('editInfoBtn');
  if (!est) {
    document.getElementById('estimateName').textContent = 'Нет активных смет';
    document.getElementById('estimateSub').textContent = 'Нажмите, чтобы создать смету';
    editBtn.classList.add('hidden');
    return;
  }
  editBtn.classList.remove('hidden');
  document.getElementById('estimateName').textContent = est.name;
  const bits = [];
  if (est.client) bits.push(est.client);
  if (est.address) bits.push(est.address);
  document.getElementById('estimateSub').textContent = bits.join(' · ') || 'Нажмите ✏️ для данных сметы';
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
  if (!est) return 0;
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
  document.getElementById('exportSettingsBtn').addEventListener('click', exportSettings);
  document.getElementById('importSettingsBtn').addEventListener('click', () => {
    document.getElementById('importSettingsFileInput').click();
  });
  document.getElementById('importSettingsFileInput').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportSettingsFile(file);
    e.target.value = '';
  });
  document.querySelectorAll('.print-header-option').forEach(btn => {
    btn.addEventListener('click', () => {
      printHeaderTheme = btn.dataset.theme;
      savePrintHeaderTheme();
      renderPrintHeaderPicker();
    });
  });
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
  document.getElementById('newEstimateBtn').addEventListener('click', createNewEstimateFlow);
  document.getElementById('emptyCreateEstimateBtn').addEventListener('click', createNewEstimateFlow);

  // topbar: клик по названию или по значку ✏️ открывает данные сметы;
  // если активной сметы нет — сразу предлагаем создать новую
  document.querySelector('.topbar-title').addEventListener('click', () => {
    if (activeEstimate()) openInfoModal(); else createNewEstimateFlow();
  });
  document.getElementById('editInfoBtn').addEventListener('click', openInfoModal);

  // info modal
  document.getElementById('infoCancelBtn').addEventListener('click', closeInfoModal);
  document.getElementById('infoModalOverlay').addEventListener('click', closeInfoModal);
  document.getElementById('infoSaveBtn').addEventListener('click', saveInfoModal);

  // add item modal
  document.getElementById('addItemCancelBtn').addEventListener('click', closeAddItemModal);
  document.getElementById('addItemOverlay').addEventListener('click', closeAddItemModal);
  document.getElementById('addItemSaveBtn').addEventListener('click', saveAddItemModal);

  // импорт / экспорт смет
  document.getElementById('importEstimateBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImportFile(file);
  });
  document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
  document.getElementById('importModalOverlay').addEventListener('click', closeImportModal);
  document.getElementById('importConfirmBtn').addEventListener('click', confirmImport);

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
  const qty = est ? (est.quantities[code] || 0) : 0;
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
  const est = activeEstimate();
  if (!est) return;
  est.updatedAt = Date.now();
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
  if (sorted.length === 0) {
    list.innerHTML = '<div class="estimates-list-empty">Смет пока нет — создайте первую</div>';
  }
  sorted.forEach(est => {
    const total = estimateTotal(est);
    const card = document.createElement('div');
    card.className = 'estimate-card' + (est.id === activeId ? ' active' : '');
    card.innerHTML = `
      <div class="estimate-card-main" data-action="switch-estimate" data-id="${est.id}">
        <div class="estimate-card-name">${escapeHtml(est.name)}</div>
        <div class="estimate-card-meta">${escapeHtml(est.client || 'без клиента')} · ${formatMoney(total)} BYN</div>
      </div>
      <button class="estimate-card-export" data-action="export-estimate" data-id="${est.id}" title="Сохранить в файл">📤</button>
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
  list.querySelectorAll('[data-action="export-estimate"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      exportEstimate(el.dataset.id);
    });
  });
  list.querySelectorAll('[data-action="delete-estimate"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Удалить эту смету безвозвратно?')) {
        const id = el.dataset.id;
        delete estimates[id];
        saveEstimates();
        if (activeId === id) {
          const remaining = Object.keys(estimates).sort((a, b) => estimates[b].updatedAt - estimates[a].updatedAt);
          activeId = remaining.length > 0 ? remaining[0] : null;
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
  renderPrintHeaderPicker();
  document.getElementById('settingsScreen').classList.remove('hidden');
}

function renderPrintHeaderPicker() {
  document.querySelectorAll('.print-header-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === printHeaderTheme);
  });
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
  if (!est) return;
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
  if (!est) return;
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
  const itemsCount = rows.filter(r => r.type === 'item').length;

  const bannerHtml = printHeaderTheme === 'none'
    ? ''
    : `<div class="print-banner"><img src="assets/header-${printHeaderTheme}.jpg" alt="Смета электрика" class="print-banner-img"></div>`;

  let html = `
    ${bannerHtml}
    <div class="print-header">
      <div class="print-titleblock">
        <h1>${escapeHtml(est.name)}</h1>
        <div class="subtitle">Смета на электромонтажные работы &nbsp;·&nbsp; ${itemsCount} ${itemsWord(itemsCount)}</div>
      </div>
      <div class="print-meta">
        ${est.client ? `<div class="print-meta-row"><span class="lbl">Клиент</span><span class="val">${escapeHtml(est.client)}</span></div>` : ''}
        ${est.address ? `<div class="print-meta-row"><span class="lbl">Объект</span><span class="val">${escapeHtml(est.address)}</span></div>` : ''}
        <div class="print-meta-row"><span class="lbl">Дата</span><span class="val">${est.date || todayISO()}</span></div>
      </div>
    </div>`;
  if (est.comment) html += `<div class="print-comment">${escapeHtml(est.comment)}</div>`;

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

  html += `
    <div class="print-footer">
      <div class="print-sign"><div class="line"></div><div class="cap">Исполнитель &nbsp;/&nbsp; подпись, ФИО</div></div>
      <div class="print-sign"><div class="line"></div><div class="cap">Заказчик &nbsp;/&nbsp; подпись, ФИО</div></div>
    </div>
    <div class="print-page-footer">Смета электрика &nbsp;·&nbsp; сформировано ${todayISO()}</div>`;

  document.getElementById('printView').innerHTML = html;
  window.print();
}

function itemsWord(n) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'позиция';
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'позиции';
  return 'позиций';
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

// ---------- резервная копия настроек (прайс, скрытые, тема шапки) ----------

function exportSettings() {
  const payload = {
    type: 'smeta-elektrika-settings',
    formatVersion: 1,
    appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
    exportedAt: new Date().toISOString(),
    priceData,
    hiddenCodes: [...hiddenCodes],
    printHeaderTheme,
    showAllMode
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'smeta-nastroyki-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Настройки сохранены в файл');
}

function handleImportSettingsFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let payload;
    try { payload = JSON.parse(reader.result); }
    catch (e) { showToast('Файл повреждён или не является настройками'); return; }
    if (!payload || payload.type !== 'smeta-elektrika-settings' || !payload.priceData || !Array.isArray(payload.priceData.categories)) {
      showToast('Это не файл настроек «Смета электрика»');
      return;
    }

    const itemsCount = payload.priceData.categories.reduce((a, c) => a + c.items.length, 0);
    const customCount = payload.priceData.categories.reduce((a, c) => a + c.items.filter(i => i.custom).length, 0);
    const hiddenCount = (payload.hiddenCodes || []).length;

    const ok = confirm(
      `Импортировать настройки?\n\n` +
      `Позиций в прайсе: ${itemsCount} (из них своих: ${customCount})\n` +
      `Скрытых позиций: ${hiddenCount}\n\n` +
      `Текущий прайс, свои позиции и список скрытых будут заменены на данные из файла. ` +
      `Позиции в уже созданных сметах, которых не окажется в новом прайсе, перестанут отображаться и учитываться в сумме.`
    );
    if (!ok) return;

    priceData = payload.priceData;
    savePriceData();

    hiddenCodes = new Set(payload.hiddenCodes || []);
    saveHiddenCodes();

    if (PRINT_HEADER_THEMES.includes(payload.printHeaderTheme)) {
      printHeaderTheme = payload.printHeaderTheme;
      savePrintHeaderTheme();
    }
    if (typeof payload.showAllMode === 'boolean') {
      showAllMode = payload.showAllMode;
      saveShowAllMode();
      document.getElementById('filterMineBtn').classList.toggle('active', !showAllMode);
      document.getElementById('filterAllBtn').classList.toggle('active', showAllMode);
    }

    renderSettingsContent();
    renderPrintHeaderPicker();
    renderAll();
    showToast('Настройки импортированы');
  };
  reader.readAsText(file, 'utf-8');
}

// ---------- импорт / экспорт смет ----------

function exportEstimate(id) {
  const est = estimates[id];
  if (!est) return;
  const prices = {};
  Object.keys(est.quantities || {}).forEach(code => {
    const found = findItem(code);
    if (found) prices[code] = { name: found.item.name, unit: found.item.unit, price: found.item.price };
  });
  const payload = {
    type: 'smeta-elektrika-estimate',
    formatVersion: 1,
    appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
    exportedAt: new Date().toISOString(),
    estimate: {
      name: est.name,
      client: est.client,
      address: est.address,
      date: est.date,
      comment: est.comment,
      quantities: est.quantities
    },
    prices
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (est.name || 'Смета').replace(/[\\/:*?"<>|]/g, '_') + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Файл сметы сохранён');
}

let pendingImport = null; // { payload, diffs, newItems }

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let payload;
    try { payload = JSON.parse(reader.result); }
    catch (e) { showToast('Файл повреждён или не является сметой'); return; }
    if (!payload || payload.type !== 'smeta-elektrika-estimate' || !payload.estimate) {
      showToast('Это не файл сметы «Смета электрика»');
      return;
    }

    const quantities = payload.estimate.quantities || {};
    const filePrices = payload.prices || {};
    const diffs = [];
    const newItems = [];

    Object.keys(quantities).forEach(code => {
      const meta = filePrices[code];
      const found = findItem(code);
      if (!found) {
        newItems.push({
          code,
          name: (meta && meta.name) || code,
          unit: (meta && meta.unit) || '',
          price: (meta && typeof meta.price === 'number') ? meta.price : 0
        });
        return;
      }
      if (meta && typeof meta.price === 'number' && Math.abs(meta.price - found.item.price) > 0.001) {
        diffs.push({ code, name: found.item.name, unit: found.item.unit, filePrice: meta.price, currentPrice: found.item.price });
      }
    });

    pendingImport = { payload, diffs, newItems };
    openImportModal();
  };
  reader.readAsText(file, 'utf-8');
}

function openImportModal() {
  const { payload, diffs, newItems } = pendingImport;
  const quantities = payload.estimate.quantities || {};
  const itemsCount = Object.keys(quantities).length;

  const summary = document.getElementById('importSummary');
  summary.innerHTML = `
    <div class="import-summary-title">${escapeHtml(payload.estimate.name || 'Смета без названия')}</div>
    <div class="import-summary-sub">${itemsCount} ${itemsWord(itemsCount)}${payload.estimate.client ? ' · ' + escapeHtml(payload.estimate.client) : ''}</div>
  `;

  const listEl = document.getElementById('importDiffList');
  listEl.innerHTML = '';

  if (newItems.length > 0) {
    const note = document.createElement('div');
    note.className = 'import-note';
    note.textContent = `Новых позиций, которых нет в вашем прайсе (добавим автоматически): ${newItems.length}`;
    listEl.appendChild(note);
  }

  if (diffs.length === 0) {
    const ok = document.createElement('div');
    ok.className = 'import-note';
    ok.textContent = 'Цены совпадают с вашим текущим прайсом — расхождений нет.';
    listEl.appendChild(ok);
  } else {
    const bulk = document.createElement('div');
    bulk.className = 'import-diff-bulk';
    bulk.innerHTML = `
      <span>Цены отличаются — ${diffs.length} поз.:</span>
      <button type="button" data-bulk="current">Оставить наши</button>
      <button type="button" data-bulk="file">Взять из файла</button>
    `;
    listEl.appendChild(bulk);
    bulk.querySelector('[data-bulk="current"]').addEventListener('click', () => setAllDiffChoice('current'));
    bulk.querySelector('[data-bulk="file"]').addEventListener('click', () => setAllDiffChoice('file'));

    diffs.forEach((d, idx) => {
      const row = document.createElement('div');
      row.className = 'import-diff-row';
      row.innerHTML = `
        <div class="import-diff-name">${escapeHtml(d.name)} <span class="import-diff-code">${d.code}</span></div>
        <label class="import-diff-opt"><input type="radio" name="diff-${idx}" value="current" checked> Наша цена: ${formatMoney(d.currentPrice)} BYN</label>
        <label class="import-diff-opt"><input type="radio" name="diff-${idx}" value="file"> Из файла: ${formatMoney(d.filePrice)} BYN</label>
      `;
      listEl.appendChild(row);
    });
  }

  document.getElementById('importModal').classList.remove('hidden');
  document.getElementById('importModalOverlay').classList.remove('hidden');
}

function setAllDiffChoice(value) {
  document.querySelectorAll('#importDiffList .import-diff-row').forEach(row => {
    const radio = row.querySelector(`input[value="${value}"]`);
    if (radio) radio.checked = true;
  });
}

function closeImportModal() {
  document.getElementById('importModal').classList.add('hidden');
  document.getElementById('importModalOverlay').classList.add('hidden');
  pendingImport = null;
  document.getElementById('importFileInput').value = '';
}

function confirmImport() {
  if (!pendingImport) return;
  const { payload, diffs, newItems } = pendingImport;
  let priceListChanged = false;

  diffs.forEach((d, idx) => {
    const checked = document.querySelector(`input[name="diff-${idx}"]:checked`);
    const choice = checked ? checked.value : 'current';
    if (choice === 'file') {
      const found = findItem(d.code);
      if (found) { found.item.price = d.filePrice; priceListChanged = true; }
    }
  });

  if (newItems.length > 0) {
    const cat = priceData.categories[priceData.categories.length - 1];
    newItems.forEach(ni => {
      cat.items.push({ code: ni.code, name: ni.name, unit: ni.unit, price: ni.price, custom: true });
    });
    priceListChanged = true;
  }

  if (priceListChanged) savePriceData();

  const est = newEstimateObj(payload.estimate.name || 'Импортированная смета');
  est.client = payload.estimate.client || '';
  est.address = payload.estimate.address || '';
  est.date = payload.estimate.date || todayISO();
  est.comment = payload.estimate.comment || '';
  est.quantities = Object.assign({}, payload.estimate.quantities || {});
  estimates[est.id] = est;
  activeId = est.id;
  saveEstimates();
  saveActiveId();

  closeImportModal();
  closeSideMenu();
  renderAll();
  showToast('Смета импортирована');
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
