import { navigate, navigateBack } from '../router.js';

/** Escape HTML special chars — used when inserting user input into innerHTML */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
import { signIn, signUp, resetPassword, updatePassword, authErrorMessage } from '../lib/auth.js';
import { toast } from '../components/toast.js';
import { track, Events } from '../lib/analytics.js';
import { hideBottomNav } from '../components/bottom-nav.js';

// ── Login ─────────────────────────────────────────────

export function renderLogin() {
  _renderAuthForm({
    title: 'Вход',
    subtitle: 'Введите email и пароль',
    fields: [
      { id: 'email',    type: 'email',    label: 'Email',   placeholder: 'you@example.com' },
      { id: 'password', type: 'password', label: 'Пароль',  placeholder: '••••••••' },
    ],
    submitLabel: 'Войти',
    footer: `Нет аккаунта? <a class="js-switch">Зарегистрироваться</a>`,
    extraLink: `<a class="js-forgot" style="color:var(--text-secondary);font-size:var(--font-size-sm)">Забыли пароль?</a>`,
    async onSubmit(data, btn) {
      await signIn(data.email, data.password);
      track(Events.AUTH_LOGIN);
      // Auth state change will trigger routing via app.js
    },
    onSwitch: () => navigate('register'),
    onForgot: () => navigate('forgot-password'),
  });
}

// ── Register ──────────────────────────────────────────

export function renderRegister() {
  _renderAuthForm({
    title: 'Регистрация',
    subtitle: 'Создайте аккаунт, чтобы начать',
    fields: [
      { id: 'email',    type: 'email',    label: 'Email',   placeholder: 'you@example.com' },
      { id: 'password', type: 'password', label: 'Пароль',  placeholder: 'Минимум 6 символов' },
    ],
    submitLabel: 'Создать аккаунт',
    legalText: `Нажимая «Создать аккаунт», вы соглашаетесь с <a href="#terms">условиями использования</a> и <a href="#privacy">политикой конфиденциальности</a>.`,
    footer: `Уже есть аккаунт? <a class="js-switch">Войти</a>`,
    async onSubmit(data, btn) {
      if (data.password.length < 6) throw new Error('Пароль должен быть не менее 6 символов');
      const result = await signUp(data.email, data.password);
      track(Events.AUTH_REGISTERED);
      // When email confirmation is enabled in Supabase, signUp succeeds but
      // returns no session — show a "check your email" screen instead of waiting
      // for an auth state change that won't come until the user clicks the link.
      if (!result?.session) {
        _showEmailConfirmation(data.email);
      }
      // If session is present, onAuthStateChange fires SIGNED_IN → navigate('today')
    },
    onSwitch: () => navigate('login'),
  });
}

// ── Forgot password ───────────────────────────────────

export function renderForgotPassword() {
  _renderAuthForm({
    title: 'Восстановление пароля',
    subtitle: 'Введите email — мы отправим ссылку для сброса пароля',
    fields: [
      { id: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com' },
    ],
    submitLabel: 'Отправить ссылку',
    footer: `<a class="js-switch">← Вернуться ко входу</a>`,
    async onSubmit(data) {
      await resetPassword(data.email);
      toast.success('Письмо отправлено! Проверьте почту');
    },
    onSwitch: () => navigate('login'),
  });
}

// ── Reset password (from email link) ─────────────────

export function renderResetPassword() {
  _renderAuthForm({
    title: 'Новый пароль',
    subtitle: 'Придумайте новый пароль для входа',
    fields: [
      { id: 'password',  type: 'password', label: 'Новый пароль',    placeholder: 'Минимум 6 символов' },
      { id: 'password2', type: 'password', label: 'Повторите пароль', placeholder: '••••••••' },
    ],
    submitLabel: 'Сохранить пароль',
    async onSubmit(data) {
      if (data.password !== data.password2) throw new Error('Пароли не совпадают');
      if (data.password.length < 6) throw new Error('Пароль должен быть не менее 6 символов');
      await updatePassword(data.password);
      toast.success('Пароль изменён');
      // Clear hash and redirect
      window.location.hash = 'today';
    },
  });
}

// ── Shared form builder ───────────────────────────────

function _renderAuthForm({ title, subtitle, fields, submitLabel, footer, extraLink, legalText, onSubmit, onSwitch, onForgot }) {
  hideBottomNav();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="auth-screen screen--no-nav">
      <div class="auth-screen__back">
        <button class="btn btn--icon btn--ghost js-back">${iconBack()}</button>
      </div>
      <h1 class="auth-screen__title">${title}</h1>
      <p class="auth-screen__subtitle">${subtitle}</p>
      <form class="auth-screen__form" novalidate>
        ${fields.map(f => `
          <div class="input-group">
            <label class="input-label" for="${f.id}">${f.label}</label>
            <input class="input" id="${f.id}" name="${f.id}" type="${f.type}" placeholder="${f.placeholder}" autocomplete="${_autocomplete(f.id)}" required>
            <div class="input-error-msg" id="${f.id}-error" style="display:none"></div>
          </div>
        `).join('')}
        ${extraLink ? `<div style="text-align:right">${extraLink}</div>` : ''}
        <button type="submit" class="btn btn--primary btn--full js-submit">
          <span class="btn__text">${submitLabel}</span>
        </button>
        ${legalText ? `<p class="auth-legal">${legalText}</p>` : ''}
      </form>
      ${footer ? `<div class="auth-screen__footer">${footer}</div>` : ''}
    </div>
  `;

  const form = app.querySelector('form');
  const submitBtn = app.querySelector('.js-submit');

  app.querySelector('.js-back')?.addEventListener('click', navigateBack);
  app.querySelector('.js-switch')?.addEventListener('click', onSwitch);
  app.querySelector('.js-forgot')?.addEventListener('click', onForgot);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    // Clear errors
    app.querySelectorAll('.input-error-msg').forEach(el => {
      el.style.display = 'none';
    });
    app.querySelectorAll('.input--error').forEach(el => {
      el.classList.remove('input--error');
    });

    const data = Object.fromEntries(new FormData(form));

    submitBtn.disabled = true;
    submitBtn.classList.add('btn--loading');

    try {
      await onSubmit(data, submitBtn);
    } catch (err) {
      const msg = authErrorMessage(err);
      _showFormError(app, fields, msg);
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn--loading');
    }
  });
}

function _showEmailConfirmation(email) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="auth-screen screen--no-nav" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px 24px;text-align:center">
      <div style="font-size:56px">📬</div>
      <h1 class="auth-screen__title">Проверьте почту</h1>
      <p class="auth-screen__subtitle">Мы отправили письмо на<br><strong>${esc(email)}</strong></p>
      <p style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.5">Перейдите по ссылке в письме,<br>чтобы завершить регистрацию.</p>
      <button class="btn btn--secondary btn--full js-to-login">Войти после подтверждения</button>
    </div>
  `;
  app.querySelector('.js-to-login').addEventListener('click', () => navigate('login'));
}

function _showFormError(app, fields, msg) {
  // Try to show error under the last field, or as toast
  const lastField = fields[fields.length - 1];
  const errEl = app.querySelector(`#${lastField.id}-error`);
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.display = '';
    const input = app.querySelector(`#${lastField.id}`);
    input?.classList.add('input--error');
  } else {
    toast.error(msg);
  }
}

function _autocomplete(fieldId) {
  const map = {
    email: 'email',
    password: 'current-password',
    password2: 'new-password',
    name: 'name',
  };
  return map[fieldId] || 'off';
}

function iconBack() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`;
}
