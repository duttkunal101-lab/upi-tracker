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
    cardQuery: '',
    analyzing: null,                   // name currently being analyzed by AI, or null
  };

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        cards: [...state.selectedCards],
        merchants: [...state.selectedMerchants.entries()],
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
          <div class="cardlet__visual" style="background:${c.gradient}">
            <div class="cardlet__chip"></div>
            ${c.source === 'ai' ? '<span class="cardlet__ai" title="Researched with AI + live web data">AI</span>' : ''}
            <div class="cardlet__issuer">${escapeHtml(c.issuer)}</div>
            <div class="cardlet__name">${escapeHtml(c.name)}</div>
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

    const result = await window.CW_AI.analyze(name);
    state.analyzing = null;

    if (result.ok) {
      state.selectedCards.add(result.card.id);
      state.cardQuery = '';
      const search = $('#cardSearch'); if (search) search.value = '';
      persist();
      renderCards();
      updateCardFooter();
      toast(`Added ${result.card.name}${result.cached ? '' : ' · analyzed with live web data'}`, 'success');
    } else {
      renderCards();
      toast(result.error, 'error');
    }
  }

  function updateCardFooter() {
    const n = state.selectedCards.size;
    $('#cardCount').textContent = `${n} card${n === 1 ? '' : 's'} selected`;
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
      <h3 class="results__section-title">🎯 Best card at every merchant</h3>
      ${strategy.recommendations.map(recRow).join('')}
      ${cardUsageBlock(strategy.cardUsage)}
      ${manageBlock(strategy.cardUsage)}
      ${upgradeBlock(upgrades)}
    `;
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
        <h2>Your personalised wallet strategy</h2>
        <p>Based on ${state.selectedCards.size} card${state.selectedCards.size === 1 ? '' : 's'} and ${state.selectedMerchants.size} merchant${state.selectedMerchants.size === 1 ? '' : 's'}.</p>
        <div class="results__metrics">
          <div class="metric"><strong class="accent">${rupee(t.annualReward)}</strong><span>estimated rewards / year</span></div>
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
  function openModal(cardId) {
    const c = CARD_BY_ID[cardId];
    if (!c) return;
    const selected = state.selectedCards.has(c.id);

    const tips = Array.isArray(c.tips) ? c.tips : [];
    const sources = Array.isArray(c.sources) ? c.sources : [];

    $('#modalPanel').innerHTML = `
      <button class="modal__close" data-action="closeModal" aria-label="Close">✕</button>
      <div class="modal__visual" style="background:${c.gradient}">
        <div class="cardlet__chip"></div>
        ${c.source === 'ai' ? '<span class="cardlet__ai">AI</span>' : ''}
        <div class="modal__issuer">${escapeHtml(c.issuer)}${c.network ? ' · ' + escapeHtml(c.network) : ''}</div>
        <div class="modal__name">${escapeHtml(c.name)}</div>
      </div>
      <div class="modal__body">
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
        <button class="btn ${selected ? 'btn--ghost' : 'btn--primary'} modal__cta" data-toggle-card="${c.id}">
          ${selected ? '✓ Added to wallet — tap to remove' : '+ Add to my wallet'}
        </button>
      </div>`;
    $('#modal').hidden = false;
  }

  function closeModal() { $('#modal').hidden = true; }

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
      case 'toCards':   showStep('cards'); break;
      case 'toMerchants':
        showStep('merchants'); renderMerchants(); break;
      case 'optimize':
        showStep('results'); renderResults(); break;
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
    if (state.selectedCards.has(id)) state.selectedCards.delete(id);
    else state.selectedCards.add(id);
    persist();
    renderCards();
    updateCardFooter();
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
