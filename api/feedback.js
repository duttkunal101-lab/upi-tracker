/* =============================================================================
 * CardWise — /api/feedback  (Vercel serverless function, ESM)
 * -----------------------------------------------------------------------------
 * Receives gamified feedback from the results screen: a 1–5 "how relevant was
 * your strategy" rating, quick "what's working" tags, and free-text notes on
 * what to improve and which feature to build next. Stored (best-effort) in the
 * shared Upstash store so you can read demand and ideas; if no datastore is
 * configured it's logged to the function output instead. Never blocks the user.
 * ========================================================================== */

import { kvConfigured, recordFeedback } from './_lib/access-store.js';

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  // Vercel parses JSON bodies; guard anyway.
  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});

  const rating = Number(body.rating) || 0;
  const likes = Array.isArray(body.likes) ? body.likes : [];
  const hasText = ['working', 'improve', 'feature'].some((k) => String(body[k] || '').trim().length > 0);
  if (rating <= 0 && !hasText && likes.length === 0) {
    return res.status(400).json({ error: 'Add a rating or a quick note so we know what to improve 🙏' });
  }
  if (rating && (rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }

  try {
    const stored = await recordFeedback({
      rating,
      likes,
      working: body.working,
      improve: body.improve,
      feature: body.feature,
      clientId: body.clientId,
    });
    if (!kvConfigured()) {
      // No datastore — at least surface it in the function logs.
      console.log('FEEDBACK:', JSON.stringify({ rating, likes, working: body.working, improve: body.improve, feature: body.feature }).slice(0, 1200));
    }
    return res.status(200).json({ ok: true, stored });
  } catch (e) {
    // Feedback must never feel broken — accept it regardless.
    console.error('feedback error (non-fatal):', e?.message || e);
    return res.status(200).json({ ok: true, stored: false });
  }
}
