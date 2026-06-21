/* =============================================================================
 * CardWise — /api/session  (POST)
 * -----------------------------------------------------------------------------
 * Stores an anonymous snapshot of a completed session — the cards and merchants
 * used and the strategy produced — so the operator can understand demand. No
 * personal data; only what the user selected plus an anonymous browser id.
 * Disclosed in the in-app Terms. Best-effort: never blocks the user, and is a
 * no-op (logged) when no datastore is configured.
 * ========================================================================== */
import { kvConfigured, recordSession } from './_lib/access-store.js';

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  try {
    const stored = await recordSession({
      cards: body.cards,
      merchants: body.merchants,
      strategy: body.strategy,
      annual: body.annual,
      clientId: body.clientId,
    });
    if (!kvConfigured()) {
      console.log('SESSION:', JSON.stringify({ cards: body.cards, merchants: body.merchants, annual: body.annual }).slice(0, 1500));
    }
    return res.status(200).json({ ok: true, stored });
  } catch (e) {
    console.error('session record error (non-fatal):', e?.message || e);
    return res.status(200).json({ ok: true, stored: false });
  }
}
