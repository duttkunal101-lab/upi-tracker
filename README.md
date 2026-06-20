# 💳 CardWise — Credit Card Optimizer Agent

**Swipe the right card, every single time.**

CardWise is a web app that tells you **which of your credit cards to use at every
merchant** to maximise rewards. You add the cards in your wallet and the
merchants you spend at; CardWise reads each card's value proposition (CVP) and
reward program, then computes the single best card for each merchant — with the
reward rate, the reasoning, and an estimated annual-rewards projection.

It's a **zero-build static web app** (HTML + CSS + vanilla JS, no dependencies),
so it runs entirely in the browser, keeps all your data on your device, and
deploys publicly in a couple of clicks.

> Built for the Indian credit-card market (HDFC, SBI, ICICI, Axis, Amex, Kotak,
> HSBC, IDFC FIRST, Standard Chartered & co.).

---

## ✨ What it does

- **Add your cards** — pick from a curated database of 16 popular cards. Tap any
  card to see its CVP, reward rates, annual fee, caps and exclusions.
- **Pick your merchants** — choose where you spend (Amazon, Swiggy, fuel, bills,
  travel…) and set a rough monthly amount for a personalised projection.
- **Get your strategy** — for every merchant you get:
  - the **single best card** to use, with the effective reward %,
  - a plain-English **reason** ("5% cashback on Amazon", "category bonus", …),
  - the **runner-up cards**, and
  - an estimated **₹/year** you'll earn.
- **Wallet summary** — a simplified "use this card for these merchants" cheat sheet.
- **Smart upgrade ideas** — surfaces cards you *don't* own that would beat your
  current best at a merchant, and how much extra you'd earn per year.
- **Private & persistent** — everything runs client-side; selections are saved to
  `localStorage`, nothing is sent anywhere.

---

## 🧠 How the optimization works

Each card stores its rewards as an **effective return %** (reward points and miles
are pre-converted to rupee value), so every card is compared apples-to-apples.

For a given card at a given merchant, the engine resolves the rate by priority:

1. **Merchant override** — co-branded / accelerated rate (e.g. Swiggy HDFC → 10% on Swiggy)
2. **Category bonus** — e.g. HSBC Live+ → 10% on the *Dining* category
3. **Base rate** — the "everything else" rate

It then ranks every owned card per merchant (highest reward wins; ties break
toward the lower annual fee), multiplies by your monthly spend for the projection,
and aggregates everything into your wallet strategy.

See [`assets/js/optimizer.js`](assets/js/optimizer.js) for the full engine and
[`assets/js/data.js`](assets/js/data.js) for the card/merchant database.

---

## 📁 Project structure

```
upi-tracker/
├── index.html                  # App shell + all screens (landing, wizard, results)
├── assets/
│   ├── css/styles.css          # All styling (hand-written, no framework)
│   └── js/
│       ├── data.js             # Card + merchant database (edit this to add cards)
│       ├── optimizer.js        # Pure optimization engine
│       └── app.js              # UI controller (navigation, rendering, persistence)
└── .github/workflows/deploy.yml  # One-click GitHub Pages deployment
```

---

## ▶️ Run it locally

It's just static files — no build, no `npm install`. Any static server works:

```bash
# Option A — Python (preinstalled on most machines)
python3 -m http.server 8000

# Option B — Node
npx serve .
```

Then open **http://localhost:8000**. (You can also just double-click
`index.html`, though a local server is recommended.)

---

## 🚀 Launch it publicly (so anyone can use it)

### Option 1 — GitHub Pages (recommended, free, included)

This repo ships a deploy workflow at `.github/workflows/deploy.yml`.

1. Push this code to the **`main`** branch of your GitHub repo.
2. Go to **Settings → Pages → Build and deployment** and set
   **Source = "GitHub Actions"**.
3. The workflow runs automatically (or trigger it from the **Actions** tab →
   *Deploy CardWise to GitHub Pages* → *Run workflow*).
4. Your site goes live at:

   ```
   https://<your-username>.github.io/upi-tracker/
   ```

   For this repo that's **https://duttkunal101-lab.github.io/upi-tracker/**.

> Prefer no workflow? You can instead pick **Source = "Deploy from a branch"**,
> choose your branch and the `/ (root)` folder — it works because the site is
> static files at the repo root.

### Option 2 — Netlify

1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import from Git**
   (or drag-and-drop the project folder onto the dashboard).
2. **Build command:** *(leave empty)* · **Publish directory:** `.`
3. Deploy → you get a public `*.netlify.app` URL instantly.

### Option 3 — Vercel

1. [vercel.com/new](https://vercel.com/new) → import the repo.
2. Framework preset: **Other** · no build command · output dir: `.`
3. Deploy → public `*.vercel.app` URL.

### Option 4 — Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. No build command · output dir `/`. Deploy.

> Want a custom domain (e.g. `cardwise.app`)? All four hosts let you add one for
> free under their domain settings once the site is live.

---

## 🔧 Customising the card database

Adding a card is a single object in [`assets/js/data.js`](assets/js/data.js):

```js
{
  id: 'my-card',
  name: 'My Card',
  issuer: 'Some Bank',
  network: 'Visa',
  annualFee: 999,
  feeNote: '₹999 (waived above ₹2L/yr spend)',
  rewardUnit: 'Cashback',
  gradient: 'linear-gradient(135deg, #123 0%, #456 100%)', // the card visual
  cvp: 'One-line value proposition shown on the card.',
  bestFor: ['Tag 1', 'Tag 2'],
  rewards: {
    merchant: { amazon: 5, swiggy: 4 }, // accelerated, by merchant id
    category: { 'food-delivery': 5 },   // category bonus, by category id
    base: 1,                            // everything-else rate
  },
  caps: 'Short note on monthly caps / exclusions.',
  notes: ['Anything worth flagging in the detail modal.'],
}
```

Merchant and category ids must match those defined at the top of `data.js`.

---

## ⚠️ Disclaimer

Reward rates are **indicative**, based on publicly published programs, and meant
for guidance only. Banks revise rewards, caps and exclusions frequently — always
confirm current terms with your issuer. This tool offers guidance, **not financial
advice**.

---

Made with vanilla HTML/CSS/JS. No tracking, no backend, no dependencies.
