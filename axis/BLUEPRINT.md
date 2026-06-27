# Axis Bank — Agentic Credit-Card Onboarding · Blueprint

A complete, **agentic, minimum-click onboarding journey** for **new-to-bank (NTB)** Axis Bank
credit-card customers, delivered as a customer-facing website. An AI assistant (**“Aria”**) guides
the customer, **does the heavy lifting autonomously** (fetches KYC, pulls the bureau, underwrites),
and recovers drop-offs — all mapped to **RBI, KYC, CIC, Account-Aggregator and DPDP** rules.

> This document is the strategy map. The same content is surfaced live inside the website under
> **“🛠️ Behind the scenes”**, which reads the very objects defined in `js/config.js`.

---

## 1. Design principles

| Principle | How it shows up |
|---|---|
| **Agentic, not form-filling** | The agent autonomously calls each integration (PAN → DigiLocker → CKYC → bureau → AA → underwrite → issue) with a live “agent at work” status. The customer mostly *confirms*. |
| **Minimum clicks** | Pre-fill everything fetchable (CKYC/DigiLocker/AA), smart defaults, auto-advance, single-field focus, one consolidated consent per stage. |
| **Compliant by design** | Explicit consent at every regulated step, Key Fact Statement + MITC up-front, cooling-off disclosure, Aadhaar masking, data minimisation. |
| **No dead ends** | A decline routes to a secured card (against an FD), a lower limit, or a human channel — never a hard stop. |
| **Trust & transparency** | “Why we ask” micro-copy, a visible blueprint of integrations/data/rules, simulated steps clearly labelled. |
| **On-brand** | Axis burgundy (`#97144D`) + raspberry/gold, light “Dil Se Open” aesthetic; brand assets/fonts are swappable. |

---

## 2. The journey — 8 stages

Each stage records: **what the customer does**, **what the agent does autonomously**, the **data
points** captured, the **integrations** invoked, and the **regulatory** touchpoint.

### Stage 1 — Start (mobile + OTP + consent) · ~1 min
- **Customer:** enter mobile → OTP → one consolidated consent.
- **Agent (auto):** verify the number; capture time-stamped consent (DPDP); silently check for an
  existing relationship / **pre-approved offer** to skip steps.
- **Data:** mobile, pre-approved flag & indicative limit, consent artifact.
- **Integrations:** SMS/OTP gateway (TRAI DLT), pre-approved/ETB engine, analytics.
- **Regulatory:** RBI MD 2022 (consent), DPDP, TRAI DLT.

### Stage 2 — Product selection (agent-recommended) · ~1 min
- **Customer:** tap 1–3 lifestyle interests + employment type (or browse all cards), then pick.
- **Agent (AI):** recommend the **best-fit Axis card** from the spending profile with a one-line
  reason; show fees, key rewards and MITC preview up-front.
- **Data:** spending preferences, employment type.
- **Integrations:** offers engine, analytics; **AI** via `/api/onboarding-agent` (recommend).
- **Regulatory:** RBI MD 2022 (transparent fees).

### Stage 3 — Identity & KYC · ~2 min
- **Customer:** enter PAN, consent to DigiLocker, confirm pre-filled details, take a selfie (V-CIP
  where full KYC is required).
- **Agent (auto):** validate **PAN** (Protean/NSDL) → fetch identity & address from **DigiLocker /
  Aadhaar e-KYC** → pull **CKYC (CERSAI)** to pre-fill and skip re-capture → **liveness + face
  match** → **V-CIP** video where required. Aadhaar number masked and stored in an Aadhaar Vault.
- **Data:** PAN, verified name, DOB, gender, current/permanent address, photo, liveness/face-match,
  CKYC number.
- **Integrations:** NSDL/Protean PAN, DigiLocker, UIDAI e-KYC, CKYC/CERSAI, liveness/face-match,
  V-CIP, geo-tagging.
- **Regulatory:** RBI KYC MD 2016 (V-CIP/OVD/CKYC), Aadhaar Act/UIDAI, DPDP.

### Stage 4 — Credit & income assessment (consented) · ~1 min
- **Customer:** consent to the bureau pull and (if needed) income via Account Aggregator.
- **Agent (auto):** pull the **credit bureau** record (CIBIL/Experian/Equifax/CRIF); assess income
  via **Account Aggregator** (or ITR/payslip); **penny-drop** the bank account; **AML/sanctions/PEP**
  + fraud screening; compute FOIR. New-to-credit → prepare a **secured-card-against-FD** path.
- **Data:** credit score & obligations, income/affordability, verified bank account, AML status.
- **Integrations:** credit bureaus, Account Aggregator (Sahamati/DEPA), NPCI penny-drop, AML
  screening, fraud/device intelligence.
- **Regulatory:** CIC Act (bureau consent), RBI AA framework, PMLA, DPDP (purpose limitation).

### Stage 5 — Agentic underwriting & offer · ~1 min
- **Customer:** review the approved card, **credit limit**, interest and fees (Key Fact Statement).
- **Agent (auto):** real-time decision (KYC + bureau + income + policy + AML/fraud) → limit + APR;
  present transparently with **KFS + MITC**. **Refer/decline never dead-ends** → counter-offer
  (secured card / lower limit / callback).
- **Data:** decision, limit, APR, offer terms.
- **Integrations:** decisioning/offers engine, AML, core banking/CRM.
- **Regulatory:** RBI MD 2022 (KFS, fair practice, no unsolicited card), PMLA, grievance redressal.

### Stage 6 — Consent, MITC/KFS & e-sign · ~1 min
- **Customer:** read MITC/KFS, accept, give **OTP consent to issue**, e-sign.
- **Agent (auto):** capture explicit consent to issue (RBI — mandatory); generate the cardmember
  agreement and complete **Aadhaar eSign**; disclose the **cooling-off / look-up** window.
- **Data:** signed agreement, consent artifacts (timestamp, IP).
- **Integrations:** Aadhaar eSign ASP, core banking/CRM, analytics.
- **Regulatory:** RBI MD 2022 (consent to issue, MITC, cooling-off), DPDP (consent artifacts).

### Stage 7 — Issuance & instant activation · ~1 min
- **Customer:** set a PIN, add the card to Apple/Google Pay, optionally set up autopay.
- **Agent (auto):** create the account, credit line and an **instant virtual card**; dispatch the
  physical card; **tokenize** to wallets; set up **e-NACH** autopay if opted-in; respect the
  **30-day activation-consent** rule for unused cards.
- **Data:** card account, virtual-card token, bank account (auto-pay).
- **Integrations:** card management system / issuer processor, network + wallet tokenization,
  NPCI e-NACH, core banking.
- **Regulatory:** RBI MD 2022 (30-day activation consent, tokenization), IT/data-localisation.

### Stage 8 — Welcome & first-use nudges · ~1 min
- **Customer:** see benefits, make a first transaction, explore the app.
- **Agent (auto):** personalise a welcome + feature tour; nudge a rewarding first transaction; hand
  over to servicing — statements, controls, help (consented cross-sell only).
- **Integrations:** core banking/CRM, WhatsApp/conversational channel, analytics.
- **Regulatory:** grievance redressal disclosure, DPDP.

---

## 3. Integrations required (consolidated)

| # | Integration | Example providers | Purpose / data returned |
|---|---|---|---|
| 1 | SMS / OTP gateway (TRAI DLT) | Gupshup, Karix, Route Mobile | Mobile verification + consent capture |
| 2 | Pre-approved / ETB engine | Axis core banking + decisioning | Skip steps for existing customers; indicative limit |
| 3 | PAN verification | Protean (NSDL e-Gov), UTIITSL, ITD | PAN validity + name on record |
| 4 | DigiLocker | MeitY DigiLocker | Aadhaar XML, PAN, address, photo (consent) |
| 5 | UIDAI Aadhaar e-KYC / OTP | UIDAI via KUA/ASA | Identity, address, photo (Aadhaar masked) |
| 6 | CKYC registry | CERSAI | Reuse existing KYC → pre-fill, skip re-capture |
| 7 | Liveness + face match | HyperVerge, IDfy, Signzy | Anti-spoof liveness + selfie↔ID match |
| 8 | Video-KYC (V-CIP) | RBI-compliant V-CIP platform | Full KYC via live video + geo-tag |
| 9 | Credit bureau | TransUnion CIBIL, Experian, Equifax, CRIF | Score, obligations, enquiries (consent) |
| 10 | Account Aggregator (DEPA) | Sahamati: Finvu, OneMoney, CAMS, Anumati | Income / bank statements (revocable consent) |
| 11 | Bank-account verification | NPCI / bank penny-drop & penny-less | Account validity + beneficiary name match |
| 12 | AML / sanctions / PEP screening | Watchlist vendor + RBI/UN/OFAC lists | PMLA due-diligence + de-dupe |
| 13 | Fraud & device intelligence | Device fingerprint + bureau fraud | Synthetic-identity / application fraud |
| 14 | Aadhaar eSign | eSign ASP (NSDL/Protean) | Legally sign the agreement + MITC acceptance |
| 15 | e-Mandate / e-NACH | NPCI NACH / UPI Autopay | Auto-pay for bill payment (optional) |
| 16 | Card management / issuer processor | Issuer processor + card bureau | Account, credit line, virtual + physical card |
| 17 | Network & wallet tokenization | Visa/Mastercard/RuPay + Apple/Google Pay | Secure card-on-file provisioning |
| 18 | Core banking + CRM / CDP | Axis core + CRM | System of record + servicing + journeys |
| 19 | WhatsApp / conversational | WhatsApp Business API (BSP) | Resume links, reminders, channel switch |
| 20 | Analytics / CDP / experimentation | Event analytics + A/B | Funnel, drop-off reasons, nudge testing |

---

## 4. Data points — prefill vs ask

> **Principle: prefill everything fetchable, ask only what’s missing.** That is how the journey hits
> minimum clicks.

| Data point | Source | Mode | Consent |
|---|---|---|---|
| Mobile number | Customer + OTP | Asked | ✔ |
| Email | Customer / DigiLocker | Asked | — |
| Pre-approved offer & limit | ETB / offers engine | Derived | — |
| PAN | Customer + Protean verify | Asked | ✔ |
| Name (verified) | PAN / Aadhaar / CKYC | **Prefilled** | ✔ |
| Date of birth | Aadhaar / DigiLocker / CKYC | **Prefilled** | ✔ |
| Gender | Aadhaar / DigiLocker | **Prefilled** | ✔ |
| Address (current & permanent) | DigiLocker / CKYC (confirm) | **Prefilled** | ✔ |
| Photograph | Aadhaar / CKYC + live selfie | **Prefilled** | ✔ |
| Liveness & face match | Face-match vendor | Derived | ✔ |
| CKYC number | CERSAI | Derived | ✔ |
| Credit score & obligations | Credit bureau | Derived | ✔ |
| Income / affordability | Account Aggregator / ITR / payslip | Derived | ✔ |
| Employment type | Customer | Asked | — |
| Bank account (auto-pay) | Penny-drop (NPCI) | Derived | ✔ |
| Spending preferences | Customer (lifestyle taps) | Asked | — |
| AML / sanctions status | Screening vendor | Derived | — |
| Consent artifacts (timestamp, IP) | Consent capture (DPDP) | Derived | ✔ |

---

## 5. Regulatory & compliance map

| Regulation | What it requires here |
|---|---|
| **RBI Master Direction — Credit Card (Issuance & Conduct), 2022** | Explicit consent to issue, MITC + Key Fact Statement, no unsolicited cards, OTP-based activation within 30 days, billing transparency, cooling-off / look-up period. |
| **RBI Master Direction — KYC, 2016 (amended)** | Customer Due Diligence via V-CIP, OVDs, CKYC, Aadhaar/OVD e-KYC, periodic updation. |
| **Aadhaar Act & UIDAI regulations** | Consent-based Aadhaar use; number masked; stored in an Aadhaar Data Vault; no unauthorised retention. |
| **Credit Information Companies (Regulation) Act, 2005** | Bureau queried only with explicit, purpose-specific consent. |
| **RBI Account Aggregator framework (NBFC-AA / DEPA)** | Consent-driven, revocable, purpose-limited financial-data sharing via a licensed AA. |
| **Digital Personal Data Protection Act, 2023** | Notice + consent, purpose limitation, data minimisation, rights to access/correct/erase, grievance. |
| **PMLA & AML** | CDD, sanctions/PEP screening, beneficial ownership, record-keeping. |
| **IT / cyber-security & data localisation** | Payment + KYC data stored in India; RBI cyber-security & outsourcing controls. |
| **Grievance redressal & Internal Ombudsman** | Disclosed, time-bound complaints with escalation to Internal Ombudsman / RBI Ombudsman. |

---

## 6. Nudge & drop-off-recovery strategy (max conversion, min drop-off)

- **Save & resume** — every step is persisted; a simulated **magic link** is sent over
  WhatsApp/SMS/email so the customer resumes exactly where they left off.
- **Momentum** — a progress bar, “~N min left”, micro-wins and a low time-to-complete.
- **Friction reducers** — CKYC/DigiLocker/AA prefill, inline **“Why we ask”**, smart defaults,
  auto-advance, single-field focus, error-prevention validation.
- **Proactive interventions** — **inactivity nudge** (Aria offers to help/continue), **exit-intent**
  save-progress modal, step-specific help, and a **channel switch** (WhatsApp / callback / V-CIP /
  branch) that resumes inline.
- **No dead ends on decline** — secured card against an FD, a lower starting limit, or a specialist
  callback; the profile is saved for nurture.
- **Re-engagement** — abandoned-stage reminders and resume links.
- **Funnel analytics** — per-step events + drop-off reasons (`track()` in `js/app.js`), ready for an
  analytics/CDP backend and A/B-tested nudge slots.

---

## 7. What’s required to go live — checklist

**Data availability prerequisites**
- Customer mobile (+ OTP) and a pre-approved / ETB feed from core banking.
- PAN + Aadhaar consent rails (DigiLocker / UIDAI), CKYC connectivity (CERSAI).
- Credit-bureau memberships (CIBIL + at least one fallback) with consent capture.
- Account-Aggregator FIU onboarding (Sahamati) + a penny-drop provider.
- AML/sanctions lists + a fraud/device-intelligence feed.
- eSign ASP, card management system / issuer processor, tokenization, e-NACH.

**Integration build** — the 20 integrations in §3 (production credentials, contracts, SLAs).

**Decisioning** — a real-time underwriting policy (score bands, FOIR, limit logic, NTC/secured
fallback, AML/fraud rules) and a Key-Fact-Statement generator.

**Compliance** — consent management & artifacts (DPDP), Aadhaar Vault, MITC/KFS templates,
cooling-off handling, grievance redressal, data-localisation, audit logging.

**Platform** — Axis brand system, accessibility, security (WAF, rate-limiting, encryption), and an
analytics/CDP for funnel + experimentation.

---

## 8. The prototype — real vs simulated

| Real in this build | Simulated (clearly labelled mock data) |
|---|---|
| The full clickable journey, state machine, prefill/auto-advance | UIDAI / DigiLocker / CKYC fetch |
| Agentic “agent at work” execution UX | PAN verification, liveness, V-CIP |
| AI product recommendation, concierge Q&A, nudges (via Claude) — with offline fallback | Credit bureau, Account Aggregator, penny-drop, AML/fraud |
| Nudges, exit-intent, save-&-resume, channel switch | Real-time underwriting decision (mock logic) |
| The blueprint drawer (integrations/data/RBI per step) | eSign, issuance, tokenization, e-NACH |

A public web prototype cannot touch the regulated rails, so each is faked with realistic latency and
mock records (`js/integrations.js`, every record flagged `simulated: true`). The call-sites and UX are
production-shaped — swapping a mock for a real API is a drop-in change.

---

## 9. Running it / enabling the AI agent

See `README.md` in this folder. In short: it’s a static site under `/axis` plus one serverless
function (`api/onboarding-agent.js`). It runs fully on any static host using the **built-in scripted
assistant**; set `ANTHROPIC_API_KEY` on a serverless host (e.g. Vercel) to light up the live Claude
agent for recommendations, Q&A and nudges.

> **Disclaimer:** Reward rates, fees and policies are indicative of the public Indian market and must
> be confirmed against current Axis Bank terms. This prototype is for demonstration, not production
> issuance.
