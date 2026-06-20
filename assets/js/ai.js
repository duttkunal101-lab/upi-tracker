/* =============================================================================
 * CardWise — AI client (frontend)
 * Talks to the /api/analyze-card serverless function, registers the returned
 * card into the optimizer, and caches AI cards in localStorage so repeat
 * lookups are instant and free.
 * ========================================================================== */
(function () {
  'use strict';

  const ENDPOINT = '/api/analyze-card';
  const AICACHE_KEY = 'cardwise.aicards.v1';
  const { registerCard } = window.CW_DATA;

  /* ---- restore previously analyzed cards (synchronously, before app init) -- */
  function loadCached() {
    try {
      const raw = localStorage.getItem(AICACHE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw);
      if (Array.isArray(list)) list.forEach((c) => registerCard(c));
    } catch (_) { /* ignore corrupt cache */ }
  }

  function cacheCard(card) {
    try {
      const raw = localStorage.getItem(AICACHE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? list.filter((c) => c.id !== card.id) : [];
      next.push(card);
      // keep the cache bounded
      localStorage.setItem(AICACHE_KEY, JSON.stringify(next.slice(-40)));
    } catch (_) { /* storage unavailable — non-fatal */ }
  }

  /**
   * Analyze any card by name via the backend.
   * @returns {Promise<{ok:true, card:object, cached:boolean} | {ok:false, error:string}>}
   */
  async function analyze(name) {
    const clientId = (window.CW_ACCESS && window.CW_ACCESS.getClientId()) || '';
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, clientId }),
      });
    } catch (_) {
      return { ok: false, error: 'Could not reach the AI service. Are you running the deployed app? (See README.)' };
    }

    // If the static site is served without the backend (e.g. GitHub Pages),
    // the request 404s to an HTML page rather than our JSON API.
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return {
        ok: false,
        error: 'AI lookup isn’t available on this host. Deploy the backend (Vercel/Netlify) or run `vercel dev` locally — see README.',
      };
    }

    let data;
    try { data = await res.json(); } catch (_) { data = {}; }

    // Surface the live early-access counter whenever the backend includes it.
    if (data.access && window.CW_ACCESS) window.CW_ACCESS.renderBanner(data.access);

    if (res.status === 403 && data.access && data.access.full) {
      return { ok: false, full: true, error: data.error || 'Early access is full.', access: data.access };
    }
    if (!res.ok || !data.card) {
      return { ok: false, error: data.error || `Lookup failed (${res.status}).`, access: data.access };
    }

    const stored = registerCard({ ...data.card, source: 'ai' });
    cacheCard(stored);
    return { ok: true, card: stored, cached: !!data.cached, access: data.access };
  }

  loadCached();
  window.CW_AI = { analyze };
})();
