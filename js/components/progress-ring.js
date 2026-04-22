/**
 * SVG circular progress ring.
 */

export function createProgressRing({ size = 80, strokeWidth = 6, current, goal, label } = {}) {
  const el = document.createElement('div');
  el.className = 'progress-ring';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  const r = (size / 2) - (strokeWidth / 2);
  const circ = 2 * Math.PI * r;
  const pct = goal ? Math.min(current / goal, 1) : 0;
  const isOver = goal && current > goal;
  const offset = circ * (1 - pct);

  el.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="progress-ring__track" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${strokeWidth}"/>
      <circle class="progress-ring__fill${isOver ? ' progress-ring__fill--over' : ''}"
        cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${strokeWidth}"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
    </svg>
    <div class="progress-ring__center">
      ${label || ''}
    </div>
  `;

  return el;
}
