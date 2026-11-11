module.exports = async function handler(req, res) {
  // CORS for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Everything below is wrapped in one top-level try/catch. Previously, input
  // validation and prompt-building ran OUTSIDE any try/catch, so an unexpected
  // error there would escape as an unhandled exception — Vercel then returns
  // its own HTML/plain-text crash page instead of JSON, which is exactly what
  // breaks res.json() on the frontend with "unexpected character at line 1
  // column 1". Every exit from this function now goes through res.json().
  try {
  const { fileBase64, mimeType, mode, pages } = req.body || {};
  // Accept either a single file (fileBase64+mimeType) or multiple photographed pages [{base64, mime}]
  const pageList = Array.isArray(pages) && pages.length > 0
    ? pages.filter(p => p?.base64)
    : (fileBase64 ? [{ base64: fileBase64, mime: mimeType }] : []);
  if (!pageList.length) return res.status(400).json({ error: "No file provided" });

  const key = process.env.GOOGLE_AI_KEY;
  if (!key) return res.status(200).json({
    data: null,
    error: "GOOGLE_AI_KEY is not set. Go to Vercel → Settings → Environment Variables and add it, then redeploy."
  });

  const referencePrompt = `You are an expert at reading Indian customs documents: assessed Bills of Entry, Shipping Bills, and customs checklists.

This is a PREVIOUSLY FILED customs document being uploaded as a reference. Extract every classified item from it.

Return ONLY a raw JSON object — no markdown, no backticks:
{
  "documentType": "AssessedBE or ShippingBill or Checklist or Other",
  "beNumber": "BE or SB number if visible",
  "beDate": "",
  "referenceItems": [
    {
      "description": "item description exactly as printed",
      "cth": "8-digit CTH code, digits only",
      "bcd": "BCD rate if visible e.g. 7.5%",
      "igst": "IGST rate if visible e.g. 18%",
      "notification": "any exemption notification cited"
    }
  ]
}

RULES:
- Every classified line item must appear in referenceItems.
- CTH must be 8 digits, strip dots and spaces.
- Copy rates exactly as printed. Empty string if not visible.
- This document is authoritative — it was assessed by customs.`;

  const queryPrompt = `You are reading a query notice raised by the Indian Customs department on a Bill of Entry or Shipping Bill, as it appears on the ICEGATE portal or in a screenshot/PDF of that notice.

Extract the query details exactly as written. Do not summarise, paraphrase, or add any explanation of your own — copy the officer's actual wording.

Return ONLY a raw JSON object — no markdown, no backticks, no explanation. Just the JSON.

{
  "beOrSbNumber": "BE or SB number if visible",
  "queryDate": "date the query was raised, if visible",
  "queryNumber": "query reference number if visible",
  "officerName": "name or designation of the officer, if visible",
  "queryText": "the full query text, copied exactly as written, preserving line breaks as \\n"
}

RULES:
- queryText must be the complete query exactly as printed — do not shorten it.
- If a field is not visible in the document, use empty string.
- If this does not look like a customs query notice at all, still return the JSON structure with your best interpretation of any text visible, and leave queryText as whatever text is present.`;

  const prompt = mode === "reference" ? referencePrompt : mode === "query" ? queryPrompt : `You are an expert at reading Indian import/export trade documents: Bills of Lading, Airway Bills, Commercial Invoices, Packing Lists.

Read this document carefully and extract ALL information visible.

Return ONLY a raw JSON object — no markdown, no backticks, no explanation. Just the JSON.

Use this exact structure:
{
  "documentType": "BL or AWB or Invoice or PackingList or Other",
  "blAwbNumber": "",
  "blAwbDate": "",
  "consignorName": "",
  "consignorAddress": "",
  "consigneeName": "",
  "consigneeAddress": "",
  "portOfLoading": "",
  "portOfDischarge": "",
  "vessel": "",
  "countryOfOrigin": "",
  "numberOfPackages": "",
  "grossWeight": "",
  "marksAndNumbers": "",
  "currency": "",
  "incoterm": "",
  "totalInvoiceValue": "",
  "invoices": [
    {
      "invoiceNumber": "",
      "invoiceDate": "",
      "shipperName": "",
      "shipperAddress": "",
      "currency": "",
      "incoterm": "",
      "invoiceValue": "",
      "lineItems": [
        {
          "srNo": "1",
          "description": "full item description exactly as printed",
          "quantity": "",
          "unit": "",
          "unitPrice": "",
          "amount": "",
          "hsCode": ""
        }
      ]
    }
  ]
}

RULES:
- For a BL/AWB: fill transport fields. invoices array can be empty.
- For a Commercial Invoice: put ALL line items inside invoices[0].lineItems. Every single row in the goods table must be a separate lineItem. Do not skip any row.
- If the document has both transport and invoice info, fill everything.
- Copy values EXACTLY as printed. Never invent values.
- If a field is not in the document, use empty string.
- lineItems must have every single row — do not summarise or combine rows.`;

  const normMime = (m) => {
    const supported = ["application/pdf", "image/jpeg", "image/jpg", "image/png",
      "image/gif", "image/webp", "image/heic", "image/heif"];
    return supported.includes((m || "").toLowerCase()) ? m : "application/pdf";
  };

  const buildBody = (pgs) => ({
    contents: [{
      parts: [
        { text: pgs.length > 1
            ? prompt + `\n\nNOTE: This document was photographed as ${pgs.length} separate page images, in order. Treat them as ONE document.`
            : prompt },
        ...pgs.map(p => ({ inline_data: { mime_type: normMime(p.mime), data: p.base64 } }))
      ]
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 }
  });

  const MODELS = (process.env.GEMINI_MODEL || "gemini-3.6-flash,gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-pro").split(",").map(s => s.trim());

  const callGemini = async (pgs, model) => {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(pgs))
      }
    );
    const body = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, body };
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  try {
    // Try each model in the chain — a 404 means that model is retired, move on
    let attempt = null, usedModel = null;
    const failLog = [];
    for (const model of MODELS) {
      attempt = await callGemini(pageList, model);
      failLog.push({ model, status: attempt.status, message: attempt.body?.error?.message || "" });
      if (attempt.status === 404) continue;   // model retired — try next
      usedModel = model;
      break;
    }
    if (!attempt || attempt.status === 404) {
      const detail = failLog.map(f => `${f.model}: ${f.status}${f.message ? " — " + f.message : ""}`).join(" | ");
      return res.status(200).json({
        data: null,
        error: `All Gemini models returned 404. This usually means the API key isn't a valid Generative Language API key (Console-issued keys need the "Generative Language API" enabled, or use a key from aistudio.google.com instead), or GEMINI_MODEL env var has bad values. Details: ${detail}`
      });
    }

    // Rate limited — short wait only (4s safe within 45s Vercel budget)
    if (attempt.status === 429) {
      await sleep(4000);
      attempt = await callGemini(pageList, usedModel);
    }

    // Auth / key error
    if (attempt.status === 401 || attempt.status === 403) {
      return res.status(200).json({
        data: null,
        error: `API key error (${attempt.status}). Check that GOOGLE_AI_KEY is correct in Vercel environment variables and that the key has Gemini API access enabled.`
      });
    }

    // Still rate limited after retry
    if (attempt.status === 429) {
      return res.status(200).json({
        data: null,
        error: "rate limit — Please wait 60 seconds and try uploading again. If this persists, the free Gemini tier quota may be exhausted for today."
      });
    }

    // Other HTTP error
    if (!attempt.ok) {
      return res.status(200).json({
        data: null,
        error: `Gemini API error ${attempt.status}: ${JSON.stringify(attempt.body).slice(0, 200)}`
      });
    }

    // Gemini-level error in response body
    if (attempt.body.error) {
      return res.status(200).json({
        data: null,
        error: `Gemini error: ${attempt.body.error.message || JSON.stringify(attempt.body.error)}`
      });
    }

    // Safety / empty response
    const rawText = attempt.body?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const finishReason = attempt.body?.candidates?.[0]?.finishReason || "";

    if (!rawText) {
      if (finishReason === "SAFETY") {
        return res.status(200).json({
          data: null,
          error: "Document was blocked by Gemini safety filters. Try a different scan or enter details manually."
        });
      }
      return res.status(200).json({
        data: null,
        error: "Gemini returned an empty response. The document may be unreadable. Try a clearer scan or PDF, or enter details manually."
      });
    }

    // Strip markdown fences if Gemini added them despite instructions
    let clean = rawText.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Try to find JSON object in the response if there's surrounding text
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); }
        catch { /* fall through */ }
      }
      if (!parsed) {
        return res.status(200).json({
          data: null,
          raw: rawText.slice(0, 500),
          error: "Document was read but the response could not be parsed as JSON. Please enter details manually."
        });
      }
    }

    // Normalise: if invoice data returned flat (not in invoices array), wrap it
    if (!parsed.invoices || parsed.invoices.length === 0) {
      if (parsed.invoiceNumber || (parsed.lineItems?.length > 0)) {
        parsed.invoices = [{
          invoiceNumber:  parsed.invoiceNumber  || "",
          invoiceDate:    parsed.invoiceDate    || parsed.blAwbDate || "",
          shipperName:    parsed.consignorName  || parsed.shipperName || "",
          shipperAddress: parsed.consignorAddress || parsed.shipperAddress || "",
          currency:       parsed.currency       || "",
          incoterm:       parsed.incoterm        || "",
          invoiceValue:   parsed.totalInvoiceValue || parsed.invoiceValue || "",
          lineItems:      (parsed.lineItems || []).map((li, i) => ({
            srNo: li.srNo || String(i + 1),
            description: li.description || "",
            quantity: li.quantity || "",
            unit: li.unit || "",
            unitPrice: li.unitPrice || "",
            amount: li.amount || "",
            hsCode: li.hsCode || "",
          })),
        }];
      }
    }

    return res.status(200).json({ data: parsed });

  } catch (err) {
    return res.status(200).json({
      data: null,
      error: `Network error: ${err.message}. Check your internet connection and try again.`
    });
  }
  } catch (outerErr) {
    // Final safety net for anything that threw before the inner try started
    // (malformed request body, unexpected input shape, etc.) — guarantees
    // valid JSON is always returned.
    return res.status(200).json({
      data: null,
      error: `Unexpected server error: ${outerErr.message}. Please try again.`
    });
  }
}
