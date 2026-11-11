// ── CLASSIFICATION HANDLER ────────────────────────────────────────────────────
// Fixed v2.2.1:
//   - Removed AbortSignal.timeout() from individual Gemini fetch calls.
//     The Vercel function-level maxDuration (45s) is the correct timeout boundary.
//     Per-call AbortSignal of 20s + 6s sleep + 20s retry = 46s which exceeded
//     the Vercel limit and caused "operation was aborted due to timeout".
//   - Model fallback now uses gemini-3.6-flash as primary (gemini-2.0-flash,
//     gemini-1.5-flash, gemini-1.5-pro all retired by Google — return 404).
//   - 429 retry wait reduced to 4s (safe headroom within 45s budget).
//   - All exits return structured JSON — no raw crashes to the frontend.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { items, referenceItems } = req.body || {};
    if (!items?.length) return res.status(400).json({ error: "No items provided" });

    const key = process.env.GOOGLE_AI_KEY;
    if (!key) return res.status(200).json({
      classifications: [],
      error: "GOOGLE_AI_KEY is not set. Go to Vercel → Settings → Environment Variables and add it, then redeploy."
    });

    // Only classify items that have a description — preserve alignment with input array
    const positions = [];
    const toClassify = [];
    items.forEach((it, i) => {
      if ((it.description || "").trim().length > 0) {
        positions.push(i);
        toClassify.push(it);
      }
    });
    if (!toClassify.length) return res.status(200).json({
      classifications: [],
      error: "No item descriptions to classify. Please add descriptions first."
    });

    // Reference block from previously assessed BEs — highest confidence source
    const referenceBlock = (referenceItems?.length > 0)
      ? `\nIMPORTANT — PRIOR ASSESSED FILINGS (authoritative reference):\nThe CHA has provided previously assessed customs filings for this importer. These classifications were accepted by Indian customs and are the gold standard. If an item below matches or closely resembles a reference item, USE THE REFERENCE CTH and set confidence High, noting "matches assessed BE" in reasoning.\n\nReference items:\n${referenceItems.map(r => `- "${r.description}" → CTH ${r.cth}${r.bcd ? ` (BCD ${r.bcd}, IGST ${r.igst})` : ""}`).join("\n")}\n`
      : "";

    const prompt = `You are an expert Indian customs classifier under the India Customs Tariff Act (aligned to HS 2022).
${referenceBlock}
Classify each item below under the correct 8-digit CTH (Customs Tariff Heading).

Items to classify:
${toClassify.map((it, i) =>
  `${i + 1}. Description: "${it.description.trim()}"${it.hsCode ? ` | Declared HS: ${it.hsCode}` : ""}`
).join("\n")}

Return ONLY a valid JSON array — no markdown, no backticks, no explanation before or after. Just the array.
One object per item, in the same order as above:
[
  {
    "srNo": 1,
    "proposedCth": "8-digit code, no spaces, no dots",
    "headingDescription": "short official tariff heading name",
    "reasoning": "1-2 sentences explaining which chapter and heading applies and why",
    "confidence": "High or Medium or Low",
    "declaredHsMatch": true
  }
]

Rules:
- proposedCth must be exactly 8 digits, no spaces, no dots, no dashes
- If the declared HS code looks correct, keep it and set declaredHsMatch true
- If unsure between two headings, pick the most specific one and note uncertainty in reasoning
- confidence: High = clear unambiguous classification; Medium = reasonable but alternatives exist; Low = insufficient description
- Never return fewer objects than items given`;

    // Model priority: gemini-3.6-flash is the current stable free-tier model.
    // gemini-2.0-flash and gemini-1.5-* have been retired by Google (all return 404).
    // Env var GEMINI_MODEL overrides the full list if set — use this to update
    // the model without redeploying when Google rotates models again.
    const MODELS = (process.env.GEMINI_MODEL ||
      "gemini-3.6-flash,gemini-2.5-flash,gemini-2.5-pro"
    ).split(",").map(s => s.trim());

    // NO AbortSignal here — Vercel's maxDuration (45s) is the correct boundary.
    // Adding a per-call timeout shorter than 45s caused the "aborted" error
    // because: timeout(20s) + sleep(6s) + timeout(20s) = 46s > 45s limit.
    const callGemini = async (model) => {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 4096 }
          }),
        }
      );
      const body = await r.json().catch(() => ({}));
      return { status: r.status, ok: r.ok, body };
    };

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Try each model — skip 404s (retired model names)
    let attempt = null, usedModel = null;
    const failLog = [];
    for (const model of MODELS) {
      attempt = await callGemini(model);
      failLog.push({ model, status: attempt.status, message: attempt.body?.error?.message || "" });
      if (attempt.status === 404) continue;
      usedModel = model;
      break;
    }

    if (!attempt || attempt.status === 404) {
      const detail = failLog.map(f => `${f.model}: ${f.status}${f.message ? " — " + f.message : ""}`).join(" | ");
      return res.status(200).json({
        classifications: [],
        error: `All Gemini models returned 404. API key may not have Generative Language API enabled — use a key from aistudio.google.com. Details: ${detail}`
      });
    }

    // Rate limited (429) or momentarily overloaded (503) — short wait, one retry.
    // 503 UNAVAILABLE means Google's own infrastructure is temporarily overloaded,
    // not a problem with our key or request — this resolves within seconds on retry.
    if (attempt.status === 429 || attempt.status === 503) {
      await sleep(4000);
      attempt = await callGemini(usedModel);
    }

    if (attempt.status === 401 || attempt.status === 403) {
      return res.status(200).json({
        classifications: [],
        error: `API key error (${attempt.status}). Check GOOGLE_AI_KEY in Vercel environment variables.`
      });
    }

    if (attempt.status === 429) {
      return res.status(200).json({
        classifications: [],
        error: "Gemini rate limit (429). Wait 30 seconds and try again — or the daily free quota may be exhausted."
      });
    }

    if (attempt.status === 503) {
      return res.status(200).json({
        classifications: [],
        error: "Gemini is experiencing high demand right now (503). This is temporary — please try again in a moment."
      });
    }

    if (!attempt.ok) {
      return res.status(200).json({
        classifications: [],
        error: `Gemini API error ${attempt.status}: ${JSON.stringify(attempt.body).slice(0, 300)}`
      });
    }

    if (attempt.body?.error) {
      return res.status(200).json({
        classifications: [],
        error: `Gemini error: ${attempt.body.error.message || JSON.stringify(attempt.body.error)}`
      });
    }

    const rawText = attempt.body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!rawText) {
      return res.status(200).json({
        classifications: [],
        error: "Gemini returned an empty response. Try again — this is usually transient."
      });
    }

    // Strip markdown fences if Gemini wrapped the JSON anyway
    let clean = rawText.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return res.status(200).json({
        classifications: [],
        raw: rawText.slice(0, 500),
        error: "Classification response could not be parsed as JSON. Please try again."
      });
    }

    // Normalise: strip dots/spaces from CTH codes
    const cleaned = parsed.map(c => ({
      ...c,
      proposedCth: (c.proposedCth || "").replace(/[\s.]/g, "").slice(0, 8)
    }));

    // Re-align results to original item positions (empty items remain null)
    const aligned = items.map(() => null);
    cleaned.forEach((c, j) => {
      const origIdx = positions[j];
      if (origIdx !== undefined) aligned[origIdx] = c;
    });

    return res.status(200).json({ classifications: aligned, model: usedModel });

  } catch (err) {
    return res.status(200).json({
      classifications: [],
      error: `Server error: ${err.message}. Please try again.`
    });
  }
};
