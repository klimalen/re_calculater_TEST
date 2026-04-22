import { navigate } from '../router.js';
import { hideBottomNav } from '../components/bottom-nav.js';
import { compressImage } from '../lib/image.js';
import { saveDraft, getState } from '../state.js';
import { toast } from '../components/toast.js';
import { track, Events } from '../lib/analytics.js';

export function renderAddMeal() {
  track(Events.ADD_MEAL_SCREEN_VIEWED);

  hideBottomNav();

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="screen">
      <div class="screen__header">
        <button class="btn btn--icon btn--ghost js-back">${iconBack()}</button>
        <h1 class="screen__title">Добавить еду</h1>
      </div>
      <div class="add-meal">
        <div class="add-meal__methods">

          <!-- 1: Camera — opens directly -->
          <div class="add-meal-hero js-camera-card">
            <div class="add-meal-hero__badge">AI</div>
            <div class="add-meal-hero__icon">${iconCamera()}</div>
            <div class="add-meal-hero__title">Сфотографировать еду</div>
            <div class="add-meal-hero__text">AI распознает состав и рассчитает КБЖУ автоматически</div>
          </div>

          <!-- 2: Gallery -->
          <div class="add-method-card js-gallery-card" style="position:relative">
            <div class="add-meal-hero__badge" style="position:absolute;top:10px;right:10px;font-size:9px;padding:2px 6px">AI</div>
            <div class="add-method-card__icon">${iconImageUp()}</div>
            <div>
              <div class="add-method-card__title">Выбрать фото из галереи</div>
              <div class="add-method-card__text">Загрузите готовое фото блюда</div>
            </div>
          </div>

          <!-- 3: Text -->
          <div class="add-method-card js-text-card" style="position:relative">
            <div class="add-meal-hero__badge" style="position:absolute;top:10px;right:10px;font-size:9px;padding:2px 6px">AI</div>
            <div class="add-method-card__icon">${iconPencil()}</div>
            <div>
              <div class="add-method-card__title">Написать текстом</div>
              <div class="add-method-card__text">Опишите прием пищи — AI рассчитает КБЖУ</div>
            </div>
          </div>

        </div>

        <!-- Hidden file inputs -->
        <input type="file" id="photo-input-camera"  accept="image/*" capture="environment" style="display:none">
        <input type="file" id="photo-input-gallery" accept="image/*" style="display:none">

        <!-- Compression loading indicator -->
        <div id="compress-loading" style="display:none;align-items:center;gap:8px;color:var(--text-secondary);font-size:14px;padding:8px 0">
          <div class="ai-processing__spinner" style="width:20px;height:20px"></div>
          <span>Подготовка фото…</span>
        </div>
      </div>
    </div>
  `;

  app.querySelector('.js-back').addEventListener('click', () => navigate('today'));

  const { user } = getState();
  if (user && localStorage.getItem(`has_meal_${user.id}`) !== '1') {
    const hint = document.createElement('div');
    hint.className = 'add-meal__hint';
    hint.textContent = 'Опиши что ты съел — текстом или фото — и AI рассчитает КБЖУ за секунды';
    app.querySelector('.add-meal__methods').insertAdjacentElement('afterend', hint);
  }

  const inputCamera  = document.getElementById('photo-input-camera');
  const inputGallery = document.getElementById('photo-input-gallery');
  const loadingEl    = document.getElementById('compress-loading');

  app.querySelector('.js-camera-card').addEventListener('click', () => {
    track(Events.MEAL_ADD_STARTED, { source: 'photo' });
    inputCamera.click();
  });

  app.querySelector('.js-gallery-card').addEventListener('click', () => {
    track(Events.MEAL_ADD_STARTED, { source: 'gallery' });
    inputGallery.click();
  });

  app.querySelector('.js-text-card').addEventListener('click', () => {
    track(Events.MEAL_ADD_STARTED, { source: 'text' });
    navigate('text-input');
  });

  async function _handleFile(file, inputEl) {
    if (!file) return;
    loadingEl.style.display = 'flex';
    try {
      const imageBase64 = await compressImage(file);
      saveDraft({ source: 'photo', imageBase64 });
      navigate('photo-preview');
    } catch {
      toast.error('Не удалось обработать фото. Попробуйте другое.');
      inputEl.value = '';
    } finally {
      loadingEl.style.display = 'none';
    }
  }

  inputCamera .addEventListener('change', e => _handleFile(e.target.files[0], inputCamera));
  inputGallery.addEventListener('change', e => _handleFile(e.target.files[0], inputGallery));
}

function iconBack() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}

function iconCamera(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`;
}

function iconPencil() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`;
}

function iconImageUp(size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>`;
}
