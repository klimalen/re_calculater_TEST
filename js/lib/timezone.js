/**
 * Timezone utilities. All date calculations use user's local timezone.
 * User timezone is stored in profile and passed here.
 */

/** Detect browser timezone */
export function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Format Date to YYYY-MM-DD in given timezone */
export function toLocalDateString(date, timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Get today's date string in user's timezone */
export function todayString(timezone) {
  return toLocalDateString(new Date(), timezone);
}

/** Get an array of date strings for the past N days (inclusive of today) */
export function lastNDays(n, timezone) {
  const dates = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(toLocalDateString(d, timezone));
  }
  return dates;
}

/** Get start of current week (Monday) as date string */
export function startOfWeek(timezone) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return toLocalDateString(monday, timezone);
}

/** Get start of current month as date string */
export function startOfMonth(timezone) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return toLocalDateString(first, timezone);
}

/** Format display date: "Сегодня", "Вчера", or "12 апреля" */
export function formatDisplayDate(dateStr, timezone) {
  const today = todayString(timezone);
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateString(d, timezone);
  })();

  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';

  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Format time from timestamptz to HH:MM in user's timezone */
export function formatTime(isoString, timezone) {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return '';
  }
}
