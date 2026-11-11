// ── DUTY DATA MODULE — Phase 1 ────────────────────────────────────────────────
// Every entry carries: bcd, igst, sws, src (source), conf (verified | indicative)
// VERIFIED = from client's actual assessed BEs (gold standard)
// INDICATIVE = standard tariff rate, awaiting assessed BE confirmation
// Rule of thumb applied: SWS = 10% of BCD (0 when BCD is 0)

export const DUTY = {
  // ── VERIFIED — from assessed BEs ──
  "84798999": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Assessed BE 2124323", conf: "verified" },
  "85419000": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Assessed BE 2124323 / 9912239", conf: "verified" },
  "84818090": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Assessed BE 2124323", conf: "verified" },
  "39100090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Assessed BE 2121241", conf: "verified" },
  "32065000": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Assessed BE 9912239", conf: "verified" },

  // ── INDICATIVE — awaiting assessed BEs ──
  "56081110": { bcd: "10%",  igst: "12%", sws: "10% of BCD", src: "Indicative — AIFTA preferential may apply", conf: "indicative" },
  "84818081": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84819000": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84798900": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "85044090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "85369000": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 84 — Machinery (common courier imports) ──
  "84713010": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — ITA bound", conf: "indicative" },
  "84714190": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — ITA bound", conf: "indicative" },
  "84717020": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — ITA bound", conf: "indicative" },
  "84733099": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — ITA bound", conf: "indicative" },
  "84139190": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84212300": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84213990": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84314990": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84669390": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84829900": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84821090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84841090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "84879000": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 85 — Electrical / electronics ──
  "85171300": { bcd: "20%",  igst: "18%", sws: "10% of BCD", src: "Indicative — mobile phones", conf: "indicative" },
  "85176290": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — ITA bound", conf: "indicative" },
  "85177010": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — PCBA concessional may apply", conf: "indicative" },
  "85177090": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "85235100": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — ITA bound", conf: "indicative" },
  "85340000": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — bare PCB", conf: "indicative" },
  "85365090": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "85366990": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "85411000": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — diodes ITA", conf: "indicative" },
  "85414900": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — photovoltaic ex-solar", conf: "indicative" },
  "85423900": { bcd: "0%",   igst: "18%", sws: "0%",         src: "Indicative — ICs ITA bound", conf: "indicative" },
  "85049090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "85285900": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative — monitors", conf: "indicative" },
  "85443000": { bcd: "15%",  igst: "18%", sws: "10% of BCD", src: "Indicative — wiring harness", conf: "indicative" },
  "85446090": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 90 — Instruments / optical / medical ──
  "90189099": { bcd: "7.5%", igst: "12%", sws: "10% of BCD", src: "Indicative — medical devices", conf: "indicative" },
  "90211000": { bcd: "7.5%", igst: "5%",  sws: "10% of BCD", src: "Indicative — orthopaedic", conf: "indicative" },
  "90258090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "90268090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "90275090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "90303390": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "90318000": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "90319000": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 39 — Plastics ──
  "39199090": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "39209999": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "39269099": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "39173990": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 40 — Rubber ──
  "40169390": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative — gaskets/seals", conf: "indicative" },
  "40169990": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 73 / 74 / 76 — Metal articles ──
  "73181500": { bcd: "15%",  igst: "18%", sws: "10% of BCD", src: "Indicative — screws/bolts", conf: "indicative" },
  "73182990": { bcd: "15%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "73209090": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative — springs", conf: "indicative" },
  "73269099": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "74122090": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative — brass fittings", conf: "indicative" },
  "76169990": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 29 / 38 — Chemicals ──
  "29419090": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative — antibiotics", conf: "indicative" },
  "38220090": { bcd: "10%",  igst: "12%", sws: "10% of BCD", src: "Indicative — diagnostic reagents", conf: "indicative" },
  "38249900": { bcd: "7.5%", igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 48 / 49 — Paper / printed ──
  "48211090": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative — printed labels", conf: "indicative" },
  "49111090": { bcd: "10%",  igst: "12%", sws: "10% of BCD", src: "Indicative — trade advertising", conf: "indicative" },
  "49019900": { bcd: "0%",   igst: "0%",  sws: "0%",         src: "Indicative — printed books exempt", conf: "indicative" },

  // ── Ch 61 / 62 / 63 — Apparel & textiles ──
  "61091000": { bcd: "20%",  igst: "12%", sws: "10% of BCD", src: "Indicative — cotton t-shirts", conf: "indicative" },
  "62034990": { bcd: "20%",  igst: "12%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },
  "63079090": { bcd: "20%",  igst: "12%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 64 — Footwear ──
  "64039990": { bcd: "35%",  igst: "18%", sws: "10% of BCD", src: "Indicative — leather footwear", conf: "indicative" },
  "64041990": { bcd: "35%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 42 — Leather goods ──
  "42021220": { bcd: "15%",  igst: "18%", sws: "10% of BCD", src: "Indicative — laptop bags", conf: "indicative" },
  "42029900": { bcd: "15%",  igst: "18%", sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 33 — Cosmetics ──
  "33049990": { bcd: "20%",  igst: "18%", sws: "10% of BCD", src: "Indicative — skincare, CDSCO applies", conf: "indicative" },
  "33059090": { bcd: "20%",  igst: "18%", sws: "10% of BCD", src: "Indicative — haircare", conf: "indicative" },

  // ── Ch 95 — Toys / sports ──
  "95030090": { bcd: "70%",  igst: "18%", sws: "10% of BCD", src: "Indicative — toys, BIS CRS mandatory", conf: "indicative" },
  "95069990": { bcd: "20%",  igst: "18%", sws: "10% of BCD", src: "Indicative — sports goods", conf: "indicative" },

  // ── Ch 71 — Imitation jewellery ──
  "71171990": { bcd: "25%",  igst: "3%",  sws: "10% of BCD", src: "Indicative", conf: "indicative" },

  // ── Ch 91 — Watches / clocks ──
  "91021900": { bcd: "20%",  igst: "18%", sws: "10% of BCD", src: "Indicative — wrist watches", conf: "indicative" },
  "91051900": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative — clocks", conf: "indicative" },
  "91149000": { bcd: "10%",  igst: "18%", sws: "10% of BCD", src: "Indicative — watch parts", conf: "indicative" },
};

export function getDuty(cth) {
  const c = (cth || "").replace(/\D/g, "").slice(0, 8);
  if (DUTY[c]) return DUTY[c];
  // Fall back to 6-digit match (heading level) if 8-digit not found
  const six = c.slice(0, 6);
  const headingMatch = Object.keys(DUTY).find(k => k.slice(0, 6) === six);
  if (headingMatch) {
    return { ...DUTY[headingMatch], src: `Heading-level match (${headingMatch}) — verify exact CTH`, conf: "indicative" };
  }
  return { bcd: "—", igst: "—", sws: "—", src: "Not in duty engine — verify manually", conf: "unavailable" };
}


// Numeric accessor with full duty chain — returns numbers, with cess defaults.
// aidc: Agriculture Infrastructure & Development Cess (specific goods)
// healthCess: 5% on specified medical devices (Ch 9018-9022)
// compCess: GST Compensation Cess (vehicles, tobacco, aerated drinks, coal)
const CESS_RULES = [
  { test: (c) => /^90(18|19|20|21|22)/.test(c), healthCess: 5,
    note: "Health Cess 5% — specified medical devices" },
  { test: (c) => /^8703/.test(c), compCess: 20,
    note: "Compensation Cess — motor vehicles (rate varies 1–22% by engine/type, 20% shown)" },
  { test: (c) => /^2402/.test(c), compCess: 290,
    note: "Compensation Cess — tobacco products (rate varies widely)" },
  { test: (c) => /^2202(10|99)/.test(c), compCess: 12,
    note: "Compensation Cess — aerated/caffeinated beverages" },
  { test: (c) => /^2701/.test(c), compCessSpecific: "₹400/tonne",
    note: "Compensation Cess — coal, ₹400 per tonne (specific rate)" },
  { test: (c) => /^7108/.test(c), aidc: 5, note: "AIDC 5% — gold" },
  { test: (c) => /^0808(10)/.test(c), aidc: 35, note: "AIDC — apples (rate per notification)" },
];

export function getDutyNum(cth) {
  const c = (cth || "").replace(/\D/g, "").slice(0, 8);
  const rec = getDuty(c);
  const num = (s) => parseFloat(String(s || "0").replace("%", "")) || 0;
  const out = {
    bcd: num(rec.bcd), igst: num(rec.igst),
    aidc: 0, healthCess: 0, compCess: 0, compCessNote: "",
    add: 0,
    src: rec.src, conf: rec.conf,
    cessNotes: [],
  };
  for (const r of CESS_RULES) {
    if (r.test(c)) {
      if (r.aidc) out.aidc = r.aidc;
      if (r.healthCess) out.healthCess = r.healthCess;
      if (r.compCess) out.compCess = r.compCess;
      if (r.compCessSpecific) out.compCessNote = r.compCessSpecific;
      out.cessNotes.push(r.note);
    }
  }
  // CVD and Safeguard Duty are captured by CBIC scanner's ADD notifications
  // and served via the sheet. Gemini AI lookup also returns them.
  // Defaults to 0 unless scanner has written a value to the sheet.
  out.cvd = 0;
  out.sgd = 0;
  return out;
}
