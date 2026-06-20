/* =============================================================================
 * CardWise — /api/early-access  (GET)
 * Returns live early-access stats for the on-page counter & time tracker:
 *   { configured, cap, taken, remaining, full, launchAtMs, latestAtMs,
 *     elapsedMs, reachedCapMs, timeline:[{spot, atMs}] }
 * Spots are *claimed* in /api/analyze-card (when the AI feature is actually
 * used); this endpoint only reads the current state.
 * ========================================================================== */
import { getStats } from './_lib/access-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }
  try {
    const stats = await getStats();
    // small CDN cache so the badge stays snappy without hammering the store
    res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5');
    return res.status(200).json(stats);
  } catch (err) {
    console.error('early-access stats error:', err?.message || err);
    // Fail open: never let the counter break the page.
    return res.status(200).json({ configured: false, cap: 100, error: true });
  }
}
