// ── DUTY ENGINE API ───────────────────────────────────────────────────────────
//
// Priority chain for every CTH lookup:
//   1. Verified overrides — from assessed BEs (gold standard, hardcoded)
//   2. Google Sheet overrides — GSHEET_DUTY_URL env var (optional, small override list)
//   3. WITS cross-check — World Bank public API, BCD at HS6 level (free, no key)
//   4. Gemini AI lookup — full tariff coverage from training data (Budget 2024-25)
//   5. Bundled indicative table — fallback for ~120 common CTHs
//
// Every result carries an honest source label and confidence level.
// The CHA must verify rates before filing — this is a reference tool.

// ── VERIFIED OVERRIDES (from assessed BEs — gold standard) ───────────────────
const VERIFIED = {
  "84798999": { bcd:7.5,  igst:18, add:0, desc:"Machinery parts / wire bonder",      src:"Assessed BE 2124323",     conf:"verified" },
  "85419000": { bcd:0,    igst:18, add:0, desc:"Semiconductor wafers / chips / LED", src:"Assessed BE 2124323/9912239", conf:"verified" },
  "84818090": { bcd:0,    igst:18, add:0, desc:"Solenoid valve",                     src:"Assessed BE 2124323",     conf:"verified" },
  "39100090": { bcd:7.5,  igst:18, add:0, desc:"Silicones (potting compound)",       src:"Assessed BE 2121241",     conf:"verified" },
  "32065000": { bcd:7.5,  igst:18, add:0, desc:"Phosphor / inorganic colouring",    src:"Assessed BE 9912239",     conf:"verified" },
};

// ── BUNDLED INDICATIVE TABLE (common CTHs, Budget 2024-25) ───────────────────
// Used as fallback. Gemini lookup is preferred for anything not here.
const BUNDLED = {
  "84713010": { bcd:0,   igst:18, add:0, desc:"Laptops / notebooks",                    src:"ITA bound",             conf:"indicative" },
  "84714190": { bcd:0,   igst:18, add:0, desc:"Desktop computers",                      src:"ITA bound",             conf:"indicative" },
  "84715000": { bcd:0,   igst:18, add:0, desc:"Processing units",                       src:"ITA bound",             conf:"indicative" },
  "84733099": { bcd:0,   igst:18, add:0, desc:"Parts/accessories for computers",        src:"ITA bound",             conf:"indicative" },
  "85171300": { bcd:20,  igst:18, add:0, desc:"Smartphones / mobile phones",            src:"Indicative",            conf:"indicative" },
  "85423100": { bcd:0,   igst:18, add:0, desc:"Processors and controllers (ICs)",       src:"ITA bound",             conf:"indicative" },
  "85423900": { bcd:0,   igst:18, add:0, desc:"Integrated circuits NES",                src:"ITA bound",             conf:"indicative" },
  "85419000": { bcd:0,   igst:18, add:0, desc:"Semiconductor wafers / chips",           src:"ITA bound",             conf:"indicative" },
  "85340000": { bcd:0,   igst:18, add:0, desc:"Bare printed circuit boards",            src:"PCB exempt",            conf:"indicative" },
  "95030090": { bcd:70,  igst:18, add:0, desc:"Toys — BIS CRS mandatory",              src:"Indicative",            conf:"indicative" },
  "49011000": { bcd:0,   igst:0,  add:0, desc:"Books, brochures, leaflets",             src:"Books exempt",          conf:"indicative" },
  "49019900": { bcd:0,   igst:0,  add:0, desc:"Printed books / dictionaries",           src:"Books exempt",          conf:"indicative" },
  "64039990": { bcd:35,  igst:18, add:0, desc:"Footwear, leather upper",               src:"Indicative",            conf:"indicative" },
  "71131900": { bcd:15,  igst:3,  add:0, desc:"Jewellery of precious metal",           src:"Indicative",            conf:"indicative" },
  "30049099": { bcd:10,  igst:12, add:0, desc:"Medicines NES (formulated)",            src:"Indicative",            conf:"indicative" },
  "90189099": { bcd:7.5, igst:12, add:0, desc:"Medical instruments NES",              src:"Indicative",            conf:"indicative" },
  "85414100": { bcd:40,  igst:12, add:0, desc:"Solar photovoltaic cells",              src:"ALMM policy",           conf:"indicative" },
  "87089900": { bcd:15,  igst:28, add:0, desc:"Motor vehicle parts NES",              src:"Indicative",            conf:"indicative" },
  "61091000": { bcd:20,  igst:12, add:0, desc:"T-shirts, cotton",                     src:"Indicative",            conf:"indicative" },
  "33049990": { bcd:20,  igst:18, add:0, desc:"Beauty / skin-care preparations",      src:"CDSCO applies",         conf:"indicative" },
  "56081110": { bcd:10,  igst:12, add:0, desc:"Nylon monofilament fishing net",       src:"AIFTA may apply",       conf:"indicative" },
  "84818081": { bcd:7.5, igst:18, add:0, desc:"Ball valves",                          src:"Indicative",            conf:"indicative" },
  "84819000": { bcd:7.5, igst:18, add:0, desc:"Valve parts",                          src:"Indicative",            conf:"indicative" },
  "85044090": { bcd:7.5, igst:18, add:0, desc:"Power supply / governor converter",    src:"Indicative",            conf:"indicative" },
};

// ── CHAPTER DEFAULTS (final safety net) ──────────────────────────────────────
// Guarantees the calculator never returns 0% for an unknown CTH. These are
// chapter-level typical rates, NOT filing rates — always returned with
// confidence "chapter-default" so the UI shows them as unverified.
// Static and rarely changing, so held in code rather than a second CSV.
const CHAPTER_DEFAULT = {
  "01":[30,12],"02":[30,0], "03":[30,5], "04":[30,5], "05":[10,5],
  "06":[10,5], "07":[30,0], "08":[30,5], "09":[30,5], "10":[50,0],
  "11":[30,0], "12":[30,5], "13":[10,18],"14":[10,5], "15":[100,5],
  "16":[30,12],"17":[60,5], "18":[30,18],"19":[30,18],"20":[30,12],
  "21":[30,18],"22":[150,28],"23":[30,5],"24":[30,28],"25":[10,18],
  "26":[2.5,18],"27":[5,0],  "28":[7.5,18],"29":[7.5,18],"30":[0,12],
  "31":[5,5],  "32":[10,18],"33":[20,28],"34":[20,18],"35":[7.5,18],
  "36":[10,18],"37":[10,18],"38":[7.5,18],"39":[7.5,18],"40":[10,18],
  "41":[10,18],"42":[15,18],"43":[10,18],"44":[10,18],"45":[10,18],
  "46":[10,12],"47":[0,12],  "48":[10,12],"49":[0,0],   "50":[10,5],
  "51":[10,12],"52":[10,12],"53":[10,12],"54":[5,12],  "55":[7.5,12],
  "56":[20,12],"57":[20,12],"58":[20,12],"59":[20,12],"60":[20,12],
  "61":[20,12],"62":[20,12],"63":[20,12],"64":[25,18],"65":[20,18],
  "66":[20,12],"67":[20,18],"68":[10,18],"69":[10,18],"70":[10,18],
  "71":[15,3],  "72":[12.5,18],"73":[7.5,18],"74":[5,18],"75":[2.5,18],
  "76":[7.5,18],"78":[2.5,18],"79":[5,18],  "80":[5,18], "81":[5,18],
  "82":[7.5,18],"83":[10,18],"84":[7.5,18],"85":[7.5,18],"86":[5,5],
  "87":[15,28],"88":[0,5],   "89":[0,5],   "90":[7.5,18],"91":[20,18],
  "92":[10,12],"93":[10,18],"94":[20,18],"95":[20,18],"96":[20,18],
  "97":[10,12],"98":[7.5,18],
};

// Chapters where a cess applies by rule — mirrors dutyData.js CESS_RULES
function chapterCess(cth) {
  const out = { aidc: 0, healthCess: 0, compCess: 0, note: "" };
  if (/^90(18|19|20|21|22)/.test(cth)) {
    out.healthCess = 5; out.note = "Health Cess 5% — specified medical devices";
  } else if (/^8703/.test(cth)) {
    out.compCess = 20; out.note = "Compensation Cess — varies 1–22% by engine/type";
  } else if (/^7108|^7113|^7106/.test(cth)) {
    out.aidc = 5; out.note = "AIDC 5% — gold/silver";
  } else if (/^2402|^2403/.test(cth)) {
    out.compCess = 290; out.note = "Compensation Cess — tobacco, varies widely";
  }
  return out;
}

// ── MODULE-LEVEL CACHE ────────────────────────────────────────────────────────
const _geminiCache = {};          // cth → {result, cachedAt}
const _witsCache = {};            // hs6 → {bcd, cachedAt}
const _sheetCache = { table: null, cachedAt: 0 };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ── HELPER: normalise CTH ─────────────────────────────────────────────────────
function normCth(raw) {
  return (raw || "").replace(/[\s.]/g, "").replace(/\D/g, "").slice(0, 8);
}

// ── WITS CROSS-CHECK (World Bank public API, no key required) ─────────────────
// Returns BCD for HS6 at heading level — useful to flag Gemini discrepancies.
// URL: https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN/
//       reporter/IND/partner/WLD/product/{HS6}/indicator/AHS-WGHTD-AVRG
async function witsBcd(cth) {
  const hs6 = normCth(cth).slice(0, 6);
  if (!hs6) return null;
  if (_witsCache[hs6]) {
    if (Date.now() - _witsCache[hs6].cachedAt < CACHE_TTL) return _witsCache[hs6].bcd;
  }
  try {
    const url = `https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN/reporter/IND/partner/WLD/product/${hs6}/indicator/AHS-WGHTD-AVRG`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const xml = await r.text();
    // Parse value from SDMX XML: <generic:Value id="OBS_VALUE" value="7.5"/>
    const match = xml.match(/id="OBS_VALUE"\s+value="([^"]+)"/);
    const bcd = match ? parseFloat(match[1]) : null;
    _witsCache[hs6] = { bcd, cachedAt: Date.now() };
    return bcd;
  } catch {
    return null;
  }
}

// ── GOOGLE SHEET OVERRIDES (optional, small list) ─────────────────────────────
// Minimal CSV line parser — handles quoted fields containing commas
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i+1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map(c => c.trim());
}

async function sheetOverride(cth) {
  const url = process.env.GSHEET_DUTY_URL;
  if (!url) return null;
  if (_sheetCache.table && Date.now() - _sheetCache.cachedAt < CACHE_TTL) {
    return _sheetCache.table[normCth(cth)] || null;
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const csv = await r.text();
    const lines = csv.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
    const hdrs = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g,'_'));
    const table = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const row = {}; hdrs.forEach((h, j) => { row[h] = cols[j] || ''; });
      const c = normCth(row.cth);
      // Accept both column naming styles:
      // Style A (gsheets.js initSheet): "bcd", "igst", "add"
      // Style B (our Excel upload):     "bcd_%", "igst_%", "sws_%"
      const getBcd  = row['bcd_%']  !== undefined ? row['bcd_%']  : row['bcd']  || '';
      const getIgst = row['igst_%'] !== undefined ? row['igst_%'] : row['igst'] || '';
      const getSws  = row['sws_%']  !== undefined ? row['sws_%']  : '';
      const getAidc = row['aidc_%'] !== undefined ? row['aidc_%'] : '';
      const getHc   = row['health_cess_%'] !== undefined ? row['health_cess_%'] : '';
      const getCc   = row['comp_cess_%']   !== undefined ? row['comp_cess_%']   : '';
      const getAdd  = row['add_applicable'] !== undefined ? row['add_applicable']
                    : row['add'] || '';
      const getNotif = row['notification_no'] !== undefined ? row['notification_no']
                     : row['notification'] || '';
      const getCond  = row['condition'] !== undefined ? row['condition']
                     : row['notes'] || '';
      if (c.length >= 6) table[c] = {
        bcd:  parseFloat(getBcd)  || 0,
        igst: parseFloat(getIgst) || 0,
        sws:  parseFloat(getSws)  || 0,
        aidc: parseFloat(getAidc) || 0,
        healthCess: parseFloat(getHc) || 0,
        compCess:   parseFloat(getCc) || 0,
        add:  0,   // ADD is a separate notification — not from duty sheet
        desc: row.description || '',
        notif: getNotif,
        effDate: row.effective_date || row.last_updated || '',
        prefBcd: null,
        fta: row.fta || '',
        notes: getCond,
        src: row.source || 'Sheet override',
        conf: (row.source||'').toLowerCase().includes('assessed') ? 'verified' : 'override',
      };
    }
    _sheetCache.table = table; _sheetCache.cachedAt = Date.now();
    return table[normCth(cth)] || null;
  } catch { return null; }
}

// ── GEMINI DUTY LOOKUP ────────────────────────────────────────────────────────
// Ask Gemini for the rate. Full tariff coverage. Cached 1 hour per CTH.
async function geminiDuty(cth, desc, key) {
  const c = normCth(cth);
  if (_geminiCache[c] && Date.now() - _geminiCache[c].cachedAt < CACHE_TTL) {
    return _geminiCache[c].result;
  }

  const prompt = `You are an expert in Indian Customs Tariff. Use the India Customs Tariff Act schedule as updated by Union Budget 2024-25 and all subsequent notifications.

For the following CTH, provide the current import duty rates applicable in India.

CTH: ${c}${desc ? `\nDescription: ${desc}` : ''}

Return ONLY a raw JSON object — no markdown, no backticks, no explanation:
{
  "cth": "${c}",
  "description": "official tariff description for this heading",
  "bcd": <Basic Customs Duty % as a number, e.g. 7.5>,
  "igst": <IGST % as a number, e.g. 18>,
  "add": <Anti-Dumping Duty % if applicable, else 0>,
  "add_note": "ADD details if applicable, else empty string",
  "aidc": <Agriculture Infrastructure & Development Cess % if applicable, else 0>,
  "health_cess": <Health Cess % if applicable (5 for specified medical devices), else 0>,
  "comp_cess": <GST Compensation Cess % if applicable (vehicles/tobacco/aerated drinks), else 0>,
  "sws_note": "SWS applies at 10% of BCD unless BCD is 0",
  "preferential_bcd": <FTA preferential rate % if any, else null>,
  "fta": "FTA name if preferential available, else empty string",
  "key_notifications": "any key exemption or levy notification numbers if known",
  "conditions": "any important conditions, restrictions, end-use requirements",
  "confidence": "high if you are certain of the rates, medium if approximate, low if uncertain",
  "notes": "any other important flag — BIS/QCO, CDSCO, FSSAI, WPC, prohibited, restricted, etc."
}

RULES:
- bcd, igst, add must be numbers (not strings like "7.5%" — just 7.5)
- If ITA bound (IT Agreement), BCD is 0
- IGST follows GST council schedule — most goods 18%, some 12%, some 5%, books 0%
- SWS is always 10% of BCD (0 when BCD is 0) — do not include in bcd figure
- If genuinely unknown or you are not confident, set confidence to "low"`;

  try {
    const MODELS = (process.env.GEMINI_MODEL || "gemini-3.6-flash,gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-pro").split(",").map(s => s.trim());
    let result = null;
    for (const model of MODELS) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 1024 }
          }),
          signal: AbortSignal.timeout(20000),
        }
      );
      if (r.status === 404) continue;
      if (!r.ok) break;
      const d = await r.json();
      const raw = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const clean = raw.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();
      try {
        const parsed = JSON.parse(clean);
        result = {
          bcd:     typeof parsed.bcd === 'number' ? parsed.bcd : parseFloat(parsed.bcd) || 0,
          igst:    typeof parsed.igst === 'number' ? parsed.igst : parseFloat(parsed.igst) || 0,
          add:     typeof parsed.add === 'number' ? parsed.add : parseFloat(parsed.add) || 0,
          addNote: parsed.add_note || "",
          aidc:       parseFloat(parsed.aidc) || 0,
          healthCess: parseFloat(parsed.health_cess) || 0,
          compCess:   parseFloat(parsed.comp_cess) || 0,
          prefBcd: parsed.preferential_bcd != null ? parseFloat(parsed.preferential_bcd) : null,
          fta:     parsed.fta || "",
          desc:    parsed.description || desc || "",
          notif:   parsed.key_notifications || "",
          notes:   [parsed.conditions, parsed.notes].filter(Boolean).join(" · "),
          aiConf:  parsed.confidence || "medium",
          src:     `Gemini AI — India Customs Tariff (Budget 2024-25). Verify before filing.`,
          conf:    "ai-generated",
        };
        break;
      } catch { continue; }
    }
    if (result) _geminiCache[c] = { result, cachedAt: Date.now() };
    return result;
  } catch { return null; }
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // The entire handler body is wrapped in one top-level try/catch. Without
  // this, any unexpected error (e.g. a Gemini/WITS call throwing something
  // other than what Promise.allSettled catches, or a malformed request)
  // escapes as an unhandled exception. Vercel then returns its own HTML/
  // plain-text crash page instead of JSON — which is exactly what breaks
  // res.json() on the frontend with "unexpected character at line 1 column 1".
  try {

  const body = req.method === "POST" ? (req.body || {}) : req.query;
  const rawCth = body.cth || "";
  const desc   = body.desc || "";
  const cth    = normCth(rawCth);
  const now    = new Date().toISOString();

  if (!cth || cth.length < 6) {
    return res.status(400).json({ found: false, error: "Provide at least 6 digits of the CTH." });
  }

  const respond = (rec, extra = {}) => res.status(200).json({
    found: true, cth, ...rec, meta: { as_of: now, ...extra },
  });

  // 1. Verified (assessed BEs) — trust completely
  if (VERIFIED[cth]) return respond(VERIFIED[cth], { source: "Assessed BE (gold standard)", confidence: "verified" });

  // 2. Google Sheet override (if configured)
  const sheetRec = await sheetOverride(cth);
  if (sheetRec) return respond(sheetRec, { source: "Google Sheet override", confidence: sheetRec.conf });

  const key = process.env.GOOGLE_AI_KEY;

  // 3. Gemini AI lookup (full tariff coverage)
  if (key) {
    const [geminiRec, witsBcdVal] = await Promise.allSettled([
      geminiDuty(cth, desc, key),
      witsBcd(cth),
    ]);
    const gr = geminiRec.status === "fulfilled" ? geminiRec.value : null;
    const wb = witsBcdVal.status === "fulfilled" ? witsBcdVal.value : null;

    if (gr) {
      // Cross-check with WITS — flag if significant discrepancy at heading level
      let witsCrossCheck = null;
      if (wb !== null && Math.abs(wb - gr.bcd) > 2) {
        witsCrossCheck = `World Bank WITS shows ${wb}% BCD at HS6 level — verify against current CBIC notification.`;
      }
      return respond({
        ...gr,
        notes: [gr.notes, witsCrossCheck].filter(Boolean).join(" | "),
        wits: wb,
      }, {
        source: "Gemini AI (India Customs Tariff, Budget 2024-25)",
        confidence: "ai-generated",
        witsConfirms: wb !== null && Math.abs(wb - gr.bcd) <= 2,
        aiConfidence: gr.aiConf,
        warning: "AI-generated rates — verify against current CBIC tariff and notifications before filing.",
      });
    }
  }

  // 4. Bundled indicative table (6-digit heading fallback)
  const bundled = BUNDLED[cth] || (() => {
    const six = cth.slice(0, 6);
    const m = Object.keys(BUNDLED).find(k => k.slice(0, 6) === six);
    return m ? { ...BUNDLED[m], desc: BUNDLED[m].desc + " (heading-level match — verify)" } : null;
  })();
  if (bundled) return respond(bundled, { source: "Bundled indicative table", confidence: "indicative" });

  // 5. Chapter default — final safety net.
  // Returns a usable rate rather than 0%, clearly labelled unverified so the
  // CHA knows to check. An honest "chapter typical, verify" beats a silent 0.
  const chap = cth.slice(0, 2);
  if (CHAPTER_DEFAULT[chap]) {
    const [cbcd, cigst] = CHAPTER_DEFAULT[chap];
    const cess = chapterCess(cth);
    return res.status(200).json({
      found: true, cth,
      bcd: cbcd, igst: cigst, add: 0,
      sws: cbcd > 0 ? 10 : 0,
      aidc: cess.aidc, healthCess: cess.healthCess, compCess: cess.compCess,
      desc: `Chapter ${chap} — exact tariff item not on file`,
      notes: [
        `No entry for CTH ${cth}. Showing the typical rate for Chapter ${chap}.`,
        cess.note,
        "MUST be verified against the CBIC tariff before filing.",
      ].filter(Boolean).join(" · "),
      conf: "chapter-default",
      src: `Chapter ${chap} default — NOT a verified tariff item rate`,
      meta: {
        as_of: now,
        source: "Chapter-level default",
        confidence: "chapter-default",
        warning: "Lowest-confidence tier. Verify on IceGate Tariff Finder or the CBIC First Schedule before filing.",
      },
    });
  }

  // 6. Genuinely nothing — invalid chapter
  return res.status(200).json({
    found: false, cth,
    error: `CTH ${cth} does not map to a valid customs chapter (01–98). Check the code and try again.`,
    meta: { as_of: now },
  });

  } catch (err) {
    // Final safety net — guarantees valid JSON no matter what went wrong above
    return res.status(200).json({
      found: false,
      error: `Unexpected server error: ${err.message}. Please try again.`,
    });
  }
};
