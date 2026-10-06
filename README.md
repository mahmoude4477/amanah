# Amanah — Meaning-Integrity Checker for Qur'an Translations

**English** · [العربية](README.ar.md)

Amanah checks whether an English translation of a Qur'anic verse keeps the verse's meaning. It compares the translation with the verified Arabic text, gives a clear decision from the team's specialised AMANAH model, and sends anything doubtful to a human reviewer before publication.

Built for the **"AI in the Service of Islamic Content" challenge**.

- **Live demo:** <https://ma.mahmoude4477.workers.dev> (login details are in the presentation)
- **AMANAH model (code, data pipeline, evaluation):** [Amanah AI model](https://github.com/Saahar2001/Amanah-/tree/main/Amanah%20AI%20model)

---

## Contents

- [What it does](#what-it-does)
- [Features](#features)
- [Quick start](#quick-start)
- [Connecting the AMANAH model](#connecting-the-amanah-model)
- [Using the app](#using-the-app)
- [Review rules](#review-rules)
- [Tests](#tests)
- [Deploying to Cloudflare](#deploying-to-cloudflare)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Qur'an text, model and licences](#quran-text-model-and-licences)

## What it does

A translation can read well and still change the meaning: a negation flips, a condition disappears, or a religious term is replaced. Amanah:

1. Takes the verse reference (for example `2:279`) and loads the verified Uthmani Arabic text itself.
2. Takes the English translation you want to check.
3. Gets a decision from the AMANAH model: `PASS`, `REVIEW`, `CRITICAL` or `ABSTAIN`, with severity, a meaning-integrity score and the type of drift.
4. Adds a short Arabic explanation written by a language model. The explanation cannot change the decision.
5. Lets a human approve the translation or return it for correction, and keeps every check and decision in the history.

## Features

- **Verified Qur'an text:** users never type the verse; it comes from the Tanzil text on the server. If an API client sends Arabic that does not match it letter for letter, the check stops and shows where it differs.
- **Decision from a specialised model:** AMANAH detects meaning drift such as negation flips, omissions, modality shifts, quantifier changes, lost conditions and subject/object reversals.
- **Explanation cannot override the decision:** the language model only explains.
- **Abstains instead of guessing:** when it cannot judge safely, the result is `ABSTAIN` and goes to a human.
- **Human approval:** nothing is approved without a written reason; a `CRITICAL` result can only be overridden by an independent reviewer with a scholarly justification.
- **Terminology glossary:** the ten reference terms of the challenge (such as revelation, Sharia and worship) are checked for reduced renderings.
- **Full history:** each check keeps the verse, the translation, the model decision and the reviewer decision; history can be exported, and users can delete their account and data.
- **Arabic interface** with a clear AI-use disclosure.

## Quick start

Requirements: **Node.js 22.13 or newer** and **Git**. pnpm is provided through corepack.

```bash
# 1. Get the code
git clone https://github.com/Saahar2001/Amanah-.git
cd "Amanah-/Amanah Website"
# (or: git clone https://github.com/mahmoude4477/amanah.git && cd amanah)

# 2. Install dependencies
corepack enable
pnpm install --frozen-lockfile

# 3. Create your local settings file
cp .env.example .dev.vars
```

Open `.dev.vars` and set at least `BETTER_AUTH_SECRET` to a random value of 32 characters or more. You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

```bash
# 4. Create the local database
npx wrangler d1 migrations apply ma-db --local

# 5. Create your first account (self sign-up is disabled)
node scripts/create-user.mjs --email you@example.com --name "Your Name" --role admin

# 6. Start the app
pnpm dev
```

The account script prints a generated password once. Open the address that `pnpm dev` prints (for example `http://localhost:5173`) and sign in with that email and password.

**Notes**

- `pnpm dev` uses Cloudflare Workers AI for the explanation, so run `npx wrangler login` once. To run fully offline, start with `AMANAH_DEV_LOCAL_ONLY=1 pnpm dev` (PowerShell: `$env:AMANAH_DEV_LOCAL_ONLY='1'; pnpm dev`); the explanation then shows as unavailable and the decision is unchanged.
- `--role admin` also makes the account an independent reviewer. Leave it out for a normal user.
- Without the model settings (next section) the app runs, but an analysis returns `503 CONFIGURATION_REQUIRED`.
- The first `pnpm dev` prepares dependencies and can take a few minutes. If it stops with `read ECONNRESET`, run it again.

## Connecting the AMANAH model

Add the model address and token to `.dev.vars` (and as Worker secrets in production):

```env
AMANAH_ML_URL=<model endpoint URL>
AMANAH_ML_TOKEN=<server-side token>
```

You have two options:

1. **The team's Hugging Face Inference Endpoint:** ask the team for the endpoint URL and an access token.
2. **Run the model service yourself:** the [Amanah AI model](https://github.com/Saahar2001/Amanah-/tree/main/Amanah%20AI%20model) folder contains a FastAPI service (`uvicorn api.main:app --port 8000`). It needs the trained model package; see that folder's README and `docs/REPRODUCIBILITY.md`. Then set `AMANAH_ML_URL=http://localhost:8000` (plain `http` is accepted only for `localhost` and `127.0.0.1`).

Addresses ending in `.endpoints.huggingface.cloud` are called as Hugging Face endpoints; any other address is called as the model's own API at `POST {AMANAH_ML_URL}/v1/analyze`. Set `AMANAH_ML_TRANSPORT` to `hf` or `fastapi` to choose explicitly.

The model is called only from the server; the token never reaches the browser.

**Request** sent by the app:

```json
{
  "inputs": {
    "source_type": "quran",
    "source_ar": "verified Arabic ayah text",
    "candidate_en": "English translation to check",
    "ayah_id": "2:279"
  }
}
```

**Response** fields used by the app: `decision`, `integrity_score`, `severity`, `confidence`, `drifts`, `needs_human_review`, `model_version`, `reference_status`, `notes`. These fields decide the result; the language-model explanation never overwrites them.

The interface shows the model's measured scope as the badge «النسخة المقاسة v0.2 · العربية ← الإنجليزية» (measured version v0.2, Arabic to English).

## Using the app

1. Sign in, then click **«تحليل جديد»** (New analysis).
2. Choose the surah and ayah, or type the reference such as `2:279` in **«أو اكتب رقم الآية»** and click **«عرض الآية»**. The Uthmani text appears automatically.
3. Paste the English translation in **«الترجمة المراد فحصها»** and click **«تحليل»**.
4. Read the decision, severity, meaning-integrity score, drift type and explanation.
5. Open the check from **«فتحه في السجل والمراجعات»**, write the reason, and choose **«اعتماد هذه النسخة»** (approve) or **«إعادة للتصحيح»** (return for correction).

## Review rules

- **Internal draft:** the person who created the check decides.
- **Official publication:** the creator cannot decide; the check waits for an **independent reviewer** (an `admin` user, or an email listed in `AMANAH_REVIEWER_EMAILS`).
- **Approval** needs a written reason and confirmation that the translation was compared with the verse. Returning for correction needs only the reason.
- **`CRITICAL`** cannot be approved by its creator. Only an independent reviewer can approve it, by ticking the documented override and writing a scholarly justification.
- **`ABSTAIN`** can never be approved; it can only be returned for correction.
- A saved decision is final and is recorded with the reviewer's name, role and time.

## Tests

```bash
pnpm test          # no network access
pnpm lint
npx tsc --noEmit
pnpm run build
```

## Deploying to Cloudflare

```bash
npx wrangler login
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put AMANAH_ML_URL
npx wrangler secret put AMANAH_ML_TOKEN
npx wrangler d1 migrations apply ma-db --remote
pnpm run build
npx wrangler deploy
node scripts/create-user.mjs --email you@example.com --name "Your Name" --role admin --remote
```

- Set the values as **secrets**, not plain variables, so later deploys do not remove them. Never put them in `wrangler.jsonc` or in code.
- **On your own Cloudflare account:** create a database with `npx wrangler d1 create ma-db`, put its ID in `wrangler.jsonc`, and add your site's host to `allowedHosts` in `lib/server/auth.ts`.

## Environment variables

| Variable | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Sign-in secret, at least 32 characters. Required. |
| `AMANAH_ML_URL` | AMANAH model address (`https://`). Without it, analysis returns 503. |
| `AMANAH_ML_TOKEN` | Bearer token for the model. |
| `AMANAH_ML_TRANSPORT` | Optional: `hf` or `fastapi`. Detected from the URL when empty. |
| `AMANAH_ML_TIMEOUT_MS` | Optional model timeout in milliseconds (default 240000 for `hf`). |
| `AMANAH_REVIEWER_EMAILS` | Optional comma-separated emails of independent reviewers. |
| `AMANAH_DEV_LOCAL_ONLY` | Development only: `1` runs `pnpm dev` without any Cloudflare connection. Set it in the terminal. |

Full descriptions are in [`.env.example`](.env.example).

## Project structure

| Path | Contents |
|---|---|
| `app/` | Pages and API routes, including the review decision |
| `components/` | User interface |
| `lib/server/` | Server logic: Qur'an text, model calls, input checks |
| `db/`, `drizzle/` | Database schema and migrations |
| `scripts/create-user.mjs` | Creates a login account |
| `vendor/` | Tanzil Qur'an text and the terminology glossary |
| `tests/` | Automated tests |

## Qur'an text, model and licences

- **Qur'an text:** Tanzil Quran Text 1.1, Hafs from Asim, Uthmani script, used verbatim. Copyright © 2007-2026 Tanzil Project, licensed under Creative Commons Attribution 3.0 (<https://tanzil.net>). Details in [`vendor/README.md`](vendor/README.md). It was matched against the King Fahd Complex Mushaf (Hafs) and the two texts agree letter for letter in all 6,236 verses.
- **AMANAH model:** AMANAH Semantic Integrity v0.2 by the Amanah team, fine-tuned from mDeBERTa-v3. Measured scope: Arabic to English. v0.2 improved on v0.1 in the team's evaluation (macro F1 95.26% vs 92.15%). Support for more languages is planned.
- **Stack:** Vinext (Next.js on Cloudflare Workers), React, Cloudflare D1, Drizzle, Better Auth, Cloudflare Workers AI (Llama 3.3 70B, explanation only), Tailwind CSS, shadcn/ui.
- **Fonts and components:** Noto Sans Arabic (SIL Open Font License); Thmanyah Sans under Thmanyah's usage policy ([`public/fonts`](public/fonts)); Phosphor Icons, shadcn/ui styles and sites-vite-plugin (MIT, licence files included).
- **Scientific reference:** the reference and data pack of the "AI in the Service of Islamic Content" challenge.
