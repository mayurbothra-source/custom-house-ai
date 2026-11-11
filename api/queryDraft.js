// ── QUERY RESPONSE AI DRAFTER ─────────────────────────────────────────────────
// Uses Gemini (free tier) to draft a formal customs query response letter
// using the filing's audit trail. Token-efficient — only classification
// decisions and duty figures are sent, NOT raw invoice text.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { filingRef, importer, iec, blAwbNumber, classifications, dutyFigures, queryText, chaFirm } = req.body || {};

    const key = process.env.GOOGLE_AI_KEY;
    if (!key) return res.status(200).json({
      draft: null,
      error: "GOOGLE_AI_KEY not set."
    });

    if (!classifications?.length) return res.status(200).json({
      draft: null,
      error: "No classification data provided — cannot draft response."
    });

    const classBlock = classifications.map((c, i) =>
      `Item ${i+1}: "${c.description}" → CTH ${c.cth} (${c.headingDescription || ""})\n  Reasoning: ${c.reasoning || "—"}\n  Confidence: ${c.confidence || "—"}`
    ).join("\n\n");

    const dutyBlock = dutyFigures
      ? `Assessable Value: ${dutyFigures.av || "—"}\nBCD: ${dutyFigures.bcd || "—"}\nIGST: ${dutyFigures.igst || "—"}\nTotal Duty: ${dutyFigures.total || "—"}`
      : "Duty figures not provided.";

    const querySection = queryText
      ? `\nThe specific query raised by Customs:\n"${queryText}"\n`
      : "\nNo specific query text provided — draft a general response defending the classification.\n";

    const prompt = `You are assisting an Indian Custom House Agent to prepare a formal written response to a query raised by the Indian Customs department.

Filing reference: ${filingRef || "—"}
Importer: ${importer || "—"} (IEC: ${iec || "—"})
BL/AWB: ${blAwbNumber || "—"}
CHA Firm: ${chaFirm || "[CHA firm name]"}
${querySection}
Classification decisions on record:
${classBlock}

Duty figures:
${dutyBlock}

Draft a formal response letter to the Customs officer. Requirements:
- Use formal Indian government correspondence style
- Subject line referencing the BL/AWB number and query
- Address: "To, The Assistant/Deputy Commissioner of Customs"
- Body: factually explain each classification using the chapter and heading references provided
- Cite the relevant CTH and the reasoning recorded at the time of filing
- Do not invent any facts not present in the data above
- Conclude with a declaration that the information is true and correct
- Leave signature block as: "[CHA Name], [CHA Licence No.], [Date]"
- Keep the letter to one page (under 400 words)

Return only the letter text — no preamble, no explanation, no markdown.`;

    const MODELS = (process.env.GEMINI_MODEL || "gemini-3.6-flash,gemini-2.5-flash,gemini-2.5-pro").split(",").map(s => s.trim());

    let draft = null;
    for (const model of MODELS) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 1200 }
            }),
          }
        );
        const body = await r.json().catch(() => ({}));
        if (r.status === 404) continue;
        if (!r.ok) break;
        const text = body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) { draft = text.trim(); break; }
      } catch { continue; }
    }

    if (!draft) return res.status(200).json({
      draft: null,
      error: "Gemini could not generate a draft. Check API key and try again."
    });

    return res.status(200).json({ draft });

  } catch (err) {
    return res.status(200).json({ draft: null, error: `Server error: ${err.message}` });
  }
};
