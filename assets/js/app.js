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
    const q = state.cardQuery.trim().toLowerCase();

    const matches = CARDS.filter((c) => {
      if (!q) return true;
      const hay = `${c.name} ${c.issuer} ${c.cvp} ${c.bestFor.join(' ')} ${c.rewardUnit}`.toLowerCase();
      return hay.includes(q);
    });

    if (matches.length === 0) {
      grid.innerHTML = `<div class="empty">No cards match “${escapeHtml(state.cardQuery)}”. Try another keyword.</div>`;
      return;
    }

    grid.innerHTML = matches.map((c) => {
      const selected = state.selectedCards.has(c.id);
      return `
        <article class="cardlet ${selected ? 'is-selected' : ''}" data-card="${c.id}">
          <div class="cardlet__check">✓</div>
          <div class="cardlet__visual" style="background:${c.gradient}">
            <div class="cardlet__chip"></div>
            <div class="cardlet__issuer">${escapeHtml(c.issuer)}</div>
            <div class="cardlet__name">${escapeHtml(c.name)}</div>
            <button class="cardlet__info" data-info="${c.id}" title="View details" aria-label="View details">i</button>
          </div>
          <div class="cardlet__body">
            <div class="cardlet__cvp">${escapeHtml(c.cvp)}</div>
            <div class="cardlet__meta">
              <span class="cardlet__fee">${escapeHtml(c.feeNote)}</span>
              <span class="cardlet__select">${selected ? 'Added' : 'Tap to add'}</span>
            </div>
          </div>
        </article>`;
    }).join('');
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
      ${upgradeBlock(upgrades)}
    `;
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

    $('#modalPanel').innerHTML = `
      <button class="modal__close" data-action="closeModal" aria-label="Close">✕</button>
      <div class="modal__visual" style="background:${c.gradient}">
        <div class="cardlet__chip"></div>
        <div class="modal__issuer">${escapeHtml(c.issuer)} · ${escapeHtml(c.network)}</div>
        <div class="modal__name">${escapeHtml(c.name)}</div>
      </div>
      <div class="modal__body">
        <p class="modal__cvp">${escapeHtml(c.cvp)}</p>
        <div class="modal__tags">${c.bestFor.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        <div class="modal__row"><span>Reward currency</span><span>${escapeHtml(c.rewardUnit)}</span></div>
        <div class="modal__row"><span>Annual fee</span><span>${escapeHtml(c.feeNote)}</span></div>
        <div class="modal__row"><span>Base reward rate</span><span>${fmtRate(c.rewards.base)}</span></div>
        <div class="modal__row"><span>Caps &amp; exclusions</span><span>${escapeHtml(c.caps)}</span></div>
        ${c.notes && c.notes.length ? `<ul class="modal__notes">${c.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
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
  function init() {
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
