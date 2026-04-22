import { navigate } from '../router.js';
import { hideBottomNav } from '../components/bottom-nav.js';

export function renderWelcome() {
  hideBottomNav();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="welcome screen--no-nav">

      <div class="welcome__first-view">
        <div class="welcome__top">
          <img src="photo/4.jpeg" class="welcome__hero-img" alt="Здоровое питание">
          <div class="welcome__hero-overlay"></div>
          <div class="welcome__logo-pill">
            <img src="logo.svg" class="welcome__logo-img-sm" alt="Re Food Calculator">
            <span class="welcome__logo-name-sm">Food Calculator</span>
          </div>
        </div>

        <div class="welcome__bottom">
          <div class="welcome__text">
            <h1 class="welcome__title">Считай калории<br>просто!</h1>
            <p class="welcome__subtitle">Сфотографируй или опиши еду —<br>AI сам посчитает КБЖУ</p>
          </div>
          <div class="welcome__actions">
            <button class="btn btn--primary btn--full js-register">Начать сейчас</button>
            <button class="welcome__login-link js-login">Войти</button>
          </div>
        </div>
      </div>

      <div class="bento-wrap">
        <div class="bento-grid">

          <div class="bento-card bento-hero">
            <p class="bento-hero__title">Следить за калориями просто!</p>
            <p class="bento-hero__sub">Сфотографируй или опиши еду — приложение само рассчитает КБЖУ</p>
          </div>

          <div class="bento-card bento-screen bento-screen--sm">
            <img src="screens/2.png" alt="">
          </div>
          <div class="bento-card bento-screen bento-screen--tall">
            <img src="screens/1.png" alt="">
          </div>

          <div class="bento-card bento-free">
            <span class="bento-free__price">0 ₽</span>
            <span class="bento-free__label">Сервис абсолютно бесплатен</span>
          </div>

          <div class="bento-card bento-screen bento-screen--stats">
            <img src="screens/5.png" alt="">
          </div>
          <div class="bento-card bento-analytics">
            <span class="bento-analytics__title">Весь рацион —<br>как на ладони</span>
            <span class="bento-analytics__sub">КБЖУ, динамика, цели по калориям</span>
          </div>

        </div>

        <div class="bento-bottom">
          <div class="bento-card bento-tagline">
            <span class="bento-tagline__title">Следи за прогрессом с помощью аналитики</span>
          </div>
          <div class="bento-card bento-food">
            <img src="photo/1.jpeg" alt="">
          </div>
          <button class="bento-card bento-cta js-register">
            Начать →
          </button>
        </div>
      </div>

    </div>
  `;

  app.querySelectorAll('.js-register').forEach(btn => btn.addEventListener('click', () => navigate('register')));
  app.querySelector('.js-login').addEventListener('click', () => navigate('login'));
}
