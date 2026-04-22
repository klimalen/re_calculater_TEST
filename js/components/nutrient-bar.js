/**
 * Nutrient progress bar component.
 * Shows label, consumed/goal values, and a colored fill bar.
 */

const COLORS = {
  protein: 'var(--protein-color)',
  fat:     'var(--fat-color)',
  carb:    'var(--carb-color)',
  kcal:    'var(--kcal-color)',
};

const LABELS = {
  protein: 'Белки',
  fat:     'Жиры',
  carb:    'Углеводы',
  kcal:    'Калории',
};

const UNITS = {
  protein: 'г',
  fat:     'г',
  carb:    'г',
  kcal:    'ккал',
};

/**
 * @param {Object} opts
 * @param {'protein'|'fat'|'carb'|'kcal'} opts.type
 * @param {number} opts.current
 * @param {number|null} opts.goal
 */
export function createNutrientBar({ type, current, goal }) {
  const el = document.createElement('div');
  el.className = 'nutrient-bar';

  const pct = goal ? Math.min((current / goal) * 100, 100) : 0;
  const isOver = goal && current > goal;
  const unit = UNITS[type];
  const color = COLORS[type];

  el.innerHTML = `
    <div class="nutrient-bar__header">
      <span class="nutrient-bar__label">${LABELS[type]}</span>
      <span class="nutrient-bar__values">
        <strong>${_fmt(current)}</strong>${goal ? ` / ${_fmt(goal)} ${unit}` : ` ${unit}`}
      </span>
    </div>
    <div class="nutrient-bar__track">
      <div class="nutrient-bar__fill" style="width:${pct}%;background:${isOver ? 'var(--warning)' : color}"></div>
    </div>
  `;

  return el;
}

/** Small inline nutrient chips (P/F/C) */
export function createNutrientChips({ protein, fat, carb }) {
  const el = document.createElement('div');
  el.className = 'nutrient-chips';
  el.innerHTML = `
    <div class="nutrient-chip">
      <div class="nutrient-chip__dot" style="background:var(--protein-color)"></div>
      Б ${_fmt(protein)}г
    </div>
    <div class="nutrient-chip">
      <div class="nutrient-chip__dot" style="background:var(--fat-color)"></div>
      Ж ${_fmt(fat)}г
    </div>
    <div class="nutrient-chip">
      <div class="nutrient-chip__dot" style="background:var(--carb-color)"></div>
      У ${_fmt(carb)}г
    </div>
  `;
  return el;
}

function _fmt(n) {
  if (n == null || isNaN(n)) return '0';
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
