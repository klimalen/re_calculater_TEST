/**
 * Analytics module.
 * Sends events to Yandex Metrika (if configured) and stores them in Supabase.
 * All events are fire-and-forget — never block the UI.
 */

const YM_ID = 108482593;

/** Track a product event */
export function track(eventName, properties = {}) {
  // Yandex Metrika
  if (YM_ID && typeof window.ym === 'function') {
    try {
      window.ym(YM_ID, 'reachGoal', eventName, properties);
    } catch {}
  }

  // Supabase logging (async, non-blocking)
  _logToSupabase(eventName, properties).catch(() => {});
}

async function _logToSupabase(eventName, properties) {
  // Import lazily to avoid circular deps
  const { supabase } = await import('../supabase.js');
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('analytics_events').insert({
    user_id: user?.id ?? null,
    event_name: eventName,
    properties,
  });
}

// ── Named events ──────────────────────────────────────

export const Events = {
  // Auth
  AUTH_REGISTERED:        'auth_registered',
  AUTH_LOGIN:             'auth_login',

  // Screen views
  TODAY_SCREEN_VIEWED:    'today_screen_viewed',
  STATS_SCREEN_VIEWED:    'stats_screen_viewed',
  PROFILE_SCREEN_VIEWED:  'profile_screen_viewed',
  ADD_MEAL_SCREEN_VIEWED: 'add_meal_screen_viewed',

  // Meal flow
  MEAL_ADD_STARTED:       'meal_add_started',
  AI_REQUEST_SENT:        'ai_request_sent',
  AI_RESULT_RECEIVED:     'ai_result_received',
  AI_RESULT_EDITED:       'ai_result_edited',
  AI_RESULT_RESENT:       'ai_result_resent',
  AI_RECOGNITION_FAILED:  'ai_recognition_failed',
  MEAL_SAVED:             'meal_saved',
  MEAL_DELETED:           'meal_deleted',

  // Goals
  GOAL_SET:               'goal_set',

  // Limits
  AI_LIMIT_REACHED:       'ai_limit_reached',
};
