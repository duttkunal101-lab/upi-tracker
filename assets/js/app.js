/* =============================================================================
 * CardWise — App Controller
 * Wires the UI together: navigation, card & merchant selection, the optimizer
 * run, results rendering, and localStorage persistence. Vanilla JS, no build.
 * ========================================================================== */
(function () {
  'use strict';

  const { CATEGORIES, MERCHANTS, CARDS, CARD_BY_ID } = window.CW_DATA;
  const OPT = window.CW_OPTIMIZER;
  const fmtRate = OPT.fmtRate;

  const STORAGE_KEY = 'cardwise.v1';

  /* ------------------------------- State -------------------------------- */
  const state = {
    selectedCards: new Set(),          // cardId
    selectedMerchants: new Map(),      // merchantId -> monthlySpend
    cardNetwork: new Map(),            // cardId -> chosen network key (for multi-network cards)
    cardQuery: '',
    analyzing: null,                   // name currently being analyzed by AI, or null
  };

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cards: [...state.selectedCards],
        merchants: [...state.selectedMerchants.entries()],
        cardNetwork: [...state.cardNetwork.entries()],
      }));
    } catch (_) { /* storage unavailable — non-fatal */ }
  }

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      (data.cards || []).forEach((id) => CARD_BY_ID[id] && state.selectedCards.add(id));
      (data.merchants || []).forEach(([id, spend]) => state.selectedMerchants.set(id, spend));
      (data.cardNetwork || []).forEach(([id, net]) => state.cardNetwork.set(id, net));
    } catch (_) { /* ignore corrupt state */ }
  }

  /* ------------------------------- Helpers ------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const rupee = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  function showView(name) {
    $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
    $('#navRestart').hidden = name === 'landing';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showStep(step) {
    $$('.step').forEach((s) => s.classList.toggle('is-active', s.dataset.step === step));
    const order = ['cards', 'merchants', 'results'];
    const idx = order.indexOf(step);
    $$('.steps__item').forEach((item) => {
      const i = order.indexOf(item.dataset.step);
      item.classList.toggle('is-active', i === idx);
      item.classList.toggle('is-done', i < idx);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ----------------------- card visual building blocks ------------------- */
  const CONTACTLESS = '<svg class="cv-wifi" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="rgba(255,255,255,0.82)" stroke-width="2" stroke-linecap="round"><path d="M5 9.5a5 5 0 0 1 0 5"/><path d="M9 6.5a9.5 9.5 0 0 1 0 11"/><path d="M13 3.5a14 14 0 0 1 0 17"/></svg>';

  // Payment networks a card can be issued on. A card's `network` string may name
  // several (e.g. "Visa / Mastercard"); we let the user pick which one is theirs.
  const NETWORKS = [
    { key: 'visa',   label: 'Visa',             kw: ['visa'] },
    { key: 'mc',     label: 'Mastercard',       kw: ['mastercard', 'master card'] },
    { key: 'rupay',  label: 'RuPay',            kw: ['rupay'] },
    { key: 'amex',   label: 'American Express', kw: ['american express', 'amex'] },
    { key: 'diners', label: 'Diners Club',      kw: ['diners'] },
  ];

  // Every network named in a card's network string, in the order they appear.
  function networksOf(card) {
    const s = String(card.network || '').toLowerCase();
    const found = [];
    for (const n of NETWORKS) {
      const at = Math.min(...n.kw.map((k) => { const i = s.indexOf(k); return i < 0 ? Infinity : i; }));
      if (at !== Infinity) found.push({ key: n.key, label: n.label, at });
    }
    return found.sort((a, b) => a.at - b.at);
  }

  // The single network to display: the user's explicit choice, else the only
  // listed network, else the first listed (until they choose).
  function effectiveNetworkKey(card) {
    const chosen = state.cardNetwork.get(card.id);
    if (chosen) return chosen;
    const nets = networksOf(card);
    return nets.length ? nets[0].key : '';
  }

  // True when a card lists 2+ networks and the user hasn't picked one yet.
  function needsNetworkChoice(card) {
    return networksOf(card).length > 1 && !state.cardNetwork.get(card.id);
  }

  // Human label for the chosen (or raw) network, for the detail view.
  function networkLabelOf(card) {
    const chosen = state.cardNetwork.get(card.id);
    if (chosen) { const n = NETWORKS.find((x) => x.key === chosen); return n ? n.label : ''; }
    return String(card.network || '');
  }

  // Correct bank logo from the issuer's domain, via Google's logo/favicon
  // service — always returns that bank's real logo mark (reliable, no key).
  function logoFor(card) {
    const d = window.CW_DATA.domainFor ? window.CW_DATA.domainFor(card) : '';
    return d ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(d)}` : '';
  }

  function networkMarkByKey(key) {
    switch (key) {
      case 'visa':   return '<span class="net net--visa">VISA</span>';
      case 'mc':     return '<span class="net net--mc"><span></span><span></span></span>';
      case 'rupay':  return '<span class="net net--rupay">RuPay</span>';
      case 'amex':   return '<span class="net net--amex">AMEX</span>';
      case 'diners': return '<span class="net net--diners">DINERS</span>';
      default:       return '';
    }
  }
  function networkMark(card) { return networkMarkByKey(effectiveNetworkKey(card)); }

  /* ============================ STEP 1: CARDS =========================== */
  function renderCards() {
    const grid = $('#cardGrid');
    const query = state.cardQuery.trim();
    const q = query.toLowerCase();

    const matches = CARDS.filter((c) => {
      if (!q) return true;
      const hay = `${c.name} ${c.issuer} ${c.cvp} ${(c.bestFor || []).join(' ')} ${c.rewardUnit}`.toLowerCase();
      return hay.includes(q);
    });

    const cardsHtml = matches.map((c) => {
      const selected = state.selectedCards.has(c.id);
      return `
        <article class="cardlet ${selected ? 'is-selected' : ''}" data-card="${c.id}">
          <div class="cardlet__check">✓</div>
          <div class="cardlet__visual ${c.image ? 'cardlet__visual--photo' : ''}" style="background:${c.gradient}">
            ${c.image ? `<img class="cardlet__photo" src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" loading="lazy" onerror="this.closest('.cardlet__visual').classList.remove('cardlet__visual--photo'); this.remove()" />` : ''}
            ${logoFor(c) ? `<img class="cardlet__logo" src="${escapeHtml(logoFor(c))}" alt="" loading="lazy" onerror="this.remove()" />` : ''}
            <div class="cardlet__issuer">${escapeHtml(c.issuer)}</div>
            <div class="cardlet__chip"></div>
            ${CONTACTLESS}
            ${networkMark(c)}
            <div class="cardlet__name">${escapeHtml(c.name)}</div>
            ${c.source === 'ai' ? '<span class="cardlet__ai" title="Researched with AI + live web data">AI</span>' : ''}
            <button class="cardlet__info" data-info="${c.id}" title="View details" aria-label="View details">i</button>
          </div>
          <div class="cardlet__body">
            <div class="cardlet__cvp">${escapeHtml(c.cvp || '')}</div>
            <div class="cardlet__meta">
              <span class="cardlet__fee">${escapeHtml(c.feeNote || '')}</span>
              <span class="cardlet__select">${selected ? 'Added' : 'Tap to add'}</span>
            </div>
          </div>
        </article>`;
    }).join('');

    // "Analyze any card with AI" call-to-action when the user is searching.
    let ctaHtml = '';
    if (query.length >= 2) {
      const loading = state.analyzing && state.analyzing.toLowerCase() === q;
      ctaHtml = `
        <button class="cardlet cardlet--cta ${loading ? 'is-loading' : ''}" data-ai-analyze="${escapeHtml(query)}" ${state.analyzing ? 'disabled' : ''}>
          <span class="cta__spark">${loading ? '<span class="spinner"></span>' : '✨'}</span>
          <span class="cta__text">${loading ? 'Researching live…' : `Analyze “${escapeHtml(query)}” with AI`}</span>
          <span class="cta__sub">${loading ? 'Reading current rewards · 15–40s' : 'Not listed? Get its latest CVP & rewards.'}</span>
        </button>`;
    }

    if (matches.length === 0 && !ctaHtml) {
      grid.innerHTML = `<div class="empty">No cards match “${escapeHtml(state.cardQuery)}”. Try another keyword.</div>`;
      return;
    }
    grid.innerHTML = cardsHtml + ctaHtml;
  }

  async function startAnalyze(query) {
    const name = (query || '').trim();
    if (!name || state.analyzing) return;
    if (!window.CW_AI) { toast('AI lookup is unavailable here.', 'error'); return; }
    if (window.CW_ACCESS && window.CW_ACCESS.isFull()) {
      toast('All early-access spots are taken — the AI lookup is closed.', 'error');
      return;
    }

    state.analyzing = name;
    renderCards();
    agentStart({
      orb: '✨',
      title: `Researching <span>${escapeHtml(name)}</span> live…`,
      foot: 'Reading the latest public info from the web · usually 10–30s',
      steps: ANALYZE_STEPS, facts: CARD_FACTS,
    });

    const result = await window.CW_AI.analyze(name);
    state.analyzing = null;

    if (result.ok) {
      const card = result.card;
      state.selectedCards.add(card.id);
      state.cardQuery = '';
      const search = $('#cardSearch'); if (search) search.value = '';
      persist();
      renderCards();
      updateCardFooter();
      // Let the overlay finish its "done" beat, then reveal the card + next step.
      agentComplete(() => {
        celebrate();
        const showDetails = () => openModal(card.id, { advance: true });
        if (needsNetworkChoice(card)) openNetworkPicker(card.id, showDetails);
        else showDetails();
      });
    } else {
      agentComplete(() => { renderCards(); toast(result.error, 'error'); });
    }
  }

  function updateCardFooter() {
    const n = state.selectedCards.size;
    const el = $('#cardCount');
    if (el) {
      el.textContent = n === 0
        ? 'Add one or more of your cards to begin'
        : `${n} card${n === 1 ? '' : 's'} in your wallet 👛 — add more, or continue`;
    }
    $('#toMerchants').disabled = n === 0;
  }

  /* ========================= STEP 2: MERCHANTS ========================= */
  function renderMerchants() {
    const wrap = $('#merchantWrap');
    const byCat = {};
    MERCHANTS.forEach((m) => { (byCat[m.category] ||= []).push(m); });

    wrap.innerHTML = Object.entries(CATEGORIES).map(([catId, cat]) => {
      const list = byCat[catId] || [];
      if (list.length === 0) return '';
      return `
        <div class="merchant-cat">
          <div class="merchant-cat__head"><span>${cat.icon}</span><h3>${escapeHtml(cat.name)}</h3></div>
          <div class="merchant-grid">
            ${list.map((m) => merchantTile(m)).join('')}
          </div>
        </div>`;
    }).join('');
    updateMerchantFooter();
  }

  function merchantTile(m) {
    const selected = state.selectedMerchants.has(m.id);
    const spend = selected ? state.selectedMerchants.get(m.id) : m.avgSpend;
    return `
      <div class="merchant ${selected ? 'is-selected' : ''}" data-merchant="${m.id}">
        <div class="merchant__top">
          <span class="merchant__icon">${m.icon}</span>
          <span class="merchant__name">${escapeHtml(m.name)}</span>
        </div>
        <div class="merchant__spend">
          <label>₹/mo</label>
          <input type="number" min="0" step="100" value="${spend}" data-spend="${m.id}"
                 aria-label="Monthly spend at ${escapeHtml(m.name)}" />
        </div>
      </div>`;
  }

  function updateMerchantFooter() {
    const n = state.selectedMerchants.size;
    $('#merchantCount').textContent = `${n} merchant${n === 1 ? '' : 's'} selected`;
    $('#optimizeBtn').disabled = n === 0;
  }

  /* ========================== STEP 3: RESULTS ========================== */
  function renderResults() {
    const ownedCardIds = [...state.selectedCards];
    const merchantSpends = [...state.selectedMerchants.entries()]
      .map(([merchantId, monthlySpend]) => ({ merchantId, monthlySpend }));

    const strategy = OPT.buildStrategy(ownedCardIds, merchantSpends);
    const upgrades = OPT.findUpgradeOpportunities(ownedCardIds, merchantSpends);
    const root = $('#resultsRoot');

    root.innerHTML = `
      ${resultsHero(strategy.totals)}
      ${complianceNote()}
      <h3 class="results__section-title">🎯 Best card at every merchant</h3>
      ${strategy.recommendations.map(recRow).join('')}
      ${cardUsageBlock(strategy.cardUsage)}
      ${manageBlock(strategy.cardUsage)}
      ${upgradeBlock(upgrades)}
      ${feedbackBlock()}
    `;

    // Now that they've completed everything, gently suggest feedback (once).
    if (!feedbackPrompted && !feedbackSubmitted) {
      feedbackPrompted = true;
      setTimeout(() => { if (!feedbackSubmitted && $('#modal').hidden) openFeedback(); }, 3800);
    }
  }

  function feedbackBlock() {
    return `
      <div class="fb-cta">
        <div class="fb-cta__text">
          <h3>🎉 You're all set — how did we do?</h3>
          <p>You're one of our founding testers. Tell us how relevant your strategy was, what's working, and what we should build next.</p>
        </div>
        <button class="btn btn--primary" data-action="feedback">Share quick feedback 💬</button>
      </div>`;
  }

  function complianceNote() {
    return `
      <p class="compliance-note">
        💛 These are friendly suggestions based on publicly available reward info —
        <strong>not financial advice</strong>. Rewards and terms change often, so do double-check
        the latest details with your bank before you decide. <a href="#" data-action="terms">Terms &amp; privacy</a>.
      </p>`;
  }

  function manageBlock(cardUsage) {
    const evergreen = [
      'Always clear your full statement balance by the due date — card interest (≈36–48% p.a.) instantly wipes out any rewards earned.',
      'Mind monthly reward caps: once a card maxes its accelerated cap, switch to your next-best card for that merchant.',
      'Spend enough on each card to trigger its fee-waiver milestone — or product-change / downgrade cards you rarely use.',
    ];
    const cardTips = cardUsage
      .filter((u) => Array.isArray(u.card.tips) && u.card.tips.length)
      .map((u) => `
        <div class="manage__card">
          <div class="manage__name"><span class="usage__swatch" style="background:${u.card.gradient}"></span>${escapeHtml(u.card.name)}</div>
          <ul>${u.card.tips.slice(0, 3).map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        </div>`).join('');

    return `
      <h3 class="results__section-title">🧭 Manage your cards better</h3>
      <div class="manage">
        ${cardTips}
        <div class="manage__card manage__card--evergreen">
          <div class="manage__name">Universal best practices</div>
          <ul>${evergreen.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        </div>
      </div>`;
  }

  /* lightweight toast notifications */
  let toastTimer = null;
  function toast(message, kind = 'info') {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `toast toast--${kind} is-visible`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 5000);
  }

  function resultsHero(t) {
    return `
      <div class="results__hero">
        <h2>Here's your personalised wallet game-plan ✨</h2>
        <p>We looked across your ${state.selectedCards.size} card${state.selectedCards.size === 1 ? '' : 's'} and ${state.selectedMerchants.size} merchant${state.selectedMerchants.size === 1 ? '' : 's'} — here's how to get a little more from every swipe.</p>
        <div class="results__metrics">
          <div class="metric"><strong class="accent">${rupee(t.annualReward)}</strong><span>could earn / year*</span></div>
          <div class="metric"><strong>${rupee(t.monthlyReward)}</strong><span>per month</span></div>
          <div class="metric"><strong>${fmtRate(t.blendedRate)}</strong><span>blended reward rate</span></div>
        </div>
      </div>`;
  }

  function recRow(rec) {
    const c = rec.best.card;
    const runners = rec.runnersUp.length
      ? `<div class="rec__runners">Alt: ${rec.runnersUp.map((r) => `${escapeHtml(r.card.name)} (${fmtRate(r.rate)})`).join(' · ')}</div>`
      : '';
    const tierBadge = rec.best.tier === 'merchant'
      ? '<span class="badge">Accelerated</span>'
      : rec.best.tier === 'category' ? '<span class="badge">Category bonus</span>' : '';

    return `
      <div class="rec">
        <div class="rec__merchant">
          <div class="rec__micon">${rec.merchant.icon}</div>
          <div>
            <div class="rec__mname">${escapeHtml(rec.merchant.name)}</div>
            <div class="rec__msub">${rec.monthlySpend > 0 ? rupee(rec.monthlySpend) + '/mo' : 'spend not set'}</div>
          </div>
        </div>
        <div class="rec__pick">
          <span class="rec__use">Use this card ${tierBadge}</span>
          <span class="rec__cardname"><span class="rec__swatch" style="background:${c.gradient}"></span>${escapeHtml(c.name)}</span>
          <span class="rec__reason">${escapeHtml(rec.best.reason)}</span>
          ${runners}
        </div>
        <div class="rec__reward">
          <div class="rec__rate">${fmtRate(rec.best.rate)}</div>
          <div class="rec__amt">${rec.best.monthlyReward > 0 ? '≈ ' + rupee(rec.best.monthlyReward * 12) + '/yr' : ''}</div>
        </div>
      </div>`;
  }

  function cardUsageBlock(cardUsage) {
    if (cardUsage.length === 0) return '';
    return `
      <h3 class="results__section-title">👛 Your wallet, simplified</h3>
      <div class="usage-grid">
        ${cardUsage.map((u) => `
          <div class="usage">
            <div class="usage__head">
              <span class="usage__swatch" style="background:${u.card.gradient}"></span>
              <span class="usage__name">${escapeHtml(u.card.name)}</span>
            </div>
            <div class="usage__for">Best for: ${escapeHtml(u.merchants.join(', '))}</div>
            <div class="usage__reward">≈ ${rupee(u.annualReward)} / year from these</div>
          </div>`).join('')}
      </div>`;
  }

  function upgradeBlock(upgrades) {
    if (upgrades.length === 0) return '';
    return `
      <h3 class="results__section-title">💡 Smart upgrade ideas</h3>
      <p class="muted" style="margin-bottom:1rem">Cards you don't own yet that would beat your current best at these merchants:</p>
      ${upgrades.map((u) => `
        <div class="upgrade">
          <div class="upgrade__text">
            At <strong>${escapeHtml(u.merchant.name)}</strong>, the
            <strong>${escapeHtml(u.globalBest.card.name)}</strong> earns ${fmtRate(u.globalBest.rate)}
            vs your ${fmtRate(u.ownedBest.rate)} (${escapeHtml(u.ownedBest.card.name)}).
          </div>
          <div class="upgrade__amt">+${rupee(u.extraAnnual)}/yr</div>
        </div>`).join('')}`;
  }

  /* ============================== MODAL =============================== */
  function openModal(cardId, opts = {}) {
    const c = CARD_BY_ID[cardId];
    if (!c) return;
    const selected = state.selectedCards.has(c.id);
    const advance = !!opts.advance;

    const tips = Array.isArray(c.tips) ? c.tips : [];
    const sources = Array.isArray(c.sources) ? c.sources : [];

    $('#modalPanel').innerHTML = `
      <button class="modal__close" data-action="closeModal" aria-label="Close">✕</button>
      <div class="modal__visual ${c.image ? 'modal__visual--photo' : ''}" style="background:${c.gradient}">
        ${c.image ? `<img class="modal__photo" src="${escapeHtml(c.image)}" alt="${escapeHtml(c.name)}" onerror="this.closest('.modal__visual').classList.remove('modal__visual--photo'); this.remove()" />` : ''}
        ${logoFor(c) ? `<img class="cardlet__logo" src="${escapeHtml(logoFor(c))}" alt="" onerror="this.remove()" />` : ''}
        <div class="cardlet__chip"></div>
        ${CONTACTLESS}
        <div class="cv-number">•••• •••• •••• ••••</div>
        ${networkMark(c)}
        ${c.source === 'ai' ? '<span class="cardlet__ai">AI</span>' : ''}
      </div>
      <div class="modal__body">
        <div class="modal__head">
          <div class="modal__issuer">${escapeHtml(c.issuer)}${networkLabelOf(c) ? ' · ' + escapeHtml(networkLabelOf(c)) : ''}</div>
          <h3 class="modal__name">${escapeHtml(c.name)}</h3>
        </div>
        <p class="modal__cvp">${escapeHtml(c.cvp || '')}</p>
        ${(c.bestFor && c.bestFor.length) ? `<div class="modal__tags">${c.bestFor.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="modal__row"><span>Reward currency</span><span>${escapeHtml(c.rewardUnit || '—')}</span></div>
        <div class="modal__row"><span>Annual fee</span><span>${escapeHtml(c.feeNote || '—')}</span></div>
        <div class="modal__row"><span>Base reward rate</span><span>${fmtRate(c.rewards.base)}</span></div>
        ${c.caps ? `<div class="modal__row"><span>Caps &amp; exclusions</span><span>${escapeHtml(c.caps)}</span></div>` : ''}
        ${c.notes && c.notes.length ? `<ul class="modal__notes">${c.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
        ${tips.length ? `
          <div class="modal__tips">
            <h4>💡 How to use it well</h4>
            <ul>${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
          </div>` : ''}
        ${c.source === 'ai' ? `
          <div class="modal__provenance">
            ✨ Researched by AI with live web data${c.asOf ? ` · reflects ${escapeHtml(c.asOf)}` : ''}. Always confirm current terms with the issuer.
            ${sources.length ? `<div class="modal__sources">${sources.map((u, i) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">source ${i + 1}</a>`).join(' · ')}</div>` : ''}
          </div>` : ''}
        ${advance ? `
          <div class="modal__added">✓ Added to your wallet</div>
          <p class="modal__nudge">Got more cards? Add them for a sharper strategy — or move on to where you spend.</p>
          <div class="modal__actions">
            <button class="btn btn--ghost" data-action="addAnother">+ Add another card</button>
            <button class="btn btn--primary" data-action="toMerchants">Pick where you spend →</button>
          </div>
        ` : `
          <button class="btn ${selected ? 'btn--ghost' : 'btn--primary'} modal__cta" data-toggle-card="${c.id}">
            ${selected ? '✓ Added to wallet — tap to remove' : '+ Add to my wallet'}
          </button>
        `}
      </div>`;
    $('#modal').hidden = false;
  }

  function closeModal() { $('#modal').hidden = true; }

  function openTerms() {
    $('#modalPanel').innerHTML = `
      <button class="modal__close" data-action="closeModal" aria-label="Close">✕</button>
      <div class="modal__visual modal__visual--terms"><div class="modal__terms-title">Terms &amp; Privacy</div></div>
      <div class="modal__body terms">
        <p class="terms__lead">Hi! 👋 A few honest, friendly notes about using CardWise.</p>

        <h4>It's guidance, not financial advice</h4>
        <p>CardWise helps you compare credit-card rewards using <strong>publicly available</strong>
        information. Reward rates are indicative and change often — always confirm the latest terms
        with your bank before deciding. We don't sell cards, earn commissions, or recommend based on
        anything other than public reward value.</p>

        <h4>What we keep — and what we don't</h4>
        <ul>
          <li><strong>We do note which cards people search for</strong> — just the card name you type,
          with a timestamp and a random, anonymous browser id — so we can understand demand and improve
          the platform.</li>
          <li><strong>We don't collect personal or financial data</strong> — no name, email, phone, card
          numbers or logins. Your selected cards and spending amounts stay in your browser and are never
          sent to us.</li>
          <li>Card analysis is generated by AI from public web sources and <strong>may contain errors</strong>
          — please double-check anything important.</li>
        </ul>

        <h4>Early access</h4>
        <p>The AI lookup may be limited to a set number of early testers; once that's reached, it closes.
        The on-page counter shows live progress.</p>

        <h4>Using the platform</h4>
        <p>By using CardWise (including the AI lookup) you agree to these terms. It's for personal,
        informational use and is provided "as is", without warranty.</p>

        <button class="btn btn--primary modal__cta" data-action="closeModal">Got it 👍</button>
      </div>`;
    $('#modal').hidden = false;
  }

  /* ===================== NETWORK PICKER ===================== */
  let pendingNetworkThen = null;
  function openNetworkPicker(cardId, onChosen) {
    const c = CARD_BY_ID[cardId];
    const nets = c ? networksOf(c) : [];
    if (!c || nets.length <= 1) { if (onChosen) onChosen(); return; }
    pendingNetworkThen = onChosen || null;
    $('#modalPanel').innerHTML = `
      <button class="modal__close" data-pick-network="${c.id}" data-net="" aria-label="Close">✕</button>
      <div class="modal__visual netpick__visual" style="background:${c.gradient}">
        ${logoFor(c) ? `<img class="cardlet__logo" src="${escapeHtml(logoFor(c))}" alt="" onerror="this.remove()" />` : ''}
        <div class="cardlet__chip"></div>
        ${CONTACTLESS}
        <div class="netpick__visual-name">${escapeHtml(c.name)}</div>
      </div>
      <div class="modal__body">
        <div class="netpick__head">
          <h3 class="netpick__title">Which network is your card on?</h3>
          <p class="netpick__sub">The <strong>${escapeHtml(c.name)}</strong> comes on more than one payment network. Pick the one printed on your card so your recommendations and card art are spot-on.</p>
        </div>
        <div class="net-picker">
          ${nets.map((n) => `
            <button class="net-option" data-pick-network="${c.id}" data-net="${n.key}">
              <span class="net-option__mark">${networkMarkByKey(n.key)}</span>
              <span class="net-option__label">${escapeHtml(n.label)}</span>
            </button>`).join('')}
        </div>
        <button class="btn btn--ghost netpick__skip" data-pick-network="${c.id}" data-net="">I'm not sure — skip for now</button>
      </div>`;
    $('#modal').hidden = false;
  }

  function chooseNetwork(cardId, net) {
    if (net) state.cardNetwork.set(cardId, net);
    else state.cardNetwork.delete(cardId);
    persist();
    renderCards();
    const then = pendingNetworkThen; pendingNetworkThen = null;
    closeModal();
    if (then) then();
  }

  /* ============ Agent overlay — reusable gamified "working" screen ============ */
  const ANALYZE_STEPS = [
    { ic: '🔎', tx: 'Searching the web for your card' },
    { ic: '📑', tx: 'Reading the latest rewards, fees & caps' },
    { ic: '🧮', tx: 'Crunching the value across your merchants' },
    { ic: '✨', tx: 'Building your personalised card profile' },
  ];
  const STRATEGY_STEPS = [
    { ic: '🧠', tx: 'Reading each card’s reward structure' },
    { ic: '🔗', tx: 'Matching your cards to your merchants' },
    { ic: '🧮', tx: 'Computing rewards at every merchant' },
    { ic: '🏆', tx: 'Picking the single best card per merchant' },
    { ic: '✨', tx: 'Finalising your personalised game-plan' },
  ];
  const CARD_FACTS = [
    'Clearing your full statement on time keeps 100% of your rewards — card interest erases them fast.',
    'There’s rarely one “best” card — the smartest pick changes from merchant to merchant.',
    'Many cards waive their annual fee once you cross a yearly spend milestone.',
    'Not all points are equal — 1 reward point can be worth ₹0.25 on one card and ₹1 on another.',
    'RuPay credit cards can link to UPI — handy for everyday QR-code payments.',
    'Co-branded cards often shine at one brand but stay average everywhere else.',
    'A fuel-surcharge waiver can quietly save frequent drivers a few hundred rupees a month.',
    'Stacking the right card with a live offer can lift your effective return nicely.',
  ];
  let axTimers = [];
  let axStepIdx = 0, axFactIdx = 0, axBar = 0, axStartMs = 0;
  let axSteps = ANALYZE_STEPS, axFacts = CARD_FACTS;

  function applyAxBar() { const el = $('#analyzeBarFill'); if (el) el.style.width = axBar + '%'; }
  function applyAxFact() { const el = $('#analyzeFact'); if (el && axFacts.length) el.textContent = axFacts[axFactIdx % axFacts.length]; }
  function setAxStep(i) {
    axStepIdx = i;
    $$('#analyzeSteps .ax-step').forEach((li) => {
      const k = Number(li.dataset.i);
      li.classList.toggle('is-done', k < i);
      li.classList.toggle('is-active', k === i);
    });
    const milestone = Math.round((i / Math.max(1, axSteps.length)) * 86) + 6;
    if (milestone > axBar) { axBar = milestone; applyAxBar(); }
  }

  // Show the agent overlay. opts: { orb, title (html), foot, steps, facts, stepInterval }
  function agentStart(opts) {
    const ov = $('#analyzeOverlay'); if (!ov) return;
    axSteps = opts.steps || []; axFacts = opts.facts || [];
    const set = (sel, prop, val) => { const el = $(sel); if (el) el[prop] = val; };
    set('#analyzeOrb', 'textContent', opts.orb || '✨');
    set('#analyzeTitle', 'innerHTML', opts.title || 'Working…');
    set('#analyzeFoot', 'textContent', opts.foot || '');
    const stepsEl = $('#analyzeSteps');
    if (stepsEl) stepsEl.innerHTML = axSteps.map((s, i) =>
      `<li class="ax-step" data-i="${i}"><span class="ax-step__ic">${s.ic}</span><span class="ax-step__tx">${s.tx}</span><span class="ax-step__tick">✓</span></li>`).join('');
    const factWrap = $('#analyzeFactWrap'); if (factWrap) factWrap.hidden = !axFacts.length;
    axBar = 6; applyAxBar(); setAxStep(0);
    axFactIdx = Math.floor(Math.random() * (axFacts.length || 1)); applyAxFact();
    axStartMs = Date.now();
    ov.hidden = false;
    axTimers.forEach(clearInterval); axTimers = [];
    const every = opts.stepInterval || 3600;
    axTimers.push(setInterval(() => { if (axStepIdx < axSteps.length - 1) setAxStep(axStepIdx + 1); }, every));
    if (axFacts.length) axTimers.push(setInterval(() => { axFactIdx = (axFactIdx + 1) % axFacts.length; applyAxFact(); }, 4200));
    axTimers.push(setInterval(() => { if (axBar < 93) { axBar += 1; applyAxBar(); } }, 700));
  }

  // Finish the overlay. Guarantees a minimum on-screen time so it's never a flash.
  function agentComplete(onDone) {
    const ov = $('#analyzeOverlay');
    const finish = () => {
      axTimers.forEach(clearInterval); axTimers = [];
      if (!ov) { if (onDone) onDone(); return; }
      setAxStep(axSteps.length); axBar = 100; applyAxBar();
      setTimeout(() => { ov.hidden = true; if (onDone) onDone(); }, 600);
    };
    const MIN = 1600, elapsed = Date.now() - axStartMs;
    if (elapsed < MIN) setTimeout(finish, MIN - elapsed); else finish();
  }

  /* A short, tasteful confetti burst — a little reward for adding a card. */
  function celebrate() {
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const colors = ['#6d5efc', '#28e0a8', '#ffd166', '#9d7bff', '#ff6b8a'];
    for (let i = 0; i < 80; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.25) + 's';
      p.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3200);
  }

  /* ===================== FEEDBACK (gamified) ===================== */
  let fbRating = 0, feedbackPrompted = false, feedbackSubmitted = false;
  const FB_LIKES = ['Best-card picks', 'The AI analysis', 'Design & UX', 'Speed', 'Easy to use', 'The gamification'];
  const FB_HINTS = ['', 'Not relevant', 'Somewhat relevant', 'Pretty good', 'Very relevant', 'Spot on! 🎯'];

  function openFeedback() {
    fbRating = 0;
    $('#modalPanel').innerHTML = `
      <button class="modal__close" data-action="closeModal" aria-label="Close">✕</button>
      <div class="modal__visual modal__visual--fb"><div class="fb-hero">💬 Help shape CardWise</div></div>
      <div class="modal__body fb">
        <p class="fb__lead">You're one of our first testers — thank you! 🙌 A few quick taps and you're done.</p>

        <div class="fb__q">
          <label>How relevant was your card strategy?</label>
          <div class="fb-stars" id="fbStars">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="fb-star" data-fb-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}
          </div>
          <div class="fb-stars__hint" id="fbStarsHint">Tap a star to rate</div>
        </div>

        <div class="fb__q">
          <label>What's working well? <span class="fb__opt">(tap any)</span></label>
          <div class="fb-chips">
            ${FB_LIKES.map((l) => `<button type="button" class="fb-chip" data-fb-like="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join('')}
          </div>
        </div>

        <div class="fb__q">
          <label for="fbImprove">What could be better?</label>
          <textarea id="fbImprove" class="fb-text" rows="2" maxlength="600" placeholder="Anything confusing, missing, or a bit off?"></textarea>
        </div>

        <div class="fb__q">
          <label for="fbFeature">A feature you'd love to see? ✨</label>
          <textarea id="fbFeature" class="fb-text" rows="2" maxlength="600" placeholder="Your idea could be the next thing we build."></textarea>
        </div>

        <button class="btn btn--primary modal__cta" data-action="submitFeedback">Send feedback →</button>
        <p class="fb__note">Anonymous — no personal data. It just helps us make CardWise better for everyone.</p>
      </div>`;
    $('#modal').hidden = false;
  }

  function setFbRating(n) {
    fbRating = n;
    $$('#fbStars .fb-star').forEach((s) => s.classList.toggle('is-on', Number(s.dataset.fbStar) <= n));
    const hint = $('#fbStarsHint'); if (hint) hint.textContent = FB_HINTS[n] || 'Tap a star to rate';
  }

  async function submitFeedback() {
    const likes = $$('.fb-chip.is-on').map((b) => b.dataset.fbLike);
    const improve = ($('#fbImprove') ? $('#fbImprove').value : '').trim();
    const feature = ($('#fbFeature') ? $('#fbFeature').value : '').trim();
    if (!fbRating && likes.length === 0 && !improve && !feature) {
      toast('Add a rating or a quick note 🙏', 'error');
      return;
    }
    feedbackSubmitted = true;
    showFeedbackThanks(); // optimistic — feedback should never feel slow
    const clientId = (window.CW_ACCESS && window.CW_ACCESS.getClientId) ? window.CW_ACCESS.getClientId() : '';
    try {
      await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: fbRating, likes, improve, feature, clientId }),
      });
    } catch (_) { /* best-effort; the thank-you is already shown */ }
  }

  function showFeedbackThanks() {
    celebrate();
    $('#modalPanel').innerHTML = `
      <button class="modal__close" data-action="closeModal" aria-label="Close">✕</button>
      <div class="modal__visual modal__visual--fb"><div class="fb-hero">🙌 Thank you!</div></div>
      <div class="modal__body fb fb--thanks">
        <h3>You just helped shape CardWise 💜</h3>
        <p>Every bit of feedback from our founding testers goes straight into what we build next. You're a legend.</p>
        <button class="btn btn--primary modal__cta" data-action="closeModal">Done</button>
      </div>`;
    $('#modal').hidden = false;
  }

  /* ============================== EVENTS ============================= */
  function bindEvents() {
    // global action buttons (data-action)
    document.addEventListener('click', (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (actionEl) handleAction(actionEl.dataset.action, e);

      // card info button
      const infoEl = e.target.closest('[data-info]');
      if (infoEl) { e.stopPropagation(); openModal(infoEl.dataset.info); return; }

      // "Analyze with AI" call-to-action
      const aiEl = e.target.closest('[data-ai-analyze]');
      if (aiEl) { startAnalyze(aiEl.dataset.aiAnalyze); return; }

      // network choice for a multi-network card
      const netEl = e.target.closest('[data-pick-network]');
      if (netEl) { chooseNetwork(netEl.dataset.pickNetwork, netEl.dataset.net || ''); return; }

      // feedback: star rating + "what's working" chips
      const starEl = e.target.closest('[data-fb-star]');
      if (starEl) { setFbRating(Number(starEl.dataset.fbStar)); return; }
      const likeEl = e.target.closest('[data-fb-like]');
      if (likeEl) { likeEl.classList.toggle('is-on'); return; }

      // select/deselect a card
      const cardEl = e.target.closest('[data-card]');
      if (cardEl) { toggleCard(cardEl.dataset.card); return; }

      // toggle from inside the modal
      const toggleEl = e.target.closest('[data-toggle-card]');
      if (toggleEl) { toggleCard(toggleEl.dataset.toggleCard); openModal(toggleEl.dataset.toggleCard); return; }

      // select/deselect a merchant (ignore clicks on the spend input)
      const merchEl = e.target.closest('[data-merchant]');
      if (merchEl && !e.target.closest('[data-spend]')) { toggleMerchant(merchEl.dataset.merchant); return; }
    });

    // card search
    $('#cardSearch').addEventListener('input', (e) => {
      state.cardQuery = e.target.value;
      renderCards();
    });
    // press Enter to analyze the typed card with AI
    $('#cardSearch').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = state.cardQuery.trim();
        if (q.length >= 2 && !state.analyzing) { e.preventDefault(); startAnalyze(q); }
      }
    });

    // merchant spend edits
    $('#merchantWrap').addEventListener('input', (e) => {
      const input = e.target.closest('[data-spend]');
      if (!input) return;
      const id = input.dataset.spend;
      if (state.selectedMerchants.has(id)) {
        state.selectedMerchants.set(id, Math.max(0, Number(input.value) || 0));
        persist();
      }
    });

    // close modal on Escape
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }

  function handleAction(action, e) {
    if (e) e.preventDefault();
    switch (action) {
      case 'home':
      case 'restart':
        if (action === 'restart' && !confirmRestart()) return;
        showView('landing');
        if (action === 'restart') resetAll();
        break;
      case 'start':
        showView('wizard'); showStep('cards'); renderCards(); updateCardFooter();
        if (window.CW_ACCESS) window.CW_ACCESS.refresh();
        break;
      case 'toCards':   closeModal(); showStep('cards'); break;
      case 'toMerchants':
        closeModal(); showStep('merchants'); renderMerchants(); break;
      case 'optimize':
        closeModal();
        // Agentic "building your strategy" screen, then reveal the game-plan.
        agentStart({
          orb: '🧠',
          title: 'Your <span>CardWise agent</span> is building your strategy…',
          foot: 'Comparing every one of your cards across your chosen merchants',
          steps: STRATEGY_STEPS, facts: CARD_FACTS, stepInterval: 520,
        });
        setTimeout(() => agentComplete(() => { showStep('results'); renderResults(); }), 2400);
        break;
      case 'addAnother': {
        closeModal();
        const s = $('#cardSearch'); if (s) s.focus();
        break;
      }
      case 'terms': openTerms(); break;
      case 'feedback': openFeedback(); break;
      case 'submitFeedback': submitFeedback(); break;
      case 'closeModal': closeModal(); break;
    }
  }

  function confirmRestart() {
    return confirm('Start over? This clears your selected cards and merchants.');
  }

  function resetAll() {
    state.selectedCards.clear();
    state.selectedMerchants.clear();
    state.cardQuery = '';
    const search = $('#cardSearch'); if (search) search.value = '';
    persist();
    renderCards(); updateCardFooter();
  }

  function toggleCard(id) {
    if (!CARD_BY_ID[id]) return;
    const adding = !state.selectedCards.has(id);
    if (adding) state.selectedCards.add(id);
    else state.selectedCards.delete(id);
    persist();
    renderCards();
    updateCardFooter();
    // If this card ships on multiple networks, ask which one is theirs.
    if (adding && needsNetworkChoice(CARD_BY_ID[id])) openNetworkPicker(id);
  }

  function toggleMerchant(id) {
    if (state.selectedMerchants.has(id)) {
      state.selectedMerchants.delete(id);
    } else {
      const m = window.CW_DATA.MERCHANT_BY_ID[id];
      state.selectedMerchants.set(id, m ? m.avgSpend : 0);
    }
    persist();
    renderMerchants();
  }

  /* ============================== UTIL ============================== */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  /* ============================== INIT ============================== */
  let booted = false;
  function init() {
    if (booted) return;            // idempotent — guard against a double DOMContentLoaded
    booted = true;

    // headline counts
    $('#statCards').textContent = CARDS.length;
    $('#statMerchants').textContent = MERCHANTS.length;

    restore();
    bindEvents();

    // If the user already has selections from a previous visit, jump them in.
    if (state.selectedCards.size > 0) {
      showView('wizard');
      showStep('cards');
      renderCards();
      updateCardFooter();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
