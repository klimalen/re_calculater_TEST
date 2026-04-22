import { navigate } from '../router.js';
import { hideBottomNav } from '../components/bottom-nav.js';

export function renderWelcome() {
  hideBottomNav();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="welcome-bento screen--no-nav">

      <div class="bento-grid">

        <div class="bento-card bento-hero">
          <p class="bento-hero__title">Следить за калориями еще никогда не было так просто!</p>
          <p class="bento-hero__sub">Сфотографируй или опиши еду — приложение само рассчитает КБЖУ</p>
        </div>

        <div class="bento-card bento-screen bento-screen--sm">
          <img src="/screens/2.png" class="bento-img" alt="" draggable="false">
        </div>
        <div class="bento-card bento-screen bento-screen--tall">
          <img src="/screens/1.png" class="bento-img" alt="" draggable="false">
        </div>

        <div class="bento-card bento-free">
          <span class="bento-free__price">0 ₽</span>
          <span class="bento-free__label">Сервис абсолютно бесплатен</span>
        </div>

        <div class="bento-card bento-screen bento-screen--stats">
          <img src="/screens/5.png" class="bento-img" alt="" draggable="false">
        </div>
        <div class="bento-card bento-analytics">
          <span class="bento-analytics__text">Следи за прогрессом с помощью аналитики</span>
        </div>

      </div>

      <div class="bento-bottom">
        <div class="bento-card bento-tagline">
          <span class="bento-tagline__title">Весь рацион —<br>как на ладони</span>
          <span class="bento-tagline__sub">КБЖУ, динамика,<br>цели по калориям</span>
        </div>
        <div class="bento-card bento-food">
          <img src="/photo/1.jpeg" class="bento-img bento-img--center" alt="" draggable="false">
        </div>
        <button class="bento-card bento-cta js-register">
          Начать →
        </button>
      </div>

      <div class="bento-footer">
        <button class="bento-login js-login">Уже есть аккаунт? <strong>Войти</strong></button>
      </div>

    </div>
  `;

  app.querySelector('.js-register').addEventListener('click', () => navigate('register'));
  app.querySelector('.js-login').addEventListener('click', () => navigate('login'));
}
