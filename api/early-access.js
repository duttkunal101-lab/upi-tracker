/* =============================================================================
 * CardWise — /api/early-access
 *   GET  ?clientId=…  → live stats for the counter/time-tracker, plus `mine`
 *                        (whether THIS browser has already claimed a spot).
 *   POST { clientId }  → claim an early-access spot ("using the platform").
 *                        Deduped per browser; enforces the 100-person cap.
 * Stats shape: { configured, cap, taken, remaining, full, mine, launchAtMs,
 *   latestAtMs, elapsedMs, reachedCapMs, timeline:[{spot, atMs}], granted,
 *   already }
 * ========================================================================== */
import { getStats, claimSpot } from './_lib/access-store.js';

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

export default async function handler(req, res) {
  // Claim a spot when the visitor starts using the platform.
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const clientId = (body.clientId || '').toString().slice(0, 100);
    if (!clientId) return res.status(400).json({ error: 'Missing client id.' });
    try {
      const access = await claimSpot(clientId);
      return res.status(200).json(access);
    } catch (err) {
      console.error('early-access claim error:', err?.message || err);
      // Fail open so a transient store error never blocks the platform.
      return res.status(200).json({ configured: false, cap: 100, granted: true, mine: true, error: true });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
  }
  try {
    const clientId = (req.query && req.query.clientId ? String(req.query.clientId) : '').slice(0, 100);
    const stats = await getStats(clientId);
    // tiny CDN cache when no client-specific lookup, so the badge stays snappy
    if (!clientId) res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5');
    return res.status(200).json(stats);
  } catch (err) {
    console.error('early-access stats error:', err?.message || err);
    // Fail open: never let the counter break the page.
    return res.status(200).json({ configured: false, cap: 100, mine: true, error: true });
  }
}
