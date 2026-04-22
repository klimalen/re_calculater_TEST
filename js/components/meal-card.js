import { formatTime } from '../lib/timezone.js';
import { getState } from '../state.js';
import { confirmDialog } from './modal.js';
import { deleteMeal, updateMeal, updateMealItem, deleteMealItem } from '../lib/db.js';
import { deleteMealPhoto, getMealPhotoUrl } from '../lib/storage.js';
import { toast } from './toast.js';

/** Escape HTML special chars to prevent XSS when inserting into innerHTML */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MEAL_TYPE_LABELS = {
  breakfast: 'Завтрак',
  lunch:     'Обед',
  dinner:    'Ужин',
  snack:     'Перекус',
};

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Завтрак' },
  { id: 'lunch',     label: 'Обед' },
  { id: 'dinner',    label: 'Ужин' },
  { id: 'snack',     label: 'Перекус' },
];

/**
 * Creates a meal card DOM element.
 * @param {Object} meal - meal row with meal_items[]
 * @param {Function} onDeleted - callback after successful delete
 * @param {Function} onUpdated - callback after successful edit
 */
export function createMealCard(meal, onDeleted, onUpdated) {
  const { profile } = getState();
  const tz = profile?.timezone || 'UTC';

  const card = document.createElement('div');
  card.className = 'meal-card';
  card.dataset.mealId = meal.id;

  const typeLabel = MEAL_TYPE_LABELS[meal.meal_type] || 'Приём пищи';
  const mealType = meal.meal_type || 'snack';
  const timeStr = formatTime(meal.eaten_at, tz);
  const items = meal.meal_items || [];
  const itemsPreview = items.slice(0, 2).map(i => esc(i.name)).join(', ');
  const extraCount = items.length - 2;

  card.innerHTML = `
    <div class="meal-card__header">
      <div class="meal-card__info">
        <div class="meal-card__name">${typeLabel}</div>
        <div class="meal-card__meta">${itemsPreview}${extraCount > 0 ? ` +${extraCount}` : ''}</div>
      </div>
      <div class="meal-card__kcal">${Math.round(meal.total_kcal)} ккал</div>
      <div class="meal-card__chevron" aria-hidden="true">${iconChevron()}</div>
      <div class="meal-card__actions">
        <button class="btn btn--icon btn--ghost js-edit" aria-label="Редактировать">
          ${iconEdit()}
        </button>
        <button class="btn btn--icon btn--ghost js-delete" aria-label="Удалить">
          ${iconTrash()}
        </button>
      </div>
    </div>
    <div class="meal-card__items" style="display:none">
      ${items.map(item => `
        <div class="meal-item">
          <span class="meal-item__name">${esc(item.name)}</span>
          <div class="meal-item__right">
            ${item.weight_g ? `<span class="meal-item__weight">${item.weight_g}г</span>` : ''}
            ${_macroChips(item)}
            <span class="meal-item__kcal">${Math.round(item.kcal)} ккал</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Load photo async if photo_url exists
  if (meal.photo_url) {
    const photoImg = card.querySelector('.meal-card__photo-img');
    const placeholder = card.querySelector('.meal-card__type-badge');
    if (photoImg) {
      getMealPhotoUrl(meal.photo_url).then(url => {
        if (url && photoImg.isConnected) {
          photoImg.src = url;
          photoImg.style.display = 'block';
          if (placeholder) placeholder.style.display = 'none';
        }
      }).catch(() => {});
    }
  }

  // Toggle items on header click
  const header = card.querySelector('.meal-card__header');
  const itemsEl = card.querySelector('.meal-card__items');
  const chevron = card.querySelector('.meal-card__chevron');
  header.addEventListener('click', e => {
    if (e.target.closest('.meal-card__actions')) return;
    const isOpen = itemsEl.style.display !== 'none';
    itemsEl.style.display = isOpen ? 'none' : 'block';
    chevron.classList.toggle('meal-card__chevron--open', !isOpen);
  });

  // Edit
  card.querySelector('.js-edit').addEventListener('click', async e => {
    e.stopPropagation();
    await _openEditModal(meal, card, onUpdated);
  });

  // Delete
  card.querySelector('.js-delete').addEventListener('click', async e => {
    e.stopPropagation();
    const confirmed = await confirmDialog({
      title: 'Удалить запись?',
      text: 'Это действие нельзя отменить.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await deleteMeal(meal.id);
      if (meal.photo_url) await deleteMealPhoto(meal.photo_url).catch(() => {});
      card.style.cssText = 'opacity:0;transform:translateX(-16px);transition:opacity 0.2s,transform 0.2s';
      setTimeout(() => { card.remove(); onDeleted?.(meal); }, 200);
    } catch {
      toast.error('Не удалось удалить запись');
    }
  });

  return card;
}

function _photoArea(meal) {
  const mealType = meal.meal_type || 'snack';
  const hasPhoto = !!meal.photo_url;

  return `
    <div class="meal-card__photo-area">
      <!-- Type badge (shown by default, hidden when photo loads) -->
      <div class="meal-card__type-badge meal-card__type-badge--${mealType}" style="${hasPhoto ? 'display:none' : ''}">
        ${_mealTypeIcon(mealType)}
      </div>
      <!-- Photo (hidden until loaded) -->
      <img class="meal-card__photo-img" alt="" style="display:none;width:100%;height:100%;object-fit:cover;border-radius:12px">
    </div>
  `;
}

function _mealTypeIcon(type) {
  const icons = {
    breakfast: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>`,
    lunch: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="12" cy="12" r="9"/><path d="M8 12h8"/><path d="M12 8v8"/>
    </svg>`,
    dinner: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`,
    snack: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M17 8C8 10 5.9 16.17 3.82 19.5A2 2 0 0 0 5.5 22a2 2 0 0 0 1.4-.6"/><path d="M20 7.5a6 6 0 0 0-8.48-1.12"/><path d="M8.14 8.3a6 6 0 0 0-1.12 8.48"/>
    </svg>`,
  };
  return icons[type] || icons.snack;
}

function _macroChips(item) {
  const parts = [];
  if (item.protein != null) parts.push(`<span class="meal-item__macro meal-item__macro--p">Б ${Math.round(item.protein)}</span>`);
  if (item.fat     != null) parts.push(`<span class="meal-item__macro meal-item__macro--f">Ж ${Math.round(item.fat)}</span>`);
  if (item.carb    != null) parts.push(`<span class="meal-item__macro meal-item__macro--c">У ${Math.round(item.carb)}</span>`);
  return parts.length ? `<span class="meal-item__macros">${parts.join('')}</span>` : '';
}

// ── Edit meal modal ───────────────────────────────────

async function _openEditModal(meal, card, onUpdated) {
  const { createModal } = await import('./modal.js');

  let editItems = meal.meal_items.map(item => ({ ...item }));
  let mealType = meal.meal_type || 'snack';

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px';

  const tabsHtml = MEAL_TYPES.map(t =>
    `<button class="meal-type-tab${t.id === mealType ? ' meal-type-tab--active' : ''}" data-type="${t.id}">${t.label}</button>`
  ).join('');

  body.innerHTML = `
    <div>
      <div class="input-label" style="margin-bottom:8px">Тип приёма пищи</div>
      <div class="meal-type-tabs">${tabsHtml}</div>
    </div>
    <div id="edit-items-list" style="display:flex;flex-direction:column;gap:8px"></div>
  `;

  body.querySelectorAll('.meal-type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      mealType = btn.dataset.type;
      body.querySelectorAll('.meal-type-tab').forEach(b =>
        b.classList.toggle('meal-type-tab--active', b === btn)
      );
    });
  });

  function _renderEditItems() {
    const list = body.querySelector('#edit-items-list');
    list.innerHTML = '';
    editItems.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'ai-item';
      el.innerHTML = `
        <div class="ai-item__info">
          <div class="ai-item__name">${esc(item.name)}</div>
          <div class="ai-item__details">
            ${item.weight_g ? `<span style="color:var(--text-placeholder);font-size:11px">${item.weight_g}г</span>` : ''}
            ${_macroChips(item)}
          </div>
        </div>
        <div class="ai-item__right">
          <span class="ai-item__kcal">${Math.round(item.kcal)} ккал</span>
          <button class="btn btn--icon btn--ghost js-edit-sub" aria-label="Редактировать">${iconEdit()}</button>
          <button class="btn btn--icon btn--ghost js-del-sub" aria-label="Удалить">${iconTrash()}</button>
        </div>
      `;
      el.querySelector('.js-edit-sub').addEventListener('click', () => _editSubItem(idx));
      el.querySelector('.js-del-sub').addEventListener('click', () => {
        editItems.splice(idx, 1);
        _renderEditItems();
      });
      list.appendChild(el);
    });
  }

  async function _editSubItem(idx) {
    const item = editItems[idx];
    const { createModal: cm } = await import('./modal.js');
    const pn = s => { const n = parseFloat(s); return isNaN(n) ? 0 : n; };
    const r1 = n => Math.round(n * 10) / 10;

    // Derive per100 from stored totals + weight_g so weight changes can recalculate proportionally
    const w0 = item.weight_g;
    let per100 = {
      kcal:    (w0 > 0) ? r1(item.kcal    * 100 / w0) : item.kcal,
      protein: (w0 > 0) ? r1(item.protein * 100 / w0) : item.protein,
      fat:     (w0 > 0) ? r1(item.fat     * 100 / w0) : item.fat,
      carb:    (w0 > 0) ? r1(item.carb    * 100 / w0) : item.carb,
    };

    const form = document.createElement('div');
    form.className = 'edit-item-form';
    form.innerHTML = `
      <div class="input-group">
        <label class="input-label">Название</label>
        <input class="input" id="si-name" value="${esc(item.name)}">
      </div>
      <div class="input-group">
        <label class="input-label">Вес, г</label>
        <input class="input" id="si-weight" type="number" min="0" value="${w0 ?? ''}">
      </div>
      ${w0 ? `<p style="font-size:11px;color:var(--text-secondary);margin:0;line-height:1.4">При изменении веса КБЖУ пересчитываются пропорционально</p>` : ''}
      <div class="edit-item-macros">
        <div class="input-group"><label class="input-label">Калории</label><input class="input" id="si-kcal" type="number" min="0" step="0.1" value="${item.kcal}"></div>
        <div class="input-group"><label class="input-label">Белки, г</label><input class="input" id="si-protein" type="number" min="0" step="0.1" value="${item.protein}"></div>
        <div class="input-group"><label class="input-label">Жиры, г</label><input class="input" id="si-fat" type="number" min="0" step="0.1" value="${item.fat}"></div>
        <div class="input-group"><label class="input-label">Углеводы, г</label><input class="input" id="si-carb" type="number" min="0" step="0.1" value="${item.carb}"></div>
      </div>
    `;

    const weightInput  = form.querySelector('#si-weight');
    const kcalInput    = form.querySelector('#si-kcal');
    const proteinInput = form.querySelector('#si-protein');
    const fatInput     = form.querySelector('#si-fat');
    const carbInput    = form.querySelector('#si-carb');

    weightInput.addEventListener('input', () => {
      const w = pn(weightInput.value) || null;
      if (!w) return;
      kcalInput.value    = r1(per100.kcal    * w / 100);
      proteinInput.value = r1(per100.protein * w / 100);
      fatInput.value     = r1(per100.fat     * w / 100);
      carbInput.value    = r1(per100.carb    * w / 100);
    });

    function _onMacroInput(field, input) {
      const w = pn(weightInput.value) || null;
      const v = Math.max(0, pn(input.value));
      per100[field] = (w && w > 0) ? r1(v * 100 / w) : v;
    }
    kcalInput.addEventListener('input',    () => _onMacroInput('kcal',    kcalInput));
    proteinInput.addEventListener('input', () => _onMacroInput('protein', proteinInput));
    fatInput.addEventListener('input',     () => _onMacroInput('fat',     fatInput));
    carbInput.addEventListener('input',    () => _onMacroInput('carb',    carbInput));

    const subFooter = document.createElement('div');
    subFooter.style.cssText = 'display:flex;gap:12px;width:100%';
    subFooter.innerHTML = `
      <button class="btn btn--secondary btn--full js-cancel">Отмена</button>
      <button class="btn btn--primary btn--full js-apply">Применить</button>
    `;
    const sub = cm({ title: 'Редактировать позицию', body: form, footer: subFooter });
    subFooter.querySelector('.js-cancel').addEventListener('click', sub.close);
    subFooter.querySelector('.js-apply').addEventListener('click', () => {
      const name = form.querySelector('#si-name').value.trim();
      if (!name) { toast.warning('Введите название'); return; }
      const newWeight = pn(weightInput.value) || null;
      editItems[idx] = {
        ...item,
        name,
        weight_g: newWeight,
        kcal:     Math.max(0, pn(kcalInput.value)),
        protein:  Math.max(0, pn(proteinInput.value)),
        fat:      Math.max(0, pn(fatInput.value)),
        carb:     Math.max(0, pn(carbInput.value)),
      };
      sub.close();
      _renderEditItems();
    });
    sub.open();
  }

  _renderEditItems();

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:12px;width:100%';
  footer.innerHTML = `
    <button class="btn btn--secondary btn--full js-cancel">Отмена</button>
    <button class="btn btn--primary btn--full js-save">Сохранить</button>
  `;

  const modal = createModal({ title: 'Редактировать приём пищи', body, footer });
  footer.querySelector('.js-cancel').addEventListener('click', modal.close);
  footer.querySelector('.js-save').addEventListener('click', async () => {
    const btn = footer.querySelector('.js-save');
    btn.disabled = true;
    try {
      // Track which original item IDs are still present
      const keptIds = new Set(editItems.filter(i => i.id).map(i => i.id));
      const deletedItems = (meal.meal_items || []).filter(i => !keptIds.has(i.id));

      // Delete removed items from DB
      for (const item of deletedItems) {
        await deleteMealItem(item.id).catch(() => {});
      }

      // Update remaining items
      for (const item of editItems) {
        if (item.id) {
          await updateMealItem(item.id, {
            name: item.name, weight_g: item.weight_g,
            kcal: item.kcal, protein: item.protein, fat: item.fat, carb: item.carb,
          });
        }
      }

      // Recalculate totals and update meal
      const totals = editItems.reduce((a, i) => ({
        kcal: a.kcal + (i.kcal || 0), protein: a.protein + (i.protein || 0),
        fat:  a.fat  + (i.fat  || 0), carb:    a.carb    + (i.carb   || 0),
      }), { kcal: 0, protein: 0, fat: 0, carb: 0 });

      await updateMeal(meal.id, {
        meal_type:     mealType,
        total_kcal:    totals.kcal,
        total_protein: totals.protein,
        total_fat:     totals.fat,
        total_carb:    totals.carb,
      });

      modal.close();
      toast.success('Изменения сохранены');
      onUpdated?.({
        ...meal,
        meal_type:     mealType,
        total_kcal:    totals.kcal,
        total_protein: totals.protein,
        total_fat:     totals.fat,
        total_carb:    totals.carb,
        meal_items:    editItems,
      });
    } catch {
      toast.error('Не удалось сохранить изменения');
      btn.disabled = false;
    }
  });

  modal.open();
}

// ── Icons ─────────────────────────────────────────────

function iconChevron() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
}

function iconEdit() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
}

function iconTrash() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
}
