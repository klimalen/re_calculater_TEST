/**
 * Shared goals modal — used from Profile, Today, Stats screens.
 */
import { getState, setState } from '../state.js';
import { upsertProfile } from './db.js';
import { track, Events } from './analytics.js';
import { toast } from '../components/toast.js';

export async function openGoalsModal() {
  const { createModal } = await import('../components/modal.js');
  const { profile } = getState();

  const form = document.createElement('div');
  form.className = 'goals-form';
  form.innerHTML = `
    <div class="input-group">
      <label class="input-label">Калории в день, ккал</label>
      <input class="input" id="g-kcal" type="number" min="0" value="${profile?.goal_kcal || ''}" placeholder="Например, 1800">
    </div>
    <div class="goals-form__row">
      <div class="input-group">
        <label class="input-label">Белки, г</label>
        <input class="input" id="g-protein" type="number" min="0" value="${profile?.goal_protein || ''}" placeholder="100">
      </div>
      <div class="input-group">
        <label class="input-label">Жиры, г</label>
        <input class="input" id="g-fat" type="number" min="0" value="${profile?.goal_fat || ''}" placeholder="60">
      </div>
    </div>
    <div class="input-group">
      <label class="input-label">Углеводы, г</label>
      <input class="input" id="g-carb" type="number" min="0" value="${profile?.goal_carb || ''}" placeholder="200">
    </div>
    <p style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.4">
      Цели необязательны. Без них приложение работает как обычный дневник питания.
    </p>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:12px;width:100%';
  footer.innerHTML = `
    <button class="btn btn--secondary btn--full js-cancel">Отмена</button>
    <button class="btn btn--primary btn--full js-save">Сохранить</button>
  `;

  // Dismiss keyboard on Enter/Done key in any input
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });

  const modal = createModal({ title: 'Цели по питанию', body: form, footer });

  footer.querySelector('.js-cancel').addEventListener('click', modal.close);
  footer.querySelector('.js-save').addEventListener('click', async () => {
    const fields = {
      goal_kcal:    _numOrNull(form.querySelector('#g-kcal').value),
      goal_protein: _numOrNull(form.querySelector('#g-protein').value),
      goal_fat:     _numOrNull(form.querySelector('#g-fat').value),
      goal_carb:    _numOrNull(form.querySelector('#g-carb').value),
    };
    const btn = footer.querySelector('.js-save');
    btn.disabled = true;
    try {
      const { user } = getState();
      const updated = await upsertProfile(user.id, fields);
      setState({ profile: { ...getState().profile, ...updated } });
      modal.close();
      track(Events.GOAL_SET);
      toast.success('Цели сохранены');
      window.location.reload();
    } catch {
      toast.error('Не удалось сохранить');
      btn.disabled = false;
    }
  });

  modal.open();
}

function _numOrNull(s) {
  const n = parseFloat(s);
  return isNaN(n) || n <= 0 ? null : n;
}
