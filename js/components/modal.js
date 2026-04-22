/**
 * Modal / bottom sheet component.
 *
 * Usage:
 *   const modal = createModal({ title: '...', body: el, footer: el });
 *   modal.open();
 *   modal.close();
 */

export function createModal({ title, body, footer, center = false, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = `modal-overlay${center ? ' modal-overlay--center' : ''}`;

  const modal = document.createElement('div');
  modal.className = `modal${center ? ' modal--center' : ''}`;

  if (!center) {
    const handle = document.createElement('div');
    handle.className = 'modal__handle';
    modal.appendChild(handle);
  }

  if (title) {
    const header = document.createElement('div');
    header.className = 'modal__header';
    const titleEl = document.createElement('h2');
    titleEl.className = 'modal__title';
    titleEl.textContent = title;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn--icon btn--ghost';
    closeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    closeBtn.addEventListener('click', close);
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    modal.appendChild(header);
  }

  if (body) {
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'modal__body';
    bodyWrap.appendChild(typeof body === 'string' ? _text(body) : body);
    modal.appendChild(bodyWrap);
  }

  if (footer) {
    const footerWrap = document.createElement('div');
    footerWrap.className = 'modal__footer';
    footerWrap.appendChild(typeof footer === 'string' ? _text(footer) : footer);
    modal.appendChild(footerWrap);
  }

  overlay.appendChild(modal);

  // Close on overlay click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });

  function open() {
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.remove();
    document.body.style.overflow = '';
    onClose?.();
  }

  function updateBody(el) {
    const bodyWrap = modal.querySelector('.modal__body');
    if (bodyWrap) {
      bodyWrap.innerHTML = '';
      bodyWrap.appendChild(el);
    }
  }

  return { open, close, updateBody, overlay, modal };
}

/** Simple confirm dialog */
export function confirmDialog({ title, text, confirmLabel = 'Подтвердить', danger = false }) {
  return new Promise(resolve => {
    const body = document.createElement('p');
    body.style.cssText = 'color: var(--text-secondary); line-height: 1.5; font-size: var(--font-size-sm)';
    body.textContent = text;

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex; gap: 12px; width: 100%';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn--secondary btn--full';
    cancelBtn.textContent = 'Отмена';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `btn btn--full ${danger ? 'btn--danger' : 'btn--primary'}`;
    confirmBtn.textContent = confirmLabel;

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    const modal = createModal({ title, body, footer, center: true });

    cancelBtn.addEventListener('click', () => { modal.close(); resolve(false); });
    confirmBtn.addEventListener('click', () => { modal.close(); resolve(true); });
    modal.open();
  });
}

function _text(str) {
  const p = document.createElement('p');
  p.textContent = str;
  return p;
}
