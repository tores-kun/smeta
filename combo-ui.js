/* Комбо-работы: панель быстрого ввода + шторка с параметрами. Использует функции из app.js
   (activeEstimate, findItem, touchEstimate, renderContent, renderTotal, escapeHtml, formatMoney). */

let combos = [];
let comboSheetState = null; // { combo, selections, inputValues, multiplier }
let lastComboApply = null;  // { previous: {code: qty} } — для кнопки "Отменить"

function initCombos() {
  combos = loadCombos();
  renderComboBar();
  bindComboEvents();
}

function renderComboBar() {
  const bar = document.getElementById('comboBar');
  bar.innerHTML = '';
  combos.forEach(combo => {
    const btn = document.createElement('button');
    btn.className = 'combo-chip';
    btn.dataset.comboId = combo.id;
    btn.innerHTML = `<span>${combo.icon || '⚡'}</span><span>${escapeHtml(combo.name)}</span>`;
    bar.appendChild(btn);
  });
}

function matchesWhen(when, selections) {
  if (!when) return true;
  return Object.entries(when).every(([k, v]) => selections[k] === v);
}

function computeComboLines(combo, selections, inputValues, multiplier) {
  const lines = [];
  combo.lines.forEach(line => {
    if (!matchesWhen(line.when, selections)) return;
    let qty;
    if (line.qty !== undefined) qty = line.qty;
    else if (line.fromInput) qty = Number(inputValues[line.fromInput]) || 0;
    else if (line.fromInputTimes) qty = (Number(inputValues[line.fromInputTimes.input]) || 0) * line.fromInputTimes.factor;
    else qty = 0;
    qty = qty * multiplier;
    if (qty <= 0) return;
    const found = findItem(line.code);
    if (!found) return;
    lines.push({ code: line.code, name: found.item.name, unit: found.item.unit, price: found.item.price, qty, sum: qty * found.item.price });
  });
  return lines;
}

// ---------- combo sheet (параметрические комбо) ----------

function openComboSheet(combo) {
  const selections = {};
  combo.params.forEach(p => { selections[p.id] = p.options[0].id; });
  const inputValues = {};
  (combo.inputs || []).forEach(i => { inputValues[i.id] = i.default; });
  comboSheetState = { combo, selections, inputValues, multiplier: 1 };
  renderComboSheet();
  document.getElementById('comboSheet').classList.remove('hidden');
  document.getElementById('comboSheetOverlay').classList.remove('hidden');
}

function closeComboSheet() {
  comboSheetState = null;
  document.getElementById('comboSheet').classList.add('hidden');
  document.getElementById('comboSheetOverlay').classList.add('hidden');
}

function renderComboSheet() {
  const { combo, selections, inputValues, multiplier } = comboSheetState;

  document.getElementById('comboSheetTitle').textContent = combo.name;

  const paramsEl = document.getElementById('comboSheetParams');
  paramsEl.innerHTML = '';
  combo.params.forEach(param => {
    const group = document.createElement('div');
    group.className = 'combo-param-group';
    const optsHtml = param.options.map(opt =>
      `<button type="button" class="combo-option-btn${selections[param.id] === opt.id ? ' active' : ''}" data-param="${param.id}" data-option="${opt.id}">${escapeHtml(opt.label)}</button>`
    ).join('');
    group.innerHTML = `<div class="combo-param-label">${escapeHtml(param.label)}</div><div class="combo-options">${optsHtml}</div>`;
    paramsEl.appendChild(group);
  });

  const inputsEl = document.getElementById('comboSheetInputs');
  inputsEl.innerHTML = '';
  (combo.inputs || []).forEach(input => {
    const group = document.createElement('div');
    group.className = 'combo-input-group';
    group.innerHTML = `<label>${escapeHtml(input.label)}</label><input type="number" min="0" step="any" data-combo-input="${input.id}" value="${inputValues[input.id]}">`;
    inputsEl.appendChild(group);
  });

  document.getElementById('comboMultiplierLabel').textContent = combo.multiplierLabel || 'Количество';
  document.getElementById('comboMultInput').value = multiplier;

  renderComboPreview();
}

function renderComboPreview() {
  const { combo, selections, inputValues, multiplier } = comboSheetState;
  const lines = computeComboLines(combo, selections, inputValues, multiplier);
  const preview = document.getElementById('comboSheetPreview');
  if (lines.length === 0) {
    preview.innerHTML = '<div class="combo-preview-empty">Укажите параметры — здесь появится список позиций</div>';
    return;
  }
  let html = lines.map(l => `<div class="combo-preview-row"><span>${l.code} ${escapeHtml(l.name)} × ${l.qty}</span><span>${formatMoney(l.sum)} BYN</span></div>`).join('');
  const total = lines.reduce((a, l) => a + l.sum, 0);
  html += `<div class="combo-preview-total"><span>Добавится к смете</span><span>+${formatMoney(total)} BYN</span></div>`;
  preview.innerHTML = html;
}

function bindComboEvents() {
  document.getElementById('comboBar').addEventListener('click', e => {
    const btn = e.target.closest('[data-combo-id]');
    if (!btn) return;
    const combo = combos.find(c => c.id === btn.dataset.comboId);
    if (!combo) return;
    if (combo.type === 'template') {
      applyTemplateCombo(combo);
    } else {
      openComboSheet(combo);
    }
  });

  const paramsEl = document.getElementById('comboSheetParams');
  paramsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-param]');
    if (!btn || !comboSheetState) return;
    comboSheetState.selections[btn.dataset.param] = btn.dataset.option;
    renderComboSheet();
  });

  const inputsEl = document.getElementById('comboSheetInputs');
  inputsEl.addEventListener('input', e => {
    const el = e.target.closest('[data-combo-input]');
    if (!el || !comboSheetState) return;
    comboSheetState.inputValues[el.dataset.comboInput] = parseFloat(el.value.replace(',', '.')) || 0;
    renderComboPreview();
  });

  document.getElementById('comboMultDec').addEventListener('click', () => {
    if (!comboSheetState) return;
    comboSheetState.multiplier = Math.max(1, comboSheetState.multiplier - 1);
    document.getElementById('comboMultInput').value = comboSheetState.multiplier;
    renderComboPreview();
  });
  document.getElementById('comboMultInc').addEventListener('click', () => {
    if (!comboSheetState) return;
    comboSheetState.multiplier += 1;
    document.getElementById('comboMultInput').value = comboSheetState.multiplier;
    renderComboPreview();
  });
  document.getElementById('comboMultInput').addEventListener('input', e => {
    if (!comboSheetState) return;
    const val = parseInt(e.target.value, 10);
    comboSheetState.multiplier = isNaN(val) || val < 1 ? 1 : val;
    renderComboPreview();
  });

  document.getElementById('comboSheetCancelBtn').addEventListener('click', closeComboSheet);
  document.getElementById('comboSheetOverlay').addEventListener('click', closeComboSheet);
  document.getElementById('comboSheetAddBtn').addEventListener('click', () => {
    if (!comboSheetState) return;
    const { combo, selections, inputValues, multiplier } = comboSheetState;
    const lines = computeComboLines(combo, selections, inputValues, multiplier);
    if (lines.length === 0) {
      showToast('Нечего добавлять — проверьте параметры');
      return;
    }
    applyComboLines(lines, combo.name);
    closeComboSheet();
  });
}

// ---------- шаблонные комбо (без параметров) ----------

function applyTemplateCombo(combo) {
  const lines = combo.lines.map(l => {
    const found = findItem(l.code);
    if (!found) return null;
    return { code: l.code, name: found.item.name, unit: found.item.unit, price: found.item.price, qty: l.qty, sum: l.qty * found.item.price };
  }).filter(Boolean);
  if (lines.length === 0) return;
  applyComboLines(lines, combo.name);
}

// ---------- применение к смете + отмена ----------

function applyComboLines(lines, comboName) {
  const est = activeEstimate();
  const previous = {};
  lines.forEach(l => { previous[l.code] = est.quantities[l.code] || 0; });
  lines.forEach(l => {
    const newQty = (est.quantities[l.code] || 0) + l.qty;
    if (newQty > 0) est.quantities[l.code] = newQty; else delete est.quantities[l.code];
  });
  touchEstimate();
  renderContent();
  renderTotal();

  lastComboApply = { previous };
  const addedSum = lines.reduce((a, l) => a + l.sum, 0);
  showComboToast(`«${comboName}»: добавлено ${lines.length} поз. (+${formatMoney(addedSum)} BYN)`, 'Отменить', undoLastCombo);
}

function undoLastCombo() {
  if (!lastComboApply) return;
  const est = activeEstimate();
  Object.entries(lastComboApply.previous).forEach(([code, qty]) => {
    if (qty > 0) est.quantities[code] = qty; else delete est.quantities[code];
  });
  touchEstimate();
  renderContent();
  renderTotal();
  lastComboApply = null;
  showToast('Отменено');
}

function showComboToast(msg, actionLabel, actionFn) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  const actionBtn = document.getElementById('toastActionBtn');
  actionBtn.textContent = actionLabel;
  actionBtn.classList.remove('hidden');
  actionBtn.onclick = () => {
    actionFn();
    t.classList.add('hidden');
  };
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 5000);
}

document.addEventListener('DOMContentLoaded', initCombos);
