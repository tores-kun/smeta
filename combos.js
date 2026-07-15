// Комбо-работы — "умные" сборные позиции: пользователь указывает параметры и количество,
// а приложение само проставляет нужные строки в смету (см. ПЛАН-развития.md, раздел 3).

const DEFAULT_COMBOS = [
  {
    id: 'combo_socket',
    type: 'param',
    icon: '🔌',
    name: 'Точка розетки/выключателя',
    multiplierLabel: 'Количество точек',
    params: [
      { id: 'material', label: 'Материал стены', options: [
        { id: 'beton', label: 'Бетон' }, { id: 'kirpich', label: 'Кирпич' }, { id: 'gs', label: 'Г/силикат' }
      ] },
      { id: 'mount', label: 'Установка', options: [
        { id: 'flush', label: 'Скрытая' }, { id: 'open', label: 'Открытая' }
      ] }
    ],
    inputs: [
      { id: 'cable', label: 'Кабель на точку, м (1,5-2,5 мм²)', default: 0 }
    ],
    lines: [
      { code: '1.1', qty: 1, when: { material: 'beton', mount: 'flush' } },
      { code: '1.2', qty: 1, when: { material: 'kirpich', mount: 'flush' } },
      { code: '1.3', qty: 1, when: { material: 'gs', mount: 'flush' } },
      { code: '3.2', qty: 1, when: { mount: 'flush' } },
      { code: '3.3', qty: 1, when: { mount: 'flush' } },
      { code: '3.4', qty: 1, when: { mount: 'open' } },
      { code: '2.4', fromInput: 'cable' }
    ]
  },
  {
    id: 'combo_light',
    type: 'param',
    icon: '💡',
    name: 'Точка освещения',
    multiplierLabel: 'Количество светильников',
    params: [
      { id: 'material', label: 'Материал стены/потолка (штроба)', options: [
        { id: 'beton', label: 'Бетон' }, { id: 'kirpich', label: 'Кирпич' }, { id: 'gs', label: 'Пеноблок/г-силикат' }
      ] },
      { id: 'fixture', label: 'Светильник', options: [
        { id: 'tochechny', label: 'Точечный' }, { id: 'bra', label: 'Бра/люстра простая' },
        { id: 'slozhnaya', label: 'Сложная люстра' }, { id: 'armstrong', label: 'Армстронг' },
        { id: 'nakladnoy', label: 'Накладной' }
      ] }
    ],
    inputs: [
      { id: 'length', label: 'Штроба + кабель на точку, м', default: 3 }
    ],
    lines: [
      { code: '1.4', fromInput: 'length', when: { material: 'beton' } },
      { code: '1.6', fromInput: 'length', when: { material: 'kirpich' } },
      { code: '1.8', fromInput: 'length', when: { material: 'gs' } },
      { code: '2.4', fromInput: 'length' },
      { code: '5.4', qty: 1, when: { fixture: 'tochechny' } },
      { code: '5.5', qty: 1, when: { fixture: 'bra' } },
      { code: '5.6', qty: 1, when: { fixture: 'slozhnaya' } },
      { code: '5.7', qty: 1, when: { fixture: 'armstrong' } },
      { code: '5.8', qty: 1, when: { fixture: 'nakladnoy' } }
    ]
  },
  {
    id: 'combo_panel',
    type: 'param',
    icon: '🗄',
    name: 'Щит «под ключ»',
    multiplierLabel: 'Количество щитов',
    params: [
      { id: 'panelType', label: 'Тип щита', options: [
        { id: 'uchet', label: 'Щит учёта' }, { id: 'prostoy', label: 'Обычный щит' }
      ] },
      { id: 'meter', label: 'Счётчик', options: [
        { id: 'none', label: 'Без счётчика' }, { id: 'odnofaz', label: 'Однофазный' }, { id: 'trehfaz', label: 'Трёхфазный' }
      ] },
      { id: 'niche', label: 'Ниша под щит', options: [
        { id: 'none', label: 'Без ниши' }, { id: 'beton', label: 'Бетон' }, { id: 'kirpich', label: 'Кирпич' }, { id: 'penoblok', label: 'Пеноблок' }
      ] }
    ],
    inputs: [
      { id: 'modules', label: 'Модулей автоматики', default: 0 },
      { id: 'lines_out', label: 'Отходящих линий (жилы + прозвонка)', default: 0 }
    ],
    lines: [
      { code: '4.1', qty: 1, when: { panelType: 'uchet' } },
      { code: '4.2', qty: 1, when: { panelType: 'prostoy' } },
      { code: '4.3', qty: 1, when: { meter: 'odnofaz' } },
      { code: '4.4', qty: 1, when: { meter: 'trehfaz' } },
      { code: '1.13', qty: 1, when: { niche: 'beton' } },
      { code: '1.14', qty: 1, when: { niche: 'kirpich' } },
      { code: '1.15', qty: 1, when: { niche: 'penoblok' } },
      { code: '4.7', fromInput: 'modules' },
      { code: '4.5', fromInputTimes: { input: 'lines_out', factor: 3 } },
      { code: '4.8', fromInput: 'lines_out' }
    ]
  },
  {
    id: 'combo_floor',
    type: 'param',
    icon: '🌡',
    name: 'Тёплый пол «под ключ»',
    multiplierLabel: 'Количество зон',
    params: [
      { id: 'heatType', label: 'Тип', options: [
        { id: 'cable', label: 'Кабель' }, { id: 'mat', label: 'Мат' }
      ] },
      { id: 'material', label: 'Материал стены (под терморегулятор)', options: [
        { id: 'beton', label: 'Бетон' }, { id: 'kirpich', label: 'Кирпич' }, { id: 'gs', label: 'Г/силикат' }
      ] }
    ],
    inputs: [
      { id: 'amount', label: 'Кол-во на зону (м.п. кабеля или м² мата)', default: 5 }
    ],
    lines: [
      { code: '6.1', fromInput: 'amount', when: { heatType: 'cable' } },
      { code: '6.2', fromInput: 'amount', when: { heatType: 'mat' } },
      { code: '6.3', qty: 1 },
      { code: '1.1', qty: 1, when: { material: 'beton' } },
      { code: '1.2', qty: 1, when: { material: 'kirpich' } },
      { code: '1.3', qty: 1, when: { material: 'gs' } },
      { code: '3.2', qty: 1 }
    ]
  },
  {
    id: 'combo_weak',
    type: 'param',
    icon: '📶',
    name: 'Слаботочная точка',
    multiplierLabel: 'Количество точек',
    params: [
      { id: 'material', label: 'Материал стены', options: [
        { id: 'beton', label: 'Бетон' }, { id: 'kirpich', label: 'Кирпич' }, { id: 'gs', label: 'Г/силикат' }
      ] },
      { id: 'connector', label: 'Разъём', options: [
        { id: 'no', label: 'Без разъёма' }, { id: 'yes', label: 'С разъёмом' }
      ] }
    ],
    inputs: [
      { id: 'cable', label: 'Кабель на точку, м', default: 10 }
    ],
    lines: [
      { code: '1.1', qty: 1, when: { material: 'beton' } },
      { code: '1.2', qty: 1, when: { material: 'kirpich' } },
      { code: '1.3', qty: 1, when: { material: 'gs' } },
      { code: '3.2', qty: 1 },
      { code: '7.3', qty: 1 },
      { code: '7.1', fromInput: 'cable' },
      { code: '7.7', qty: 1, when: { connector: 'yes' } }
    ]
  },
  {
    id: 'combo_intro',
    type: 'template',
    icon: '🏠',
    name: 'Ввод в дом с заземлением',
    description: 'Добавляет типовой набор строк с количествами-заготовками — поправьте их вручную в смете.',
    lines: [
      { code: '2.14', qty: 1 },
      { code: '1.16', qty: 5 },
      { code: '1.17', qty: 1 },
      { code: '1.18', qty: 10 }
    ]
  }
];

function loadCombos() {
  const raw = localStorage.getItem('smeta:combos');
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  }
  const cloned = JSON.parse(JSON.stringify(DEFAULT_COMBOS));
  localStorage.setItem('smeta:combos', JSON.stringify(cloned));
  return cloned;
}
function saveCombos() {
  localStorage.setItem('smeta:combos', JSON.stringify(combos));
}
