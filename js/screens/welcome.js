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
        <p class="bento-wrap__label">Возможности</p>
        <div class="bento-grid">

          <div class="bc bc-how">
            <div class="bc-how__top">
              <span class="bc-how__badge">✦ AI-распознавание</span>
              <p class="bc-how__headline">Сфотографируй —<br>и КБЖУ готов</p>
              <p class="bc-how__sub">Опиши или сними блюдо,<br>AI посчитает всё сам</p>
            </div>
            <div class="bc-how__pills">
              <span class="bc-pill">📷 По фото</span>
              <span class="bc-pill">✏️ Текстом</span>
            </div>
          </div>

          <div class="bc bc-s1 bc-screen">
            <img src="screens/1.png" alt="">
          </div>

          <div class="bc bc-f1 bc-photo">
            <img src="photo/3.jpeg" alt="">
          </div>

          <div class="bc bc-fw1 bc-photo">
            <img src="photo/photo_2026-04-08 12.20.43.jpeg" alt="">
          </div>

          <div class="bc bc-free">
            <p class="bc-free__num">0 ₽</p>
            <p class="bc-free__label">Бесплатно</p>
          </div>

          <div class="bc bc-s2 bc-screen">
            <img src="screens/2.png" alt="">
          </div>

          <div class="bc bc-s5 bc-screen">
            <img src="screens/5.png" alt="">
          </div>

          <div class="bc bc-day">
            <p class="bc-day__headline">Весь рацион —<br>как на ладони</p>
            <p class="bc-day__sub">КБЖУ, динамика,<br>цели по калориям</p>
          </div>

          <div class="bc bc-f2 bc-photo">
            <img src="photo/5.jpeg" alt="">
          </div>

          <div class="bc bc-fw2 bc-photo">
            <img src="photo/photo_2026-04-08 12.20.57.jpeg" alt="">
          </div>

        </div>

        <button class="bento-cta-btn js-register">Начать сейчас →</button>
      </div>

    </div>
  `;

  app.querySelectorAll('.js-register').forEach(btn => btn.addEventListener('click', () => navigate('register')));
  app.querySelector('.js-login').addEventListener('click', () => navigate('login'));
}
