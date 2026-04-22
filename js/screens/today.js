import { getState, setState, subscribe } from '../state.js';
import { navigate } from '../router.js';
import { getMealsByDate } from '../lib/db.js';
import { todayString } from '../lib/timezone.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { createMealCard } from '../components/meal-card.js';
import { skeletonSummaryCard, skeletonList } from '../components/skeleton.js';
import { openGoalsModal } from '../lib/goals-modal.js';
import { track, Events } from '../lib/analytics.js';

export async function renderToday() {
  track(Events.TODAY_SCREEN_VIEWED);

  const app = document.getElementById('app');

  renderBottomNav('today');

  const { profile, user } = getState();
  const tz = profile?.timezone || 'UTC';
  const todayStr = todayString(tz);

  let viewDate = getState().viewDate || todayStr;

  app.innerHTML = `
    <div class="screen" id="today-screen">
      <div class="today-header">
        <div class="today-header__date-label">Дневник питания</div>
        <button class="btn btn--icon btn--ghost js-profile-btn" style="color:var(--text-secondary)">${_iconSettings()}</button>
      </div>
      <div class="date-nav" id="date-nav"></div>
      <div class="screen__body" style="gap:16px; padding-top:16px">
        <div id="summary-area" class="today-summary"></div>
        <div id="meals-area" class="today-meals"></div>
      </div>
    </div>
  `;

  app.querySelector('.js-profile-btn').addEventListener('click', () => navigate('profile'));

  function _renderDateNav() {
    const nav = document.getElementById('date-nav');
    if (!nav) return;

    const isToday = viewDate === todayStr;

    nav.innerHTML = `
      <button class="date-nav__arrow" id="date-prev" aria-label="Предыдущий день">
        ${_iconChevronLeft()}
      </button>
      <div class="date-nav__date">${_formatNavDate(viewDate)}</div>
      <button class="date-nav__arrow${isToday ? ' date-nav__arrow--disabled' : ''}" id="date-next" aria-label="Следующий день" ${isToday ? 'disabled' : ''}>
        ${_iconChevronRight()}
      </button>
      ${!isToday ? `<button class="date-nav__today-btn" id="date-today">Сегодня</button>` : ''}
    `;

    nav.querySelector('#date-prev').addEventListener('click', () => {
      viewDate = _addDays(viewDate, -1);
      setState({ viewDate });
      _renderDateNav();
      _reloadForDate();
    });

    nav.querySelector('#date-next')?.addEventListener('click', () => {
      viewDate = _addDays(viewDate, 1);
      setState({ viewDate });
      _renderDateNav();
      _reloadForDate();
    });

    nav.querySelector('#date-today')?.addEventListener('click', () => {
      viewDate = todayStr;
      setState({ viewDate });
      _renderDateNav();
      _reloadForDate();
    });
  }

  async function _reloadForDate() {
    const sa = document.getElementById('summary-area');
    const ma = document.getElementById('meals-area');
    if (sa) { sa.innerHTML = ''; sa.appendChild(skeletonSummaryCard()); }
    if (ma) { ma.innerHTML = ''; ma.appendChild(skeletonList(2)); }
    await _loadAndRender(user.id, viewDate, profile);
  }

  _renderDateNav();

  document.getElementById('summary-area').appendChild(skeletonSummaryCard());
  document.getElementById('meals-area').appendChild(skeletonList(2));

  await _loadAndRender(user.id, viewDate, profile);

  const unsub = subscribe(['meals'], () => {
    const { meals, profile } = getState();
    _renderSummary(meals, profile);
    _renderMealsList(meals, user.id, viewDate, profile);
  });

  // When user returns to the app after leaving — snap back to today
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    const newToday = todayString(tz);
    if (viewDate !== newToday) {
      viewDate = newToday;
      setState({ viewDate });
      _renderDateNav();
      _reloadForDate();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

async function _loadAndRender(userId, dateStr, profile) {
  try {
    const meals = await getMealsByDate(userId, dateStr);
    setState({ meals, currentDate: dateStr });
    _renderSummary(meals, profile);
    _renderMealsList(meals, userId, dateStr, profile);
  } catch {
    const sa = document.getElementById('summary-area');
    const ma = document.getElementById('meals-area');
    if (sa) sa.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${_iconWifi()}</div>
        <div class="empty-state__title">Нет соединения</div>
        <div class="empty-state__text">Проверьте интернет и попробуйте ещё раз</div>
        <button class="btn btn--secondary js-retry" style="margin-top:8px">Повторить</button>
      </div>
    `;
    if (ma) ma.innerHTML = '';
    document.getElementById('today-screen')?.querySelector('.js-retry')
      ?.addEventListener('click', () => {
        if (sa) { sa.innerHTML = ''; sa.appendChild(skeletonSummaryCard()); }
        if (ma) { ma.innerHTML = ''; ma.appendChild(skeletonList(2)); }
        _loadAndRender(userId, dateStr, profile);
      });
  }
}

function _renderSummary(meals, profile) {
  const area = document.getElementById('summary-area');
  if (!area) return;

  const totals = _calcTotals(meals);
  const goal = profile?.goal_kcal;
  const ratio = goal ? totals.kcal / goal : 0;

  let statusColor = 'white';
  let statusClass = 'ok';
  if (ratio > 1) { statusColor = 'white'; statusClass = 'over'; }
  else if (ratio > 0.8) { statusColor = '#faefd5'; statusClass = 'near'; }

  const diff = goal ? Math.round(totals.kcal - goal) : null;

  area.innerHTML = '';

  // ── Hero card ────────────────────────────────────────
  const heroCard = document.createElement('div');
  heroCard.className = 'hero-card';
  heroCard.style.cssText = 'animation: cardIn 0.35s ease forwards';
  heroCard.innerHTML = `
    <div class="hero-card__left">
      <div class="hero-card__kcal" style="color:${statusColor}">${Math.round(totals.kcal)}</div>
      <div class="hero-card__kcal-sub">
        <span class="hero-card__kcal-unit">ккал</span>
        ${goal ? `<span class="hero-card__kcal-goal">из ${goal}</span>` : '<span class="hero-card__kcal-goal">сегодня</span>'}
      </div>
      ${diff !== null ? `
        <div class="hero-card__status hero-card__status--${statusClass}">
          ${diff > 0 ? '+' : ''}${diff} ккал
        </div>
      ` : ''}
    </div>
    <div class="hero-card__right">${_heroDonut(90, totals.kcal, goal)}</div>
  `;
  area.appendChild(heroCard);

  // ── Macro pills ──────────────────────────────────────
  const macros = document.createElement('div');
  macros.className = 'macro-pills';
  macros.innerHTML = `
    ${_macroPill('Белки', Math.round(totals.protein), 'protein', '0.1s', profile?.goal_protein)}
    ${_macroPill('Жиры', Math.round(totals.fat), 'fat', '0.17s', profile?.goal_fat)}
    ${_macroPill('Углеводы', Math.round(totals.carb), 'carb', '0.24s', profile?.goal_carb)}
  `;
  area.appendChild(macros);

  // ── Set goals prompt ─────────────────────────────────
  if (!profile?.goal_kcal && !profile?.goal_protein && !profile?.goal_fat && !profile?.goal_carb) {
    const link = document.createElement('div');
    link.style.cssText = 'font-size:12px;color:var(--text-secondary);text-align:center;padding-top:4px';
    link.innerHTML = `<a style="color:var(--accent);font-weight:600;cursor:pointer" id="set-goals-link">Задать цели по КБЖУ →</a>`;
    area.appendChild(link);
    area.querySelector('#set-goals-link')?.addEventListener('click', () => openGoalsModal());
  }
}

function _macroPill(label, value, type, delay, goalValue) {
  return `
    <div class="macro-pill macro-pill--${type}" style="opacity:0;animation:cardIn 0.35s ease ${delay} forwards">
      <div class="macro-pill__value">${value}<span class="macro-pill__unit">г</span></div>
      <div class="macro-pill__label">${label}</div>
      ${goalValue ? `<div class="macro-pill__goal">цель ${goalValue}г</div>` : ''}
    </div>
  `;
}

function _heroDonut(size, current, goal) {
  const sw = 8;
  const r = (size / 2) - (sw / 2);
  const circ = 2 * Math.PI * r;

  if (!goal) {
    // No goal — decorative heart SVG
    return `
      <div style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center">
        <svg width="54" height="54" viewBox="0 0 24 24" fill="rgba(101,130,65,0.55)" stroke="none">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </div>`;
  }

  const ratio = current / goal;
  const pct = Math.min(ratio, 1);        // capped to 1 for ring visual
  const displayPct = Math.round(ratio * 100); // uncapped for text
  const offset = circ * (1 - pct);

  let strokeColor, glowColor, textColor;
  if (ratio > 1)        { strokeColor = 'white';   glowColor = 'rgba(255,255,255,0.4)'; textColor = 'white'; }
  else if (ratio > 0.8) { strokeColor = '#fadd68'; glowColor = 'rgba(250,221,104,0.5)'; textColor = '#faefd5'; }
  else                  { strokeColor = 'white';   glowColor = 'rgba(255,255,255,0.4)'; textColor = 'white'; }

  return `
    <div style="width:${size}px;height:${size}px;position:relative;display:inline-flex;align-items:center;justify-content:center">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);position:absolute;top:0;left:0">
        <circle fill="none" stroke="rgba(255,255,255,0.22)" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${sw}"/>
        <circle fill="none" stroke="${strokeColor}" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${sw}"
          stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
          stroke-linecap="round"
          style="filter:drop-shadow(0 0 4px ${glowColor});transition:stroke-dashoffset 0.7s cubic-bezier(0.34,1.56,0.64,1)"/>
      </svg>
      <div style="position:relative;text-align:center;line-height:1">
        <div style="font-size:${displayPct >= 100 ? '11px' : '13px'};font-weight:800;color:${textColor}">${displayPct}%</div>
      </div>
    </div>
  `;
}

function _renderMealsList(meals, userId, dateStr, profile) {
  const area = document.getElementById('meals-area');
  if (!area) return;

  area.innerHTML = '';

  // ── Habits promo banner ──────────────────────────────
  _renderHabitsBanner(area, userId);

  const header = document.createElement('div');
  header.className = 'today-meals__section-header';
  header.innerHTML = `<div class="today-meals__title">Приёмы пищи</div>`;
  area.appendChild(header);

  if (!meals.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '24px 16px';
    empty.innerHTML = `
      <div class="empty-state__title" style="margin-top:0">Пока ничего нет</div>
      <button class="btn btn--primary" style="margin-top:8px" id="empty-add-btn">Добавить еду</button>
    `;
    area.appendChild(empty);
    area.querySelector('#empty-add-btn')?.addEventListener('click', () => navigate('add-meal'));
    return;
  }

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  meals.forEach((meal, idx) => {
    const card = createMealCard(
      meal,
      deletedMeal => {
        const { meals } = getState();
        setState({ meals: meals.filter(m => m.id !== deletedMeal.id) });
      },
      updatedMeal => {
        const { meals } = getState();
        setState({ meals: meals.map(m => m.id === updatedMeal.id ? updatedMeal : m) });
      }
    );
    card.style.cssText = `opacity:0;animation:cardIn 0.3s ease ${(idx * 0.06).toFixed(2)}s forwards`;
    list.appendChild(card);
  });

  area.appendChild(list);
}

function _calcTotals(meals) {
  return meals.reduce((acc, m) => ({
    kcal:    acc.kcal    + (m.total_kcal    || 0),
    protein: acc.protein + (m.total_protein || 0),
    fat:     acc.fat     + (m.total_fat     || 0),
    carb:    acc.carb    + (m.total_carb    || 0),
  }), { kcal: 0, protein: 0, fat: 0, carb: 0 });
}

function _formatNavDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
}

function _addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ── Habits promo banner ───────────────────────────────

const HABITS_BANNER_ID = 'habits_promo_v1';


async function _dismissBanner(userId, bannerId, lsKey) {
  localStorage.setItem(lsKey, '1');
  try {
    const { supabase } = await import('../supabase.js');
    await supabase.from('banner_dismissals').upsert({ user_id: userId, banner_id: bannerId });
  } catch {}
}

async function _renderHabitsBanner(area, userId) {
  if (!userId) return;

  // Only show banner after user has added at least one meal
  if (localStorage.getItem(`has_meal_${userId}`) !== '1') return;

  // Key is user-specific so different accounts on the same device are independent
  const lsKey = `banner_dismissed_${HABITS_BANNER_ID}_${userId}`;

  if (localStorage.getItem(lsKey) === '1') {
    // Fast-path hit — but validate against DB in background.
    // If the DB row was deleted (e.g. by admin), clear localStorage so the
    // banner reappears on the next page load.
    _revalidateDismissal(userId, lsKey).catch(() => {});
    return;
  }

  // Guard against double-insert when _renderMealsList fires twice in quick succession
  if (area.querySelector('.habits-banner')) return;

  const banner = document.createElement('div');
  banner.className = 'habits-banner';
  banner.innerHTML = `
    <div class="habits-banner__body">
      <div class="habits-banner__title">Усиль результат от питания<br>с помощью привычек</div>
      <div class="habits-banner__text">используй простой трекер</div>
      <div class="habits-banner__actions">
        <button class="btn btn--sm habits-banner__try">Попробовать</button>
        <button class="btn btn--sm btn--ghost habits-banner__dismiss">Неактуально</button>
      </div>
    </div>
    <div class="habits-banner__img-wrap">
      <img src="/photo/run.jpg" class="habits-banner__img" alt="">
    </div>
  `;

  // Insert synchronously — before any await
  if (!area.isConnected) return;
  const header = area.querySelector('.today-meals__section-header');
  if (header) area.insertBefore(banner, header);
  else area.appendChild(banner);

  banner.querySelector('.habits-banner__try').addEventListener('click', () => {
    window.open('https://your-habits-calendar.vercel.app/?utm-source=reapp', '_blank', 'noopener,noreferrer');
  });

  banner.querySelector('.habits-banner__dismiss').addEventListener('click', async () => {
    banner.style.cssText = 'opacity:0;transform:translateY(-8px);transition:opacity 0.2s,transform 0.2s;pointer-events:none';
    setTimeout(() => banner.remove(), 220);
    await _dismissBanner(userId, HABITS_BANNER_ID, lsKey);
  });

  // Background Supabase check — if dismissed on another device, silently remove
  try {
    const { supabase } = await import('../supabase.js');
    const { data } = await supabase
      .from('banner_dismissals')
      .select('id')
      .eq('user_id', userId)
      .eq('banner_id', HABITS_BANNER_ID)
      .maybeSingle();
    if (data) {
      banner.remove();
      localStorage.setItem(lsKey, '1');
    }
  } catch {}
}

// If localStorage says dismissed but DB row is gone, clear localStorage
// so the banner appears again on next page load.
async function _revalidateDismissal(userId, lsKey) {
  const { supabase } = await import('../supabase.js');
  const { data } = await supabase
    .from('banner_dismissals')
    .select('id')
    .eq('user_id', userId)
    .eq('banner_id', HABITS_BANNER_ID)
    .maybeSingle();
  if (!data) localStorage.removeItem(lsKey);
}

// ── SVG Icons ─────────────────────────────────────────

function _iconChevronLeft() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}

function _iconChevronRight() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
}

function _iconWifi() {
  return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>`;
}

function _iconPlate() {
  return `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
}

function _iconSettings() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`;
}
