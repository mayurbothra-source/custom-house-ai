// ── ICEGATE STATUS ADAPTER ────────────────────────────────────────────────────
// Attempts to fetch BE/SB filing status from IceGate public tracking.
// Known limitation: IceGate frequently blocks automated requests.
// This handler ALWAYS returns a structured response — never crashes the UI.
// URL override: set ICEGATE_STATUS_URL env var to change endpoint without redeploy.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { blAwbNumber, beNumber, type } = req.body || {};
    const ref = beNumber || blAwbNumber;
    if (!ref) return res.status(200).json({
      available: false, message: "No BL/AWB or BE number provided."
    });

    const baseUrl = process.env.ICEGATE_STATUS_URL ||
      "https://enquiry.icegate.gov.in/enquiryatices/beTrackPublic";

    // IceGate blocks most automated calls — attempt with a short timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const url = `${baseUrl}?blNo=${encodeURIComponent(ref)}`;
      const r = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CHAI/1.0)",
          "Accept": "text/html,application/json",
        },
      });
      clearTimeout(timer);

      if (!r.ok) {
        return res.status(200).json({
          available: false,
          source: "icegate",
          checkedAt: new Date().toISOString(),
          message: `IceGate returned ${r.status} — check manually at icegate.gov.in`,
          manualUrl: `https://enquiry.icegate.gov.in/enquiryatices/beTrackPublic`,
        });
      }

      const text = await r.text();
      // IceGate returns HTML — look for known status phrases
      const statusMap = [
        { phrase: "Out of Charge", status: "Out of Charge", meaning: "Goods cleared — Out of Charge granted" },
        { phrase: "Under Examination", status: "Under Examination", meaning: "BE is under customs examination" },
        { phrase: "Query Raised", status: "Query Raised", meaning: "Customs has raised a query — response required" },
        { phrase: "Duty Assessed", status: "Duty Assessed", meaning: "Duty assessed — awaiting payment and clearance" },
        { phrase: "First Check", status: "First Check", meaning: "First check/examination in progress" },
        { phrase: "Second Check", status: "Second Check", meaning: "Second check ordered" },
      ];

      const found = statusMap.find(s => text.includes(s.phrase));
      if (found) {
        return res.status(200).json({
          available: true,
          source: "icegate",
          checkedAt: new Date().toISOString(),
          status: found.status,
          meaning: found.meaning,
          ref,
        });
      }

      return res.status(200).json({
        available: false,
        source: "icegate",
        checkedAt: new Date().toISOString(),
        message: "IceGate responded but status could not be parsed. Check manually.",
        manualUrl: `https://enquiry.icegate.gov.in/enquiryatices/beTrackPublic`,
      });

    } catch (fetchErr) {
      clearTimeout(timer);
      const isTimeout = fetchErr.name === "AbortError";
      return res.status(200).json({
        available: false,
        source: "icegate",
        checkedAt: new Date().toISOString(),
        message: isTimeout
          ? "IceGate did not respond in time — it frequently blocks automated requests. Check manually."
          : "IceGate is unreachable right now. Check manually at icegate.gov.in.",
        manualUrl: "https://enquiry.icegate.gov.in/enquiryatices/beTrackPublic",
      });
    }

  } catch (err) {
    return res.status(200).json({
      available: false,
      message: `Status check error: ${err.message}`,
      manualUrl: "https://enquiry.icegate.gov.in/enquiryatices/beTrackPublic",
    });
  }
};
