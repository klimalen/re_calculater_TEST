/**
 * AI Result screen — state machine:
 * loading → result_shown → editing (inline) → saving → [navigate to today]
 *                       → re_sending → loading
 */

import { navigate } from '../router.js';
import { getState, setState, loadDraft, clearDraft } from '../state.js';
import { recognizeFood } from '../lib/ai.js';
import { createMeal } from '../lib/db.js';
import { uploadMealPhoto } from '../lib/storage.js';
import { todayString, toLocalDateString } from '../lib/timezone.js';
import { hideBottomNav } from '../components/bottom-nav.js';
import { toast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';
import { track, Events } from '../lib/analytics.js';

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Завтрак' },
  { id: 'lunch',     label: 'Обед' },
  { id: 'dinner',    label: 'Ужин' },
  { id: 'snack',     label: 'Перекус' },
];

export async function renderAiResult() {
  hideBottomNav();

  const draft = loadDraft();
  if (!draft) {
    navigate('add-meal');
    return;
  }

  const app = document.getElementById('app');
  let items = [];
  let selectedMealType = _guessMealType();
  let isSaving = false;

  // ── Layout ──────────────────────────────────────────
  app.innerHTML = `
    <div class="screen" id="ai-result-screen">
      <div class="screen__header">
        <button class="btn btn--icon btn--ghost js-back">${iconBack()}</button>
        <h1 class="screen__title">Результат</h1>
      </div>
      <div class="screen__body" id="result-body"></div>
    </div>
  `;

  app.querySelector('.js-back').addEventListener('click', async () => {
    if (items.length) {
      const confirmed = await confirmDialog({
        title: 'Выйти без сохранения?',
        text: 'Результат распознавания будет потерян.',
        confirmLabel: 'Выйти',
        danger: true,
      });
      if (!confirmed) return;
    }
    clearDraft();
    navigate('today');
  });

  // ── Recognition ─────────────────────────────────────
  async function _startRecognition() {
    _showLoading(draft.source);

    const startTime = Date.now();
    track(Events.AI_REQUEST_SENT, { source: draft.source });

    try {
      const result = await recognizeFood({
        imageBase64: draft.imageBase64,
        text: draft.text,
      });

      const duration = Date.now() - startTime;
      track(Events.AI_RESULT_RECEIVED, {
        source: draft.source,
        confidence: result.confidence,
        items_count: result.items.length,
        duration_ms: duration,
      });

      items = result.items.map((item, i) => ({ ...item, _id: i }));

      if (items.length === 0) {
        track(Events.AI_RECOGNITION_FAILED, { source: draft.source, reason: 'no_food' });
        _renderNoFood(result.notes);
      } else {
        _renderResult(result.confidence, result.notes);
      }

    } catch (err) {
      track(Events.AI_RECOGNITION_FAILED, { source: draft.source, reason: 'error', code: err.code ?? null });
      _renderError(err);
    }
  }

  // ── Render: loading ──────────────────────────────────
  function _showLoading(source) {
    const body = document.getElementById('result-body');
    body.innerHTML = `
      <div class="ai-processing">
        <div class="ai-processing__spinner"></div>
        <div class="ai-processing__title">AI анализирует ${source === 'photo' ? 'фото' : 'описание'}…</div>
        <div class="ai-processing__text">Обычно это занимает 5–15 секунд, но при нестабильном интернет-соединении может занять больше времени</div>
      </div>
    `;
  }

  // ── Render: no food found ────────────────────────────
  function _renderNoFood(notes) {
    const body = document.getElementById('result-body');
    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🍽️</div>
        <div class="empty-state__title">Еда не обнаружена</div>
        <div class="empty-state__text">${notes ? esc(notes) : 'AI не смог распознать еду на фото. Попробуйте другое фото или опишите блюдо текстом.'}</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;width:100%">
          <button class="btn btn--primary js-retry-ai">Попробовать снова</button>
          <button class="btn btn--secondary js-enter-manual">Ввести вручную</button>
        </div>
      </div>
    `;
    body.querySelector('.js-retry-ai').addEventListener('click', _startRecognition);
    body.querySelector('.js-enter-manual').addEventListener('click', _addManualItem);
  }

  // ── Render: error ────────────────────────────────────
  function _renderError(err) {
    const body = document.getElementById('result-body');
    const isRateLimit = err.code === 'RATE_LIMIT';
    const isConcurrent = err.code === 'CONCURRENT';

    body.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${isRateLimit ? '⏳' : '😕'}</div>
        <div class="empty-state__title">${isRateLimit ? 'Лимит исчерпан' : isConcurrent ? 'Подождите' : 'Не удалось распознать'}</div>
        <div class="empty-state__text">${esc(err.message)}</div>
        ${!isRateLimit && !isConcurrent ? `
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;width:100%">
            <button class="btn btn--primary js-retry-ai">Попробовать снова</button>
            <button class="btn btn--secondary js-enter-manual">Ввести вручную</button>
          </div>
        ` : ''}
      </div>
    `;

    body.querySelector('.js-retry-ai')?.addEventListener('click', _startRecognition);
    body.querySelector('.js-enter-manual')?.addEventListener('click', _addManualItem);
  }

  // ── Render: result ───────────────────────────────────
  function _renderResult(confidence, notes) {
    const body = document.getElementById('result-body');
    const isLowConfidence = confidence < 0.5;

    body.innerHTML = `
      ${draft.source === 'photo' && draft.imageBase64 ? `
        <img src="data:image/jpeg;base64,${draft.imageBase64}" class="ai-result__photo" alt="Фото блюда">
      ` : ''}

      ${isLowConfidence ? `
        <div class="card" style="background:var(--warning-light);border-color:var(--warning);display:flex;gap:8px;align-items:flex-start">
          <span>⚠️</span>
          <p style="font-size:var(--font-size-sm);color:#7a5800;line-height:1.4">
            Результат приблизительный — AI не уверен в распознавании. Проверьте и при необходимости исправьте.
          </p>
        </div>
      ` : ''}

      ${notes ? `
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary);font-style:italic">${esc(notes)}</p>
      ` : ''}

      <!-- Meal type selector -->
      <div>
        <div class="input-label" style="margin-bottom:8px">Тип приёма пищи</div>
        <div class="meal-type-tabs">
          ${MEAL_TYPES.map(t => `
            <button class="meal-type-tab${t.id === selectedMealType ? ' meal-type-tab--active' : ''}" data-type="${t.id}">
              ${t.label}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Items list -->
      <div id="items-list" class="ai-result__items"></div>

      <button class="btn btn--ghost btn--sm" id="add-item-btn" style="align-self:flex-start">
        + Добавить позицию
      </button>

      <!-- Total -->
      <div class="ai-result__total" id="total-block"></div>

      <!-- Save button -->
      <button class="btn btn--primary btn--full js-save">
        <span class="btn__text">Сохранить</span>
      </button>
    `;

    // Meal type
    body.querySelectorAll('.meal-type-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedMealType = btn.dataset.type;
        body.querySelectorAll('.meal-type-tab').forEach(b => b.classList.toggle('meal-type-tab--active', b === btn));
      });
    });

    body.querySelector('#add-item-btn').addEventListener('click', _addManualItem);
    body.querySelector('.js-save').addEventListener('click', _save);

    _renderItems();
  }

  // ── Render items list ────────────────────────────────
  function _renderItems() {
    const list = document.getElementById('items-list');
    const totalBlock = document.getElementById('total-block');
    if (!list) return;

    list.innerHTML = '';

    items.forEach((item, idx) => {
      const computed = _computeItem(item);
      const el = document.createElement('div');
      el.className = 'ai-item';
      el.dataset.id = item._id;
      el.innerHTML = `
        <div class="ai-item__info">
          <div class="ai-item__name">${esc(item.name)}</div>
          <div class="ai-item__details">
            ${item.weight_g ? `<span style="color:var(--text-placeholder);font-size:11px">${item.weight_g}г</span>` : ''}
            ${_macroTags(computed)}
          </div>
        </div>
        <div class="ai-item__right">
          <span class="ai-item__kcal">${Math.round(computed.kcal)} ккал</span>
          <button class="btn btn--icon btn--ghost js-edit-item" aria-label="Редактировать">${iconEdit()}</button>
          <button class="btn btn--icon btn--ghost js-delete-item" aria-label="Удалить">${iconTrash()}</button>
        </div>
      `;

      el.querySelector('.js-edit-item').addEventListener('click', () => _editItem(idx));
      el.querySelector('.js-delete-item').addEventListener('click', () => {
        items.splice(idx, 1);
        _renderItems();
      });

      list.appendChild(el);
    });

    // Total
    if (totalBlock) {
      const total = _calcTotal();
      totalBlock.innerHTML = `
        <div>
          <div class="ai-result__total-label">Итого</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
            ${_macroTags(total)}
          </div>
        </div>
        <div class="ai-result__total-kcal">${Math.round(total.kcal)} ккал</div>
      `;
    }
  }

  // ── Edit item inline ─────────────────────────────────
  async function _editItem(idx) {
    const item = items[idx];
    const { createModal } = await _importModal();

    // Working copies of per100 values — updated when user manually edits macros
    // Fallback to legacy field names in case of old edge function response
    let per100 = {
      kcal:    item.kcal_per100    ?? item.kcal    ?? 0,
      protein: item.protein_per100 ?? item.protein ?? 0,
      fat:     item.fat_per100     ?? item.fat     ?? 0,
      carb:    item.carb_per100    ?? item.carb    ?? 0,
    };

    // Compute current display values from per100 + weight
    function _displayVals(weight) {
      if (weight == null || weight === 0) return { ...per100 };
      return {
        kcal:    _r(per100.kcal    * weight / 100),
        protein: _r(per100.protein * weight / 100),
        fat:     _r(per100.fat     * weight / 100),
        carb:    _r(per100.carb    * weight / 100),
      };
    }

    const initWeight = item.weight_g ?? null;
    const initVals   = _displayVals(initWeight);
    const hasWeight  = initWeight != null;

    const form = document.createElement('div');
    form.className = 'edit-item-form';
    form.innerHTML = `
      <div class="input-group">
        <label class="input-label">Название</label>
        <input class="input" id="ei-name" value="${esc(item.name)}" placeholder="Название блюда">
      </div>
      <div class="input-group">
        <label class="input-label">Вес, г</label>
        <input class="input" id="ei-weight" type="number" min="0" value="${initWeight ?? ''}" placeholder="Опционально">
      </div>
      ${hasWeight ? `
        <p style="font-size:11px;color:var(--text-secondary);margin:0;line-height:1.4">
          При изменении веса КБЖУ пересчитываются пропорционально
        </p>
      ` : ''}
      <div class="edit-item-macros">
        <div class="input-group">
          <label class="input-label">Калории</label>
          <input class="input" id="ei-kcal" type="number" min="0" step="0.1" value="${initVals.kcal}">
        </div>
        <div class="input-group">
          <label class="input-label">Белки, г</label>
          <input class="input" id="ei-protein" type="number" min="0" step="0.1" value="${initVals.protein}">
        </div>
        <div class="input-group">
          <label class="input-label">Жиры, г</label>
          <input class="input" id="ei-fat" type="number" min="0" step="0.1" value="${initVals.fat}">
        </div>
        <div class="input-group">
          <label class="input-label">Углеводы, г</label>
          <input class="input" id="ei-carb" type="number" min="0" step="0.1" value="${initVals.carb}">
        </div>
      </div>
    `;

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:12px;width:100%';
    footer.innerHTML = `
      <button class="btn btn--secondary btn--full js-cancel">Отмена</button>
      <button class="btn btn--primary btn--full js-apply">Применить</button>
    `;

    const modal = createModal({ title: 'Редактировать', body: form, footer });

    const weightInput  = form.querySelector('#ei-weight');
    const kcalInput    = form.querySelector('#ei-kcal');
    const proteinInput = form.querySelector('#ei-protein');
    const fatInput     = form.querySelector('#ei-fat');
    const carbInput    = form.querySelector('#ei-carb');

    // When weight changes — recalculate displayed КБЖУ from current per100
    weightInput.addEventListener('input', () => {
      const w = _parseNum(weightInput.value) || null;
      if (w == null) return;
      const v = _displayVals(w);
      kcalInput.value    = v.kcal;
      proteinInput.value = v.protein;
      fatInput.value     = v.fat;
      carbInput.value    = v.carb;
    });

    // When a macro is edited manually — update per100 so future weight changes use the new value
    function _onMacroInput(field, input) {
      const w = _parseNum(weightInput.value) || null;
      const v = Math.max(0, _parseNum(input.value));
      per100[field] = w != null && w > 0 ? _r(v * 100 / w) : v;
    }
    kcalInput.addEventListener('input',    () => _onMacroInput('kcal',    kcalInput));
    proteinInput.addEventListener('input', () => _onMacroInput('protein', proteinInput));
    fatInput.addEventListener('input',     () => _onMacroInput('fat',     fatInput));
    carbInput.addEventListener('input',    () => _onMacroInput('carb',    carbInput));

    footer.querySelector('.js-cancel').addEventListener('click', modal.close);
    footer.querySelector('.js-apply').addEventListener('click', () => {
      const name = form.querySelector('#ei-name').value.trim();
      if (!name) { toast.warning('Введите название'); return; }

      const newWeight = _parseNum(weightInput.value) || null;

      const updated = {
        ...item,
        name,
        weight_g:       newWeight,
        kcal_per100:    Math.max(0, per100.kcal),
        protein_per100: Math.max(0, per100.protein),
        fat_per100:     Math.max(0, per100.fat),
        carb_per100:    Math.max(0, per100.carb),
      };

      items[idx] = updated;
      modal.close();
      _renderItems();
      track(Events.AI_RESULT_EDITED, { fields_changed: true });
    });

    modal.open();
  }

  // Lazy import to avoid circular
  async function _importModal() {
    return import('../components/modal.js');
  }

  // ── Add manual item ──────────────────────────────────
  function _addManualItem() {
    const newItem = { _id: Date.now(), name: '', weight_g: null, kcal_per100: 0, protein_per100: 0, fat_per100: 0, carb_per100: 0 };
    items.push(newItem);
    _renderItems();
    _editItem(items.length - 1);
  }

  // ── Save ─────────────────────────────────────────────
  async function _save() {
    if (isSaving) return;
    if (!items.length) { toast.warning('Добавьте хотя бы одно блюдо'); return; }

    const saveBtn = document.querySelector('.js-save');
    saveBtn.disabled = true;
    saveBtn.classList.add('btn--loading');
    isSaving = true;

    const { user, profile, viewDate } = getState();
    const tz = profile?.timezone || 'UTC';
    const now = new Date();
    // Use the date the user was browsing when they initiated "add meal"
    const dateStr = viewDate || toLocalDateString(now, tz);
    const total = _calcTotal();

    try {
      const mealData = {
        user_id:       user.id,
        eaten_at:      now.toISOString(),
        eaten_date:    dateStr,
        meal_type:     selectedMealType,
        source:        draft.source,
        ai_confidence: null,
        total_kcal:    total.kcal,
        total_protein: total.protein,
        total_fat:     total.fat,
        total_carb:    total.carb,
      };

      const mealItems = items.map((item, i) => {
        const c = _computeItem(item);
        return {
          name:       item.name,
          weight_g:   item.weight_g,
          kcal:       c.kcal,
          protein:    c.protein,
          fat:        c.fat,
          carb:       c.carb,
          sort_order: i,
        };
      });

      const saved = await createMeal({ userId: user.id, mealData, items: mealItems });

      // Upload photo after successful meal save
      if (draft.source === 'photo' && draft.imageBase64 && saved?.id) {
        try {
          const photoPath = await uploadMealPhoto(user.id, saved.id, draft.imageBase64);
          // Update meal with photo_url (non-critical)
          await import('../lib/db.js').then(({ updateMeal }) =>
            updateMeal(saved.id, { photo_url: photoPath }).catch(() => {})
          );
        } catch {}
      }

      track(Events.MEAL_SAVED, { source: draft.source, items_count: items.length, kcal: total.kcal });

      clearDraft();

      // Refresh today's meals in state
      const { getMealsByDate } = await import('../lib/db.js');
      const updatedMeals = await getMealsByDate(user.id, dateStr).catch(() => null);
      if (updatedMeals) setState({ meals: updatedMeals });

      // Mark that this user has added at least one meal — used to gate promo banners
      localStorage.setItem(`has_meal_${user.id}`, '1');

      toast.success('Записано!');
      navigate('today');

    } catch {
      toast.error('Не удалось сохранить. Попробуйте ещё раз.');
      saveBtn.disabled = false;
      saveBtn.classList.remove('btn--loading');
      isSaving = false;
    }
  }

  // ── Utils ────────────────────────────────────────────
  function _calcTotal() {
    return items.reduce((acc, item) => {
      const c = _computeItem(item);
      return {
        kcal:    acc.kcal    + c.kcal,
        protein: acc.protein + c.protein,
        fat:     acc.fat     + c.fat,
        carb:    acc.carb    + c.carb,
      };
    }, { kcal: 0, protein: 0, fat: 0, carb: 0 });
  }

  // Start recognition immediately
  _startRecognition();
}

/** Compute per-portion values from per100 fields + weight_g.
 *  Falls back to legacy field names in case an older edge function version responds. */
function _computeItem(item) {
  const kcalP    = item.kcal_per100    ?? item.kcal    ?? 0;
  const proteinP = item.protein_per100 ?? item.protein ?? 0;
  const fatP     = item.fat_per100     ?? item.fat     ?? 0;
  const carbP    = item.carb_per100    ?? item.carb    ?? 0;

  const w = item.weight_g;
  if (w == null || w === 0) {
    return { kcal: kcalP, protein: proteinP, fat: fatP, carb: carbP };
  }
  return {
    kcal:    _r(kcalP    * w / 100),
    protein: _r(proteinP * w / 100),
    fat:     _r(fatP     * w / 100),
    carb:    _r(carbP    * w / 100),
  };
}

/** Round to 1 decimal */
function _r(n) { return Math.round(n * 10) / 10; }

/** Escape HTML special chars to prevent XSS when inserting AI-returned strings into innerHTML */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _guessMealType() {
  const h = new Date().getHours();
  if (h >= 6  && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 18 && h < 22) return 'dinner';
  return 'snack';
}

function _f(n) { return n != null ? Math.round(n * 10) / 10 : 0; }
function _parseNum(s) { const n = parseFloat(s); return isNaN(n) ? 0 : n; }

function _macroTags(item) {
  const tags = [];
  if (item.protein != null) tags.push(`<span class="meal-item__macro meal-item__macro--p">Б ${_f(item.protein)}</span>`);
  if (item.fat     != null) tags.push(`<span class="meal-item__macro meal-item__macro--f">Ж ${_f(item.fat)}</span>`);
  if (item.carb    != null) tags.push(`<span class="meal-item__macro meal-item__macro--c">У ${_f(item.carb)}</span>`);
  return `<span class="meal-item__macros">${tags.join('')}</span>`;
}

function iconBack() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}
function iconEdit() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
}
function iconTrash() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
}
