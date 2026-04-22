import { navigate } from '../router.js';
import { hideBottomNav } from '../components/bottom-nav.js';
import { saveDraft } from '../state.js';
import { toast } from '../components/toast.js';
import { track, Events } from '../lib/analytics.js';

export function renderTextInput() {
  hideBottomNav();

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="screen">
      <div class="screen__header">
        <button class="btn btn--icon btn--ghost js-back">${iconBack()}</button>
        <h1 class="screen__title">Описать текстом</h1>
      </div>
      <div class="screen__body">
        <div class="input-group">
          <label class="input-label">Опишите ваш прием пищи</label>
          <textarea class="textarea" id="food-text" rows="5"
            placeholder="Например: два кусочка пиццы Маргарита 35 см"></textarea>
          <p id="text-char-count" style="font-size:11px;color:var(--text-secondary);margin:4px 2px 0;line-height:1">
            не более 300 символов
          </p>
        </div>

        <button class="btn btn--primary btn--full js-calculate">
          ${iconSpark()} Рассчитать КБЖУ
        </button>
      </div>
    </div>
  `;

  app.querySelector('.js-back').addEventListener('click', () => navigate('add-meal'));

  const textEl       = document.getElementById('food-text');
  const countEl      = document.getElementById('text-char-count');
  const calculateBtn = app.querySelector('.js-calculate');

  textEl.addEventListener('input', () => {
    const len = textEl.value.length;
    const isOver = len > 300;
    countEl.textContent = isOver ? `${len} / 300 символов` : 'не более 300 символов';
    countEl.style.color = isOver ? 'var(--danger)' : '';
    calculateBtn.disabled = isOver;
  });

  calculateBtn.addEventListener('click', () => {
    const text = textEl.value.trim();
    if (!text) { toast.warning('Опишите ваш прием пищи'); return; }
    if (text.length < 3) { toast.warning('Слишком мало информации'); return; }
    if (text.length > 300) { toast.warning('Текст не более 300 символов'); return; }
    saveDraft({ source: 'text', text });
    navigate('ai-result');
  });
}

function iconBack() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}

function iconSpark() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>`;
}
