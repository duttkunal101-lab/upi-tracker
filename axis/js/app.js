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
  const wizStages = C.stages; // 1..8

  /* --------------------------------------------------------------- state */
  const fresh = () => ({
    stage: 'landing',
    mobile: '', otpVerified: false, preApproved: null,
    profile: { tags: [], employment: 'salaried' },
    cardId: null,
    pan: '', identity: null, ckyc: null, kycComplete: false, vcip: false,
    bureau: null, income: null, account: null, assessmentDone: false,
    decision: null, signed: false, issued: null, autopay: false,
    startedAt: Date.now(), done: false,
  });
  let state = fresh();

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
    state.stage = key;
    save();
    if (key === 'landing') { showView('landing'); renderResume(); return; }
    showView('wizard');
    renderStepper();
    renderProgress();
    renderStage();
    armInactivity();
    seedCopilot(key);
    if (isBlueprintOpen()) renderBlueprint();
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
  function cycleFacts() {
    const set = () => { $('#agentFact').textContent = C.facts[Math.floor(Math.random() * C.facts.length)]; };
    set();
    clearInterval(factTimer);
    factTimer = setInterval(set, 2600);
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
      body = `
      <div class="panel">
        <p class="ask">What do you spend on most? <span class="muted">Tap a few — ${C.brand.agentName} will match your card.</span></p>
        <div class="chips" id="tagChips">
          ${C.profileTags.map((t) => `<button class="chip ${state.profile.tags.includes(t.id) ? 'is-on' : ''}" data-action="toggle-tag" data-tag="${t.id}">${t.icon} ${esc(t.label)}</button>`).join('')}
        </div>
        <p class="ask">You are…</p>
        <div class="seg">
          ${[['salaried', 'Salaried'], ['self', 'Self-employed'], ['ntc', 'New to credit']].map(([v, l]) =>
            `<button class="seg__btn ${state.profile.employment === v ? 'is-on' : ''}" data-action="set-emp" data-emp="${v}">${l}</button>`).join('')}
        </div>
        <button class="btn btn--primary btn--block" data-action="recommend">✨ Find my best Axis card</button>
        <button class="btn btn--ghost btn--block" data-action="browse">Browse all cards</button>
      </div>`;
    } else {
      body = cardHero(rec.card, rec.reason, true) + `
        <div class="alts">
          ${(rec.alternates || []).length ? `<p class="ask">Other good fits</p>` : ''}
          <div class="alt-grid">
            ${(rec.alternates || []).map((c) => cardMini(c)).join('')}
          </div>
          <button class="btn btn--ghost btn--block" data-action="browse">See all Axis cards</button>
        </div>`;
    }
    return { html: stageHead('product') + body };
  };

  R._browse = function () {
    return { html: stageHead('product') + `
      <div class="card-grid">${C.cards.map((c) => cardMini(c, true)).join('')}</div>
      <button class="btn btn--ghost btn--block" data-action="back-rec">← Back to recommendation</button>` };
  };

  /* ---- Stage 3: KYC ---------------------------------------------------- */
  R.kyc = function () {
    if (!state.identity) {
      const etb = state.preApproved && state.preApproved.preApproved;
      return { html: stageHead('kyc') + `
        <div class="panel">
          ${etb ? `<div class="fasttrack">⚡ <strong>Fast-track:</strong> we recognised your existing Axis relationship and pre-filled your PAN — just verify to auto-fill the rest.</div>` : ''}
          <label class="fld">
            <span class="fld__label">PAN ${etb ? afBadge('pre-filled') : ''}</span>
            <input id="pan" class="fld__input fld__input--mono" maxlength="10" placeholder="ABCDE1234F"
              value="${esc(state.pan)}" style="text-transform:uppercase" />
          </label>
          <label class="consent">
            <input type="checkbox" id="consentKyc" checked/>
            <span>I consent to fetch my identity, address &amp; documents from DigiLocker / Aadhaar e-KYC and the CKYC registry to auto-fill my application. <a href="#" data-action="why" data-why="kyc">Why?</a></span>
          </label>
          <button class="btn btn--primary btn--block" data-action="begin-kyc">Verify &amp; auto-fill everything →</button>
          <p class="trust">🪪 Your Aadhaar number stays masked and vaulted — we never store it in full.</p>
        </div>` };
    }
    const id = state.identity || {};
    const docs = id.documents || [];
    return { html: stageHead('kyc') + `
      <div class="kyc-card">
        <div class="kyc-card__head">
          <div class="avatar">${esc(id.photoInitials || '🙂')}</div>
          <div>
            <div class="kyc-card__name">${esc(id.name || 'Verified')}</div>
            <div class="kyc-card__sub">Auto-filled &amp; verified ${state.ckyc && state.ckyc.found ? 'from your CKYC record' : 'via DigiLocker'}${state.vcip ? ' · V-CIP done' : ''}</div>
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
          <label class="consent">
            <input type="checkbox" id="consentBureau" checked/>
            <span>${esc(C.legal.consents.bureau)} <a href="#" data-action="why" data-why="assessment">Why?</a></span>
          </label>
          <label class="consent">
            <input type="checkbox" id="consentAa" checked/>
            <span>${esc(C.legal.consents.aa)}</span>
          </label>
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
        ${kfs(d, card)}
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
        <div class="kfs-mini">
          ${kvRow('Card', card.name)}
          ${kvRow('Credit limit', inr(d.limit))}
          ${kvRow('Annual fee', card.annualFee ? inr(card.annualFee) : 'Lifetime free')}
          ${kvRow('Finance charge', '~3.6% p.m. (~52.86% p.a.) on revolving balances')}
        </div>
        ${mitcAccordion(true)}
        <div class="cooloff">⏳ ${esc(C.legal.coolingOff)}</div>
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
    state.done = true; save(); clearSave();
    return { html: `
      <div class="welcome">
        <div class="welcome__burst">🎉</div>
        <h2 class="welcome__title">Welcome to Axis Bank!</h2>
        <p class="welcome__sub">Your <strong>${esc(card.name)}</strong> is ready. ${esc(C.brand.tagline)}.</p>
        <div class="welcome__benefits">
          ${card.highlights.slice(0, 3).map((h) => `<div class="benefit">✦ ${esc(h)}</div>`).join('')}
        </div>
        <div class="welcome__nudge">💡 ${esc(C.stageByKey.welcome.nudge)} Make a first transaction to activate your rewards.</div>
        <button class="btn btn--primary btn--block" data-action="restart">Start a new application</button>
      </div>` };
  };

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
  function metric(big, small) { return `<div class="metric"><strong>${esc(big)}</strong><span>${esc(small)}</span></div>`; }
  function actionTile(icon, label, action, cta) {
    return `<button class="tile" data-action="${action}"><span class="tile__ic">${icon}</span><span class="tile__lb">${esc(label)}</span><span class="tile__cta">${esc(cta)}</span></button>`;
  }
  function cardSwatch(card) {
    const [a, b] = card.color || ['#97144D', '#5E0C30'];
    return `background:linear-gradient(135deg,${a},${b})`;
  }
  function cardHero(card, reason, recommended) {
    return `<div class="card-hero">
      ${recommended ? `<span class="card-hero__badge">✨ ${C.brand.agentName}’s pick for you</span>` : ''}
      <div class="card-face" style="${cardSwatch(card)}">
        <span class="card-face__bank">AXIS BANK</span>
        <span class="card-face__chip"></span>
        <span class="card-face__name">${esc(card.name.replace('Axis Bank ', '').replace(' Credit Card', ''))}</span>
        <span class="card-face__net">${esc(card.network)}</span>
      </div>
      <div class="card-hero__body">
        <div class="card-hero__seg">${esc(card.segment)}</div>
        <p class="card-hero__reason">${esc(reason)}</p>
        <ul class="card-hero__rewards">${card.bestFor.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <div class="card-hero__fee">${card.annualFee ? inr(card.annualFee) + ' annual fee' : 'Lifetime free'} · <span class="muted">${esc(card.feeWaiver)}</span></div>
        <button class="btn btn--primary btn--block" data-action="choose-card" data-card="${card.id}">Choose this card →</button>
      </div>
    </div>`;
  }
  function cardMini(card, choose) {
    return `<div class="card-mini">
      <div class="card-face card-face--sm" style="${cardSwatch(card)}">
        <span class="card-face__bank">AXIS</span>
        <span class="card-face__name">${esc(card.name.replace('Axis Bank ', '').replace(' Credit Card', ''))}</span>
        <span class="card-face__net">${esc(card.network)}</span>
      </div>
      <div class="card-mini__seg">${esc(card.segment)}</div>
      <div class="card-mini__tag">${esc(card.bestFor[0])}</div>
      <div class="card-mini__fee">${card.annualFee ? inr(card.annualFee) + '/yr' : 'Lifetime free'}</div>
      <button class="btn btn--ghost btn--sm btn--block" data-action="choose-card" data-card="${card.id}">Choose</button>
    </div>`;
  }
  function virtualCardVisual(card, v) {
    return `<div class="vcard" style="${cardSwatch(card)}">
      <div class="vcard__top"><span>AXIS BANK</span><span class="vcard__live">● VIRTUAL · LIVE</span></div>
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

  /* render the active stage into #stageRoot */
  function renderStage() {
    const root = $('#stageRoot');
    let renderer = R[state.stage];
    if (state.stage === 'product' && state._browsing) renderer = R._browse;
    const out = renderer ? renderer() : { html: '' };
    root.innerHTML = out.html;
    if (out.mount) out.mount();
    // gate the e-sign button on consent
    const ci = $('#consentIssue'); if (ci) ci.addEventListener('change', () => { $('#signCta').disabled = !ci.checked; });
  }

  /* ===================================================================== *
   *  ACTION HANDLERS (event delegation)
   * ===================================================================== */
  async function onAction(action, el, ev) {
    switch (action) {
      case 'start': setStage('start'); break;
      case 'restart': clearSave(); state = fresh(); setStage('landing'); break;
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
      case 'choose-card': chooseCard(el.dataset.card); break;

      /* stage 3 */
      case 'begin-kyc': await beginKyc(); break;
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

      /* co-pilot */
      case 'copilot-open': openCopilot(); break;
      case 'copilot-close': $('#copilot').classList.remove('is-open'); break;

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
    const pa = await INT.checkPreApproved(state.mobile);
    state.preApproved = pa; save();
    if (pa.preApproved) {
      if (!state.pan) state.pan = synthPan(); // ETB → PAN already on record, pre-fill it
      toast(`🎉 Good news — you have a pre-approved offer up to ${inr(pa.indicativeLimit)}!`, 'success');
    }
    track('otp_verified', { preApproved: pa.preApproved });
    nextStage();
  }

  /* ---- stage 2 logic ---- */
  function toggleTag(tag) {
    const t = state.profile.tags;
    const i = t.indexOf(tag);
    if (i >= 0) t.splice(i, 1); else t.push(tag);
    save();
    // just toggle the chip class without a full re-render (keeps focus/flow)
    const chip = $(`.chip[data-tag="${tag}"]`); if (chip) chip.classList.toggle('is-on');
  }
  async function doRecommend() {
    const rec = await withAgentThinking('Matching you to the best Axis card', () =>
      AGENT.recommend(state.profile));
    state._rec = rec; save();
    renderStage();
    aria(`I’d go with the <strong>${esc(rec.card.name)}</strong>. ${esc(rec.reason)}`, true);
    track('reco_made', { card: rec.card.id, source: rec.source });
  }
  function chooseCard(id) {
    state.cardId = id; state._browsing = false; save();
    track('card_chosen', { card: id });
    nextStage();
  }

  /* ---- stage 3 logic ---- */
  async function beginKyc() {
    const pan = ($('#pan').value || '').toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) { toast('Enter a valid PAN (e.g. ABCDE1234F).', 'error'); return; }
    if (!$('#consentKyc').checked) { toast('Please consent to the KYC fetch.', 'error'); return; }
    state.pan = pan; save();
    const res = await runAgent('Verifying your identity', [
      { id: 'pan', icon: '🪪', label: 'Validating PAN with Protean (NSDL)', fn: () => INT.verifyPan(pan), tag: (r) => r.ok ? 'PAN valid' : 'check PAN' },
      { id: 'dl', icon: '📂', label: 'Pulling documents & details from DigiLocker', fn: () => INT.digiLockerFetch(pan), tag: (r) => (r.documents ? r.documents.length + ' docs' : 'Fetched') },
      { id: 'ckyc', icon: '🗂️', label: 'Checking the CKYC registry (CERSAI)', fn: () => INT.ckycPull(pan), tag: (r) => r.found ? 'CKYC found' : 'new CKYC' },
      { id: 'face', icon: '🤳', label: 'Liveness check & face match', fn: () => INT.livenessFaceMatch(), tag: (r) => 'match ' + Math.round(r.faceMatchScore * 100) + '%' },
      { id: 'vcip', icon: '🎥', label: 'Video-KYC (V-CIP) for full KYC', fn: () => INT.vcipSession(), tag: () => 'V-CIP done' },
    ]);
    state.identity = res.dl;
    state.ckyc = res.ckyc;
    state.vcip = !!(res.vcip && res.vcip.completed);
    save();
    renderStage();
    track('kyc_done', { ckyc: state.ckyc && state.ckyc.found });
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
