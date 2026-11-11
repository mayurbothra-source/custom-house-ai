// ── DGFT NOTIFICATIONS SCANNER — Plug-in Adapter ─────────────────────────────
// Fetches RoDTEP (Appendix 4R) and Drawback (AIR 77/2023-NT) schedules from
// DGFT and CBIC public URLs, extracts 8-digit item-level rates via Gemini,
// writes to dedicated sheet tabs.
//
// COMPLETELY INDEPENDENT of the core filing app. Writes only to Google Sheets.
// App reads via GSHEET_DUTY_URL published CSV — the two never talk to each other.
//
// Current authoritative sources (confirmed July 2026):
//   RoDTEP Appendix 4R: https://content.dgft.gov.in/Website/Appendix+4R+wef+10th+October+2024.pdf
//   RoDTEP latest notification: DGFT Notif. 66/2025-26 (23 March 2026) — restored full rates
//   Drawback AIR: https://www.cbic.gov.in/resources//htdocs-cbec/customs/cs-act/notifications/notfns-2023/cs-nt2023/77-2023CsNT.pdf
//   Drawback amendments: Notif. 21/2026 and 41/2026-Customs (NT)
//
// Triggers: GET /api/scan-dgft?secret=YOUR_SCAN_SECRET
//           Cron: add to vercel.json alongside scan-cbic
//
// Env vars: GOOGLE_AI_KEY, GSHEET_ID, GSERVICE_ACCOUNT, SCAN_SECRET

const sheets = require("../lib/gsheets.js");

// Confirmed public URLs — no auth required
const SOURCES = {
  rodtep: {
    url: "https://content.dgft.gov.in/Website/Appendix+4R+wef+10th+October+2024.pdf",
    label: "RoDTEP Appendix 4R (DGFT Notif. 10/2025-26, effective 01-05-2025)",
    sheetTab: "RoDTEP",
    headers: ["CTH", "Description", "RoDTEP_Rate_%", "Cap_Rs_Per_UQC", "UQC", "Notification", "Effective_Date", "Source"],
  },
  drawback: {
    url: "https://www.cbic.gov.in/resources//htdocs-cbec/customs/cs-act/notifications/notfns-2023/cs-nt2023/77-2023CsNT.pdf",
    label: "All Industry Rates of Drawback (Notif. 77/2023-Customs NT, effective 30-10-2023)",
    sheetTab: "Drawback",
    headers: ["DBK_Serial", "CTH_Heading", "Description", "DBK_Rate_%", "Cap_Rs_Per_UQC", "UQC", "Notification", "Effective_Date", "Source"],
  },
};

async function fetchPdfBase64(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": "CustomHouseAI/1.0 (export benefit calculation tool)" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.slice(0, 4).toString("ascii") !== "%PDF") throw new Error("Response is not a PDF");
  if (buf.length > 20 * 1024 * 1024) throw new Error("PDF too large (>20MB) — use chunked approach");
  return buf.toString("base64");
}

async function extractRodtep(pdfB64, key) {
  const model = (process.env.GEMINI_MODEL || "gemini-3.6-flash,gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-pro").split(",")[0].trim();
  const prompt = `You are an Indian export benefit expert reading the DGFT RoDTEP Appendix 4R schedule PDF.
This document lists item-level RoDTEP rebate rates for all eligible export goods.

Extract ALL entries. This is a large document — extract as many entries as possible.
Return ONLY raw JSON array, no markdown, no preamble:
[
  {
    "cth": "8-digit tariff item code, digits only",
    "description": "description of goods as in the schedule",
    "rate": 0.5,
    "cap": null or "500" (Rs per UQC — number only if present),
    "uqc": "Kg or NOS or MTR etc"
  }
]
Rules:
- rate is % of FOB value as a number (0.5 not "0.5%")
- cap is the per-unit cap in Rs as a number, or null if not specified
- Include EVERY row — even 0% entries if present
- CTH must be 8 digits`;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "application/pdf", data: pdfB64 } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const d = await r.json();
  const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = raw.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();
  return JSON.parse(clean);
}

async function extractDrawback(pdfB64, key) {
  const model = (process.env.GEMINI_MODEL || "gemini-3.6-flash,gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-pro").split(",")[0].trim();
  const prompt = `You are an Indian customs expert reading the CBIC All Industry Rates of Duty Drawback (AIR) schedule PDF.
This document lists drawback serial numbers, CTH headings, descriptions and rates.

Extract ALL entries. Return ONLY raw JSON array, no markdown:
[
  {
    "serial": "drawback serial number e.g. 8401 or 640301A",
    "cthHeading": "4 or 6 digit heading e.g. 8479 or 847899",
    "description": "description of goods as printed",
    "rate": 1.0,
    "cap": null or 80 (cap amount in Rs per UQC — number only),
    "uqc": "Kg or NOS etc"
  }
]
Rules:
- rate is % as number, cap is Rs as number or null
- serial is critical — customs requires exact serial for drawback sanction
- Include ALL entries including those with 0% or "NIL"`;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "application/pdf", data: pdfB64 } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const d = await r.json();
  const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = raw.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();
  return JSON.parse(clean);
}

async function ensureTab(tabName, headers) {
  try {
    const meta = await require("../lib/gsheets.js").readRange(`${tabName}!A1:A1`);
    if (!meta.length) throw new Error("empty");
  } catch {
    // Tab doesn't exist or is empty — create/init
    const gs = require("../lib/gsheets.js");
    try {
      await gs.sheetsApi?.("POST", ":batchUpdate", { requests: [{ addSheet: { properties: { title: tabName } } }] });
    } catch {}
    await gs.updateRange(`${tabName}!A1:${String.fromCharCode(64+headers.length)}1`, [headers]);
  }
}

function isAuthorised(req) {
  const s = process.env.SCAN_SECRET;
  if (!s) return true;
  return (req.query?.secret || req.headers?.["x-scan-secret"] || "") === s;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!isAuthorised(req)) return res.status(401).json({ error: "Unauthorised" });

  const key = process.env.GOOGLE_AI_KEY;
  if (!key) return res.status(200).json({ ok: false, error: "GOOGLE_AI_KEY not set" });
  if (!process.env.GSHEET_ID) return res.status(200).json({ ok: false, error: "GSHEET_ID not set" });
  if (!process.env.GSERVICE_ACCOUNT) return res.status(200).json({ ok: false, error: "GSERVICE_ACCOUNT not set" });

  const mode = req.query?.mode || "rodtep";  // "rodtep" | "drawback" | "both"
  const log = [];
  const results = {};
  const gs = sheets;

  for (const [type, cfg] of Object.entries(SOURCES)) {
    if (mode !== "both" && mode !== type) continue;

    log.push({ type, status: "fetching", url: cfg.url });
    let pdfB64 = null;
    try {
      pdfB64 = await fetchPdfBase64(cfg.url);
      log.push({ type, status: "pdf-fetched", size: `${Math.round(pdfB64.length * 0.75 / 1024)}KB` });
    } catch (e) {
      log.push({ type, status: "fetch-error", error: e.message });
      results[type] = { error: e.message };
      continue;
    }

    let entries = [];
    try {
      if (type === "rodtep") entries = await extractRodtep(pdfB64, key);
      else entries = await extractDrawback(pdfB64, key);
      log.push({ type, status: "extracted", entries: entries.length });
    } catch (e) {
      log.push({ type, status: "extract-error", error: e.message });
      results[type] = { error: e.message };
      continue;
    }

    // Write to sheet
    try {
      const today = new Date().toISOString().slice(0,10);
      let rows = [];
      if (type === "rodtep") {
        rows = entries.map(e => [
          (e.cth||"").replace(/\D/g,""), e.description||"", e.rate||0,
          e.cap ?? "", e.uqc||"", cfg.label, "01-05-2025", `DGFT scan ${today}`
        ]);
      } else {
        rows = entries.map(e => [
          e.serial||"", (e.cthHeading||"").replace(/\D/g,""), e.description||"",
          e.rate||0, e.cap ?? "", e.uqc||"", cfg.label, "30-10-2023", `CBIC scan ${today}`
        ]);
      }
      // Clear existing data and rewrite (schedules are full replacements, not incremental)
      await gs.updateRange(`${cfg.sheetTab}!A1:${String.fromCharCode(64+cfg.headers.length)}1`, [cfg.headers]);
      if (rows.length) await gs.appendRows(`${cfg.sheetTab}!A2`, rows);
      log.push({ type, status: "written", rows: rows.length, tab: cfg.sheetTab });
      results[type] = { entries: entries.length, rows: rows.length, tab: cfg.sheetTab };
    } catch (e) {
      log.push({ type, status: "sheet-error", error: e.message });
      results[type] = { error: e.message };
    }
  }

  return res.status(200).json({
    ok: true, scannedAt: new Date().toISOString(),
    mode, results, log,
    tip: "Run with ?mode=rodtep (default) or ?mode=drawback or ?mode=both. Schedule takes ~60s per document.",
  });
};
