let _container;

function _getContainer() {
  if (!_container) {
    _container = document.createElement('div');
    _container.id = 'toast-container';
    document.body.appendChild(_container);
  }
  return _container;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'default'|'success'|'error'|'warning'} type
 * @param {number} duration ms
 */
export function showToast(message, type = 'default', duration = 3000) {
  const container = _getContainer();
  const toast = document.createElement('div');
  toast.className = `toast${type !== 'default' ? ` toast--${type}` : ''}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast--hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

export const toast = {
  success: (msg, dur) => showToast(msg, 'success', dur),
  error:   (msg, dur) => showToast(msg, 'error', dur),
  warning: (msg, dur) => showToast(msg, 'warning', dur),
  info:    (msg, dur) => showToast(msg, 'default', dur),
};
