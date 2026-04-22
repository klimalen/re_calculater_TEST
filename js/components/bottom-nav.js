import { navigate } from '../router.js';

let _nav = null;

export function renderBottomNav(activeTab) {
  if (!_nav) {
    _nav = document.createElement('nav');
    _nav.className = 'bottom-nav';
    document.body.appendChild(_nav);
  }

  _nav.style.display = '';
  _nav.innerHTML = `
    <button class="nav-item${activeTab === 'stats' ? ' nav-item--active' : ''}" data-route="stats" aria-label="Статистика">
      ${iconStats()}
    </button>
    <button class="nav-fab" aria-label="Добавить приём пищи">
      ${iconPlus()}
    </button>
    <button class="nav-item${activeTab === 'today' ? ' nav-item--active' : ''}" data-route="today" aria-label="Дневник">
      ${iconToday()}
    </button>
  `;

  _nav.querySelector('[data-route="stats"]').addEventListener('click', () => navigate('stats'));
  _nav.querySelector('[data-route="today"]').addEventListener('click', () => navigate('today'));
  _nav.querySelector('.nav-fab').addEventListener('click', () => navigate('add-meal'));
}

export function hideBottomNav() {
  if (_nav) _nav.style.display = 'none';
}

export function showBottomNav() {
  if (_nav) _nav.style.display = '';
}

// ── Icons ─────────────────────────────────────────────

function iconToday() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`;
}

function iconStats() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
  </svg>`;
}

function iconPlus() {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>`;
}
