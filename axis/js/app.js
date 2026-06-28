/* =============================================================================
 * Axis Bank — Agentic Onboarding · APP CONTROLLER
 * -----------------------------------------------------------------------------
 * Drives the minimum-click guided journey: a stage state-machine, autonomous
 * "agent at work" execution of the (simulated) integrations, prefill &
 * auto-advance, an always-on AI co-pilot, drop-off nudges + save-&-resume, and
 * a "Behind the scenes" blueprint drawer that exposes the integrations, data
 * points and RBI touchpoints behind each step.
 * ========================================================================== */
(function () {
  'use strict';

  const C = window.AX_CONFIG;
  const INT = window.AX_INT;
  const AGENT = window.AX_AGENT;
  const STORE = 'axis.onboarding.v2';
  const BUILD = 'v18'; // bump on each deploy → old saved journeys auto-reset so testers start fresh

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Aria — the AI agent's face (a real character, reused at every size)
  const ariaImg = (cls) => `<img class="aria-img" src="assets/aria.svg" alt="${esc(C.brand.agentName)}" width="120" height="120" draggable="false" />`;
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const synthPan = () => 'AXISP' + Math.floor(1000 + Math.random() * 9000) + 'K';
  const wizStages = C.stages.slice().sort((a, b) => a.num - b.num); // ordered by stage number
  // gamification done properly: named MILESTONES tied to real verified progress (no arcade points)
  // banks the customer can pick from for an Account-Aggregator income pull (they choose + consent)
  const AA_BANKS = [
    { id: 'hdfc', name: 'HDFC Bank', mk: 'H', ifsc: 'HDFC0001234' }, { id: 'sbi', name: 'SBI', mk: 'S', ifsc: 'SBIN0001234' },
    { id: 'icici', name: 'ICICI Bank', mk: 'I', ifsc: 'ICIC0001234' }, { id: 'kotak', name: 'Kotak', mk: 'K', ifsc: 'KKBK0001234' },
    { id: 'pnb', name: 'PNB', mk: 'P', ifsc: 'PUNB0001234' }, { id: 'bob', name: 'Bank of Baroda', mk: 'B', ifsc: 'BARB0001234' },
  ];
  const MISSION = [
    { key: 'start', icon: '📱', name: 'Verified' },
    { key: 'kyc', icon: '🛡️', name: 'Identity' },
    { key: 'product', icon: '🎯', name: 'Card matched' },
    { key: 'assessment', icon: '📊', name: 'Eligible' },
    { key: 'decision', icon: '⭐', name: 'Approved' },
    { key: 'agreement', icon: '✍️', name: 'Signed' },
    { key: 'issuance', icon: '💳', name: 'Card live' },
  ];

  /* --------------------------------------------------------------- state */
  const fresh = () => ({
    stage: 'landing',
    mobile: '', otpSent: false, otpVerified: false, preApproved: null, relationship: null,
    profile: { tags: [], employment: 'salaried' },
    budget: { shopping: 0, travel: 0, bills: 0, food: 0, entertainment: 0, cabs: 0, other: 5000 },
    okWithFees: false, feeBudget: 0, cardId: null, valueRank: null,
    autofillDone: false,
    dlMobile: '', dlLinked: false, dlOtpSent: false,
    pan: '', kycMethod: null, ocr: null, identity: null, ckyc: null, kycComplete: false, vcip: false, kycVia: null, selfieTaken: false, livenessDone: false, needsVcip: false, vcipDone: false, kycEdits: null,
    incomeMethod: 'pan', aaBank: null, bureau: null, income: null, account: null, assessmentDone: false,
    decision: null, signed: false, issued: null, autopay: false, autopayBank: null,
    napAcct: '', napIfsc: '', napMode: 'enach', pushProvisioned: false, cofted: [], coftSel: null,
    points: 0, awarded: {}, scratched: false, level: 0,
    startedAt: Date.now(), done: false,
  });
  let state = fresh();
  let _lastLead = ''; // last agent-lead message mirrored into the chat transcript

  function load() {
    try {
      // new build → wipe any old saved journey so every tester starts clean
      if (localStorage.getItem('axis.build') !== BUILD) {
        localStorage.removeItem(STORE);
        localStorage.setItem('axis.build', BUILD);
        return;
      }
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s && s.stage) state = Object.assign(fresh(), s);
    } catch (_) { /* ignore */ }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (_) {} }
  function clearSave() { try { localStorage.removeItem(STORE); } catch (_) {} }

  function track(event, props) {
    // Funnel hook — wire to your analytics/CDP here.
    try { console.info('[axis-funnel]', event, props || {}); } catch (_) {}
  }

  /* ------------------------------------------------------------- helpers */
  const stageIndex = (key) => wizStages.findIndex((s) => s.key === key);
  const currentCard = () => (state.cardId ? C.cardById[state.cardId] : null);


  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast is-visible' + (kind ? ' toast--' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = 'toast'; }, 3600);
  }

  /* ===================================================================== *
   *  VIEW + NAVIGATION
   * ===================================================================== */
  function showView(v) {
    $$('.view').forEach((el) => el.classList.toggle('is-active', el.dataset.view === v));
  }

  function setStage(key, opts) {
    const from = state.stage;
    state.stage = key;
    save();
    if (key === 'landing') { showView('landing'); renderResume(); return; }
    showView('wizard');
    awardStage(from, key); // gamification: reward the step just completed
    if (!state.appRef) { state.appRef = 'AXC' + String(Date.now()).slice(-8); save(); }
    renderAppbar();
    renderStepper();
    renderProgress();
    renderStage();
    armInactivity();
    seedCopilot(key);
    if (isBlueprintOpen()) renderBlueprint();
    if (isTrackerOpen()) renderTracker();
    track('stage_enter', { stage: key });
    window.scrollTo({ top: 0, behavior: (opts && opts.noScroll) ? 'auto' : 'smooth' });
  }

  function nextStage() {
    const i = stageIndex(state.stage);
    if (i >= 0 && i < wizStages.length - 1) setStage(wizStages[i + 1].key);
  }
  function prevStage() {
    const i = stageIndex(state.stage);
    if (i > 0) setStage(wizStages[i - 1].key);
    else setStage('landing');
  }

  function levelName() { return levelInfo().name; }
  function renderAppbar() {
    const el = $('#appbar'); if (!el) return;
    const status = C.appStatus[state.stage] || 'In progress';
    el.innerHTML = `<span class="appbar__live"></span>
      <span class="appbar__ref">Application <strong>${esc(state.appRef)}</strong></span>
      <span class="appbar__status">${esc(status)}</span>
      <button class="appbar__track" data-action="tracker-open" title="See live status, what's verified and your details">📋 Track</button>`;
  }

  /* ----------------------------- gamification ----------------------------- */
  function awardStage(from, to) {
    if (!from || from === 'landing' || from === to) return;
    state.awarded = state.awarded || {};
    if (state.awarded[from]) return;
    state.awarded[from] = true;
    state.points = (state.points || 0) + (C.gamify.points[from] || 0);
    save();
    // one tasteful milestone marker per verified step — no points/levels arcade
    const badge = C.gamify.badges[from];
    if (badge) popBadge(badge);
  }
  function floatPoints() {}
  function popBadge(badge) {
    const el = $('#badgePop'); if (!el) return;
    el.innerHTML = `<div class="badge-pop__card"><span class="badge-pop__ic">${badge.icon}</span><span class="badge-pop__lb">${esc(badge.label)}</span><span class="badge-pop__sub">Achievement unlocked ✨</span></div>`;
    el.hidden = false; el.classList.add('is-on');
    clearTimeout(popBadge._t);
    popBadge._t = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => { el.hidden = true; }, 320); }, 1800);
  }
  function confettiBurst() {
    const host = $('#confetti'); if (!host) return;
    const colors = ['#97144D', '#AE275F', '#C7962B', '#1F8A70', '#ffffff'];
    let html = '';
    for (let i = 0; i < 90; i++) {
      const left = Math.random() * 100, delay = Math.random() * 0.5, dur = 2.4 + Math.random() * 1.8, c = colors[i % colors.length];
      html += `<i style="left:${left}%;background:${c};animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
    }
    host.innerHTML = html; host.hidden = false;
    clearTimeout(confettiBurst._t);
    confettiBurst._t = setTimeout(() => { host.hidden = true; host.innerHTML = ''; }, 4400);
  }

  function renderStepper() {
    const cur = stageIndex(state.stage);
    $('#stepper').innerHTML = wizStages.map((s, i) => `
      <div class="step-dot ${i === cur ? 'is-active' : ''} ${i < cur ? 'is-done' : ''}" title="${esc(s.label)}">
        <span class="step-dot__num">${i < cur ? '✓' : s.num}</span>
        <span class="step-dot__label">${esc(s.label)}</span>
      </div>`).join('<span class="step-line"></span>');
  }

  function renderProgress() {
    const cur = stageIndex(state.stage);
    const pct = Math.round(((cur) / (wizStages.length - 1)) * 100);
    const remaining = wizStages.slice(cur).reduce((m, s) => m + (s.minutes || 1), 0);
    $('#progressFill').style.width = pct + '%';
    $('#progressNote').textContent = `Step ${cur + 1} of ${wizStages.length} · about ${remaining} min left`;
    $('#backBtn').hidden = false;
  }

  /* ===================================================================== *
   *  AGENT-AT-WORK OVERLAY  (autonomous execution of the integrations)
   * ===================================================================== */
  let factTimer = null;
  async function runAgent(title, steps) {
    const ov = $('#agentOverlay');
    $('#agentTitle').textContent = title;
    $('#agentName').textContent = C.brand.agentName + ' is working';
    $('#agentSteps').innerHTML = steps.map((s, i) => `
      <li class="ax-step" data-i="${i}">
        <span class="ax-step__ic">${s.icon || '•'}</span>
        <span class="ax-step__tx">${esc(s.label)}</span>
        <span class="ax-step__work"><i></i><i></i><i></i></span>
        <span class="ax-step__tag"></span>
        <span class="ax-step__tick">✓</span>
      </li>`).join('');
    $('#agentBar').style.width = '4%';
    ov.hidden = false;
    cycleFacts();

    const results = {};
    for (let i = 0; i < steps.length; i++) {
      const li = $(`.ax-step[data-i="${i}"]`);
      li.classList.add('is-active');
      let res;
      try { res = await steps[i].fn(results); } catch (_) { res = { simulated: true, error: true }; }
      results[steps[i].id] = res;
      li.classList.remove('is-active');
      li.classList.add('is-done');
      if (steps[i].tag) { const tag = steps[i].tag(res); if (tag) $('.ax-step__tag', li).textContent = tag; }
      $('#agentBar').style.width = Math.round(((i + 1) / steps.length) * 100) + '%';
      await INT.delay(180);
    }
    await INT.delay(360);
    ov.hidden = true;
    clearInterval(factTimer);
    return results;
  }
  // "card school": once a card is chosen, teach its benefits while the agent works
  function factPool() {
    const card = currentCard();
    if (card) {
      const name = card.name.replace('Axis Bank ', '').replace(' Credit Card', '');
      return card.highlights.map((h) => `Your ${name}: ${h}`).concat(C.facts);
    }
    return C.facts;
  }
  function cycleFacts() {
    const pool = factPool(); let i = 0;
    const lbl = $('#agentFactLbl');
    const set = () => {
      const card = currentCard();
      if (lbl) lbl.textContent = (card && i % pool.length < card.highlights.length) ? '💳 About your card' : '💡 Did you know';
      $('#agentFact').textContent = pool[i % pool.length]; i++;
    };
    set();
    clearInterval(factTimer);
    factTimer = setInterval(set, 2400);
  }

  /* ===================================================================== *
   *  STAGE RENDERERS  → return { html, mount? }
   * ===================================================================== */
  const R = {};

  /* ---- Stage 1: start (mobile + OTP + consent) ------------------------- */
  R.start = function () {
    // state-driven: render EITHER the number+consent OR the OTP entry — never both.
    const body = state.otpSent ? `
        <div class="sent-to">📲 OTP sent to <strong>+91 •••••${esc(state.mobile.slice(-5))}</strong> · <a href="#" data-action="otp-change">change number</a></div>
        <label class="fld">
          <span class="fld__label">Enter OTP <span class="muted">(demo — any 6 digits)</span></span>
          <div class="fld__eyewrap">
            <input id="otp" class="fld__input fld__input--mono" type="password" inputmode="numeric" maxlength="6" placeholder="• • • • • •" autocomplete="one-time-code" />
            <button type="button" class="fld__eye" data-action="otp-eye" aria-label="Show OTP" title="Show / hide OTP">👁️</button>
          </div>
        </label>
        <button class="btn btn--primary btn--block" id="startCta" data-action="verify-otp">Verify &amp; continue →</button>
      ` : `
        <label class="fld">
          <span class="fld__label">Mobile number</span>
          <div class="fld__inrow">
            <span class="fld__prefix">+91</span>
            <input id="mobile" class="fld__input" inputmode="numeric" maxlength="10"
              placeholder="10-digit mobile number" value="${esc(state.mobile)}" autocomplete="tel-national" />
          </div>
        </label>
        <label class="consent">
          <input type="checkbox" id="consentStart" ${state.mobile ? 'checked' : ''}/>
          <span>${esc(C.legal.consents.start)} <a href="#" data-action="why" data-why="start">Why?</a></span>
        </label>
        <button class="btn btn--primary btn--block" id="startCta" data-action="send-otp">Send OTP →</button>
      `;
    return { html: `
      ${stageHead('start')}
      <div class="panel">
        ${body}
        <p class="trust">🔒 Bank-grade security · RBI-regulated · We’ll only ask for what we truly need.</p>
      </div>` };
  };

  /* ---- Stage 2: product (agent recommendation) ------------------------- */
  R.product = function () {
    const rec = state._rec;
    let body;
    if (!rec) {
      const catRow = (t) => `<div class="bgt-row">
        <span class="bgt-row__lb">${t.icon} ${esc(t.label)}</span>
        <input type="range" class="bgt-row__slider" data-budget="${t.id}" min="0" max="50000" step="1000" value="${Number(state.budget[t.id]) || 0}" aria-label="${esc(t.label)} monthly spend" />
        <span class="bgt-row__val" data-budgetval="${t.id}">${inr(state.budget[t.id])}</span>
      </div>`;
      const selected = C.profileTags.filter((t) => state.profile.tags.includes(t.id));
      body = `
      <div class="panel">
        <p class="ask">Where does your money go each month? <span class="muted">Tap your spends, then set the amounts — I’ll find the card that pays <strong>you</strong> the most.</span></p>
        <div class="chips" id="tagChips">
          ${C.profileTags.map((t) => `<button class="chip ${state.profile.tags.includes(t.id) ? 'is-on' : ''}" data-action="toggle-tag" data-tag="${t.id}">${t.icon} ${esc(t.label)}</button>`).join('')}
        </div>
        <div class="budget">
          ${selected.map(catRow).join('')}
          <div class="bgt-row bgt-row--other">
            <span class="bgt-row__lb">🧮 Everything else</span>
            <input type="range" class="bgt-row__slider" data-budget="other" min="0" max="100000" step="1000" value="${Number(state.budget.other) || 0}" aria-label="Everything else monthly spend" />
            <span class="bgt-row__val" data-budgetval="other">${inr(state.budget.other)}</span>
          </div>
          <div class="budget__total">Your monthly spend <strong id="budgetTotal">${inr(budgetTotal())}</strong></div>
        </div>
        <p class="ask">You are…</p>
        <div class="seg">
          ${[['salaried', 'Salaried'], ['self', 'Self-employed']].map(([v, l]) =>
            `<button class="seg__btn ${state.profile.employment === v ? 'is-on' : ''}" data-action="set-emp" data-emp="${v}">${l}</button>`).join('')}
        </div>
        <p class="ask">Card fees <span class="muted">— premium cards charge an annual fee for lounges, concierge &amp; richer rewards. What’s the most you’re happy to pay?</span></p>
        <div class="feebudget">
          <input type="range" class="bgt-row__slider" data-feebudget min="0" max="60000" step="5000" value="${Number(state.feeBudget) || 0}" aria-label="Maximum annual fee you'll pay" />
          <div class="feebudget__val"><strong id="feeBudgetVal">${state.feeBudget ? 'up to ' + inr(state.feeBudget) : 'Lifetime-free / low fee'}</strong><span class="muted"> · max annual fee</span></div>
        </div>
        <button class="btn btn--primary btn--block" data-action="recommend">Find my best-value card →</button>
        <button class="btn btn--ghost btn--block" data-action="browse">Browse all cards myself</button>
      </div>`;
    } else {
      body = cardHero(rec.card, rec.reason, true) + valueCompare() + `
        <button class="btn btn--ghost btn--block" data-action="browse">See all Axis cards</button>
        <button class="btn btn--ghost btn--block" data-action="reprofile">↻ Adjust my spends</button>`;
    }
    return { html: stageHead('product') + body };
  };

  /* the agent's value comparison — shows WHY this card wins for the budget */
  function valueCompare() {
    const ranked = (state.valueRank || []).map((v) => ({ card: C.cardById[v.id], gross: v.gross, net: v.net, perk: v.perk, total: v.total, fee: v.fee, annualFee: v.annualFee, waived: v.waived })).filter((r) => r.card);
    if (!ranked.length) return '';
    const key = state.okWithFees ? 'total' : 'net';
    const max = Math.max.apply(null, ranked.map((r) => r[key]).concat([1]));
    const feeTag = (r) => r.annualFee ? (r.waived ? `fee ${inr(r.annualFee)} · waived` : `${inr(r.annualFee)} fee${r.perk ? ' · +' + inr(r.perk) + ' perks' : ''}`) : 'lifetime free';
    return `<div class="vcompare">
      <div class="sec-label">💡 ${state.okWithFees ? 'Yearly value — rewards + perks, fees shown' : 'Net value to you (rewards − fee)'}</div>
      ${ranked.map((r, i) => `<div class="vcomp ${i === 0 ? 'is-top' : ''}">
        <span class="vcomp__nm">${esc(r.card.shortName)}${i === 0 ? ' · best' : ''}</span>
        <span class="vcomp__bar"><i style="width:${Math.max(6, Math.round((r[key] / max) * 100))}%"></i></span>
        <span class="vcomp__val">${inr(r[key])}<small>/yr</small></span>
        <span class="vcomp__fee ${r.annualFee && !r.waived ? 'vcomp__fee--paid' : ''}">${feeTag(r)}</span>
      </div>`).join('')}
      <p class="muted vcompare__note">On your ${inr(budgetTotal())}/month spend. ${state.okWithFees ? 'Ranked by rewards &amp; perks — each card’s annual fee is shown so the choice is yours.' : 'Ranked by <strong>net</strong> value after each card’s fee (waived where your spend qualifies).'} Indicative — actual value depends on caps &amp; terms.</p>
    </div>`;
  }

  R._browse = function () {
    return { html: stageHead('product') + `
      <div class="card-grid">${C.cards.map((c) => cardMini(c, true)).join('')}</div>
      <button class="btn btn--ghost btn--block" data-action="back-rec">← Back to recommendation</button>` };
  };

  /* ---- Stage 3: KYC ---------------------------------------------------- */
  R.kyc = function () {
    if (!state.identity) {
      const m = state.kycMethod;
      if (m === 'digilocker') return { html: stageHead('kyc') + kycDigiLocker() };
      if (m === 'aadhaar') return { html: stageHead('kyc') + kycAadhaar() };
      if (m === 'ocr') return { html: stageHead('kyc') + kycOcr() };
      if (m === 'vcip') return { html: stageHead('kyc') + kycVcip() };
      // DEFAULT: the customer chooses HOW to verify — their choice, with full info
      return { html: stageHead('kyc') + kycChooser() };
    }
    // documents fetched, but a live selfie (liveness + face match) is required first (RBI)
    if (state.identity && !state.livenessDone && !state.needsVcip) return { html: stageHead('kyc') + kycLiveness() };
    // face match was below the auto-threshold → escalate to V-CIP, but ONLY when required
    if (state.identity && state.needsVcip && !state.vcipDone) return { html: stageHead('kyc') + kycVcipEscalation() };
    // liveness done → Aria fills the application live, field by field, from the verified source
    if (state.identity && state.livenessDone && !state.autofillDone) return kycAutofill();
    // identity + liveness + autofill done → show WHAT was verified (audit), THEN the filled form
    const id = state.identity || {};
    const fromDoc = state.kycVia === 'ocr';
    const ver = [
      ['🪪', 'Identity (Aadhaar e-KYC)', fromDoc ? 'Read from your uploaded document' : (state.vcip ? 'Captured live on the V-CIP call' : 'Fetched & verified with UIDAI')],
      ['#️⃣', 'PAN', 'Validated with Protean (NSDL) — name matched'],
      ['🤳', state.vcip ? 'Liveness (on video)' : 'Liveness & face match', state.vcip ? 'Officer confirmed you’re live' : 'Live selfie matched your photo ID'],
      ['🗂️', 'CKYC registry (CERSAI)', state.ckyc && state.ckyc.found ? 'Existing record matched' : 'New CKYC record created'],
    ];
    return { html: stageHead('kyc') + `
      <div class="kyc-card">
        <div class="verok">
          <div class="verok__head"><span class="verok__badge">✓ KYC verified</span><span class="verok__via">${esc(viaLabel(state.kycVia))}</span></div>
          <p class="verok__lead">I verified your identity <strong>first</strong>, then filled your application from that verified source — nothing was assumed. Here’s exactly what I checked:</p>
          <div class="verlist">${ver.map(([i, k, v]) => `<div class="veritem"><span class="veritem__ic">${i}</span><span class="veritem__k">${esc(k)}</span><span class="veritem__v">✓ ${esc(v)}</span></div>`).join('')}</div>
        </div>
        <div class="kyc-card__head">
          <div class="avatar">${esc(id.photoInitials || '🙂')}</div>
          <div>
            <div class="kyc-card__name">${esc(id.name || 'Verified')}</div>
            <div class="kyc-card__sub">Identity confirmed ${esc(viaLabel(state.kycVia))}</div>
          </div>
          <span class="pill pill--ok">✓ Verified</span>
        </div>
        <div class="docs-fetched">📄 Documents fetched ${esc(viaLabel(state.kycVia))}: ${(C.digiLockerDocs || []).slice(0, 2).map((d) => `<strong>${esc(d.name)}</strong>`).join(' · ')} · <strong>Photograph</strong></div>
        <div class="sec-label">🗂️ Your application — filled from your verified KYC ${afBadge()} <span class="edit-hint">✎ tap any field to edit</span></div>
        <div class="kyc-rows">
          ${kycEditRow('Full name', 'name', id.name)}
          ${kycEditRow('Date of birth', 'dob', id.dob)}
          ${kycEditRow('Gender', 'gender', id.gender)}
          ${kycEditRow('Father’s name', 'father', id.fatherName)}
          ${kvRow('PAN', (state.pan || '').toUpperCase() + ' · verified ✓')}
          ${kycEditRow('Email', 'email', id.email)}
          ${kvRow('Aadhaar', (id.aadhaarMasked || '') + ' (masked) · verified ✓')}
          ${kycEditRow('Current address', 'curaddr', id.currentAddress || id.address)}
          ${kycEditRow('Permanent address', 'permaddr', id.permanentAddress || id.address)}
        </div>
        <p class="muted edit-note">PAN &amp; Aadhaar are document-verified (locked). Tap any other field to correct it — you’re confirming this to Axis Bank.</p>
        <button class="btn btn--primary btn--block" data-action="confirm-kyc">This is correct — confirm &amp; continue →</button>
      </div>` };
  };
  // an editable application field (the fetched value can be corrected before confirming)
  function kycEditRow(label, key, value) {
    const v = (state.kycEdits && state.kycEdits[key] != null) ? state.kycEdits[key] : (value || '');
    return `<label class="kv kv--edit">
      <span class="kv__k">${esc(label)}</span>
      <input class="kv__editinput" data-kycfield="${key}" value="${esc(v)}" aria-label="${esc(label)}" />
      <span class="kv__pen" aria-hidden="true">✎</span>
    </label>`;
  }
  function applyKycEdits() {
    if (!state.kycEdits || !state.identity) return;
    const map = { name: 'name', dob: 'dob', gender: 'gender', father: 'fatherName', email: 'email', curaddr: 'currentAddress', permaddr: 'permanentAddress' };
    Object.keys(state.kycEdits).forEach((k) => { const f = map[k]; if (f && state.kycEdits[k] != null) state.identity[f] = state.kycEdits[k]; });
  }

  /* ---- Stage 4: assessment -------------------------------------------- */
  R.assessment = function () {
    if (!state.assessmentDone) {
      const m = state.incomeMethod;
      const aaPicked = state.aaBank && AA_BANKS.find((b) => b.id === state.aaBank);
      return { html: stageHead('assessment') + `
        <div class="panel">
          ${trustRow()}
          <label class="consent">
            <input type="checkbox" id="consentBureau" checked/>
            <span>${esc(C.legal.consents.bureau)} <a href="#" data-action="why" data-why="assessment">Why?</a></span>
          </label>
          <p class="ask">How should I verify your income? <span class="muted">No bank can share your data on its own — you choose &amp; consent.</span></p>
          <div class="seg seg--income">
            <button class="seg__btn ${m === 'pan' ? 'is-on' : ''}" data-action="income-method" data-m="pan">🧾 Via my PAN (ITR)</button>
            <button class="seg__btn ${m === 'aa' ? 'is-on' : ''}" data-action="income-method" data-m="aa">🏦 Share a bank statement</button>
          </div>
          ${m === 'pan' ? `
            <div class="info-note">🧾 I’ll read your latest filed <strong>ITR / Form 26AS</strong> via your PAN ${state.pan ? '<strong>' + esc(state.pan) + '</strong>' : ''} from the Income-Tax records — no bank statement, no typing. New to filing? Switch to a bank statement instead.</div>
          ` : `
            <p class="ask">Which bank account should I read? <span class="muted">via the RBI Account Aggregator — read-only &amp; revocable. Other banks can’t share without this.</span></p>
            <div class="bank-grid">
              ${AA_BANKS.map((b) => `<button class="bank-chip ${state.aaBank === b.id ? 'is-on' : ''}" data-action="aa-bank" data-bank="${b.id}"><span class="bank-chip__mk">${esc(b.mk)}</span>${esc(b.name)}</button>`).join('')}
            </div>
            <label class="consent"><input type="checkbox" id="consentAa" checked/><span>${esc(C.legal.consents.aa)}</span></label>
          `}
          ${trustWhy('assessment')}
          <button class="btn btn--primary btn--block" data-action="run-assessment">${m === 'aa' && !aaPicked ? 'Pick a bank to continue' : 'Run my eligibility check →'}</button>
          <p class="trust">📊 A consented check sets a responsible limit — and protects you from over-borrowing.</p>
        </div>` };
    }
    const b = state.bureau || {}, inc = state.income || {};
    return { html: stageHead('assessment') + `
      <div class="metrics">
        ${metric(b.thinFile ? 'New' : (b.score || '—'), b.thinFile ? 'credit profile' : 'CIBIL score')}
        ${metric(inc.monthlyIncome ? inr(inc.monthlyIncome) : '—', 'monthly income')}
        ${metric('Clear', 'AML & fraud')}
      </div>
      <p class="muted center">Eligibility assessed. ${C.brand.agentName} is preparing your offer…</p>
      <button class="btn btn--primary btn--block" data-action="to-decision">See my offer →</button>` };
  };

  /* ---- Stage 5: decision ---------------------------------------------- */
  R.decision = function () {
    const d = state.decision || {};
    const card = currentCard();
    if (d.decision === 'approve') {
      return { html: stageHead('decision') + `
        <div class="offer">
          <span class="offer__tag">🎉 Approved</span>
          <h3 class="offer__card">${esc(card.name)}</h3>
          <div class="offer__limit">${inr(d.limit)}<span>approved credit limit</span></div>
          <p class="offer__basis">${esc(d.basis)}</p>
          ${state.income ? `<p class="offer__verified">✓ Verified income ${inr(state.income.monthlyIncome)}/mo${state.income.employerName ? ` · ${esc(state.income.employmentType)} at ${esc(state.income.employerName)}` : ''} <span class="af">via ${esc(state.income.via || 'verified source')}</span></p>` : ''}
        </div>
        ${limitExplainer(d, state.bureau, state.income)}
        ${kfs(d, card)}
        ${spendOptimizer(card)}
        ${cardTipsBox(card)}
        ${cardDetails(card)}
        ${mitcAccordion()}
        <button class="btn btn--primary btn--block" data-action="accept-offer">Accept &amp; continue →</button>
        <p class="muted center"><a href="#" data-action="channel">Talk to a specialist instead</a></p>` };
    }
    // refer / decline → never a dead end
    return { html: stageHead('decision') + `
      <div class="offer offer--refer">
        <span class="offer__tag offer__tag--soft">Let’s find the right fit</span>
        <p class="offer__basis">${esc(d.basis || C.nudges.declined)}</p>
      </div>
      ${cardHero(C.cardById['insta-easy'], 'A secured card against an Axis Fixed Deposit — no income proof, builds your CIBIL score, and you’re approved today.', false)}
      <button class="btn btn--primary btn--block" data-action="choose-secured">Continue with the secured card →</button>
      <button class="btn btn--ghost btn--block" data-action="channel">Request a callback instead</button>` };
  };

  /* ---- Stage 6: agreement (MITC + consent + e-sign) ------------------- */
  R.agreement = function () {
    const card = currentCard();
    const d = state.decision || {};
    return { html: stageHead('agreement') + `
      <div class="panel">
        ${trustRow()}
        <div class="kfs-mini">
          ${kvRow('Card', card.name)}
          ${kvRow('Credit limit', inr(d.limit))}
          ${kvRow('Annual fee', card.annualFee ? inr(card.annualFee) : 'Lifetime free')}
          ${kvRow('Finance charge', '~3.6% p.m. (~52.86% p.a.) on revolving balances')}
        </div>
        ${mitcAccordion(true)}
        <div class="cooloff">⏳ ${esc(C.legal.coolingOff)}</div>
        ${trustWhy('agreement')}
        <label class="consent">
          <input type="checkbox" id="consentIssue"/>
          <span>${esc(C.legal.consents.issue)} <a href="#" data-action="why" data-why="agreement">Why?</a></span>
        </label>
        <button class="btn btn--primary btn--block" id="signCta" data-action="esign" disabled>Confirm &amp; e-sign with Aadhaar →</button>
        <p class="trust">✍️ Explicit consent to issue is mandatory — RBI prohibits unsolicited cards.</p>
      </div>` };
  };

  /* ---- Stage 7: issuance ---------------------------------------------- */
  R.issuance = function () {
    if (!state.issued) {
      return {
        html: stageHead('issuance') + `<div class="panel center"><div class="spinner"></div><p class="muted">Issuing your card…</p></div>`,
        mount: async () => {
          const res = await runAgent('Issuing your Axis card', [
            { id: 'issue', icon: '💳', label: 'Creating your account & credit line', fn: () => INT.issueCard(currentCard()), tag: () => 'Account live' },
            { id: 'wallet', icon: '📲', label: 'Provisioning a virtual card to your wallet', fn: () => INT.provisionWallet(), tag: () => 'Tokenized' },
          ]);
          state.issued = res.issue;
          save();
          renderStage();
          toast('✓ Your virtual card is live!', 'success');
          confettiBurst();
        },
      };
    }
    const v = state.issued.virtualCard || {};
    const card = currentCard();
    if (state.issueScreen === 'pin') return { html: stageHead('issuance') + pinScreen() };
    if (state.issueScreen === 'wallet') return { html: stageHead('issuance') + walletScreen(card, v) };
    if (state.issueScreen === 'autopay') return { html: stageHead('issuance') + autopayScreen() };
    if (state.issueScreen === 'coft') return { html: stageHead('issuance') + cardOnFileScreen() };
    return { html: stageHead('issuance') + `
      ${virtualCardVisual(card, v)}
      ${onlineUseBox()}
      <p class="muted center" style="margin:0.2rem 0 0.7rem">Let’s finish setting it up — do all three:</p>
      ${setupProgress()}
      <div class="issue-actions">
        ${actionTile('🔢', 'Set your card PIN', 'set-pin', state._pinSet ? 'Done ✓' : 'Set →')}
        ${actionTile('📲', 'Add to Google / Apple Pay (1-tap)', 'add-wallet', state._walletAdded ? 'Added ✓' : 'Add →')}
        ${actionTile('🔁', 'Autopay — never miss a due date', 'autopay', state.autopay ? 'On ✓' : 'Enable →')}
      </div>
      ${cardOnFileTeaser()}
      ${topMerchants(card)}
      <p class="trust">📮 Physical card via ${esc(state.issued.physicalDispatch.courier)} in ~${state.issued.physicalDispatch.etaDays} days · trackable.</p>
      <button class="btn btn--primary btn--block" data-action="to-welcome">Continue →</button>` };
  };
  /* ---- issuance sub-screens (real PIN / wallet / autopay flows) -------- */
  function pinScreen() {
    return `<div class="panel">
      <button class="linkback" data-action="issue-back">← Back</button>
      <h3 class="sub-h">🔢 Set your 4-digit card PIN</h3>
      <p class="muted">For ATMs and in-store payments. Keep it private — never share it.</p>
      <label class="fld"><span class="fld__label">New PIN</span><input id="pin1" class="fld__input fld__input--mono" inputmode="numeric" maxlength="4" type="password" placeholder="••••" /></label>
      <label class="fld"><span class="fld__label">Confirm PIN</span><input id="pin2" class="fld__input fld__input--mono" inputmode="numeric" maxlength="4" type="password" placeholder="••••" /></label>
      <button class="btn btn--primary btn--block" data-action="pin-save">Set PIN →</button>
      <p class="trust">🔒 Encrypted end-to-end — never seen by anyone, including Axis staff.</p>
    </div>`;
  }
  function walletScreen(card, v) {
    return `<div class="panel">
      <button class="linkback" data-action="issue-back">← Back</button>
      <h3 class="sub-h">📲 Add to your phone wallet</h3>
      <p class="muted">One tap — <strong>Visa push provisioning</strong> tokenises your card through the Visa Token Service and pushes it straight into your wallet. Your real card number is never shared with merchants.</p>
      ${virtualCardVisual(card, v)}
      <div class="pushprov"><span class="pushprov__v">VISA</span><span>Secure push provisioning · Visa Token Service — no typing your card number</span></div>
      <button class="btn btn--primary btn--block" data-action="wallet-add" data-wallet="gpay">Push to Google Pay →</button>
      <button class="btn btn--ghost btn--block" data-action="wallet-add" data-wallet="apay">Push to Apple Pay →</button>
    </div>`;
  }
  function autopayScreen() {
    const amt = state._autopayAmt || 'full';
    const bank = AA_BANKS.find((b) => b.id === state.autopayBank);
    return `<div class="panel">
      <button class="linkback" data-action="issue-back">← Back</button>
      <h3 class="sub-h">🔁 Set up autopay (e-NACH)</h3>
      <p class="muted">Auto-pay your bill each month from <strong>any bank account</strong> — an NPCI e-NACH / UPI-Autopay mandate works across banks (it needn’t be Axis), with your consent and revocable anytime.</p>
      <p class="ask">Pay from which bank?</p>
      <div class="bank-grid">
        ${AA_BANKS.map((b) => `<button class="bank-chip ${state.autopayBank === b.id ? 'is-on' : ''}" data-action="autopay-bank" data-bank="${b.id}"><span class="bank-chip__mk">${esc(b.mk)}</span>${esc(b.name)}</button>`).join('')}
      </div>
      ${bank ? `
      <p class="ask">Your ${esc(bank.name)} account <span class="muted">— required to register the mandate.</span></p>
      <label class="fld"><span class="fld__label">Account number</span><input id="napAcct" class="fld__input fld__input--mono" inputmode="numeric" maxlength="18" placeholder="Bank account number" value="${esc(state.napAcct || '')}" /></label>
      <label class="fld"><span class="fld__label">IFSC code</span><input id="napIfsc" class="fld__input fld__input--mono" maxlength="11" placeholder="e.g. ${esc(bank.ifsc)}" value="${esc(state.napIfsc || '')}" style="text-transform:uppercase" /></label>
      <p class="ask">Mandate type</p>
      <div class="seg seg--nach">
        <button class="seg__btn ${state.napMode !== 'upi' ? 'is-on' : ''}" data-action="nach-mode" data-mode="enach">e-NACH (net-banking)</button>
        <button class="seg__btn ${state.napMode === 'upi' ? 'is-on' : ''}" data-action="nach-mode" data-mode="upi">UPI Autopay</button>
      </div>` : ''}
      <p class="ask">How much each month?</p>
      <div class="seg">
        <button class="seg__btn ${amt === 'full' ? 'is-on' : ''}" data-action="autopay-amt" data-amt="full">Total amount due</button>
        <button class="seg__btn ${amt === 'min' ? 'is-on' : ''}" data-action="autopay-amt" data-amt="min">Minimum due</button>
      </div>
      <div class="kfs-mini">
        ${kvRow('Pay from', bank ? esc(bank.name) : 'pick a bank above')}
        ${kvRow('Mandate', 'NPCI e-NACH · works across banks · cancel anytime')}
      </div>
      <label class="consent"><input type="checkbox" id="autopayConsent" checked/><span>I authorise an e-NACH mandate on the selected account to auto-pay my Axis card dues.</span></label>
      <button class="btn btn--primary btn--block" data-action="autopay-save">${bank ? 'Confirm autopay →' : 'Pick a bank to continue'}</button>
    </div>`;
  }

  /* ---- card-on-file tokenization (RBI CoFT): save the card at the customer's
   * own merchant accounts so it can be used for online payments without re-typing */
  const COFT_MERCHANTS = [
    { id: 'amazon', name: 'Amazon', i: '🛒', found: true }, { id: 'netflix', name: 'Netflix', i: '🎬', found: true },
    { id: 'swiggy', name: 'Swiggy', i: '🍔', found: true }, { id: 'flipkart', name: 'Flipkart', i: '📦', found: true },
    { id: 'uber', name: 'Uber', i: '🚕', found: true }, { id: 'spotify', name: 'Spotify', i: '🎵', found: false },
  ];
  function cardOnFileTeaser() {
    const n = (state.cofted || []).length;
    return `<div class="coft-teaser">
      <div class="coft-teaser__h"><strong>💳 Save your card on the apps you use</strong><span class="coft-teaser__tag">${n ? n + ' saved ✓' : 'RBI tokenization'}</span></div>
      <p class="muted">I can find where you already have accounts and securely save this card there — RBI <strong>card-on-file tokenization</strong>, so you pay without ever typing your number.</p>
      <button class="btn btn--ghost btn--block" data-action="coft">${n ? 'Manage saved apps →' : 'Find my apps &amp; save card →'}</button>
    </div>`;
  }
  function cardOnFileScreen() {
    if (!state.coftSel) { state.coftSel = {}; COFT_MERCHANTS.forEach((m) => { if (m.found) state.coftSel[m.id] = true; }); }
    const sel = state.coftSel;
    const found = COFT_MERCHANTS.filter((m) => m.found);
    return `<div class="panel">
      <button class="linkback" data-action="issue-back">← Back</button>
      <h3 class="sub-h">💳 Save your card on your apps</h3>
      <p class="muted">Using your verified email &amp; mobile, I found accounts where you can save this card on file. With RBI <strong>tokenization</strong> the merchant stores a token — never your real card number. Choose where to save it:</p>
      <div class="coft-list">
        ${found.map((m) => `<label class="coft-item ${sel[m.id] ? 'is-on' : ''}"><span class="coft-item__i">${m.i}</span><span class="coft-item__n">${esc(m.name)}<small>account found · ${esc((state.identity && state.identity.email) || 'your email')}</small></span><input type="checkbox" data-coft="${m.id}" ${sel[m.id] ? 'checked' : ''}/></label>`).join('')}
      </div>
      <button class="btn btn--primary btn--block" data-action="coft-save">Securely save my card (tokenize) →</button>
      <p class="trust">🔒 RBI card-on-file tokenization (CoFT) — you can view or delete these tokens anytime in the Axis app.</p>
    </div>`;
  }
  async function cardOnFileSave() {
    const chosen = $$('[data-coft]').filter((c) => c.checked).map((c) => c.getAttribute('data-coft'));
    if (!chosen.length) { toast('Pick at least one app, or go back.', 'error'); return; }
    const names = chosen.map((id) => (COFT_MERCHANTS.find((m) => m.id === id) || {}).name).filter(Boolean);
    await runAgent('Tokenising your card', [
      { id: 'find', icon: '🔎', label: 'Confirming your accounts at the selected merchants', fn: () => INT.delay(900), tag: () => names.length + ' found' },
      { id: 'token', icon: '🔐', label: 'Requesting network tokens (Visa Token Service)', fn: () => INT.provisionWallet(), tag: () => 'tokens issued' },
      { id: 'save', icon: '💳', label: 'Saving the token on file at each merchant (RBI CoFT)', fn: () => INT.delay(800), tag: () => 'saved' },
    ]);
    state.cofted = names; state.issueScreen = null; save();
    renderStage();
    toast('✓ Card securely saved at ' + names.length + ' app' + (names.length > 1 ? 's' : '') + ' — RBI tokenized.', 'success');
  }

  /* ---- Stage 8: welcome ----------------------------------------------- */
  R.welcome = function () {
    const card = currentCard();
    state.done = true; save();
    return {
      html: `
      <div class="welcome">
        <div class="welcome__burst">🎉</div>
        <h2 class="welcome__title">Welcome to Axis Bank!</h2>
        <p class="welcome__sub">Your <strong>${esc(card.name)}</strong> is ready. ${esc(C.brand.tagline)}.</p>
        <div class="welcome__benefits">
          ${card.highlights.slice(0, 3).map((h) => `<div class="benefit">✦ ${esc(h)}</div>`).join('')}
        </div>
        ${cardTipsBox(card)}
        <div class="sec-label">🏅 Every milestone you unlocked</div>
        ${missionRail()}
        <div class="sec-label">🎁 Your welcome reward</div>
        <button class="scratch ${state.scratched ? 'is-revealed' : ''}" data-action="scratch" aria-label="Scratch to reveal your welcome reward">
          <span class="scratch__prize">🎉 ₹500 welcome cashback unlocked on your ${esc(card.name.replace('Axis Bank ', '').replace(' Credit Card', ''))}!</span>
          <span class="scratch__foil"><span>✨ Tap to scratch &amp; reveal</span></span>
        </button>
        <div class="sec-label">📦 Track your card — ${esc(state.appRef || '')}</div>
        <div class="deliv" id="deliveryTrack"></div>
        ${downloadAppCta()}
        <div class="welcome__nudge">💡 ${esc(C.stageByKey.welcome.nudge)} Make a first transaction to activate your rewards — we’ll text you each delivery update.</div>
        <button class="btn btn--primary btn--block" data-action="restart">Start a new application</button>
      </div>`,
      mount: startDelivery,
    };
  };

  /* live card-delivery tracker — advances on a timer for the demo */
  let deliveryTimer = null;
  function startDelivery() {
    if (state.deliveryStep == null) state.deliveryStep = 0;
    renderDelivery();
    clearInterval(deliveryTimer);
    deliveryTimer = setInterval(() => {
      if (state.deliveryStep < C.delivery.length - 1) { state.deliveryStep++; save(); renderDelivery(); }
      else clearInterval(deliveryTimer);
    }, 2200);
  }
  function renderDelivery() {
    const el = $('#deliveryTrack'); if (!el) return;
    el.innerHTML = C.delivery.map((d, i) => {
      const cls = i < state.deliveryStep ? 'is-done' : (i === state.deliveryStep ? 'is-now' : '');
      const dot = i < state.deliveryStep ? '✓' : (i === state.deliveryStep ? '●' : '');
      return `<div class="deliv__step ${cls}"><span class="deliv__dot">${dot}</span><span class="deliv__lb">${esc(d.label)}</span></div>`;
    }).join('');
    if (isTrackerOpen()) renderTracker(); // keep the live tracker in sync
  }

  /* ===================================================================== *
   *  CUSTOMER TRACKER ("Track my application") — the transparency view
   *  Every automated step is shown with a live status the customer can see,
   *  plus the (masked) details on file. This is what builds trust: nothing
   *  the agent does is hidden.
   * ===================================================================== */
  const isTrackerOpen = () => $('#tracker') && $('#tracker').classList.contains('is-open');
  function deliveryNowLabel() {
    if (!state.issued) return '';
    if (state.deliveryStep == null) return 'preparing dispatch';
    const d = C.delivery[Math.min(state.deliveryStep, C.delivery.length - 1)];
    return d ? d.label : '';
  }
  function trackerData() {
    const s = state, id = s.identity || {}, card = currentCard();
    const d = s.decision || {}, b = s.bureau || {}, inc = s.income || {};
    const deliveredAll = s.deliveryStep != null && s.deliveryStep >= (C.delivery.length - 1);
    const raw = [
      ['📱', 'Mobile verified', s.otpVerified, s.mobile ? '+91 •••••' + s.mobile.slice(-4) : ''],
      ['🏦', 'Relationship checked', !!s.relationship, s.relationship && C.relationship[s.relationship] ? C.relationship[s.relationship].tag + ' · ' + C.relationship[s.relationship].code : ''],
      ['🎁', 'Pre-approved offer check', !!s.preApproved, s.preApproved ? (s.preApproved.preApproved ? 'pre-approved up to ' + inr(s.preApproved.indicativeLimit) : 'new to bank') : ''],
      ['💳', 'Card selected', !!s.cardId, card ? shortName(card) : ''],
      ['🪪', 'Identity verified (KYC)', !!s.identity, s.identity ? viaLabel(s.kycVia) : ''],
      ['#️⃣', 'PAN validated', !!s.pan, (s.pan || '').toUpperCase()],
      ['🏠', 'Address on record', !!(id.currentAddress || id.address), (id.currentAddress || id.address) ? 'as per Aadhaar' : ''],
      ['🤳', 'Liveness & face match', !!s.identity, s.identity ? 'passed' : ''],
      ['🗂️', 'CKYC registry', !!s.ckyc, s.ckyc ? (s.ckyc.found ? 'record matched' : 'new record created') : ''],
      ['📈', 'Credit bureau check', !!s.bureau, s.bureau ? (b.thinFile ? 'new to credit' : 'CIBIL ' + b.score) : ''],
      ['🏦', 'Income verified (AA)', !!s.income, s.income ? inr(inc.monthlyIncome) + '/mo' : ''],
      ['💸', 'Bank account verified', !!s.account, s.account ? 'penny-drop · name match' : ''],
      ['✅', 'Credit limit decided', !!s.decision, s.decision ? (d.decision === 'approve' ? inr(d.limit) + ' approved' : 'secured-card path') : ''],
      ['✍️', 'Agreement e-signed', !!s.signed, s.signed ? 'Aadhaar eSign' : ''],
      ['🎉', 'Card issued', !!s.issued, s.issued ? 'virtual card live' : ''],
      ['📦', 'Card delivered to you', deliveredAll, deliveryNowLabel()],
    ];
    const rows = raw.map(([icon, label, done, detail]) => ({ icon, label, status: done ? 'done' : 'todo', detail }));
    const firstTodo = rows.findIndex((r) => r.status === 'todo');
    if (firstTodo >= 0 && !s.done) rows[firstTodo].status = 'now';
    return rows;
  }
  function trackerRow(r) {
    const mark = r.status === 'done' ? '✓' : (r.status === 'now' ? '●' : '○');
    return `<div class="trk-item trk-item--${r.status}">
      <span class="trk-item__dot">${mark}</span>
      <span class="trk-item__ic">${r.icon}</span>
      <span class="trk-item__lb">${esc(r.label)}</span>
      <span class="trk-item__dt">${esc(r.detail)}</span>
    </div>`;
  }
  function renderTracker() {
    const host = $('#trackerBody'); if (!host) return;
    const rows = trackerData();
    const done = rows.filter((r) => r.status === 'done').length;
    const status = C.appStatus[state.stage] || 'In progress';
    const id = state.identity || {};
    const captured = state.identity ? `
      <div class="trk-sec"><h4>🔐 Your details on file <span class="muted">· masked &amp; encrypted</span></h4>
        <div class="trk-kv">
          ${kvRow('Name', id.name)}
          ${kvRow('Date of birth', id.dob)}
          ${kvRow('PAN', (state.pan || '').toUpperCase())}
          ${kvRow('Aadhaar', (id.aadhaarMasked || '') + ' (masked)')}
          ${kvRow('Mobile', state.mobile ? '+91 •••••' + state.mobile.slice(-4) : '—')}
          ${kvRow('Email', id.email)}
          ${kvRow('Address', id.currentAddress || id.address)}
        </div>
        <p class="muted trk-rev">Your full Aadhaar is never stored — only a masked, vaulted reference. <a href="#" data-action="why" data-why="kyc">How I protect this</a></p>
      </div>` : `<div class="trk-sec"><p class="muted">Your verified details will appear here the moment KYC is done — masked and encrypted, visible only to you.</p></div>`;
    host.innerHTML = `
      <div class="trk-hero">
        <div class="trk-hero__ref">Application <strong>${esc(state.appRef || '')}</strong></div>
        <div class="trk-hero__status"><span class="appbar__live"></span> ${esc(status)}</div>
        <div class="trk-prog"><span style="width:${Math.round((done / rows.length) * 100)}%"></span></div>
        <div class="trk-hero__meta">${done}/${rows.length} checks complete · 🏅 ${missionDone()}/${MISSION.length} milestones</div>
      </div>
      <div class="trk-sec"><h4>🏅 Your milestones</h4>${missionRail()}</div>
      <div class="trk-sec"><h4>✅ What I’ve verified for you</h4>
        <div class="trk-list">${rows.map(trackerRow).join('')}</div>
      </div>
      ${captured}
      <p class="trk-foot">🔒 Everything is encrypted and used only for this application, under RBI &amp; DPDP rules. You can revoke any consent at any time.</p>`;
  }

  /* ---------- shared render fragments ---------- */
  function stageHead(key) {
    const s = C.stageByKey[key];
    return `<div class="stage-head"><span class="stage-head__icon">${s.icon}</span>
      <h2 class="stage-head__title">${esc(s.headline)}</h2>
      <p class="stage-head__sub">${esc(s.sub)}</p></div>`;
  }
  function kvRow(k, v) { return `<div class="kv"><span class="kv__k">${esc(k)}</span><span class="kv__v">${esc(v || '—')}</span></div>`; }
  function afBadge(label) { return `<span class="af">✨ ${esc(label || 'auto-filled')}</span>`; }
  function docRow(d) { return `<div class="doc"><span class="doc__name">${esc(d.name)}</span><span class="doc__via">${esc(d.via)}</span><span class="doc__status">✓ ${esc(d.status)}</span></div>`; }
  function viaLabel(v) { return ({ digilocker: 'via DigiLocker', aadhaar: 'via Aadhaar e-KYC', ocr: 'from your uploaded documents (OCR)', vcip: 'via Video-KYC (V-CIP)' })[v] || 'via DigiLocker'; }
  function kycAadhaar() {
    return `<div class="panel">
      <button class="linkback" data-action="kyc-chooser">← Other methods</button>
      <h3 class="sub-h">📱 Aadhaar OTP e-KYC</h3>
      <p class="muted">UIDAI sends an OTP to the mobile linked to your Aadhaar; I then fetch your e-KYC.</p>
      <label class="fld"><span class="fld__label">Aadhaar number</span>
        <input id="aadhaar" class="fld__input fld__input--mono" inputmode="numeric" maxlength="12" placeholder="1234 5678 9012" /></label>
      <div id="aadhaarOtpRow" hidden><label class="fld"><span class="fld__label">OTP <span class="muted">(demo: any 6 digits)</span></span>
        <input id="aadhaarOtp" class="fld__input" inputmode="numeric" maxlength="6" placeholder="••••••" /></label></div>
      <button class="btn btn--primary btn--block" id="aadhaarCta" data-action="aadhaar-otp">Send OTP →</button>
    </div>`;
  }
  function kycOcr() {
    const o = state.ocr || {};
    const tile = (doc, label) => `<button class="ocr-tile ${o[doc] ? 'is-done' : ''}" data-action="ocr-upload" data-doc="${doc}">
      <span class="ocr-tile__ic">${o[doc] ? '✓' : '📷'}</span><strong>${esc(label)}</strong><small>${o[doc] ? 'Captured' : 'Tap to capture / upload'}</small></button>`;
    return `<div class="panel">
      <button class="linkback" data-action="kyc-chooser">← Other methods</button>
      <h3 class="sub-h">📄 Upload your documents</h3>
      <p class="muted">${esc(C.brand.agentName)} reads them automatically with OCR — no typing.</p>
      <div class="ocr-grid">${tile('aadhaar', 'Aadhaar')}${tile('pan', 'PAN')}</div>
      <button class="btn btn--primary btn--block" data-action="ocr-extract" ${(o.aadhaar && o.pan) ? '' : 'disabled'}>Extract with AI (OCR) →</button>
      <p class="trust">In this demo, tapping a tile simulates a capture; real OCR reads the actual image.</p>
    </div>`;
  }
  // shown ONLY when the auto face-match falls short — escalates to a human V-CIP officer
  function kycVcipEscalation() {
    const pct = state.face ? Math.round((state.face.faceMatchScore || 0.88) * 100) : 88;
    return `<div class="panel liveness">
      <h3 class="sub-h">🎥 A quick video-KYC will confirm it’s you</h3>
      <p class="muted">Your selfie matched your Aadhaar photo at <strong>${pct}%</strong> — close, but just under our auto-approve threshold. So RBI lets us confirm it with a <strong>short video call</strong> with an Axis KYC officer. This only happens when a check needs it.</p>
      <div class="vcip-card">
        <div class="vcip-card__row"><span>⏱</span> About a minute</div>
        <div class="vcip-card__row"><span>🔒</span> Recorded &amp; encrypted (RBI V-CIP)</div>
        <div class="vcip-card__row"><span>📍</span> Geo-tagged · live in India</div>
        <div class="vcip-card__row"><span>🪪</span> Keep your original PAN handy</div>
      </div>
      <button class="btn btn--primary btn--block" data-action="vcip-start">Start my video-KYC →</button>
      <button class="btn btn--ghost btn--block" data-action="vcip-schedule">Schedule for later</button>
    </div>`;
  }
  function kycVcip() {
    return `<div class="panel">
      <button class="linkback" data-action="kyc-chooser">← Other methods</button>
      <h3 class="sub-h">🎥 Video KYC (V-CIP)</h3>
      <p class="muted">A short, secure video call with a trained Axis KYC officer — RBI-approved <strong>full KYC from home</strong>, in about 5 minutes. Best if DigiLocker or Aadhaar e-KYC isn’t available to you.</p>
      <div class="vcip">
        <div class="vcip__tile vcip__tile--agent"><span class="vcip__face">👩‍💼</span><span class="vcip__lb">Priya · Axis KYC Officer</span><span class="vcip__live">● online now</span></div>
        <div class="vcip__tile vcip__tile--self"><span class="vcip__face">🙂</span><span class="vcip__lb">You</span></div>
      </div>
      <div class="vcip__meta">
        <div class="vcip__meta-item"><span>⏱️</span><div><strong>~5 min</strong><small>average call</small></div></div>
        <div class="vcip__meta-item"><span>🔒</span><div><strong>Recorded &amp; encrypted</strong><small>RBI V-CIP norms</small></div></div>
        <div class="vcip__meta-item"><span>📍</span><div><strong>Geo-tagged · India</strong><small>live location</small></div></div>
      </div>
      <div class="vcip__cols">
        <div class="vcip__col">
          <div class="vcip__col-h">✅ Keep ready</div>
          <ul class="vcip__reqs">
            <li>Your <strong>original PAN</strong> in hand</li>
            <li>A <strong>well-lit</strong>, quiet spot</li>
            <li>Allow <strong>camera, mic &amp; location</strong></li>
            <li>Be ready to sign on a blank sheet</li>
          </ul>
        </div>
        <div class="vcip__col">
          <div class="vcip__col-h">📋 What the officer does</div>
          <ol class="vcip__steps">
            <li>Confirms you’re live (a random question)</li>
            <li>Captures your PAN &amp; face for a match</li>
            <li>Verifies your Aadhaar details with you</li>
            <li>Records &amp; geo-tags the session — done</li>
          </ol>
        </div>
      </div>
      <button class="btn btn--primary btn--block" data-action="vcip-start">Connect to an officer now →</button>
      <button class="btn btn--ghost btn--block" data-action="vcip-schedule">Schedule a slot for later</button>
      <p class="trust">No branch visit needed — V-CIP is accepted as full KYC under the RBI KYC Master Direction.</p>
    </div>`;
  }
  // the agent-driven default: DigiLocker already linked off the verified mobile
  // RBI liveness + face-match: a quick live selfie, shown as its own screen
  // a neutral mock human face (no camera icon, no initials) — used in the selfie frame
  function faceMock(cls) {
    return `<svg viewBox="0 0 80 80" class="facemock ${cls || ''}" aria-hidden="true">
      <circle cx="40" cy="32" r="13.5" fill="#caa9b7"/>
      <path d="M17 70 C17 55 28 49 40 49 C52 49 63 55 63 70 Z" fill="#caa9b7"/>
    </svg>`;
  }
  function kycLiveness() {
    if (!state.selfieTaken) {
      // STEP 1 — actually TAKE the selfie first (camera viewfinder with a live face)
      return `<div class="panel liveness">
        <h3 class="sub-h">🤳 Take a quick selfie</h3>
        <p class="muted">RBI needs a live photo to confirm it’s really you. Look at the camera and capture — I’ll match it to your Aadhaar photo next.</p>
        <div class="selfie-stage">
          <div class="selfie-cam">
            <span class="selfie-cam__scan"></span>
            ${faceMock('facemock--live')}
            <span class="selfie-cam__corner selfie-cam__corner--tl"></span><span class="selfie-cam__corner selfie-cam__corner--tr"></span>
            <span class="selfie-cam__corner selfie-cam__corner--bl"></span><span class="selfie-cam__corner selfie-cam__corner--br"></span>
          </div>
          <span class="selfie-cam__hint">● Live · position your face in the frame</span>
        </div>
        <button class="btn btn--primary btn--block" data-action="liveness-snap">📸 Capture my selfie</button>
        <p class="trust">🔒 Good light, face in frame. Encrypted, used only to match your ID — never shared.</p>
      </div>`;
    }
    // STEP 2 — selfie captured → NOW match it to the already-fetched Aadhaar photo
    return `<div class="panel liveness">
      <h3 class="sub-h">🤝 Match your selfie to your Aadhaar photo</h3>
      <p class="muted">Got your selfie ✓. Now I’ll check it against the <strong>Aadhaar photo</strong> I already fetched — a quick RBI liveness + face match.</p>
      <div class="live-match">
        <div class="live-match__col"><div class="live-match__pic live-match__pic--id">${faceMock()}</div><span>Aadhaar photo ✓</span></div>
        <span class="live-match__vs">↔</span>
        <div class="live-match__col"><div class="live-match__pic live-match__pic--selfie">${faceMock('facemock--live')}<span class="selfie-tick">✓</span></div><span>Your selfie ✓</span></div>
      </div>
      <button class="btn btn--primary btn--block" data-action="liveness-capture">Match my face →</button>
      <p class="trust">🔒 Liveness anti-spoof + face match. Encrypted, never shared.</p>
    </div>`;
  }
  /* THE agentic moment: Aria fills the whole application herself, field by field,
   * each one tagged with the verified source it came from. The customer types nothing. */
  const VIA_SRC = { digilocker: 'DigiLocker', aadhaar: 'UIDAI e-KYC', ocr: 'Document OCR', vcip: 'V-CIP' };
  function kycAutofill() {
    const id = state.identity || {};
    const src = VIA_SRC[state.kycVia] || 'DigiLocker';
    const rows = [
      ['Full name', id.name, src],
      ['Date of birth', id.dob, src],
      ['Gender', id.gender, src],
      ['Father’s name', id.fatherName, src],
      ['PAN', (state.pan || '').toUpperCase(), 'Protean (NSDL)'],
      ['Email', id.email, src],
      ['Aadhaar (masked)', id.aadhaarMasked || '', src],
      ['Current address', id.currentAddress || id.address, src],
      ['Permanent address', id.permanentAddress || id.address, src],
    ];
    const html = stageHead('kyc') + `
      <div class="kyc-card autofill">
        <div class="autofill__head">
          <span class="autofill__avatar aria-orb">${ariaImg()}</span>
          <div class="autofill__head-tx"><strong>${esc(C.brand.agentName)} is filling your application</strong>
            <small>Reading your verified ${esc(src)} records — you won’t type a thing.</small></div>
          <span class="autofill__count"><b id="afCount">0</b>/${rows.length}</span>
        </div>
        <div class="af-rows" id="afRows">
          ${rows.map((r, i) => `<div class="af-row" data-i="${i}">
            <span class="af-row__k">${esc(r[0])}</span>
            <span class="af-row__v"><span class="af-row__cursor"></span><span class="af-row__txt"></span></span>
            <span class="af-row__src" hidden>↳ ${esc(r[2])}</span>
          </div>`).join('')}
        </div>
        <div class="af-foot" id="afFoot" hidden>✓ Every field filled from your verified KYC — nothing typed, nothing assumed.</div>
      </div>`;
    const mount = async () => {
      for (let i = 0; i < rows.length; i++) {
        const row = $(`.af-row[data-i="${i}"]`); if (!row) return; // navigated away
        row.classList.add('is-filling');
        await INT.delay(300);
        const t = $('.af-row__txt', row); if (t) t.textContent = rows[i][1] || '—';
        const s = $('.af-row__src', row); if (s) s.hidden = false;
        row.classList.remove('is-filling'); row.classList.add('is-filled');
        const c = $('#afCount'); if (c) c.textContent = String(i + 1);
        await INT.delay(180);
      }
      const foot = $('#afFoot'); if (foot) foot.hidden = false;
      await INT.delay(1100);
      state.autofillDone = true; save();
      if (state.stage === 'kyc') renderStage(); // → review + confirm screen
    };
    return { html, mount };
  }
  function kycDigiLocker() {
    const docs = C.digiLockerDocs || [];
    const dlm = state.dlMobile || state.mobile || '';
    const same = dlm === state.mobile;
    return `<div class="panel">
      <button class="linkback" data-action="kyc-chooser">← Choose a different method</button>
      <div class="dl-link">
        <div class="dl__head"><span class="dl__brand">🔐 DigiLocker</span><span class="dl__gov">Government of India · MeitY</span></div>
        <p class="dl-link__lead">DigiLocker fetches your documents from the mobile that’s <strong>linked to your Aadhaar</strong>. Confirm that number, give consent, and I’ll open DigiLocker, <strong>fetch &amp; verify</strong> these documents — <strong>PAN included</strong> — and show you each one as it arrives.</p>
        <label class="fld">
          <span class="fld__label">📱 Mobile linked to your DigiLocker / Aadhaar</span>
          <div class="fld__inrow">
            <span class="fld__prefix">+91</span>
            <input id="dlMobile" class="fld__input" inputmode="numeric" maxlength="10" placeholder="10-digit Aadhaar-linked number" value="${esc(dlm)}" />
          </div>
          <span class="fld__hint">${same ? 'Same as the number you verified ✓ — leave it as is if your Aadhaar is on this number.' : 'DigiLocker will send a one-time link here.'}</span>
        </label>
        <div class="sec-label">📄 Documents I’ll fetch from DigiLocker</div>
        <div class="dl__docs">${docs.map((d) => `<div class="dl__doc"><div><strong>${esc(d.name)}</strong><div class="muted">${esc(d.issuer)} · ${esc(d.purpose)}</div></div><span class="dl__chk">consent</span></div>`).join('')}</div>
        <label class="consent"><input type="checkbox" id="consentKyc" checked/><span>I consent to share these issued documents with Axis Bank for this application (DPDP Act). You can revoke this in DigiLocker anytime. <a href="#" data-action="why" data-why="kyc">Why?</a></span></label>
      </div>
      ${state.dlOtpSent ? `
        <div class="dl-otp">
          <p class="dl-otp__note">📲 DigiLocker sent a one-time passcode to your Aadhaar-linked mobile ••••${esc((state.dlMobile || state.mobile || '').slice(-2))}. Enter it to authorise the fetch.</p>
          <label class="fld"><span class="fld__label">DigiLocker OTP <span class="muted">(demo: any 6 digits)</span></span>
            <input id="dlOtp" class="fld__input fld__input--mono" inputmode="numeric" maxlength="6" placeholder="••••••" /></label>
        </div>
        <button class="btn btn--primary btn--block" data-action="dl-verify-otp">Verify OTP &amp; fetch my documents →</button>
      ` : `
        <button class="btn btn--primary btn--block" data-action="dl-allow">Allow &amp; send me a DigiLocker OTP →</button>
      `}
      ${trustWhy('kyc')}
      <p class="trust">🪪 Your Aadhaar stays masked &amp; vaulted — we never store it in full. I verify everything before filling your form.</p>
    </div>`;
  }
  function kycChooser() {
    const methods = [
      { id: 'digilocker', icon: '🔐', title: 'DigiLocker auto-fetch', time: '~30 sec', need: 'Aadhaar-linked mobile', reco: true,
        desc: 'I fetch your Aadhaar &amp; PAN straight from the Govt. DigiLocker — nothing to type or upload.' },
      { id: 'aadhaar', icon: '📱', title: 'Aadhaar OTP e-KYC', time: '~1 min', need: 'Aadhaar-linked mobile',
        desc: 'Enter your Aadhaar, verify a UIDAI OTP, and I pull your e-KYC.' },
      { id: 'ocr', icon: '📄', title: 'Upload documents (OCR)', time: '~2 min', need: 'Photos of Aadhaar &amp; PAN',
        desc: 'Snap or upload your Aadhaar &amp; PAN — AI reads the details for you to confirm. No DigiLocker needed.' },
    ];
    return `<div class="panel">
      ${relationshipBanner()}
      <p class="ask">Choose how to verify <span class="muted">— all are RBI-approved e-KYC. ${esc(C.brand.agentName)} suggests DigiLocker for speed.</span></p>
      <div class="kyc-methods">
        ${methods.map((m) => `<button class="kyc-method ${m.reco ? 'kyc-method--reco' : ''}" data-action="kyc-method" data-method="${m.id}">
          <span class="kyc-method__ic">${m.icon}</span>
          <span class="kyc-method__b">
            <strong>${esc(m.title)}</strong>
            <small>${m.desc}</small>
            <span class="kyc-method__meta">⏱ ${esc(m.time)} · need: ${m.need}</span>
          </span>
          <span class="kyc-method__pick">${m.reco ? esc(C.brand.agentName) + '’s pick' : 'Choose →'}</span>
        </button>`).join('')}
      </div>
      <div class="vcip-note">🎥 <strong>Video-KYC (V-CIP)</strong> isn’t needed up-front. If a check ever needs a human to confirm it, I’ll switch you to a quick video call with an Axis officer — <strong>only when required</strong>.</div>
      ${trustRow()}
      <p class="trust">🔒 Whichever you pick, I <strong>verify before I fill anything</strong>, your Aadhaar stays masked &amp; vaulted, and you confirm every detail.</p>
    </div>`;
  }
  function metric(big, small) { return `<div class="metric"><strong>${esc(big)}</strong><span>${esc(small)}</span></div>`; }
  function actionTile(icon, label, action, cta) {
    return `<button class="tile" data-action="${action}"><span class="tile__ic">${icon}</span><span class="tile__lb">${esc(label)}</span><span class="tile__cta">${esc(cta)}</span></button>`;
  }
  function cardSwatch(card) {
    const [a, b] = card.color || ['#97144D', '#5E0C30'];
    return `background:linear-gradient(135deg,${a},${b})`;
  }
  // real Axis Bank logo (loads live in the customer's browser; removes itself if blocked)
  function cardLogo() {
    if (!C.brand.logo) return '';
    const fb = (C.brand.logoFallback) || '';
    return `<img class="card-face__logo" src="${esc(C.brand.logo)}" alt="Axis Bank" data-fb="${esc(fb)}" onerror="if(this.dataset.done){this.remove()}else{this.dataset.done=1;this.src=this.dataset.fb||''}"/>`;
  }
  // optional official card artwork — drop a URL or local path into a card's `image` field
  function cardArt(card) { return card.image ? `<img class="card-face__full${card.portrait ? ' card-face__full--fit' : ''}" src="${esc(card.image)}" alt="${esc(card.name)}" onerror="this.remove()"/>` : ''; }
  // a real-credit-card layout: AXIS BANK wordmark + logo, chip, contactless, structured name, network
  function cardFace(card, sm) {
    return `<div class="card-face ${sm ? 'card-face--sm' : ''}" style="${cardSwatch(card)}">
      ${cardArt(card)}
      <div class="card-face__top"><span class="card-face__bank">AXIS BANK</span>${cardLogo()}</div>
      <span class="card-face__chip"></span><span class="card-face__wave" aria-hidden="true"></span>
      <div class="card-face__id">
        <span class="card-face__name">${esc(card.shortName || card.name)}</span>
        ${sm ? '' : `<span class="card-face__seg">${esc(card.segment)}</span>`}
      </div>
      <div class="card-face__foot"><span class="card-face__type">CREDIT CARD</span><span class="card-face__net">${esc(card.network)}</span></div>
    </div>`;
  }
  function cardHero(card, reason, recommended) {
    return `<div class="card-hero">
      ${recommended ? `<span class="card-hero__badge">✨ ${C.brand.agentName}’s pick for you</span>` : ''}
      ${cardFace(card)}
      <div class="card-hero__body">
        <div class="card-hero__seg">${esc(card.segment)}</div>
        <p class="card-hero__reason">${esc(reason)}</p>
        <ul class="card-hero__rewards">${card.bestFor.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <div class="card-hero__fee">${card.annualFee ? inr(card.annualFee) + ' annual fee' : 'Lifetime free'} · <span class="muted">${esc(card.feeWaiver)}</span></div>
        ${cardDetails(card)}
        <button class="btn btn--primary btn--block" data-action="choose-card" data-card="${card.id}">Choose this card →</button>
      </div>
    </div>`;
  }
  function cardMini(card, choose) {
    return `<div class="card-mini">
      ${cardFace(card, true)}
      <div class="card-mini__seg">${esc(card.segment)}</div>
      <div class="card-mini__tag">${esc(card.bestFor[0])}</div>
      <div class="card-mini__fee">${card.annualFee ? inr(card.annualFee) + '/yr' : 'Lifetime free'}</div>
      <button class="btn btn--ghost btn--sm btn--block" data-action="choose-card" data-card="${card.id}">Choose</button>
    </div>`;
  }
  function virtualCardVisual(card, v) {
    // show the REAL card photo with a live badge + masked last-4 overlaid.
    // Portrait cards (Burgundy/Reserve) get a portrait frame so the whole card shows.
    if (card.image) {
      const port = card.portrait ? ' vcard--portrait' : '';
      return `<div class="vcard vcard--real${port}">
        <img class="vcard__art" src="${esc(card.image)}" alt="${esc(card.name)}" onerror="this.closest('.vcard').classList.remove('vcard--real'); this.remove();"/>
        <span class="vcard__badge">● VIRTUAL · LIVE</span>
        <span class="vcard__last4">•••• ${esc(v.last4 || '0000')} · exp ${esc(v.expiry || '••/••')}</span>
      </div>`;
    }
    return `<div class="vcard" style="${cardSwatch(card)}">
      ${cardLogo()}
      <div class="vcard__top"><span>AXIS BANK</span><span class="vcard__live">● VIRTUAL CREDIT CARD · LIVE</span></div>
      <div class="vcard__num">•••• •••• •••• ${esc(v.last4 || '0000')}</div>
      <div class="vcard__bot">
        <div><small>CARDMEMBER</small><div>${esc(v.name || 'CARDMEMBER')}</div></div>
        <div><small>EXPIRES</small><div>${esc(v.expiry || '••/••')}</div></div>
        <div class="vcard__net">${esc(v.network || 'Visa')}</div>
      </div>
    </div>`;
  }
  function kfs(d, card) {
    return `<div class="kfs">
      <div class="kfs__title">📄 Key Fact Statement</div>
      ${kvRow('Credit limit', inr(d.limit))}
      ${kvRow('Annual percentage rate', (d.apr || 42) + '% p.a. on revolving balances')}
      ${kvRow('Annual fee', card.annualFee ? inr(card.annualFee) + ' · ' + card.feeWaiver : 'Lifetime free')}
      ${kvRow('Interest-free period', 'Up to 50 days (if paid in full)')}
    </div>`;
  }
  function mitcAccordion(open) {
    return `<details class="mitc" ${open ? 'open' : ''}>
      <summary>📜 Most Important Terms &amp; Conditions</summary>
      <div class="mitc__body">${C.legal.mitc.map((m) => `<div class="kv"><span class="kv__k">${esc(m.label)}</span><span class="kv__v">${esc(m.value)}</span></div>`).join('')}</div>
    </details>`;
  }

  /* ---- trust layer: shown wherever the agent automates something sensitive -- */
  const shortName = (c) => c.name.replace('Axis Bank ', '').replace(' Credit Card', '');
  function trustRow() {
    return `<div class="trust-row">${C.trust.promises.map((p) =>
      `<span class="trust-row__item"><span class="trust-row__ic">${p.icon}</span>${esc(p.t)}</span>`).join('')}</div>`;
  }
  function trustWhy(key) {
    const w = C.trust.why[key]; if (!w) return '';
    return `<details class="why-safe"><summary>🛡️ Why this is safe — and what I do with your data</summary>
      <p>${esc(w)}</p></details>`;
  }
  /* full card details — surfaced on the recommendation and the offer */
  function cardDetails(card) {
    return `<details class="card-det"><summary>📖 See full card details &amp; eligibility</summary>
      <div class="card-det__body">
        <div class="sec-label">All benefits</div>
        <ul class="card-det__list">${card.highlights.map((h) => `<li>✦ ${esc(h)}</li>`).join('')}</ul>
        <div class="sec-label">The essentials</div>
        <div class="card-det__kv">
          ${kvRow('Annual fee', card.annualFee ? inr(card.annualFee) : 'Lifetime free')}
          ${kvRow('Fee waiver', card.feeWaiver)}
          ${kvRow('Rewards earned in', card.rewardUnit)}
          ${kvRow('Card network', card.network)}
          ${kvRow('Best for', card.bestFor.join(' · '))}
          ${kvRow('Who it suits', card.minIncomeHint)}
        </div>
      </div></details>`;
  }
  /* transparent explanation of how the credit limit was derived */
  function limitExplainer(d, b, inc) {
    const score = (b && b.score) || d.score;
    const monthly = inc && inc.monthlyIncome;
    let band = 'a responsible multiple of your income';
    if (score >= 760) band = '≈ 3× monthly income (CIBIL 760+)';
    else if (score >= 720) band = '≈ 2× monthly income (CIBIL 720–759)';
    else if (score >= 690) band = '≈ 1.2× monthly income (CIBIL 690–719)';
    const grade = score >= 760 ? 'Excellent' : score >= 720 ? 'Very good' : score >= 690 ? 'Good' : '—';
    const foir = inc && inc.foir != null ? Math.round(inc.foir * 100) + '%' : null;
    return `<details class="limit-why"><summary>📐 How I arrived at your ${inr(d.limit)} limit</summary>
      <div class="limit-why__body">
        <div class="lw-row"><span>${esc(score ? 'CIBIL score · ' + score : 'Credit profile')}</span><b>${esc(grade)}</b></div>
        ${monthly ? `<div class="lw-row"><span>Verified monthly income</span><b>${inr(monthly)}</b></div>` : ''}
        ${foir ? `<div class="lw-row"><span>Current obligations (FOIR)</span><b>${foir} · comfortable</b></div>` : ''}
        <div class="lw-row"><span>Policy band applied</span><b>${esc(band)}</b></div>
        <div class="lw-row lw-row--out"><span>Your approved limit</span><b>${inr(d.limit)}</b></div>
        <p class="muted">I kept it within a safe FOIR so repayments stay affordable. Build a clean repayment record and I can raise it later — you can also request a lower limit if you prefer.</p>
      </div></details>`;
  }

  /* ---- NTB / ETB relationship banner (the agent's decision, surfaced) ------- */
  function relationshipBanner() {
    const r = state.relationship && C.relationship[state.relationship];
    if (!r) return '';
    return `<div class="rel rel--${state.relationship}">
      <span class="rel__badge">${r.icon} ${esc(r.tag)} · ${r.code}</span>
      <p class="rel__line">${r.line}</p>
    </div>`;
  }

  /* ---- spend optimisation, top merchants & setup motivation ----------------- */
  const CAT_LABEL = { shopping: '🛍️ Shopping', travel: '✈️ Travel', bills: '🧾 Bills', food: '🍽️ Food & dining', entertainment: '🎬 Movies & OTT', cabs: '🚕 Cabs' };
  // per-category yearly earnings on THIS card for the customer's stated budget
  function spendBreakdown(card) {
    const r = card.rewards || {}; const base = r.other != null ? r.other : 0.01;
    return SPEND_CATS.filter((c) => c !== 'other').map((cat) => {
      const spend = Math.max(0, Number(state.budget[cat]) || 0);
      const rate = r[cat] != null ? r[cat] : base;
      return { cat, monthly: spend, earn: Math.round(Math.min(spend, CAP_PER_CAT) * rate * 12) };
    }).filter((x) => x.monthly > 0 && x.earn > 0).sort((a, b) => b.earn - a.earn);
  }
  // "how this card optimises YOUR spend" — shown during onboarding (on the offer)
  function spendOptimizer(card) {
    const rows = spendBreakdown(card).slice(0, 3);
    if (!rows.length) return '';
    const total = spendBreakdown(card).reduce((s, x) => s + x.earn, 0);
    return `<div class="optimize">
      <div class="sec-label">📈 How your ${esc(card.shortName)} optimises <em>your</em> spend</div>
      ${rows.map((r) => `<div class="opt-row"><span class="opt-row__c">${CAT_LABEL[r.cat] || r.cat}</span><span class="opt-row__s muted">${inr(r.monthly)}/mo</span><b class="opt-row__e">+${inr(r.earn)}/yr</b></div>`).join('')}
      <div class="opt-total">Your estimated rewards <strong>≈ ${inr(total)}/year</strong> — real money back on what you already spend.</div>
    </div>`;
  }
  // top merchants where this card saves the most — shown once the card is live
  function topMerchants(card) {
    const ms = (C.cardMerchants && C.cardMerchants[card.id]) || [];
    if (!ms.length) return '';
    return `<div class="merchants">
      <div class="sec-label">🏷️ Top places you’ll save with this card</div>
      <div class="merch-grid">${ms.map((x) => `<div class="merch"><span class="merch__i">${x.i}</span><div class="merch__b"><strong>${esc(x.m)}</strong><span>${esc(x.s)}</span></div></div>`).join('')}</div>
    </div>`;
  }
  // educational "get the most from your card" tips — builds trust & savvy
  function cardTipsBox(card) {
    const tips = (C.cardTips && C.cardTips[card.id]) || [];
    if (!tips.length) return '';
    return `<div class="tips">
      <div class="sec-label">💡 Get the most from your ${esc(card.shortName)}</div>
      <ul class="tips__list">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>`;
  }
  // the virtual card is usable online immediately, everywhere Visa is accepted
  function onlineUseBox() {
    const ms = ['Amazon', 'Flipkart', 'Swiggy', 'Netflix', 'Myntra', 'Uber', 'BookMyShow', 'MakeMyTrip'];
    return `<div class="onlineuse">
      <div class="sec-label">🛒 Use your virtual card online — right now</div>
      <p class="muted onlineuse__p">Your full 16-digit virtual card works on every site &amp; app that accepts Visa — shop instantly while your physical card ships.</p>
      <div class="onlineuse__row">${ms.map((m) => `<span class="onlineuse__chip">${esc(m)}</span>`).join('')}</div>
    </div>`;
  }
  // motivation to finish PIN / wallet / autopay set-up (progress, not arcade points)
  function setupProgress() {
    const items = [state._pinSet, state._walletAdded, state.autopay];
    const done = items.filter(Boolean).length;
    return `<div class="setupbar ${done === 3 ? 'is-complete' : ''}">
      <div class="setupbar__top"><strong>${done === 3 ? '🎉 Card fully set up' : 'Finish setting up your card'}</strong><span class="setupbar__count">${done}/3</span></div>
      <div class="setupbar__track"><span style="width:${Math.round(done / 3 * 100)}%"></span></div>
      <p class="muted setupbar__note">${done === 3 ? 'All set — PIN, wallet &amp; autopay done. You’re ready to spend smart.' : 'Do all three: a PIN to pay anywhere, your wallet for tap-to-pay, autopay so you never miss a due date.'}</p>
    </div>`;
  }

  /* ---- budget-aware value model: the agent computes the best-value card ----- */
  const SPEND_CATS = ['shopping', 'travel', 'bills', 'food', 'entertainment', 'cabs', 'other'];
  const CAP_PER_CAT = 15000; // monthly accelerated-spend cap, keeps estimates realistic
  function estimateAnnualValue(card, budget) {
    const r = card.rewards || {}; const base = r.other != null ? r.other : 0.01;
    let monthly = 0;
    SPEND_CATS.forEach((cat) => {
      const spend = Math.max(0, Number(budget[cat]) || 0);
      const rate = r[cat] != null ? r[cat] : base;
      monthly += Math.min(spend, CAP_PER_CAT) * rate + Math.max(0, spend - CAP_PER_CAT) * base;
    });
    return Math.round(monthly * 12);
  }
  // fee waived when the customer's ANNUAL spend meets the card's waiver threshold
  function effectiveFee(card, annualSpend) {
    const w = card.feeWaiverSpend || 0;
    return (w && annualSpend >= w) ? 0 : (card.annualFee || 0);
  }
  function rankByValue(budget) {
    const annualSpend = SPEND_CATS.reduce((s, k) => s + (Number(budget[k]) || 0), 0) * 12;
    // only recommend cards within the fee the customer said they're happy to pay
    let pool = C.cards.filter((c) => !c.secured);
    const feeCap = Math.max(1000, Number(state.feeBudget) || 0); // near-free cards always considered
    pool = pool.filter((c) => (c.annualFee || 0) <= feeCap);
    const ranked = pool.map((c) => {
      const gross = estimateAnnualValue(c, budget);
      const fee = effectiveFee(c, annualSpend);
      const perk = state.okWithFees ? (c.perkValue || 0) : 0; // premium perks count only when paying for them
      return { card: c, gross, fee, perk, net: gross - fee, total: gross + perk, annualFee: c.annualFee || 0, waived: (c.annualFee || 0) > 0 && fee === 0 };
    });
    // happy to pay a fee → rank by rewards + perk value (total); otherwise by honest net value
    const key = state.okWithFees ? 'total' : 'net';
    return ranked.sort((a, b) => b[key] - a[key]);
  }
  const budgetTotal = () => SPEND_CATS.reduce((s, k) => s + (Number(state.budget[k]) || 0), 0);

  /* ---- gamification (proper): milestone progress tied to verified steps ------ */
  function missionState(key) {
    const cur = stageIndex(state.stage);
    const mi = stageIndex(key);
    if (state.done || (mi >= 0 && cur > mi)) return 'done';
    if (cur === mi) return 'now';
    return 'todo';
  }
  const missionDone = () => MISSION.filter((m) => missionState(m.key) === 'done').length;
  function missionRail() {
    return `<div class="mrail">${MISSION.map((m, i) => {
      const st = missionState(m.key);
      return `${i ? '<span class="mrail__link"></span>' : ''}<div class="mrail__item mrail__item--${st}" title="${esc(m.name)}">
        <span class="mrail__ic">${st === 'todo' ? '🔒' : m.icon}</span>
        <span class="mrail__nm">${esc(m.name)}</span>
      </div>`;
    }).join('')}</div>`;
  }
  function levelInfo() {
    const size = (C.gamify && C.gamify.levelSize) || 60;
    const pts = state.points || 0;
    const idx = Math.min(Math.floor(pts / size), C.gamify.levels.length - 1);
    const atTop = idx >= C.gamify.levels.length - 1;
    return { idx, name: C.gamify.levels[idx], size, atTop,
      pct: atTop ? 100 : Math.round(((pts - idx * size) / size) * 100),
      toNext: atTop ? 0 : (idx + 1) * size - pts, nextName: atTop ? '' : C.gamify.levels[idx + 1] };
  }
  function downloadAppCta() {
    const a = (C.brand.appLinks) || {};
    return `<div class="getapp">
      <div class="getapp__head"><span class="getapp__logo">A</span>
        <div><strong>Don’t have the Axis Mobile app?</strong><span class="muted">Manage your new card, set spend controls, pay bills &amp; track rewards — all in one app.</span></div></div>
      <div class="getapp__btns">
        <a class="store-btn" href="${esc(a.ios)}" target="_blank" rel="noopener"><span class="store-btn__ic"></span><span class="store-btn__tx"><small>Download on the</small><b>App Store</b></span></a>
        <a class="store-btn" href="${esc(a.android)}" target="_blank" rel="noopener"><span class="store-btn__ic">▶</span><span class="store-btn__tx"><small>GET IT ON</small><b>Google Play</b></span></a>
      </div>
    </div>`;
  }

  /* The agent-led spine: Aria leads every step in the first person — what she's
   * about to do, the decision she's making, and the regulatory reason — so the
   * journey reads as an AI agent running the onboarding, not a form wizard. */
  function agentLead() {
    const s = state.stage, card = currentCard();
    let msg = '', plan = '';
    if (s === 'start') {
      const pa = state.preApproved;
      if (state.otpSent) {
        msg = `I’ve sent a 6-digit code to your phone. Pop it in and I’ll confirm it’s you — then I’ll take it from here.`;
      } else {
        msg = (pa && pa.preApproved)
          ? `I recognised your existing Axis relationship and a <strong>pre-approved offer up to ${inr(pa.indicativeLimit)}</strong> — I’ve fast-tracked you. Let’s verify it’s you and pick your card.`
          : `I’m <strong>${esc(C.brand.agentName)}</strong> — I’ll do this application <em>for</em> you. Just your mobile number to start; I’ll handle the rest and explain each step as I go.`;
        plan = `<div class="agent-lead__plan"><span>My plan for you</span><ol>${C.agentPlan.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>`;
      }
    } else if (s === 'product') {
      msg = state._rec
        ? `I ran your monthly spend through <strong>every</strong> Axis card’s reward structure and ranked them by real rupee value. Here’s the winner for your budget — and the maths behind it.`
        : `Tell me roughly what you spend each month. I’ll compute the actual rewards <strong>you’d</strong> earn on every Axis card and recommend the highest-value one for your budget — not a generic “best card”. First card? I’ll keep you to one that builds your score.`;
    } else if (s === 'kyc') {
      const rl = state.relationship && C.relationship[state.relationship];
      const m = state.kycMethod;
      if (!state.identity) {
        if (!m || m === 'chooser') msg = `${rl ? rl.line + ' ' : ''}<strong>How would you like to prove it’s you?</strong> Your pick — I verify first, then fill your form. Nothing’s assumed.`;
        else if (m === 'digilocker') msg = `Good pick. Confirm the mobile linked to your Aadhaar, give consent, and I’ll open DigiLocker and <strong>fetch each document in front of you</strong>, verify it, then fill your form. You stay in control.`;
        else if (m === 'aadhaar') msg = `Enter your Aadhaar number; UIDAI sends an OTP to your Aadhaar-linked mobile. I verify that first, then fetch your e-KYC — nothing is filled until it’s verified.`;
        else if (m === 'ocr') msg = `Upload or snap your Aadhaar and PAN and I’ll read them with OCR for you to check — handy if you don’t use DigiLocker. I validate them before anything is saved.`;
        else if (m === 'vcip') msg = `A short, secure video call with an Axis KYC officer completes your full KYC from home — RBI-approved, no branch visit. I’ll get you connected and guide you through it.`;
      } else if (!state.livenessDone) {
        msg = `Documents verified ✓. One quick RBI step before I fill anything — a live selfie matched to your Aadhaar photo, to confirm it’s really you.`;
      } else if (!state.autofillDone) {
        msg = `That’s you ✓. Now watch — I’m filling your entire Axis application <strong>for you</strong>, straight from your verified ${esc(VIA_SRC[state.kycVia] || 'DigiLocker')} records. You won’t type a thing.`;
      } else { const ck = state.ckyc && state.ckyc.found; msg = `Done — I verified your Aadhaar, validated your PAN${ck ? ', matched your CKYC record' : ''} and your face <em>first</em>, then filled everything from those verified sources. Have a quick look and confirm.`; }
    } else if (s === 'assessment') {
      msg = state.assessmentDone
        ? `Eligibility checked — I’m putting your personalised offer together now.`
        : `With your consent (CIC Act), I’ll check your credit, and verify income <strong>the way you choose</strong> — your PAN/ITR, or a bank statement you pick and approve. No bank shares anything on its own. New to credit? I’ll switch you to a secured-card path, never a dead end.`;
    } else if (s === 'decision') {
      const d = state.decision || {}, b = state.bureau || {}, inc = state.income || {};
      msg = (d.decision === 'approve')
        ? `On ${b.score ? `a CIBIL score of ${b.score}` : 'your profile'}${inc.monthlyIncome ? ` and verified income of ${inr(inc.monthlyIncome)}/mo` : ''}, I’ve approved <strong>${inr(d.limit)}</strong> — comfortably within a safe FOIR for you. Your Key Fact Statement is below.`
        : `You’re new to credit, so rather than decline I’ve set you up with a <strong>secured card</strong> against an Axis Fixed Deposit — no income proof, and it builds your score. No dead ends with me.`;
    } else if (s === 'agreement') {
      msg = `Almost there. RBI requires your <strong>explicit consent</strong> to issue a card — please review the terms, accept, and e-sign, and I’ll create your account.`;
    } else if (s === 'issuance') {
      msg = `I’m issuing your ${card ? esc(card.name.replace('Axis Bank ', '').replace(' Credit Card', '')) : 'card'} now — an instant virtual card to use right away, with the physical card dispatched to you.`;
    } else if (s === 'welcome') {
      msg = `All done — welcome to Axis! I’ve issued your card and I’m tracking its delivery to your door. I’ll text you each update.`;
    }
    if (!msg) return { html: '', msg: '' };
    const html = `<div class="agent-lead">
      <span class="agent-lead__avatar aria-orb">${ariaImg()}</span>
      <div class="agent-lead__body">
        <div class="agent-lead__name">${esc(C.brand.agentName)} · ${esc(C.brand.agentRole)} <span class="agent-lead__live"></span></div>
        <p class="agent-lead__msg">${msg}</p>
        ${plan}
      </div>
    </div>`;
    return { html, msg };
  }

  /* best-in-class: move the stage's main CTA into a fixed bottom action bar on
   * phones, so the primary action is always one thumb-tap away — no scroll-hunting.
   * (Moves, not clones, so there are never duplicate ids or handlers.) */
  function pinPrimaryCta(root) {
    const bar = $('#actionbar'); if (!bar) return;
    bar.innerHTML = ''; bar.classList.remove('is-on'); document.body.classList.remove('has-actionbar');
    if (!window.matchMedia || !window.matchMedia('(max-width: 760px)').matches) return;
    const primaries = $$('.btn--primary.btn--block', root);
    if (!primaries.length) return;
    const inner = document.createElement('div'); inner.className = 'actionbar__inner';
    inner.appendChild(primaries[primaries.length - 1]);
    bar.appendChild(inner);
    bar.classList.add('is-on'); document.body.classList.add('has-actionbar');
  }

  /* render the active stage into #stageRoot */
  function renderStage() {
    const root = $('#stageRoot');
    let renderer = R[state.stage];
    if (state.stage === 'product' && state._browsing) renderer = R._browse;
    const out = renderer ? renderer() : { html: '' };
    const lead = agentLead();
    root.innerHTML = lead.html + out.html;
    root.classList.remove('is-in'); void root.offsetWidth; root.classList.add('is-in'); // iOS-style stage transition
    pinPrimaryCta(root); // always-reachable CTA in a fixed bottom bar (phones)
    if (out.mount) out.mount();
    // the co-pilot is for SUPPORT, not a transcript — refresh its contextual FAQ chips
    refreshCopilotFaqs();
    // gate the e-sign button on consent
    const ci = $('#consentIssue'); if (ci) ci.addEventListener('change', () => { $('#signCta').disabled = !ci.checked; });
  }

  /* ===================================================================== *
   *  ACTION HANDLERS (event delegation)
   * ===================================================================== */
  async function onAction(action, el, ev) {
    switch (action) {
      case 'start': setStage('start'); break;
      case 'restart': clearSave(); _lastLead = ''; if (INT.resetIdentity) INT.resetIdentity(); state = fresh(); setStage('landing'); break;
      case 'resume': setStage(state.stage === 'landing' ? 'start' : state.stage); break;
      case 'home': if (state.done || confirmLeave()) { /* stay */ } break;
      case 'back': prevStage(); break;
      case 'why': toast(C.nudges.why[el.dataset.why] || 'We only ask for what we genuinely need.'); break;
      case 'channel': openChannelSwitch(); break;

      /* stage 1 */
      case 'send-otp': await sendOtp(); break;
      case 'verify-otp': await verifyOtp(); break;
      case 'otp-change': state.otpSent = false; save(); renderStage(); break;
      case 'otp-eye': { const o = $('#otp'); if (o) { const show = o.type === 'password'; o.type = show ? 'text' : 'password'; el.textContent = show ? '🙈' : '👁️'; el.setAttribute('aria-label', show ? 'Hide OTP' : 'Show OTP'); o.focus(); } } break;

      /* stage 2 */
      case 'toggle-tag': toggleTag(el.dataset.tag); break;
      case 'set-emp': state.profile.employment = el.dataset.emp; save(); renderStage(); break;
      case 'set-fees': state.okWithFees = el.dataset.fees === '1'; state._rec = null; state.valueRank = null; save(); renderStage(); break;
      case 'recommend': await doRecommend(); break;
      case 'browse': state._browsing = true; renderStage(); break;
      case 'back-rec': state._browsing = false; renderStage(); break;
      case 'reprofile': state._rec = null; state.valueRank = null; save(); renderStage(); break;
      case 'choose-card': chooseCard(el.dataset.card); break;

      /* stage 3 */
      case 'kyc-method': chooseKycMethod(el.dataset.method); break;
      case 'kyc-back': kycBack(); break;
      case 'kyc-chooser': state.kycMethod = 'chooser'; state.dlOtpSent = false; save(); renderStage(); break;
      case 'aadhaar-otp': await aadhaarOtp(); break;
      case 'aadhaar-verify': await aadhaarVerify(); break;
      case 'ocr-upload': ocrUpload(el.dataset.doc); break;
      case 'ocr-extract': await ocrExtract(); break;
      case 'vcip-start': await vcipEscalate(); break;
      case 'vcip-schedule': toast('We’ll text you a secure link to pick a V-CIP slot (simulated). Your progress is saved.', 'success'); break;
      case 'dl-allow': await dlAllow(); break;
      case 'dl-verify-otp': await dlVerifyOtp(); break;
      case 'liveness-snap': state.selfieTaken = true; save(); renderStage(); toast('📸 Selfie captured.', 'success'); break;
      case 'liveness-capture': await livenessCapture(); break;
      case 'dl-deny': dlDeny(); break;
      case 'confirm-kyc': applyKycEdits(); state.kycComplete = true; save(); toast('✓ Details confirmed.', 'success'); nextStage(); break;

      /* stage 4 */
      case 'income-method': state.incomeMethod = el.dataset.m; save(); renderStage(); break;
      case 'aa-bank': state.aaBank = el.dataset.bank; save(); renderStage(); break;
      case 'run-assessment': await runAssessment(); break;
      case 'to-decision': nextStage(); break;

      /* stage 5 */
      case 'accept-offer': nextStage(); break;
      case 'choose-secured':
        state.cardId = 'insta-easy';
        state.decision = INT.underwrite({ card: C.cardById['insta-easy'] });
        save(); nextStage(); break;

      /* stage 6 */
      case 'esign': await doEsign(); break;

      /* stage 7 */
      case 'set-pin': state.issueScreen = 'pin'; save(); renderStage(); break;
      case 'pin-save': { const a = ($('#pin1') || {}).value || '', b = ($('#pin2') || {}).value || ''; if (!/^\d{4}$/.test(a)) { toast('Enter a 4-digit PIN.', 'error'); return; } if (a !== b) { toast('PINs don’t match.', 'error'); return; } state._pinSet = true; state.issueScreen = null; save(); renderStage(); toast('✓ Card PIN set securely.', 'success'); } break;
      case 'add-wallet': state.issueScreen = 'wallet'; save(); renderStage(); break;
      case 'wallet-add': state._walletAdded = true; state.pushProvisioned = true; state.issueScreen = null; save(); renderStage(); toast('✓ Pushed to ' + (el.dataset.wallet === 'apay' ? 'Apple Pay' : 'Google Pay') + ' via Visa — your real number was never shared.', 'success'); break;
      case 'autopay': state.issueScreen = 'autopay'; save(); renderStage(); break;
      case 'coft': state.issueScreen = 'coft'; save(); renderStage(); break;
      case 'coft-save': await cardOnFileSave(); break;
      case 'autopay-bank': if ($('#napAcct')) state.napAcct = $('#napAcct').value; if ($('#napIfsc')) state.napIfsc = $('#napIfsc').value; state.autopayBank = el.dataset.bank; save(); renderStage(); break;
      case 'nach-mode': state.napMode = el.dataset.mode; if ($('#napAcct')) state.napAcct = $('#napAcct').value; if ($('#napIfsc')) state.napIfsc = $('#napIfsc').value; save(); renderStage(); break;
      case 'autopay-amt': $$('[data-action="autopay-amt"]').forEach((b) => b.classList.toggle('is-on', b === el)); state._autopayAmt = el.dataset.amt; save(); break;
      case 'autopay-save': {
        if (!state.autopayBank) { toast('Pick the bank to pay from.', 'error'); return; }
        const acct = ($('#napAcct') ? $('#napAcct').value : '').replace(/\s/g, '');
        const ifsc = ($('#napIfsc') ? $('#napIfsc').value : '').toUpperCase().trim();
        if (!/^\d{8,18}$/.test(acct)) { toast('Enter a valid bank account number (8–18 digits).', 'error'); return; }
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) { toast('Enter a valid 11-character IFSC (e.g. HDFC0001234).', 'error'); return; }
        if ($('#autopayConsent') && !$('#autopayConsent').checked) { toast('Please authorise the mandate to continue.', 'error'); return; }
        state.napAcct = acct; state.napIfsc = ifsc; save();
        await setupAutopay(); state.issueScreen = null; renderStage();
      } break;
      case 'issue-back': state.issueScreen = null; save(); renderStage(); break;
      case 'to-welcome': nextStage(); break;
      case 'scratch': if (!state.scratched) { state.scratched = true; save(); renderStage(); confettiBurst(); } break;

      /* co-pilot */
      case 'copilot-open': openCopilot(); break;
      case 'copilot-close': $('#copilot').classList.remove('is-open'); break;
      case 'faq-ask': openCopilot(); sendChat(el.dataset.q); break;

      /* customer tracker */
      case 'tracker-open': $('#tracker').classList.add('is-open'); renderTracker(); track('tracker_open', { stage: state.stage }); break;
      case 'tracker-close': $('#tracker').classList.remove('is-open'); break;

      /* blueprint */
      case 'blueprint-open': toggleBlueprint(true); break;
      case 'blueprint-close': toggleBlueprint(false); break;
      case 'blueprint-tab': setBlueprintTab(el.dataset.tab); break;

      /* exit-intent */
      case 'exit-stay': $('#exitModal').hidden = true; break;
      case 'exit-save': await saveAndSend(); break;
      case 'channel-pick': toast('We’ll continue you on ' + el.dataset.ch + ' (simulated). Your progress is saved.', 'success'); $('#exitModal').hidden = true; break;
    }
    if (ev) ev.preventDefault();
  }

  /* ---- stage 1 logic ---- */
  async function sendOtp() {
    const m = ($('#mobile').value || '').replace(/\D/g, '');
    if (m.length !== 10) { toast('Please enter a valid 10-digit mobile number.', 'error'); return; }
    if (!$('#consentStart').checked) { toast('Please give consent to continue.', 'error'); return; }
    state.mobile = m;
    const btn = $('#startCta'); if (btn) { btn.disabled = true; btn.textContent = 'Sending OTP…'; }
    await INT.sendOtp(m);
    state.otpSent = true; save();
    renderStage();                 // re-render → number+consent block is gone, OTP entry shown
    const o = $('#otp'); if (o) o.focus();
    track('otp_sent', { mobile: '••••' + m.slice(-4) });
  }
  async function verifyOtp() {
    const otp = ($('#otp').value || '').replace(/\D/g, '');
    if (otp.length < 4) { toast('Enter the 6-digit OTP (any digits in this demo).', 'error'); return; }
    const btn = $('#startCta'); btn.disabled = true; btn.textContent = 'Verifying…';
    await INT.verifyOtp(state.mobile, otp);
    state.otpVerified = true;
    // agentic moment: Aria confirms you and DECIDES whether you're new (NTB) or existing (ETB)
    const res = await runAgent('Verifying you with Axis Bank', [
      { id: 'otp', icon: '📲', label: 'Confirming your mobile number (OTP)', fn: () => INT.delay(500), tag: () => 'verified' },
      { id: 'lookup', icon: '🔎', label: 'Checking Axis records for an existing relationship', fn: () => INT.checkPreApproved(state.mobile), tag: (r) => r.preApproved ? 'existing customer' : 'new to bank' },
    ]);
    const pa = res.lookup || { preApproved: false };
    state.preApproved = pa;
    state.relationship = pa.preApproved ? 'etb' : 'ntb';
    state.dlMobile = state.mobile; // default the DigiLocker-linked number to the verified mobile
    if (pa.preApproved && !state.pan) state.pan = synthPan();
    save();
    if (pa.preApproved) toast(`🎉 You’re an existing Axis customer — pre-approved up to ${inr(pa.indicativeLimit)}!`, 'success');
    else toast('✓ Verified — you’re New to Axis. I’ll onboard you end-to-end.', 'success');
    track('otp_verified', { preApproved: pa.preApproved, relationship: state.relationship });
    nextStage();
  }

  /* ---- stage 2 logic ---- */
  function toggleTag(tag) {
    const t = state.profile.tags;
    const i = t.indexOf(tag);
    if (i >= 0) { t.splice(i, 1); state.budget[tag] = 0; }
    else { t.push(tag); if (!Number(state.budget[tag])) state.budget[tag] = 8000; }
    save();
    renderStage(); // reveal/hide the category's amount slider
  }
  async function doRecommend() {
    if (budgetTotal() <= 0) { toast('Set at least one spend amount so I can compare cards by value.', 'error'); return; }
    const ranked = await withAgentThinking('Weighing every Axis card’s rewards & fees against your budget', async () => {
      await INT.delay(800);
      return rankByValue(state.budget);
    });
    state.valueRank = ranked.slice(0, 4).map((x) => ({ id: x.card.id, gross: x.gross, net: x.net, perk: x.perk, total: x.total, fee: x.fee, annualFee: x.annualFee, waived: x.waived }));
    const top = ranked[0];
    const feeBit = top.annualFee === 0 ? ' And it’s lifetime-free.'
      : top.fee === 0 ? ` Its ${inr(top.annualFee)} fee is waived at your spend level.`
      : ` That’s after its ${inr(top.annualFee)} annual fee — which you said you’re happy to pay for the perks.`;
    const perkBit = (state.okWithFees && top.perk) ? ` including ≈ ${inr(top.perk)} of lounge, concierge &amp; travel perks` : '';
    const headline = state.okWithFees
      ? `gives you the most rewards &amp; perks — about ${inr(top.total)} a year${perkBit}`
      : `gives you the most net value — about ${inr(top.net)} a year`;
    const reason = `For how you spend (~${inr(budgetTotal())}/month), the ${top.card.shortName} ${headline}.${feeBit} That’s why I recommend it.`;
    state._rec = { card: top.card, reason, source: 'budget-value' };
    save();
    renderStage();
    const topVal = state.okWithFees ? top.total : top.net;
    aria(`I weighed every Axis card’s rewards <em>and</em> fees against your ${inr(budgetTotal())}/month spend. The <strong>${esc(top.card.name)}</strong> gives you the most value — ≈ ${inr(topVal)}/year${state.okWithFees && top.perk ? ' (incl. lounge &amp; travel perks)' : ''}.`, true);
    track('reco_made', { card: top.card.id, source: 'budget-value' });
  }
  function chooseCard(id) {
    state.cardId = id; state._browsing = false; save();
    track('card_chosen', { card: id });
    nextStage();
  }

  /* ---- stage 3 logic ---- */
  // the agent drives DigiLocker by default; the customer can still switch method
  function chooseKycMethod(method) {
    track('kyc_method', { method });
    state.kycMethod = method; state.dlOtpSent = false; save(); renderStage();
  }
  function kycBack() { state.kycMethod = null; state.dlOtpSent = false; save(); renderStage(); }
  async function aadhaarOtp() {
    const a = ($('#aadhaar').value || '').replace(/\D/g, '');
    if (a.length !== 12) { toast('Enter your 12-digit Aadhaar number.', 'error'); return; }
    const btn = $('#aadhaarCta'); btn.disabled = true; btn.textContent = 'Sending OTP…';
    await INT.aadhaarSendOtp(a);
    $('#aadhaarOtpRow').hidden = false; $('#aadhaarOtp').focus();
    btn.disabled = false; btn.textContent = 'Verify & fetch e-KYC →'; btn.dataset.action = 'aadhaar-verify';
  }
  async function aadhaarVerify() {
    const o = ($('#aadhaarOtp').value || '').replace(/\D/g, '');
    if (o.length < 4) { toast('Enter the 6-digit OTP (any digits in this demo).', 'error'); return; }
    await INT.aadhaarVerifyOtp();
    await runKycFetch('aadhaar');
  }
  function ocrUpload(doc) { state.ocr = state.ocr || {}; state.ocr[doc] = true; save(); renderStage(); }
  async function ocrExtract() {
    if (!(state.ocr && state.ocr.aadhaar && state.ocr.pan)) { toast('Capture both documents first.', 'error'); return; }
    await runKycFetch('ocr');
  }
  async function vcipStart() { await runKycFetch('vcip'); }

  /* DigiLocker-style consent handshake — how documents are really fetched. */
  function showDigiLockerConsent() {
    const docs = C.digiLockerDocs || [];
    $('#dlModal').innerHTML = `
      <div class="modal__backdrop" data-action="dl-deny"></div>
      <div class="modal__panel dl">
        <div class="dl__head">
          <span class="dl__brand">🔐 DigiLocker</span>
          <span class="dl__gov">Government of India · MeitY</span>
        </div>
        <p class="dl__lead"><strong>Axis Bank</strong> is requesting access to your DigiLocker documents to complete your KYC:</p>
        <div class="dl__docs">
          ${docs.map((d) => `<div class="dl__doc"><div><strong>${esc(d.name)}</strong><div class="muted">${esc(d.issuer)} · ${esc(d.purpose)}</div></div><span class="dl__chk">✓</span></div>`).join('')}
        </div>
        <p class="dl__consent">By allowing, you consent to share these issued documents with Axis Bank for this credit-card application (DPDP Act). You can revoke access anytime in DigiLocker.</p>
        <button class="btn btn--primary btn--block" data-action="dl-allow">Allow access &amp; auto-fill →</button>
        <button class="btn btn--ghost btn--block" data-action="dl-deny">Not now</button>
        <p class="dl__sim">Simulated consent screen — in production this is a secure OAuth redirect to digilocker.gov.in.</p>
      </div>`;
    $('#dlModal').hidden = false;
    track('digilocker_consent_shown', {});
  }
  async function dlAllow() {
    if ($('#consentKyc') && !$('#consentKyc').checked) { toast('Please consent to share your documents.', 'error'); return; }
    const fld = $('#dlMobile');
    const dlm = fld ? (fld.value || '').replace(/\D/g, '') : (state.dlMobile || state.mobile);
    if (fld && dlm.length !== 10) { toast('Enter the 10-digit mobile linked to your Aadhaar.', 'error'); return; }
    state.dlMobile = dlm || state.mobile;
    await INT.aadhaarSendOtp(state.dlMobile); // DigiLocker authenticates via an OTP to the Aadhaar-linked mobile
    state.dlOtpSent = true; save(); renderStage();
    toast('DigiLocker sent an OTP to your Aadhaar-linked mobile.', 'success');
  }
  async function dlVerifyOtp() {
    const otp = ($('#dlOtp') ? $('#dlOtp').value : '').replace(/\D/g, '');
    if (otp.length < 4) { toast('Enter the 6-digit DigiLocker OTP (any digits in this demo).', 'error'); return; }
    await INT.aadhaarVerifyOtp();
    await runKycFetch('digilocker');
  }
  async function livenessCapture() {
    const res = await runAgent('Liveness check & face match', [
      { id: 'cap', icon: '📸', label: 'Capturing your live selfie', fn: () => INT.delay(900), tag: () => 'captured' },
      { id: 'live', icon: '👁️', label: 'Liveness check (anti-spoof)', fn: () => INT.delay(900), tag: () => 'live ✓' },
      { id: 'match', icon: '🤝', label: 'Matching your face to your verified ID', fn: () => INT.livenessFaceMatch(), tag: (r) => 'match ' + Math.round((r.faceMatchScore || 0.95) * 100) + '%' },
    ]);
    state.face = res.match;
    const score = (res.match && res.match.faceMatchScore) || 0.95;
    if (score < 0.90) {
      // close, but under our auto-match threshold → RBI lets us confirm via a quick V-CIP
      state.needsVcip = true; save();
      renderStage();
      toast('Almost — your match was just under threshold. A 1-min video-KYC will confirm it.', '');
    } else {
      state.livenessDone = true; save();
      renderStage();
      toast('✓ Liveness confirmed — face matched your ID.', 'success');
    }
  }
  /* V-CIP — triggered ONLY when an e-KYC check needs a human to confirm it */
  async function vcipEscalate() {
    await runAgent('Your live Video-KYC (V-CIP)', [
      { id: 'connect', icon: '🔗', label: 'Connecting you to an Axis KYC officer', fn: () => INT.delay(1100), tag: () => 'connected' },
      { id: 'verify', icon: '🎥', label: 'Officer confirming your identity & liveness on video', fn: () => INT.vcipSession(), tag: () => 'verified' },
      { id: 'geo', icon: '📍', label: 'Geo-tagging & recording the session (RBI V-CIP)', fn: () => INT.delay(700), tag: () => 'India ✓' },
    ]);
    state.vcipDone = true; state.livenessDone = true; state.vcip = true; save();
    renderStage();
    toast('✓ Video-KYC complete — identity confirmed.', 'success');
  }
  function dlDeny() {
    $('#dlModal').hidden = true;
    toast('No problem — you can complete KYC by video (V-CIP) or at a branch.');
    openChannelSwitch();
  }
  // PAN is read from whatever source the agent pulled (DigiLocker/OCR/etc.) — no typing
  function panFrom(res) {
    return (res.dl && res.dl.pan) || (res.ocr && res.ocr.pan) || (res.aadhaar && res.aadhaar.pan) || (res.cap && res.cap.pan) || state.pan || '';
  }
  function kycSteps(method) {
    const panStep = { id: 'pan', icon: '🪪', label: 'Validating PAN with Protean (NSDL)', fn: (res) => INT.verifyPan(panFrom(res)), tag: (r) => r.ok ? 'PAN valid' : 'check PAN' };
    const ckyc = { id: 'ckyc', icon: '🗂️', label: 'Cross-checking the CKYC registry (CERSAI)', fn: (res) => INT.ckycPull(panFrom(res)), tag: (r) => r.found ? 'CKYC found' : 'new CKYC' };
    const face = { id: 'face', icon: '🤳', label: 'Liveness check & face match', fn: () => INT.livenessFaceMatch(), tag: (r) => 'match ' + Math.round(r.faceMatchScore * 100) + '%' };
    if (method === 'ocr') return [{ id: 'ocr', icon: '📄', label: 'Reading your documents with AI (OCR)', fn: () => INT.ocrFetch(), tag: (r) => r.documents ? r.documents.length + ' docs read' : 'read' }, panStep, ckyc, face];
    if (method === 'aadhaar') return [{ id: 'aadhaar', icon: '📱', label: 'Fetching Aadhaar e-KYC from UIDAI', fn: () => INT.aadhaarOtpEkyc(), tag: () => 'e-KYC ok' }, panStep, ckyc, face];
    if (method === 'vcip') return [
      { id: 'connect', icon: '🔗', label: 'Connecting you to an Axis KYC officer', fn: () => INT.delay(1100).then(() => ({ simulated: true })), tag: () => 'connected' },
      { id: 'cap', icon: '🎥', label: 'Officer capturing your identity & geo-tag', fn: () => INT.digiLockerFetch(), tag: () => 'captured' },
      panStep, face,
      { id: 'vcip', icon: '✅', label: 'Completing V-CIP', fn: () => INT.vcipSession(), tag: () => 'V-CIP done' },
      ckyc,
    ];
    // DEFAULT digilocker: clear, narrated linking sequence driven by the Aadhaar-linked mobile
    const last4 = (state.dlMobile || state.mobile || '').slice(-4);
    return [
      { id: 'open', icon: '🔐', label: 'Opening DigiLocker (Govt. of India · MeitY)', fn: () => INT.delay(700), tag: () => 'secure' },
      { id: 'otp', icon: '📲', label: `Verifying your Aadhaar-linked mobile ••••${last4}`, fn: () => INT.delay(950), tag: () => 'matched' },
      { id: 'consent', icon: '🤝', label: 'Linking DigiLocker to Axis (one-time consent)', fn: () => INT.digiLockerConsent(), tag: () => 'linked' },
      { id: 'dl', icon: '📥', label: 'Fetching your issued documents', fn: () => INT.digiLockerFetch(), tag: (r) => r.documents ? r.documents.length + ' docs' : 'fetched' },
      panStep, ckyc, face,
    ];
  }
  async function runKycFetch(method) {
    const titles = { digilocker: 'Linking DigiLocker to your mobile', aadhaar: 'Verifying via Aadhaar e-KYC', ocr: 'Reading & verifying your documents', vcip: 'Your live Video-KYC (V-CIP)' };
    const res = await runAgent(titles[method] || 'Verifying your identity', kycSteps(method));
    state.identity = res.dl || res.ocr || res.aadhaar || res.cap;
    state.pan = panFrom(res);
    state.ckyc = res.ckyc;
    state.vcip = method === 'vcip';
    state.dlLinked = method === 'digilocker';
    state.kycVia = method;
    state.livenessDone = method === 'vcip'; // V-CIP confirms liveness live; others do a selfie next
    save();
    renderStage();
    toast('✓ Documents verified — now a quick liveness selfie.', 'success');
    track('kyc_done', { method, ckyc: state.ckyc && state.ckyc.found });
  }

  /* ---- stage 4 logic ---- */
  async function runAssessment() {
    if (!$('#consentBureau').checked) { toast('Bureau consent is required to assess eligibility.', 'error'); return; }
    const viaAa = state.incomeMethod === 'aa';
    if (viaAa && !state.aaBank) { toast('Pick which bank account I should read for income.', 'error'); return; }
    const bank = AA_BANKS.find((b) => b.id === state.aaBank);
    // income comes from the customer's CHOSEN source — never an automatic bank pull
    const incomeStep = viaAa
      ? { id: 'inc', icon: '🏦', label: `Reading your ${bank ? bank.name : 'bank'} statement via Account Aggregator (your consent)`, fn: () => INT.accountAggregator(state.profile), tag: (r) => inr(r.monthlyIncome) + '/mo' }
      : { id: 'inc', icon: '🧾', label: 'Fetching income from your ITR via PAN (Income-Tax records)', fn: () => INT.incomeFromPan(state.pan, state.profile), tag: (r) => inr(r.monthlyIncome) + '/mo' };
    const res = await runAgent('Checking your eligibility', [
      { id: 'bureau', icon: '📈', label: 'Fetching your credit bureau record (with consent)', fn: () => INT.bureauPull(state.profile), tag: (r) => r.thinFile ? 'new to credit' : 'CIBIL ' + r.score },
      incomeStep,
      { id: 'aml', icon: '🛡️', label: 'AML / sanctions / PEP screening', fn: () => INT.amlScreen(), tag: () => 'clear' },
      { id: 'fraud', icon: '🔍', label: 'Fraud & device intelligence', fn: () => INT.fraudCheck(), tag: () => 'low risk' },
    ]);
    state.bureau = res.bureau;
    state.income = res.inc;
    state.assessmentDone = true;
    state.decision = INT.underwrite({
      card: currentCard(), bureau: state.bureau, income: state.income, employment: state.profile.employment,
    });
    save();
    renderStage();
    toast('✓ Eligibility checked — preparing your offer.', 'success');
    track('assessment_done', { decision: state.decision.decision });
    // automation: advance to the offer automatically once eligibility is ready
    setTimeout(() => { if (state.stage === 'assessment') nextStage(); }, 1800);
  }

  /* ---- stage 6 logic ---- */
  async function doEsign() {
    if (!$('#consentIssue').checked) { toast('Please give explicit consent to issue the card.', 'error'); return; }
    await runAgent('Completing your e-signature', [
      { id: 'esign', icon: '✍️', label: 'Generating agreement & Aadhaar eSign (OTP)', fn: () => INT.eSign(), tag: (r) => r.ref },
    ]);
    state.signed = true; save();
    toast('✓ Agreement signed.', 'success');
    track('esigned', {});
    nextStage();
  }

  /* ---- stage 7 logic ---- */
  async function setupAutopay() {
    const bank = AA_BANKS.find((b) => b.id === state.autopayBank);
    const mode = state.napMode === 'upi' ? 'UPI Autopay' : 'e-NACH';
    const last4 = (state.napAcct || '').slice(-4);
    await runAgent('Setting up autopay', [
      { id: 'penny', icon: '💸', label: `Verifying your ${bank ? bank.name : 'bank'} account ••••${last4} (penny-drop)`, fn: () => INT.pennyDrop(bank ? bank.name : ''), tag: (r) => r.nameMatch + ' match' },
      { id: 'mandate', icon: '🔁', label: `Registering your NPCI ${mode} mandate (works cross-bank)`, fn: () => INT.enachSetup(), tag: () => 'mandate active' },
    ]);
    state.account = { bank: (bank ? bank.name : 'your bank') + ' · A/C ••••' + last4, mode, ifsc: state.napIfsc }; // verified debit account
    state.autopay = true; save();
    toast('✓ Autopay active — ' + mode + ' mandate on your ' + (bank ? bank.name : 'bank') + ' ••••' + last4 + '.', 'success');
    renderStage();
  }

  /* a lightweight "thinking" overlay for quick AI calls (recommendation) */
  async function withAgentThinking(title, fn) {
    const ov = $('#agentOverlay');
    $('#agentTitle').textContent = title;
    $('#agentName').textContent = C.brand.agentName + ' is thinking';
    $('#agentSteps').innerHTML = `<li class="ax-step is-active"><span class="ax-step__ic">✨</span><span class="ax-step__tx">Comparing Axis cards against how you spend…</span><span class="ax-step__work"><i></i><i></i><i></i></span></li>`;
    $('#agentBar').style.width = '40%';
    ov.hidden = false; cycleFacts();
    let res;
    try { res = await fn(); } finally {
      $('#agentBar').style.width = '100%';
      await INT.delay(500);
      ov.hidden = true; clearInterval(factTimer);
    }
    return res;
  }

  /* ===================================================================== *
   *  CO-PILOT (chat with Aria)
   * ===================================================================== */
  // contextual support questions per stage — the co-pilot is a help desk, not a transcript
  const STAGE_FAQS = {
    landing: ['How does this work?', 'Is my data safe?', 'What documents do I need?'],
    start: ['Why do you need my mobile number?', 'Is my data safe?', 'How long does this take?'],
    kyc: ['What is DigiLocker?', 'Which documents do you fetch?', 'Is my Aadhaar safe?', 'Can I edit my details?'],
    product: ['Which card suits me?', 'How are annual fees waived?', 'Can I change cards later?'],
    assessment: ['Why check my credit score?', 'How is my income verified?', 'Will this hurt my score?'],
    decision: ['How was my limit decided?', 'What are the charges?', 'Is there a cooling-off period?'],
    agreement: ['What is the cooling-off period?', 'What are the key fees?'],
    issuance: ['How do I use it online now?', 'What is push provisioning?', 'How does autopay work?'],
    welcome: ['How do I earn the most rewards?', 'When will my card arrive?'],
  };
  // instant, accurate answers (work offline) for the common questions
  const FAQ_ANSWERS = [
    [/digilocker/i, 'DigiLocker is the Government of India’s secure document wallet. With your consent I fetch your <strong>e-Aadhaar (identity, address, photo)</strong> and your <strong>PAN verification record</strong> from it — issued copies, legally valid, and you can revoke access anytime.'],
    [/which doc|what doc|documents do you/i, 'For a credit card I fetch just three: <strong>e-Aadhaar</strong> (identity, address, photo), your <strong>PAN verification record</strong> (name match with the Income-Tax dept), and a <strong>photograph</strong> for the face match. That’s all KYC needs.'],
    [/aadhaar.*safe|safe.*aadhaar|data safe|my data/i, 'Your Aadhaar number is <strong>masked</strong> and stored in a secure Aadhaar Vault — never in plain text. Everything is encrypted, used only for this application, and shared strictly with your consent (DPDP Act). You can revoke access anytime.'],
    [/edit|change my detail|correct/i, 'Yes — on the review screen tap <strong>Edit</strong> on any field to correct what was fetched before you confirm. Nothing is submitted until you’re happy with it.'],
    [/mobile number|phone number/i, 'Your mobile verifies it’s really you (RBI/TRAI) and is where I’ll send your OTP and progress updates. It’s not shared for marketing without your consent.'],
    [/how long|how much time|take/i, 'About <strong>6 minutes</strong> end-to-end — I do the heavy lifting (KYC, bureau, income) so you mostly confirm. Your progress saves automatically if you need to pause.'],
    [/which card|best card|suits me|recommend/i, 'Tell me your monthly spends and the fee you’re happy to pay, and I compute the <strong>actual rupee value</strong> each Axis card earns you — then recommend the highest-value one. Not a generic “best card”.'],
    [/fee.*waiv|waiv.*fee|annual fee/i, 'Most fees are <strong>waived</strong> when you cross a yearly spend (e.g. ₹2L on ACE). Premium cards charge a fee for lounges & concierge — I only show those if you tell me you’re happy to pay one.'],
    [/credit score|bureau|cibil/i, 'With your explicit consent (CIC Act) I check your credit bureau record once, only to set a <strong>responsible limit</strong>. It’s a soft check for this application — it doesn’t hurt your score.'],
    [/income|salary|verif/i, 'You choose how: via your <strong>PAN → ITR</strong> (Income-Tax records), or by picking a bank and sharing a statement through the RBI <strong>Account Aggregator</strong>. No bank shares anything without your consent.'],
    [/limit|how was.*limit|credit limit/i, 'Your limit is a safe multiple of your verified income, kept within a comfortable FOIR so repayments stay easy. I show exactly how I arrived at it on the offer — and you can request a lower one.'],
    [/cooling.?off|cancel/i, 'After issuance you have a <strong>cooling-off / look-up period</strong> to cancel at no cost (just pro-rata interest on anything spent). RBI requires it — I’ll tell you exactly how, in-app.'],
    [/push provision|google pay|apple pay|wallet/i, 'Push provisioning means one tap adds your card to Google/Apple Pay via the <strong>Visa Token Service</strong> — your real card number is never shared with merchants, just a device token.'],
    [/autopay|nach|e-?mandate/i, 'Autopay sets up an <strong>NPCI e-NACH / UPI-Autopay</strong> mandate from any bank account (not only Axis) so your bill is paid automatically. You authorise it, and can cancel anytime.'],
    [/online|use.*card|merchant/i, 'Your virtual card has a full 16-digit number the moment it’s issued — use it on any site or app that accepts Visa (Amazon, Swiggy, Netflix…) while the physical card ships.'],
    [/reward|earn|cashback/i, 'Put each spend on the card that rewards it most — I list the exact merchants and tips for your card on the welcome screen. Pay in full each month and the rewards are pure gain.'],
    [/arrive|deliver|physical card/i, 'Your physical card is dispatched by courier and usually arrives in a few days — you can track it on the “Your application” screen. The virtual card works instantly meanwhile.'],
    [/how does this work|what is this/i, 'I’m Aria, your AI onboarding agent. I recommend your card, do your KYC, check eligibility with your consent and issue an instant virtual card — about 6 minutes, fully RBI/DPDP-compliant.'],
  ];
  function refreshCopilotFaqs() {
    const wrap = $('#copilotFaqs'); if (!wrap) return;
    const faqs = STAGE_FAQS[state.stage] || STAGE_FAQS.landing;
    wrap.innerHTML = `<span class="copilot__faqs-lb">Tap a question or ask your own</span>` +
      faqs.map((q) => `<button class="faq-chip" data-action="faq-ask" data-q="${esc(q)}">${esc(q)}</button>`).join('');
  }
  function localAnswer(text) {
    for (const [re, ans] of FAQ_ANSWERS) if (re.test(text)) return ans;
    return null;
  }
  function openCopilot() {
    $('#copilot').classList.add('is-open');
    hideNudgeBubble();
    refreshCopilotFaqs();
    $('#copilotInput').focus();
  }
  function aria(html, openIfClosed) {
    appendMsg('agent', html);
    if (openIfClosed && !$('#copilot').classList.contains('is-open')) showNudgeBubble(stripTags(html));
  }
  function appendMsg(who, html) {
    const log = $('#copilotLog');
    const div = document.createElement('div');
    div.className = 'msg msg--' + who;
    div.innerHTML = who === 'agent' ? html : esc(html);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }
  let copilotSeeded = {};
  function seedCopilot(stage) {
    if (copilotSeeded[stage]) return;
    copilotSeeded[stage] = true;
    const s = C.stageByKey[stage];
    if (s && copilotSeeded._any) {
      // brief contextual line on entering a new stage (only after first interaction)
    }
    if (!copilotSeeded._any) {
      copilotSeeded._any = true;
      appendMsg('agent', `Hi, I’m <strong>${C.brand.agentName}</strong> 👋 I’m guiding your application — if you’re ever unsure, ask me anything here, any time. Tap a question below or type your own.`);
    }
  }
  async function sendChat(text) {
    appendMsg('user', text);
    const typing = document.createElement('div');
    typing.className = 'msg msg--agent msg--typing';
    typing.innerHTML = '<i></i><i></i><i></i>';
    $('#copilotLog').appendChild(typing);
    $('#copilotLog').scrollTop = $('#copilotLog').scrollHeight;
    const local = localAnswer(text); // instant, accurate answer to common questions
    let html;
    if (local) { await INT.delay(450); html = local; }
    else { const r = await AGENT.ask(text, { stage: state.stage }); html = esc(r.answer); track('copilot_ask', { stage: state.stage, source: r.source }); }
    typing.remove();
    appendMsg('agent', html);
    if (local) track('copilot_ask', { stage: state.stage, source: 'kb' });
  }

  /* nudge speech-bubble near the launcher */
  function showNudgeBubble(text) {
    const b = $('#copilotNudge');
    b.textContent = text.length > 120 ? text.slice(0, 117) + '…' : text;
    b.hidden = false;
    $('#copilotLauncher').classList.add('is-pulse');
  }
  function hideNudgeBubble() { $('#copilotNudge').hidden = true; $('#copilotLauncher').classList.remove('is-pulse'); }

  /* ===================================================================== *
   *  NUDGES & DROP-OFF RECOVERY
   * ===================================================================== */
  let inactivityTimer = null, nudgeAttempt = 0;
  function armInactivity() {
    clearTimeout(inactivityTimer);
    if (state.stage === 'landing' || state.stage === 'welcome' || state.done) return;
    inactivityTimer = setTimeout(async () => {
      if ($('#copilot').classList.contains('is-open')) return;
      const text = await AGENT.nudge({ stage: state.stage, attempt: nudgeAttempt++ });
      showNudgeBubble(text);
      track('nudge_inactivity', { stage: state.stage, attempt: nudgeAttempt });
    }, 22000);
  }
  function bumpInactivity() { if (state.stage !== 'landing') armInactivity(); }

  let exitShown = false;
  function maybeExitIntent(e) {
    if (exitShown || state.done) return;
    if (state.stage === 'landing' || state.stage === 'welcome') return;
    if (e.clientY > 0) return;
    exitShown = true;
    const n = C.nudges.exitIntent;
    $('#exitModal').innerHTML = exitModalHtml(n);
    $('#exitModal').hidden = false;
    track('exit_intent', { stage: state.stage });
  }
  function exitModalHtml(n) {
    return `<div class="modal__backdrop" data-action="exit-stay"></div>
      <div class="modal__panel">
        <div class="modal__emoji">💾</div>
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.body)}</p>
        <div class="chan">
          ${['WhatsApp', 'SMS', 'Email'].map((c) => `<button class="chan__btn" data-action="channel-pick" data-ch="${c}">${c}</button>`).join('')}
        </div>
        <button class="btn btn--primary btn--block" data-action="exit-save">Save &amp; send me a link</button>
        <button class="btn btn--ghost btn--block" data-action="exit-stay">${esc(n.stay)}</button>
      </div>`;
  }
  async function saveAndSend() {
    await INT.sendResumeLink('WhatsApp');
    save();
    $('#exitModal').hidden = true;
    toast('Saved! We’ve sent you a secure link to continue (simulated).', 'success');
    track('save_resume', { stage: state.stage });
  }
  function openChannelSwitch() {
    aria(esc(C.nudges.channelSwitch), true);
    openCopilot();
    track('channel_switch', { stage: state.stage });
  }
  function confirmLeave() { return true; }

  /* ===================================================================== *
   *  BLUEPRINT DRAWER ("Behind the scenes")
   * ===================================================================== */
  let blueprintTab = 'step';
  const isBlueprintOpen = () => $('#blueprint').classList.contains('is-open');
  function toggleBlueprint(open) {
    $('#blueprint').classList.toggle('is-open', open);
    if (open) renderBlueprint();
  }
  function setBlueprintTab(tab) { blueprintTab = tab; renderBlueprint(); }
  function renderBlueprint() {
    const tabs = `<div class="bp-tabs">
      <button class="bp-tab ${blueprintTab === 'step' ? 'is-on' : ''}" data-action="blueprint-tab" data-tab="step">This step</button>
      <button class="bp-tab ${blueprintTab === 'map' ? 'is-on' : ''}" data-action="blueprint-tab" data-tab="map">Full map</button>
    </div>`;
    $('#blueprintBody').innerHTML = tabs + (blueprintTab === 'step' ? blueprintStep() : blueprintMap());
    $('#blueprintBody').scrollTop = 0;
  }
  function blueprintStep() {
    const key = (state.stage === 'landing') ? 'start' : state.stage;
    const s = C.stageByKey[key];
    if (!s) return '';
    return `
      <div class="bp-stage">${s.icon} <strong>Step ${s.num}: ${esc(s.label)}</strong></div>
      <div class="bp-sec"><h4>👤 What you do</h4><p>${esc(s.customerDoes)}</p></div>
      <div class="bp-sec"><h4>🤖 What ${C.brand.agentName} does</h4><ul>${s.agentDoes.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>
      <div class="bp-sec"><h4>🔌 Integrations</h4>${s.integrations.map((id) => bpIntegration(id)).join('')}</div>
      <div class="bp-sec"><h4>🗂️ Data captured</h4><div class="bp-tags">${s.dataPoints.map((d) => `<span class="bp-tag">${esc(d)}</span>`).join('') || '<span class="muted">—</span>'}</div></div>
      <div class="bp-sec"><h4>⚖️ Regulatory basis</h4>${s.regulations.map((id) => bpReg(id)).join('')}</div>`;
  }
  function bpIntegration(id) {
    const i = C.integrations[id]; if (!i) return '';
    return `<div class="bp-item"><div class="bp-item__name">${esc(i.name)}</div>
      <div class="bp-item__meta"><em>${esc(i.providers)}</em></div>
      <div class="bp-item__pur">${esc(i.purpose)}</div></div>`;
  }
  function bpReg(id) {
    const r = C.regulations[id]; if (!r) return '';
    return `<div class="bp-item bp-item--reg"><div class="bp-item__name">${esc(r.name)}</div><div class="bp-item__pur">${esc(r.summary)}</div></div>`;
  }
  function blueprintMap() {
    return `
      <div class="bp-sec"><h4>🧭 The 8-step journey</h4>
        ${C.stages.map((s) => `<div class="bp-flow"><span class="bp-flow__n">${s.num}</span><div><strong>${esc(s.label)}</strong><div class="muted">${esc(s.customerDoes)}</div></div></div>`).join('')}
      </div>
      <div class="bp-sec"><h4>🔌 All integrations</h4>${Object.keys(C.integrations).map((id) => bpIntegration(id)).join('')}</div>
      <div class="bp-sec"><h4>⚖️ Regulatory map</h4>${Object.keys(C.regulations).map((id) => bpReg(id)).join('')}</div>
      <div class="bp-sec"><h4>🗂️ Data points — prefill vs ask</h4>
        <table class="bp-table"><thead><tr><th>Data</th><th>Source</th><th>Mode</th></tr></thead>
        <tbody>${C.dataPoints.map((d) => `<tr><td>${esc(d.field)}</td><td>${esc(d.source)}</td><td><span class="bp-mode bp-mode--${d.mode}">${d.mode}</span></td></tr>`).join('')}</tbody></table>
      </div>
      <p class="bp-disclaim">${esc(C.legal.disclaimer)}</p>`;
  }

  /* ===================================================================== *
   *  LANDING / RESUME
   * ===================================================================== */
  function renderResume() {
    const banner = $('#resumeBanner');
    if (!banner) return;
    const inProgress = state.stage && state.stage !== 'landing' && !state.done;
    if (inProgress) {
      const s = C.stageByKey[state.stage];
      const idx = wizStages.findIndex((x) => x.key === state.stage);
      const total = wizStages.length, stepNo = idx >= 0 ? idx + 1 : 1;
      const pct = Math.round(((stepNo - 1) / total) * 100);
      const left = wizStages.slice(Math.max(idx, 0)).reduce((m, x) => m + (x.minutes || 1), 0);
      banner.innerHTML = `
        <div class="resume__top"><span class="resume__badge">⏸ Welcome back</span><span class="resume__step">Step ${stepNo} of ${total} · ${esc(s ? s.label : '')}</span></div>
        <div class="resume__bar"><span style="width:${pct}%"></span></div>
        <p class="resume__txt">Your progress is saved 🔒 — pick up exactly where you left off, about <strong>${left} min</strong> to go.</p>
        <div class="resume__cta"><button class="btn btn--primary btn--block" data-action="resume">Resume my application →</button><a href="#" data-action="restart" class="resume__over">start over</a></div>`;
      banner.hidden = false;
    } else { banner.hidden = true; }
  }

  /* ===================================================================== *
   *  INIT
   * ===================================================================== */
  function init() {
    load();

    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (a) { onAction(a.dataset.action, a, e); }
      bumpInactivity();
    });
    document.addEventListener('keydown', () => bumpInactivity());

    // live budget sliders — update the amount + running total without a re-render
    document.addEventListener('input', (e) => {
      const kf = e.target.closest && e.target.closest('[data-kycfield]');
      if (kf) { state.kycEdits = state.kycEdits || {}; state.kycEdits[kf.getAttribute('data-kycfield')] = kf.value; save(); return; }
      const fb = e.target.closest && e.target.closest('[data-feebudget]');
      if (fb) {
        state.feeBudget = Number(fb.value) || 0;
        state.okWithFees = state.feeBudget > 0; // paying a fee unlocks the perk-ranked premium cards
        const fv = $('#feeBudgetVal'); if (fv) fv.textContent = state.feeBudget ? 'up to ' + inr(state.feeBudget) : 'Lifetime-free / low fee';
        save(); return;
      }
      const sl = e.target.closest && e.target.closest('[data-budget]');
      if (!sl) return;
      const cat = sl.getAttribute('data-budget');
      state.budget[cat] = Number(sl.value) || 0;
      const val = $(`[data-budgetval="${cat}"]`); if (val) val.textContent = inr(state.budget[cat]);
      const tot = $('#budgetTotal'); if (tot) tot.textContent = inr(budgetTotal());
      save();
    });

    // co-pilot form
    $('#copilotForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#copilotInput').value.trim();
      if (!v) return;
      $('#copilotInput').value = '';
      sendChat(v);
    });

    // exit intent
    document.addEventListener('mouseout', maybeExitIntent);

    // start either on landing or resumed
    if (state.stage && state.stage !== 'landing' && !state.done) {
      setStage(state.stage, { noScroll: true });
    } else {
      state.stage = 'landing';
      setStage('landing');
    }
    track('app_init', { resumed: state.stage !== 'landing' });
  }

  function stripTags(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
