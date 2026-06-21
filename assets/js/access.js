/* =============================================================================
 * CardWise — Early-access client
 * Renders the live "first 100 people" counter + time tracker, supplies a stable
 * per-browser client id for the spot gate, and exposes helpers the app uses to
 * block the AI lookup once all spots are claimed.
 * ========================================================================== */
(function () {
  'use strict';

  const CLIENT_KEY = 'cardwise.clientId.v1';
  const STATS_URL = '/api/early-access';
  let lastStats = null;

  function getClientId() {
    let id = null;
    try { id = localStorage.getItem(CLIENT_KEY); } catch (_) { /* ignore */ }
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(CLIENT_KEY, id); } catch (_) { /* ignore */ }
    }
    return id;
  }

  function fmtDuration(ms) {
    if (ms == null) return '';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  }
  function fmtAgo(atMs) {
    if (atMs == null) return '';
    return fmtDuration(Date.now() - atMs) + ' ago';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderBanner(stats) {
    if (stats) lastStats = stats;
    const el = document.getElementById('earlyAccessBanner');
    if (!el) return;

    if (!stats || !stats.configured) { el.hidden = true; el.innerHTML = ''; return; }

    const pct = stats.cap ? Math.min(100, Math.round((stats.taken / stats.cap) * 100)) : 0;
    let main, sub;
    if (stats.full) {
      el.classList.add('ea-banner--full');
      main = `🎟️ Early access closed — all ${stats.cap} spots claimed`;
      sub = stats.reachedCapMs != null ? `Reached the cap in ${fmtDuration(stats.reachedCapMs)}.` : 'Thanks to everyone who tested it!';
    } else {
      el.classList.remove('ea-banner--full');
      main = `🎟️ Early access — <strong>${stats.taken}</strong> / ${stats.cap} spots claimed`;
      sub = stats.launchAtMs != null
        ? `Opened ${fmtAgo(stats.launchAtMs)} · ${stats.remaining} spots left`
        : `Be one of the first ${stats.cap} to try CardWise!`;
    }
    el.innerHTML = `
      <div class="ea-banner__row">
        <span class="ea-banner__main">${main}</span>
        <span class="ea-banner__sub">${esc(sub)}</span>
      </div>
      <div class="ea-bar"><div class="ea-bar__fill" style="width:${pct}%"></div></div>`;
    el.hidden = false;
  }

  async function refresh() {
    try {
      const url = `${STATS_URL}?clientId=${encodeURIComponent(getClientId())}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) { renderBanner({ configured: false }); return null; }
      const stats = await res.json();
      renderBanner(stats);
      return stats;
    } catch (_) {
      renderBanner({ configured: false });
      return null;
    }
  }

  /* Claim an early-access spot when the visitor starts using the platform.
   * Deduped per browser; fails open so the platform never breaks. */
  async function claim() {
    try {
      const res = await fetch(STATS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ clientId: getClientId() }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return { configured: false, granted: true };
      const access = await res.json();
      renderBanner(access);
      return access;
    } catch (_) {
      return { configured: false, granted: true };
    }
  }

  /* Retain an anonymous snapshot of a finished session (cards + merchants +
   * strategy). Best-effort, fire-and-forget. */
  function recordSession(data) {
    try {
      fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, clientId: getClientId() }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) { /* best-effort */ }
  }

  function isFull() {
    return !!(lastStats && lastStats.configured && lastStats.full);
  }
  // True only when the round is full AND this browser hasn't already claimed a spot.
  function isBlocked() {
    return !!(lastStats && lastStats.configured && lastStats.full && !lastStats.mine);
  }

  window.CW_ACCESS = {
    getClientId, refresh, claim, recordSession, renderBanner,
    isFull, isBlocked, fmtDuration, fmtAgo, get stats() { return lastStats; },
  };
})();
