import { getState } from '../state.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { navigate } from '../router.js';
import { getDailyTotals } from '../lib/db.js';
import { todayString, toLocalDateString } from '../lib/timezone.js';
import { skeletonList } from '../components/skeleton.js';
import { openGoalsModal } from '../lib/goals-modal.js';
import { track, Events } from '../lib/analytics.js';

const PERIODS = [
  { id: 'week',  label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
];

let _gradCounter = 0;

export async function renderStats() {
  track(Events.STATS_SCREEN_VIEWED);

  renderBottomNav('stats');

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="screen" id="stats-screen">
      <div class="screen__header">
        <h1 class="screen__title">Статистика</h1>
        <button class="btn btn--icon btn--ghost js-profile-btn" style="color:var(--text-secondary)">${_iconSettings()}</button>
      </div>
      <div class="screen__body">
        <!-- Period tabs -->
        <div class="stats-period-tabs" id="stats-tabs">
          ${PERIODS.map((p, i) => `
            <button class="stats-period-tab${i === 0 ? ' stats-period-tab--active' : ''}" data-period="${p.id}">
              ${p.label}
            </button>
          `).join('')}
        </div>

        <!-- Date range nav -->
        <div id="stats-date-nav" class="stats-date-nav"></div>

        <div id="stats-content" class="stats-content"></div>
      </div>
    </div>
  `;

  let currentPeriod = 'week';
  let periodOffset = 0; // 0 = current, -1 = previous, etc.

  app.querySelector('.js-profile-btn').addEventListener('click', () => navigate('profile'));

  app.querySelectorAll('.stats-period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPeriod = btn.dataset.period;
      periodOffset = 0;
      app.querySelectorAll('.stats-period-tab').forEach(b =>
        b.classList.toggle('stats-period-tab--active', b === btn)
      );
      _renderDateNav();
      _load();
    });
  });

  function _getPeriodDates() {
    const { profile } = getState();
    const tz = profile?.timezone || 'UTC';
    const today = todayString(tz);

    let fromDate, toDate, days;

    if (currentPeriod === 'week') {
      // Find start of the "current" week offset by periodOffset
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun
      const daysToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + daysToMon + periodOffset * 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      fromDate = toLocalDateString(monday, tz);
      toDate = toLocalDateString(sunday, tz);
      days = _daysBetween(fromDate, toDate);
    } else {
      // Month: offset months — build date strings directly to avoid timezone shifts
      const now = new Date();
      const anchor = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
      const ty = anchor.getFullYear();
      const tm = anchor.getMonth();
      const lastDayNum = new Date(ty, tm + 1, 0).getDate();
      fromDate = `${ty}-${String(tm + 1).padStart(2, '0')}-01`;
      toDate   = `${ty}-${String(tm + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      days = _daysBetween(fromDate, toDate);
    }

    return { fromDate, toDate, days, today };
  }

  function _periodLabel() {
    const { fromDate, toDate } = _getPeriodDates();
    if (currentPeriod === 'week') {
      return `${_fmtDate(fromDate)} — ${_fmtDate(toDate)}`;
    }
    return `${_fmtDate(fromDate)} — ${_fmtDate(toDate)}`;
  }

  function _isCurrentPeriod() {
    return periodOffset === 0;
  }

  function _renderDateNav() {
    const nav = document.getElementById('stats-date-nav');
    if (!nav) return;
    const { today } = _getPeriodDates();
    const showToday = !_isCurrentPeriod();

    nav.innerHTML = `
      <button class="date-nav__arrow" id="stats-prev">${_iconChevronLeft()}</button>
      <div class="date-nav__date" style="flex:1;text-align:center;font-size:var(--font-size-sm);font-weight:600">${_periodLabel()}</div>
      <button class="date-nav__arrow${_isCurrentPeriod() ? ' date-nav__arrow--disabled' : ''}" id="stats-next" ${_isCurrentPeriod() ? 'disabled' : ''}>${_iconChevronRight()}</button>
      ${showToday ? `<button class="date-nav__today-btn" id="stats-today">Сегодня</button>` : ''}
    `;

    nav.querySelector('#stats-prev').addEventListener('click', () => {
      periodOffset--;
      _renderDateNav();
      _load();
    });
    nav.querySelector('#stats-next')?.addEventListener('click', () => {
      if (!_isCurrentPeriod()) { periodOffset++; _renderDateNav(); _load(); }
    });
    nav.querySelector('#stats-today')?.addEventListener('click', () => {
      periodOffset = 0;
      _renderDateNav();
      _load();
    });
  }

  async function _load() {
    const content = document.getElementById('stats-content');
    if (!content) return;
    content.innerHTML = '';
    content.appendChild(skeletonList(3));

    const { user, profile } = getState();
    const { fromDate, toDate, days } = _getPeriodDates();

    try {
      const rows = await getDailyTotals(user.id, fromDate, toDate);
      content.innerHTML = '';
      _renderStats(content, rows, days, profile);
    } catch {
      content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">${_iconSignal()}</div>
          <div class="empty-state__title">Нет соединения</div>
          <div class="empty-state__text">Проверьте интернет и попробуйте ещё раз</div>
        </div>
      `;
    }
  }

  _renderDateNav();
  _load();
}

// ── Render stats content ──────────────────────────────

function _renderStats(container, rows, days, profile) {
  const byDate = {};
  rows.forEach(r => { byDate[r.eaten_date] = r; });

  const daysWithData = days.filter(d => byDate[d]);

  if (!daysWithData.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${_iconChart()}</div>
        <div class="empty-state__title">Пока нет данных</div>
        <div class="empty-state__text">Начните вести дневник питания — статистика появится здесь</div>
      </div>
    `;
    if (!_hasAnyGoal(profile)) _renderGoalsBanner(container, profile);
    return;
  }

  const avgKcal    = daysWithData.reduce((s, d) => s + (byDate[d]?.total_kcal    || 0), 0) / daysWithData.length;
  const avgProtein = daysWithData.reduce((s, d) => s + (byDate[d]?.total_protein || 0), 0) / daysWithData.length;
  const avgFat     = daysWithData.reduce((s, d) => s + (byDate[d]?.total_fat     || 0), 0) / daysWithData.length;
  const avgCarb    = daysWithData.reduce((s, d) => s + (byDate[d]?.total_carb    || 0), 0) / daysWithData.length;

  // ── 1. Тепловая карта (наверх) ───────────────────────
  const heatCard = document.createElement('div');
  heatCard.className = 'stats-card';
  heatCard.style.cssText = 'animation:cardIn 0.3s ease 0s both';
  heatCard.innerHTML = _buildHeatmap(days, byDate, profile);
  container.appendChild(heatCard);

  // ── Пояснительный текст ───────────────────────────────
  const noteEl = document.createElement('p');
  noteEl.style.cssText = 'font-size:11px;color:var(--text-secondary);margin:0 2px;line-height:1.4';
  noteEl.textContent = 'Средние значения КБЖУ рассчитаны только по дням с внесёнными данными:';
  container.appendChild(noteEl);

  // ── 2. Калории среднее + Отклонение от цели ──────────
  const kcalRow = document.createElement('div');
  kcalRow.className = profile?.goal_kcal ? 'stats-grid' : '';
  kcalRow.style.cssText = 'animation:cardIn 0.3s ease 0.06s both';

  let devHtml = '';
  if (profile?.goal_kcal) {
    const diff = avgKcal - profile.goal_kcal;
    const sign = diff >= 0 ? '+' : '';
    const color = Math.abs(diff) < 100 ? 'var(--accent)' : diff > 0 ? 'var(--warning)' : 'var(--text)';

    devHtml = `
      <div class="stats-card">
        <div class="stats-card__label">Отклонение от цели</div>
        <div class="stats-card__value" style="color:${color}">${sign}${Math.round(diff)}</div>
        <div class="stats-card__sub">ккал/день</div>
      </div>
    `;
  }

  kcalRow.innerHTML = `
    <div class="stats-card">
      <div class="stats-card__label">Калории</div>
      <div class="stats-card__value">${Math.round(avgKcal)}</div>
      <div class="stats-card__sub">ккал/день</div>
    </div>
    ${devHtml}
  `;
  container.appendChild(kcalRow);

  // ── 4. БЖУ блоки ─────────────────────────────────────
  const macroGrid = document.createElement('div');
  macroGrid.className = 'stats-grid stats-grid--3';
  macroGrid.style.cssText = 'animation:cardIn 0.3s ease 0.12s both';
  macroGrid.innerHTML = `
    <div class="stats-card stats-card--protein">
      <div class="stats-card__value stats-card__value--protein">${Math.round(avgProtein)}<span style="font-size:12px;font-weight:600;color:#3a5290;margin-left:1px">г</span></div>
      <div class="stats-card__label">Белки</div>
      ${profile?.goal_protein ? `<div class="stats-card__goal">цель ${profile.goal_protein}г</div>` : ''}
    </div>
    <div class="stats-card stats-card--fat">
      <div class="stats-card__value stats-card__value--fat">${Math.round(avgFat)}<span style="font-size:12px;font-weight:600;color:#2d4810;margin-left:1px">г</span></div>
      <div class="stats-card__label">Жиры</div>
      ${profile?.goal_fat ? `<div class="stats-card__goal">цель ${profile.goal_fat}г</div>` : ''}
    </div>
    <div class="stats-card stats-card--carb">
      <div class="stats-card__value stats-card__value--carb">${Math.round(avgCarb)}<span style="font-size:12px;font-weight:600;color:#5a3e00;margin-left:1px">г</span></div>
      <div class="stats-card__label">Углеводы</div>
      ${profile?.goal_carb ? `<div class="stats-card__goal">цель ${profile.goal_carb}г</div>` : ''}
    </div>
  `;
  container.appendChild(macroGrid);

  // ── 5. Графики по дням ────────────────────────────────
  const chartsDelay = ['0.18s', '0.24s', '0.30s', '0.36s'];
  const chartDefs = [
    { label: 'Калории по дням',  key: 'total_kcal',    goal: profile?.goal_kcal,    color: '#9eb26e', goalColor: '#b0a48e' },
    { label: 'Белки по дням',    key: 'total_protein', goal: profile?.goal_protein, color: '#8fa0d8', goalColor: '#6a7fbe' },
    { label: 'Жиры по дням',     key: 'total_fat',     goal: profile?.goal_fat,     color: '#7a9447', goalColor: '#5a7030' },
    { label: 'Углеводы по дням', key: 'total_carb',    goal: profile?.goal_carb,    color: '#e8c840', goalColor: '#c8a820' },
  ];

  chartDefs.forEach((def, i) => {
    const chartCard = document.createElement('div');
    chartCard.className = 'stats-card';
    chartCard.style.cssText = `animation:cardIn 0.3s ease ${chartsDelay[i]} both`;
    const chartHtml = _buildLineChart(days, byDate, def.key, def.goal, def.color, def.goalColor, i);
    chartCard.innerHTML = `
      <div class="stats-card__label" style="margin-bottom:12px">${def.label}</div>
      ${chartHtml}
    `;
    container.appendChild(chartCard);
  });

  // ── 6. Баннер "Цели не заданы" ───────────────────────
  if (!_hasAnyGoal(profile)) {
    _renderGoalsBanner(container, profile);
  }
}

// ── Goals helpers ─────────────────────────────────────

function _hasAnyGoal(profile) {
  return !!(profile?.goal_kcal || profile?.goal_protein || profile?.goal_fat || profile?.goal_carb);
}

// ── Goals banner ──────────────────────────────────────

function _renderGoalsBanner(container, profile) {
  const banner = document.createElement('div');
  banner.className = 'stats-goals-banner';
  banner.innerHTML = `
    <div class="stats-goals-banner__text">
      <strong>Цели не заданы</strong>
      Задайте цели по КБЖУ, чтобы отслеживать прогресс
    </div>
    <button class="btn btn--primary btn--sm js-set-goals">Задать цели</button>
  `;
  container.appendChild(banner);
  banner.querySelector('.js-set-goals').addEventListener('click', () => openGoalsModal());
}

// ── Line chart ────────────────────────────────────────

function _buildLineChart(days, byDate, key, goal, lineColor, goalColor, chartIdx) {
  const W = 300;
  const H = 122;
  const PL = 4, PR = 4, PT = 22, PB = 20;  // PB includes axis-label area
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;               // = 80

  const values = days.map(d => byDate[d]?.[key] || 0);
  const maxVal = Math.max(...values, goal || 0, 1);

  const n = days.length;
  const points = days.map((d, i) => ({
    x: PL + (n > 1 ? i / (n - 1) : 0.5) * innerW,
    y: PT + (1 - values[i] / maxVal) * innerH,
    val: values[i],
  }));

  let linePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = ((prev.x + curr.x) / 2).toFixed(1);
    linePath += ` C ${cpx} ${prev.y.toFixed(1)}, ${cpx} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }

  const bottom = PT + innerH;
  const areaPath = `${linePath} L ${points[points.length-1].x.toFixed(1)} ${bottom.toFixed(1)} L ${PL} ${bottom.toFixed(1)} Z`;

  const goalY = goal
    ? (PT + (1 - goal / maxVal) * innerH).toFixed(1)
    : null;

  const gradId = `cg${++_gradCounter}`;

  // ── Axis labels — rendered inside SVG at exact dot x positions ──
  const labelStep = n > 14 ? Math.ceil(n / 7) : 1;
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const labelY = bottom + 13;  // text baseline below chart

  const axisLabelsHtml = days.map((d, i) => {
    if (i % labelStep !== 0 && i !== n - 1) return '';
    const date = new Date(d + 'T12:00:00');
    const lbl = n <= 7 ? dayNames[date.getDay()] : date.getDate().toString();
    const isFirst = i === 0;
    const isLast  = i === n - 1;
    // First: align left edge to chart start; last: align right edge to chart end; rest: center on dot
    let tx = points[i].x, anchor = 'middle';
    if (isFirst && !isLast) { tx = 0; anchor = 'start'; }
    else if (isLast && !isFirst) { tx = W; anchor = 'end'; }
    return `<text x="${tx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}" font-size="9" fill="var(--text-placeholder)" font-family="inherit">${lbl}</text>`;
  }).join('');

  // ── Pill labels for max and min non-zero points (always, regardless of goal) ──
  let pillsHtml = '';
  const nonZero = points.filter(p => p.val > 0);
  if (nonZero.length > 0) {
    const maxPt = nonZero.reduce((a, b) => b.val > a.val ? b : a);
    const minPt = nonZero.reduce((a, b) => b.val < a.val ? b : a);

    pillsHtml += _pillLabel(Math.round(maxPt.val), maxPt.x, maxPt.y, lineColor, 'white', W);

    if (minPt !== maxPt && minPt.val !== maxPt.val) {
      pillsHtml += _pillLabel(Math.round(minPt.val), minPt.x, minPt.y, 'rgba(130,130,130,0.85)', 'white', W);
    }
  }

  return `
    <div class="line-chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.25"/>
            <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>

        <path d="${areaPath}" fill="url(#${gradId})"/>
        <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${goalY !== null ? `
          <line x1="${PL}" y1="${goalY}" x2="${W - PR}" y2="${goalY}"
            stroke="${goalColor}" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.7"/>
          <text x="${PL + 4}" y="${(parseFloat(goalY) - 3).toFixed(1)}"
            font-size="8" fill="${goalColor}" font-weight="600">${goal}</text>
        ` : ''}
        ${points.map(p => p.val > 0 ? `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"
            fill="#fefcf5" stroke="${lineColor}" stroke-width="2"/>
        ` : '').join('')}
        ${axisLabelsHtml}
        ${pillsHtml}
      </svg>
    </div>
  `;
}

// ── Pill badge helper ─────────────────────────────────

function _pillLabel(val, cx, cy, bgColor, textColor, W) {
  const text = val.toString();
  const pillW = Math.max(text.length * 6.5 + 14, 26);
  const pillH = 15;
  const rx = pillH / 2;

  // Clamp center x so pill stays within SVG bounds
  const clampedCx = Math.max(pillW / 2 + 2, Math.min(W - pillW / 2 - 2, cx));
  const rectX = clampedCx - pillW / 2;
  const rectY = cy - pillH - 5; // 5px gap above the dot

  return `
    <rect x="${rectX.toFixed(1)}" y="${rectY.toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH}" rx="${rx}" fill="${bgColor}"/>
    <text x="${clampedCx.toFixed(1)}" y="${(rectY + pillH - 4).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="${textColor}" font-family="inherit">${text}</text>
  `;
}

// ── Heatmap ───────────────────────────────────────────

function _buildHeatmap(days, byDate, profile) {
  const cells = days.map(d => {
    const row = byDate[d];
    if (!row) return { d, type: 'empty' };
    if (profile?.goal_kcal && row.total_kcal > profile.goal_kcal) return { d, type: 'surplus' };
    return { d, type: 'deficit' };
  });

  const colorMap = { empty: '#e8e0d0', surplus: '#e4a0a0', deficit: '#9db663' };
  const labelMap = { empty: 'Нет записи', surplus: 'Профицит калорий', deficit: 'Дефицит / в норме' };

  // For month view, pad start so day 1 aligns to the correct weekday column (Mon=0)
  let padStart = 0;
  if (days.length > 7) {
    const firstDate = new Date(days[0] + 'T12:00:00');
    padStart = (firstDate.getDay() + 6) % 7;
  }

  const emptyCells = Array(padStart).fill(0).map(() =>
    `<div class="heatmap__cell" style="background:transparent"></div>`
  ).join('');

  const cellsHtml = emptyCells + cells.map(({ d, type }) => {
    const date = new Date(d + 'T12:00:00');
    const day = date.getDate();
    return `
      <div class="heatmap__cell" style="background:${colorMap[type]}" title="${_fmtDate(d)}: ${labelMap[type]}">
        <span class="heatmap__day">${day}</span>
      </div>
    `;
  }).join('');

  const legendHtml = Object.entries(labelMap).map(([type, label]) => `
    <div class="heatmap__legend-item">
      <span class="heatmap__legend-dot" style="background:${colorMap[type]}"></span>
      <span>${label}</span>
    </div>
  `).join('');

  return `
    <div class="stats-card__label" style="margin-bottom:10px">По дням</div>
    <div class="heatmap">${cellsHtml}</div>
    <div class="heatmap__legend">${legendHtml}</div>
  `;
}

// ── Utils ─────────────────────────────────────────────

function _daysBetween(fromStr, toStr) {
  const days = [];
  const from = new Date(fromStr + 'T12:00:00');
  const to   = new Date(toStr   + 'T12:00:00');
  const cur = new Date(from);
  while (cur <= to) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function _fmtDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
}

// ── Icons ─────────────────────────────────────────────

function _iconSettings() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`;
}

function _iconChart() {
  return `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  </svg>`;
}

function _iconSignal() {
  return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
    <circle cx="12" cy="20" r="1" fill="currentColor"/>
  </svg>`;
}

function _iconChevronLeft() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
}

function _iconChevronRight() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
}
