/**
 * Hash-based client router.
 * Routes: #welcome, #login, #register, #reset-password,
 *         #today, #add-meal, #ai-result, #stats, #profile,
 *         #privacy, #terms, #contact
 */

import { getState } from './state.js';

const _handlers = new Map();
let _currentRoute = null;
let _currentCleanup = null;
let _routerInit = false;
let _skipNextHashChange = false;

export function initRouter() {
  if (!_routerInit) {
    _routerInit = true;
    window.addEventListener('hashchange', () => {
      if (_skipNextHashChange) {
        _skipNextHashChange = false;
        return;
      }
      _handleRoute();
    });
  }
  _handleRoute();
}

export function navigate(route, params = {}) {
  _currentParams = params;
  if (window.location.hash === `#${route}`) {
    _handleRoute();
  } else {
    // Set flag so hashchange doesn't double-render
    _skipNextHashChange = true;
    window.location.hash = route;
    _handleRoute(); // render directly — don't rely on hashchange being set up
  }
}

export function navigateBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    navigate('today');
  }
}

/** Register a route handler. Handler receives params and returns optional cleanup fn. */
export function onRoute(route, handler) {
  _handlers.set(route, handler);
}

let _currentParams = {};

export function getRouteParams() {
  return { ..._currentParams };
}

function _handleRoute() {
  const hash = window.location.hash.slice(1) || 'welcome';

  // Check password reset link
  if (hash.includes('type=recovery') || hash.startsWith('reset-password')) {
    _render('reset-password', {});
    return;
  }

  const [route, queryStr] = hash.split('?');
  const params = _parseQuery(queryStr);

  if (_currentRoute === route && !params.force) {
    // Allow same-route re-render if forced
  }

  // Run cleanup of previous screen
  if (_currentCleanup) {
    try { _currentCleanup(); } catch {}
    _currentCleanup = null;
  }

  _currentRoute = route;
  _render(route, { ..._currentParams, ...params });
}

function _render(route, params) {
  const handler = _handlers.get(route);
  if (!handler) {
    console.warn(`No handler for route: ${route}`);
    return;
  }
  const cleanup = handler(params);
  if (typeof cleanup === 'function') {
    _currentCleanup = cleanup;
  }
}

function _parseQuery(str) {
  if (!str) return {};
  return Object.fromEntries(new URLSearchParams(str));
}

export function currentRoute() {
  return _currentRoute;
}
