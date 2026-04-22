/**
 * Global application state.
 * Lightweight reactive store — components subscribe and re-render on change.
 */

const STORAGE_KEY = 'foodcal_v1';

const _listeners = new Map();
let _state = {
  user: null,           // Supabase user object
  profile: null,        // DB profile row
  currentDate: null,    // YYYY-MM-DD string (today in user's tz)
  viewDate: null,       // YYYY-MM-DD string (date being viewed in today screen)
  meals: [],            // meals for currentDate
  loading: false,       // global loading flag
};

/** Read current state (immutable snapshot) */
export function getState() {
  return { ..._state };
}

/** Update state and notify subscribers */
export function setState(patch) {
  _state = { ..._state, ...patch };
  _notify(Object.keys(patch));
}

/** Subscribe to state changes for specific keys */
export function subscribe(keys, callback) {
  const id = Symbol();
  _listeners.set(id, { keys: Array.isArray(keys) ? keys : [keys], callback });
  return () => _listeners.delete(id); // returns unsubscribe fn
}

function _notify(changedKeys) {
  _listeners.forEach(({ keys, callback }) => {
    if (keys.some(k => changedKeys.includes(k))) {
      callback(getState());
    }
  });
}

// ── Draft management (in-memory only) ────────────────
// Intentionally NOT persisted to sessionStorage/localStorage:
// photo data can be large and sensitive, in-memory is sufficient
// for the single-screen add-meal flow.

let _draft = null;

export function saveDraft(data) {
  _draft = data;
}

export function loadDraft() {
  return _draft;
}

export function clearDraft() {
  _draft = null;
}
