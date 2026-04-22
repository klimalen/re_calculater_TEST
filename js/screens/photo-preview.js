import { navigate } from '../router.js';
import { hideBottomNav } from '../components/bottom-nav.js';
import { loadDraft, saveDraft } from '../state.js';
import { track, Events } from '../lib/analytics.js';

export function renderPhotoPreview() {
  hideBottomNav();

  const draft = loadDraft();
  if (!draft?.imageBase64) {
    navigate('add-meal');
    return;
  }

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="screen">
      <div class="screen__header">
        <button class="btn btn--icon btn--ghost js-back">${iconBack()}</button>
        <h1 class="screen__title">Фото еды</h1>
      </div>
      <div class="screen__body">
        <img src="data:image/jpeg;base64,${draft.imageBase64}"
             class="upload-area__preview" alt="Фото блюда">

        <button class="btn btn--secondary btn--sm js-change" style="align-self:flex-start">
          Изменить фото
        </button>

        <div class="input-group">
          <label class="input-label">
            Комментарий к фото
            <span style="font-weight:400;color:var(--text-secondary)"> — необязательно</span>
          </label>
          <textarea class="textarea" id="photo-comment" rows="3"
            placeholder="Например уточнения по размеру порции или продукты, которые не попали на фото"></textarea>
          <p id="comment-count" style="font-size:11px;color:var(--text-secondary);margin:4px 2px 0;line-height:1">
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
  app.querySelector('.js-change').addEventListener('click', () => navigate('add-meal'));

  const commentEl    = document.getElementById('photo-comment');
  const countEl      = document.getElementById('comment-count');
  const calculateBtn = app.querySelector('.js-calculate');

  commentEl.addEventListener('input', () => {
    const len = commentEl.value.length;
    const isOver = len > 300;
    countEl.textContent = isOver ? `${len} / 300 символов` : 'не более 300 символов';
    countEl.style.color = isOver ? 'var(--danger)' : '';
    calculateBtn.disabled = isOver;
  });

  calculateBtn.addEventListener('click', () => {
    const comment = commentEl.value.trim();
    saveDraft({
      source: 'photo',
      imageBase64: draft.imageBase64,
      ...(comment ? { text: comment } : {}),
    });
    track(Events.AI_REQUEST_SENT, { source: 'photo', has_comment: !!comment });
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
