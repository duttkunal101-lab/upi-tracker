/* =============================================================================
 * CardWise — Optimization Engine
 * -----------------------------------------------------------------------------
 * Pure functions that turn "cards I own" + "where I spend" into a concrete
 * recommendation of which card to swipe at each merchant, with reasoning and
 * an estimated annual-rewards projection.
 * ========================================================================== */
(function () {
  'use strict';

  const { MERCHANT_BY_ID, CARD_BY_ID, CATEGORIES } = window.CW_DATA;

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
        return {
          card,
          rate,
          reason,
          tier,
          monthlyReward: (spend * rate) / 100,
        };
      })
      .sort((a, b) => {
        if (b.rate !== a.rate) return b.rate - a.rate;   // higher reward wins
        return a.card.annualFee - b.card.annualFee;       // tie-break: cheaper card
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

      const best = ranked[0];
      const spend = Number(monthlySpend) || 0;

      totalMonthlySpend += spend;
      totalMonthlyReward += best.monthlyReward;

      recommendations.push({
        merchant,
        monthlySpend: spend,
        best,
        runnersUp: ranked.slice(1, 3),
        allRanked: ranked,
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
   * "What am I leaving on the table?" — compares the user's best owned card at
   * each merchant against the best card in the *entire* database, to surface
   * upgrade opportunities. Returns the biggest gaps first.
   */
  function findUpgradeOpportunities(ownedCardIds, merchantSpends, limit = 3) {
    const owned = new Set(ownedCardIds);
    const allCardIds = window.CW_DATA.CARDS.map((c) => c.id);
    const gaps = [];

    merchantSpends.forEach(({ merchantId, monthlySpend }) => {
      const spend = Number(monthlySpend) || 0;
      if (spend <= 0) return;

      const ownedBest = rankCardsForMerchant(merchantId, ownedCardIds, spend)[0];
      const globalBest = rankCardsForMerchant(merchantId, allCardIds, spend)[0];
      if (!ownedBest || !globalBest) return;

      if (globalBest.rate > ownedBest.rate && !owned.has(globalBest.card.id)) {
        const extraAnnual = (globalBest.monthlyReward - ownedBest.monthlyReward) * 12;
        gaps.push({
          merchant: MERCHANT_BY_ID[merchantId],
          ownedBest,
          globalBest,
          extraAnnual,
        });
      }
    });

    return gaps.sort((a, b) => b.extraAnnual - a.extraAnnual).slice(0, limit);
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
