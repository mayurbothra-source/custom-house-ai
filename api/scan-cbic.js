// ── CBIC NOTIFICATION SCANNER — Plug-in Adapter ───────────────────────────────
// Completely independent of the core app. Writes only to Google Sheets.
// The app reads the sheet via GSHEET_DUTY_URL — these two never call each other.
//
// CBIC publishes notifications as direct-access PDFs.
// Confirmed live URL (Notification 45/2025, Oct 2025):
//   https://www.cbic.gov.in/resources/htdocs-cbec/cst_45_2025_3.pdf
//
// Tariff notification URL pattern (confirmed):
//   https://www.cbic.gov.in/resources//htdocs-cbec/customs/cs-act/notifications/
//   notfns-{YEAR}/cs-tariff{YEAR}/{NN}-{YEAR}Cst.pdf
//
// ADD notification URL pattern:
//   notfns-{YEAR}/cs-add{YEAR}/{NN}-{YEAR}Cadd.pdf
//
// Non-tariff (NT/exemption) notifications:
//   notfns-{YEAR}/cs-nt{YEAR}/{NN}-{YEAR}CsNT.pdf
//
// CURRENT MASTER EXEMPTION NOTIFICATION: 45/2025-Customs (Oct 24, 2025)
//   Supersedes 50/2017-Customs and 28 others. Reference this in all claims.
//
// Triggers:
//   - Vercel cron daily 00:30 UTC (6 AM IST) — "Authorization: Bearer $CRON_SECRET"
//   - Manual GET: /api/scan-cbic?secret=YOUR_SCAN_SECRET
//
// Env vars: GOOGLE_AI_KEY, GSHEET_ID, GSERVICE_ACCOUNT
//           CRON_SECRET (for Vercel cron auth), SCAN_SECRET (manual trigger)
//           GEMINI_MODEL (optional, defaults to gemini-3.6-flash)

const sheets = require("../lib/gsheets.js");

const MAX_PDFS_PER_RUN = 3;
const MAX_CONSECUTIVE_MISSES = 4;
const CURRENT_YEAR = new Date().getFullYear();
const MASTER_EXEMPTION_NOTIF = "45/2025-Customs";  // Updated from 50/2017

function pdfUrl(type, num, year) {
  const n = String(num).padStart(2, "0");
  const base = "https://www.cbic.gov.in/resources//htdocs-cbec/customs/cs-act/notifications";
  switch (type) {
    case "tariff":    return `${base}/notfns-${year}/cs-tariff${year}/${n}-${year}Cst.pdf`;
    case "add":       return `${base}/notfns-${year}/cs-add${year}/${n}-${year}Cadd.pdf`;
    case "exemption": return `${base}/notfns-${year}/cs-nt${year}/${n}-${year}CsNT.pdf`;
    default: return null;
  }
}

async function fetchPdfBase64(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "CustomHouseAI/1.0 (customs classification tool)" },
  });
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  // Verify %PDF magic bytes — CBIC sometimes returns HTML error pages with 200
  if (buf.slice(0, 4).toString("ascii") !== "%PDF") return null;
  if (buf.length > 10 * 1024 * 1024) throw new Error("PDF too large (>10MB)");
  return buf.toString("base64");
}

async function extractChanges(pdfBase64, notifLabel, type, key) {
  const model = (process.env.GEMINI_MODEL || "gemini-3.6-flash,gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-pro").split(",")[0].trim();
  const typeDesc = type === "tariff" ? "customs tariff (BCD changes)"
    : type === "add" ? "anti-dumping / countervailing / safeguard duty"
    : "exemption / non-tariff (NT)";

  const prompt = `You are an Indian customs tariff expert reading a CBIC customs notification PDF.
Notification: ${notifLabel} (type: ${typeDesc})
Current master exemption notification: ${MASTER_EXEMPTION_NOTIF}

Extract ALL duty rate changes. Return ONLY raw JSON, no markdown:
{
  "notificationDate": "DD-MM-YYYY or empty",
  "effectiveDate": "DD-MM-YYYY or empty",
  "amendsNotification": "notification number being amended, or empty",
  "summary": "one sentence: what this notification does",
  "changes": [
    {
      "cth": "8-digit CTH only, no dots (e.g. 84798999)",
      "description": "tariff item description as printed",
      "rateType": "BCD or IGST or ADD or CVD or SG or SWS",
      "newRate": 7.5,
      "unit": "% or specific unit if rate is per-unit",
      "condition": "conditions/origin/end-use requirements, or empty",
      "effectFrom": "DD-MM-YYYY if different from main effective date"
    }
  ]
}
Rules:
- newRate must be a number (7.5 not "7.5%"). For Nil/zero rate: 0
- Include EVERY CTH with a changed or new rate
- For ADD notifications: include the ADD measure duration if stated
- If purely procedural (no rate changes): return "changes": []`;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
        ]}],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(45000),
    }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text().catch(()=>"")}`);
  const d = await r.json();
  const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = raw.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed.changes)) parsed.changes = [];
  return parsed;
}

function isAuthorised(req) {
  const cronSecret = process.env.CRON_SECRET;
  const scanSecret = process.env.SCAN_SECRET;
  if (!cronSecret && !scanSecret) return true;
  const auth = req.headers?.authorization || "";
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const q = req.query?.secret || req.headers?.["x-scan-secret"] || "";
  if (scanSecret && q === scanSecret) return true;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!isAuthorised(req)) return res.status(401).json({ error: "Unauthorised" });

  const key = process.env.GOOGLE_AI_KEY;
  if (!key) return res.status(200).json({ ok: false, error: "GOOGLE_AI_KEY not set" });
  if (!process.env.GSHEET_ID) return res.status(200).json({ ok: false, error: "GSHEET_ID not set" });
  if (!process.env.GSERVICE_ACCOUNT) return res.status(200).json({ ok: false, error: "GSERVICE_ACCOUNT not set" });

  const log = [];
  let processed = 0;

  try {
    let state = await sheets.getState();
    if (!state) {
      await sheets.initSheet();
      state = { year: CURRENT_YEAR, tariff: 0, add: 0, exemption: 0 };
      log.push({ event: "sheet-initialised" });
    }
    if (state.year !== CURRENT_YEAR) {
      state = { year: CURRENT_YEAR, tariff: 0, add: 0, exemption: 0 };
      log.push({ event: "year-rollover", year: CURRENT_YEAR });
    }

    const allChanges = [];

    for (const type of ["tariff", "add", "exemption"]) {
      if (processed >= MAX_PDFS_PER_RUN) break;
      let num = (state[type] || 0) + 1;
      let misses = 0;

      while (misses < MAX_CONSECUTIVE_MISSES && processed < MAX_PDFS_PER_RUN) {
        const url = pdfUrl(type, num, state.year);
        let pdfB64 = null;
        try { pdfB64 = await fetchPdfBase64(url); }
        catch (e) { log.push({ type, num, status: "fetch-error", error: e.message }); misses++; num++; continue; }
        if (!pdfB64) { misses++; num++; continue; }

        misses = 0;
        processed++;
        const label = `${String(num).padStart(2,"0")}/${state.year}-Cus`;
        log.push({ type, num, status: "found", url });

        try {
          const ex = await extractChanges(pdfB64, label, type, key);
          log.push({ type, num, status: "extracted", changes: ex.changes.length, summary: ex.summary });
          if (ex.changes.length) {
            allChanges.push(...ex.changes.map(c => ({
              ...c, notifNum: label, effectiveDate: c.effectFrom || ex.effectiveDate || ex.notificationDate || "",
              summary: ex.summary || "",
            })));
          }
          await sheets.logNotification({ notifNum: label, type, date: ex.notificationDate || "", summary: ex.summary || "No rate changes", changesCount: ex.changes.length, url });
          state[type] = num;
        } catch (e) {
          log.push({ type, num, status: "extract-error", error: e.message });
          break;  // don't burn budget retrying in-loop
        }
        num++;
      }
    }

    if (allChanges.length) await sheets.upsertDutyRows(allChanges);
    state.lastScan = new Date().toISOString();
    await sheets.saveState(state);

    return res.status(200).json({
      ok: true, scannedAt: state.lastScan, pdfsProcessed: processed,
      rateChanges: allChanges.length, state, log,
      masterNotification: MASTER_EXEMPTION_NOTIF,
      note: processed >= MAX_PDFS_PER_RUN
        ? "Budget reached — next run continues from here."
        : "Caught up — no new notifications found.",
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message, log });
  }
};
