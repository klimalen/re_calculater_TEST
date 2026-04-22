const CACHE_NAME = 're-food-calculator-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/variables.css',
  '/css/base.css',
  '/css/components.css',
  '/css/screens.css',
];

// ── Install ───────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  // Take control immediately (enables skipWaiting update flow)
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API/Supabase requests
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase') || url.hostname.includes('googleapis')) return;

  // Static assets: cache-first
  if (_isStaticAsset(url)) {
    event.respondWith(_cacheFirst(request));
    return;
  }

  // App shell: network-first with cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(_networkFirst(request));
    return;
  }
});

async function _cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function _networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || _offlineFallback();
  }
}

function _offlineFallback() {
  return new Response(
    `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Re Food Calculator — Офлайн</title>
    <style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;text-align:center}
    .box{padding:32px;max-width:320px}.icon{font-size:64px;margin-bottom:16px}.title{font-size:20px;font-weight:700;margin-bottom:8px}
    .text{color:#64748b;font-size:14px;line-height:1.5}</style></head>
    <body><div class="box"><div class="icon">📡</div>
    <div class="title">Нет соединения</div>
    <div class="text">Проверьте интернет и обновите страницу</div></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function _isStaticAsset(url) {
  // JS and CSS use network-first so users always get fresh code after deploys.
  // Only images and fonts use cache-first (they rarely change).
  return url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|woff2?)$/);
}

// ── Update notification to clients ───────────────────

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
