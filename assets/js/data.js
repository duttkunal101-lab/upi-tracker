/* =============================================================================
 * CardWise — Data Layer
 * -----------------------------------------------------------------------------
 * A curated database of popular Indian credit cards and the merchants people
 * spend at. Reward rates are stored as the *effective return %* (already
 * converting reward points/miles to rupee value) so the optimizer can compare
 * every card on an apples-to-apples basis.
 *
 * Reward resolution priority for a card at a merchant:
 *     1. rewards.merchant[merchantId]   (co-branded / accelerated rate)
 *     2. rewards.category[categoryId]   (category bonus)
 *     3. rewards.base                   (everything-else rate)
 *
 * NOTE: Rates are indicative, based on publicly published programs, and meant
 * for guidance only. Issuers revise reward programs, caps and exclusions
 * frequently — always confirm current terms with your bank.
 * ========================================================================== */

/* ----------------------------- Spend categories --------------------------- */
const CATEGORIES = {
  'online-shopping': { name: 'Online Shopping', icon: '🛍️' },
  'food-delivery':   { name: 'Food Delivery',   icon: '🍔' },
  'groceries':       { name: 'Groceries & Quick Commerce', icon: '🛒' },
  'travel':          { name: 'Travel',          icon: '✈️' },
  'cabs':            { name: 'Cabs & Transport', icon: '🚕' },
  'dining':          { name: 'Dining Out',      icon: '🍽️' },
  'entertainment':   { name: 'Entertainment',   icon: '🎬' },
  'fuel':            { name: 'Fuel',            icon: '⛽' },
  'bills':           { name: 'Bills & Recharges', icon: '🧾' },
  'wellness':        { name: 'Health & Wellness', icon: '💊' },
  'international':    { name: 'International Spends', icon: '🌍' },
};

/* -------------------------------- Merchants ------------------------------- */
/* Each merchant belongs to a category, which acts as the fallback for cards
 * that don't single out the merchant. `avgSpend` seeds the monthly-spend field
 * so the projection feels real before the user customises it. */
const MERCHANTS = [
  // Online shopping
  { id: 'amazon',     name: 'Amazon',     category: 'online-shopping', icon: '📦', avgSpend: 4000 },
  { id: 'flipkart',   name: 'Flipkart',   category: 'online-shopping', icon: '🛍️', avgSpend: 3000 },
  { id: 'myntra',     name: 'Myntra',     category: 'online-shopping', icon: '👗', avgSpend: 2000 },
  { id: 'nykaa',      name: 'Nykaa',      category: 'online-shopping', icon: '💄', avgSpend: 1500 },
  { id: 'ajio',       name: 'Ajio',       category: 'online-shopping', icon: '🧥', avgSpend: 1500 },
  { id: 'tatacliq',   name: 'Tata CLiQ',  category: 'online-shopping', icon: '🏬', avgSpend: 1500 },
  { id: 'tataneu',    name: 'Tata Neu',   category: 'online-shopping', icon: '🟣', avgSpend: 2000 },

  // Food delivery
  { id: 'swiggy',     name: 'Swiggy',     category: 'food-delivery', icon: '🛵', avgSpend: 3000 },
  { id: 'zomato',     name: 'Zomato',     category: 'food-delivery', icon: '🍅', avgSpend: 3000 },

  // Groceries & quick commerce
  { id: 'bigbasket',  name: 'BigBasket',  category: 'groceries', icon: '🧺', avgSpend: 4000 },
  { id: 'blinkit',    name: 'Blinkit',    category: 'groceries', icon: '⚡', avgSpend: 2500 },
  { id: 'zepto',      name: 'Zepto',      category: 'groceries', icon: '🟪', avgSpend: 2000 },
  { id: 'dmart',      name: 'DMart',      category: 'groceries', icon: '🏪', avgSpend: 3000 },

  // Travel
  { id: 'flights',    name: 'Flights',    category: 'travel', icon: '🛫', avgSpend: 8000 },
  { id: 'hotels',     name: 'Hotels',     category: 'travel', icon: '🏨', avgSpend: 5000 },
  { id: 'makemytrip', name: 'MakeMyTrip', category: 'travel', icon: '🧳', avgSpend: 5000 },
  { id: 'irctc',      name: 'IRCTC / Rail', category: 'travel', icon: '🚆', avgSpend: 1500 },

  // Cabs
  { id: 'uber',       name: 'Uber',       category: 'cabs', icon: '🚗', avgSpend: 2000 },
  { id: 'ola',        name: 'Ola',        category: 'cabs', icon: '🛺', avgSpend: 1500 },

  // Dining
  { id: 'dining',     name: 'Restaurants (Dine-in)', category: 'dining', icon: '🍽️', avgSpend: 4000 },

  // Entertainment
  { id: 'bookmyshow', name: 'BookMyShow', category: 'entertainment', icon: '🎟️', avgSpend: 1000 },
  { id: 'ott',        name: 'OTT & Streaming', category: 'entertainment', icon: '📺', avgSpend: 800 },

  // Fuel
  { id: 'fuel',       name: 'Fuel / Petrol', category: 'fuel', icon: '⛽', avgSpend: 4000 },

  // Bills
  { id: 'utilities',  name: 'Electricity & Utilities', category: 'bills', icon: '💡', avgSpend: 3000 },
  { id: 'mobile',     name: 'Mobile & DTH Recharge', category: 'bills', icon: '📱', avgSpend: 1000 },

  // Wellness
  { id: 'cultfit',    name: 'Cult.fit', category: 'wellness', icon: '🏋️', avgSpend: 1500 },
  { id: 'pharmacy',   name: 'Pharmacy (1mg/Apollo)', category: 'wellness', icon: '💊', avgSpend: 1500 },

  // International
  { id: 'international', name: 'International / Forex', category: 'international', icon: '🌍', avgSpend: 5000 },
];

/* ---------------------------------- Cards --------------------------------- */
/* rewardUnit ...... the currency the card earns, shown for transparency
 * gradient ........ CSS background for the card visual (mimics brand colours)
 * cvp ............. one-line Customer Value Proposition
 * bestFor ......... quick tags surfaced in the UI
 * rewards ......... { merchant:{id:rate}, category:{id:rate}, base:rate }
 * caps ............ short note about monthly caps / exclusions
 */
const CARDS = [
  {
    id: 'amazon-pay-icici',
    name: 'Amazon Pay ICICI',
    issuer: 'ICICI Bank',
    network: 'Visa',
    annualFee: 0,
    feeNote: 'Lifetime Free',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #232f3e 0%, #131a22 100%)',
    cvp: 'The default everyday card for the Amazon ecosystem — lifetime free with unlimited cashback.',
    bestFor: ['Amazon', 'No annual fee', 'Bill payments'],
    rewards: {
      merchant: { amazon: 5 },
      category: { 'online-shopping': 1, bills: 2 },
      base: 1,
    },
    caps: 'Unlimited cashback as Amazon Pay balance. 5% needs Prime (3% without).',
    notes: ['Cashback credited as Amazon Pay balance every month.'],
  },
  {
    id: 'sbi-cashback',
    name: 'SBI Cashback',
    issuer: 'SBI Card',
    network: 'Visa',
    annualFee: 999,
    feeNote: '₹999 (waived above ₹2L/yr spend)',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #5b2a86 0%, #1f3c88 100%)',
    cvp: 'A flat 5% cashback on virtually every online merchant — no category games.',
    bestFor: ['All online shopping', 'Simplicity', 'High flat rate'],
    rewards: {
      merchant: {},
      category: {
        'online-shopping': 5, 'food-delivery': 5, 'groceries': 5,
        'cabs': 5, 'entertainment': 5, 'travel': 5, 'wellness': 5,
        'bills': 1, 'fuel': 0,
      },
      base: 1,
    },
    caps: '5% online capped at ₹5,000 cashback/month. Excludes rent, fuel, utilities, wallet loads.',
    notes: ['Auto-credited as statement cashback.'],
  },
  {
    id: 'hdfc-millennia',
    name: 'HDFC Millennia',
    issuer: 'HDFC Bank',
    network: 'Visa / Mastercard',
    annualFee: 1000,
    feeNote: '₹1,000 (waived above ₹1L/yr spend)',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #004c8f 0%, #002b54 100%)',
    cvp: '5% cashback across 10 of the most-used online brands, 1% everywhere else.',
    bestFor: ['Amazon & Flipkart', 'Swiggy & Zomato', 'Uber'],
    rewards: {
      merchant: {
        amazon: 5, flipkart: 5, swiggy: 5, zomato: 5, myntra: 5,
        uber: 5, cultfit: 5, bookmyshow: 5, tatacliq: 5, ott: 5,
      },
      category: {},
      base: 1,
    },
    caps: '5% capped at ₹1,000 cashback/month; 1% capped at ₹1,000/month.',
    notes: ['Cashback as CashPoints, redeemable 1:1 against statement.'],
  },
  {
    id: 'hdfc-swiggy',
    name: 'Swiggy HDFC',
    issuer: 'HDFC Bank',
    network: 'Mastercard',
    annualFee: 500,
    feeNote: '₹500 (waived above ₹2L/yr spend)',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #fc8019 0%, #d35400 100%)',
    cvp: 'A market-leading 10% cashback on Swiggy and 5% on other online spends.',
    bestFor: ['Swiggy 10%', 'Instamart', 'Online spends'],
    rewards: {
      merchant: { swiggy: 10 },
      category: {
        'online-shopping': 5, 'food-delivery': 5, 'groceries': 5,
        'cabs': 5, 'entertainment': 5, 'travel': 5,
      },
      base: 1,
    },
    caps: '10% capped at ₹1,500/month; 5% capped at ₹1,500/month.',
    notes: ['Covers Swiggy Food, Instamart, Dineout & Genie.'],
  },
  {
    id: 'hdfc-tataneu-infinity',
    name: 'Tata Neu Infinity HDFC',
    issuer: 'HDFC Bank',
    network: 'RuPay / Visa',
    annualFee: 1499,
    feeNote: '₹1,499 (waived above ₹3L/yr spend)',
    rewardUnit: 'NeuCoins',
    gradient: 'linear-gradient(135deg, #6f2da8 0%, #3a1d6e 100%)',
    cvp: '5% back across the Tata universe + extra NeuCoins on RuPay UPI spends.',
    bestFor: ['BigBasket', 'Croma & Tata brands', 'UPI on credit'],
    rewards: {
      merchant: { tataneu: 5, bigbasket: 5, tatacliq: 5, pharmacy: 5 },
      category: { 'bills': 1.5 },
      base: 1.5,
    },
    caps: '1 NeuCoin = ₹1. Extra 1.5% NeuCoins on RuPay UPI transactions.',
    notes: ['Tata brands: BigBasket, Croma, Westside, Tata 1mg, Air India, Tata CLiQ.'],
  },
  {
    id: 'hdfc-infinia',
    name: 'HDFC Infinia',
    issuer: 'HDFC Bank',
    network: 'Visa Infinite',
    annualFee: 12500,
    feeNote: '₹12,500 (waived above ₹10L/yr spend)',
    rewardUnit: 'Reward Points',
    gradient: 'linear-gradient(135deg, #1a1a1a 0%, #3d3d3d 100%)',
    cvp: 'Super-premium: 3.3% everywhere and up to ~7% on travel via SmartBuy.',
    bestFor: ['Travel via SmartBuy', 'Unlimited lounges', 'Premium everyday'],
    rewards: {
      merchant: {},
      category: { 'travel': 7, 'online-shopping': 5 },
      base: 3.3,
    },
    caps: '5 RP per ₹150 (≈3.3%). SmartBuy flights/hotels up to 10X (capped).',
    notes: ['RP worth up to ₹1 on flights/hotels & transfers; unlimited domestic + international lounge access.'],
  },
  {
    id: 'sbi-simplyclick',
    name: 'SBI SimplyCLICK',
    issuer: 'SBI Card',
    network: 'Visa / Mastercard',
    annualFee: 499,
    feeNote: '₹499 (waived above ₹1L/yr spend)',
    rewardUnit: 'Reward Points',
    gradient: 'linear-gradient(135deg, #2b6cb0 0%, #1a365d 100%)',
    cvp: 'An affordable entry card with 10X points on partner online brands.',
    bestFor: ['Amazon', 'BookMyShow', 'Low fee'],
    rewards: {
      merchant: { amazon: 2.5, bookmyshow: 2.5, makemytrip: 2.5 },
      category: { 'online-shopping': 1.25 },
      base: 0.25,
    },
    caps: '10X = 2.5% value (RP ≈ ₹0.25). 10X capped at ₹10,000 spend/month.',
    notes: ['₹2,000 Amazon voucher on ₹1L annual spend milestone.'],
  },
  {
    id: 'axis-ace',
    name: 'Axis ACE',
    issuer: 'Axis Bank',
    network: 'Visa',
    annualFee: 499,
    feeNote: '₹499 (waived above ₹2L/yr spend)',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #97144d 0%, #5c0a2e 100%)',
    cvp: 'The go-to card for bill payments — 5% on utilities & recharges via Google Pay.',
    bestFor: ['Utility bills 5%', 'Swiggy/Zomato 4%', 'Flat 2% base'],
    rewards: {
      merchant: { swiggy: 4, zomato: 4, ola: 4 },
      category: { 'bills': 5 },
      base: 2,
    },
    caps: '5% on bills capped at ₹500/month; 4% capped at ₹500/month.',
    notes: ['5% bills & 4% partners require payment through Google Pay.'],
  },
  {
    id: 'axis-atlas',
    name: 'Axis Atlas',
    issuer: 'Axis Bank',
    network: 'Visa',
    annualFee: 5000,
    feeNote: '₹5,000',
    rewardUnit: 'EDGE Miles',
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 60%, #2c5364 100%)',
    cvp: 'A travel-first card earning transferable EDGE Miles worth more on flights.',
    bestFor: ['Flights & hotels', 'Airline transfers', 'Lounge access'],
    rewards: {
      merchant: {},
      category: { 'travel': 5, 'international': 2 },
      base: 2,
    },
    caps: '5 EDGE Miles/₹100 on travel, 2/₹100 elsewhere. Miles transfer to airline/hotel partners.',
    notes: ['Milestone bonuses up to 5,000 miles; domestic & international lounge access.'],
  },
  {
    id: 'flipkart-axis',
    name: 'Flipkart Axis',
    issuer: 'Axis Bank',
    network: 'Mastercard',
    annualFee: 500,
    feeNote: '₹500 (waived above ₹3.5L/yr spend)',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #2874f0 0%, #0b399b 100%)',
    cvp: '5% on Flipkart & Myntra, 4% on preferred partners, 1.5% on everything.',
    bestFor: ['Flipkart 5%', 'Myntra 5%', 'Swiggy & Uber 4%'],
    rewards: {
      merchant: { flipkart: 5, myntra: 5, makemytrip: 5, swiggy: 4, uber: 4, cultfit: 4 },
      category: { entertainment: 4 },
      base: 1.5,
    },
    caps: 'Unlimited cashback as statement credit.',
    notes: ['Among the best value-for-fee cards for Flipkart-heavy users.'],
  },
  {
    id: 'amex-smartearn',
    name: 'Amex SmartEarn',
    issuer: 'American Express',
    network: 'Amex',
    annualFee: 495,
    feeNote: '₹495',
    rewardUnit: 'Membership Rewards',
    gradient: 'linear-gradient(135deg, #006fcf 0%, #00417a 100%)',
    cvp: 'Entry into the Amex world with 10X points on Amazon, Flipkart & Uber.',
    bestFor: ['Amazon & Flipkart', 'Uber', 'Amex benefits'],
    rewards: {
      merchant: { amazon: 2.5, flipkart: 2.5, uber: 2.5, zomato: 1.25, bookmyshow: 1.25 },
      category: {},
      base: 0.5,
    },
    caps: '10X capped at ₹500 spend value/merchant/month. RP ≈ ₹0.25.',
    notes: ['Amex acceptance is narrower than Visa/Mastercard — keep a backup card.'],
  },
  {
    id: 'hsbc-liveplus',
    name: 'HSBC Live+',
    issuer: 'HSBC',
    network: 'Visa',
    annualFee: 999,
    feeNote: '₹999 (waived above ₹2L/yr spend)',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #db0011 0%, #7a0009 100%)',
    cvp: '10% accelerated cashback on dining, food delivery and groceries.',
    bestFor: ['Dining 10%', 'Groceries 10%', 'Food delivery 10%'],
    rewards: {
      merchant: {},
      category: { 'dining': 10, 'food-delivery': 10, 'groceries': 10 },
      base: 1.5,
    },
    caps: '10% capped at ₹1,000 cashback/month; 1.5% unlimited.',
    notes: ['Complimentary domestic lounge access on spend criteria.'],
  },
  {
    id: 'kotak-myntra',
    name: 'Myntra Kotak',
    issuer: 'Kotak Mahindra',
    network: 'Visa',
    annualFee: 500,
    feeNote: '₹500 (waived above ₹2L/yr spend)',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #ff3f6c 0%, #b3284b 100%)',
    cvp: 'The best fashion card — 7.5% instant discount on Myntra.',
    bestFor: ['Myntra 7.5%', 'Fashion', 'Partner brands 5%'],
    rewards: {
      merchant: { myntra: 7.5, swiggy: 5, ajio: 5, uber: 5, cultfit: 5 },
      category: {},
      base: 1.25,
    },
    caps: '7.5% as instant Myntra discount; 5% partners capped monthly.',
    notes: ['Ideal for heavy Myntra / fashion shoppers.'],
  },
  {
    id: 'sbi-bpcl-octane',
    name: 'BPCL SBI Octane',
    issuer: 'SBI Card',
    network: 'Visa / RuPay',
    annualFee: 1499,
    feeNote: '₹1,499 (waived above ₹2L/yr spend)',
    rewardUnit: 'Reward Points',
    gradient: 'linear-gradient(135deg, #f7b733 0%, #c1121f 100%)',
    cvp: 'Built for commuters — 7.25% value back on BPCL fuel.',
    bestFor: ['Fuel 7.25%', 'Dining 5%', 'Groceries 5%'],
    rewards: {
      merchant: {},
      category: { 'fuel': 7.25, 'dining': 5, 'groceries': 5, 'entertainment': 5 },
      base: 0.75,
    },
    caps: 'Fuel value at BPCL outlets, capped at ₹2,500 points/month. RP ≈ ₹0.25.',
    notes: ['Fuel surcharge waiver up to ₹100/month.'],
  },
  {
    id: 'idfc-first-select',
    name: 'IDFC FIRST Select',
    issuer: 'IDFC FIRST Bank',
    network: 'Visa / Mastercard',
    annualFee: 0,
    feeNote: 'Lifetime Free',
    rewardUnit: 'Reward Points',
    gradient: 'linear-gradient(135deg, #9a1f40 0%, #4a0d20 100%)',
    cvp: 'Lifetime-free card with never-expiring points and low forex markup.',
    bestFor: ['No annual fee', 'Low forex 1.5%', 'Reward points'],
    rewards: {
      merchant: {},
      category: { 'international': 2.5, 'online-shopping': 2.5 },
      base: 1,
    },
    caps: '10X on incremental spends above ₹20k/month; 1.5% forex markup (lowest tier).',
    notes: ['Reward points never expire; complimentary lounge & roadside assistance.'],
  },
  {
    id: 'sc-easemytrip',
    name: 'Standard Chartered EaseMyTrip',
    issuer: 'Standard Chartered',
    network: 'Visa',
    annualFee: 350,
    feeNote: '₹350',
    rewardUnit: 'Cashback',
    gradient: 'linear-gradient(135deg, #0473ea 0%, #1b1464 100%)',
    cvp: 'Travel booking specialist — up to 20% off on EaseMyTrip flights & hotels.',
    bestFor: ['Flights 20%', 'Hotels', 'Low fee travel'],
    rewards: {
      merchant: { makemytrip: 10 },
      category: { 'travel': 10 },
      base: 1,
    },
    caps: '20% on EaseMyTrip hotels / 10% on flights (capped per transaction).',
    notes: ['Best paired with EaseMyTrip bookings; modest rewards elsewhere.'],
  },
];

/* Tag the curated cards so the UI can distinguish them from AI-researched ones. */
CARDS.forEach((c) => { c.source = 'builtin'; });

/* Quick lookup maps */
const MERCHANT_BY_ID = Object.fromEntries(MERCHANTS.map((m) => [m.id, m]));
const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/* A palette of gradients for AI-researched cards (which arrive without one),
 * picked deterministically from the card id so the same card looks consistent. */
const AI_GRADIENTS = [
  'linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
  'linear-gradient(135deg, #b45309 0%, #7c2d12 100%)',
  'linear-gradient(135deg, #be123c 0%, #4c0519 100%)',
  'linear-gradient(135deg, #1d4ed8 0%, #1e1b4b 100%)',
  'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* Issuer brand palettes — give every card an accurate, on-brand visual even
 * when the AI doesn't supply colours. Matched as a substring of the issuer. */
const ISSUER_BRANDS = {
  'hdfc': ['#004c8f', '#01233f'],
  'sbi': ['#22409a', '#4b1f6e'],
  'icici': ['#ad2b30', '#f0651f'],
  'axis': ['#97144d', '#4f0a29'],
  'american express': ['#016fd0', '#013c72'],
  'amex': ['#016fd0', '#013c72'],
  'kotak': ['#d51c29', '#6e0d14'],
  'hsbc': ['#db0011', '#7a0009'],
  'idfc': ['#9a1f40', '#45091d'],
  'standard chartered': ['#0a9b8e', '#0473ea'],
  'rbl': ['#9c1d26', '#4a0d12'],
  'indusind': ['#8a1538', '#45091d'],
  'au ': ['#5b2a86', '#a01f5b'],
  'yes bank': ['#0a3d91', '#011a52'],
  'citi': ['#003a70', '#1666a8'],
  'federal': ['#00694e', '#01382a'],
  'onecard': ['#141414', '#2e2e2e'],
  'amazon': ['#232f3e', '#0f1722'],
};
const DEFAULT_BRAND = ['#34344a', '#1c1c2a'];

function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * (1 - amt)); g = Math.round(g * (1 - amt)); b = Math.round(b * (1 - amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function brandFor(issuer) {
  const s = String(issuer || '').toLowerCase();
  for (const [k, v] of Object.entries(ISSUER_BRANDS)) if (s.includes(k)) return v;
  return DEFAULT_BRAND;
}

/* Issuer → official website domain, used to fetch the correct bank logo.
 * Falls back to the AI-provided issuerDomain for issuers not listed here. */
const ISSUER_DOMAINS = {
  'hdfc': 'hdfcbank.com',
  'sbi': 'sbicard.com',
  'icici': 'icicibank.com',
  'axis': 'axisbank.com',
  'american express': 'americanexpress.com',
  'amex': 'americanexpress.com',
  'kotak': 'kotak.com',
  'hsbc': 'hsbc.co.in',
  'idfc': 'idfcfirstbank.com',
  'standard chartered': 'sc.com',
  'rbl': 'rblbank.com',
  'indusind': 'indusind.com',
  'au ': 'aubank.in',
  'yes bank': 'yesbank.in',
  'citi': 'online.citibank.co.in',
  'federal': 'federalbank.co.in',
  'onecard': 'getonecard.app',
  'amazon': 'icicibank.com',
};
function domainFor(card) {
  const s = String(card.issuer || '').toLowerCase();
  for (const [k, v] of Object.entries(ISSUER_DOMAINS)) if (s.includes(k)) return v;
  const d = String(card.issuerDomain || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : '';
}

/* Build an on-brand gradient: prefer the card's real colours, then the issuer
 * brand palette, then a neutral default. */
function gradientFor(card) {
  const cols = (Array.isArray(card.colors) ? card.colors : [])
    .filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  if (cols.length >= 2) return `linear-gradient(135deg, ${cols[0]} 0%, ${cols[1]} 100%)`;
  if (cols.length === 1) return `linear-gradient(135deg, ${cols[0]} 0%, ${darken(cols[0], 0.5)} 100%)`;
  const [c1, c2] = brandFor(card.issuer);
  return `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
}

/**
 * Register a card discovered at runtime (e.g. from the AI backend) so it flows
 * through the same optimizer and UI as the built-in cards. Idempotent by id.
 * Returns the stored card object.
 */
function registerCard(card) {
  if (!card || !card.id) return null;
  const gradient = card.gradient || gradientFor(card);
  const stored = {
    bestFor: [], notes: [], tips: [], sources: [], colors: [], network: '', issuerDomain: '', image: '',
    ...card,
    gradient,
    rewards: {
      merchant: (card.rewards && card.rewards.merchant) || {},
      category: (card.rewards && card.rewards.category) || {},
      base: (card.rewards && typeof card.rewards.base === 'number') ? card.rewards.base : 0.5,
    },
    source: card.source || 'ai',
  };
  if (!CARD_BY_ID[stored.id]) CARDS.push(stored);
  CARD_BY_ID[stored.id] = stored;
  return stored;
}

/* Expose globally (no module bundler needed) */
window.CW_DATA = { CATEGORIES, MERCHANTS, CARDS, MERCHANT_BY_ID, CARD_BY_ID, registerCard, domainFor };
