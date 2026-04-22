/**
 * Application entry point.
 * - Initializes Supabase auth listener
 * - Registers routes
 * - Handles PWA install prompt & SW update notification
 */

import { supabase } from './supabase.js';
import { getState, setState } from './state.js';
import { initRouter, navigate, onRoute } from './router.js';
import { getProfile } from './lib/db.js';
import { detectTimezone } from './lib/timezone.js';

import { renderWelcome }       from './screens/welcome.js';
import { renderLogin, renderRegister, renderForgotPassword, renderResetPassword } from './screens/auth.js';
import { renderToday }         from './screens/today.js';
import { renderAddMeal }       from './screens/add-meal.js';
import { renderPhotoPreview }  from './screens/photo-preview.js';
import { renderTextInput }     from './screens/text-input.js';
import { renderAiResult }      from './screens/ai-result.js';
import { renderStats }         from './screens/stats.js';
import { renderProfile }       from './screens/profile.js';
import { renderPrivacy, renderTerms } from './screens/legal.js';
import { renderContact } from './screens/contact.js';

// ── PWA: Service Worker ───────────────────────────────

async function initSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');

    // Detect new SW waiting → show update banner
    function checkForWaiting(reg) {
      if (reg.waiting) showUpdateBanner(reg.waiting);
    }

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker?.addEventListener('statechange', () => {
        // Fix: was `newWorker.statechange` (always undefined) — must be `newWorker.state`
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          checkForWaiting(reg);
        }
      });
    });

    checkForWaiting(reg);

    // Re-check for SW updates every time the user returns to the tab
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch {}
}

function showUpdateBanner(worker) {
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span>Доступна новая версия</span>
    <button class="btn btn--sm" style="background:rgba(255,255,255,0.2);color:white" id="update-btn">Обновить</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('#update-btn').addEventListener('click', () => {
    worker.postMessage('SKIP_WAITING');
    window.location.reload();
  });
}

// ── PWA: Install prompt ───────────────────────────────

let _deferredPrompt = null;
const PWA_DISMISS_KEY = 'pwa_dismissed_at';
const DISMISS_HOURS   = 24;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredPrompt = e;
  window.__pwaPrompt = e; // shared with profile screen
  _maybeShowInstallBanner();
});

function _maybeShowInstallBanner() {
  const dismissed = localStorage.getItem(PWA_DISMISS_KEY);
  if (dismissed) {
    const hours = (Date.now() - parseInt(dismissed)) / 3_600_000;
    if (hours < DISMISS_HOURS) return;
  }
  // Show after 45s delay so user has time to explore the app first
  setTimeout(_showInstallBanner, 45000);
}

function _showInstallBanner() {
  if (!_deferredPrompt) return;
  if (document.getElementById('pwa-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'pwa-banner';
  banner.id = 'pwa-banner';
  banner.innerHTML = `
    <span class="pwa-banner__text">📲 Установите иконку на экран, чтобы сайт работал как приложение</span>
    <div class="pwa-banner__actions">
      <button class="btn btn--sm btn--ghost" style="color:rgba(255,255,255,0.7)" id="pwa-dismiss">Нет</button>
      <button class="btn btn--sm" style="background:var(--accent);color:white" id="pwa-install">Установить</button>
    </div>
  `;
  document.body.appendChild(banner);

  banner.querySelector('#pwa-install').addEventListener('click', async () => {
    banner.remove();
    _deferredPrompt.prompt();
    await _deferredPrompt.userChoice;
    _deferredPrompt = null;
  });

  banner.querySelector('#pwa-dismiss').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem(PWA_DISMISS_KEY, String(Date.now()));
  });
}

// iOS install hint (no beforeinstallprompt on Safari)
function _maybeShowIOSHint() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if (!isIOS || isStandalone) return;
  // Don't show iOS hint if Android install prompt is available
  if (_deferredPrompt) return;

  const dismissed = localStorage.getItem(PWA_DISMISS_KEY);
  if (dismissed && (Date.now() - parseInt(dismissed)) < DISMISS_HOURS * 3_600_000) return;

  setTimeout(() => {
    const banner = document.createElement('div');
    banner.className = 'pwa-banner';
    banner.innerHTML = `
      <span class="pwa-banner__text">📲 Установите иконку на экран — нажмите <strong>Поделиться</strong> → <strong>На экран «Домой»</strong>, чтобы сайт работал как приложение</span>
      <button class="btn btn--sm btn--ghost" style="color:rgba(255,255,255,0.7)" id="ios-dismiss">✕</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('#ios-dismiss').addEventListener('click', () => {
      banner.remove();
      localStorage.setItem(PWA_DISMISS_KEY, String(Date.now()));
    });
  }, 45000);
}

// ── Auth + routing ────────────────────────────────────

/**
 * Read the Supabase session directly from localStorage without waiting for
 * the Supabase JS auth lock. Returns the parsed session or null if absent /
 * expired / unreadable. Used only as a fast-path hint — Supabase remains the
 * authoritative source for token refresh and sign-out events.
 */
function _peekStoredSession() {
  try {
    const projectRef = new URL(supabase.supabaseUrl).hostname.split('.')[0];
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.user || !data?.expires_at) return null;
    // Reject if token expires within the next 60 seconds
    if (Date.now() / 1000 > data.expires_at - 60) return null;
    return data;
  } catch {
    return null;
  }
}

async function initApp() {
  initSW();
  _maybeShowIOSHint();

  // Register routes
  onRoute('welcome',         () => renderWelcome());
  onRoute('login',           () => renderLogin());
  onRoute('register',        () => renderRegister());
  onRoute('forgot-password', () => renderForgotPassword());
  onRoute('reset-password',  () => renderResetPassword());
  onRoute('today',           () => renderToday());
  onRoute('add-meal',        () => renderAddMeal());
  onRoute('photo-preview',   () => renderPhotoPreview());
  onRoute('text-input',      () => renderTextInput());
  onRoute('ai-result',       () => renderAiResult());
  onRoute('stats',           () => renderStats());
  onRoute('profile',         () => renderProfile());
  onRoute('privacy',         () => renderPrivacy());
  onRoute('terms',           () => renderTerms());
  onRoute('contact',         () => renderContact());

  // Single handler for session initialization — guarded against duplicate calls.
  let _sessionHandled = false;

  async function _handleSession(user) {
    if (_sessionHandled) return;
    _sessionHandled = true;

    const profile = await getProfile(user.id).catch(() => null);
    setState({ user, profile });

    // New user — initialise profile in background (timezone, mark onboarding done)
    if (!profile) {
      import('./lib/db.js').then(({ upsertProfile }) =>
        upsertProfile(user.id, {
          onboarding_done: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          display_name: user.email?.split('@')[0] || '',
        })
          .then(updated => setState({ user, profile: updated }))
          .catch(() => {})
      );
    }

    initRouter();

    const hash = window.location.hash.slice(1);
    if (!hash || hash === 'welcome' || hash === 'login' || hash === 'register') {
      navigate('today');
    }
    window.hideSplash?.();
  }

  // Auth state listener handles subsequent events (new sign-in, sign-out).
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      if (session?.user) await _handleSession(session.user);
    }

    if (event === 'SIGNED_OUT') {
      _sessionHandled = false;
      setState({ user: null, profile: null, meals: [] });
      navigate('welcome');
    }
  });

  // Supabase v2 uses Web Locks internally and can stall for 10-15s before
  // resolving getSession() or firing INITIAL_SESSION. Bypass this by reading
  // the stored session directly from localStorage — it's synchronous and instant.
  // Supabase continues its background init; the guard prevents double-handling.
  const eagerSession = _peekStoredSession();
  if (eagerSession?.user) {
    await _handleSession(eagerSession.user);
  } else {
    // No stored session — fall back to Supabase (handles expired tokens, new logins)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await _handleSession(session.user);
      } else {
        initRouter();
        window.hideSplash?.();
      }
    } catch (err) {
      console.error('Auth init failed:', err);
      initRouter();
      window.hideSplash?.();
    }
  }
}

// ── Boot ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initApp);
