/* =============================================================================
 * Axis Bank — Agentic Onboarding · /api/onboarding-agent
 * (Vercel serverless function, Node 18+ / ESM)
 * -----------------------------------------------------------------------------
 * The AI brain behind "Aria", the onboarding co-pilot. Three modes:
 *   • recommend — pick the best-fit Axis card for a declared spending profile
 *   • ask       — compliant concierge Q&A grounded in the onboarding context
 *   • nudge      — a short, contextual drop-off / reassurance nudge
 *
 * Requires env var ANTHROPIC_API_KEY. If it is missing, the function returns a
 * 200 "offline" payload so the frontend transparently falls back to its built-in
 * scripted brain (axis/js/agent.js) and the demo keeps working.
 *
 * Model defaults to claude-opus-4-8 (override with ONBOARDING_AGENT_MODEL).
 * The Anthropic SDK is imported dynamically so the pure helpers stay testable.
 * Mirrors the patterns in api/analyze-card.js. This endpoint is public once
 * deployed and each call spends tokens — set a spend limit on the key.
 * ========================================================================== */

const MODEL = process.env.ONBOARDING_AGENT_MODEL || 'claude-opus-4-8';

/* The Axis card universe the recommender may choose from. Keep the ids in sync
 * with axis/js/config.js → cards[].id so the frontend can resolve the choice. */
const CARD_CATALOG = [
  { id: 'ace', note: 'Everyday cashback — 5% bills (Google Pay), 4% Swiggy/Zomato/Ola, 2% all else. Fee ₹499.' },
  { id: 'flipkart', note: 'Online shopping — 5% Flipkart/Cleartrip, 4% Swiggy/Uber/PVR/cult.fit, 1.5% else. Fee ₹500.' },
  { id: 'atlas', note: 'Travel & miles — up to 5 EDGE Miles/₹100 on travel, lounges, transferable miles. Fee ₹5,000.' },
  { id: 'airtel', note: 'Bills & utilities — 25% Airtel, 10% utilities & Swiggy/Zomato/BigBasket. Fee ₹500.' },
  { id: 'myzone', note: 'Entertainment/lifestyle entry card — SonyLIV, movie BOGO, dining. Fee ₹500.' },
  { id: 'neo', note: 'Entry-level online card — Zomato/Blinkit/Myntra offers, low ₹250 fee.' },
  { id: 'insta-easy', note: 'Secured card against an Axis Fixed Deposit — no income proof, builds CIBIL. Lifetime free. Best for new-to-credit.' },
];
const CARD_IDS = CARD_CATALOG.map((c) => c.id);

/* -------------------------- best-effort rate guard ------------------------ */
const RATE = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;
function rateLimited(ip) {
  const now = Date.now();
  const e = RATE.get(ip);
  if (!e || now - e.windowStart > RATE_WINDOW_MS) { RATE.set(ip, { count: 1, windowStart: now }); return false; }
  e.count += 1;
  return e.count > RATE_LIMIT;
}

const PERSONA = `You are "Aria", the warm, trustworthy AI onboarding assistant for Axis Bank credit cards in India.

VOICE: friendly, clear and human — like a knowledgeable bank specialist who genuinely wants to help, never a sales brochure. Be concise.

COMPLIANCE (always): you give guidance, NOT financial advice. Never promise or guarantee approval, eligibility, rewards, returns or savings. Use measured words ("can", "typically", "subject to the bank's terms"). Be accurate about Indian banking — KYC is an RBI requirement; a credit-bureau check needs the customer's explicit consent; the bank must disclose fees up-front (Key Fact Statement) and obtain explicit consent before issuing a card; Aadhaar is masked and stored securely. Reassure on data privacy (DPDP Act). If something is outside onboarding, gently steer back. Keep answers to 2–4 short sentences unless asked for detail.`;

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch (_) { return null; }
}

function recommendPrompt(profile) {
  const tags = (profile && Array.isArray(profile.tags) ? profile.tags : []).join(', ') || 'not specified';
  const employment = (profile && profile.employment) || 'salaried';
  const list = CARD_CATALOG.map((c) => `- ${c.id}: ${c.note}`).join('\n');
  return `A new-to-bank customer wants an Axis credit card.
Their spending interests: ${tags}.
Employment: ${employment} (employment "ntc" means new-to-credit — recommend the secured "insta-easy" card).

Choose the single best-fit card for THEM from this set (use the exact id):
${list}

Respond with ONLY a JSON object, no prose, no markdown fences:
{"cardId":"<one id>","reason":"one warm sentence referencing how they spend, measured & compliant","alternates":["<id>","<id>"]}
"alternates" are up to 2 other good ids (exclude the chosen one).`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const mode = String(body.mode || '').toLowerCase();

  // No key → tell the client to use its built-in fallback brain (keeps demo alive).
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ offline: true, note: 'AI agent not configured — using built-in assistant.' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });

  let system = PERSONA;
  let userMsg;
  let wantJson = false;

  if (mode === 'recommend') {
    wantJson = true;
    userMsg = recommendPrompt(body.profile);
  } else if (mode === 'ask') {
    const q = String(body.question || '').slice(0, 500);
    if (!q) return res.status(400).json({ error: 'Missing question.' });
    const stage = body.context && body.context.stage ? ` The customer is on the "${body.context.stage}" step of onboarding.` : '';
    userMsg = `${q}${stage}\n\nAnswer as Aria — warm, concise, compliant. Respond ONLY with the answer, no preamble.`;
  } else if (mode === 'nudge') {
    const stage = (body.context && body.context.stage) || 'this step';
    userMsg = `Write ONE short, warm nudge (max ~20 words) to gently re-engage a customer who paused on the "${stage}" step of credit-card onboarding. Offer help or reassurance. Respond ONLY with the sentence.`;
  } else {
    return res.status(400).json({ error: 'Unknown mode. Use recommend | ask | nudge.' });
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(200).json({ offline: true, note: 'Could not generate a response — using built-in assistant.' });
    }

    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

    if (mode === 'recommend') {
      const parsed = extractJson(text) || {};
      const cardId = CARD_IDS.includes(parsed.cardId) ? parsed.cardId : null;
      if (!cardId) return res.status(200).json({ offline: true }); // let client fall back
      const alternates = (Array.isArray(parsed.alternates) ? parsed.alternates : [])
        .filter((id) => CARD_IDS.includes(id) && id !== cardId).slice(0, 2);
      return res.status(200).json({ cardId, reason: String(parsed.reason || '').slice(0, 280), alternates });
    }
    if (mode === 'nudge') return res.status(200).json({ text: text.replace(/^["']|["']$/g, '').slice(0, 160) });
    return res.status(200).json({ answer: text.slice(0, 900) });
  } catch (err) {
    const status = err && Number.isInteger(err.status) ? err.status : 500;
    const detail = String(err?.error?.error?.message || err?.message || err || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error('onboarding-agent error:', status, detail);
    // Fail soft so the frontend uses its built-in assistant rather than showing an error.
    return res.status(200).json({ offline: true, note: 'Assistant temporarily unavailable — using built-in help.' });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch (_) { return {}; } }

export { extractJson, recommendPrompt, CARD_IDS };
