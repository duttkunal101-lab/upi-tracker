/* =============================================================================
 * Axis Bank — Agentic Credit-Card Onboarding · CONFIG (data backbone)
 * -----------------------------------------------------------------------------
 * This file is the single source of truth for the whole experience:
 *   • brand tokens + the agent persona
 *   • the Axis credit-card catalogue used for agentic product recommendation
 *   • the ordered onboarding JOURNEY (each stage records what the customer does,
 *     what the agent does autonomously, the data points captured, the
 *     integrations invoked, and the RBI / regulatory touchpoints)
 *   • the integration registry, data-point map, regulatory map and nudge library
 *   • compliance copy (consents, MITC / Key Fact Statement, cooling-off)
 *
 * app.js renders the journey from here; the "Behind the scenes" blueprint drawer
 * reads the same objects, so the single website doubles as the strategy map.
 *
 * NOTE: This is a working PROTOTYPE. The regulated integrations below are
 * simulated (see integrations.js) with clearly-labelled mock data — a public web
 * demo cannot touch the real UIDAI / CKYC / CIBIL / Account-Aggregator rails.
 * Reward rates and fees are indicative of the public Indian market and should be
 * confirmed against current Axis Bank terms.
 * ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------------- brand */
  const brand = {
    bank: 'Axis Bank',
    product: 'Credit Card Onboarding',
    tagline: 'Dil Se Open',
    agentName: 'Aria',
    agentRole: 'your AI onboarding agent',
    logo: 'assets/cards/axis-bank-logo-png_seeklogo-14775.png', // uploaded official Axis Bank logo
    logoFallback: 'https://logo.clearbit.com/axisbank.com', // CDN fallback if the file is missing
    // Official Axis Bank mobile-banking app (verified store links)
    appLinks: {
      ios: 'https://apps.apple.com/in/app/axis-bank-mobile-banking/id699582556',
      android: 'https://play.google.com/store/apps/details?id=com.axis.mobile&hl=en_IN',
    },
    // Axis Bank brand palette (burgundy primary, raspberry + gold accents).
    // Swap these for the official brand book values when productionising.
    colors: {
      burgundy: '#97144D',
      raspberry: '#AE275F',
      plum: '#7A0E3E',
      gold: '#C7962B',
      ink: '#2B0A1B',
    },
  };

  /* --------------------------------------------------- Axis card catalogue */
  /* Used by the agent to recommend a best-fit card and by the product screen.
   * `match` weights map a declared lifestyle (see PROFILE_TAGS) to a card.   */
  const cards = [
    {
      id: 'ace',
      name: 'Axis Bank ACE Credit Card',
      segment: 'Everyday cashback',
      tagline: 'Flat, no-fuss cashback on the spends you make every day.',
      annualFee: 499,
      feeWaiver: '₹499 — reversed on ₹10,000 spend in 45 days; waived above ₹2L/yr',
      network: 'Visa',
      rewardUnit: 'Cashback',
      color: ['#1F8A70', '#0F5C49'],
      bestFor: ['Bills 5%', 'Food & Ola 4%', 'Everything 1.5%'],
      highlights: [
        '5% cashback on bill payments & recharges via Google Pay',
        '4% on Swiggy, Zomato and Ola (accelerated cashback capped ₹500/mo)',
        '1.5% unlimited cashback on all other spends',
        '4 complimentary domestic lounge visits/year (on ₹50k spend) + fuel-surcharge waiver',
      ],
      idealIf: ['bills', 'food', 'cabs', 'everyday', 'beginner'],
      minIncomeHint: 'Salaried ₹15,000+/month or an Axis FD',
    },
    {
      id: 'flipkart',
      name: 'Flipkart Axis Bank Credit Card',
      segment: 'Online shopping',
      tagline: 'Built for shoppers — unlimited cashback on Flipkart, Myntra & more.',
      annualFee: 500,
      feeWaiver: '₹500 — waived on annual spends above ₹3,50,000',
      network: 'Visa',
      rewardUnit: 'Cashback',
      color: ['#2874F0', '#1A4DA0'],
      bestFor: ['Flipkart 5%', 'Myntra 7.5%', 'Partners 4%'],
      highlights: [
        '5% cashback on Flipkart & Cleartrip (capped ₹4,000/quarter)',
        '7.5% cashback on Myntra (capped ₹4,000/quarter)',
        '4% on preferred partners — Swiggy, Uber, PVR, cult.fit',
        '1% on other spends + welcome ₹250 Flipkart & ₹100 Swiggy vouchers',
      ],
      idealIf: ['shopping', 'food', 'cabs', 'everyday'],
      minIncomeHint: 'Salaried ₹15,000+/month or self-employed ₹3L+/yr',
    },
    {
      id: 'atlas',
      name: 'Axis Bank Atlas Credit Card',
      segment: 'Travel & miles',
      tagline: 'Turn everyday spends into flights and hotel stays with EDGE Miles.',
      annualFee: 5000,
      feeWaiver: 'Milestone EDGE Miles & annual benefits offset the fee for frequent travellers',
      network: 'Visa',
      rewardUnit: 'EDGE Miles',
      premium: true,
      color: ['#0E3A5F', '#091F33'],
      bestFor: ['Travel 5x Miles', 'Lounge access', 'Transferable miles'],
      highlights: [
        '5 EDGE Miles per ₹100 on travel (airlines, hotels, Travel EDGE); 2 on other spends',
        'Tiered rewards — Silver → Gold → Platinum at ₹7.5L & ₹15L annual spends',
        'Domestic & international airport lounge access (tier-based)',
        'Transfer EDGE Miles to 20+ airline & hotel partners',
      ],
      idealIf: ['travel', 'flights', 'hotels', 'premium'],
      minIncomeHint: 'Salaried ₹9L+/yr or ITR ₹9L+/yr (self-employed)',
    },
    {
      id: 'airtel',
      name: 'Airtel Axis Bank Credit Card',
      segment: 'Bills & utilities',
      tagline: 'Best-in-class cashback on Airtel and your monthly utility bills.',
      annualFee: 500,
      feeWaiver: '₹500 fee waived on annual spends of ₹2,00,000+',
      network: 'Visa',
      rewardUnit: 'Cashback',
      color: ['#E40000', '#8C0000'],
      bestFor: ['Airtel 25%', 'Utilities 10%', 'Food 10%'],
      highlights: [
        '25% cashback on Airtel Mobile, Broadband & DTH (via Airtel Thanks)',
        '10% on utility bill payments (via Airtel Thanks)',
        '10% on Zomato, Blinkit & District (up to ₹200/partner/month)',
        '1% on all other spends',
      ],
      idealIf: ['bills', 'utilities', 'food', 'everyday'],
      minIncomeHint: 'Salaried ₹15,000+/month',
    },
    {
      id: 'myzone',
      name: 'Axis Bank MY Zone Credit Card',
      segment: 'Entertainment & lifestyle',
      tagline: 'An easy first card for OTT, dining and weekend plans.',
      annualFee: 500,
      feeWaiver: '₹500 fee — entry-level lifestyle benefits',
      network: 'Visa',
      rewardUnit: 'EDGE Reward Points',
      color: ['#7A2BBE', '#4A1A75'],
      bestFor: ['SonyLIV membership', 'Dining 15% off', 'Movies'],
      highlights: [
        'Complimentary SonyLIV Premium membership',
        'Buy-1-Get-1 on movie tickets (capped monthly)',
        'Up to 15% off at partner restaurants',
        '4 EDGE Reward Points per ₹200 spent',
      ],
      idealIf: ['entertainment', 'food', 'beginner', 'everyday'],
      minIncomeHint: 'Salaried ₹15,000+/month',
    },
    {
      id: 'neo',
      name: 'Axis Bank NEO Credit Card',
      segment: 'Entry-level online',
      tagline: 'A simple, near-free first credit card for online life.',
      annualFee: 250,
      feeWaiver: '₹250 fee — among Axis’ most accessible cards',
      network: 'Visa',
      rewardUnit: 'EDGE Reward Points',
      color: ['#FF6A2B', '#C2421A'],
      bestFor: ['Zomato / Blinkit offers', 'Tata Play / Myntra', 'Low fee'],
      highlights: [
        'Up to 40% off on Zomato, Blinkit & Tata Play (capped)',
        'Discounts on Myntra and other online partners',
        '1 EDGE Reward Point per ₹200 spent',
        'Low annual fee — a good first card',
      ],
      idealIf: ['beginner', 'shopping', 'food', 'everyday'],
      minIncomeHint: 'Salaried ₹15,000+/month — accessible eligibility',
    },
    {
      id: 'reserve',
      name: 'Axis Bank Reserve Credit Card',
      segment: 'Super-premium · invite',
      tagline: 'An ultra-premium card for unlimited travel, lifestyle and concierge.',
      annualFee: 50000,
      feeWaiver: '₹50,000 joining fee — milestone EDGE Points & benefits offset it for high spenders',
      network: 'Visa Infinite',
      rewardUnit: 'EDGE Reward Points',
      color: ['#0e0e0e', '#050505'],
      bestFor: ['Unlimited lounges', '15–30 EDGE pts/₹200', 'Concierge & golf'],
      highlights: [
        '15 EDGE Reward Points per ₹200 spent; 30 per ₹200 on international & travel spends',
        'Unlimited domestic & international airport lounge access (self + guest)',
        'Complimentary golf, 24×7 concierge, BookMyShow & fine-dining privileges',
        'Low 1.5% forex mark-up plus premium travel & purchase-protection covers',
      ],
      idealIf: ['premium', 'travel', 'hotels', 'flights'],
      minIncomeHint: 'By invitation — for high-net-worth customers',
      portrait: true,
      premium: true,
    },
    {
      id: 'burgundy',
      name: 'Axis Bank Burgundy Private Credit Card',
      segment: 'Ultra-premium · invite',
      tagline: 'The flagship card for Burgundy Private clients — unlimited luxury, travel and concierge.',
      annualFee: 50000,
      feeWaiver: '₹50,000 joining fee — milestone benefits & EDGE Points offset it for high spenders',
      network: 'Visa Infinite',
      rewardUnit: 'EDGE Reward Points',
      color: ['#0a0a0a', '#000000'],
      bestFor: ['Unlimited lounges', '10–25 EDGE pts/₹200', '24×7 luxury concierge'],
      highlights: [
        '10 EDGE Reward Points per ₹200 spent; up to 25 on premium categories',
        'Unlimited domestic & international lounge access for you and a guest',
        'Dedicated 24×7 luxury concierge, golf, fine-dining & hotel privileges',
        'Low 1.5% forex mark-up, premium travel insurance & purchase protection',
      ],
      idealIf: ['premium', 'travel', 'hotels', 'flights'],
      minIncomeHint: 'By invitation — for Axis Burgundy Private clients',
      portrait: true,
      premium: true,
    },
    {
      id: 'vistara',
      name: 'Axis Bank Vistara Infinite Credit Card',
      segment: 'Premium travel · co-brand',
      tagline: 'Turn everyday spends into Club Vistara Points and complimentary flight tickets.',
      annualFee: 10000,
      feeWaiver: '₹10,000 fee — a complimentary ticket & milestone benefits offset it for frequent flyers',
      network: 'Visa Infinite',
      rewardUnit: 'CV Points',
      premium: true,
      color: ['#0c0a06', '#1c1407'],
      bestFor: ['Complimentary flight tickets', '6 CV Points/₹200', 'Lounge access'],
      highlights: [
        'Complimentary Club Vistara Silver membership & milestone flight tickets',
        '6 CV Points per ₹200 spent — redeem for Vistara flights & upgrades',
        'Domestic & international airport lounge access',
        'Premium travel, dining and golf privileges',
      ],
      idealIf: ['travel', 'flights', 'premium', 'hotels'],
      minIncomeHint: 'Salaried ₹9L+/yr — for frequent travellers',
    },
    {
      id: 'samsung',
      name: 'Axis Bank Samsung Infinite Credit Card',
      segment: 'Co-brand · electronics',
      tagline: 'Big rewards on Samsung, with Visa Infinite travel privileges.',
      annualFee: 1500,
      feeWaiver: '₹1,500 fee — offset by milestone spends',
      network: 'Visa Infinite',
      rewardUnit: 'EDGE Reward Points',
      premium: true,
      color: ['#0a0a0a', '#2a0a4a'],
      bestFor: ['Up to 10% on Samsung', 'Lounge access', 'Milestone EDGE points'],
      highlights: [
        'Up to 10% cashback / EDGE Points on Samsung purchases & EMIs',
        'Accelerated EDGE Reward Points on everyday spends',
        'Complimentary domestic airport lounge access',
        'Visa Infinite travel, concierge and purchase-protection privileges',
      ],
      idealIf: ['shopping', 'premium', 'everyday'],
      minIncomeHint: 'Salaried — popular with Samsung buyers',
    },
    {
      id: 'lic',
      name: 'LIC Axis Bank Credit Card',
      segment: 'Insurance & everyday',
      tagline: 'Co-branded with LIC — rewards on insurance premiums and everyday spends.',
      annualFee: 0,
      feeWaiver: 'Lifetime-free — no joining or annual fee',
      network: 'Visa',
      rewardUnit: 'Reward Points',
      color: ['#7A0E3E', '#4A0A26'],
      bestFor: ['Reward pts on LIC premiums', 'Lounge access', 'Lifetime free'],
      highlights: [
        'Reward Points on LIC insurance premium payments',
        '2 Reward Points per ₹100 on everyday retail spends',
        'Complimentary domestic airport lounge access each quarter',
        'Fuel-surcharge waiver — and lifetime-free, no annual fee',
      ],
      idealIf: ['bills', 'everyday', 'beginner'],
      minIncomeHint: 'Salaried or self-employed; popular with LIC policyholders',
    },
    {
      id: 'insta-easy',
      name: 'Axis Bank Insta Easy Credit Card (against Fixed Deposit)',
      segment: 'Secured · new-to-credit',
      tagline: 'Build your credit score with a card backed by an Axis Fixed Deposit.',
      annualFee: 0,
      feeWaiver: 'Lifetime-free — issued against a Fixed Deposit',
      network: 'Visa',
      rewardUnit: 'EDGE Reward Points',
      color: ['#97144D', '#5E0C30'],
      bestFor: ['No income proof', 'New to credit', 'Up to 80% of FD as limit'],
      highlights: [
        'Approved against an Axis Fixed Deposit — no credit history needed',
        'Credit limit up to 80% of the FD value',
        'Helps build a CIBIL score responsibly',
        'Full rewards and EMI features of a regular card',
      ],
      idealIf: ['new-to-credit', 'thin-file', 'secured', 'beginner'],
      minIncomeHint: 'No income proof required — needs an Axis FD',
      secured: true,
    },
  ];

  /* Per-card reward VALUE rates by spend category (indicative ₹-back per ₹1),
   * used by the agent to compute estimated annual value for a customer's budget
   * and recommend the highest-value card. Miles/points are valued in rupees. */
  const cardRewards = {
    ace:          { shopping: 0.015, travel: 0.015, bills: 0.05, food: 0.04, entertainment: 0.015, cabs: 0.04, other: 0.015 },
    flipkart:     { shopping: 0.05,  travel: 0.015, bills: 0.015, food: 0.04, entertainment: 0.04, cabs: 0.04, other: 0.01 },
    atlas:        { shopping: 0.02,  travel: 0.05,  bills: 0.02, food: 0.02, entertainment: 0.02, cabs: 0.02, other: 0.02 },
    airtel:       { shopping: 0.01,  travel: 0.01,  bills: 0.10, food: 0.10, entertainment: 0.01, cabs: 0.01, other: 0.01 },
    myzone:       { shopping: 0.02,  travel: 0.01,  bills: 0.01, food: 0.05, entertainment: 0.05, cabs: 0.01, other: 0.01 },
    neo:          { shopping: 0.02,  travel: 0.01,  bills: 0.01, food: 0.02, entertainment: 0.02, cabs: 0.01, other: 0.005 },
    reserve:      { shopping: 0.015, travel: 0.03,  bills: 0.015, food: 0.015, entertainment: 0.015, cabs: 0.015, other: 0.015 },
    burgundy:     { shopping: 0.02,  travel: 0.035, bills: 0.02, food: 0.02, entertainment: 0.02, cabs: 0.02, other: 0.02 },
    vistara:      { shopping: 0.02,  travel: 0.04,  bills: 0.015, food: 0.02, entertainment: 0.015, cabs: 0.015, other: 0.015 },
    samsung:      { shopping: 0.04,  travel: 0.02,  bills: 0.015, food: 0.02, entertainment: 0.02, cabs: 0.015, other: 0.015 },
    lic:          { shopping: 0.005, travel: 0.005, bills: 0.02, food: 0.005, entertainment: 0.005, cabs: 0.005, other: 0.005 },
    'insta-easy': { shopping: 0.01,  travel: 0.01,  bills: 0.01, food: 0.01, entertainment: 0.01, cabs: 0.01, other: 0.01 },
  };
  /* Clean, structured display name shown on the card face. */
  const cardShortName = { ace: 'ACE', flipkart: 'Flipkart', atlas: 'Atlas', airtel: 'Airtel', myzone: 'MY Zone', neo: 'NEO', reserve: 'Reserve', burgundy: 'Burgundy Private', vistara: 'Vistara Infinite', samsung: 'Samsung Infinite', lic: 'LIC', 'insta-easy': 'Insta Easy' };
  /* Top merchants where each card saves the most — shown once the virtual card is live. */
  const cardMerchants = {
    ace:      [{ m: 'Google Pay bills', s: '5% cashback', i: '🧾' }, { m: 'Swiggy', s: '4% back', i: '🍔' }, { m: 'Zomato', s: '4% back', i: '🍕' }, { m: 'Ola', s: '4% back', i: '🚕' }],
    flipkart: [{ m: 'Flipkart', s: '5% cashback', i: '🛒' }, { m: 'Myntra', s: '7.5% back', i: '👗' }, { m: 'Swiggy', s: '4% back', i: '🍔' }, { m: 'Cleartrip', s: '5% back', i: '✈️' }],
    atlas:    [{ m: 'Airlines & hotels', s: '5 EDGE Miles/₹100', i: '✈️' }, { m: 'Travel EDGE', s: '5x Miles', i: '🏨' }, { m: 'Lounges', s: 'Free access', i: '🛋️' }, { m: 'Dining', s: '2x Miles', i: '🍽️' }],
    airtel:   [{ m: 'Airtel Thanks', s: '25% cashback', i: '📶' }, { m: 'Utility bills', s: '10% back', i: '💡' }, { m: 'Zomato', s: '10% back', i: '🍕' }, { m: 'Blinkit', s: '10% back', i: '🛍️' }],
    reserve:  [{ m: 'Airport lounges', s: 'Unlimited', i: '🛋️' }, { m: 'International spends', s: '30 pts/₹200', i: '🌍' }, { m: 'Golf & concierge', s: 'Complimentary', i: '⛳' }, { m: 'Fine dining', s: 'Privileges', i: '🍽️' }],
    burgundy: [{ m: 'Airport lounges', s: 'Unlimited +guest', i: '🛋️' }, { m: 'Luxury concierge', s: '24×7', i: '🎩' }, { m: 'Travel & hotels', s: '25 pts/₹200', i: '🏨' }, { m: 'Golf worldwide', s: 'Complimentary', i: '⛳' }],
    vistara:  [{ m: 'Vistara flights', s: '6 CV pts/₹200', i: '✈️' }, { m: 'Free flight ticket', s: 'Milestone', i: '🎟️' }, { m: 'Airport lounges', s: 'Complimentary', i: '🛋️' }, { m: 'Hotels & dining', s: 'Privileges', i: '🏨' }],
    samsung:  [{ m: 'Samsung Store', s: 'up to 10%', i: '📱' }, { m: 'Electronics & EMI', s: 'Accelerated', i: '💻' }, { m: 'Airport lounges', s: 'Complimentary', i: '🛋️' }, { m: 'Everyday spends', s: 'EDGE points', i: '💳' }],
    myzone:   [{ m: 'SonyLIV', s: 'Free Premium', i: '🎬' }, { m: 'Movies (BOGO)', s: 'Buy1Get1', i: '🎟️' }, { m: 'Partner dining', s: '15% off', i: '🍽️' }, { m: 'Everyday', s: '4 pts/₹200', i: '💳' }],
    neo:      [{ m: 'Zomato', s: 'up to 40% off', i: '🍕' }, { m: 'Blinkit', s: 'up to 40% off', i: '🛍️' }, { m: 'Tata Play', s: 'Discounts', i: '📺' }, { m: 'Myntra', s: 'Offers', i: '👗' }],
    lic:      [{ m: 'LIC premiums', s: 'Reward Points', i: '🛡️' }, { m: 'Everyday retail', s: '2 pts/₹100', i: '🛒' }, { m: 'Lounges', s: 'Quarterly', i: '🛋️' }, { m: 'Fuel', s: 'Surcharge waiver', i: '⛽' }],
    'insta-easy': [{ m: 'Everyday spends', s: 'EDGE Points', i: '💳' }, { m: 'Online & EMI', s: 'Full features', i: '🛒' }, { m: 'Fuel', s: 'Surcharge waiver', i: '⛽' }, { m: 'Build credit', s: 'Reports to CIBIL', i: '📈' }],
  };
  // Real uploaded card artwork (mapped by the card shown in each image). Cards without
  // an uploaded image keep the built-in design. Drop more files in axis/assets/cards/.
  const cardImage = {
    ace: 'assets/cards/axis-bank-ace-credit-card.webp',
    atlas: 'assets/cards/Axis-Atlas-1.webp',
    flipkart: 'assets/cards/flipkart-axis-credit-card.webp',
    reserve: 'assets/cards/Axis-Bank-Reserve-Credit-Card.png',
    burgundy: 'assets/cards/burgundy.png', // cropped from the uploaded "One Card" banner
    vistara: 'assets/cards/vistara.png', // cropped from the uploaded six-card collage
    samsung: 'assets/cards/samsung.png', // cropped from the uploaded six-card collage
    lic: 'assets/cards/lic.png',
    airtel: 'assets/cards/airtel.png', // cropped from the uploaded collage
  };
  /* Actionable "get the most from your card" tips — shown so onboarding educates. */
  const cardTips = {
    ace:      ['Pay every bill & recharge via Google Pay for 5% cashback', 'Order Swiggy, Zomato & Ola on this card for 4%', 'Spend ₹2L in a year and the ₹499 fee is waived'],
    flipkart: ['Do all your Flipkart & Cleartrip buys here for 5%', 'Shop Myntra on this card for 7.5% back', 'Pay Swiggy, Uber & PVR — they’re 4% partners'],
    atlas:    ['Book flights & hotels here to earn 5 EDGE Miles per ₹100', 'Cross ₹7.5L spend for Gold tier — more miles & lounges', 'Transfer Miles to partner airlines for the best value'],
    airtel:   ['Pay your Airtel bills here for 25% cashback', 'Clear every utility bill on this card for 10%', 'Order Zomato & Blinkit for 10% (up to ₹200/partner/mo)'],
    reserve:  ['Use it abroad — 30 EDGE pts/₹200 and a low 1.5% forex', 'Tap unlimited lounges for you and a guest', 'Let the 24×7 concierge handle bookings & gifting'],
    burgundy: ['Put travel & hotels on it for up to 25 pts/₹200', 'Bring a guest free into unlimited lounges', 'Use the luxury concierge for reservations & gifting'],
    vistara:  ['Spend to the milestone for a complimentary flight ticket', 'Book Vistara flights to earn 6 CV Points per ₹200', 'Use a lounge before every flight — it’s complimentary'],
    samsung:  ['Buy Samsung devices & EMIs here for up to 10% back', 'Put everyday spends on it to pile up EDGE Points', 'Use complimentary lounges whenever you travel'],
    myzone:   ['Stream free with the included SonyLIV Premium', 'Book movies for Buy-1-Get-1 tickets', 'Dine at partners for up to 15% off'],
    neo:      ['Order Zomato, Blinkit & Tata Play for up to 40% off', 'Keep it for low-fee everyday online spends', 'Pay in full each month to build your score'],
    lic:      ['Pay your LIC premiums here to earn reward points', 'Use it for everyday retail at 2 points per ₹100', 'It’s lifetime-free — small monthly spends keep it active'],
    'insta-easy': ['Spend a little each month and pay in full to build CIBIL', 'Keep usage under 30% of your limit', 'Set autopay so you never miss a due date'],
  };
  // annual spend (₹) that waives the joining/annual fee — used to weigh fees vs budget
  const cardFeeWaiverSpend = { ace: 200000, flipkart: 350000, airtel: 200000 };
  // notional ₹ value of a premium card's PERKS (unlimited lounges, concierge, golf,
  // insurance) — premium cards earn their keep here, not on cashback rate. Used only
  // when the customer says they're happy to pay a fee for perks.
  const cardPerkValue = { atlas: 18000, reserve: 60000, burgundy: 90000, vistara: 25000, samsung: 9000 };
  cards.forEach((c) => {
    c.rewards = cardRewards[c.id] || {};
    c.shortName = cardShortName[c.id] || c.name;
    c.feeWaiverSpend = cardFeeWaiverSpend[c.id] || 0;
    c.perkValue = cardPerkValue[c.id] || 0;
    // explicit uploaded art where we have it; else look for assets/cards/<id>.png
    // (e.g. airtel.png, myzone.png, neo.png, insta-easy.png) — auto-appears on upload,
    // falls back to the built-in design until then.
    c.image = cardImage[c.id] || ('assets/cards/' + c.id + '.png');
  });
  // Active lineup = only cards we have REAL artwork for (+ the secured fallback),
  // so every recommendation shows a real card. Upload airtel.png / myzone.png /
  // neo.png to axis/assets/cards and add their id here to bring them back.
  const liveCards = cards.filter((c) => cardImage[c.id] || c.secured);

  /* Lifestyle tags the agent asks about (minimum-click product discovery). */
  const profileTags = [
    { id: 'shopping', label: 'Online shopping', icon: '🛍️' },
    { id: 'travel', label: 'Travel & flights', icon: '✈️' },
    { id: 'bills', label: 'Bills & utilities', icon: '🧾' },
    { id: 'food', label: 'Food & dining', icon: '🍽️' },
    { id: 'entertainment', label: 'Movies & OTT', icon: '🎬' },
    { id: 'cabs', label: 'Cabs & commute', icon: '🚕' },
  ];

  /* -------------------------------------------------- integration registry */
  /* The real systems an agentic onboarding must orchestrate. The blueprint
   * drawer renders these per stage; integrations.js simulates them.          */
  const integrations = {
    'otp-sms': {
      name: 'SMS / OTP gateway (TRAI DLT)',
      providers: 'Gupshup · Karix · Route Mobile · Infobip',
      purpose: 'Verify the mobile number and capture time-stamped consent.',
      returns: 'Verified mobile, consent artifact',
    },
    'offers-engine': {
      name: 'Pre-approved offer / ETB engine',
      providers: 'Axis core banking + decisioning (internal)',
      purpose: 'Detect existing-to-bank relationships and pre-approved limits to skip steps.',
      returns: 'Pre-approved flag, indicative limit',
    },
    'nsdl-pan': {
      name: 'PAN verification',
      providers: 'Protean (NSDL e-Gov) · UTIITSL · Income-Tax PAN API',
      purpose: 'Validate PAN and fetch the name on record for a name match.',
      returns: 'PAN status, name as per ITD',
    },
    'digilocker': {
      name: 'DigiLocker',
      providers: 'MeitY DigiLocker (consent-based document fetch)',
      purpose: 'Pull Aadhaar XML, PAN, driving licence etc. with the customer’s consent.',
      returns: 'Aadhaar (masked), name, DOB, gender, address, photo',
    },
    'uidai-ekyc': {
      name: 'UIDAI Aadhaar e-KYC / OTP',
      providers: 'UIDAI (via KUA/ASA) — OTP & offline eKYC XML',
      purpose: 'Aadhaar-based identity verification with OTP consent; Aadhaar is masked & vaulted.',
      returns: 'Verified identity, address, photo (Aadhaar masked)',
    },
    'ckyc-cersai': {
      name: 'CKYC registry (CERSAI)',
      providers: 'CERSAI Central KYC Records Registry',
      purpose: 'Fetch an existing CKYC record to PRE-FILL KYC and avoid re-capture.',
      returns: 'CKYC number, name, address, photo, ID proofs',
    },
    'facematch': {
      name: 'Liveness + face match',
      providers: 'Liveness/face-match vendor (e.g. HyperVerge / IDfy / Signzy)',
      purpose: 'Confirm the live selfie matches the Aadhaar/PAN photo; anti-spoof liveness.',
      returns: 'Liveness pass, face-match score',
    },
    'vcip': {
      name: 'Video-based KYC (V-CIP)',
      providers: 'RBI-compliant V-CIP platform + trained Axis agent',
      purpose: 'Full KYC via live video with liveness, geo-tag and PAN/Aadhaar capture where required.',
      returns: 'V-CIP completion, recorded session, geo-location',
    },
    'cibil-bureau': {
      name: 'Credit bureau pull',
      providers: 'TransUnion CIBIL · Experian · Equifax · CRIF High Mark',
      purpose: 'Consent-based credit score, obligations and enquiry history for underwriting.',
      returns: 'Credit score, active loans, DPD, enquiries',
    },
    'account-aggregator': {
      name: 'Account Aggregator (DEPA)',
      providers: 'Sahamati AA network (Finvu, OneMoney, Anumati, CAMS)',
      purpose: 'Consent-based fetch of bank statements / income to assess affordability (FOIR).',
      returns: 'Income, average balance, inflows (with consent)',
    },
    'npci-pennydrop': {
      name: 'Bank account verification (penny-drop)',
      providers: 'NPCI / bank APIs (penny-drop & penny-less)',
      purpose: 'Verify the customer’s bank account & name match for auto-pay and refunds.',
      returns: 'Account validity, beneficiary name match',
    },
    'aml-screening': {
      name: 'AML / sanctions / PEP screening',
      providers: 'Watchlist screening vendor + RBI/UN/OFAC lists',
      purpose: 'PMLA due-diligence — screen against sanctions, PEP and negative lists; de-dupe.',
      returns: 'Screening cleared / referred',
    },
    'fraud-device': {
      name: 'Fraud & device intelligence',
      providers: 'Device fingerprinting + velocity / bureau fraud signals',
      purpose: 'Detect synthetic identity, device farms and application fraud in real time.',
      returns: 'Fraud risk score, device trust',
    },
    'esign': {
      name: 'Aadhaar eSign / e-agreement',
      providers: 'eSign ASP (e.g. NSDL eSign, Protean) — Aadhaar OTP / biometric',
      purpose: 'Legally e-sign the cardmember agreement and capture acceptance of MITC.',
      returns: 'Signed agreement, signature artifact',
    },
    'enach': {
      name: 'e-Mandate / e-NACH (autopay)',
      providers: 'NPCI NACH / e-Mandate (UPI Autopay, net-banking)',
      purpose: 'Set up auto-pay for bill payment with the customer’s consent.',
      returns: 'Active mandate (optional)',
    },
    'cms-issuer': {
      name: 'Card management system / issuer processor',
      providers: 'Issuer processor + card bureau (instant virtual + physical issuance)',
      purpose: 'Generate the account, credit line, virtual card and dispatch the physical card.',
      returns: 'Card account, virtual card token',
    },
    'tokenization': {
      name: 'Network & wallet tokenization',
      providers: 'Visa / Mastercard / RuPay + Apple Pay / Google Pay',
      purpose: 'Provision the card to mobile wallets securely (card-on-file tokenization).',
      returns: 'Network token, wallet provisioning',
    },
    'corebanking-crm': {
      name: 'Core banking + CRM',
      providers: 'Axis core banking + CRM / CDP (system of record)',
      purpose: 'Persist the customer, enable servicing, statements and lifecycle journeys.',
      returns: 'Customer 360, servicing hooks',
    },
    whatsapp: {
      name: 'WhatsApp / conversational channel',
      providers: 'WhatsApp Business API (Meta) via a BSP',
      purpose: 'Send resume links, reminders and let drop-offs continue on a familiar channel.',
      returns: 'Re-engagement, save-&-resume delivery',
    },
    'analytics-cdp': {
      name: 'Analytics / CDP / funnel',
      providers: 'Event analytics + experimentation (CDP, A/B)',
      purpose: 'Measure per-step drop-off, fire nudges, and A/B-test interventions.',
      returns: 'Funnel events, drop-off reasons',
    },
  };

  /* --------------------------------------------------------- regulatory map */
  const regulations = {
    'rbi-cc-2022': {
      name: 'RBI Master Direction — Credit Card (Issuance & Conduct), 2022',
      summary: 'Explicit consent to issue, MITC/Key Fact Statement, no unsolicited cards, OTP-based activation within 30 days, billing transparency, cooling-off / look-up period.',
    },
    'kyc-md': {
      name: 'RBI Master Direction — KYC, 2016 (as amended)',
      summary: 'Customer Due Diligence via V-CIP, Officially Valid Documents (OVD), CKYC, Aadhaar/OVD e-KYC and periodic updation.',
    },
    'aadhaar-act': {
      name: 'Aadhaar Act & UIDAI regulations',
      summary: 'Aadhaar used only with consent; number masked; stored in an Aadhaar Data Vault; no unauthorised retention.',
    },
    'cic-act': {
      name: 'Credit Information Companies (Regulation) Act, 2005',
      summary: 'A credit bureau may be queried only with the customer’s explicit consent for a specified purpose.',
    },
    'aa-depa': {
      name: 'RBI Account Aggregator framework (NBFC-AA / DEPA)',
      summary: 'Consent-driven, revocable, purpose-limited sharing of financial information through a licensed AA.',
    },
    'dpdp-2023': {
      name: 'Digital Personal Data Protection Act, 2023',
      summary: 'Notice + consent, purpose limitation, data minimisation, the right to access/correct/erase, and grievance redressal.',
    },
    pmla: {
      name: 'Prevention of Money Laundering Act (PMLA) & AML',
      summary: 'Customer due-diligence, sanctions/PEP screening, beneficial-ownership checks and record-keeping.',
    },
    'it-localisation': {
      name: 'IT / cyber-security & data localisation',
      summary: 'Payment and KYC data stored in India; RBI cyber-security and outsourcing controls apply.',
    },
    grievance: {
      name: 'Grievance redressal & Internal Ombudsman',
      summary: 'A disclosed, time-bound complaints process with escalation to the Internal Ombudsman and RBI Ombudsman.',
    },
  };

  /* --------------------------------------------------------- data-point map */
  /* For each field: where it comes from and whether it is auto-prefilled,
   * asked of the customer, or derived. Principle: PREFILL everything fetchable,
   * ask only what is missing — that is how the journey hits minimum clicks.   */
  const dataPoints = [
    { field: 'Mobile number', source: 'Customer + OTP gateway', mode: 'asked', consent: true },
    { field: 'Email', source: 'DigiLocker / CKYC', mode: 'prefilled', consent: true },
    { field: 'Pre-approved offer & limit', source: 'ETB / offers engine', mode: 'derived', consent: false },
    { field: 'KYC documents (Aadhaar e-KYC, PAN, address, photo)', source: 'DigiLocker / UIDAI / Protean', mode: 'prefilled', consent: true },
    { field: 'PAN', source: 'Customer or ETB + Protean verify', mode: 'asked', consent: true },
    { field: 'Father’s name', source: 'Aadhaar / CKYC', mode: 'prefilled', consent: true },
    { field: 'Name (verified)', source: 'PAN / Aadhaar / CKYC', mode: 'prefilled', consent: true },
    { field: 'Date of birth', source: 'Aadhaar / DigiLocker / CKYC', mode: 'prefilled', consent: true },
    { field: 'Gender', source: 'Aadhaar / DigiLocker', mode: 'prefilled', consent: true },
    { field: 'Address (current & permanent)', source: 'DigiLocker / CKYC (confirm/edit)', mode: 'prefilled', consent: true },
    { field: 'Photograph', source: 'Aadhaar / CKYC + live selfie', mode: 'prefilled', consent: true },
    { field: 'Liveness & face match', source: 'Liveness/face-match vendor', mode: 'derived', consent: true },
    { field: 'CKYC number', source: 'CERSAI CKYC registry', mode: 'derived', consent: true },
    { field: 'Credit score & obligations', source: 'Credit bureau (CIBIL etc.)', mode: 'derived', consent: true },
    { field: 'Income / affordability', source: 'Account Aggregator / ITR / payslip', mode: 'derived', consent: true },
    { field: 'Employer & employment type', source: 'Account Aggregator (salary credits)', mode: 'derived', consent: true },
    { field: 'Bank account (for auto-pay)', source: 'Penny-drop (NPCI)', mode: 'derived', consent: true },
    { field: 'Spending preferences', source: 'Customer (lifestyle taps)', mode: 'asked', consent: false },
    { field: 'AML / sanctions status', source: 'Screening vendor + watchlists', mode: 'derived', consent: false },
    { field: 'Consent artifacts (timestamp, IP)', source: 'Consent capture (DPDP)', mode: 'derived', consent: true },
  ];

  /* ------------------------------------------------------------- the journey */
  /* Stages 1–8 are the wizard; landing & welcome are framed separately.
   * `integrations` / `regulations` hold ids into the registries above.        */
  const stages = [
    {
      key: 'start', num: 1, label: 'Start', icon: '📱', minutes: 1,
      headline: 'Let’s get you a card in minutes',
      sub: 'We’ll start with your mobile number — and pick up any pre-approved offer waiting for you.',
      customerDoes: 'Enter mobile number, verify OTP, give one consolidated consent.',
      agentDoes: [
        'Verify the number and capture time-stamped consent (DPDP).',
        'Silently check for an existing relationship or pre-approved offer to skip steps.',
      ],
      dataPoints: ['Mobile number', 'Pre-approved offer & limit', 'Consent artifacts'],
      integrations: ['otp-sms', 'offers-engine', 'analytics-cdp'],
      regulations: ['rbi-cc-2022', 'dpdp-2023'],
      nudge: 'Most people finish this whole journey in under 6 minutes.',
    },
    {
      key: 'product', num: 3, label: 'Your card', icon: '💳', minutes: 1,
      headline: 'Aria will pick the right Axis card for you',
      sub: 'Tap what you spend on. The agent matches you to the best-fit Axis card — change it any time.',
      customerDoes: 'Tap 1–3 lifestyle interests (or browse the full range) and pick a card.',
      agentDoes: [
        'Recommend the best-fit Axis card from your spending profile, with reasoning.',
        'Show fees, key rewards and the Most Important Terms up-front — no surprises.',
      ],
      dataPoints: ['Spending preferences', 'Employment type'],
      integrations: ['offers-engine', 'analytics-cdp'],
      regulations: ['rbi-cc-2022'],
      nudge: 'You can switch cards later — nothing here is final.',
    },
    {
      key: 'kyc', num: 2, label: 'Identity (KYC)', icon: '🪪', minutes: 2,
      headline: 'Verify your identity — your way',
      sub: 'Choose how to verify: DigiLocker, Aadhaar OTP, document upload or Video-KYC. I verify first, then fill your form from the verified source.',
      customerDoes: 'Enter PAN, consent to DigiLocker, confirm pre-filled details, take a selfie (V-CIP if needed).',
      agentDoes: [
        'Validate PAN and fetch the name on record (Protean/NSDL).',
        'Pull identity & address from DigiLocker / Aadhaar e-KYC and CKYC to pre-fill.',
        'Run liveness + face match; schedule V-CIP video where full KYC is required.',
        'Mask the Aadhaar number and store it in an Aadhaar Data Vault.',
      ],
      dataPoints: ['Documents (Aadhaar e-KYC, PAN, address)', 'PAN', 'Name (verified)', 'Date of birth', 'Gender', 'Email', 'Address (current & permanent)', 'Photograph', 'Liveness & face match', 'CKYC number'],
      integrations: ['nsdl-pan', 'digilocker', 'uidai-ekyc', 'ckyc-cersai', 'facematch', 'vcip', 'geotag'],
      regulations: ['kyc-md', 'aadhaar-act', 'dpdp-2023'],
      nudge: 'We never store your full Aadhaar number — it stays masked and vaulted.',
    },
    {
      key: 'assessment', num: 4, label: 'Eligibility', icon: '📊', minutes: 1,
      headline: 'A quick, consented credit & income check',
      sub: 'With your permission, the agent checks your credit bureau record and income to set your limit.',
      customerDoes: 'Consent to the credit bureau pull and (if needed) share income via Account Aggregator.',
      agentDoes: [
        'Pull your credit bureau record (CIBIL/Experian/Equifax/CRIF) with explicit consent.',
        'Assess affordability via Account Aggregator bank statements / ITR (FOIR).',
        'Verify your bank account with a penny-drop; screen for AML & fraud.',
        'If you’re new to credit, prepare a secured-card-against-FD path instead.',
      ],
      dataPoints: ['Credit score & obligations', 'Income / affordability', 'Employer & employment type', 'Bank account (for auto-pay)', 'AML / sanctions status'],
      integrations: ['cibil-bureau', 'account-aggregator', 'npci-pennydrop', 'aml-screening', 'fraud-device'],
      regulations: ['cic-act', 'aa-depa', 'pmla', 'dpdp-2023'],
      nudge: 'A bureau check here is a “soft to hard” pull made only with your consent.',
    },
    {
      key: 'decision', num: 5, label: 'Your offer', icon: '✅', minutes: 1,
      headline: 'Your personalised offer is ready',
      sub: 'The agent combines KYC, bureau and income with Axis policy to make a real-time decision.',
      customerDoes: 'Review your approved card, credit limit, interest and fees (Key Fact Statement).',
      agentDoes: [
        'Run real-time underwriting and assign a credit limit and interest rate.',
        'Present the offer transparently with a Key Fact Statement and MITC summary.',
        'Never dead-end a decline — offer a lower limit, a secured card, or a callback.',
      ],
      dataPoints: ['Credit score & obligations', 'Income / affordability', 'Pre-approved offer & limit'],
      integrations: ['offers-engine', 'aml-screening', 'corebanking-crm'],
      regulations: ['rbi-cc-2022', 'pmla', 'grievance'],
      nudge: 'Every fee and charge is shown before you accept — that’s your Key Fact Statement.',
    },
    {
      key: 'agreement', num: 6, label: 'Confirm & sign', icon: '✍️', minutes: 1,
      headline: 'Accept the terms and e-sign',
      sub: 'Review the Most Important Terms, give explicit consent to issue, and e-sign with Aadhaar.',
      customerDoes: 'Read the MITC / Key Fact Statement, accept, give OTP consent to issue, and e-sign.',
      agentDoes: [
        'Capture explicit OTP-based consent to ISSUE the card (RBI — no unsolicited cards).',
        'Generate the cardmember agreement and complete Aadhaar eSign.',
        'Disclose the cooling-off / look-up period and how to opt out without charge.',
      ],
      dataPoints: ['Consent artifacts (timestamp, IP)'],
      integrations: ['esign', 'corebanking-crm', 'analytics-cdp'],
      regulations: ['rbi-cc-2022', 'dpdp-2023', 'grievance'],
      nudge: 'You can cancel within the cooling-off window at no cost.',
    },
    {
      key: 'issuance', num: 7, label: 'Get your card', icon: '🎉', minutes: 1,
      headline: 'Your virtual card is live',
      sub: 'Use your card instantly while the physical card is on its way. Add it to your wallet now.',
      customerDoes: 'Set a PIN, add the card to Apple/Google Pay, optionally set up autopay.',
      agentDoes: [
        'Issue the account, credit line and an instant VIRTUAL card; dispatch the physical card.',
        'Provision the card to mobile wallets via network tokenization.',
        'Set up e-NACH autopay if you opt in; respect 30-day activation consent rules.',
      ],
      dataPoints: ['Bank account (for auto-pay)'],
      integrations: ['cms-issuer', 'tokenization', 'enach', 'corebanking-crm'],
      regulations: ['rbi-cc-2022', 'it-localisation'],
      nudge: 'RBI requires your consent to keep the card active if it’s unused for 30 days.',
    },
    {
      key: 'welcome', num: 8, label: 'Welcome', icon: '🌟', minutes: 1,
      headline: 'Welcome to Axis Bank',
      sub: 'A quick tour, your first-use perks, and everything set up for you.',
      customerDoes: 'See your benefits, make a first transaction, and explore the app.',
      agentDoes: [
        'Personalise a welcome and feature tour for your chosen card.',
        'Nudge a rewarding first transaction and surface relevant benefits.',
        'Hand over to servicing — statements, controls and help, all with consent.',
      ],
      dataPoints: [],
      integrations: ['corebanking-crm', 'whatsapp', 'analytics-cdp'],
      regulations: ['grievance', 'dpdp-2023'],
      nudge: 'Your rewards activate from your very first swipe.',
    },
  ];

  /* ----------------------------------------------- consents, MITC, cooling-off */
  const legal = {
    /* Consents surfaced at the right moments (DPDP notice + purpose). */
    consents: {
      start: 'I authorise Axis Bank (and its partners) to contact me about this application and to verify my mobile number. I have read the Terms and Privacy Notice.',
      bureau: 'I give my explicit consent to Axis Bank to fetch my credit information report from a credit information company (CIBIL/Experian/Equifax/CRIF) for the purpose of assessing this credit-card application.',
      aa: 'I consent to share my bank-statement / income information through a licensed Account Aggregator for the limited purpose of assessing my eligibility. This consent is revocable.',
      issue: 'I have read the Most Important Terms & Conditions and the Key Fact Statement. I give my explicit consent to Axis Bank to issue this credit card to me.',
    },
    /* Most Important Terms & Conditions — summarised (indicative). */
    mitc: [
      { label: 'Joining / annual fee', value: 'As shown on your card — waived on meeting the stated annual spend.' },
      { label: 'Finance charge (APR)', value: 'Up to ~3.6% per month (~52.86% p.a.) on revolving balances & cash; varies by profile.' },
      { label: 'Interest-free period', value: 'Up to 50 days, only if the total amount due is paid in full by the due date.' },
      { label: 'Cash withdrawal fee', value: '2.5% of the amount (min ₹500) plus finance charges from day one.' },
      { label: 'Late payment fee', value: 'Slab-based on the total amount due, as per the schedule of charges.' },
      { label: 'Overlimit / other charges', value: 'As disclosed in the schedule of charges; surcharges may apply (e.g. fuel, rent).' },
      { label: 'Billing & disputes', value: 'Monthly statement; raise disputes within the stated window; transparent grievance redressal.' },
      { label: 'Cooling-off / look-up', value: 'Cancel within the cooling-off window after issuance at no cost (pro-rata reversal of fees).' },
    ],
    coolingOff: 'You may surrender the card within the cooling-off / look-up period after issuance without any charge, other than the proportionate interest on any amount spent. We will tell you exactly how, in-app.',
    disclaimer: 'This is a working prototype for demonstration. Identity, credit-bureau, Account-Aggregator and issuance steps are simulated with mock data and clearly labelled. Reward rates, fees and policies are indicative of the public Indian market — confirm current terms with Axis Bank.',
  };

  /* ------------------------------------------------------------ nudge library */
  /* Interventions that lift conversion / reduce drop-off, fired by app.js.    */
  const nudges = {
    inactivity: [
      'Stuck on something? I can explain why we ask for it, or do this step for you.',
      'Still there? Your progress is saved — pick up exactly where you left off, any time.',
      'Want me to continue this for you? I can fetch your details automatically.',
    ],
    exitIntent: {
      title: 'Save your progress?',
      body: 'You’re almost there. We’ll keep your progress safe and send you a secure link to continue on WhatsApp, SMS or email — no need to start over.',
      stay: 'Continue here',
      save: 'Save & send me a link',
    },
    channelSwitch: 'Prefer a hand? You can switch to WhatsApp, ask for a callback, book a video-KYC slot, or visit a branch — and resume right here.',
    declined: 'This isn’t the end of the road. I can offer you a secured card against an Axis Fixed Deposit (no income proof, builds your score), a lower starting limit, or a callback from a specialist.',
    /* short, contextual "why we ask" micro-copy keyed by stage */
    why: {
      start: 'Your mobile number is how we verify it’s you and keep your application secure (RBI/TRAI).',
      product: 'Your spending pattern lets me match the card that earns you the most — no obligation.',
      kyc: 'KYC is a regulatory must (RBI). We pull most of it from DigiLocker/CKYC so you barely type.',
      assessment: 'A consented credit & income check sets a responsible limit — it protects you too.',
      decision: 'Showing the limit, rate and fees up-front is your Key Fact Statement, required by RBI.',
      agreement: 'Explicit consent to issue is mandatory — RBI prohibits issuing a card without it.',
      issuance: 'A virtual card lets you start now; the physical card follows by post.',
    },
  };

  /* ------------------------------------------------------ "did you know" facts */
  const facts = [
    'RBI’s 2022 Master Direction bans unsolicited credit cards — your explicit consent is mandatory.',
    'CKYC lets banks reuse your KYC across institutions, so you don’t re-submit documents every time.',
    'Video-KYC (V-CIP) was enabled by RBI in 2020 — full KYC without visiting a branch.',
    'The Account Aggregator framework lets you share bank data securely, with revocable consent.',
    'Your Aadhaar number is masked and stored in a dedicated “Aadhaar Data Vault”, never in plain text.',
    'A credit bureau can be checked only with your explicit, purpose-specific consent (CIC Act).',
    'New to credit? A secured card against a fixed deposit is a proven way to build a CIBIL score.',
    'DigiLocker documents are legally at par with originals under the IT Act.',
  ];

  /* live application status shown to the customer in real time, per stage */
  const appStatus = {
    start: 'Application started',
    product: 'Card selected',
    kyc: 'Verifying your identity',
    assessment: 'Eligibility checked',
    decision: 'Offer ready',
    agreement: 'Agreement signed',
    issuance: 'Card issued',
    welcome: 'Onboarding complete',
  };

  /* post-issuance card delivery tracking — "till the customer gets the card" */
  const delivery = [
    { key: 'issued', label: 'Card issued · virtual card live' },
    { key: 'printed', label: 'Physical card personalised & printed' },
    { key: 'dispatched', label: 'Dispatched via courier (trackable)' },
    { key: 'out', label: 'Out for delivery' },
    { key: 'delivered', label: 'Delivered & ready to activate' },
  ];

  /* trust layer — reassurance shown wherever automation happens */
  const trust = {
    promises: [
      { icon: '🔒', t: 'Bank-grade encryption' },
      { icon: '⚖️', t: 'RBI & DPDP compliant' },
      { icon: '✋', t: 'Your consent · revocable' },
      { icon: '🙈', t: 'Aadhaar masked & vaulted' },
    ],
    why: {
      kyc: 'I only read your KYC to confirm it’s you. Your Aadhaar number is masked and kept in a secure vault — never stored in full — and you can revoke DigiLocker access anytime. I don’t see any password.',
      assessment: 'I check your credit bureau only with your explicit consent (CIC Act), for this application alone — and your bank data comes read-only through the RBI Account Aggregator, which you can revoke. This protects you from over-borrowing too.',
      agreement: 'Nothing is issued without your explicit OTP consent — RBI prohibits unsolicited cards. Every fee is disclosed up-front in your Key Fact Statement, and you have a cooling-off window to cancel at no cost.',
    },
  };

  /* gamification — points, levels, milestone badges, and "card school" knowledge */
  const gamify = {
    points: { start: 20, kyc: 40, product: 20, assessment: 30, decision: 20, agreement: 20, issuance: 50 },
    badges: {
      kyc: { icon: '🛡️', label: 'Identity Verified' },
      assessment: { icon: '📊', label: 'Eligibility Cleared' },
      decision: { icon: '⭐', label: 'Approved!' },
      agreement: { icon: '✍️', label: 'Signed & Sealed' },
      issuance: { icon: '💳', label: 'Card Unlocked!' },
    },
    levels: ['Newcomer', 'Explorer', 'Achiever', 'Cardholder'],
    levelSize: 60, // points per level (start→issuance totals 200 → reaches Cardholder)
    // a tangible "you just unlocked…" line per milestone, shown on the points pop
    unlocks: {
      kyc: 'Identity locked in — your data is vaulted 🔐',
      product: 'Best-value card matched to your budget 🎯',
      assessment: 'Eligibility cleared — limit incoming 📈',
      decision: 'Approved! Your limit is set ⭐',
      agreement: 'Signed & sealed ✍️',
      issuance: 'Card unlocked — rewards now live 💳',
    },
  };

  /* NTB / ETB — the relationship the agent detects and explains to the customer */
  const relationship = {
    ntb: {
      tag: 'New to Axis', code: 'NTB', icon: '🆕',
      line: 'I checked Axis Bank’s core-banking records against your mobile number and found <strong>no existing relationship</strong> — so you’re New to Bank (NTB). RBI requires a one-time full KYC for a new customer, which I’ll guide you through.',
    },
    etb: {
      tag: 'Existing Axis customer', code: 'ETB', icon: '✓',
      line: 'I matched your mobile number to an <strong>existing Axis Bank account</strong>, so you’re an Existing-to-Bank (ETB) customer — I can reuse your current KYC and fast-track you with fewer steps.',
    },
  };

  /* the agent's agenda — the autonomous plan Aria executes for a NTB customer */
  const agentPlan = [
    'Find your best-fit Axis card',
    'Verify your identity — full KYC, done for you',
    'Check your eligibility (with your consent)',
    'Issue your card instantly',
    'Track it all the way to your door',
  ];

  /* documents Axis requests through the DigiLocker consent handshake */
  const digiLockerDocs = [
    { name: 'Aadhaar (e-KYC XML)', issuer: 'UIDAI', purpose: 'Identity, address & photo' },
    { name: 'PAN Verification Record', issuer: 'Income Tax Dept · Protean', purpose: 'PAN & name match' },
    { name: 'Driving Licence', issuer: 'Ministry of Road Transport', purpose: 'Additional address proof (optional)' },
  ];

  /* ---------------------------------------------------------------- exports */
  window.AX_CONFIG = {
    brand, cards: liveCards, profileTags, integrations, regulations,
    dataPoints, stages, legal, nudges, facts, cardMerchants, cardTips,
    appStatus, delivery, digiLockerDocs, agentPlan, gamify, trust, relationship,
    // convenience lookups (cardById spans the full catalogue for safe id lookups)
    stageByKey: stages.reduce((m, s) => (m[s.key] = s, m), {}),
    cardById: cards.reduce((m, c) => (m[c.id] = c, m), {}),
  };
})();
