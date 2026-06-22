/* =============================================================================
 * CardWise — /api/recommend-card  (Vercel serverless function, Node 18+ / ESM)
 * -----------------------------------------------------------------------------
 * The agentic "find me the best NEW card" engine. Given the user's merchants and
 * monthly spends plus an annual-fee budget, it asks Claude (expert on the CURRENT
 * Indian credit-card market) to recommend the 1–3 real, currently-issued cards
 * that would maximise rewards for THOSE merchants within the budget — considering
 * each card's value proposition (CVP). Knowledge-based (no web tools) so it stays
 * within the serverless time budget, mirroring /api/analyze-card.
 *
 * Requires env var ANTHROPIC_API_KEY.
 * ========================================================================== */

/* ----------------------- tiny best-effort rate guard ---------------------- */
const RATE = new Map();             // ip -> { count, windowStart }
const RATE_LIMIT = 12;              // requests
const RATE_WINDOW_MS = 60 * 1000;   // per minute

function rateLimited(ip) {
  const now = Date.now();
  const entry = RATE.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    RATE.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

const SYSTEM_PROMPT = `You are CardWise's recommendation engine — an expert on the CURRENT Indian credit-card market.

The user tells you (a) the merchants/categories they spend on with rough MONTHLY amounts in rupees,
(b) an annual-fee budget as an operator + value, and (c) cards they ALREADY own (exclude these).

Recommend the 1–3 REAL, currently-issued Indian credit cards that would earn this specific person
the MOST rewards across THEIR merchants, honouring the budget. Reason from each card's real value
proposition (CVP) and reward structure — not generic popularity.

BUDGET OPERATOR (apply strictly to the card's annual fee, in rupees):
- "lte"    -> recommend cards whose annual fee is AT OR BELOW the value (great value within budget).
- "around" -> recommend cards whose annual fee is NEAR the value (roughly within ±40%) — the user is
              targeting that fee tier, so pick the best card AT that tier, not a much cheaper one.
- "gt"     -> recommend cards whose annual fee is ABOVE the value (premium cards worth the higher fee).

RULES:
- Only REAL, currently-issued Indian cards. NEVER invent a card or guess a name. If you cannot
  confidently fill a field, omit it. If nothing real fits the budget + merchants, return an empty
  "recommendations" array and a short friendly "note".
- Exclude any card the user already owns.
- Rank by best fit for the user's actual spends (highest realistic reward value first).
- "fitReason" must reference the user's OWN merchants/spends (e.g. "your ₹8,000/mo on Amazon & Swiggy").
- Estimate value honestly in "estValue" (e.g. "≈ ₹6,000/yr rewards at your spends, before the fee").
  Use measured words; never promise or guarantee returns, approval or eligibility.

TONE & COMPLIANCE: warm, friendly, human — like a knowledgeable friend, not a brochure. This is
guidance, NOT financial advice. Avoid hype/superlatives ("best ever", "guaranteed"); use "can",
"typically", "subject to the bank's terms"; remind people terms change and to confirm with the issuer.

FRESHNESS: base everything on each card's publicly-known current terms; set "asOf" to the month your
knowledge reflects.

Return a SINGLE JSON object and NOTHING else — no markdown fences, no prose — in this exact shape:

{
  "recommendations": [
    {
      "name": "Official card name",
      "issuer": "Issuing bank/brand",
      "network": "Payment network(s), e.g. 'Visa' or 'RuPay / Visa'",
      "issuerDomain": "official issuer domain only, e.g. hdfcbank.com",
      "annualFee": <number, rupees, 0 if lifetime free>,
      "feeNote": "Short fee note incl. any waiver",
      "cvp": "One-sentence value proposition (max ~140 chars)",
      "fitReason": "Why THIS card suits the user's specific merchants/spends (1 sentence)",
      "bestFor": ["3 short tags"],
      "estValue": "Honest, measured estimate of yearly reward value at the user's spends",
      "asOf": "YYYY-MM",
      "sources": ["official issuer URL(s) you're confident about — else []"]
    }
  ],
  "note": "short friendly note ONLY if recommendations is empty"
}

Output ONLY the JSON object.`;

/* Pull the JSON object out of the model's final text, defensively. */
function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) { return null; }
}

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const arr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];

function normalizeRec(raw) {
  if (!raw || typeof raw !== 'object' || !raw.name) return null;
  const domain = str(raw.issuerDomain, 80).trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const issuerDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : '';
  return {
    name: str(raw.name, 80),
    issuer: str(raw.issuer, 60) || 'Indian bank',
    network: str(raw.network, 60),
    issuerDomain,
    annualFee: Number.isFinite(Number(raw.annualFee)) ? Number(raw.annualFee) : 0,
    feeNote: str(raw.feeNote, 120),
    cvp: str(raw.cvp, 240),
    fitReason: str(raw.fitReason, 240),
    bestFor: arr(raw.bestFor).map((t) => str(t, 40)).slice(0, 3),
    estValue: str(raw.estValue, 140),
    asOf: str(raw.asOf, 7),
    sources: arr(raw.sources).filter((u) => /^https?:\/\//i.test(u)).slice(0, 3),
  };
}

/* Build the user-facing prompt from the structured request. */
function buildUserMessage({ merchants, budget, ownedCardNames }) {
  const opWord = budget.op === 'gt' ? 'ABOVE' : budget.op === 'around' ? 'AROUND' : 'AT OR BELOW';
  const lines = merchants
    .map((m) => `- ${m.name}${m.category ? ` (${m.category})` : ''}: about ₹${Number(m.monthlySpend) || 0}/month`)
    .join('\n');
  const owned = ownedCardNames.length ? ownedCardNames.join(', ') : 'none specified';
  return `My monthly spends:
${lines}

Annual-fee budget: ${opWord} ₹${Number(budget.value) || 0} (operator "${budget.op}").
Cards I already own (exclude these): ${owned}.

Recommend the 1–3 best real Indian credit cards for me, honouring the budget operator. Respond with the JSON object only.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. See README.' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const merchants = (Array.isArray(body.merchants) ? body.merchants : [])
    .map((m) => ({ name: str(m && m.name, 60), category: str(m && m.category, 40), monthlySpend: Math.max(0, Number(m && m.monthlySpend) || 0) }))
    .filter((m) => m.name && m.monthlySpend > 0)
    .slice(0, 30);
  if (merchants.length === 0) {
    return res.status(400).json({ error: 'Add at least one merchant with a monthly spend first.' });
  }
  const op = ['lte', 'around', 'gt'].includes(body.budget && body.budget.op) ? body.budget.op : 'lte';
  const value = Math.max(0, Number(body.budget && body.budget.value) || 0);
  const ownedCardNames = (Array.isArray(body.ownedCardNames) ? body.ownedCardNames : [])
    .map((n) => str(n, 80)).filter(Boolean).slice(0, 30);

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage({ merchants, budget: { op, value }, ownedCardNames }) }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Could not generate a recommendation right now. Please try again.' });
    }

    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const parsed = extractJson(text);
    if (!parsed) {
      return res.status(200).json({ recommendations: [], note: 'The agent couldn’t shortlist a card just now — try adjusting your budget and run it again.' });
    }

    const recommendations = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
      .map(normalizeRec).filter(Boolean).slice(0, 3);

    if (recommendations.length === 0) {
      return res.status(200).json({ recommendations: [], note: str(parsed.note, 200) || 'No card cleanly beats your wallet at this budget — try widening it and run the agent again.' });
    }
    return res.status(200).json({ recommendations });
  } catch (err) {
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    const detail = String(err?.error?.error?.message || err?.message || err || '')
      .replace(/\s+/g, ' ').trim().slice(0, 220);
    const msg = status === 429
      ? 'The AI service is rate-limited right now — please try again in a moment.'
      : `Recommendation failed (${status})${detail ? ': ' + detail : ''}. Please try again.`;
    console.error('recommend-card error:', status, detail);
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: msg });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

/* Exported for unit testing. */
export { extractJson, normalizeRec, buildUserMessage };
