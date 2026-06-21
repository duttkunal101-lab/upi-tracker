/* =============================================================================
 * CardWise — /api/analyze-card  (Vercel serverless function, Node 18+ / ESM)
 * -----------------------------------------------------------------------------
 * Given any Indian credit-card name, uses Claude with live web search
 * to research the card's CURRENT value proposition, reward program, fees and
 * caps, and returns a structured profile that drops straight into the optimizer
 * (rewards expressed as effective % return, mapped to the app's taxonomy).
 *
 * Requires env var ANTHROPIC_API_KEY. Set a spend limit on that key — this
 * endpoint is public once deployed and each call costs tokens.
 *
 * The Anthropic SDK is imported dynamically inside the handler so the pure
 * helpers below can be unit-tested without the dependency installed.
 * ========================================================================== */

import { kvConfigured, claimSpot, recordSearch } from './_lib/access-store.js';

/* Fetch the card's photo from Google's official Programmable Search (Custom
 * Search) image API. Best-effort: returns '' unless GOOGLE_API_KEY +
 * GOOGLE_CSE_ID are configured and a usable image is found. */
async function googleCardImage(name) {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx || !name) return '';
  const q = encodeURIComponent(`${name} credit card`);
  const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&searchType=image&num=5&safe=active&imgSize=large&q=${q}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return '';
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const withExt = items.find((it) => typeof it.link === 'string'
      && /^https:\/\//i.test(it.link) && /\.(png|jpe?g|webp)(\?|$)/i.test(it.link));
    if (withExt) return withExt.link;
    const anyHttps = items.find((it) => typeof it.link === 'string' && /^https:\/\//i.test(it.link));
    return anyHttps ? anyHttps.link : '';
  } catch (_) {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/* The optimizer's fixed taxonomy. The model must map rewards onto these ids. */
const MERCHANT_IDS = [
  'amazon', 'flipkart', 'myntra', 'nykaa', 'ajio', 'tatacliq', 'tataneu',
  'swiggy', 'zomato', 'bigbasket', 'blinkit', 'zepto', 'dmart',
  'flights', 'hotels', 'makemytrip', 'irctc', 'uber', 'ola', 'dining',
  'bookmyshow', 'ott', 'fuel', 'utilities', 'mobile', 'cultfit', 'pharmacy',
  'international',
];
const CATEGORY_IDS = [
  'online-shopping', 'food-delivery', 'groceries', 'travel', 'cabs', 'dining',
  'entertainment', 'fuel', 'bills', 'wellness', 'international',
];

/* ----------------------- tiny best-effort guards -------------------------- */
/* These reset on cold starts (serverless), but still blunt casual abuse.
 * For production, add a real rate limiter / KV store and a WAF (Cloudflare). */
const CACHE = new Map();            // normalizedName -> { card, at }
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;  // 12h
const RATE = new Map();             // ip -> { count, windowStart }
const RATE_LIMIT = 15;              // requests
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

const SYSTEM_PROMPT = `You are CardWise's research engine — an expert on Indian credit cards.

Given a credit card name, use the web_search tool to find the LATEST, currently-published
reward program, customer value proposition (CVP), annual fee, caps and exclusions for that
specific card from reliable sources (the issuing bank's site, reputable card-comparison sites).
Prefer the most recent information; reward programs change often.

GROUNDING (non-negotiable): Base every part of the profile STRICTLY on the card's publicly
available CVP and reward terms that you actually find via web_search on authoritative public
sources — the issuer's official website first, then reputable public card-information sites.
Do NOT rely on memory, do NOT assume, and do NOT include undocumented or "rumoured" perks.
Every reward rate you output must be supported by a public source you found. Put the real
source URLs you used in "sources" (at least one). If you cannot find public information for
this exact card, return {"error":"..."} — never guess.

TONE & COMPLIANCE: write "cvp", "tips" and "notes" in a warm, friendly, human voice — like a
knowledgeable friend helping someone, not a sales brochure. Be encouraging and conversational
so the person enjoys exploring. But stay COMPLIANT: this is guidance, not financial advice.
Never promise or guarantee rewards, returns, savings, approval or eligibility; use measured
words ("can", "typically", "usually", "subject to the bank's terms"); avoid hype and absolute
superlatives ("best card ever", "guaranteed"); and add a gentle "do confirm current terms"
nudge where it helps. Keep each tip to one friendly sentence.

Then return your answer as a SINGLE JSON object and NOTHING else — no markdown fences, no prose
before or after. The JSON must match this exact shape:

{
  "id": "kebab-case-unique-id",
  "name": "Exact official card name",
  "issuer": "Issuing bank/brand",
  "network": "Every payment network this card is issued on; if it's offered on more than one, list them all separated by ' / ' (e.g. 'Visa / Mastercard' or 'RuPay / Visa')",
  "issuerDomain": "the issuer's official website domain, e.g. hdfcbank.com",
  "colors": ["#0a3d91", "#13294e"],
  "annualFee": <number, rupees, 0 if lifetime free>,
  "feeNote": "Short fee note incl. waiver, e.g. '₹500 (waived above ₹2L/yr spend)'",
  "rewardUnit": "Cashback | Reward Points | NeuCoins | EDGE Miles | Membership Rewards | ...",
  "cvp": "One-sentence value proposition (max ~140 chars)",
  "bestFor": ["3 short tags, e.g. 'Amazon 5%'", "...", "..."],
  "rewards": {
    "merchant": { "<merchantId>": <effectiveReturnPercent>, ... },
    "category": { "<categoryId>": <effectiveReturnPercent>, ... },
    "base": <effectiveReturnPercent for everything else>
  },
  "caps": "Short note on monthly caps / exclusions",
  "notes": ["0-3 short extra notes worth surfacing"],
  "tips": ["3-5 specific, actionable tips to use & manage THIS card optimally"],
  "sources": ["url", "url"],
  "asOf": "YYYY-MM (month your information reflects)"
}

CRITICAL RULES:
- All reward rates are the EFFECTIVE % RETURN. Convert reward points / miles / NeuCoins to
  their realistic rupee value first (e.g. 4 RP per ₹150 where 1 RP ≈ ₹0.25 -> about 0.67%).
- "merchant" keys MUST be from this set ONLY: ${MERCHANT_IDS.join(', ')}.
- "category" keys MUST be from this set ONLY: ${CATEGORY_IDS.join(', ')}.
- Resolution priority the app uses: merchant override > category bonus > base. Put a rate in
  "merchant" only when the card singles out that specific merchant; otherwise use "category".
- Omit merchants/categories the card doesn't reward specially — don't pad with the base rate.
- If you genuinely cannot identify the card, return {"error":"Could not identify this card. Please check the name."} instead.
- "issuerDomain": the issuing bank/brand's official website domain only (e.g. "hdfcbank.com",
  "sbicard.com", "axisbank.com") — no path, no https. We use it to show the correct bank logo.
- "colors": give 1–2 hex colours that match the card's ACTUAL physical colour scheme so we can
  render an on-brand card visual (e.g. a black metal card -> ["#111111","#2b2b2b"]; a deep-blue
  card -> ["#0a3d91","#13294e"]; a teal card -> ["#0f766e","#0b4f4a"]). Best-effort and optional
  — omit if you're unsure. Do NOT return any image URLs.
- Output ONLY the JSON object.`;

/* Pull the JSON object out of the model's final text, defensively. */
function extractJson(text) {
  if (!text) return null;
  // Prefer a fenced ```json block if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

/* Keep only taxonomy-valid keys; coerce rates to sane numbers. */
function sanitizeRates(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 100) out[k] = Math.round(n * 100) / 100;
    }
  }
  return out;
}

function normalizeCard(raw, fallbackName) {
  const slug = (raw.id || raw.name || fallbackName || 'card')
    .toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'ai-card';

  const merchant = sanitizeRates(raw?.rewards?.merchant);
  const category = sanitizeRates(raw?.rewards?.category);
  // keep only valid taxonomy ids
  for (const k of Object.keys(merchant)) if (!MERCHANT_IDS.includes(k)) delete merchant[k];
  for (const k of Object.keys(category)) if (!CATEGORY_IDS.includes(k)) delete category[k];

  const base = Number(raw?.rewards?.base);
  const arr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : [];

  // 1–2 brand colours for an on-brand card visual.
  const colors = (Array.isArray(raw.colors) ? raw.colors : [])
    .map((c) => String(c).trim())
    .map((c) => (c.startsWith('#') ? c : '#' + c))
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
    .slice(0, 2);

  // Issuer domain (for the bank logo).
  const domain = String(raw.issuerDomain || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const issuerDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : '';

  return {
    id: `ai-${slug}`,
    name: String(raw.name || fallbackName).slice(0, 80),
    issuer: String(raw.issuer || 'Unknown issuer').slice(0, 60),
    network: String(raw.network || '').slice(0, 60),
    issuerDomain,
    image: '',
    colors,
    annualFee: Number.isFinite(Number(raw.annualFee)) ? Number(raw.annualFee) : 0,
    feeNote: String(raw.feeNote || '').slice(0, 120) || '—',
    rewardUnit: String(raw.rewardUnit || 'Reward').slice(0, 40),
    cvp: String(raw.cvp || '').slice(0, 240),
    bestFor: arr(raw.bestFor).slice(0, 3),
    rewards: { merchant, category, base: Number.isFinite(base) ? base : 0.5 },
    caps: String(raw.caps || '').slice(0, 240),
    notes: arr(raw.notes).slice(0, 3),
    tips: arr(raw.tips).slice(0, 5),
    sources: arr(raw.sources).filter((u) => /^https?:\/\//i.test(u)).slice(0, 4),
    asOf: String(raw.asOf || '').slice(0, 7),
    source: 'ai',
  };
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

  // Vercel parses JSON bodies; guard anyway.
  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const name = (body.name || '').toString().trim();
  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: 'Please enter a valid card name (2–80 characters).' });
  }

  // ---- Early-access gate ("first 100 people"): claim a spot before serving --
  // A spot is consumed the moment someone uses the AI feature (cached or not),
  // deduped per browser via clientId. Disabled (open) when KV isn't configured.
  const clientId = (body.clientId || '').toString().slice(0, 100);
  let access = { configured: false };
  if (kvConfigured()) {
    if (!clientId) {
      return res.status(400).json({ error: 'Missing client id.' });
    }
    try {
      access = await claimSpot(clientId);
      if (access.full && !access.already && !access.granted) {
        return res.status(403).json({
          error: `Early access is full — all ${access.cap || 100} spots have been claimed.`,
          access,
        });
      }
    } catch (e) {
      // Fail open so a transient datastore error never blocks the feature.
      console.error('KV claim failed (fail-open):', e?.message || e);
      access = { configured: true, error: true };
    }
  }

  // Retain which card was searched (anonymous; disclosed in the platform Terms).
  await recordSearch(name, clientId);

  const key = name.toLowerCase().replace(/\s+/g, ' ');
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.status(200).json({ card: cached.card, cached: true, access });
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 1 }],
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Research and return the JSON profile for this Indian credit card: "${name}".`,
      }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Could not analyze that input. Please enter a real card name.' });
    }

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const parsed = extractJson(text);
    if (!parsed) {
      return res.status(502).json({ error: 'The analysis came back in an unexpected format. Please try again.' });
    }
    if (parsed.error) {
      return res.status(404).json({ error: String(parsed.error).slice(0, 200) });
    }

    const card = normalizeCard(parsed, name);
    // Require at least *some* signal to be useful
    const hasRewards =
      Object.keys(card.rewards.merchant).length ||
      Object.keys(card.rewards.category).length ||
      card.rewards.base > 0;
    if (!hasRewards) {
      return res.status(404).json({ error: 'Could not find reliable reward details for that card.' });
    }
    // Enforce public grounding: a card with no public source is not recommended.
    if (!card.sources.length) {
      return res.status(404).json({
        error: 'Could not find publicly available CVP details for that card. CardWise only recommends based on public information.',
      });
    }

    // Best-effort: attach the card's photo from Google image search (if configured).
    card.image = await googleCardImage(card.name);

    CACHE.set(key, { card, at: Date.now() });
    return res.status(200).json({ card, cached: false, access });
  } catch (err) {
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    const msg = status === 429
      ? 'The AI service is rate-limited right now. Please try again shortly.'
      : 'Something went wrong while analyzing this card. Please try again.';
    // Log server-side for debugging; don't leak details to the client.
    console.error('analyze-card error:', err?.message || err);
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: msg });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (_) { return {}; }
}

/* Exported for unit testing (harmless for the Vercel handler, which only uses
 * the default export). */
export { extractJson, sanitizeRates, normalizeCard, MERCHANT_IDS, CATEGORY_IDS };
