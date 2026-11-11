// ── EXCHANGE RATE ADAPTER — Phase 3 ──────────────────────────────────────────
// Data contract: answers "what is the CBIC-notified rate for currency X?"
// Every answer carries: source (notification ref), as_of, effective date, confidence.
//
// MODE 0 (Sheet-backed, checked first): rates stored in the "ExchangeRates" tab
//   of the existing Google Sheet, updated by the CHA via the Rates Admin screen
//   in the app (2-minute manual task, twice a month when CBIC notifies new
//   rates). This is the primary path — no external API needed, and it uses
//   the same data layer as everything else in CHAI.
// MODE 1 (live): if EXCHANGE_API_URL is set, fetches from that endpoint
//   (a licensed feed, should one become available later).
// MODE 2 (curated): hardcoded fallback below, used only if the Sheet tab is
//   empty or unreachable. Kept as a last-resort safety net.

const sheets = require("../lib/gsheets.js");

const CURATED_RATES = {
  // Last-resort fallback only — Mode 0 (Google Sheet) is the primary path now.
  notification: "Notification No. 48/2026-Customs (N.T.)",
  effectiveDate: "2026-07-03",
  rates: {
    USD: { import: 95.30, export: 93.85 },
    EUR: { import: 103.45, export: 101.60 },
    GBP: { import: 121.10, export: 118.90 },
    JPY: { import: 0.6120, export: 0.6010 },
    CNY: { import: 13.15, export: 12.90 },
    SGD: { import: 70.85, export: 69.60 },
    AED: { import: 25.95, export: 25.50 },
    CHF: { import: 106.20, export: 104.30 },
    AUD: { import: 62.40, export: 61.20 },
    HKD: { import: 12.20, export: 11.98 },
  },
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const currency = (
    (req.method === "POST" ? req.body?.currency : req.query?.currency) || "USD"
  ).toUpperCase();
  const direction = (
    (req.method === "POST" ? req.body?.direction : req.query?.direction) || "import"
  ).toLowerCase();

  const asOf = new Date().toISOString();

  // ── MODE 0: Google Sheet-backed rates (primary path) ──
  try {
    const rows = await sheets.readRange("ExchangeRates!A1:F20");
    if (rows.length > 1) {
      const [, ...dataRows] = rows;
      const match = dataRows.find(r => (r[0] || "").toUpperCase() === currency);
      if (match) {
        const [, imp, exp, notif, eff, updatedAt] = match;
        const rate = direction === "export" ? parseFloat(exp) : parseFloat(imp);
        if (rate) {
          const ageDays = eff ? Math.floor((Date.now() - new Date(eff).getTime()) / 86400000) : null;
          const stale = ageDays !== null && ageDays > 20;
          return res.status(200).json({
            currency, direction, rate,
            meta: {
              source: notif || "Manually updated rate",
              effectiveDate: eff || null,
              as_of: asOf,
              confidence: stale ? "stale" : "verified",
              ageDays,
              ...(stale && { warning: `Rate is ${ageDays} days old — update via Rates Admin screen.` }),
            },
          });
        }
      }
    }
  } catch { /* Sheet tab missing or unreachable — fall through to Mode 1/2 */ }

  // ── MODE 1: live feed (if configured) ──
  if (process.env.EXCHANGE_API_URL) {
    try {
      const r = await fetch(process.env.EXCHANGE_API_URL, {
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const d = await r.json();
        const rate = d.rates?.[currency]?.[direction];
        if (rate) {
          return res.status(200).json({
            currency, direction, rate,
            meta: {
              source: d.notification || "Live feed",
              effectiveDate: d.effectiveDate,
              as_of: asOf,
              confidence: "verified",
            },
          });
        }
      }
    } catch { /* fall through to curated */ }
  }

  // ── MODE 2: curated (last-resort hardcoded fallback) ──
  const entry = CURATED_RATES.rates[currency];
  if (!entry) {
    return res.status(200).json({
      currency, direction, rate: null,
      meta: { source: "Curated table", as_of: asOf, confidence: "unavailable" },
      error: `No rate on file for ${currency}. Add it via the Rates Admin screen.`,
    });
  }

  const ageDays = Math.floor(
    (Date.now() - new Date(CURATED_RATES.effectiveDate).getTime()) / 86400000
  );
  const stale = ageDays > 20;

  return res.status(200).json({
    currency,
    direction,
    rate: entry[direction],
    meta: {
      source: CURATED_RATES.notification,
      effectiveDate: CURATED_RATES.effectiveDate,
      as_of: asOf,
      confidence: stale ? "stale" : "curated",
      ageDays,
      ...(stale && {
        warning: `Rate is ${ageDays} days old. Update via Rates Admin screen — no redeploy needed.`,
      }),
    },
  });
};
