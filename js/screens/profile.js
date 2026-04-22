import { getState, setState } from '../state.js';
import { navigate, navigateBack } from '../router.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { upsertProfile } from '../lib/db.js';
import { signOut, deleteAccount, updatePassword } from '../lib/auth.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { track, Events } from '../lib/analytics.js';
import { openGoalsModal } from '../lib/goals-modal.js';

export function renderProfile() {
  track(Events.PROFILE_SCREEN_VIEWED);

  renderBottomNav(null);

  const { profile, user } = getState();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="screen" id="profile-screen">
      <div class="screen__header">
        <button class="btn btn--icon btn--ghost js-back">${_iconBack()}</button>
        <h1 class="screen__title">Профиль</h1>
      </div>
      <div class="screen__body">

        <!-- User account card -->
        <div class="card" style="background:#ffffff;padding:14px 16px;display:flex;align-items:center;gap:12px">
          <div style="width:38px;height:38px;background:var(--accent-light);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent-text)">
            ${_iconUser()}
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">${user?.email || ''}</div>
            <div style="font-size:11px;color:#6d8a42;font-weight:600;margin-top:2px">● Авторизован</div>
          </div>
        </div>

        <!-- Goals -->
        <div class="section">
          <div class="section__title">Цели по питанию</div>
          ${_renderGoalsSection(profile)}
        </div>

        <!-- PWA install banner (rendered dynamically) -->
        <div id="pwa-profile-banner-slot"></div>

        <!-- Settings -->
        <div class="card" style="padding:0;overflow:hidden;background:#ffffff">
          <div class="settings-list">
            <div class="settings-item js-goals">
              <div class="settings-item__icon">${iconTarget()}</div>
              <div class="settings-item__label">Цели по КБЖУ</div>
              <div class="settings-item__chevron">${iconChevronRight()}</div>
            </div>
            <div class="settings-item js-change-password">
              <div class="settings-item__icon">${iconLock()}</div>
              <div class="settings-item__label">Сменить пароль</div>
              <div class="settings-item__chevron">${iconChevronRight()}</div>
            </div>
            <div class="settings-item js-signout">
              <div class="settings-item__icon">${iconLogOut()}</div>
              <div class="settings-item__label">Выйти из аккаунта</div>
              <div class="settings-item__chevron">${iconChevronRight()}</div>
            </div>
            <div class="settings-item settings-item--danger js-delete">
              <div class="settings-item__icon" style="background:var(--danger-light);color:var(--danger)">${iconTrash()}</div>
              <div class="settings-item__label">Удалить аккаунт</div>
              <div class="settings-item__chevron">${iconChevronRight()}</div>
            </div>
          </div>
        </div>

        <div style="text-align:center;padding-bottom:8px">
          <p style="font-size:var(--font-size-xs);color:var(--text-placeholder);margin:0 0 8px">
            <a href="#contact" style="color:var(--text-secondary)">Связаться <span style="font-size:10px">→</span></a>
          </p>
          <p style="font-size:var(--font-size-xs);color:var(--text-placeholder);margin:0;display:flex;justify-content:center;gap:12px">
            <a href="#privacy" style="color:var(--text-placeholder);text-decoration:underline;text-underline-offset:2px">Политика конфиденциальности</a>
            <a href="#terms" style="color:var(--text-placeholder);text-decoration:underline;text-underline-offset:2px">Пользовательское соглашение</a>
          </p>
        </div>
      </div>
    </div>
  `;

  app.querySelector('.js-back').addEventListener('click', () => navigateBack());
  _renderPwaBanner();
  app.querySelectorAll('.js-goals, .goal-card').forEach(el => el.addEventListener('click', () => openGoalsModal()));
  app.querySelector('.js-change-password').addEventListener('click', () => _changePassword());

  app.querySelector('.js-signout').addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Выйти из аккаунта?',
      confirmLabel: 'Выйти',
    });
    if (!confirmed) return;
    try {
      await signOut();
      setState({ user: null, profile: null, meals: [] });
      navigate('welcome');
    } catch {
      toast.error('Не удалось выйти');
    }
  });

  app.querySelector('.js-delete').addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Удалить аккаунт?',
      text: 'Все ваши данные будут удалены безвозвратно. Это действие нельзя отменить.',
      confirmLabel: 'Удалить навсегда',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteAccount();
      setState({ user: null, profile: null, meals: [] });
      navigate('welcome');
    } catch {
      toast.error('Не удалось удалить аккаунт. Попробуйте позже.');
    }
  });
}

// ── Change password modal ─────────────────────────────

async function _changePassword() {
  const { createModal } = await import('../components/modal.js');

  const form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:16px';
  form.innerHTML = `
    <div class="input-group">
      <label class="input-label">Новый пароль</label>
      <input class="input" id="cp-new" type="password" placeholder="Минимум 6 символов" autocomplete="new-password">
    </div>
    <div class="input-group">
      <label class="input-label">Повторите пароль</label>
      <input class="input" id="cp-confirm" type="password" placeholder="••••••••" autocomplete="new-password">
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:12px;width:100%';
  footer.innerHTML = `
    <button class="btn btn--secondary btn--full js-cancel">Отмена</button>
    <button class="btn btn--primary btn--full js-save">Сохранить</button>
  `;

  const modal = createModal({ title: 'Сменить пароль', body: form, footer });
  footer.querySelector('.js-cancel').addEventListener('click', modal.close);
  footer.querySelector('.js-save').addEventListener('click', async () => {
    const newPass = form.querySelector('#cp-new').value;
    const confirm = form.querySelector('#cp-confirm').value;
    const btn = footer.querySelector('.js-save');
    if (newPass.length < 6) { toast.error('Пароль должен быть не менее 6 символов'); return; }
    if (newPass !== confirm) { toast.error('Пароли не совпадают'); return; }
    btn.disabled = true;
    try {
      await updatePassword(newPass);
      modal.close();
      toast.success('Пароль изменён');
    } catch {
      toast.error('Не удалось изменить пароль');
      btn.disabled = false;
    }
  });

  modal.open();
}


function _renderGoalsSection(profile) {
  if (!profile?.goal_kcal && !profile?.goal_protein) {
    return `
      <div class="card card--flat" style="text-align:center;padding:20px">
        <p style="font-size:var(--font-size-sm);color:var(--text-secondary)">Цели не заданы</p>
        <button class="btn btn--primary btn--sm js-goals" style="margin-top:8px">Задать цели</button>
      </div>
    `;
  }

  const cards = [];
  if (profile.goal_kcal)    cards.push(_goalCard('Калории', profile.goal_kcal, 'ккал/день', 'var(--accent)'));
  if (profile.goal_protein) cards.push(_goalCard('Белки', profile.goal_protein, 'г/день', 'var(--protein-color)'));
  if (profile.goal_fat)     cards.push(_goalCard('Жиры', profile.goal_fat, 'г/день', 'var(--fat-color)'));
  if (profile.goal_carb)    cards.push(_goalCard('Углеводы', profile.goal_carb, 'г/день', 'var(--carb-color)'));

  return `<div class="goal-cards">${cards.join('')}</div>`;
}

function _goalCard(label, value, unit, color) {
  return `
    <div class="goal-card">
      <div class="goal-card__label">${label}</div>
      <div class="goal-card__value" style="color:${color}">${value}</div>
      <div class="goal-card__unit">${unit}</div>
    </div>
  `;
}

function _getInitials(name) {
  return name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase();
}

// ── PWA install banner in profile ────────────────────

function _renderPwaBanner() {
  const slot = document.getElementById('pwa-profile-banner-slot');
  if (!slot) return;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  if (isStandalone) return; // already installed

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const canPrompt = !!window.__pwaPrompt;

  if (!isIOS && !canPrompt) return;

  const instr = isIOS
    ? 'Нажмите <strong>Поделиться</strong> → <strong>На экран «Домой»</strong>, чтобы сайт работал как приложение'
    : 'Нажмите кнопку ниже, чтобы сайт работал как приложение';

  slot.innerHTML = `
    <div class="profile-pwa-banner">
      <div class="profile-pwa-banner__body">
        <div class="profile-pwa-banner__title">Установите иконку на экран</div>
        <div class="profile-pwa-banner__text">${instr}</div>
        ${canPrompt ? `<button class="btn btn--primary btn--sm" style="margin-top:8px" id="pwa-profile-install">Установить</button>` : ''}
      </div>
      <div class="profile-pwa-banner__icon">📲</div>
    </div>
  `;

  slot.querySelector('#pwa-profile-install')?.addEventListener('click', async () => {
    if (window.__pwaPrompt) {
      window.__pwaPrompt.prompt();
      const { outcome } = await window.__pwaPrompt.userChoice;
      window.__pwaPrompt = null;
      if (outcome === 'accepted') slot.innerHTML = '';
    }
  });
}

// ── SVG Icons ────────────────────────────────────────

function _iconUser() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
}

function _iconBack() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}

function iconTarget() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>`;
}

function iconLogOut() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>`;
}

function iconTrash() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>`;
}

function iconLock() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>`;
}

function iconChevronRight() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`;
}
