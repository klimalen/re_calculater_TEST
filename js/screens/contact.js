import { navigateBack } from '../router.js';
import { hideBottomNav } from '../components/bottom-nav.js';
import { getState } from '../state.js';
import { supabase } from '../supabase.js';
import { toast } from '../components/toast.js';
import { withTimeout } from '../lib/timeout.js';

export function renderContact() {
  hideBottomNav();

  const { user } = getState();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="contact-screen screen--no-nav">

      <div class="contact-header">
        <button class="btn btn--icon btn--ghost js-back">${_iconBack()}</button>
        <h1 class="contact-header__title">Обратная связь</h1>
      </div>

      <div class="contact-body">
        <p class="contact-desc">
          Расскажите, что можно улучшить, или сообщите об ошибке. Мы читаем каждое сообщение!
        </p>

        <div class="contact-form">
          <div class="input-group">
            <label class="input-label" for="fb-message">Ваше сообщение</label>
            <textarea
              class="input contact-textarea"
              id="fb-message"
              placeholder="Напишите, что думаете о приложении..."
              maxlength="2000"
              rows="6"
            ></textarea>
            <div class="contact-char-count"><span id="fb-count">0</span> / 2000</div>
          </div>

          <button class="btn btn--primary btn--full js-submit" id="fb-submit">
            <span class="btn__text">Отправить</span>
          </button>
        </div>

        <div class="contact-alt">
          <span>Или напишите напрямую:</span>
          <a href="mailto:support.versapp@gmail.com" class="contact-email">support.versapp@gmail.com</a>
        </div>
      </div>

    </div>
  `;

  const textarea = app.querySelector('#fb-message');
  const counter  = app.querySelector('#fb-count');
  const submitBtn = app.querySelector('.js-submit');

  app.querySelector('.js-back').addEventListener('click', () => navigateBack());

  textarea.addEventListener('input', () => {
    counter.textContent = textarea.value.length;
  });

  submitBtn.addEventListener('click', async () => {
    const message = textarea.value.trim();
    if (!message) {
      toast.error('Напишите сообщение');
      textarea.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('btn--loading');

    try {
      const { error } = await withTimeout(
        supabase.from('feedback').insert({
          user_id:    user?.id    ?? null,
          user_email: user?.email ?? null,
          message,
        })
      );
      if (error) throw error;

      toast.success('Спасибо за ваше сообщение!');
      navigateBack();
    } catch (err) {
      console.error('[contact] feedback submit', err);
      toast.error('Не удалось отправить. Попробуйте позже.');
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn--loading');
    }
  });
}

function _iconBack() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`;
}
