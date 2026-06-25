/* =============================================================================
 * Axis Bank — Agentic Onboarding · AI CO-PILOT CLIENT ("Aria")
 * -----------------------------------------------------------------------------
 * Talks to the /api/onboarding-agent serverless function for the genuinely
 * AI-suited parts of the journey:
 *   • recommend — best-fit Axis card for the declared spending profile
 *   • ask       — compliant concierge Q&A grounded in the onboarding context
 *   • nudge     — a contextual drop-off / reassurance nudge
 *
 * If the backend is absent (static host) or has no API key, every call falls
 * back to a capable, fully-offline scripted brain built from AX_CONFIG, so the
 * experience is never broken. Mirrors CardWise's assets/js/ai.js pattern.
 * ========================================================================== */
(function () {
  'use strict';

  const ENDPOINT = '/api/onboarding-agent';
  const C = window.AX_CONFIG;

  /* ----------------------------------------------------- backend transport */
  async function call(payload) {
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      return { ok: false, offline: true };
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return { ok: false, offline: true };
    let data;
    try { data = await res.json(); } catch (_) { return { ok: false, offline: true }; }
    if (!res.ok) return { ok: false, error: data.error || `Agent error ${res.status}` };
    return { ok: true, ...data };
  }

  /* ============================ RECOMMEND ================================== */
  async function recommend(profile) {
    const r = await call({ mode: 'recommend', profile });
    if (r.ok && r.cardId && C.cardById[r.cardId]) {
      return {
        card: C.cardById[r.cardId],
        reason: r.reason || localReason(C.cardById[r.cardId], profile),
        alternates: (r.alternates || []).map((id) => C.cardById[id]).filter(Boolean),
        source: 'ai',
      };
    }
    return localRecommend(profile); // graceful fallback
  }

  function localRecommend(profile) {
    const tags = (profile && profile.tags) || [];
    const employment = profile && profile.employment;

    // New-to-credit → secured card path.
    if (employment === 'ntc') {
      const secured = C.cardById['insta-easy'];
      return {
        card: secured,
        reason: 'Since you’re new to credit, I’d start you on a secured card against an Axis Fixed Deposit — no income proof, and it builds your CIBIL score from day one.',
        alternates: [C.cardById['neo'], C.cardById['ace']].filter(Boolean),
        source: 'local',
      };
    }

    const scored = C.cards
      .filter((c) => !c.secured)
      .map((c) => {
        let score = 0;
        tags.forEach((t) => { if (c.idealIf.includes(t)) score += 2; });
        if (c.idealIf.includes('everyday')) score += 0.5; // broad coverage tie-break
        // a card whose PRIMARY specialty matches an interest beats a generalist on ties
        if (c.idealIf[0] && tags.includes(c.idealIf[0])) score += 0.4;
        // travel card only really wins if travel is selected
        if (c.id === 'atlas' && !tags.includes('travel')) score -= 1.5;
        return { c, score };
      })
      .sort((a, b) => b.score - a.score || a.c.annualFee - b.c.annualFee);

    const best = (scored[0] && scored[0].score > 0) ? scored[0].c : C.cardById['ace'];
    const alternates = scored.filter((s) => s.c.id !== best.id).slice(0, 2).map((s) => s.c);
    return { card: best, reason: localReason(best, profile), alternates, source: 'local' };
  }

  function localReason(card, profile) {
    const tags = (profile && profile.tags) || [];
    const labels = tags
      .map((t) => (C.profileTags.find((p) => p.id === t) || {}).label)
      .filter(Boolean);
    const lead = labels.length
      ? `You told me you spend on ${listWords(labels.map((l) => l.toLowerCase()))}, so `
      : 'Based on a typical everyday wallet, ';
    return `${lead}the ${card.name} fits you best — ${card.tagline} ${card.bestFor[0]} stands out for how you spend.`;
  }

  /* ============================== ASK ===================================== */
  async function ask(question, context) {
    const r = await call({ mode: 'ask', question, context });
    if (r.ok && r.answer) return { answer: r.answer, source: 'ai' };
    return { answer: localAnswer(question, context), source: 'local' };
  }

  /* A compact, compliant knowledge base for the offline concierge. */
  const KB = [
    { k: ['aadhaar', 'aadhar', 'privacy', 'data', 'safe', 'secure', 'security'],
      a: 'Your data is protected. Your Aadhaar number is masked and stored in a secure Aadhaar Data Vault — never in plain text — and everything is handled under the DPDP Act with your consent. You can withdraw consent any time.' },
    { k: ['kyc', 'document', 'documents', 'digilocker', 'ckyc', 'verify identity'],
      a: 'KYC is required by RBI, but it’s quick here: I pull most of your details from DigiLocker and the CKYC registry, so you mostly just confirm them and take one selfie. If full KYC is needed, we’ll do a short video-KYC (V-CIP).' },
    { k: ['cibil', 'credit score', 'bureau', 'hard pull', 'soft pull'],
      a: 'With your explicit consent I check your credit bureau record (like CIBIL) to set a responsible limit. It’s done only for this application, as required by the CIC Act — and it protects you from over-borrowing too.' },
    { k: ['fee', 'fees', 'charge', 'charges', 'interest', 'apr', 'annual fee'],
      a: 'Every fee is shown up-front in your Key Fact Statement before you accept. Annual fees vary by card (and are often waived on a spend threshold); revolving balances carry a finance charge, but paying in full by the due date keeps it interest-free for up to ~50 days.' },
    { k: ['cooling', 'cancel', 'look-up', 'lookup', 'opt out'],
      a: 'You can cancel within the cooling-off / look-up period after issuance at no cost (other than pro-rata interest on anything you’ve spent). RBI requires us to offer this, and I’ll show you exactly how in-app.' },
    { k: ['income', 'salary', 'account aggregator', 'statement', 'proof'],
      a: 'To assess affordability I can fetch your bank statement securely through the Account Aggregator framework — consent-based and revocable — or you can share an ITR / payslip. It only checks eligibility, nothing more.' },
    { k: ['new to credit', 'no credit', 'first card', 'student', 'secured', 'fixed deposit', 'fd'],
      a: 'No credit history yet? No problem. I can offer a secured card against an Axis Fixed Deposit — no income proof needed, and it builds your CIBIL score responsibly so you can graduate to a regular card later.' },
    { k: ['time', 'how long', 'minutes', 'quick'],
      a: 'Most people finish in under 6 minutes. Because I auto-fill your details from DigiLocker/CKYC and pull eligibility for you, there’s very little typing.' },
    { k: ['decline', 'rejected', 'not approved', 'reject'],
      a: 'A decline is never a dead end. I can offer a secured card against an FD, a lower starting limit, or a callback from a specialist — and your progress is saved either way.' },
    { k: ['virtual card', 'instant', 'use now', 'physical card'],
      a: 'Once approved and signed, you get an instant virtual card to use right away (add it to Google/Apple Pay), while your physical card is dispatched and trackable.' },
    { k: ['which card', 'recommend', 'best card', 'choose'],
      a: 'Tell me what you spend on — shopping, travel, bills, food, OTT or cabs — and I’ll match you to the Axis card that earns you the most. You can always switch.' },
    { k: ['human', 'agent', 'call', 'callback', 'branch', 'help'],
      a: 'Happy to hand off — you can switch to WhatsApp, request a callback, book a video-KYC slot, or visit a branch, and resume right where you left off.' },
  ];

  function localAnswer(question, context) {
    const q = String(question || '').toLowerCase();
    let best = null, bestHits = 0;
    KB.forEach((entry) => {
      const hits = entry.k.reduce((n, kw) => n + (q.includes(kw) ? 1 : 0), 0);
      if (hits > bestHits) { bestHits = hits; best = entry; }
    });
    if (best && bestHits > 0) return best.a;
    // stage-aware default
    const why = context && context.stage && C.nudges.why[context.stage];
    return why
      ? `${why} Ask me anything about KYC, fees, eligibility, your data, or which card suits you — I’m here the whole way.`
      : 'I can help with KYC, fees, your credit limit, data privacy, or choosing the right Axis card. What would you like to know?';
  }

  /* ============================= NUDGE ==================================== */
  async function nudge(context) {
    const r = await call({ mode: 'nudge', context });
    if (r.ok && r.text) return r.text;
    const arr = C.nudges.inactivity;
    return arr[Math.min((context && context.attempt) || 0, arr.length - 1)];
  }

  /* ------------------------------------------------------- small utilities */
  function listWords(arr) {
    if (arr.length <= 1) return arr.join('');
    if (arr.length === 2) return arr.join(' and ');
    return arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }

  window.AX_AGENT = { recommend, ask, nudge };
})();
