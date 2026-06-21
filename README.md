# 💳 CardWise — AI Credit Card Optimizer Agent

**Swipe the right card, every single time.**

CardWise tells you **which of your credit cards to use at every merchant** to maximise
rewards. Add **any** credit card issued in India — CardWise uses **Claude with
live web search** to read that card's *latest* value proposition (CVP), reward program,
fees and caps, then computes the single best card for each merchant, with the reward rate,
the reasoning, an annual-rewards projection, and tips to manage each card better.

- **16 popular cards built in** — instant, free, offline.
- **Any other card → researched on demand by AI** with current, web-sourced terms.
- A tiny **serverless backend** keeps your Anthropic API key private; results are cached so
  repeat lookups are instant and cheap.

> Built for the Indian credit-card market (HDFC, SBI, ICICI, Axis, Amex, Kotak, HSBC,
> IDFC FIRST, Standard Chartered, Diners, RuPay, and anything else you type).

---

## ✨ What it does

1. **Add any card** — pick from the built-in list, or type a card name and hit **Analyze
   with AI**. The card's CVP, reward rates (mapped to the optimizer's taxonomy), fees, caps,
   management tips are fetched live, with source links and an "as of" month. Each card shows
   the **correct bank logo** (from the issuer's domain) and the **payment-network logo**
   (Visa/Mastercard/RuPay/Amex/Diners) on a clean, on-brand card face. If Google image keys
   are configured, the card's **actual photo from Google** is shown too — otherwise it falls
   back to the branded card, so it's always seamless.
2. **Pick your merchants** — choose where you spend and set a rough monthly amount.
3. **Get your strategy** — for every merchant: the best card, the effective reward %, the
   reasoning, runner-ups, and ₹/year. Plus a wallet cheat-sheet, **"Manage your cards
   better"** tips, and **smart upgrade ideas**.

Your selected cards and spends stay in your browser (`localStorage`). Only the **card name**
you ask about is sent to the backend for analysis.

**Friendly & compliant:** the AI writes the value proposition and tips in a warm, human voice
but stays compliant — it's framed as guidance (not financial advice), avoids guarantees/hype,
and nudges you to confirm current terms. A friendly compliance note and a **Terms & Privacy**
dialog are surfaced in-app.

**Search retention (disclosed in Terms):** when the datastore is configured, the **card name**
each person searches is logged anonymously (name + timestamp + a random browser id; no personal
data) so you can see demand. This is disclosed in the in-app Terms and a consent note by the
search box. View it in the Upstash console → Data Browser: `cardwise:searches` (a sorted set —
most-searched cards) and `cardwise:searchlog` (the recent log).

**Feedback (gamified):** once people see their strategy, a friendly prompt invites them to rate
how relevant it was (1–5 stars), tap what's working, and suggest improvements or new features.
When the datastore is configured it's stored anonymously in `cardwise:feedback` (recent entries)
and `cardwise:feedback:ratings` (a tally by star rating); otherwise it's written to the function
logs. No personal data is collected.

**Public-CVP grounding:** the AI is instructed to base every reward rate strictly on the
card's **publicly available** CVP found via web search (issuer site first, then reputable
public card-info sites), to cite its sources, and to **refuse rather than guess** — a card
with no public source is not recommended.

**Early access — "first 100 people" (optional):** you can cap the AI feature to the first 100
testers. A shared counter shows live progress (`X / 100 spots claimed`) and a **time tracker**
(when it opened, and once full, how long it took to reach 100). This needs a small free
datastore — see *Optional: early-access gate* below. With it unconfigured, the gate is off and
the app stays fully usable.

---

## 🧠 Architecture

```
Browser (static, GitHub-Pages-able)                Serverless (Vercel/Netlify/Cloudflare)
┌─────────────────────────────────────┐            ┌──────────────────────────────────────┐
│ index.html + assets/js/*            │            │ /api/analyze-card.js                  │
│  • optimizer engine (merchant>cat>  │  POST {name}│  • Claude Sonnet 4.6 + web_search     │
│    base, effective % return)        │ ─────────► │  • returns a structured card profile  │
│  • built-in 16-card database        │ ◄───────── │  • validates → optimizer taxonomy     │
│  • AI client + localStorage cache   │   {card}   │  • caches + rate-limits (best-effort) │
└─────────────────────────────────────┘            └──────────────────────────────────────┘
```

The model returns rewards as **effective % return** (points/miles pre-converted to rupee
value) mapped onto the app's fixed merchant/category ids, so AI-researched cards drop
straight into the same optimizer as the built-in ones.

---

## 📁 Project structure

```
upi-tracker/
├── index.html                  # App shell + all screens
├── assets/
│   ├── css/styles.css          # All styling (hand-written, no framework)
│   └── js/
│       ├── data.js             # Built-in card/merchant DB + runtime card registry
│       ├── optimizer.js        # Pure optimization engine
│       ├── ai.js               # Frontend AI client (calls the backend, caches results)
│       ├── access.js           # Early-access counter + time tracker + spot gate (client)
│       └── app.js              # UI controller
├── api/
│   ├── analyze-card.js         # Serverless: Claude + web search → card profile (+ spot gate)
│   ├── early-access.js         # Serverless: live early-access stats (GET)
│   └── _lib/access-store.js    # Shared "first 100" store (Upstash Redis) + stats math
├── package.json                # Backend dependency (@anthropic-ai/sdk)
├── vercel.json                 # Function config (60s timeout for web search)
└── .github/workflows/deploy.yml  # Optional GitHub Pages deploy (built-in cards only)
```

---

## 🚀 Deploy it publicly (recommended: Vercel)

The AI feature needs a server to keep your API key private, so deploy to a host that runs
serverless functions. **Vercel** is the simplest:

1. Create a free account at [vercel.com](https://vercel.com) and **Import** this GitHub repo
   (or run `npx vercel` from the project folder).
2. Framework preset: **Other**. No build command needed — Vercel serves the static files and
   auto-detects `/api/*` as serverless functions.
3. Add an **Environment Variable**:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your key from [console.anthropic.com](https://console.anthropic.com) → API Keys
4. **Deploy.** You get a public `https://<project>.vercel.app` URL where *any card* works.

### Optional: enable the early-access gate ("first 100 people")

Want the AI feature limited to the first 100 testers, with a live counter and time tracker?
Add a free shared datastore:

1. Create a free database at [console.upstash.com](https://console.upstash.com) → **Create
   Database** (Redis) → open it → copy the **REST URL** and **REST Token**.
2. In Vercel → your project → **Settings → Environment Variables**, add:
   - `UPSTASH_REDIS_REST_URL` = the REST URL
   - `UPSTASH_REDIS_REST_TOKEN` = the REST token
   - *(optional)* `CARDWISE_CAP` = how many people get access (defaults to `100`; set it to
     `2` to quickly test the "closed" state, or any number for a bigger round)
3. **Redeploy.** The counter (`X / <cap> spots claimed`) now appears, spots are consumed as
   people use the AI lookup, and once the cap is reached the feature closes and shows how long
   it took. To **reset** the round, delete the keys `cardwise:*` in the Upstash console (Data
   Browser).

> Leave these two vars blank to keep the gate **off** — the app works the same, just without
> the counter/cap. The cap is **per browser** (deduped by a random client id in
> `localStorage`), which is the practical proxy for "people" without forcing logins.

### Optional: real card photos from Google

Bank logos appear automatically. To also show each card's **actual photo from Google image
search**, set two more env vars in Vercel:

1. **Google API key:** [console.cloud.google.com](https://console.cloud.google.com) → enable
   **Custom Search API** → create an **API key**.
2. **Search engine:** [programmablesearchengine.google.com](https://programmablesearchengine.google.com)
   → create an engine with **Image search ON** and **Search the entire web** → copy its **ID**.
3. Add `GOOGLE_API_KEY` and `GOOGLE_CSE_ID` in Vercel → **Redeploy**.

Free tier is ~100 lookups/day. The top image result is usually the right card; if a photo is
missing or fails to load, the app **falls back to the branded card** (bank logo + network +
colours), so it always looks right. Bank logos come from Google's logo/favicon service (no key).

> **Netlify / Cloudflare Pages** work too — put the function under their Functions directory
> and set the same `ANTHROPIC_API_KEY` env var. The frontend calls `/api/analyze-card`
> relative to its own origin.

### ⚠️ Before you go live — protect your API key (important)

`/api/analyze-card` is **public once deployed**, and each call spends your Anthropic credits.

- **Set a monthly spend limit** on the key in the Anthropic Console (Billing → Limits).
- The function already does best-effort **input validation, caching, and per-IP rate
  limiting** — but serverless instances are ephemeral, so for real traffic add a durable
  rate limiter / KV cache and a WAF (e.g. Cloudflare in front).
- Built-in card lookups and the whole optimizer are **free** (no API call) — only the
  "Analyze with AI" path costs tokens, and cached cards are free on repeat.

---

## ▶️ Run it locally

**Full app (with AI):** use the Vercel CLI so the `/api` function runs locally.

```bash
npm install
export ANTHROPIC_API_KEY="sk-ant-..."   # Windows: set ANTHROPIC_API_KEY=...
npx vercel dev                           # serves the site + /api on http://localhost:3000
```

**Static only (built-in 16 cards, no AI):** any static server works — the "Analyze with AI"
button will simply report that the backend isn't available.

```bash
python3 -m http.server 8000              # http://localhost:8000
```

---

## 🔧 Configuration & customisation

- **Model:** `api/analyze-card.js` uses `claude-haiku-4-5-20251001` with the `web_search_20260209`
  tool — the fastest option, chosen so the live lookup finishes inside the serverless timeout.
  Switch to `claude-sonnet-4-6` for deeper analysis once the function has more time to run (e.g.
  enable Vercel **Fluid Compute** so the `maxDuration: 60` takes effect). Edit the `model` field.
- **Built-in cards:** add/edit a card object in `assets/js/data.js` (documented inline). Use
  the same `rewards: { merchant, category, base }` shape — rates are effective % return. The
  card visual comes from its `gradient` (or `colors`) + `network`; issuer brand palettes in
  `data.js` provide an accurate default if none is given.
- **Merchants / categories:** defined at the top of `assets/js/data.js`. If you add new ones,
  also add their ids to the `MERCHANT_IDS` / `CATEGORY_IDS` lists in `api/analyze-card.js`
  so the AI maps rewards onto them.
- **Caching:** AI cards are cached in the browser (`localStorage`) and in the function's
  in-memory map. For a shared, durable cache across users, plug in a KV store (Vercel KV /
  Upstash) in `api/analyze-card.js`.

---

## ⚠️ Disclaimer

Reward rates are **indicative**. Built-in cards are curated; any card you add is **researched
by AI from public web sources and may contain errors or be out of date**. Issuers revise
rewards, caps and exclusions frequently — always confirm current terms with your bank. This
tool offers guidance, **not financial advice**.

---

Made with vanilla HTML/CSS/JS on the frontend and one small serverless function on the back.
No tracking, no accounts.
