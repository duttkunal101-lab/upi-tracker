# Axis Onboarding — Integration Adapter Guide (going from prototype → production)

This prototype simulates every regulated rail in **`axis/js/integrations.js`** (each mock record is
flagged `simulated: true`). This file maps each one to the **real API** a bank uses, what it returns,
and the **single function to swap**. The frontend call-sites and UX never change — you replace a mock
body with a real backend call.

## Why documents can't be pulled from a standalone web app

DigiLocker, UIDAI Aadhaar e-KYC, CKYC (CERSAI), NSDL/Protean PAN, the credit bureaus and Account
Aggregator are **not open APIs**. Access requires being (or being sponsored by) a regulated entity —
an RBI-licensed bank, a UIDAI **KUA/Sub-AUA via an ASA**, a **MeitY DigiLocker partner**, a **CERSAI**
member, a **credit-bureau** member, and an **AA-FIU** on the Sahamati network — each with production
credentials, allow-listed server IPs, signed/encrypted requests and consent artifacts. These calls run
**server-to-server on the bank's PCI/RBI-compliant backend**, never in the browser. So neither this web
prototype nor any client-side code can fetch a real customer's documents; doing so would also breach
UIDAI / DPDP rules. The production architecture is therefore:

```
Browser (this UI)  →  Axis onboarding backend (licensed, in-India)  →  regulated rails
   consent + UI            orchestration, consent vault, Aadhaar Vault,        (DigiLocker, UIDAI,
                           encryption, audit, decisioning                       CKYC, CIBIL, AA, …)
```

## The mapping

| Stage | Sim function (`integrations.js`) | Real API / provider | Returns | Notes to go live |
|---|---|---|---|---|
| 1 | `sendOtp` / `verifyOtp` | SMS/OTP gateway on **TRAI DLT** (Gupshup/Karix/Route Mobile) | delivery + verification | Registered DLT sender/template; rate-limit + retry |
| 1 | `checkPreApproved` | Core-banking / pre-approved offers engine (internal) | ETB flag, indicative limit | Real-time CASA + risk lookup |
| 3 | `digiLockerConsent` | **DigiLocker Partner API** — OAuth2 `authorize` → token | consent grant | Register as a DigiLocker requester; redirect/redirect-back |
| 3 | `digiLockerFetch` | DigiLocker `GET /public/oauth2/2/files/issued` → pull signed XML (e-Aadhaar etc.) | name, DOB, gender, address, photo, docs | Verify the issuer's digital signature on the XML |
| 3 | `verifyPan` | **Protean (NSDL)** / UTIITSL / ITD PAN API | PAN status + name on record | Membership + name-match logic |
| 3 | `aadhaarOtpEkyc` | **UIDAI** Aadhaar e-KYC OTP (via KUA/ASA) | masked identity + address + photo | KUA licence; **Aadhaar Data Vault**; reference-key storage only |
| 3 | `ckycPull` | **CERSAI** CKYC Search + Download | CKYC record → pre-fill | FI membership; CKYC number search |
| 3 | `livenessFaceMatch` | Liveness/face-match vendor (HyperVerge/IDfy/Signzy) | liveness + match score | Passive liveness; threshold policy |
| 3 | `vcipSession` | RBI-compliant **V-CIP** platform | recorded session + geo-tag | Trained agent, concurrent-audit, RBI V-CIP norms |
| 4 | `bureauPull` | **CIBIL / Experian / Equifax / CRIF** | score, obligations, enquiries | Bureau membership; explicit CIC-Act consent; soft→hard |
| 4 | `accountAggregator` | **Account Aggregator** (Sahamati: Finvu/OneMoney/CAMS) | income, balances (consent) | FIU onboarding; consent-artifact handling; revocable |
| 4 | `pennyDrop` | **NPCI**/bank penny-drop & penny-less | account validity + name match | Beneficiary name-match policy |
| 4 | `amlScreen` | Watchlist screening (UN/OFAC/RBI + PEP) | cleared/referred | PMLA CDD; case-management for hits |
| 4 | `fraudCheck` | Device-intelligence + bureau fraud | risk score | Device fingerprint, velocity, synthetic-ID checks |
| 5 | `underwrite` | Real-time decision engine (rules + risk models) | approve/refer/decline + limit + APR | Credit policy, FOIR, NTC/secured fallback, KFS gen |
| 6 | `eSign` | **Aadhaar eSign** ASP (NSDL/Protean) | signed agreement artifact | eSign integration; document templating |
| 7 | `issueCard` | Card management system / issuer processor | account, credit line, virtual card | Instant virtual issuance + physical dispatch |
| 7 | `provisionWallet` | Network + wallet tokenization (Visa/MC/RuPay, Apple/Google Pay) | network token | Tokenization service provider |
| 7 | `enachSetup` | NPCI **e-NACH / e-Mandate** (UPI Autopay) | active mandate | Sponsor-bank mandate flow |
| 7 → delivered | (delivery tracker in `app.js`) | Issuer CMS + courier AWB webhooks | dispatch → delivered events | Real-time status to the customer |

## How to swap one (example: DigiLocker)

```js
// axis/js/integrations.js — replace the simulated body with a backend call.
async function digiLockerFetch(pan) {
  const res = await fetch('/api/kyc/digilocker/fetch', {        // your licensed backend
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pan, consentArtifactId }),           // consent captured in the OAuth step
  });
  return res.json(); // { name, dob, gender, address, photo, documents:[...] }
}
```

The UI (`app.js`) and the "agent at work" overlay are unchanged — they already call these functions and
render whatever the documents/decision return. The backend owns licensing, encryption, the Aadhaar
Vault, consent storage and audit (DPDP/RBI).

## Card images

The cards render the **real Axis Bank logo** (loaded live in the browser) on an accurate, on-brand card
with the **real benefits**. To show official **card artwork**, set a card's `image` field in
`axis/js/config.js` to an image URL or a local path (drop the PNG in `axis/assets/cards/`) — the UI
renders it over the branded card automatically, with a graceful fallback if it can't load:

```js
{ id: 'ace', /* … */ image: 'assets/cards/ace.png' }
```

> Reward rates, fees and policies are indicative of the public Indian market (as of June 2026) and must
> be confirmed against current Axis Bank terms. This is a prototype for demonstration, not production
> issuance.
