// ── EXCHANGE RATES — GOOGLE SHEET-BACKED ──────────────────────────────────────
// Solves the "CBIC blocks automated scraping" problem without any outside API:
// the CHA (or you) manually updates rates twice a month via a simple in-app
// screen, taking 2 minutes, matching how every CHA firm in India already
// handles this. Rates live in a new "ExchangeRates" tab on the existing
// Google Sheet — same data layer as everything else in CHAI.
//
// GET  /api/exchangeRates            → returns all currently stored rates
// POST /api/exchangeRates            → { notification, effectiveDate, rates: {...} } to update
//
// Sheet tab: ExchangeRates
// Row 1: headers — Currency | Import Rate | Export Rate | Notification | Effective Date | Updated At
// Row 2+: one row per currency

const sheets = require("../lib/gsheets.js");

const TAB = "ExchangeRates";
const RANGE_ALL = `${TAB}!A1:F20`;

async function ensureTab() {
  try {
    await sheets.readRange(`${TAB}!A1:A1`);
  } catch {
    // Tab doesn't exist yet — this will surface as an error the admin screen
    // can show clearly, prompting a one-time manual tab creation.
    throw new Error(`Sheet tab "${TAB}" not found. Create it once in your Google Sheet with header row: Currency | Import Rate | Export Rate | Notification | Effective Date | Updated At`);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      await ensureTab();
      const rows = await sheets.readRange(RANGE_ALL);
      if (!rows.length || rows.length < 2) {
        return res.status(200).json({ rates: {}, notification: "", effectiveDate: "", message: "No rates stored yet — add them via the Rates Admin screen." });
      }
      const [header, ...dataRows] = rows;
      const rates = {};
      let notification = "", effectiveDate = "", updatedAt = "";
      dataRows.forEach(r => {
        const [currency, imp, exp, notif, eff, upd] = r;
        if (!currency) return;
        rates[currency.toUpperCase()] = {
          import: parseFloat(imp) || 0,
          export: parseFloat(exp) || 0,
        };
        if (notif) notification = notif;
        if (eff) effectiveDate = eff;
        if (upd) updatedAt = upd;
      });
      return res.status(200).json({ rates, notification, effectiveDate, updatedAt });
    }

    if (req.method === "POST") {
      const { notification, effectiveDate, rates } = req.body || {};
      if (!rates || typeof rates !== "object") {
        return res.status(400).json({ error: "rates object required, e.g. { USD: { import: 95.3, export: 93.8 } }" });
      }
      await ensureTab();
      const now = new Date().toISOString();
      const header = ["Currency", "Import Rate", "Export Rate", "Notification", "Effective Date", "Updated At"];
      const dataRows = Object.entries(rates).map(([currency, r]) => [
        currency.toUpperCase(), r.import || "", r.export || "", notification || "", effectiveDate || "", now
      ]);
      await sheets.updateRange(RANGE_ALL, [header, ...dataRows]);
      return res.status(200).json({ ok: true, updatedAt: now, count: dataRows.length });
    }

    return res.status(405).json({ error: "GET or POST only" });

  } catch (err) {
    return res.status(200).json({
      rates: {},
      error: `Exchange rate sheet error: ${err.message}`,
    });
  }
};
