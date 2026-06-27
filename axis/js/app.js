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
  const STORE = 'axis.onboarding.v1';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const synthPan = () => 'AXISP' + Math.floor(1000 + Math.random() * 9000) + 'K';
  const wizStages = C.stages.slice().sort((a, b) => a.num - b.num); // ordered by stage number

  /* --------------------------------------------------------------- state */
  const fresh = () => ({
    stage: 'landing',
    mobile: '', otpVerified: false, preApproved: null, relationship: null,
    profile: { tags: [], employment: 'salaried' },
    budget: { shopping: 0, travel: 0, bills: 0, food: 0, entertainment: 0, cabs: 0, other: 5000 },
    cardId: null, valueRank: null,
    dlMobile: '', dlLinked: false,
    pan: '', kycMethod: null, ocr: null, identity: null, ckyc: null, kycComplete: false, vcip: false, kycVia: null,
    bureau: null, income: null, account: null, assessmentDone: false,
    decision: null, signed: false, issued: null, autopay: false,
    points: 0, awarded: {}, scratched: false, level: 0,
    startedAt: Date.now(), done: false,
  });
  let state = fresh();
  let _lastLead = ''; // last agent-lead message mirrored into the chat transcript

  function load() {
    try {
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
    const lv = levelInfo();
    el.innerHTML = `<span class="appbar__live"></span>
      <span class="appbar__ref">App <strong>${esc(state.appRef)}</strong></span>
      <span class="appbar__status">${esc(status)}</span>
      <span class="appbar__pts" title="Level ${lv.idx + 1}: ${esc(lv.name)}">✨ ${state.points || 0} pts</span>
      <button class="appbar__track" data-action="tracker-open" title="See live status, what's verified and your details">📋 Track</button>
      <div class="xp">
        <span class="xp__lv">⭐ ${esc(lv.name)}</span>
        <span class="xp__bar"><i style="width:${lv.pct}%"></i></span>
        <span class="xp__nx">${lv.atTop ? 'Top level reached' : lv.toNext + ' pts → ' + esc(lv.nextName)}</span>
      </div>`;
  }

  /* ----------------------------- gamification ----------------------------- */
  function awardStage(from, to) {
    if (!from || from === 'landing' || from === to) return;
    state.awarded = state.awarded || {};
    if (state.awarded[from]) return;
    state.awarded[from] = true;
    const size = (C.gamify.levelSize) || 60;
    const beforeLv = Math.floor((state.points || 0) / size);
    const pts = C.gamify.points[from] || 0;
    if (pts) { state.points = (state.points || 0) + pts; floatPoints(pts, (C.gamify.unlocks && C.gamify.unlocks[from]) || ''); }
    const afterLv = Math.floor((state.points || 0) / size);
    save();
    const badge = C.gamify.badges[from];
    if (badge) popBadge(badge);
    if (afterLv > beforeLv) { setTimeout(() => popBadge({ icon: '⬆️', label: 'Level up · ' + levelInfo().name }), badge ? 1000 : 0); }
  }
  function floatPoints(n, label) {
    const f = document.createElement('div'); f.className = 'pts-float';
    f.innerHTML = '+' + n + ' pts' + (label ? `<span>${esc(label)}</span>` : '');
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1800);
  }
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
    const pa = state.preApproved;
    return { html: `
      ${stageHead('start')}
      <div class="panel">
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
        <div id="otpRow" hidden>
          <label class="fld">
            <span class="fld__label">Enter OTP <span class="muted">(demo — any 6 digits)</span></span>
            <input id="otp" class="fld__input" inputmode="numeric" maxlength="6" placeholder="••••••" />
          </label>
        </div>
        <button class="btn btn--primary btn--block" id="startCta" data-action="send-otp">Send OTP →</button>
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
          ${[['salaried', 'Salaried'], ['self', 'Self-employed'], ['ntc', 'New to credit']].map(([v, l]) =>
            `<button class="seg__btn ${state.profile.employment === v ? 'is-on' : ''}" data-action="set-emp" data-emp="${v}">${l}</button>`).join('')}
        </div>
        <button class="btn btn--primary btn--block" data-action="recommend">✨ Find my best-value card →</button>
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
    const ranked = (state.valueRank || []).map((v) => ({ card: C.cardById[v.id], net: v.net, fee: v.fee, waived: v.waived })).filter((r) => r.card);
    if (!ranked.length) return '';
    const max = Math.max.apply(null, ranked.map((r) => r.net).concat([1]));
    return `<div class="vcompare">
      <div class="sec-label">💡 Net value to you (rewards − fee), compared</div>
      ${ranked.map((r, i) => `<div class="vcomp ${i === 0 ? 'is-top' : ''}">
        <span class="vcomp__nm">${esc(r.card.shortName)}${i === 0 ? ' · best' : ''}</span>
        <span class="vcomp__bar"><i style="width:${Math.max(6, Math.round((r.net / max) * 100))}%"></i></span>
        <span class="vcomp__val">${inr(r.net)}/yr${r.waived ? ' <em>fee waived</em>' : ''}</span>
      </div>`).join('')}
      <p class="muted vcompare__note">Annual rewards on your ${inr(budgetTotal())}/month spend, <strong>minus each card’s fee</strong> (waived where your spend qualifies). Indicative — actual value depends on each card’s caps &amp; terms.</p>
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
      if (state.kycMethod === 'aadhaar') return { html: stageHead('kyc') + kycAadhaar() };
      if (state.kycMethod === 'ocr') return { html: stageHead('kyc') + kycOcr() };
      if (state.kycMethod === 'vcip') return { html: stageHead('kyc') + kycVcip() };
      if (state.kycMethod === 'chooser') return { html: stageHead('kyc') + kycChooser() };
      // DEFAULT (agent-driven): DigiLocker is linked off the verified mobile — one consent tap
      return { html: stageHead('kyc') + kycDigiLocker() };
    }
    const id = state.identity || {};
    const docs = id.documents || [];
    return { html: stageHead('kyc') + `
      <div class="kyc-card">
        <div class="kyc-card__head">
          <div class="avatar">${esc(id.photoInitials || '🙂')}</div>
          <div>
            <div class="kyc-card__name">${esc(id.name || 'Verified')}</div>
            <div class="kyc-card__sub">Auto-filled &amp; verified ${esc(viaLabel(state.kycVia))}${state.ckyc && state.ckyc.found ? ' · CKYC matched' : ''}</div>
          </div>
          <span class="pill pill--ok">✓ Verified</span>
        </div>

        <div class="sec-label">📄 Documents pulled &amp; verified</div>
        <div class="docs">${docs.map(docRow).join('') || '<span class="muted">—</span>'}</div>

        <div class="sec-label">🗂️ Application details ${afBadge()}</div>
        <div class="kyc-rows">
          ${kvRow('Full name', id.name)}
          ${kvRow('Date of birth', id.dob)}
          ${kvRow('Gender', id.gender)}
          ${kvRow('Father’s name', id.fatherName)}
          ${kvRow('PAN', (state.pan || '').toUpperCase())}
          ${kvRow('Email', id.email)}
          ${kvRow('Aadhaar', (id.aadhaarMasked || '') + ' (masked)')}
          ${kvRow('Current address', id.currentAddress || id.address)}
          ${kvRow('Permanent address', id.permanentAddress || id.address)}
        </div>
        <p class="muted edit-note">Everything was auto-filled from your verified documents. Something off? <a href="#" data-action="edit-kyc">Edit details</a></p>
        <button class="btn btn--primary btn--block" data-action="confirm-kyc">Confirm &amp; continue →</button>
      </div>` };
  };

  /* ---- Stage 4: assessment -------------------------------------------- */
  R.assessment = function () {
    if (!state.assessmentDone) {
      return { html: stageHead('assessment') + `
        <div class="panel">
          ${trustRow()}
          <label class="consent">
            <input type="checkbox" id="consentBureau" checked/>
            <span>${esc(C.legal.consents.bureau)} <a href="#" data-action="why" data-why="assessment">Why?</a></span>
          </label>
          <label class="consent">
            <input type="checkbox" id="consentAa" checked/>
            <span>${esc(C.legal.consents.aa)}</span>
          </label>
          ${trustWhy('assessment')}
          <button class="btn btn--primary btn--block" data-action="run-assessment">Run my eligibility check →</button>
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
          ${state.income ? `<p class="offer__verified">✓ Verified income ${inr(state.income.monthlyIncome)}/mo${state.income.employerName ? ` · ${esc(state.income.employmentType)} at ${esc(state.income.employerName)}` : ''} <span class="af">via Account Aggregator</span></p>` : ''}
        </div>
        ${limitExplainer(d, state.bureau, state.income)}
        ${kfs(d, card)}
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
    return { html: stageHead('issuance') + `
      ${virtualCardVisual(card, v)}
      <div class="issue-actions">
        ${actionTile('🔢', 'Set your PIN', 'set-pin', state._pinSet ? 'Done ✓' : 'Set')}
        ${actionTile('📲', 'Add to Google / Apple Pay', 'add-wallet', state._walletAdded ? 'Added ✓' : 'Add')}
        ${actionTile('🔁', 'Set up autopay (e-NACH)', 'autopay', state.autopay ? 'On ✓' : 'Enable')}
      </div>
      <p class="trust">📮 Your physical card (${esc(state.issued.physicalDispatch.courier)}) arrives in ~${state.issued.physicalDispatch.etaDays} days · trackable. RBI requires your consent to keep an unused card active after 30 days.</p>
      <button class="btn btn--primary btn--block" data-action="to-welcome">Continue →</button>` };
  };

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
        <div class="trk-hero__meta">${done}/${rows.length} checks complete · ✨ ${state.points || 0} pts · ${esc(levelName())}</div>
      </div>
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
  function kycDigiLocker() {
    const docs = C.digiLockerDocs || [];
    const dlm = state.dlMobile || state.mobile || '';
    const same = dlm === state.mobile;
    return `<div class="panel">
      ${relationshipBanner()}
      ${trustRow()}
      <div class="dl-link">
        <div class="dl__head"><span class="dl__brand">🔐 DigiLocker</span><span class="dl__gov">Government of India · MeitY</span></div>
        <p class="dl-link__lead">DigiLocker pulls your documents from the mobile that’s <strong>linked to your Aadhaar</strong>. Confirm that number and I’ll link it, fetch &amp; verify your KYC — <strong>PAN included</strong> — automatically.</p>
        <label class="fld">
          <span class="fld__label">📱 Mobile linked to your DigiLocker / Aadhaar</span>
          <div class="fld__inrow">
            <span class="fld__prefix">+91</span>
            <input id="dlMobile" class="fld__input" inputmode="numeric" maxlength="10" placeholder="10-digit Aadhaar-linked number" value="${esc(dlm)}" />
          </div>
          <span class="fld__hint">${same ? 'Same as the number you verified ✓ — leave it as is if your Aadhaar is on this number.' : 'I’ll send the DigiLocker link here.'}</span>
        </label>
        <div class="dl__docs">${docs.map((d) => `<div class="dl__doc"><div><strong>${esc(d.name)}</strong><div class="muted">${esc(d.issuer)} · ${esc(d.purpose)}</div></div><span class="dl__chk">✓</span></div>`).join('')}</div>
        <label class="consent"><input type="checkbox" id="consentKyc" checked/><span>I consent to share these documents with Axis Bank for this application (DPDP Act). <a href="#" data-action="why" data-why="kyc">Why?</a></span></label>
      </div>
      <button class="btn btn--primary btn--block" data-action="dl-allow">Link DigiLocker &amp; auto-fill →</button>
      ${trustWhy('kyc')}
      <div class="kyc-alts">
        <span class="kyc-alts__lb">No DigiLocker, or prefer another way? I can also:</span>
        <div class="kyc-alts__row">
          <button class="kyc-alt" data-action="kyc-method" data-method="ocr"><span class="kyc-alt__ic">📄</span>Upload + OCR</button>
          <button class="kyc-alt" data-action="kyc-method" data-method="aadhaar"><span class="kyc-alt__ic">📱</span>Aadhaar OTP</button>
          <button class="kyc-alt" data-action="kyc-method" data-method="vcip"><span class="kyc-alt__ic">🎥</span>Video-KYC</button>
        </div>
        <button class="linklike" data-action="kyc-chooser">Compare all verification options →</button>
      </div>
      <p class="trust">🪪 Your Aadhaar stays masked &amp; vaulted — we never store it in full.</p>
    </div>`;
  }
  function kycChooser() {
    return `<div class="panel">
      <button class="linkback" data-action="kyc-back">← Back to DigiLocker</button>
      <p class="ask">Choose how to complete KYC <span class="muted">— ${esc(C.brand.agentName)} recommends DigiLocker.</span></p>
      <div class="kyc-methods">
        <button class="kyc-method kyc-method--reco" data-action="kyc-method" data-method="digilocker"><span class="kyc-method__ic">⚡</span><span class="kyc-method__b"><strong>DigiLocker — instant auto-fetch</strong><small>I pull &amp; verify your Aadhaar + PAN in seconds</small></span><span class="kyc-method__pick">${esc(C.brand.agentName)}’s pick</span></button>
        <button class="kyc-method" data-action="kyc-method" data-method="aadhaar"><span class="kyc-method__ic">📱</span><span class="kyc-method__b"><strong>Aadhaar OTP e-KYC</strong><small>Verify via a UIDAI OTP</small></span></button>
        <button class="kyc-method" data-action="kyc-method" data-method="ocr"><span class="kyc-method__ic">📄</span><span class="kyc-method__b"><strong>Upload documents (AI OCR)</strong><small>Snap your Aadhaar &amp; PAN — I read them</small></span></button>
        <button class="kyc-method" data-action="kyc-method" data-method="vcip"><span class="kyc-method__ic">🎥</span><span class="kyc-method__b"><strong>Video KYC (V-CIP)</strong><small>Live full-KYC with an Axis officer</small></span></button>
      </div>
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
      <p class="rel__line">${esc(r.line)}</p>
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
    return C.cards.filter((c) => !c.secured).map((c) => {
      const gross = estimateAnnualValue(c, budget);
      const fee = effectiveFee(c, annualSpend);
      return { card: c, gross, fee, net: gross - fee, waived: (c.annualFee || 0) > 0 && fee === 0 };
    }).sort((a, b) => b.net - a.net);
  }
  const budgetTotal = () => SPEND_CATS.reduce((s, k) => s + (Number(state.budget[k]) || 0), 0);

  /* ---- gamification: level math + the "download the Axis app" finisher ------ */
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
      msg = (pa && pa.preApproved)
        ? `I recognised your existing Axis relationship and a <strong>pre-approved offer up to ${inr(pa.indicativeLimit)}</strong> — I’ve fast-tracked you. Let’s verify it’s you and pick your card.`
        : `You’re new to Axis — I’ll onboard you end to end and do the heavy lifting myself. First, your mobile number so I can verify it’s you (an RBI/TRAI requirement). New to credit? I’ve got a path for that too.`;
      plan = `<div class="agent-lead__plan"><span>My plan for you</span><ol>${C.agentPlan.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>`;
    } else if (s === 'product') {
      msg = state._rec
        ? `I ran your monthly spend through <strong>every</strong> Axis card’s reward structure and ranked them by real rupee value. Here’s the winner for your budget — and the maths behind it.`
        : `Tell me roughly what you spend each month. I’ll compute the actual rewards <strong>you’d</strong> earn on every Axis card and recommend the highest-value one for your budget — not a generic “best card”. First card? I’ll keep you to one that builds your score.`;
    } else if (s === 'kyc') {
      const rl = state.relationship && C.relationship[state.relationship];
      if (!state.identity) msg = state.kycMethod === 'chooser'
        ? `No problem — pick how you’d like to verify. I recommend DigiLocker, but Aadhaar OTP, document upload (OCR) or a video call all work.`
        : `${rl ? esc(rl.line) + ' ' : ''}Confirm the mobile that’s <strong>linked to your Aadhaar</strong> and I’ll link DigiLocker to it, then pull &amp; verify your KYC — PAN included — and fill your whole application.`;
      else { const ck = state.ckyc && state.ckyc.found; msg = `Done — I pulled and verified your documents, matched your face${ck ? ', and found your CKYC record so I skipped re-capture' : ''}, and auto-filled your whole application. Just confirm it.`; }
    } else if (s === 'assessment') {
      msg = state.assessmentDone
        ? `Eligibility checked — I’m putting your personalised offer together now.`
        : `With your explicit consent (required by the CIC Act), I’ll check your credit and income to set a <strong>responsible</strong> limit. New to credit? I’ll use a secured-card path so you’re never stuck.`;
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
      <span class="agent-lead__avatar">✨</span>
      <div class="agent-lead__body">
        <div class="agent-lead__name">${esc(C.brand.agentName)} · ${esc(C.brand.agentRole)} <span class="agent-lead__live"></span></div>
        <p class="agent-lead__msg">${msg}</p>
        ${plan}
      </div>
    </div>`;
    return { html, msg };
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
    if (out.mount) out.mount();
    // mirror the agent's lead into the co-pilot as a live transcript of her reasoning
    if (lead.msg && lead.msg !== _lastLead) { _lastLead = lead.msg; appendMsg('agent', lead.msg); }
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

      /* stage 2 */
      case 'toggle-tag': toggleTag(el.dataset.tag); break;
      case 'set-emp': state.profile.employment = el.dataset.emp; save(); renderStage(); break;
      case 'recommend': await doRecommend(); break;
      case 'browse': state._browsing = true; renderStage(); break;
      case 'back-rec': state._browsing = false; renderStage(); break;
      case 'reprofile': state._rec = null; state.valueRank = null; save(); renderStage(); break;
      case 'choose-card': chooseCard(el.dataset.card); break;

      /* stage 3 */
      case 'kyc-method': chooseKycMethod(el.dataset.method); break;
      case 'kyc-back': kycBack(); break;
      case 'kyc-chooser': state.kycMethod = 'chooser'; save(); renderStage(); break;
      case 'aadhaar-otp': await aadhaarOtp(); break;
      case 'aadhaar-verify': await aadhaarVerify(); break;
      case 'ocr-upload': ocrUpload(el.dataset.doc); break;
      case 'ocr-extract': await ocrExtract(); break;
      case 'vcip-start': await vcipStart(); break;
      case 'vcip-schedule': toast('We’ll text you a secure link to pick a V-CIP slot (simulated). Your progress is saved.', 'success'); break;
      case 'dl-allow': await dlAllow(); break;
      case 'dl-deny': dlDeny(); break;
      case 'edit-kyc': toast('In production you could edit any pre-filled field here.'); break;
      case 'confirm-kyc': state.kycComplete = true; save(); nextStage(); break;

      /* stage 4 */
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
      case 'set-pin': state._pinSet = true; save(); toast('PIN set (simulated).', 'success'); renderStage(); break;
      case 'add-wallet': state._walletAdded = true; save(); toast('Added to wallet (simulated).', 'success'); renderStage(); break;
      case 'autopay': await setupAutopay(); break;
      case 'to-welcome': nextStage(); break;
      case 'scratch': if (!state.scratched) { state.scratched = true; save(); renderStage(); confettiBurst(); } break;

      /* co-pilot */
      case 'copilot-open': openCopilot(); break;
      case 'copilot-close': $('#copilot').classList.remove('is-open'); break;

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
    state.mobile = m; save();
    const btn = $('#startCta'); btn.disabled = true; btn.textContent = 'Sending OTP…';
    await INT.sendOtp(m);
    $('#otpRow').hidden = false;
    $('#otp').focus();
    btn.disabled = false; btn.textContent = 'Verify & continue →';
    btn.dataset.action = 'verify-otp';
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
    state.valueRank = ranked.slice(0, 4).map((x) => ({ id: x.card.id, gross: x.gross, net: x.net, fee: x.fee, waived: x.waived }));
    const top = ranked[0];
    const feeBit = top.fee === 0
      ? (top.card.annualFee ? ` Its ${inr(top.card.annualFee)} fee is waived at your spend level.` : ' And it’s lifetime-free.')
      : ` That’s already net of its ${inr(top.card.annualFee)} annual fee.`;
    const reason = `For how you spend (~${inr(budgetTotal())}/month), the ${top.card.shortName} gives you the most net value — about ${inr(top.net)} a year.${feeBit} That’s why I recommend it.`;
    state._rec = { card: top.card, reason, source: 'budget-value' };
    save();
    renderStage();
    aria(`I weighed every Axis card’s rewards <em>and</em> fees against your ${inr(budgetTotal())}/month spend. The <strong>${esc(top.card.name)}</strong> nets you the most — ≈ ${inr(top.net)}/year.`, true);
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
    if (method === 'digilocker') { state.kycMethod = null; save(); renderStage(); return; }
    state.kycMethod = method; save(); renderStage();
  }
  function kycBack() { state.kycMethod = null; save(); renderStage(); }
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
    state.dlMobile = dlm || state.mobile; save();
    if ($('#dlModal')) $('#dlModal').hidden = true;
    await runKycFetch('digilocker');
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
    save();
    renderStage();
    toast('✓ Documents verified — your application is auto-filled.', 'success');
    track('kyc_done', { method, ckyc: state.ckyc && state.ckyc.found });
  }

  /* ---- stage 4 logic ---- */
  async function runAssessment() {
    if (!$('#consentBureau').checked) { toast('Bureau consent is required to assess eligibility.', 'error'); return; }
    const res = await runAgent('Checking your eligibility', [
      { id: 'bureau', icon: '📈', label: 'Fetching your credit bureau record (with consent)', fn: () => INT.bureauPull(state.profile), tag: (r) => r.thinFile ? 'new to credit' : 'CIBIL ' + r.score },
      { id: 'aa', icon: '🏦', label: 'Assessing income via Account Aggregator', fn: () => INT.accountAggregator(state.profile), tag: (r) => inr(r.monthlyIncome) + '/mo' },
      { id: 'penny', icon: '💸', label: 'Verifying your bank account (penny-drop)', fn: () => INT.pennyDrop(), tag: (r) => r.nameMatch + ' match' },
      { id: 'aml', icon: '🛡️', label: 'AML / sanctions / PEP screening', fn: () => INT.amlScreen(), tag: () => 'clear' },
      { id: 'fraud', icon: '🔍', label: 'Fraud & device intelligence', fn: () => INT.fraudCheck(), tag: () => 'low risk' },
    ]);
    state.bureau = res.bureau;
    state.income = res.aa;
    state.account = res.penny;
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
    await INT.enachSetup();
    state.autopay = true; save();
    toast('Autopay set up via e-NACH (simulated).', 'success');
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
  function openCopilot() {
    $('#copilot').classList.add('is-open');
    hideNudgeBubble();
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
      appendMsg('agent', `Hi, I’m <strong>${C.brand.agentName}</strong> — ${esc(C.brand.agentRole)}. I’ll guide you, do the heavy lifting, and answer anything. Ask me about KYC, fees, your data or which card suits you.`);
    }
  }
  async function sendChat(text) {
    appendMsg('user', text);
    const typing = document.createElement('div');
    typing.className = 'msg msg--agent msg--typing';
    typing.innerHTML = '<i></i><i></i><i></i>';
    $('#copilotLog').appendChild(typing);
    $('#copilotLog').scrollTop = $('#copilotLog').scrollHeight;
    const r = await AGENT.ask(text, { stage: state.stage });
    typing.remove();
    appendMsg('agent', esc(r.answer));
    track('copilot_ask', { stage: state.stage, source: r.source });
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
      banner.innerHTML = `You have an application in progress (${esc(s ? s.label : '')}). <a href="#" data-action="resume">Resume →</a> · <a href="#" data-action="restart">start over</a>`;
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
