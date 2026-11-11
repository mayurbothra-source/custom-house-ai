// ── IEC VALIDATION ADAPTER — Phase 2 ─────────────────────────────────────────
// Data contract: answers "is this IEC valid, who is it, any flags?"
// Every answer carries: source, as_of, confidence (verified | curated | unavailable)
//
// MODE 1 (live): if DGFT_API_URL env var is set, queries the live endpoint.
//   DGFT does not publish a stable public JSON API. When you obtain access
//   (via DGFT's API gateway registration or a licensed data provider),
//   set DGFT_API_URL and DGFT_API_KEY in Vercel env vars — no code change needed.
// MODE 2 (curated): falls back to the curated registry below — clearly
//   labelled "curated" in the response so the UI never claims it's live.

const CURATED_IECS = {
  // Test client's actual importers can be added here as they onboard.
  // Format: IEC -> entity record
  "0305061253": {
    name: "Indo Japan Horologicals Pvt Ltd",
    gstin: "19AAACI7060H1ZJ",
    adCode: "6391434",
    status: "Active",
    address: "Kolkata, West Bengal",
    rodtepRegistered: true,
    epcg: { active: true, licNo: "0510213945", totalObligation: "12 Cr", balance: "8.4 Cr" },
    flags: [],
  },
  "0388016461": {
    name: "ASM Technology India Pvt Ltd",
    gstin: "29AABCA1234F1Z5",
    adCode: "6391001",
    status: "Active",
    address: "Bengaluru, Karnataka",
    rodtepRegistered: false,
    epcg: { active: false },
    flags: [],
  },
  // Deliberate demo case: an IEC with a GST anomaly flag
  "0399999999": {
    name: "Demo Trading Co (GST anomaly case)",
    gstin: "19ZZZZZ9999Z9Z9",
    adCode: "6391999",
    status: "Active",
    address: "Kolkata, West Bengal",
    rodtepRegistered: false,
    epcg: { active: false },
    flags: [
      { type: "GST_ARREARS", detail: "GSTR-3B not filed for 2 consecutive months", severity: "warning" },
    ],
  },
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { iec } = req.body || {};
  const clean = (iec || "").trim().toUpperCase();
  if (!clean || clean.length !== 10) {
    return res.status(200).json({
      found: false,
      error: "IEC must be exactly 10 characters.",
    });
  }

  const asOf = new Date().toISOString();

  // ── MODE 1: live DGFT endpoint (if configured) ──
  if (process.env.DGFT_API_URL) {
    try {
      const r = await fetch(`${process.env.DGFT_API_URL}?iec=${encodeURIComponent(clean)}`, {
        headers: process.env.DGFT_API_KEY
          ? { "Authorization": `Bearer ${process.env.DGFT_API_KEY}` }
          : {},
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        return res.status(200).json({
          found: true,
          record: d,
          meta: { source: "DGFT live query", as_of: asOf, confidence: "verified" },
        });
      }
      // Live endpoint failed — fall through to curated with a note
    } catch {
      // timeout or network error — fall through to curated
    }
  }

  // ── MODE 2: curated registry ──
  const record = CURATED_IECS[clean];
  if (record) {
    return res.status(200).json({
      found: true,
      record,
      meta: {
        source: "Demo registry (curated)",
        as_of: asOf,
        confidence: "curated",
      },
    });
  }

  return res.status(200).json({
    found: false,
    meta: {
      source: "Demo registry (curated)",
      as_of: asOf,
      confidence: "unavailable",
    },
    error: "IEC not found in the registry. Live DGFT lookup is not yet connected — you can proceed by entering the exporter/importer details manually, or add this IEC to the curated registry.",
  });
};
