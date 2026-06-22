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

  /* AI cards are session-only now — nothing is restored across visits, and we
   * don't persist them, so every visit starts fresh with just the built-ins. */
  function loadCached() {
    try { localStorage.removeItem(AICACHE_KEY); } catch (_) { /* ignore */ }
  }
  function cacheCard(_card) { /* no-op: fresh start each visit */ }

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

    // Non-JSON means either a static host with no backend (404 → HTML page), or
    // a platform error page (a function timeout/crash returns HTML, not our JSON).
    // Keep the friendly hint for genuine 404s; otherwise surface the status + a
    // snippet so failures are diagnosable instead of opaque.
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (res.status === 404) {
        return {
          ok: false,
          error: 'AI lookup isn’t available on this host. Deploy the backend (Vercel/Netlify) or run `vercel dev` locally — see README.',
        };
      }
      let detail = '';
      try { detail = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 160); } catch (_) {}
      return { ok: false, error: `Backend error ${res.status}${detail ? ` · ${detail}` : ''}` };
    }

    let data;
    try { data = await res.json(); } catch (_) { data = {}; }

    // Surface the live early-access counter whenever the backend includes it.
    if (data.access && window.CW_ACCESS) window.CW_ACCESS.renderBanner(data.access);

    // Friendly guidance for messy / non-Indian / unclear input — not a failure.
    if (data.notice) {
      return { ok: false, notice: data.notice, access: data.access };
    }

    // Spelling was corrected — hand back the candidate for the user to confirm; don't add it yet.
    if (data.suggestion && data.card) {
      return { ok: false, suggestion: data.suggestion, card: data.card, access: data.access };
    }

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

  /* Register + cache a card the user has confirmed (after a "did you mean" prompt). */
  function confirmCard(card) {
    const stored = registerCard({ ...card, source: 'ai' });
    cacheCard(stored);
    return stored;
  }

  /**
   * Ask the agent for the best NEW card on the current Indian market, given the
   * user's merchants + monthly spends + annual-fee budget.
   * @returns {Promise<{ok:true, recommendations:Array, note?:string} | {ok:false, error:string}>}
   */
  async function recommend({ merchants, budget, ownedCardNames }) {
    let res;
    try {
      res = await fetch('/api/recommend-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchants, budget, ownedCardNames }),
      });
    } catch (_) {
      return { ok: false, error: 'Could not reach the agent. Are you running the deployed app? (See README.)' };
    }

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (res.status === 404) {
        return { ok: false, error: 'The recommendation agent isn’t available on this host. Deploy the backend (Vercel) — see README.' };
      }
      let detail = '';
      try { detail = (await res.text()).replace(/\s+/g, ' ').trim().slice(0, 160); } catch (_) {}
      return { ok: false, error: `Backend error ${res.status}${detail ? ` · ${detail}` : ''}` };
    }

    let data;
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok) return { ok: false, error: data.error || `Recommendation failed (${res.status}).` };
    return { ok: true, recommendations: Array.isArray(data.recommendations) ? data.recommendations : [], note: data.note || '' };
  }

  loadCached();
  window.CW_AI = { analyze, confirmCard, recommend };
})();
