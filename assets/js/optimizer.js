/* =============================================================================
 * CardWise — Optimization Engine
 * -----------------------------------------------------------------------------
 * Pure functions that turn "cards I own" + "where I spend" into a concrete
 * recommendation of which card to swipe at each merchant, with reasoning and
 * an estimated annual-rewards projection.
 * ========================================================================== */
(function () {
  'use strict';

  const { MERCHANT_BY_ID, CARD_BY_ID, CATEGORIES, networkKeyOf, networkAcceptedAt, NETWORK_LABEL } = window.CW_DATA;

  /**
   * Resolve a card's effective reward rate (%) at a given merchant, plus a
   * human-readable explanation of *why* that rate applies.
   * Priority: merchant override -> category bonus -> base rate.
   */
  function getEffectiveRate(card, merchant) {
    const r = card.rewards;

    if (r.merchant && Object.prototype.hasOwnProperty.call(r.merchant, merchant.id)) {
      return {
        rate: r.merchant[merchant.id],
        reason: `${fmtRate(r.merchant[merchant.id])} ${card.rewardUnit.toLowerCase()} on ${merchant.name}`,
        tier: 'merchant',
      };
    }

    if (r.category && Object.prototype.hasOwnProperty.call(r.category, merchant.category)) {
      const catName = CATEGORIES[merchant.category].name;
      return {
        rate: r.category[merchant.category],
        reason: `${fmtRate(r.category[merchant.category])} on the ${catName} category`,
        tier: 'category',
      };
    }

    return {
      rate: r.base,
      reason: `${fmtRate(r.base)} base ${card.rewardUnit.toLowerCase()} rate`,
      tier: 'base',
    };
  }

  /**
   * Rank every owned card for a single merchant, best first.
   * Returns an array of { card, rate, reason, tier, monthlyReward }.
   */
  function rankCardsForMerchant(merchantId, ownedCardIds, monthlySpend) {
    const merchant = MERCHANT_BY_ID[merchantId];
    if (!merchant) return [];

    const spend = Number(monthlySpend) || 0;

    return ownedCardIds
      .map((cardId) => CARD_BY_ID[cardId])
      .filter(Boolean)
      .map((card) => {
        const { rate, reason, tier } = getEffectiveRate(card, merchant);
        const networkKey = networkKeyOf(card);
        const accepted = networkAcceptedAt(networkKey, merchant.id);
        return {
          card,
          rate,
          reason,
          tier,
          monthlyReward: (spend * rate) / 100,
          networkKey,
          networkLabel: NETWORK_LABEL[networkKey] || '',
          accepted,
        };
      })
      .sort((a, b) => {
        if (a.accepted !== b.accepted) return a.accepted ? -1 : 1; // accepted cards first
        if (b.rate !== a.rate) return b.rate - a.rate;             // then higher reward
        return a.card.annualFee - b.card.annualFee;                // tie-break: cheaper card
      });
  }

  /**
   * Build the full wallet strategy across all selected merchants.
   *
   * @param {string[]} ownedCardIds
   * @param {Array<{merchantId:string, monthlySpend:number}>} merchantSpends
   * @returns {{
   *   recommendations: Array,
   *   totals: { monthlySpend, monthlyReward, annualReward, blendedRate },
   *   cardUsage: Array<{ card, merchants:string[], annualReward }>
   * }}
   */
  function buildStrategy(ownedCardIds, merchantSpends) {
    const recommendations = [];
    const usageMap = new Map(); // cardId -> { card, merchants:[], annualReward }

    let totalMonthlySpend = 0;
    let totalMonthlyReward = 0;

    merchantSpends.forEach(({ merchantId, monthlySpend }) => {
      const merchant = MERCHANT_BY_ID[merchantId];
      if (!merchant) return;

      const ranked = rankCardsForMerchant(merchantId, ownedCardIds, monthlySpend);
      if (ranked.length === 0) return;

      // `ranked` puts accepted cards first, so the best pick is one that will
      // actually swipe here. Note when a higher-reward card was blocked.
      const best = ranked[0];
      const topByRate = ranked.reduce((m, r) => (r.rate > m.rate ? r : m), ranked[0]);
      let acceptanceNote = '';
      if (!best.accepted) {
        acceptanceNote = `${best.networkLabel || 'This card'} isn't reliably accepted at ${merchant.name} — keep a Visa/RuPay card or UPI handy as backup.`;
      } else if (!topByRate.accepted && topByRate.rate > best.rate && topByRate.card.id !== best.card.id) {
        acceptanceNote = `${topByRate.card.name} would earn ${fmtRate(topByRate.rate)} here, but ${topByRate.networkLabel} has limited acceptance — so ${best.card.name} is the reliable pick.`;
      }

      const spend = Number(monthlySpend) || 0;

      totalMonthlySpend += spend;
      totalMonthlyReward += best.monthlyReward;

      recommendations.push({
        merchant,
        monthlySpend: spend,
        best,
        runnersUp: ranked.filter((r) => r.accepted && r.card.id !== best.card.id).slice(0, 2),
        allRanked: ranked,
        acceptanceNote,
      });

      // accumulate per-card usage for the summary view
      if (!usageMap.has(best.card.id)) {
        usageMap.set(best.card.id, { card: best.card, merchants: [], annualReward: 0 });
      }
      const usage = usageMap.get(best.card.id);
      usage.merchants.push(merchant.name);
      usage.annualReward += best.monthlyReward * 12;
    });

    // Sort recommendations by the size of the reward opportunity (most impactful first)
    recommendations.sort((a, b) => b.best.monthlyReward - a.best.monthlyReward);

    const cardUsage = Array.from(usageMap.values()).sort(
      (a, b) => b.annualReward - a.annualReward
    );

    const annualReward = totalMonthlyReward * 12;
    const blendedRate = totalMonthlySpend > 0
      ? (totalMonthlyReward / totalMonthlySpend) * 100
      : 0;

    return {
      recommendations,
      totals: {
        monthlySpend: totalMonthlySpend,
        monthlyReward: totalMonthlyReward,
        annualReward,
        blendedRate,
      },
      cardUsage,
    };
  }

  /**
   * Budget-aware "which new card should I add?" — for every card the user doesn't
   * own whose ANNUAL FEE is within their budget, computes the EXTRA rewards it
   * would earn across exactly the merchants they entered (if it became their best
   * card there), nets out its annual fee, and ranks by net benefit. Not random:
   * it's mapped to the user's own merchant-level spend and their fee budget.
   *
   * @param {object} opts { maxAnnualFee:number=Infinity, limit:number=3 }
   * @returns {Array<{card, extraAnnual, fee, net, wins:string[]}>}
   */
  function findUpgradeOpportunities(ownedCardIds, merchantSpends, opts = {}) {
    const limit = opts.limit || 3;
    // Budget filter on the new card's annual fee: 'lte' (≤ value) or 'gt' (> value).
    const feeOp = opts.feeOp || 'lte';
    const feeValue = opts.feeValue != null ? Number(opts.feeValue)
      : (opts.maxAnnualFee != null ? Number(opts.maxAnnualFee) : Infinity);
    const feeOk = (fee) => feeOp === 'gt' ? fee > feeValue : fee <= feeValue;
    const owned = new Set(ownedCardIds);
    const merchants = merchantSpends.filter((m) => (Number(m.monthlySpend) || 0) > 0);
    if (merchants.length === 0) return [];

    // Current best annual rewards with the cards the user already owns.
    const currentAnnual = merchants.reduce((sum, { merchantId, monthlySpend }) => {
      const best = rankCardsForMerchant(merchantId, ownedCardIds, monthlySpend)[0];
      return sum + (best ? best.monthlyReward * 12 : 0);
    }, 0);

    const candidates = window.CW_DATA.CARDS.filter(
      (c) => !owned.has(c.id) && feeOk(Number(c.annualFee) || 0)
    );

    return candidates
      .map((card) => {
        const withIds = [...ownedCardIds, card.id];
        let newAnnual = 0;
        const wins = [];
        merchants.forEach(({ merchantId, monthlySpend }) => {
          const best = rankCardsForMerchant(merchantId, withIds, monthlySpend)[0];
          if (!best) return;
          newAnnual += best.monthlyReward * 12;
          if (best.card.id === card.id) {
            const m = MERCHANT_BY_ID[merchantId];
            if (m) wins.push(m.name);
          }
        });
        const extraAnnual = newAnnual - currentAnnual;
        const fee = Number(card.annualFee) || 0;
        return { card, extraAnnual, fee, net: extraAnnual - fee, wins };
      })
      .filter((r) => r.extraAnnual > 0 && r.wins.length > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, limit);
  }

  /* ------------------------------- helpers -------------------------------- */
  function fmtRate(rate) {
    if (rate === 0) return '0%';
    // Trim trailing zeros: 3.30 -> 3.3, 5.00 -> 5
    return `${parseFloat(rate.toFixed(2))}%`;
  }

  window.CW_OPTIMIZER = {
    getEffectiveRate,
    rankCardsForMerchant,
    buildStrategy,
    findUpgradeOpportunities,
    fmtRate,
  };
})();
