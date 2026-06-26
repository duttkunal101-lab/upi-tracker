/* =============================================================================
 * Axis Bank — Agentic Onboarding · SIMULATED INTEGRATIONS
 * -----------------------------------------------------------------------------
 * A public web prototype cannot touch the real regulated rails (UIDAI, CKYC,
 * CIBIL, Account Aggregator, NPCI, eSign, issuer processor). This module fakes
 * each one with realistic latency, statuses and clearly-labelled MOCK data, so
 * the full agentic journey is clickable end-to-end. Every record carries
 * `simulated: true`. In production these functions become real API calls; the
 * app.js call-sites and the agent-at-work overlay stay the same.
 * ========================================================================== */
(function () {
  'use strict';

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* A small pool so the simulated identity feels real but is obviously fake. */
  const SAMPLE_PEOPLE = [
    { name: 'AARAV SHARMA', gender: 'Male', dob: '1996-04-12', city: 'Pune', state: 'Maharashtra' },
    { name: 'DIYA NAIR', gender: 'Female', dob: '1994-11-03', city: 'Bengaluru', state: 'Karnataka' },
    { name: 'KABIR MEHTA', gender: 'Male', dob: '1990-07-21', city: 'Ahmedabad', state: 'Gujarat' },
    { name: 'ANANYA REDDY', gender: 'Female', dob: '1998-01-30', city: 'Hyderabad', state: 'Telangana' },
    { name: 'ROHAN GUPTA', gender: 'Male', dob: '1993-09-15', city: 'New Delhi', state: 'Delhi' },
  ];
  const FATHERS = ['Rajesh', 'Suresh', 'Vinod', 'Anil', 'Prakash', 'Mahesh'];

  /* Seed a stable sample identity for the session (so prefill is consistent). */
  let _identity = null;
  function sampleIdentity(seed) {
    if (_identity) return _identity;
    const p = pick(SAMPLE_PEOPLE);
    const house = rand(1, 240);
    const first = p.name.split(' ')[0], last = p.name.split(' ')[1] || '';
    const addr = `${house}, MG Road, ${p.city}, ${p.state} - ${rand(100000, 899999)}`;
    _identity = {
      simulated: true,
      name: p.name,
      gender: p.gender,
      dob: p.dob,
      fatherName: `${pick(FATHERS)} ${last}`,
      email: `${first.toLowerCase()}.${(last || 'x').toLowerCase()}${rand(11, 99)}@gmail.com`,
      address: addr,
      currentAddress: addr,
      permanentAddress: addr,
      city: p.city,
      state: p.state,
      aadhaarMasked: `XXXX XXXX ${rand(1000, 9999)}`,
      photoInitials: p.name.split(' ').map((w) => w[0]).join(''),
    };
    return _identity;
  }
  function resetIdentity() { _identity = null; }

  /* The documents an agentic flow pulls & verifies (instead of asking for uploads). */
  function documentsFor(id, pan) {
    return [
      { name: 'Aadhaar (e-KYC XML)', via: 'DigiLocker · UIDAI', ref: id.aadhaarMasked, status: 'Verified' },
      { name: 'PAN', via: 'Protean (NSDL)', ref: (pan || '').toUpperCase() || '—', status: 'Verified' },
      { name: 'Proof of address', via: 'DigiLocker (Aadhaar)', ref: 'as per Aadhaar', status: 'Verified' },
      { name: 'Photograph', via: 'Aadhaar + live selfie', ref: 'face match', status: 'Verified' },
    ];
  }

  /* ---- Stage 1: mobile + pre-approved -------------------------------------- */
  async function sendOtp(mobile) {
    await delay(700);
    return { simulated: true, ok: true, mobile, hint: 'Use any 6 digits to continue (demo OTP).' };
  }
  async function verifyOtp(/* mobile, otp */) {
    await delay(600);
    return { simulated: true, ok: true };
  }
  async function checkPreApproved(mobile) {
    await delay(900);
    // ~40% of demo visitors get a pre-approved offer.
    const preApproved = (Number(String(mobile).slice(-1)) % 5) < 2;
    return {
      simulated: true,
      preApproved,
      indicativeLimit: preApproved ? rand(2, 6) * 50000 : null,
      relationship: preApproved ? 'existing-to-bank (savings account)' : 'new-to-bank',
    };
  }

  /* ---- Stage 3: identity / KYC -------------------------------------------- */
  /* DigiLocker consent handshake. REAL API: MeitY DigiLocker Partner API —
   * OAuth2 authorize (redirect to digilocker.gov.in) → token → list issued docs
   * (GET /public/oauth2/2/files/issued) → pull the signed XML (e.g. e-Aadhaar).
   * Needs a registered DigiLocker partner client_id/secret on the bank backend. */
  async function digiLockerConsent() {
    await delay(650);
    return { simulated: true, granted: true };
  }
  async function verifyPan(pan) {
    await delay(900);
    const ok = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(pan || '').toUpperCase());
    return {
      simulated: true,
      ok,
      status: ok ? 'VALID · Active' : 'INVALID format',
      nameAsPerItd: ok ? sampleIdentity(pan).name : null,
    };
  }
  async function digiLockerFetch(pan) {
    await delay(1400);
    const id = sampleIdentity();
    return { simulated: true, source: 'DigiLocker', ...id, documents: documentsFor(id, pan) };
  }
  async function aadhaarOtpEkyc(pan) {
    await delay(1300);
    const id = sampleIdentity();
    return { simulated: true, source: 'UIDAI e-KYC', ...id, documents: documentsFor(id, pan) };
  }
  /* Aadhaar OTP e-KYC path. REAL API: UIDAI Aadhaar OTP (via KUA/ASA). */
  async function aadhaarSendOtp(/* aadhaar */) { await delay(700); return { simulated: true, ok: true, hint: 'Use any 6 digits (demo OTP).' }; }
  async function aadhaarVerifyOtp() { await delay(600); return { simulated: true, ok: true }; }
  /* Document-upload + OCR path. REAL API: OCR/IDP vendor (e.g. IDfy, Signzy,
   * AWS Textract) reads the uploaded Aadhaar/PAN images and extracts fields. */
  async function ocrFetch(pan) {
    await delay(1700);
    const id = sampleIdentity();
    return { simulated: true, source: 'OCR (document scan)', confidence: 0.97, ...id, documents: documentsFor(id, pan) };
  }
  async function ckycPull() {
    await delay(1100);
    const found = Math.random() > 0.35; // most have an existing CKYC record
    return {
      simulated: true,
      found,
      ckycNumber: found ? String(rand(10000000000000, 99999999999999)) : null,
      prefilled: found,
    };
  }
  async function livenessFaceMatch() {
    await delay(1500);
    return { simulated: true, liveness: 'PASS', faceMatchScore: rand(86, 99) / 100 };
  }
  async function vcipSession() {
    await delay(1800);
    return { simulated: true, completed: true, geoTag: 'India', recorded: true };
  }

  /* ---- Stage 4: credit & income assessment -------------------------------- */
  async function bureauPull(profile) {
    await delay(1700);
    // New-to-credit → thin/no file. Else a believable score band.
    if (profile && profile.employment === 'ntc') {
      return { simulated: true, bureau: 'CIBIL', score: null, thinFile: true, obligations: 0, enquiries: 0 };
    }
    const score = rand(690, 805);
    return {
      simulated: true,
      bureau: 'CIBIL TransUnion',
      score,
      thinFile: false,
      obligations: rand(0, 2),
      enquiries: rand(0, 3),
    };
  }
  const EMPLOYERS = ['Infosys', 'TCS', 'HDFC Bank', 'Reliance Retail', 'Wipro', 'a private limited company'];
  async function accountAggregator(profile) {
    await delay(1600);
    const salaried = !profile || profile.employment !== 'self';
    const monthlyIncome = salaried ? rand(35, 140) * 1000 : rand(40, 180) * 1000;
    return {
      simulated: true,
      via: 'Account Aggregator (Finvu)',
      monthlyIncome,
      avgBalance: rand(15, 120) * 1000,
      foir: rand(18, 42) / 100,
      employmentType: salaried ? 'Salaried' : 'Self-employed',
      employerName: salaried ? pick(EMPLOYERS) : 'Own business',
      inferredFrom: salaried ? 'regular salary credits' : 'business inflows',
    };
  }
  async function pennyDrop() {
    await delay(900);
    return { simulated: true, accountValid: true, nameMatch: 'EXACT', bank: 'Demo Bank · A/C ••••' + rand(1000, 9999) };
  }
  async function amlScreen() {
    await delay(700);
    return { simulated: true, sanctions: 'CLEAR', pep: 'CLEAR', dedupe: 'no match' };
  }
  async function fraudCheck() {
    await delay(700);
    return { simulated: true, riskScore: rand(2, 18) / 100, deviceTrust: 'HIGH' };
  }

  /* ---- Stage 5: real-time underwriting ------------------------------------ */
  /* Combines the (simulated) signals + chosen card + employment into a
   * decision. Secured cards always approve against an FD. New-to-credit on an
   * unsecured card is routed to a secured offer — exercising the no-dead-end
   * path the brief asks for.                                                  */
  function underwrite({ card, bureau, income, employment }) {
    if (card && card.secured) {
      return { decision: 'approve', limit: rand(20, 80) * 1000, apr: 42.0, basis: 'Secured against your Axis Fixed Deposit', secured: true };
    }
    if (employment === 'ntc' || (bureau && bureau.thinFile)) {
      return {
        decision: 'refer',
        reason: 'new-to-credit',
        limit: null, apr: null,
        counter: { type: 'secured', cardId: 'insta-easy' },
        basis: 'No credit history yet — a secured card builds your score with no income proof.',
      };
    }
    const score = bureau ? bureau.score : 740;
    const monthly = income ? income.monthlyIncome : 50000;
    let limit;
    if (score >= 760) limit = Math.min(monthly * 3, 800000);
    else if (score >= 720) limit = Math.min(monthly * 2, 400000);
    else if (score >= 690) limit = Math.min(monthly * 1.2, 150000);
    else {
      return {
        decision: 'refer',
        reason: 'low-score',
        limit: null, apr: null,
        counter: { type: 'secured', cardId: 'insta-easy' },
        basis: 'A secured card or a lower starting limit can get you approved today.',
      };
    }
    limit = Math.round(limit / 5000) * 5000;
    return { decision: 'approve', limit, apr: 42.0, basis: `Approved on a CIBIL score of ${score} and verified income.`, score };
  }

  /* ---- Stage 6: e-sign ---------------------------------------------------- */
  async function eSign() {
    await delay(1200);
    return { simulated: true, signed: true, method: 'Aadhaar eSign (OTP)', ref: 'ESIGN-' + rand(100000, 999999) };
  }

  /* ---- Stage 7: issuance + tokenization ----------------------------------- */
  async function issueCard(card) {
    await delay(1600);
    const last4 = String(rand(1000, 9999));
    const yr = new Date().getFullYear() + 5;
    return {
      simulated: true,
      virtualCard: {
        last4,
        network: (card && card.network) || 'Visa',
        expiry: `${String(rand(1, 12)).padStart(2, '0')}/${String(yr).slice(-2)}`,
        name: (_identity && _identity.name) || 'CARDMEMBER',
      },
      physicalDispatch: { courier: 'Blue Dart', etaDays: rand(3, 6), trackable: true },
    };
  }
  async function enachSetup() {
    await delay(900);
    return { simulated: true, active: true, mode: 'UPI Autopay' };
  }
  async function provisionWallet() {
    await delay(800);
    return { simulated: true, token: 'TKN-' + rand(100000, 999999), wallets: ['Google Pay', 'Apple Pay'] };
  }

  /* ---- save & resume (simulated magic link) ------------------------------- */
  async function sendResumeLink(channel) {
    await delay(700);
    return { simulated: true, channel, sent: true };
  }

  window.AX_INT = {
    delay, sampleIdentity, resetIdentity,
    sendOtp, verifyOtp, checkPreApproved,
    digiLockerConsent, verifyPan, digiLockerFetch, aadhaarOtpEkyc, ckycPull, livenessFaceMatch, vcipSession,
    aadhaarSendOtp, aadhaarVerifyOtp, ocrFetch,
    bureauPull, accountAggregator, pennyDrop, amlScreen, fraudCheck,
    underwrite, eSign, issueCard, enachSetup, provisionWallet, sendResumeLink,
  };
})();
