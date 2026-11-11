# CHAI — Custom House AI

Guidance for anyone (human or AI) changing this codebase. Read it before
touching code.

## What CHAI is

CHAI is a SaaS product that helps Indian Custom House Agents (CHAs) prepare
Bills of Entry (imports) and Shipping Bills (exports). It reads uploaded trade
documents, suggests a tariff classification (CTH), looks up duty rates, and
drafts replies to customs queries.

The people using it are customs professionals, not software people. Every
screen and every error message must make sense to someone with very little
software knowledge. Never show them an instruction meant for a developer
("set an environment variable", "create a sheet tab", an HTTP status code).

A CHA is legally answerable for what they file. A wrong rate or a wrong CTH
is their liability, so CHAI must always be able to show where a figure came
from.

## Stack

| Part | What we use |
|---|---|
| Frontend | React 18 + Vite, single-page app in `src/` (most of it in `src/App.jsx`) |
| Backend | Vercel serverless functions in `api/` (CommonJS, one file per endpoint) |
| Shared server code | `lib/` (`lib/gsheets.js` = Google Sheets access via a service account) |
| AI | Google Gemini, free tier |
| Reference data | Google Sheets (duty rates, exchange rates, scanner state) |
| Login | Supabase Auth |
| Hosting | Vercel (project `chai`), scheduled jobs defined in `vercel.json` |
| Source control | GitHub `mayurbothra-source/custom-house-ai` |

Supabase is for login only. Filing data does not belong there.

Environment variables are listed, names only, in `.env.example`. Keep that
file up to date whenever code starts or stops reading a variable.

## Rules

### 1. Free tiers only

Use only the free tiers of GitHub, Vercel, Supabase, Google Sheets / Google
Cloud, Gemini, Render and Resend. Do not add a paid service, a paid plan, or
anything that can produce a bill, until customers are paying us. If a change
could cause a charge or use up a free quota faster, say so before doing it.

### 2. Every duty and classification decision must be auditable

For each CTH suggested and each duty figure shown, CHAI must be able to say:
what the input was, what the answer was, where it came from (assessed Bill of
Entry, Sheet row, notification number, AI), how confident it is, and when.

- Never present an AI-generated rate as if it were a verified one.
- Never turn a missing value into a number. An empty duty cell is "unknown",
  not 0%.
- A lookup or scan that failed must say it failed. Do not report success
  when nothing was fetched.
- Keep the source and confidence labels all the way to the screen and to
  anything the user exports.

### 3. All AI calls go through `lib/aiClient.js`

No endpoint may call the Gemini API directly or read `GOOGLE_AI_KEY` itself.
All AI requests go through one module, `lib/aiClient.js`, so the provider or
model can be swapped in one place.

> Current state: `lib/aiClient.js` does not exist yet. `api/classify.js`,
> `api/duty.js`, `api/extract.js`, `api/queryDraft.js`, `api/scan-cbic.js` and
> `api/scan-dgft.js` each call Gemini directly. New AI code must not add to
> this; moving the existing calls is planned work.

### 4. Use `safeJson()`, never raw `response.json()`

When a Vercel function crashes or times out it returns an HTML page, and
`response.json()` then fails with "unexpected character at line 1 column 1".
Always read responses through `safeJson()` (defined in `src/App.jsx`), which
turns a bad response into a plain-language error. The same care applies on
the server when reading replies from Google, DGFT, ICEGATE or any other
outside service.

### 5. Vercel functions have 45–60 seconds. No sleeping retries.

Limits are set per endpoint in `vercel.json` (15–60 s). A function that goes
over is killed and the user gets a timeout.

- Do not `sleep`, `setTimeout`-wait or back off inside a function to retry.
- If an outside service says "too busy" (HTTP 429) or fails, return a clear
  JSON error straight away and let the browser decide whether to try again.
- Give every outbound `fetch` its own timeout, and make sure the timeouts of
  all calls in one request add up to less than the function's limit.

### 6. Verify Sheet header names against `api/duty.js`

`api/duty.js` reads the Duty tab as CSV and matches columns by header name,
lower-cased (`bcd_%`, `igst_%`, `sws_%`, `aidc_%`, `health_cess_%`,
`comp_cess_%`, `add_applicable`, `notification_no`, `condition`, or the older
`bcd`, `igst`, `add`, `notification`, `notes`). A header that does not match
is silently read as empty. Before changing the Sheet's columns, or the code
that writes or reads them (`lib/gsheets.js`, `api/duty.js`, the scanners),
open the live Sheet and check the header row against the code, both ways.

### 7. CTH codes are 8-digit text

A CTH is always a string of exactly 8 digits, including leading zeros
(`01012100`, never `1012100`). Never store or handle a CTH as a number — in
code, in JSON, or in a Sheet cell (format the column as plain text).
Chapters 01–09 lose their leading zero otherwise and lookups miss.

## How to work in this repo

1. **Diagnose first, then ask.** When something is wrong, find the root
   cause, explain it in plain language with the evidence, and wait for a
   go-ahead before changing code. No speculative fixes.
2. **Work on branches. Never push to `main`.** Every change goes on its own
   branch and reaches `main` through a pull request.
3. **Ask before any deploy, database migration or environment-variable
   change.** That includes Vercel deploys and redeploys, Supabase SQL or
   settings, edits to the Google Sheets, and calling any endpoint that writes
   (`/api/scan-cbic`, `/api/scan-dgft`, `/api/sheets-sync?action=init`,
   `POST /api/exchangeRates`).
4. **Never print or commit secret values.** Refer to variables by name only.
   Real values live in Vercel; `.env` files are git-ignored.
5. **Keep changes small** and limited to what was asked.

## Commands

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

There is no automated test suite yet. At minimum, `npm run build` must pass
before a pull request is opened.
