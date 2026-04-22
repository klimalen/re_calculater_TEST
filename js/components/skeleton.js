/** Creates skeleton loading placeholders */

export function skeletonMealCard() {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.padding = '16px';
  el.innerHTML = `
    <div style="display:flex; gap:12px; align-items:center">
      <div class="skeleton skeleton--circle" style="width:36px;height:36px;flex-shrink:0"></div>
      <div style="flex:1; display:flex; flex-direction:column; gap:8px">
        <div class="skeleton skeleton--text" style="width:60%"></div>
        <div class="skeleton skeleton--text" style="width:40%"></div>
      </div>
      <div class="skeleton skeleton--text" style="width:40px;height:20px"></div>
    </div>
  `;
  return el;
}

export function skeletonSummaryCard() {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.padding = '20px';
  el.innerHTML = `
    <div style="display:flex; gap:20px; align-items:center">
      <div class="skeleton skeleton--circle" style="width:80px;height:80px;flex-shrink:0"></div>
      <div style="flex:1; display:flex; flex-direction:column; gap:10px">
        <div class="skeleton skeleton--title" style="width:80px"></div>
        <div class="skeleton skeleton--text" style="width:120px"></div>
        <div style="display:flex; gap:16px">
          <div class="skeleton skeleton--text" style="width:40px"></div>
          <div class="skeleton skeleton--text" style="width:40px"></div>
          <div class="skeleton skeleton--text" style="width:40px"></div>
        </div>
      </div>
    </div>
  `;
  return el;
}

export function skeletonList(count = 3) {
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '12px';
  for (let i = 0; i < count; i++) {
    el.appendChild(skeletonMealCard());
  }
  return el;
}

export function skeletonText(widthPercent = 70) {
  const el = document.createElement('div');
  el.className = 'skeleton skeleton--text';
  el.style.width = `${widthPercent}%`;
  return el;
}
