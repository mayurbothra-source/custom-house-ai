import { useState, useRef, useEffect, useCallback, Component } from "react";
import {
  supabase, isSupabaseConfigured, signIn, signUp, signOut, resetPassword,
  getRemoteProfile, upsertRemoteProfile, ensureProfileExists,
  getIecDirectory, lookupIec, saveIec, deleteIec,
  saveFilingRemote, getRemoteFilings,
  getFirmMembers, removeMember, updateMemberRole,
  getSubscription,
  getChaInvoices, saveChaInvoice, deleteChaInvoice,
  signUpWithType, getUserType, getImporterProfile,
  getAdminSettings, getImporterFilings, saveImporterFiling,
} from "./supabase.js";
import { DUTY, getDuty, getDutyNum } from "./dutyData.js";

// ── MARKDOWN STRIPPER ─────────────────────────────────────────────────────────
// Gemini sometimes returns markdown in reasoning/description fields.
// This strips heading markers, bold, italic, bullets so they display cleanly.
const stripMd = (text) => {
  if (!text) return "";
  return text
    .replace(/^#{1,6}\s+/gm, "")   // ### headings
    .replace(/\*\*(.*?)\*\*/g, "$1") // **bold**
    .replace(/\*(.*?)\*/g, "$1")     // *italic*
    .replace(/`(.*?)`/g, "$1")       // `code`
    .replace(/^[-*•]\s+/gm, "")     // bullet points
    .replace(/\n{3,}/g, "\n\n")      // excess blank lines
    .trim();
};

// ── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  ink: "#141821", muted: "#6B7280", line: "#E7E9EE",
  navy: "#0A1628", amber: "#C8841A", green: "#16A34A",
  red: "#DC2626", blue: "#2563EB", wash: "#F8F9FB", paper: "#FFFFFF",
};

// ── GLOBAL STYLES ─────────────────────────────────────────────────────────────
const G = {
  body: { fontFamily: "'Inter',sans-serif", background: T.paper, color: T.ink,
    minHeight: "100vh", display: "flex", flexDirection: "column", WebkitFontSmoothing: "antialiased" },
  hdr: { display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 20px", borderBottom: `1px solid ${T.line}`, flexShrink: 0 },
  brand: { display: "flex", alignItems: "center", gap: 9 },
  mark: { width: 30, height: 30, borderRadius: 7, background: T.navy, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 600 },
  brandName: { fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 600, color: T.ink },
  chaInfo: { textAlign: "right" },
  chaName: { fontSize: 12, fontWeight: 600, color: T.ink },
  chaLic: { fontSize: 10, color: T.muted, marginTop: 1 },
  prog: { display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "16px 12px 0", gap: 0 },
  stepWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flex: 1 },
  conn: (done) => ({ flex: 1, height: 2, background: done ? T.navy : T.line,
    marginTop: 13, maxWidth: 28 }),
  circle: (s) => ({
    width: 26, height: 26, borderRadius: "50%", display: "flex",
    alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600,
    border: `2px solid ${s === "active" ? T.amber : s === "done" ? T.navy : T.line}`,
    background: s === "active" ? T.amber : s === "done" ? T.navy : T.paper,
    color: s === "active" || s === "done" ? "#fff" : T.muted,
    zIndex: 1,
  }),
  stepLabel: (s) => ({ fontSize: 9, color: s === "active" ? T.amber : s === "done" ? T.navy : T.muted,
    fontWeight: s === "active" ? 600 : 400, textAlign: "center", whiteSpace: "nowrap" }),
  main: { flex: 1, padding: "20px 20px 0", overflowY: "auto" },
  title: { fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 600,
    letterSpacing: "-.01em", marginBottom: 5 },
  sub: { fontSize: 13, color: T.muted, marginBottom: 20, lineHeight: 1.5 },
  foot: { padding: "14px 20px", borderTop: `1px solid ${T.line}`,
    display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: 10 },
  field: { marginBottom: 14 },
  label: { display: "block", fontSize: 10, fontWeight: 600, letterSpacing: ".06em",
    textTransform: "uppercase", color: T.muted, marginBottom: 4 },
  input: { width: "100%", border: `1px solid ${T.line}`, borderRadius: 8,
    padding: "10px 13px", fontSize: 13, fontFamily: "'Inter',sans-serif",
    color: T.ink, outline: "none", background: T.paper, boxSizing: "border-box" },
  card: (accent) => ({ background: T.wash, border: `1px solid ${T.line}`,
    borderLeft: accent ? `3px solid ${accent}` : `1px solid ${T.line}`,
    borderRadius: 10, padding: 14, marginBottom: 12 }),
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  upload: { border: `2px dashed ${T.line}`, borderRadius: 10, padding: 24,
    textAlign: "center", cursor: "pointer", background: T.wash, marginBottom: 16 },
  badge: (c) => ({ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10,
    fontWeight: 600, padding: "3px 8px", borderRadius: 999,
    background: c === "ok" ? "#DCFCE7" : c === "warn" ? "#FEF9C3" : c === "err" ? "#FEE2E2" : "#DBEAFE",
    color: c === "ok" ? T.green : c === "warn" ? "#92400E" : c === "err" ? T.red : T.blue }),
  btn: (v) => ({
    padding: v === "lg" ? "13px 24px" : "10px 20px",
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
    border: "none", fontFamily: "'Inter',sans-serif", transition: "opacity .15s",
  }),
  btnNav: { background: T.navy, color: "#fff" },
  btnBack: { background: T.paper, color: T.muted, border: `1px solid ${T.line}` },
  btnAmber: { background: T.amber, color: "#fff" },
  tick: (on) => ({ width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
    border: `2px solid ${on ? T.green : T.line}`,
    background: on ? T.green : T.paper, color: on ? "#fff" : T.muted,
    flexShrink: 0 }),
  divider: { height: 1, background: T.line, margin: "16px 0" },
};

// ── DATA CONTRACT (rules engine + curated duty data) ─────────────────────────
const RULES = [
  { id: "BIS-CRS", authority: "BIS", tier: "registry", name: "BIS Registration (CRS)", doc: "BIS CRS Registration Certificate",
    why: "Electronics & IT Goods (CRS) Order, 2021", cthRanges: ["8504","8517","8528","8471","8518","8443","8414"] },
  { id: "ADC", authority: "CDSCO", tier: "registry", name: "Drug Controller NOC", doc: "ADC/CDSCO NOC + Form 41",
    why: "Drugs & Cosmetics Act, 1940", cthRanges: ["3003","3004","3002","3006","9018"] },
  { id: "FSSAI", authority: "FSSAI", tier: "registry", name: "FSSAI Clearance", doc: "FSSAI Import Licence + NOC",
    why: "FSS Act, 2006", cthRanges: ["02","03","04","07","08","09","15","16","17","18","19","20","21","22"] },
  { id: "WPC", authority: "WPC (DoT)", tier: "ai", name: "WPC / ETA", doc: "WPC Equipment Type Approval",
    why: "Indian Wireless Telegraphy Act", cthRanges: ["8517","8525","8526","8527"] },
  { id: "PLANT-Q", authority: "Plant Quarantine", tier: "ai", name: "Phytosanitary Certificate", doc: "Phytosanitary Certificate + PQ clearance",
    why: "Plant Quarantine Order, 2003", cthRanges: ["06","07","10","12","13","14"] },
  { id: "EPCG", authority: "DGFT", tier: "registry", name: "EPCG Authorisation", doc: "EPCG Licence + port registration + bond",
    why: "FTP — EPCG Scheme", cthRanges: [], schemeKey: "EPCG" },
  { id: "FTA-COO", authority: "Origin / FTA", tier: "ai", name: "FTA Certificate of Origin", doc: "Preferential CoO (Form AI / CEPA etc.)",
    why: "CAROTAR 2020", cthRanges: [], schemeKey: "FTA" },
];

// DUTY and getDuty now imported from ./dutyData.js (Phase 1 — 80 CTH entries)

function getRequiredDocs(cths, scheme) {
  const norm = (c) => (c || "").replace(/\D/g, "").slice(0, 8);
  const fired = [];
  for (const r of RULES) {
    if (r.schemeKey) { if (scheme === r.schemeKey) fired.push(r); continue; }
    if (cths.some(c => norm(c).startsWith(r.cthRanges.find(rng => norm(c).startsWith(rng)) || "~~"))) fired.push(r);
  }
  return fired;
}

// ── PERSISTENCE (localStorage) ───────────────────────────────────────────────
const DB = {
  save(iec, filing) {
    try {
      const all = DB.all();
      all[filing.id] = { ...filing, iec, savedAt: new Date().toISOString() };
      localStorage.setItem("cha_filings", JSON.stringify(all));
    } catch {}
  },
  all() {
    try { return JSON.parse(localStorage.getItem("cha_filings") || "{}"); } catch { return {}; }
  },
  byIec(iec) {
    return Object.values(DB.all()).filter(f => f.iec === iec)
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  },
  load(id) { return DB.all()[id] || null; },
};

// ── SHARED UI COMPONENTS ─────────────────────────────────────────────────────
// CHA firm profile — configurable, stored locally. No hardcoded firm identity.
const DEFAULT_PROFILE = { firmName: "", licence: "", gstin: "", pan: "", adCode: "", address: "", port: "" };
function loadProfile() {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem("chaProfile") || "{}") }; }
  catch { return { ...DEFAULT_PROFILE }; }
}
function saveProfile(p) { try { localStorage.setItem("chaProfile", JSON.stringify(p)); } catch {} }
const STEPS = ["IEC", "New / Recent", "BL / AWB", "Invoices", "Classify", "Documents", "Checklist"];

// Shared current-user reference, set by AppInner on auth state change.
// Avoids threading `user` through all 17 Header call sites.
let _currentUser = null;
function setCurrentUserRef(u) { _currentUser = u; }

function Header({ onSettings }) {
  const p = loadProfile();
  return (
    <div style={G.hdr}>
      <div style={G.brand}>
        <div style={G.mark}>C</div>
        <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 9, color: T.green, opacity: 0.8 }}>● Draft saved</div>
        <div style={{ ...G.chaInfo, cursor: onSettings ? "pointer" : "default" }}
          onClick={() => onSettings && onSettings()}>
          {p.firmName
            ? <><div style={G.chaName}>{p.firmName}</div><div style={G.chaLic}>{p.licence || ""}</div></>
            : <div style={{ ...G.chaName, color: T.amber }}>⚙ Set up firm</div>}
        </div>
        {isSupabaseConfigured() && _currentUser && (
          <button onClick={() => signOut().then(() => window.location.reload())}
            style={{ fontSize: 10, color: T.muted, background: "none", border: `1px solid ${T.line}`,
              borderRadius: 6, padding: "3px 8px", cursor: "pointer", flexShrink: 0 }}>
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

function Progress({ step, onNavigate }) {
  return (
    <div style={G.prog}>
      {STEPS.map((s, i) => {
        const n = i + 1;
        const st = n < step ? "done" : n === step ? "active" : "pending";
        const canTap = onNavigate && n < step; // only completed steps are tappable
        return (
          <div key={s} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
            <div style={{ ...G.stepWrap, cursor: canTap ? "pointer" : "default" }}
              onClick={() => canTap && onNavigate(n)}>
              <div style={G.circle(st)}>{n < step ? "✓" : n}</div>
              <div style={G.stepLabel(st)}>{s}</div>
            </div>
            {i < STEPS.length - 1 && <div style={G.conn(n < step)} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={G.field}>
      <label style={G.label}>{label}</label>
      <input style={G.input} type={type} value={value || ""} placeholder={placeholder || ""}
        onChange={e => onChange && onChange(e.target.value)} />
    </div>
  );
}



// SbField: module-level controlled input for SB screens (prevents cursor-jump bug)
function SbField({ label, value, onChange, placeholder }) {
  return (
    <div style={G.field}>
      <label style={G.label}>{label}</label>
      <input style={G.input} value={value || ""} placeholder={placeholder || ""}
        onChange={e => onChange(e.target.value)} />
    </div>
  );
}function Foot({ onBack, onNext, nextLabel = "Save & Continue", nextStyle = G.btnNav, disabled }) {
  return (
    <div style={G.foot}>
      <button style={{ ...G.btn(), ...G.btnBack }} onClick={onBack}>← Back</button>
      <button style={{ ...G.btn(), ...nextStyle, opacity: disabled ? 0.5 : 1 }}
        onClick={!disabled ? onNext : undefined}>{nextLabel}</button>
    </div>
  );
}

// Build /api/extract request body from either a single file or a photo-page bundle
// Reads a fetch Response as JSON safely. If the server returned something
// that isn't valid JSON — an HTML crash page, a platform timeout page — this
// returns a clean, actionable error instead of letting JSON.parse throw a
// raw "unexpected character at line 1 column 1" message at the user.
async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const looksLikeTimeout = response.status === 504 || /timed?\s*out/i.test(text);
    const looksLikeHtml = text.trim().startsWith("<");
    return {
      error: looksLikeTimeout
        ? "The request took too long and timed out. Please try again."
        : looksLikeHtml
        ? `Server returned an unexpected response (HTTP ${response.status}). This usually happens if the request took too long — please try again.`
        : `Server returned an unreadable response (HTTP ${response.status}). Please try again.`,
    };
  }
}

function extractBody(p, extra = {}) {
  return JSON.stringify(p.pages
    ? { pages: p.pages, ...extra }
    : { fileBase64: p.base64, mimeType: p.mime, ...extra });
}

// ── PHOTO COMPRESSION ────────────────────────────────────────────────────────
// Phone photos are 4-8MB; Vercel body limit is ~4.5MB. Downscale to max 1600px
// and JPEG-encode before upload. Non-image files pass through untouched.
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      // Not an image (e.g. PDF) — read as-is
      const r = new FileReader();
      r.onload = () => resolve({ base64: r.result.split(",")[1], mime: file.type || "application/pdf", name: file.name });
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1600;
      let { width: w, height: h } = img;
      if (w > MAX || h > MAX) {
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale); h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve({ base64: dataUrl.split(",")[1], mime: "image/jpeg", name: file.name || "photo.jpg" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

// ── UPLOAD ZONE — file picker + camera + multi-page photo mode ──────────────
// multiPage: when true, photos accumulate as pages of ONE document; the user
// taps "Done" to send all pages together for extraction ({ pages: [...] }).
function UploadZone({ label, sub, onFile, onPages, loading, multiPage = false }) {
  const fileRef = useRef();
  const camRef = useRef();
  const [sizeError, setSizeError] = useState("");
  const [pendingPages, setPendingPages] = useState([]);

  const inferMime = (f) => {
    if (f.type) return f.type;
    const ext = (f.name || "").split(".").pop().toLowerCase();
    const map = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
      png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic" };
    return map[ext] || "application/pdf";
  };

  // File-picker path (PDFs and gallery files) — single doc, size-guarded
  const handleFile = (files) => {
    if (!files?.length) return;
    const f = files[0];
    setSizeError("");
    if (f.type.startsWith("image/")) {
      // images get compressed, so no size guard needed
      compressPhoto(f).then(({ base64, mime, name }) =>
        onFile({ base64, mime, name })
      ).catch(e => setSizeError(`Could not read image: ${e.message}`));
      return;
    }
    if (f.size > 3 * 1024 * 1024) {
      setSizeError(`File is ${(f.size / 1024 / 1024).toFixed(1)} MB — too large to process. Please use a file under 3 MB (compress the PDF or photograph the pages instead).`);
      return;
    }
    const r = new FileReader();
    r.onload = () => onFile({ base64: r.result.split(",")[1], mime: inferMime(f), name: f.name });
    r.readAsDataURL(f);
  };

  // Camera path — compressed photo; accumulates in multiPage mode
  const handlePhoto = async (files) => {
    if (!files?.length) return;
    setSizeError("");
    try {
      const page = await compressPhoto(files[0]);
      if (multiPage) {
        setPendingPages(p => [...p, page]);
      } else {
        onFile(page);
      }
    } catch (e) {
      setSizeError(`Could not read photo: ${e.message}`);
    }
  };

  const sendPages = () => {
    if (!pendingPages.length) return;
    if (onPages) onPages({ pages: pendingPages, name: `photos (${pendingPages.length} pages)` });
    else onFile({ ...pendingPages[0], name: `photo` });
    setPendingPages([]);
  };

  return (
    <div>
      <div style={{ ...G.upload, cursor: "default" }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files); }}>
        <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }}
          onChange={e => { handleFile(e.target.files); e.target.value = ""; }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={e => { handlePhoto(e.target.files); e.target.value = ""; }} />
        <div style={{ fontSize: 26, marginBottom: 6 }}>{loading ? "◌" : "📎"}</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
          {loading ? "Reading document…" : label}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>{sub}</div>
        {!loading && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding: "9px 16px", background: T.navy, color: "#fff", border: "none",
                borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              📁 Upload file
            </button>
            <button onClick={() => camRef.current?.click()}
              style={{ padding: "9px 16px", background: "#fff", color: T.navy,
                border: `1.5px solid ${T.navy}`, borderRadius: 8, fontSize: 12,
                fontWeight: 600, cursor: "pointer" }}>
              📷 Take photo
            </button>
          </div>
        )}
      </div>

      {/* Multi-page photo tray */}
      {multiPage && pendingPages.length > 0 && (
        <div style={{ background: T.wash, border: `1px solid ${T.line}`, borderRadius: 10,
          padding: 12, marginBottom: 12, marginTop: -8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            📷 {pendingPages.length} page{pendingPages.length > 1 ? "s" : ""} captured
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {pendingPages.map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={`data:${p.mime};base64,${p.base64}`} alt={`page ${i + 1}`}
                  style={{ width: 52, height: 68, objectFit: "cover", borderRadius: 6,
                    border: `1px solid ${T.line}` }} />
                <div onClick={() => setPendingPages(pp => pp.filter((_, j) => j !== i))}
                  style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18,
                    borderRadius: "50%", background: T.red, color: "#fff", fontSize: 11,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer" }}>×</div>
                <div style={{ fontSize: 9, textAlign: "center", color: T.muted, marginTop: 2 }}>p{i + 1}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => camRef.current?.click()}
              style={{ flex: 1, padding: "9px 0", background: "#fff", color: T.navy,
                border: `1.5px solid ${T.navy}`, borderRadius: 8, fontSize: 12,
                fontWeight: 600, cursor: "pointer" }}>
              + Next page
            </button>
            <button onClick={sendPages}
              style={{ flex: 1, padding: "9px 0", background: T.amber, color: "#fff",
                border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: "pointer" }}>
              ✓ Done — read {pendingPages.length} page{pendingPages.length > 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {sizeError && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 8, fontSize: 12, color: T.red, marginBottom: 12, marginTop: -8 }}>
          {sizeError}
        </div>
      )}
    </div>
  );
}

// ── EXCHANGE RATE HOOK — Phase 3 ─────────────────────────────────────────────
// Fetches the CBIC-notified rate from /api/exchange. Falls back to 95.30 if
// the adapter is unreachable. Returns { rate, meta } where meta carries the
// notification reference and confidence for honest display.
function useExchangeRate(currency = "USD", direction = "import") {
  const [state, setState] = useState({
    rate: 95.30,
    meta: { source: "Placeholder — adapter not reached", confidence: "unavailable" },
  });
  useEffect(() => {
    let alive = true;
    fetch("/api/exchange", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency, direction }),
    })
      .then(r => r.json())
      .then(d => {
        if (alive && d.rate) setState({ rate: d.rate, meta: d.meta || {} });
      })
      .catch(() => { /* keep fallback */ });
    return () => { alive = false; };
  }, [currency, direction]);
  return state;
}

// ── PREVIOUS FILING REFERENCE PANEL — shared by BE S5 and SB S5 ──────────────
function ReferencePanel({ docLabel, refDoc, refItems, refError, refLoading, onUpload, onClear }) {
  return (
    <div style={{ ...G.card(T.blue), marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
        textTransform: "uppercase", color: T.muted, marginBottom: 2 }}>
        Previous {docLabel} — AI Reference
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
        Upload a previously assessed {docLabel} or checklist for this importer.
        The AI will prefer those customs-accepted classifications when they match.
      </div>
      {refDoc ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 10px", background: "#F0FDF4", border: "1px solid #BBF7D0",
          borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>
              📎 {refDoc.name}{refDoc.beNumber ? ` — ${refDoc.beNumber}` : ""}
            </div>
            <div style={{ fontSize: 10, color: T.green }}>
              ✓ {refItems.length} classified item(s) loaded as reference
            </div>
          </div>
          <button onClick={onClear}
            style={{ fontSize: 11, color: T.red, background: "none", border: "none",
              cursor: "pointer" }}>Clear</button>
        </div>
      ) : (
        <UploadZone
          label={refLoading ? "Reading document…" : `Upload previous ${docLabel}`}
          sub="Assessed BE / SB / checklist · PDF, image, or photo"
          onFile={onUpload} onPages={onUpload} multiPage loading={refLoading} />
      )}
      {refError && (
        <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 8, fontSize: 11, color: T.red, marginTop: 8 }}>{refError}</div>
      )}
      {refItems.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: T.muted }}>
          {refItems.slice(0, 4).map((r, i) => (
            <div key={i} style={{ padding: "2px 0" }}>
              • {(r.description || "").slice(0, 45)}{r.description?.length > 45 ? "…" : ""} → <b style={{ fontFamily: "monospace" }}>{r.cth}</b>
            </div>
          ))}
          {refItems.length > 4 && <div>… and {refItems.length - 4} more</div>}
        </div>
      )}
    </div>
  );
}

// ── HOMEPAGE ─────────────────────────────────────────────────────────────────
function HomePage({ onSelect, onDirectory, onLogin, onSignUp, user }) {
  return (
    <div style={{ ...G.body, minHeight: "100vh" }}>
      <div style={G.hdr}>
        <div style={G.brand}>
          <div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div>
        </div>
        {/* Top-right: Login + Sign Up for unauthenticated visitors */}
        {!user && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={onLogin}
              style={{ fontSize: 12, fontWeight: 600, padding: "8px 16px",
                border: `1px solid ${T.line}`, borderRadius: 8, background: T.paper,
                color: T.navy, cursor: "pointer" }}>
              Log in
            </button>
            <button onClick={onSignUp}
              style={{ ...G.btn(), ...G.btnNav, fontSize: 12, padding: "8px 16px" }}>
              Sign up
            </button>
          </div>
        )}
        {/* Authenticated user — shouldn't normally see this page but show firm name */}
        {user && (
          <div style={{ ...G.chaInfo, cursor: "pointer" }}
            onClick={() => onSelect("SETTINGS")}>
            {loadProfile().firmName
              ? <><div style={G.chaName}>{loadProfile().firmName}</div>
                  <div style={G.chaLic}>{loadProfile().licence || ""}</div></>
              : <div style={{ ...G.chaName, color: T.amber }}>⚙ Set up firm</div>}
          </div>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "32px 20px 48px", textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".16em",
          textTransform: "uppercase", color: T.muted, marginBottom: 16 }}>New Filing</div>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 32, fontWeight: 500,
          letterSpacing: "-.02em", marginBottom: 10 }}>What are you filing today?</h1>
        <p style={{ fontSize: 14, color: T.muted, maxWidth: 360, lineHeight: 1.55, marginBottom: 36 }}>
          Choose a filing to begin. The system reads your documents, classifies each item,
          and prepares a defensible checklist.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 400 }}>
          {[
            { key: "SB", tag: "Export", title: "File Shipping Bill",
              desc: "For goods leaving India. Captures RODTEP and Drawback benefits.", color: T.amber },
            { key: "BE", tag: "Import", title: "File Bill of Entry",
              desc: "For goods entering India. Classifies items and computes duty.", color: T.navy },
          ].map(c => (
            <div key={c.key} onClick={() => onSelect(c.key)} style={{ background: T.paper,
              border: `1px solid ${T.line}`, borderRadius: 14, padding: "20px 20px 16px",
              textAlign: "left", cursor: "pointer" }}>
              <div style={{ display: "inline-block", fontSize: 10, fontWeight: 700,
                letterSpacing: ".1em", textTransform: "uppercase", padding: "3px 10px",
                borderRadius: 999, marginBottom: 12,
                background: c.color === T.amber ? "rgba(200,132,26,.1)" : "rgba(10,22,40,.07)",
                color: c.color }}>{c.tag}</div>
              {isSupabaseConfigured() && !_currentUser && (
                <div style={{ display: "inline-block", fontSize: 9, fontWeight: 700,
                  letterSpacing: ".06em", textTransform: "uppercase", padding: "2px 8px",
                  borderRadius: 999, marginLeft: 6, marginBottom: 12,
                  background: "#FEF9C3", color: "#92400E" }}>🔒 Account required</div>
              )}
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600,
                marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>{c.desc}</div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12,
                borderTop: `1px solid ${T.line}`, fontSize: 13, fontWeight: 600, color: c.color }}>
                <span>Start {c.key === "SB" ? "Shipping Bill" : "Bill of Entry"}</span>
                <span>→</span>
              </div>
            </div>
          ))}
          {/* Client Directory */}
          <div onClick={() => onDirectory ? onDirectory() : onSelect("DIRECTORY")} style={{ background: "#EFF6FF",
            border: "1px solid #BFDBFE", borderRadius: 14, padding: "20px 20px 16px",
            textAlign: "left", cursor: "pointer" }}>
            <div style={{ display: "inline-block", fontSize: 10, fontWeight: 700,
              letterSpacing: ".1em", textTransform: "uppercase", padding: "3px 10px",
              borderRadius: 999, marginBottom: 12, background: "rgba(37,99,235,.1)", color: T.blue }}>
              My Clients
            </div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600, marginBottom: 6 }}>
              📋 Client Directory
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Save your importers and exporters. Screen 1 finds them instantly — no manual typing.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12,
              borderTop: "1px solid #BFDBFE", fontSize: 13, fontWeight: 600, color: T.blue }}>
              <span>Manage clients</span><span>→</span>
            </div>
          </div>
          {/* Duty Calculator */}
          <div onClick={() => onSelect("DUTY")} style={{ background: "#F0FDF4",
            border: "1px solid #BBF7D0", borderRadius: 14, padding: "20px 20px 16px",
            textAlign: "left", cursor: "pointer" }}>
            <div style={{ display: "inline-block", fontSize: 10, fontWeight: 700,
              letterSpacing: ".1em", textTransform: "uppercase", padding: "3px 10px",
              borderRadius: 999, marginBottom: 12, background: "rgba(22,163,74,.1)", color: T.green }}>
              Free — No account needed
            </div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600, marginBottom: 6 }}>
              🧮 Duty Calculator
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
              Look up full duty chain (BCD + SWS + IGST) for any item by CTH or description.
              Live rates from your team's daily Google Sheet.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12,
              borderTop: "1px solid #BBF7D0", fontSize: 13, fontWeight: 600, color: T.green }}>
              <span>Calculate duty</span><span>→</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "16px 20px", borderTop: `1px solid ${T.line}`,
        fontSize: 11, color: T.muted }}>
        Powered by Custom House AI · CBIC · IceGate · DGFT
      </div>
    </div>
  );
}

// ── SCREEN 1 — IEC ────────────────────────────────────────────────────────────
function S1_IEC({ filing, update, onNext, onBack, onNavigate }) {
  const [iec, setIec] = useState(filing.iec || "");
  const [result, setResult] = useState(filing.iecResult || null);
  const [checking, setChecking] = useState(false);
  const [proceeded, setProceeded] = useState(filing.iecProceeded || false);
  const [manual, setManual] = useState(filing.iecManual || { name: "", gstin: "", adCode: "" });
  const [showManual, setShowManual] = useState(false);
  const [epcgImport, setEpcgImport] = useState(filing.epcgImport || false);

  const check = async () => {
    if (!iec.trim()) return;
    setChecking(true);
    try {
      // Check the CHA's own saved client directory first — instant, no network call
      if (isSupabaseConfigured() && _currentUser) {
        const dirEntry = await lookupIec(iec.trim());
        if (dirEntry) {
          setResult({
            name: dirEntry.name, gstin: dirEntry.gstin || "", adCode: dirEntry.ad_code || "",
            status: "Active", rodtep: "Unknown",
            epcg: { active: dirEntry.epcg_active, licNo: dirEntry.epcg_lic },
            anomalies: [{ level: "ok", text: "From your saved client directory." }],
            _meta: { source: "Your client directory", confidence: "curated" },
          });
          setChecking(false);
          return;
        }
      }
      const r = await fetch("/api/iec", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iec: iec.trim() }),
      });
      const d = await safeJson(r);
      if (d.found && d.record) {
        const rec = d.record;
        const anomalies = [];
        (rec.flags || []).forEach(f => anomalies.push({
          level: "warn", text: f.detail || f.type,
        }));
        if (anomalies.length === 0) {
          anomalies.push({ level: "ok", text: "IEC active. No flags on record." });
        }
        setResult({
          name: rec.name, gstin: rec.gstin, adCode: rec.adCode,
          status: rec.status, rodtep: rec.rodtepRegistered ? "Registered" : "Not registered",
          epcg: rec.epcg, anomalies,
          _meta: d.meta,  // source + confidence for honest display
        });
      } else {
        setResult({
          name: null,
          notFound: true,
          error: d.error || "IEC not found.",
          _meta: d.meta,
          anomalies: [],
        });
      }
    } catch (e) {
      setResult({
        name: null, notFound: true,
        error: `Could not reach the IEC service: ${e.message}`,
        anomalies: [],
      });
    }
    setChecking(false);
  };

  const proceed = () => {
    setProceeded(true);
    update({ iec, iecResult: result, iecProceeded: true });
    // Sync client name to job record
    const uid = _currentUser?.id;
    if (uid && filing.id && result?.name) {
      const all = Jobs.all(uid);
      const idx = all.findIndex(j => j.id === filing.id);
      if (idx >= 0) {
        all[idx] = { ...all[idx], iec, clientName: result.name, updatedAt: new Date().toISOString() };
        Jobs.save(uid, all);
      }
    }
  };

  const hasAnomaly = result?.anomalies?.some(a => a.level === "warn");

  return (
    <div style={G.body}>
      <Header />
      <Progress step={1} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Enter IEC</div>
        <div style={G.sub}>The system will check IEC status, GST filing history and risk profile.</div>
        <div style={{ ...G.field, display: "flex", gap: 8 }}>
          <input style={{ ...G.input, flex: 1 }} value={iec}
            onChange={e => setIec(e.target.value)} placeholder="10-digit IEC" />
          <button style={{ ...G.btn(), ...G.btnNav, whiteSpace: "nowrap" }}
            onClick={check}>{checking ? "◌" : "Check IEC"}</button>
        </div>

        {result && result.notFound && (
          <div style={{ ...G.card(T.amber) }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>IEC not found in registry</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 4 }}>
              Live DGFT lookup isn't connected yet. You can enter the importer's details
              manually below and proceed — the entry is recorded against this filing.
            </div>
            {result._meta && (
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 12,
                padding: "5px 8px", background: T.wash, borderRadius: 6 }}>
                Source: {result._meta.source}
              </div>
            )}
            {!showManual ? (
              <button style={{ ...G.btn(), ...G.btnNav, width: "100%", padding: "10px 0" }}
                onClick={() => setShowManual(true)}>
                Enter importer details manually &rarr;
              </button>
            ) : (
              <div style={{ background: "#fff", border: `1px solid ${T.line}`,
                borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
                  textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
                  Manual importer entry
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={G.label}>Importer / Consignee name *</label>
                  <input style={G.input} value={manual.name}
                    onChange={e => setManual(m => ({ ...m, name: e.target.value }))}
                    placeholder="Legal name as on IEC" />
                </div>
                <div style={G.row2}>
                  <div>
                    <label style={G.label}>GSTIN</label>
                    <input style={G.input} value={manual.gstin}
                      onChange={e => setManual(m => ({ ...m, gstin: e.target.value.toUpperCase() }))}
                      placeholder="Optional" />
                  </div>
                  <div>
                    <label style={G.label}>AD Code</label>
                    <input style={G.input} value={manual.adCode}
                      onChange={e => setManual(m => ({ ...m, adCode: e.target.value }))}
                      placeholder="Optional" />
                  </div>
                </div>
                <button style={{ ...G.btn(), ...G.btnAmber, width: "100%",
                  padding: "10px 0", marginTop: 12,
                  opacity: manual.name.trim() ? 1 : 0.5 }}
                  disabled={!manual.name.trim()}
                  onClick={() => {
                    const rec = {
                      name: manual.name.trim(), gstin: manual.gstin.trim(),
                      adCode: manual.adCode.trim(), status: "Manual entry",
                      rodtep: "Unknown",
                      anomalies: [{ level: "warn", text: "Details entered manually by CHA \u2014 not verified against DGFT." }],
                      _meta: { source: "Manual CHA entry", confidence: "manual" },
                      _manual: true,
                    };
                    setResult(rec);
                    setProceeded(true);
                    update({ iec, iecResult: rec, iecProceeded: true, iecManual: manual });
                    const remember = window.confirm(
                      `Save "${manual.name.trim()}" to your client directory? Next time this IEC will be found instantly.`
                    );
                    if (remember) {
                      if (isSupabaseConfigured() && _currentUser) {
                        saveIec(_currentUser.id, {
                          iec: iec.trim(), name: manual.name.trim(),
                          gstin: manual.gstin.trim(), adCode: manual.adCode.trim(),
                        }).catch(() => {});
                      } else {
                        try {
                          const list = JSON.parse(localStorage.getItem("iecDirectory") || "[]");
                          list.push({ iec: iec.trim().toUpperCase(), name: manual.name.trim(),
                            gstin: manual.gstin.trim(), ad_code: manual.adCode.trim() });
                          localStorage.setItem("iecDirectory", JSON.stringify(list));
                        } catch {}
                      }
                    }
                    onNext();
                  }}>
                  Confirm &amp; Continue &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {result && !result.notFound && (
          <div style={{ ...G.card(hasAnomaly ? T.amber : T.green) }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={G.badge(hasAnomaly ? "warn" : "ok")}>
                {hasAnomaly ? "⚠ Anomalies Found" : "✓ Clear"}
              </span>
              {result._meta && (
                <span style={G.badge(result._meta.confidence === "verified" ? "ok" : "info")}>
                  {result._meta.confidence === "verified" ? "Live DGFT" : "Curated data"}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{result.name}</div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
              GSTIN: {result.gstin} · AD Code: {result.adCode}
            </div>
            {result.anomalies.map((a, i) => (
              <div key={i} style={{ fontSize: 12, display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ color: a.level === "ok" ? T.green : T.amber, flexShrink: 0 }}>
                  {a.level === "ok" ? "✓" : "⚠"}
                </span>
                <span>{a.text}</span>
              </div>
            ))}
            {result._meta && result._meta.confidence !== "verified" && (
              <div style={{ fontSize: 10, color: T.muted, marginTop: 4,
                padding: "5px 8px", background: T.wash, borderRadius: 6 }}>
                ⓘ {result._meta.source} — live DGFT lookup will replace this when connected.
              </div>
            )}
            {hasAnomaly && !proceeded && (
              <div style={{ background: "#fff", border: `1px solid #FDE68A`, borderRadius: 8, padding: 12, marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>CHA Decision</div>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
                  Anomalies noted. Do you wish to proceed?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...G.btn(), ...G.btnAmber, flex: 1, padding: "9px 0" }}
                    onClick={proceed}>Proceed — I Accept Risk</button>
                  <button style={{ ...G.btn(), ...G.btnBack, flex: 1, padding: "9px 0" }}
                    onClick={() => setResult(null)}>Hold Filing</button>
                </div>
              </div>
            )}
            {proceeded && (
              <div style={{ fontSize: 11, color: T.blue, marginTop: 8,
                background: "#DBEAFE", padding: "6px 10px", borderRadius: 6 }}>
                ✓ CHA chose to proceed — recorded.
              </div>
            )}
          </div>
        )}
      </div>
      {result && !result.notFound && result.epcg?.active && (
        <div style={{ margin: "8px 16px", padding: "10px 14px", background: "#F0FDF4",
          border: "1px solid #BBF7D0", borderRadius: 8, fontSize: 12 }}>
          <div style={{ fontWeight: 600, color: T.green, marginBottom: 4 }}>EPCG Authorisation on this IEC</div>
          <div style={{ color: T.muted, fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>
            Licence {result.epcg?.licNo || "—"}. Imports against EPCG attract Nil BCD
            (Notification 16/2015-Customs). Enable if this consignment is an EPCG import.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={epcgImport}
              onChange={e => { setEpcgImport(e.target.checked); update({ epcgImport: e.target.checked }); }}
              style={{ width: 16, height: 16 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>This is an EPCG import — apply Nil BCD</span>
          </label>
        </div>
      )}
      <Foot onBack={onBack} onNext={() => { update({ iec, iecResult: result, iecProceeded: proceeded, epcgImport }); onNext(); }}
        disabled={!result || (result.notFound && !result._manual) || (hasAnomaly && !proceeded)} />
    </div>
  );
}

// ── SCREEN 2 — NEW BE / RECENT FILINGS ───────────────────────────────────────
function S2_NewOrRecent({ filing, onNewBE, onLoadFiling, onBack, onNavigate }) {
  const recent = DB.byIec(filing.iec).slice(0, 5);
  const statusBadge = (s) => s === "complete" ? "ok" : s === "draft" ? "warn" : "info";
  const statusLabel = (s) => s === "complete" ? "Complete" : s === "draft" ? "Draft" : "In Progress";

  return (
    <div style={G.body}>
      <Header />
      <Progress step={2} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>What would you like to do?</div>
        <div style={G.sub}>IEC: {filing.iec} · {filing.iecResult?.name}</div>
        <button style={{ ...G.btn("lg"), ...G.btnNav, width: "100%", marginBottom: 20,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}
          onClick={onNewBE}>
          <span>File New Bill of Entry</span><span>→</span>
        </button>
        <div style={G.divider} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
          Recent Filings for this IEC
        </div>
        {recent.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, padding: "16px 0" }}>
            No previous filings found for this IEC.
          </div>
        ) : (
          <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
            {recent.map((f, i) => (
              <div key={f.id} onClick={() => onLoadFiling(f)}
                style={{ padding: "12px 14px", borderBottom: i < recent.length - 1 ? `1px solid ${T.line}` : "none",
                  display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {f.blData?.blAwbNumber || "BL pending"}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                    {f.blData?.consignorName || "—"} · {f.invoices?.length || 0} invoice(s) ·{" "}
                    {new Date(f.savedAt).toLocaleDateString("en-IN")}
                  </div>
                </div>
                <span style={G.badge(statusBadge(f.status))}>{statusLabel(f.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <Foot onBack={onBack} onNext={onNewBE} nextLabel="New BE →" />
    </div>
  );
}

// ── SCREEN 3 — BL / AWB ──────────────────────────────────────────────────────
function S3_BL({ filing, update, onNext, onBack, onNavigate }) {
  const [bl, setBl] = useState(filing.blData || {});
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setBl(p => ({ ...p, [k]: v }));

  const [uploadError, setUploadError] = useState("");

  const onUpload = async (payload) => {
    setLoading(true);
    setUploadError("");
    try {
      const r = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: extractBody(payload),
      });
      const d = await safeJson(r);

      if (d.error) {
        setUploadError(`Could not read document: ${d.error}. Please enter details manually below.`);
      } else if (d.data) {
        const x = d.data;
        // Fill any field that came back non-empty — preserve existing manual entries otherwise
        setBl(prev => ({
          _aiExtracted: true,
          blAwbNumber:      x.blAwbNumber      || prev.blAwbNumber      || "",
          blAwbDate:        x.blAwbDate        || prev.blAwbDate        || "",
          consignorName:    x.consignorName    || prev.consignorName    || "",
          consignorAddress: x.consignorAddress || prev.consignorAddress || "",
          consigneeName:    x.consigneeName    || prev.consigneeName    || "",
          consigneeAddress: x.consigneeAddress || prev.consigneeAddress || "",
          portOfLoading:    x.portOfLoading    || prev.portOfLoading    || "",
          portOfDischarge:  x.portOfDischarge  || prev.portOfDischarge  || "",
          vessel:           x.vessel           || prev.vessel           || "",
          countryOfOrigin:  x.countryOfOrigin  || prev.countryOfOrigin  || "",
          numberOfPackages: x.numberOfPackages || prev.numberOfPackages || "",
          grossWeight:      x.grossWeight      || prev.grossWeight      || "",
          marksAndNumbers:  x.marksAndNumbers  || prev.marksAndNumbers  || "",
        }));
      } else {
        setUploadError("Document was read but no data could be extracted. Please enter details manually below.");
      }
    } catch (e) {
      setUploadError(`Upload failed: ${e.message}. Please enter details manually below.`);
    }
    setLoading(false);
  };

  return (
    <div style={G.body}>
      <Header />
      <Progress step={3} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Bill of Lading / Airway Bill</div>
        <div style={G.sub}>Upload the document or enter details manually.</div>
        {bl._aiExtracted && (
          <div style={{ padding: "9px 12px", background: "#DBEAFE",
            border: "1px solid #93C5FD", borderRadius: 8, fontSize: 12,
            color: T.blue, marginBottom: 12, display: "flex", gap: 8 }}>
            <span>ⓘ</span>
            <span>Fields filled by AI — please verify each one before continuing.</span>
          </div>
        )}
        <UploadZone label="Upload BL or AWB" sub="PDF, image, or photograph the pages"
          onFile={onUpload} onPages={onUpload} multiPage loading={loading} />
        {uploadError && (
          <div style={{ padding: "10px 14px", background: "#FEF2F2", border: `1px solid #FECACA`,
            borderRadius: 8, fontSize: 12, color: T.red, marginBottom: 12 }}>
            {uploadError}
          </div>
        )}
        <div style={{ textAlign: "center", fontSize: 12, color: T.muted, marginBottom: 16 }}>or enter manually</div>
        <div style={G.row2}>
          <Field label="BL / AWB Number" value={bl.blAwbNumber} onChange={v => set("blAwbNumber", v)} />
          <Field label="Date" value={bl.blAwbDate} onChange={v => set("blAwbDate", v)} />
        </div>
              <div style={G.row2}>
                <Field label="House AWB / HBL No." value={bl.houseAwbNumber}
                  onChange={v => set("houseAwbNumber", v)} placeholder="If different from master" />
                <Field label="IGM No. / Date" value={bl.igmNo}
                  onChange={v => set("igmNo", v)} placeholder="e.g. 2261xxx / 15-07-2026" />
              </div>
        <Field label="Consignor (Shipper) Name" value={bl.consignorName} onChange={v => set("consignorName", v)} />
        <Field label="Consignor Address" value={bl.consignorAddress} onChange={v => set("consignorAddress", v)} />
        <Field label="Consignee (Importer) Name" value={bl.consigneeName} onChange={v => set("consigneeName", v)} />
        <Field label="Consignee Address" value={bl.consigneeAddress} onChange={v => set("consigneeAddress", v)} />
        <div style={G.row2}>
          <Field label="Port of Loading" value={bl.portOfLoading} onChange={v => set("portOfLoading", v)} />
          <Field label="Port of Discharge" value={bl.portOfDischarge} onChange={v => set("portOfDischarge", v)} />
        </div>
        <div style={G.row2}>
          <Field label="Country of Origin" value={bl.countryOfOrigin} onChange={v => set("countryOfOrigin", v)} />
          <Field label="Vessel / Carrier" value={bl.vessel} onChange={v => set("vessel", v)} />
        </div>
        <div style={G.row2}>
          <Field label="No. of Packages" value={bl.numberOfPackages} onChange={v => set("numberOfPackages", v)} />
          <Field label="Gross Weight (KGS)" value={bl.grossWeight} onChange={v => set("grossWeight", v)} />
        </div>
        <Field label="Marks & Numbers" value={bl.marksAndNumbers} onChange={v => set("marksAndNumbers", v)} />
      </div>
      <Foot onBack={onBack} onNext={() => {
        update({ blData: bl });
        // Sync BL/AWB number to job record
        if (bl.blAwbNumber && filing.id) {
          const uid = _currentUser?.id;
          if (uid) {
            const all = Jobs.all(uid);
            const idx = all.findIndex(j => j.id === filing.id);
            if (idx >= 0) {
              all[idx] = { ...all[idx], blAwbNumber: bl.blAwbNumber,
                clientName: all[idx].clientName || filing.iecResult?.name || filing.iec || "",
                updatedAt: new Date().toISOString() };
              Jobs.save(uid, all);
            }
          }
        }
        onNext();
      }}
        disabled={!bl.blAwbNumber} />
    </div>
  );
}

// ── SCREEN 4 — INVOICE EXTRACTION ────────────────────────────────────────────
function S4_Invoices({ filing, update, onNext, onBack, onNavigate }) {
  const [invoices, setInvoices] = useState(filing.invoices || []);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const startCountdown = (seconds, thenFn) => {
    setCountdown(seconds);
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(iv); setCountdown(0); if (thenFn) thenFn(); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const doExtract = async (payload, isRetry = false) => {
    const name = payload.name;
    setLoading(true);
    setUploadError("");
    try {
      const r = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: extractBody(payload),
      });
      const d = await safeJson(r);

      if (d.error) {
        if (d.error.includes("rate limit") || d.error.includes("429")) {
          setLoading(false);
          if (!isRetry) {
            setUploadError("Rate limit reached — retrying automatically in 60 seconds. Please wait.");
            startCountdown(60, () => doExtract(payload, true));
          } else {
            setUploadError("Still rate-limited. Please wait 1–2 minutes then tap Upload again.");
          }
          return;
        }
        setUploadError(d.error);
        setLoading(false);
        return;
      }

      if (!d.data) {
        setUploadError("Invoice was uploaded but could not be read. Try a clearer scan or PDF.");
        setLoading(false);
        return;
      }

      const x = d.data;

      if (x.invoices && x.invoices.length > 0) {
        const newInvs = x.invoices.map(inv => ({ _aiExtracted: true,
          invoiceNumber:  inv.invoiceNumber  || "",
          invoiceDate:    inv.invoiceDate    || "",
          shipperName:    inv.shipperName    || inv.consignorName || "",
          shipperAddress: inv.shipperAddress || inv.consignorAddress || "",
          currency:       inv.currency       || "",
          incoterm:       inv.incoterm       || "",
          invoiceValue:   inv.invoiceValue   || "",
          _file: name,
          lineItems: (inv.lineItems || []).map((li, i) => ({
            srNo: li.srNo || String(i + 1), description: li.description || "",
            quantity: li.quantity || "", unit: li.unit || "",
            unitPrice: li.unitPrice || "", amount: li.amount || "", hsCode: li.hsCode || "",
          })),
        }));
        setInvoices(p => [...p, ...newInvs]);
        setLoading(false);
        return;
      }

      if (x.lineItems && x.lineItems.length > 0) {
        const inv = {
          invoiceNumber: x.invoiceNumber || name, invoiceDate: x.invoiceDate || x.blAwbDate || "",
          shipperName: x.consignorName || x.shipperName || "",
          shipperAddress: x.consignorAddress || x.shipperAddress || "",
          currency: x.currency || "", incoterm: x.incoterm || "",
          invoiceValue: x.invoiceValue || x.totalInvoiceValue || "",
          _file: name,
          _aiExtracted: true,
          lineItems: x.lineItems.map((li, i) => ({
            srNo: li.srNo || String(i + 1), description: li.description || "",
            quantity: li.quantity || "", unit: li.unit || "",
            unitPrice: li.unitPrice || "", amount: li.amount || "", hsCode: li.hsCode || "",
          })),
        };
        setInvoices(p => [...p, inv]);
        setLoading(false);
        return;
      }

      setUploadError(
        `Document read as "${x.documentType || "unknown"}" — no invoice line items found. ` +
        `Please upload a commercial invoice, or add items manually below.`
      );
    } catch (e) {
      setUploadError(`Upload failed: ${e.message}. Please try again.`);
    }
    setLoading(false);
  };

  const onUpload = (payload) => doExtract(payload);

  const updateField = (ii, key, val) =>
    setInvoices(p => p.map((inv, i) => i === ii ? { ...inv, [key]: val } : inv));
  const updateItem = (ii, ki, key, val) =>
    setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
      ...inv, lineItems: inv.lineItems.map((li, k) => k !== ki ? li : { ...li, [key]: val })
    }));
  const removeInvoice = (ii) => setInvoices(p => p.filter((_, i) => i !== ii));

  const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
  const th = { padding: "7px 8px", fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
    textTransform: "uppercase", color: T.muted, borderBottom: `1px solid ${T.line}`,
    background: T.wash, textAlign: "left" };
  const td = { padding: "8px", borderBottom: `1px solid ${T.line}`, verticalAlign: "top" };
  const tdinput = { width: "100%", border: "none", outline: "none", fontSize: 12,
    fontFamily: "'Inter',sans-serif", background: "transparent", color: T.ink };

  return (
    <div style={G.body}>
      <Header />
      <Progress step={4} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Invoice Extraction</div>
        <div style={G.sub}>Upload invoices. System extracts all fields. Review and edit before proceeding.</div>
        {invoices.some(inv => inv._aiExtracted) && (
          <div style={{ padding: "9px 12px", background: "#DBEAFE",
            border: "1px solid #93C5FD", borderRadius: 8, fontSize: 12,
            color: T.blue, marginBottom: 4, display: "flex", gap: 8 }}>
            <span>ⓘ</span>
            <span>AI extracted — verify all descriptions and values before proceeding.</span>
          </div>
        )}
        <UploadZone label="Upload Invoice(s)" sub="Multiple invoices allowed · PDF, image, or photo"
          onFile={onUpload} onPages={onUpload} multiPage loading={loading || countdown > 0} />

        {(uploadError || countdown > 0) && (
          <div style={{ padding: "10px 14px",
            background: countdown > 0 ? "#DBEAFE" : "#FEF2F2",
            border: `1px solid ${countdown > 0 ? "#93C5FD" : "#FECACA"}`,
            borderRadius: 8, fontSize: 12,
            color: countdown > 0 ? T.blue : T.red, marginBottom: 12 }}>
            {countdown > 0
              ? `⏳ Rate limit reached — retrying automatically in ${countdown}s. Please wait.`
              : uploadError}
          </div>
        )}
        <button onClick={() => setInvoices(p => [...p, {
          invoiceNumber: "", invoiceDate: "", shipperName: "", shipperAddress: "",
          currency: "USD", incoterm: "", invoiceValue: "", _file: "manual",
          lineItems: [{ srNo: "1", description: "", quantity: "", unit: "", unitPrice: "", amount: "", hsCode: "" }]
        }])} style={{ width: "100%", padding: "10px 0", marginBottom: 16, background: T.paper,
          border: `1px dashed ${T.line}`, borderRadius: 8, fontSize: 13, fontWeight: 600,
          color: T.muted, cursor: "pointer" }}>
          + Add Invoice Manually
        </button>

        {invoices.map((inv, ii) => (
          <div key={ii} style={{ ...G.card(T.navy), padding: 0, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "10px 14px", background: T.wash,
              borderBottom: `1px solid ${T.line}`, display: "flex",
              justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                Invoice {ii + 1} of {invoices.length}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={G.badge("ok")}>Extracted</span>
                <button onClick={() => removeInvoice(ii)}
                  style={{ fontSize: 11, color: T.red, background: "none", border: "none", cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div style={G.row2}>
                <Field label="Invoice No." value={inv.invoiceNumber}
                  onChange={v => updateField(ii, "invoiceNumber", v)} />
                <Field label="Invoice Date" value={inv.invoiceDate}
                  onChange={v => updateField(ii, "invoiceDate", v)} />
              </div>
              <Field label="Shipper Name" value={inv.shipperName}
                onChange={v => updateField(ii, "shipperName", v)} />
              <Field label="Shipper Address" value={inv.shipperAddress}
                onChange={v => updateField(ii, "shipperAddress", v)} />
              <div style={G.row2}>
                <Field label="Currency" value={inv.currency}
                  onChange={v => updateField(ii, "currency", v)} />
                <Field label="Incoterm" value={inv.incoterm}
                  onChange={v => updateField(ii, "incoterm", v)} />
              </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <Field label="Freight" value={inv.freight}
                    onChange={v => updateField(ii, "freight", v)} placeholder="If not in value" />
                  <Field label="Insurance" value={inv.insurance}
                    onChange={v => updateField(ii, "insurance", v)} placeholder="Blank = 1.125%" />
                  <Field label="Misc charges" value={inv.miscCharges}
                    onChange={v => updateField(ii, "miscCharges", v)} placeholder="Optional" />
                </div>
                {(inv.incoterm || "").toUpperCase().match(/FOB|EXW|FCA/) && !(inv.freight) && (
                  <div style={{ fontSize: 10, color: "#92400E", background: "#FEF9C3",
                    padding: "6px 10px", borderRadius: 6, marginBottom: 8 }}>
                    ⚠ {inv.incoterm.toUpperCase()} terms — freight &amp; insurance must be added to
                    assessable value. Enter freight; insurance defaults to 1.125% if blank.
                  </div>
                )}
              <Field label="Invoice Value" value={inv.invoiceValue}
                onChange={v => updateField(ii, "invoiceValue", v)} />
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>
                Line Items
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={tbl}>
                  <thead>
                    <tr>
                      {["#", "Description", "Qty", "Unit", "Rate", "Amount"].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(inv.lineItems || []).map((li, ki) => (
                      <tr key={ki}>
                        <td style={td}>{li.srNo || ki + 1}</td>
                        <td style={{ ...td, minWidth: 160 }}>
                          <input style={tdinput} value={li.description || ""}
                            onChange={e => updateItem(ii, ki, "description", e.target.value)} />
                        </td>
                        <td style={td}>
                          <input style={{ ...tdinput, width: 50 }} value={li.quantity || ""}
                            onChange={e => updateItem(ii, ki, "quantity", e.target.value)} />
                        </td>
                        <td style={td}>
                          <input style={{ ...tdinput, width: 40 }} value={li.unit || ""}
                            onChange={e => updateItem(ii, ki, "unit", e.target.value)} />
                        </td>
                        <td style={td}>
                          <input style={{ ...tdinput, width: 60 }} value={li.unitPrice || ""}
                            onChange={e => updateItem(ii, ki, "unitPrice", e.target.value)} />
                        </td>
                        <td style={td}>
                          <input style={{ ...tdinput, width: 60 }} value={li.amount || ""}
                            onChange={e => updateItem(ii, ki, "amount", e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Add item row */}
            <div style={{ padding: "8px 14px 14px" }}>
              <button onClick={() => setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
                ...inv, lineItems: [...(inv.lineItems || []),
                  { srNo: String((inv.lineItems || []).length + 1), description: "",
                    quantity: "", unit: "", unitPrice: "", amount: "", hsCode: "" }]
              }))} style={{ fontSize: 12, fontWeight: 600, color: T.amber, background: "none",
                border: "none", cursor: "pointer", padding: 0 }}>
                + Add Item Row
              </button>
            </div>
          </div>
        ))}
      </div>
      <Foot onBack={onBack}
        onNext={() => { update({ invoices }); onNext(); }}
        disabled={invoices.length === 0} />
    </div>
  );
}

// ── SCREEN 5 — CLASSIFICATION ─────────────────────────────────────────────────
function S5_Classify({ filing, update, onNext, onBack, onNavigate }) {
  const [invoices, setInvoices] = useState(() =>
    (filing.invoices || []).map(inv => ({
      ...inv,
      lineItems: (inv.lineItems || []).map(li => ({
        ...li,
        proposedCth: li.proposedCth || (li.hsCode || "").replace(/\D/g, "").slice(0, 8) || "",
        cthDesc: li.cthDesc || "",
        accepted: li.accepted || false,
        editing: false,
        editVal: li.proposedCth || (li.hsCode || "").replace(/\D/g, "").slice(0, 8) || "",
      }))
    }))
  );
  const [classifying, setClassifying] = useState(false);
  const [classifyError, setClassifyError] = useState("");
  // ── Previous BE reference ──
  const [refItems, setRefItems] = useState(filing.referenceItems || []);
  const [refDoc, setRefDoc] = useState(filing.referenceDoc || null);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState("");

  const uploadReference = async (payload) => {
    const name = payload.name;
    setRefLoading(true); setRefError("");
    try {
      const r = await fetch("/api/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: extractBody(payload, { mode: "reference" }),
      });
      const d = await safeJson(r);
      if (d.error) { setRefError(d.error); setRefLoading(false); return; }
      const items = d.data?.referenceItems || [];
      if (!items.length) {
        setRefError("No classified items found in this document. Is it an assessed BE or checklist?");
        setRefLoading(false); return;
      }
      setRefItems(prev => [...prev, ...items]);
      setRefDoc({ name, beNumber: d.data?.beNumber || "", count: items.length });
      update({ referenceItems: [...refItems, ...items],
        referenceDoc: { name, beNumber: d.data?.beNumber || "", count: items.length } });
    } catch (e) { setRefError(`Upload failed: ${e.message}`); }
    setRefLoading(false);
  };
  const [done, setDone] = useState(filing.classified || false);
  const [classifyCountdown, setClassifyCountdown] = useState(0);

  const startClassifyCountdown = (seconds, thenFn) => {
    setClassifyCountdown(seconds);
    const iv = setInterval(() => {
      setClassifyCountdown(c => {
        if (c <= 1) { clearInterval(iv); setClassifyCountdown(0); if (thenFn) thenFn(); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  // Auto-run classification on first arrival — delayed 5s to avoid rate-limit clash with extraction
  // Auto-classify: give CHA 15s to upload a reference first
  const [autoTimer, setAutoTimer] = useState(15);
  const [autoCancelled, setAutoCancelled] = useState(false);
  const hasItems = invoices.some(inv => inv.lineItems?.some(li => li.description?.trim()));
  useEffect(() => {
    if (done || classifying || autoCancelled || !hasItems) return;
    if (autoTimer <= 0) { runClassify(); return; }
    const t = setTimeout(() => setAutoTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [autoTimer, done, classifying, autoCancelled, hasItems]);

  const [batchProgress, setBatchProgress] = useState(null); // { done, total }

  const runClassify = async (skipAccepted = false) => {
    setClassifying(true);
    setClassifyError("");
    const allItems = invoices.flatMap((inv, ii) =>
      inv.lineItems.map((li, ki) => ({
        description: li.description, hsCode: li.hsCode,
        invIdx: ii, itemIdx: ki,
        skip: skipAccepted && li.accepted,
      }))
    );
    const toClassify = allItems.filter(it => !it.skip && (it.description || "").trim());
    if (!toClassify.length) { setClassifying(false); setDone(true); return; }

    // ── Batch into chunks of 5 items ──────────────────────────────────────
    // A dropped connection or transient failure only loses one small batch,
    // not the entire classification run. Each chunk also completes faster,
    // keeping well inside Vercel's 45s function limit even for large invoices.
    const CHUNK_SIZE = 5;
    const chunks = [];
    for (let i = 0; i < toClassify.length; i += CHUNK_SIZE) {
      chunks.push(toClassify.slice(i, i + CHUNK_SIZE));
    }
    setBatchProgress({ done: 0, total: chunks.length });

    const allResults = new Array(toClassify.length).fill(null);
    let anyRateLimited = false;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkOffset = ci * CHUNK_SIZE;
      let chunkSucceeded = false;
      for (let attempt = 0; attempt < 2 && !chunkSucceeded; attempt++) {
        try {
          const r = await fetch("/api/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: chunk.map(c => ({ description: c.description, hsCode: c.hsCode })),
              referenceItems: (filing.referenceItems || []),
            }),
          });
          const d = await safeJson(r);
          if (d.error) {
            if ((d.error.includes("429") || d.error.includes("rate"))) {
              anyRateLimited = true;
              if (attempt === 0) { await new Promise(res => setTimeout(res, 4000)); continue; }
            }
            break; // non-rate error on this chunk — leave these items unclassified, move on
          }
          if (d.classifications?.length) {
            d.classifications.forEach((c, idx) => { allResults[chunkOffset + idx] = c; });
            chunkSucceeded = true;
          }
        } catch (e) {
          // Network error on this chunk only — retry once, then move on to next chunk
          if (attempt === 0) { await new Promise(res => setTimeout(res, 2000)); continue; }
        }
      }
      setBatchProgress({ done: ci + 1, total: chunks.length });
    }

    // Apply whatever results came back — partial success beats total failure.
    setInvoices(p => {
      const next = p.map(inv => ({ ...inv, lineItems: inv.lineItems.map(li => ({ ...li })) }));
      toClassify.forEach((item, i) => {
        const c = allResults[i];
        if (!c || !c.proposedCth) return;
        const li = next[item.invIdx]?.lineItems[item.itemIdx];
        if (li) {
          li.proposedCth = c.proposedCth || li.editVal || "";
          li.cthDesc = stripMd(c.headingDescription || "");
          li.reasoning = stripMd(c.reasoning || "");
          li.confidence = c.confidence || "";
          li.editVal = c.proposedCth || li.editVal || "";
        }
      });
      return next;
    });

    const unclassifiedCount = allResults.filter(r => !r || !r.proposedCth).length;
    if (unclassifiedCount === toClassify.length) {
      // Total failure — fall back to declared HS codes so the CHA isn't blocked
      setClassifyError(anyRateLimited
        ? "Gemini rate limit reached. Declared HS codes used as fallback — verify manually or tap Re-classify."
        : "Classification failed for all items. Declared HS codes used as fallback — verify manually or tap Re-classify.");
      setInvoices(p => p.map(inv => ({
        ...inv,
        lineItems: inv.lineItems.map(li => ({
          ...li,
          proposedCth: li.editVal || (li.hsCode || "").replace(/\D/g, "").slice(0, 8) || "",
          cthDesc: li.editVal ? "From declared HS code" : "Enter CTH manually",
        }))
      })));
    } else if (unclassifiedCount > 0) {
      setClassifyError(`${unclassifiedCount} of ${toClassify.length} items could not be classified — enter CTH manually for those, or tap Re-classify.`);
    }

    setBatchProgress(null);
    setClassifying(false);
    setDone(true);
  };

  const toggle = (ii, ki) => setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.map((li, k) => k !== ki ? li : { ...li, accepted: !li.accepted })
  }));
  const setEditVal = (ii, ki, v) => setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.map((li, k) => k !== ki ? li : { ...li, editVal: v, proposedCth: v })
  }));
  const setDesc = (ii, ki, v) => setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.map((li, k) => k !== ki ? li : { ...li, description: v, accepted: false })
  }));
  const acceptEdit = (ii, ki) => setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.map((li, k) => k !== ki ? li : {
      ...li, proposedCth: li.editVal, accepted: true, cthDesc: "CHA confirmed"
    })
  }));
  const addItem = (ii) => setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: [...inv.lineItems, {
      srNo: String(inv.lineItems.length + 1), description: "", quantity: "1", unit: "NOS",
      unitPrice: "", amount: "", hsCode: "", proposedCth: "", editVal: "", accepted: false, cthDesc: ""
    }]
  }));
  const removeItem = (ii, ki) => setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.filter((_, k) => k !== ki)
  }));
  const classifyOne = async (ii, ki) => {
    const li = invoices[ii]?.lineItems[ki];
    if (!li?.description?.trim()) return;
    setInvoices(p => p.map((inv, i) => i !== ii ? inv : ({
      ...inv, lineItems: inv.lineItems.map((l, k) => k !== ki ? l : { ...l, classifyingOne: true })
    })));
    try {
      const r = await fetch("/api/classify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ description: li.description, hsCode: li.hsCode }], referenceItems: (filing.referenceItems || []) }),
      });
      const d = await safeJson(r);
      const c = d.classifications?.[0];
      setInvoices(p => p.map((inv, i) => i !== ii ? inv : ({
        ...inv, lineItems: inv.lineItems.map((l, k) => k !== ki ? l : {
          ...l, classifyingOne: false,
          proposedCth: c?.proposedCth || l.proposedCth || "",
          editVal: c?.proposedCth || l.editVal || "",
          cthDesc: stripMd(c?.headingDescription || "No result — enter CTH manually"),
          reasoning: stripMd(c?.reasoning || ""),
          confidence: c?.confidence || "",
        })
      })));
    } catch {
      setInvoices(p => p.map((inv, i) => i !== ii ? inv : ({
        ...inv, lineItems: inv.lineItems.map((l, k) => k !== ki ? l : { ...l, classifyingOne: false })
      })));
    }
  };

  const allAccepted = invoices.every(inv => inv.lineItems.every(li => li.accepted));

  const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
  const th = { padding: "7px 8px", fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
    textTransform: "uppercase", color: T.muted, borderBottom: `1px solid ${T.line}`,
    background: T.wash, textAlign: "left" };
  const td = { padding: "8px", borderBottom: `1px solid ${T.line}`, verticalAlign: "top" };

  return (
    <div style={G.body}>
      <Header />
      <Progress step={5} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Classification</div>
        <div style={G.sub}>System proposes HSN / CTH per item. Edit any, then tick to accept each one.</div>

        <ReferencePanel docLabel="BE" refDoc={refDoc} refItems={refItems}
          refError={refError} refLoading={refLoading}
          onUpload={uploadReference}
          onClear={() => { setRefItems([]); setRefDoc(null); update({ referenceItems: [], referenceDoc: null }); }} />

        {!done && !classifying && !autoCancelled && autoTimer > 0 && hasItems && (
          <div style={{ padding: "10px 14px", background: "#F0FDF4",
            border: "1px solid #BBF7D0", borderRadius: 8, fontSize: 12,
            color: "#166534", marginBottom: 12, display: "flex",
            justifyContent: "space-between", alignItems: "center" }}>
            <span>◌ Auto-classifying in {autoTimer}s — upload a reference BE first if you have one</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ fontSize: 11, fontWeight: 600, background: T.green,
                color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                onClick={() => { setAutoTimer(0); }}>Classify now</button>
              <button style={{ fontSize: 11, color: T.muted, background: "none",
                border: `1px solid ${T.line}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
                onClick={() => setAutoCancelled(true)}>Cancel</button>
            </div>
          </div>
        )}

        {(classifying || classifyCountdown > 0) && (
          <div style={{ padding: "12px 14px",
            background: classifyCountdown > 0 ? "#DBEAFE" : "#DBEAFE",
            border: `1px solid #93C5FD`,
            borderRadius: 8, fontSize: 13, color: T.blue, marginBottom: 12,
            display: "flex", gap: 8 }}>
            <span>◌</span>
            {classifyCountdown > 0
              ? `Rate limit reached — retrying classification in ${classifyCountdown}s…`
              : batchProgress
                ? `Classifying batch ${batchProgress.done} of ${batchProgress.total}…`
                : "Classifying all items — please wait…"}
          </div>
        )}

        {classifyError && (
          <div style={{ padding: "10px 14px", background: "#FEF9C3", border: `1px solid #FDE68A`,
            borderRadius: 8, fontSize: 12, color: "#92400E", marginBottom: 12 }}>
            {classifyError}
          </div>
        )}

        {done && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button style={{ ...G.btn(), ...G.btnBack, fontSize: 12, padding: "7px 14px" }}
                onClick={() => {
                  // Re-classify only items not yet accepted
                  runClassify(true);
                }}>↺ Re-classify unaccepted</button>
              <button style={{ ...G.btn(), background: T.green, color: "#fff",
                fontSize: 12, padding: "7px 14px" }}
                onClick={() => setInvoices(p => p.map(inv => ({
                  ...inv, lineItems: inv.lineItems.map(li =>
                    li.proposedCth ? { ...li, accepted: true } : li
                  )
                })))}>
                ✓ Accept all with CTH
              </button>
            </div>
            <div style={{ fontSize: 11, color: T.muted }}>
              Edit any CTH, then tick ✓ — or tap Accept all.
            </div>
          </div>
        )}

        {invoices.length === 0 && (
          <div style={{ ...G.card(), textAlign: "center", padding: "24px 16px" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No items found</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
              No invoices were uploaded, or extraction found no line items.
              Go back to add invoices, or add items manually below.
            </div>
          </div>
        )}

        {invoices.map((inv, ii) => (
          <div key={ii} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>
              Invoice {inv.invoiceNumber || ii + 1}
              {inv.shipperName ? ` · ${inv.shipperName}` : ""}
            </div>

            {inv.lineItems.map((li, ki) => (
              <div key={ki} style={{
                background: li.accepted ? "#F0FDF4" : T.paper,
                border: `1px solid ${li.accepted ? "#BBF7D0" : T.line}`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 10
              }}>
                {/* Row 1: Item number + remove */}
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.muted,
                    textTransform: "uppercase", letterSpacing: ".06em" }}>
                    Item {ki + 1}
                  </div>
                  <button onClick={() => removeItem(ii, ki)}
                    style={{ fontSize: 11, color: T.red, background: "none",
                      border: "none", cursor: "pointer" }}>Remove</button>
                </div>

                {/* Row 2: Description — EDITABLE */}
                <div style={{ marginBottom: 8 }}>
                  <label style={G.label}>Description (edit if extraction was wrong)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={li.description || ""}
                      onChange={e => setDesc(ii, ki, e.target.value)}
                      placeholder="Type item description to classify…"
                      style={{ ...G.input, flex: 1, fontSize: 12 }}
                    />
                    <button
                      onClick={() => classifyOne(ii, ki)}
                      disabled={!li.description?.trim() || li.classifyingOne}
                      style={{ ...G.btn(), background: T.navy, color: "#fff",
                        fontSize: 11, padding: "7px 11px", whiteSpace: "nowrap",
                        opacity: (!li.description?.trim() || li.classifyingOne) ? 0.5 : 1 }}>
                      {li.classifyingOne ? "…" : "Classify →"}
                    </button>
                  </div>
                </div>

                {/* Row 3: CTH input + accept tick */}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <label style={G.label}>CTH (8 digits)</label>
                    <input
                      value={li.editVal || li.proposedCth || ""}
                      onChange={e => setEditVal(ii, ki, e.target.value)}
                      placeholder="00000000"
                      style={{ ...G.input, fontFamily: "monospace", fontWeight: 700,
                        fontSize: 15, letterSpacing: 2,
                        borderColor: li.accepted ? "#BBF7D0" : T.line,
                        background: li.accepted ? "#F0FDF4" : T.paper }}
                    />
                    {li.cthDesc && (
                      <div style={{ fontSize: 10, color: li.accepted ? T.green : T.muted, marginTop: 3 }}>
                        {li.cthDesc}
                        {li.confidence && ` · ${li.confidence} confidence`}
                      </div>
                    )}
                    {/* Live duty display — Phase 1 */}
                    {(li.editVal || li.proposedCth || "").replace(/\D/g, "").length === 8 && (() => {
                      const d = getDuty(li.editVal || li.proposedCth);
                      const isVerified = d.conf === "verified";
                      const isUnavailable = d.conf === "unavailable";
                      return (
                        <div style={{ marginTop: 6, padding: "6px 9px", borderRadius: 7,
                          background: isUnavailable ? "#FEF9C3" : isVerified ? "#F0FDF4" : "#F8F9FB",
                          border: `1px solid ${isUnavailable ? "#FDE68A" : isVerified ? "#BBF7D0" : T.line}` }}>
                          {isUnavailable ? (
                            <div style={{ fontSize: 10, color: "#92400E" }}>
                              Duty not in engine — verify BCD/IGST manually before filing
                            </div>
                          ) : (
                            <>
                              <div style={{ display: "flex", gap: 10, fontSize: 11, fontWeight: 600 }}>
                                <span>BCD {d.bcd}</span>
                                <span>IGST {d.igst}</span>
                                <span style={{ color: T.muted, fontWeight: 400 }}>SWS {d.sws}</span>
                              </div>
                              <div style={{ fontSize: 9, marginTop: 2,
                                color: isVerified ? T.green : "#92400E" }}>
                                {isVerified ? "✓ " : "est.* "}{d.src}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                    {li.reasoning && !li.accepted && (
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 2,
                        fontStyle: "italic", lineHeight: 1.4 }}>{li.reasoning}</div>
                    )}
                  </div>
                  {/* Qty display */}
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <label style={G.label}>Qty</label>
                    <div style={{ fontSize: 12, fontWeight: 600, padding: "8px 0" }}>
                      {li.quantity} {li.unit}
                    </div>
                  </div>
                  {/* Accept tick */}
                  <div style={{ flexShrink: 0, paddingTop: 18 }}>
                    <div style={G.tick(li.accepted)}
                      onClick={() => li.accepted ? toggle(ii, ki) : acceptEdit(ii, ki)}>
                      ✓
                    </div>
                  </div>
                </div>
                {/* Duty waiver panel */}
                <DutyWaiverPanel
                  waiver={li.waiver}
                  onChange={w => setInvoices(p => p.map((inv2, ii2) => ii2 !== ii ? inv2 : {
                    ...inv2, lineItems: inv2.lineItems.map((li2, ki2) => ki2 !== ki ? li2 : { ...li2, waiver: w })
                  }))} />
              </div>
            ))}

            {/* Add item button */}
            <button onClick={() => addItem(ii)}
              style={{ width: "100%", padding: "9px 0", background: T.paper,
                border: `1px dashed ${T.line}`, borderRadius: 8, fontSize: 12,
                fontWeight: 600, color: T.amber, cursor: "pointer", marginTop: 4 }}>
              + Add item manually
            </button>
          </div>
        ))}

        {done && !allAccepted && (
          <div style={{ padding: "10px 14px", background: "#FFF7E6", border: `1px solid #FDE68A`,
            borderRadius: 8, fontSize: 12, color: "#92400E", marginBottom: 12 }}>
            Please tick ✓ to accept each item before proceeding.
            You can edit the CTH in the input field first, then tick to confirm.
          </div>
        )}
      </div>
      {!allAccepted && invoices.some(inv => inv.lineItems.some(li => li.proposedCth)) && (
        <div style={{ margin: "0 16px 4px", padding: "8px 12px", background: "#FEF9C3",
          border: "1px solid #FDE68A", borderRadius: 8, fontSize: 11, color: "#92400E" }}>
          ⚠ Some items not yet accepted. Tap ✓ on each item, or use Accept all.
          You can still proceed — unaccepted items will have no CTH on the checklist.
        </div>
      )}
      <Foot onBack={onBack}
        onNext={() => { update({ invoices, classified: true }); onNext(); }}
        disabled={invoices.every(inv => inv.lineItems.every(li => !li.proposedCth))} />
    </div>
  );
}

// ── SCREEN 6 — SUPPORTING DOCUMENTS ──────────────────────────────────────────
// Hoisted outside S6_Docs so React never remounts it on parent re-render
function MultiFileRow({ label, sub, files, onAdd, onRemove }) {
  const fileRef = useRef();
  const camRef = useRef();
  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (f) { onAdd({ fileName: f.name, uploaded: true }); e.target.value = ""; }
  };
  return (
    <div style={{ marginBottom: 4 }}>
      <input ref={fileRef} type="file" accept=".pdf,image/*"
        style={{ display: "none" }} onChange={handleFile} />
      <input ref={camRef} type="file" accept="image/*" capture="environment"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0];
          if (f) compressPhoto(f).then(p => onAdd({ fileName: p.name || "photo.jpg", uploaded: true })).catch(() => {});
          e.target.value = ""; }} />
      {files.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 10px", background: T.wash, border: `1px solid ${T.line}`,
              borderRadius: 7, marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14 }}>📎</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: T.ink }}>{f.fileName}</div>
                  <div style={{ fontSize: 10, color: T.green }}>Uploaded</div>
                </div>
              </div>
              <button onClick={() => onRemove(i)}
                style={{ fontSize: 11, color: T.red, background: "none", border: "none",
                  cursor: "pointer" }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => fileRef.current?.click()}
          style={{ flex: 1, padding: "10px 0", background: T.paper,
            border: `1.5px dashed ${T.line}`, borderRadius: 8, fontSize: 12, fontWeight: 600,
            color: T.amber, cursor: "pointer" }}>
          + {files.length > 0 ? `Add another ${label}` : `Upload ${label}`}
        </button>
        <button onClick={() => camRef.current?.click()}
          style={{ padding: "10px 14px", background: T.paper,
            border: `1.5px dashed ${T.line}`, borderRadius: 8, fontSize: 12, fontWeight: 600,
            color: T.navy, cursor: "pointer", whiteSpace: "nowrap" }}>
          📷 Photo
        </button>
      </div>
      {sub && <div style={{ fontSize: 10, color: T.muted, marginTop: 4, textAlign: "center" }}>{sub}</div>}
    </div>
  );
}

function S6_Docs({ filing, update, onNext, onBack, onNavigate }) {
  const invoices = filing.invoices || [];
  const cths = invoices.flatMap(inv =>
    (inv.lineItems || []).map(li => li.proposedCth).filter(Boolean)
  );
  const requiredDocs = getRequiredDocs(cths, filing.scheme);

  // ── state ──
  const [docs, setDocs] = useState(filing.docs || {});
  // commInvoices: array of { fileName, uploaded } — one per uploaded commercial invoice file
  const [commInvoices, setCommInvoices] = useState(filing.commInvoices || []);
  // tds: { "inv0_item0": { fileName, uploaded }, ... } — keyed by invoice+item index
  const [tdsFiles, setTdsFiles] = useState(filing.tdsFiles || {});
  // techWriteups: array of { fileName, uploaded }
  const [techWriteups, setTechWriteups] = useState(filing.techWriteups || []);

  const setDoc = (id, val) => setDocs(p => ({ ...p, [id]: val }));

  // ── simple doc row (packing list, BL, insurance, COO, product-specific) ──
  const DocRow = ({ id, name, req, uploaded: initUploaded, waivable = true }) => {
    const d = docs[id] || {};
    const isUploaded = d.uploaded ?? initUploaded;
    const isWaived = d.waived;
    const [showWaive, setShowWaive] = useState(false);
    const [reason, setReason] = useState("");
    const fileRef = useRef();
    const camRef = useRef();

    const handleFile = (e) => {
      const f = e.target.files?.[0];
      if (f) setDoc(id, { ...d, uploaded: true, fileName: f.name });
    };

    return (
      <div style={{ padding: "11px 0", borderBottom: `1px solid ${T.line}` }}>
        <input ref={fileRef} type="file" accept=".pdf,image/*"
          style={{ display: "none" }} onChange={handleFile} />
        <input ref={camRef} type="file" accept="image/*" capture="environment"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0];
            if (f) setDoc(id, { ...d, uploaded: true, fileName: f.name || "photo.jpg" });
            e.target.value = ""; }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{req}</div>
            {isUploaded && d.fileName && (
              <div style={{ fontSize: 10, color: T.green, marginTop: 2 }}>📎 {d.fileName}</div>
            )}
          </div>
          {isWaived ? (
            <span style={G.badge("warn")}>⊘ Waived</span>
          ) : isUploaded ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={G.badge("ok")}>✓ Uploaded</span>
              <button style={{ fontSize: 10, color: T.muted, background: "none", border: "none",
                cursor: "pointer", textDecoration: "underline" }}
                onClick={() => fileRef.current?.click()}>Replace</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: T.amber,
                  border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 6 }}
                  onClick={() => fileRef.current?.click()}>Upload</button>
                <button style={{ fontSize: 12, fontWeight: 600, color: T.navy, background: "#fff",
                  border: `1px solid ${T.navy}`, cursor: "pointer", padding: "6px 10px", borderRadius: 6 }}
                  onClick={() => camRef.current?.click()}>📷</button>
              </div>
              {waivable && !showWaive && (
                <button style={{ fontSize: 11, color: T.muted, textDecoration: "underline",
                  background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => setShowWaive(true)}>Waive</button>
              )}
            </div>
          )}
        </div>
        {showWaive && !isWaived && (
          <div style={{ marginTop: 8, padding: 10, background: T.wash,
            border: `1px solid ${T.line}`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
              Reason for waiving (recorded against your licence)
            </div>
            <input style={{ ...G.input, marginBottom: 8 }} value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Not applicable to this consignment" />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...G.btn(), ...G.btnAmber, padding: "7px 14px", fontSize: 12 }}
                onClick={() => {
                  setDoc(id, { waived: true, reason, waivedAt: new Date().toISOString() });
                  setShowWaive(false);
                }}>Confirm Waiver</button>
              <button style={{ ...G.btn(), ...G.btnBack, padding: "7px 14px", fontSize: 12 }}
                onClick={() => setShowWaive(false)}>Cancel</button>
            </div>
          </div>
        )}
        {isWaived && (
          <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
            Reason: {d.reason} · {d.waivedAt ? new Date(d.waivedAt).toLocaleTimeString("en-IN") : ""}
          </div>
        )}
      </div>
    );
  };



  return (
    <div style={G.body}>
      <Header />
      <Progress step={6} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Supporting Documents</div>
        <div style={G.sub}>Upload required documents. Waive any that don't apply — reason recorded.</div>

        {/* ── A. COMMERCIAL INVOICES (multi) ── */}
        <div style={G.card(T.navy)}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 2 }}>
            Commercial Invoices
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
            Upload one file per invoice — all invoices in this consignment.
            {invoices.length > 0 && ` ${invoices.length} invoice(s) declared in this filing.`}
          </div>
          <MultiFileRow
            label="Commercial Invoice"
            sub="PDF or image of the signed commercial invoice"
            files={commInvoices}
            onAdd={f => setCommInvoices(p => [...p, f])}
            onRemove={i => setCommInvoices(p => p.filter((_, idx) => idx !== i))}
          />
          {/* Other common docs */}
          <DocRow id="pl" name="Packing List" req="Required for all imports" uploaded={false} />
          <DocRow id="bl" name="Bill of Lading / AWB" req="Transport document" uploaded={true} />
          <DocRow id="ins" name="Insurance Certificate" req="If CIF terms" uploaded={false} />
          <DocRow id="coo" name="Certificate of Origin" req="CAROTAR 2020 compliance" uploaded={false} />
        </div>

        {/* ── B. TDS — PER ITEM ── */}
        <div style={G.card(T.amber)}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 2 }}>
            Technical Data Sheet (TDS) — Per Item
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
            Upload at least one TDS per item where available. Each TDS is logged against the item and invoice.
          </div>
          {invoices.length === 0 && (
            <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>
              No invoice items found — complete Screens 4 & 5 first.
            </div>
          )}
          {invoices.map((inv, ii) => (
            <div key={ii} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, marginBottom: 6,
                padding: "5px 8px", background: T.wash, borderRadius: 6,
                border: `1px solid ${T.line}` }}>
                Invoice {ii + 1}{inv.invoiceNumber ? ` — ${inv.invoiceNumber}` : ""}
              </div>
              {(inv.lineItems || []).map((li, ki) => {
                const key = `inv${ii}_item${ki}`;
                const existing = tdsFiles[key] || [];
                return (
                  <div key={ki} style={{ marginBottom: 10, paddingLeft: 8,
                    borderLeft: `2px solid ${T.line}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
                      Item {ki + 1}: {li.description || "(no description)"}
                      {li.proposedCth && (
                        <span style={{ ...G.badge("info"), marginLeft: 8, fontSize: 9 }}>
                          CTH {li.proposedCth}
                        </span>
                      )}
                    </div>
                    <MultiFileRow
                      label="TDS"
                      sub={null}
                      files={existing}
                      onAdd={f => setTdsFiles(p => ({ ...p, [key]: [...(p[key] || []), f] }))}
                      onRemove={i => setTdsFiles(p => ({
                        ...p, [key]: (p[key] || []).filter((_, idx) => idx !== i)
                      }))}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── C. TECHNICAL WRITE-UP ── */}
        <div style={G.card(T.blue)}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 2 }}>
            Technical Write-up
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
            Upload any technical write-up, catalogue, or product brochure supporting classification.
            Multiple files allowed.
          </div>
          <MultiFileRow
            label="Technical Write-up"
            sub="PDF · Catalogue, brochure, technical specification"
            files={techWriteups}
            onAdd={f => setTechWriteups(p => [...p, f])}
            onRemove={i => setTechWriteups(p => p.filter((_, idx) => idx !== i))}
          />
        </div>

        {/* ── D. PRODUCT-SPECIFIC (rules engine) ── */}
        {requiredDocs.length > 0 && (
          <div style={G.card(T.amber)}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: T.muted, marginBottom: 4 }}>
              Regulatory / Product-Specific Documents
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
              Based on confirmed HSN classifications · {cths.length} item(s) reviewed
            </div>
            {requiredDocs.map(r => (
              <DocRow key={r.id} id={r.id} name={r.doc}
                req={`${r.why} (${r.authority})`} uploaded={false} />
            ))}
          </div>
        )}

        {requiredDocs.length === 0 && (
          <div style={{ ...G.card(T.green), display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>✓</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.green }}>
                No regulatory documents required
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                Common documents suffice for these classifications.
              </div>
            </div>
          </div>
        )}

        <div style={{ height: 20 }} />
        <ESanchitManifestButton filing={filing} docs={docs} commInvoices={commInvoices}
          techWriteups={techWriteups} requiredDocs={requiredDocs} />
        <div style={{ height: 20 }} />
      </div>
      <Foot onBack={onBack} onNext={() => {
        update({ docs, commInvoices, tdsFiles, techWriteups });
        onNext();
      }} />
    </div>
  );
}

// ── E-SANCHIT UPLOAD MANIFEST ─────────────────────────────────────────────────
// IMPORTANT — what this genuinely does and does not do:
// CHAI does not store the actual file bytes the CHA selects (only file names,
// by design — files stay on the CHA's own device). This means CHAI cannot
// re-package real file content into a ready-to-upload ZIP. What it CAN do,
// honestly and usefully, is generate an exact manifest telling the CHA which
// of their already-selected files goes under which e-Sanchit document code,
// in which order, on the e-Sanchit portal (https://enquiry.icegate.gov.in/
// icesanchit or the e-Sanchit module inside the CHA's ICEGATE login).
// This turns a confusing multi-step manual process into a straight checklist,
// without pretending to submit anything on the CHA's behalf.

// ICEGATE e-Sanchit document type codes — the codes the portal itself uses
// when a document is tagged during upload. Sourced from CBIC's published
// e-Sanchit document code list. Add more here as new doc types are added
// to CHAI's own required-docs rules (see RULES array above).
const ESANCHIT_CODES = {
  "Commercial Invoice": "380000",
  "Packing List": "271000",
  "Bill of Lading": "IN000",  // sometimes not separately required in e-Sanchit if it's the BE cover doc
  "Airway Bill": "IN000",
  "BIS CRS Registration Certificate": "856002",
  "ADC/CDSCO NOC + Form 41": "5B0001",
  "FSSAI Import Licence + NOC": "IN0004",
  "WPC Equipment Type Approval": "915000",
  "Phytosanitary Certificate + PQ clearance": "375000",
  "EPCG Licence + port registration + bond": "AI0002",
  "Preferential CoO (Form AI / CEPA etc.)": "862000",
  "Technical Write-up": "0021000",
  "Insurance": "005000",
};

function ESanchitManifestButton({ filing, docs, commInvoices, techWriteups, requiredDocs }) {
  const generateManifest = () => {
    const P = loadProfile();
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    // Build the list of documents actually present in this filing
    const rows = [];
    (commInvoices || []).forEach((f, i) => {
      if (f?.uploaded) rows.push({
        name: `Commercial Invoice${commInvoices.length > 1 ? ` (${i + 1})` : ""}`,
        fileName: f.fileName || "—",
        code: ESANCHIT_CODES["Commercial Invoice"],
      });
    });
    (techWriteups || []).forEach((f, i) => {
      if (f?.uploaded) rows.push({
        name: `Technical Write-up${techWriteups.length > 1 ? ` (${i + 1})` : ""}`,
        fileName: f.fileName || "—",
        code: ESANCHIT_CODES["Technical Write-up"],
      });
    });
    (requiredDocs || []).forEach(r => {
      const d = docs[r.id];
      if (d?.uploaded && !d?.waived) rows.push({
        name: r.doc,
        fileName: d.fileName || "—",
        code: ESANCHIT_CODES[r.doc] || "OTHERS",
      });
    });
    // Common docs like packing list / BL that may be tracked under generic ids
    ["packingList", "billOfLading", "insurance"].forEach(id => {
      const d = docs[id];
      if (d?.uploaded && !d?.waived) {
        const label = id === "packingList" ? "Packing List" : id === "billOfLading" ? "Bill of Lading" : "Insurance";
        rows.push({ name: label, fileName: d.fileName || "—", code: ESANCHIT_CODES[label] || "OTHERS" });
      }
    });

    if (!rows.length) {
      alert("No uploaded documents found yet — upload at least one document before generating the manifest.");
      return;
    }

    const bodyRows = rows.map((r, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${r.name}</td>
        <td style="font-family:monospace">${r.fileName}</td>
        <td style="font-family:monospace;text-align:center">${r.code}</td>
        <td>☐</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>e-Sanchit Upload Manifest</title>
<style>
  @page { margin: 15mm; }
  body { font-family: Georgia, serif; color: #141821; font-size: 11px; }
  h1 { font-size: 16px; color: #0A1628; margin-bottom: 2px; }
  .sub { font-size: 10px; color: #6B7280; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #6B7280; padding: 6px 8px; border-bottom: 1px solid #0A1628; }
  td { padding: 7px 8px; border-bottom: 1px solid #E5E7EB; font-size: 10.5px; vertical-align: top; }
  .note { margin-top: 14px; padding: 10px 12px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; font-size: 9.5px; color: #1E40AF; line-height: 1.5; }
  .warn { margin-top: 10px; padding: 10px 12px; background: #FEF9C3; border: 1px solid #FDE68A; border-radius: 6px; font-size: 9.5px; color: #92400E; line-height: 1.5; }
  .footer { margin-top: 16px; font-size: 9px; color: #9CA3AF; text-align: center; }
</style></head><body>
  <h1>${P.firmName || "Custom House Agent"} — e-Sanchit Upload Manifest</h1>
  <div class="sub">${today} · Filing: ${filing.id || "—"} · IEC: ${filing.iec || "—"} · ${rows.length} documents</div>
  <table>
    <thead><tr><th>#</th><th>Document</th><th>Your File Name</th><th>e-Sanchit Doc Code</th><th>Uploaded</th></tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="note">
    <b>How to use this manifest:</b> Log into ICEGATE → e-Sanchit module. For each row above, select the matching
    document code from the e-Sanchit dropdown, upload the file with the file name shown, and tick the box once
    ICEGATE returns an IRN (Image Reference Number) for it. Keep this manifest until all documents show a tick.
  </div>
  <div class="warn">
    ⚠ Document codes shown are the standard CBIC-published e-Sanchit codes for these document types. Always confirm
    the correct code against the current e-Sanchit dropdown at the time of upload, as codes can be revised by CBIC.
    This manifest organizes your existing files — it does not upload anything automatically.
  </div>
  <div class="footer">Generated by Custom House AI</div>
</body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <button onClick={generateManifest}
      style={{ ...G.btn(), background: "#0369A1", color: "#fff", width: "100%", fontSize: 12 }}>
      📋 Generate e-Sanchit Upload Manifest
    </button>
  );
}

// ── DISCREPANCY ENGINE ────────────────────────────────────────────────────────
// Compares Invoice / Packing List / BL-AWB values and returns a result array.
// No API call — pure logic on data already in filing state.
function runDiscrepancyCheck(blData, invoices) {
  const results = [];
  const hasExtracted = blData?._aiExtracted || invoices.some(i => i._aiExtracted);
  if (!hasExtracted) return null; // all manual — skip silently

  const parseNum = (v) => {
    if (v === undefined || v === null || v === "") return null;
    const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  };
  const normStr = (v) => (v || "").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
  const strSimilar = (a, b) => {
    if (!a || !b) return null; // unavailable
    const na = normStr(a), nb = normStr(b);
    if (na === nb) return true;
    // Check if one contains the other (handles abbreviated names)
    if (na.includes(nb) || nb.includes(na)) return true;
    // Word overlap > 50%
    const wa = new Set(na.split(" ")), wb = new Set(nb.split(" "));
    const common = [...wa].filter(w => w.length > 2 && wb.has(w)).length;
    return common >= Math.min(wa.size, wb.size) * 0.5;
  };

  // 1. Total quantity
  const invQty = invoices.reduce((s, inv) =>
    s + (inv.lineItems || []).reduce((ss, li) => {
      const q = parseNum(li.quantity); return ss + (q || 0);
    }, 0), 0);
  const blQty = parseNum(blData?.numberOfPackages);
  // Only compare quantity if we have both — treat as unavailable if either missing
  if (invQty > 0 && blQty !== null) {
    const match = Math.abs(invQty - blQty) / Math.max(invQty, blQty) < 0.02; // 2% tolerance
    results.push({ field: "Total Quantity", invoiceValue: invQty.toFixed(0), blValue: String(blQty), status: match ? "match" : "mismatch" });
  } else {
    results.push({ field: "Total Quantity", invoiceValue: invQty > 0 ? invQty.toFixed(0) : null, blValue: blQty !== null ? String(blQty) : null, status: "unavailable" });
  }

  // 2. Gross weight
  const invWeight = invoices.reduce((s, inv) => {
    const w = parseNum(inv.grossWeight); return s + (w || 0);
  }, 0);
  const blWeight = parseNum(blData?.grossWeight);
  if (invWeight > 0 && blWeight !== null) {
    const match = Math.abs(invWeight - blWeight) / Math.max(invWeight, blWeight) < 0.05; // 5% tolerance
    results.push({ field: "Gross Weight (KGS)", invoiceValue: invWeight.toFixed(2), blValue: blWeight.toFixed(2), status: match ? "match" : "mismatch" });
  } else {
    results.push({ field: "Gross Weight (KGS)", invoiceValue: invWeight > 0 ? invWeight.toFixed(2) : null, blValue: blWeight !== null ? String(blWeight) : null, status: "unavailable" });
  }

  // 3. Invoice value (sum all invoices vs any value on BL — BL often has consolidated)
  const invTotal = invoices.reduce((s, inv) => {
    const v = parseNum(inv.invoiceValue); return s + (v || 0);
  }, 0);
  const blValue = parseNum(blData?.declaredValue || blData?.invoiceValue);
  if (invTotal > 0 && blValue !== null) {
    const match = Math.abs(invTotal - blValue) / Math.max(invTotal, blValue) < 0.05;
    results.push({ field: "Invoice Value", invoiceValue: invTotal.toFixed(2), blValue: blValue.toFixed(2), status: match ? "match" : "mismatch" });
  } else {
    results.push({ field: "Invoice Value", invoiceValue: invTotal > 0 ? invTotal.toFixed(2) : null, blValue: null, status: "unavailable" });
  }

  // 4. Consignee name
  const invConsignee = invoices[0]?.consigneeName || invoices[0]?.buyerName || null;
  const blConsignee = blData?.consigneeName || null;
  const nameSim = strSimilar(invConsignee, blConsignee);
  results.push({
    field: "Consignee Name",
    invoiceValue: invConsignee || null,
    blValue: blConsignee || null,
    status: nameSim === null ? "unavailable" : nameSim ? "match" : "mismatch",
  });

  // 5. Description of goods (soft check)
  const invDesc = invoices.map(i => i.goodsDescription || (i.lineItems?.[0]?.description) || "").filter(Boolean).join("; ");
  const blDesc = blData?.marksAndNumbers || blData?.description || null;
  // Only flag if both present and clearly unrelated (no common meaningful words)
  if (invDesc && blDesc) {
    const sim = strSimilar(invDesc, blDesc);
    results.push({ field: "Goods Description", invoiceValue: invDesc.slice(0, 40) + (invDesc.length > 40 ? "…" : ""), blValue: blDesc.slice(0, 40) + (blDesc.length > 40 ? "…" : ""), status: sim ? "match" : "mismatch" });
  } else {
    results.push({ field: "Goods Description", invoiceValue: invDesc ? invDesc.slice(0, 40) + "…" : null, blValue: blDesc ? blDesc.slice(0, 40) + "…" : null, status: "unavailable" });
  }

  // Filter out all-unavailable — return null to hide panel
  const hasReal = results.some(r => r.status !== "unavailable");
  return hasReal ? results : null;
}

// DiscrepancyPanel — rendered at the top of S7_Checklist
function DiscrepancyPanel({ filing, onAcknowledge, acknowledged }) {
  const results = runDiscrepancyCheck(filing.blData, filing.invoices || []);
  if (!results) return null;

  const mismatches = results.filter(r => r.status === "mismatch");
  const allClear = mismatches.length === 0;

  if (allClear) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 15 }}>✓</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.green }}>
          All documents consistent — Invoice, BL/AWB values match.
        </span>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid #FECACA`, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
      {/* Banner */}
      <div style={{ background: "#FEF2F2", padding: "10px 14px",
        display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.red }}>
            Document Discrepancies Detected
          </div>
          <div style={{ fontSize: 11, color: "#991B1B", marginTop: 1 }}>
            {mismatches.length} mismatch{mismatches.length > 1 ? "es" : ""} found — review before filing.
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#FFF7F7" }}>
              {["Field", "Invoice", "BL / AWB", "Status"].map(h => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 9,
                  fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase",
                  color: T.muted, borderBottom: `1px solid ${T.line}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const bg = r.status === "match" ? "#F0FDF4" : r.status === "mismatch" ? "#FEF2F2" : T.paper;
              const statusColor = r.status === "match" ? T.green : r.status === "mismatch" ? T.red : T.muted;
              const statusLabel = r.status === "match" ? "✓ Match" : r.status === "mismatch" ? "✗ Mismatch" : "— N/A";
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.line}`,
                    fontWeight: 600, color: T.ink }}>{r.field}</td>
                  <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.line}`,
                    color: T.ink, fontFamily: "monospace", fontSize: 11 }}>
                    {r.invoiceValue ?? <span style={{ color: T.muted }}>—</span>}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.line}`,
                    color: T.ink, fontFamily: "monospace", fontSize: 11 }}>
                    {r.blValue ?? <span style={{ color: T.muted }}>—</span>}
                  </td>
                  <td style={{ padding: "7px 10px", borderBottom: `1px solid ${T.line}`,
                    fontWeight: 700, color: statusColor, fontSize: 10 }}>{statusLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action */}
      {!acknowledged ? (
        <div style={{ padding: "10px 14px", background: "#FFF7F7",
          borderTop: `1px solid #FECACA`, display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => onAcknowledge("amend")}
            style={{ ...G.btn(), background: T.paper, color: T.ink,
              border: `1px solid ${T.line}`, fontSize: 12, padding: "8px 16px" }}>
            ← Amend Documents
          </button>
          <button onClick={() => onAcknowledge("proceed")}
            style={{ ...G.btn(), background: T.red, color: "#fff",
              fontSize: 12, padding: "8px 16px" }}>
            Acknowledge & Proceed
          </button>
          <span style={{ fontSize: 10, color: T.muted, lineHeight: 1.4 }}>
            Your decision will be logged in the audit trail.
          </span>
        </div>
      ) : (
        <div style={{ padding: "8px 14px", background: "#FFF7F7",
          borderTop: `1px solid #FECACA`, fontSize: 11, color: "#991B1B" }}>
          ⚠ Discrepancies acknowledged and logged — CHA to verify before filing.
        </div>
      )}
    </div>
  );
}

// ── SCREEN 7 — CHECKLIST ──────────────────────────────────────────────────────
function S7_Checklist({ filing, onBack, onHome, onNavigate }) {
  const bl = filing.blData || {};
  const invoices = filing.invoices || [];
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const fmt = (v) => v && v !== "undefined" ? v : "—";

  // Mark job stage as Checklist Ready when this screen loads
  useEffect(() => {
    const uid = _currentUser?.id;
    if (uid && filing.id) {
      const all = Jobs.all(uid);
      const job = all.find(j => j.id === filing.id);
      if (job) {
        const cur = STAGE_ORDER.indexOf(job.stage);
        const target = STAGE_ORDER.indexOf("Checklist Ready");
        if (target > cur) Jobs.updateStage(uid, filing.id, "Checklist Ready");
      }
    }
  }, [filing.id]);

  // ── Discrepancy state ────────────────────────────────────────────────────
  const [discAcknowledged, setDiscAcknowledged] = useState(filing.discrepancyAcknowledged || false);
  const discResults = runDiscrepancyCheck(filing.blData, filing.invoices || []);
  const discMismatches = discResults ? discResults.filter(r => r.status === "mismatch") : [];
  const discBlocked = discMismatches.length > 0 && !discAcknowledged;

  const handleDiscAcknowledge = (action) => {
    if (action === "amend") { onNavigate(3); return; }
    // "proceed" — log to audit trail via filing update is not available in S7,
    // so we write directly to localStorage audit log
    const auditEntry = {
      event: "discrepancy_acknowledged",
      action: "proceed",
      mismatches: discMismatches.map(r => ({ field: r.field, invoiceValue: r.invoiceValue, blValue: r.blValue })),
      timestamp: new Date().toISOString(),
      filingId: filing.id,
    };
    try {
      const log = JSON.parse(localStorage.getItem("chai_audit_log") || "[]");
      log.push(auditEntry);
      localStorage.setItem("chai_audit_log", JSON.stringify(log));
    } catch {}
    setDiscAcknowledged(true);
  };

  // ── Duty calculation helpers ──────────────────────────────────────────────
  // Parse a percentage string like "7.5%" → 0.075
  const pct = (s) => parseFloat((s || "0").replace("%", "")) / 100 || 0;
  // Parse an amount string like "USD 1,234.56" or "1234.56" → number
  const parseAmt = (s) => parseFloat((s || "0").toString().replace(/[^0-9.]/g, "")) || 0;
  // Exchange rate — live from /api/exchange adapter, 95.30 fallback
  const { rate: exchRate, meta: exchMeta } = useExchangeRate("USD", "import");

  // Per-invoice duty totals
  // ── ASSESSABLE VALUE & DUTY ENGINE ──────────────────────────────────────────
  // AV rules (Customs Valuation Rules):
  //   CIF/CIP/DDP/DAP terms → invoice value already includes freight+insurance
  //   FOB/EXW/FCA terms     → AV = value + freight + insurance
  //                           insurance defaults to 1.125% of value if blank
  //   Misc charges (loading/handling) added in all cases when entered
  // Duty chain per item: BCD → SWS(10% of BCD) → AIDC → Health Cess →
  //   IGST on (AV + BCD + SWS + AIDC + Health + ADD) → Compensation Cess (same base)
  const invTotals = invoices.map(inv => {
    const term = (inv.incoterm || "").toUpperCase();
    const needsAdditions = /FOB|EXW|FCA/.test(term);
    const invValue = parseAmt(inv.invoiceValue);
    const freight = parseAmt(inv.freight);
    const insurance = inv.insurance !== undefined && inv.insurance !== ""
      ? parseAmt(inv.insurance)
      : (needsAdditions ? invValue * 0.01125 : 0);
    const misc = parseAmt(inv.miscCharges);
    const additions = (needsAdditions ? freight + insurance : 0) + misc;
    // Apportion invoice-level additions across items pro-rata by line amount
    const lineSum = (inv.lineItems || []).reduce((s, li) => s + parseAmt(li.amount), 0) || 1;

    let bcdTotal = 0, swsTotal = 0, aidcTotal = 0, healthTotal = 0,
        igstTotal = 0, compTotal = 0, avTotal = 0;
    const itemCalcs = (inv.lineItems || []).map(li => {
      const d = getDutyNum(li.proposedCth);
      const lineAmt = parseAmt(li.amount);
      const share = lineAmt / lineSum;
      const avCcy = lineAmt + additions * share;
      const av = avCcy * exchRate;
      // EPCG import: Nil BCD per Notification 16/2015-Customs
      const epcgActive = !!filing.epcgImport;
      const effectiveBcd = epcgActive ? 0 : (li.waiver?.active ? parseFloat(li.waiver.effectiveRate || "0") : d.bcd);
      const bcdAmt = av * (effectiveBcd / 100);
      const swsAmt = bcdAmt * 0.10;
      const aidcAmt = av * (d.aidc / 100);
      const healthAmt = av * (d.healthCess / 100);
      const addAmt = av * ((d.add || 0) / 100);
      const igstBase = av + bcdAmt + swsAmt + aidcAmt + healthAmt + addAmt;
      const waiverIgst = li.waiver?.active && li.waiver.effectiveIgst !== undefined && li.waiver.effectiveIgst !== "";
      const effectiveIgstRate = waiverIgst ? parseFloat(li.waiver.effectiveIgst || "0") : d.igst;
      const igstAmt = igstBase * (effectiveIgstRate / 100);
      const compAmt = igstBase * (d.compCess / 100);
      avTotal += av; bcdTotal += bcdAmt; swsTotal += swsAmt;
      aidcTotal += aidcAmt; healthTotal += healthAmt;
      igstTotal += igstAmt; compTotal += compAmt;
      return { av, bcdAmt, swsAmt, aidcAmt, healthAmt, addAmt, igstAmt, compAmt, duty: d,
        itemDuty: bcdAmt + swsAmt + aidcAmt + healthAmt + addAmt + igstAmt + compAmt };
    });
    return { avTotal, bcdTotal, swsTotal, aidcTotal, healthTotal, igstTotal, compTotal,
      freight, insurance, misc, needsAdditions, additions, itemCalcs,
      insuranceDefaulted: needsAdditions && (inv.insurance === undefined || inv.insurance === ""),
      dutyTotal: bcdTotal + swsTotal + aidcTotal + healthTotal + igstTotal + compTotal };
  });

  const exportPDF = () => {
    const P = loadProfile();
    const b = filing.blData || {};
    const iecR = filing.iecResult || {};
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    // ── Page 1: per-invoice item tables with full duty sub-rows ──
    const invHtml = invoices.map((inv, ii) => {
      const tot = invTotals[ii];
      const rows = (inv.lineItems || []).map((li, ki) => {
        const c = tot.itemCalcs[ki] || {};
        const d = c.duty || getDutyNum(li.proposedCth);
        const wv = li.waiver?.active;
        const epcgA = !!filing.epcgImport;
        const notn = wv
          ? `${li.waiver.notifNo || "—"} Sr.${li.waiver.serial || "—"} — ${li.waiver.reason || "Waived"}`
          : epcgA ? "16/2015-Cus (EPCG — Nil BCD)"
          : (getDuty(li.proposedCth).src||"").includes("Assessed") ? "Per assessed BE"
          : "45/2025-Cus Sr. — (verify per current notification)";
        return `<tr>
          <td>${ki + 1}</td>
          <td>${li.description || ""}<br><span class="muted">${li.quantity || ""} ${li.unit || ""} @ ${inv.currency || ""} ${li.unitPrice || li.amount || ""}</span></td>
          <td style="font-family:monospace;font-weight:600">${li.proposedCth || "—"}</td>
          <td style="font-size:8px">${notn}</td>
          <td>${fmtINR(c.av || 0)}</td>
          <td>${d.bcd}%<br><span class="muted">${fmtINR(c.bcdAmt || 0)}</span></td>
          <td>${d.igst}%<br><span class="muted">${fmtINR(c.igstAmt || 0)}</span></td>
          <td>${fmtINR(c.itemDuty || 0)}</td>
        </tr>`;
      }).join("");
      const addRow = (label, val, always) => (always || val > 0.5)
        ? `<div class="duty-row"><span>${label}</span><span>${fmtINR(val)}</span></div>` : "";
      return `
      <div class="inv-block">
        <div class="inv-hdr">
          <strong>Invoice ${ii + 1} of ${invoices.length} — ${inv.invoiceNumber || "—"} dt. ${inv.invoiceDate || "—"}</strong><br>
          <span class="muted">Supplier: ${inv.shipperName || "—"} · Term: ${inv.incoterm || "—"} · Value: ${inv.currency || ""} ${inv.invoiceValue || "—"}</span><br>
          <span class="muted">Freight: ${inv.currency || ""} ${tot.freight || 0} · Insurance: ${inv.currency || ""} ${Math.round((tot.insurance || 0)*100)/100}${tot.insuranceDefaulted ? " (default 1.125%)" : ""} · Misc: ${inv.currency || ""} ${tot.misc || 0}${tot.needsAdditions ? " — added to AV per valuation rules" : " — included in value (CIF terms)"}</span>
        </div>
        <table>
          <thead><tr><th>#</th><th>Description</th><th>CTH</th><th>Cus. Notn</th><th>Assess. Value</th><th>BCD</th><th>IGST</th><th>Item Duty</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="duty-block">
          ${addRow("Assessable Value (INR)", tot.avTotal, true)}
          ${addRow("Basic Customs Duty (BCD)", tot.bcdTotal, true)}
          ${addRow("Social Welfare Surcharge (10% of BCD)", tot.swsTotal, true)}
          ${addRow("AID Cess (AIDC)", tot.aidcTotal)}
          ${addRow("Health Cess", tot.healthTotal)}
          ${addRow("IGST", tot.igstTotal, true)}
          ${addRow("Compensation Cess", tot.compTotal)}
          <div class="duty-row total"><span>Invoice Duty Total</span><span>${fmtINR(tot.dutyTotal)}</span></div>
        </div>
      </div>`;
    }).join("");

    // ── Page 2: duty summary grid by CTH ──
    const cthMap = {};
    invoices.forEach((inv, ii) => (inv.lineItems || []).forEach((li, ki) => {
      const c = invTotals[ii].itemCalcs[ki] || {};
      const k = li.proposedCth || "—";
      if (!cthMap[k]) cthMap[k] = { av: 0, bcd: 0, sws: 0, aidc: 0, health: 0, igst: 0, comp: 0, n: 0 };
      cthMap[k].av += c.av || 0; cthMap[k].bcd += c.bcdAmt || 0; cthMap[k].sws += c.swsAmt || 0;
      cthMap[k].aidc += c.aidcAmt || 0; cthMap[k].health += c.healthAmt || 0;
      cthMap[k].igst += c.igstAmt || 0; cthMap[k].comp += c.compAmt || 0; cthMap[k].n++;
    }));
    const dutyGrid = Object.entries(cthMap).map(([cth, v]) => `<tr>
      <td style="font-family:monospace">${cth}</td><td>${v.n}</td><td>${fmtINR(v.av)}</td>
      <td>${fmtINR(v.bcd)}</td><td>${fmtINR(v.sws)}</td>
      <td>${fmtINR(v.aidc + v.health)}</td><td>${fmtINR(v.igst)}</td><td>${fmtINR(v.comp)}</td>
      <td>${fmtINR(v.bcd + v.sws + v.aidc + v.health + v.igst + v.comp)}</td></tr>`).join("");

    const grandRows = [
      ["Total Assessable Value", grandAv],
      ["Total BCD", grandBcd], ["Total SWS", grandSws],
      ...(grandAidc > 0.5 ? [["Total AIDC", grandAidc]] : []),
      ...(grandHealth > 0.5 ? [["Total Health Cess", grandHealth]] : []),
      ["Total IGST", grandIgst],
      ...(grandComp > 0.5 ? [["Total Compensation Cess", grandComp]] : []),
    ].map(([l, v]) => `<div class="duty-row"><span>${l}${hasIndicative ? " est.*" : ""}</span><span>${fmtINR(v)}</span></div>`).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>BE Checklist</title>
<style>
body{font-family:Arial,sans-serif;font-size:10px;color:#141821;margin:26px;}
h1{font-size:14px;margin:0 0 2px;} .sub{font-size:9px;color:#6B7280;}
.hdr{text-align:center;border-bottom:2px solid #0A1628;padding-bottom:8px;margin-bottom:10px;}
table{width:100%;border-collapse:collapse;margin-bottom:4px;}
th{background:#0A1628;color:#fff;padding:4px 6px;font-size:8px;text-transform:uppercase;text-align:left;}
td{padding:4px 6px;border-bottom:1px solid #E7E9EE;vertical-align:top;font-size:9px;}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;margin-bottom:10px;font-size:9px;}
.k{color:#6B7280;} .v{font-weight:600;}
.muted{color:#6B7280;font-size:8px;}
.inv-block{margin-bottom:12px;border:1px solid #E7E9EE;border-radius:4px;overflow:hidden;}
.inv-hdr{background:#F8F9FB;padding:6px 9px;border-bottom:1px solid #E7E9EE;font-size:9px;}
.duty-block{padding:6px 9px;background:#F8F9FB;border-top:1px solid #E7E9EE;}
.duty-row{display:flex;justify-content:space-between;font-size:9px;padding:2px 0;color:#374151;}
.duty-row.total{font-weight:700;color:#141821;border-top:1px solid #E7E9EE;margin-top:3px;padding-top:3px;}
.grand-total{background:#0A1628;color:#fff;padding:10px 12px;border-radius:5px;margin:10px 0;}
.grand-total .duty-row{color:rgba(255,255,255,.75);font-size:10px;}
.grand-total .duty-row.grand{color:#C8841A;font-size:13px;font-weight:700;border-top:1px solid rgba(255,255,255,.25);margin-top:5px;padding-top:5px;}
.words{font-size:9px;font-style:italic;margin:4px 0 10px;color:#374151;}
.pagebreak{page-break-before:always;}
.decl{font-size:8.5px;color:#374151;line-height:1.6;margin:8px 0;}
.sign{display:flex;justify-content:space-between;margin-top:36px;font-size:10px;}
.foot{margin-top:12px;font-size:8px;color:#6B7280;border-top:1px solid #E7E9EE;padding-top:6px;}
h2{font-size:11px;margin:12px 0 6px;border-bottom:1px solid #E7E9EE;padding-bottom:3px;}
</style></head><body>

<div class="hdr">
  <h1>${P.firmName || "—"}</h1>
  <div class="sub">${P.address || ""}</div>
  <div style="font-size:11px;font-weight:700;margin-top:4px">CHECKLIST — BILL OF ENTRY FOR HOME CONSUMPTION</div>
  <div class="sub">Custom Stn.: ${P.port || b.portOfDischarge || "—"} · Generated on ${today} · DRAFT FOR VERIFICATION — NOT A CUSTOMS DOCUMENT</div>
</div>

<div class="meta">
  <div><span class="k">BE No / Date:</span> <span class="v">________ / ________</span></div>
  <div><span class="k">Job No:</span> <span class="v">${filing.id || "—"}</span></div>
  <div><span class="k">CHA:</span> <span class="v">${P.firmName || "—"} · ${P.licence || ""}</span></div>
  <div><span class="k">CHA GSTIN / PAN / AD:</span> <span class="v">${P.gstin || "—"} / ${P.pan || "—"} / ${P.adCode || "—"}</span></div>
  <div><span class="k">Importer:</span> <span class="v">${iecR.name || b.consigneeName || "—"}</span></div>
  <div><span class="k">IEC / GSTIN:</span> <span class="v">${filing.iec || "—"} / ${iecR.gstin || "—"}</span></div>
  <div><span class="k">Master BL/AWB:</span> <span class="v">${b.blAwbNumber || "—"} dt. ${b.blAwbDate || "—"}</span></div>
  <div><span class="k">House AWB:</span> <span class="v">${b.houseAwbNumber || "—"}</span></div>
  <div><span class="k">IGM No / Date:</span> <span class="v">${b.igmNo || "________"}</span></div>
  <div><span class="k">Port of Loading:</span> <span class="v">${b.portOfLoading || "—"}</span></div>
  <div><span class="k">Country of Origin:</span> <span class="v">${b.countryOfOrigin || "—"}</span></div>
  <div><span class="k">Country of Consignment:</span> <span class="v">${b.countryOfOrigin || "—"}</span></div>
  <div><span class="k">No. of Pkgs:</span> <span class="v">${b.numberOfPackages || "—"}</span></div>
  <div><span class="k">Gross Weight:</span> <span class="v">${b.grossWeight || "—"} KGS</span></div>
  <div><span class="k">Marks &amp; Nos:</span> <span class="v">${b.marksAndNumbers || "—"}</span></div>
  <div><span class="k">Exchange Rate:</span> <span class="v">₹${exchRate}/USD (${exchMeta?.confidence === "curated" || !exchMeta ? "indicative — verify CBIC notif." : exchMeta?.source})</span></div>
  <div><span class="k">SVB:</span> <span class="v">NA</span></div>
  <div><span class="k">Nature of Transaction:</span> <span class="v">Sale</span></div>
  <div><span class="k">Valuation Method:</span> <span class="v">Transaction Value — Rule 3</span></div>
  <div><span class="k">Green Channel / Sec 48:</span> <span class="v">No / No</span></div>
</div>

${invHtml}

<div class="grand-total">
  ${grandRows}
  <div class="duty-row grand"><span>TOTAL DUTY PAYABLE${hasIndicative ? " est.*" : ""}</span><span>${fmtINR(grandDuty)}</span></div>
</div>
<div class="words">${amountInWords(grandDuty)}</div>
${hasIndicative ? "<div style='font-size:8px;color:#C8841A'>* One or more rates are indicative / AI-suggested — verify against current CBIC tariff and notifications before filing.</div>" : ""}

<div class="pagebreak"></div>
<h2>IMPORT PRODUCT DUTY DETAILS</h2>
<table>
  <thead><tr><th>CTH</th><th>Items</th><th>Assess. Value</th><th>BCD</th><th>SWS</th><th>Cesses</th><th>IGST</th><th>Comp. Cess</th><th>Total</th></tr></thead>
  <tbody>${dutyGrid}</tbody>
</table>
<h2>SINGLE WINDOW / PGA</h2>
<div class="decl">Participating Government Agency requirements (FSSAI / CDSCO / WPC / BIS / PQ / AQ): as flagged during document review. Confirm before filing where any item attracts a PGA NOC.</div>
<h2>SUPPORTING DOCUMENTS</h2>
<table><thead><tr><th>Document</th><th>Status</th></tr></thead><tbody>
${(filing.docs ? Object.entries(filing.docs) : []).map(([k, v]) =>
  `<tr><td>${v.label || k}</td><td>${v.uploaded ? "✓ Uploaded" : v.waived ? "Waived — " + (v.waiveReason || "") : "Pending"}</td></tr>`).join("") || "<tr><td colspan=2>As per Screen 6 record</td></tr>"}
</tbody></table>

<div class="pagebreak"></div>
<h2>DECLARATION</h2>
<div class="decl">
1. I/We declare that the contents of this Bill of Entry are true and correct in every respect and are in accordance with the invoice and other documents relating to the goods.<br>
2. I/We declare that the goods covered by this Bill of Entry have been imported on outright purchase / consignment account and the invoice value declared represents the price actually paid or payable.<br>
3. I/We am/are not connected with the suppliers/manufacturers as agent/distributor/related party except as declared, and the declared value conforms to the Customs Valuation (Determination of Value of Imported Goods) Rules, 2007.<br>
4. I/We declare that any documents submitted in support of assessment are authentic and no material information has been suppressed.<br>
5. Classification, notification claims and duty amounts shown are as advised by the system and confirmed by the undersigned Customs Broker; the CHA takes responsibility for verification prior to filing.
</div>
<div class="sign">
  <div><div class="muted" style="margin-bottom:28px">CHA Name &amp; Signature</div><strong>${P.firmName || "________________"}</strong><br><span class="muted">${P.licence || ""}</span></div>
  <div><div class="muted" style="margin-bottom:28px">Importer Name &amp; Signature</div><strong>${iecR.name || "________________"}</strong></div>
</div>
<div class="foot">Generated by Custom House AI · Draft checklist for verification — not a substitute for the ICES-generated Bill of Entry · ${today}</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("Pop-up blocked — allow pop-ups to download the PDF."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };


  const grandBcd    = invTotals.reduce((s, t) => s + t.bcdTotal, 0);
  const grandSws    = invTotals.reduce((s, t) => s + t.swsTotal, 0);
  const grandAidc   = invTotals.reduce((s, t) => s + (t.aidcTotal || 0), 0);
  const grandHealth = invTotals.reduce((s, t) => s + (t.healthTotal || 0), 0);
  const grandIgst   = invTotals.reduce((s, t) => s + t.igstTotal, 0);
  const grandComp   = invTotals.reduce((s, t) => s + (t.compTotal || 0), 0);
  const grandAv     = invTotals.reduce((s, t) => s + t.avTotal, 0);
  const grandDuty   = grandBcd + grandSws + grandAidc + grandHealth + grandIgst + grandComp;

  const fmtINR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const hasIndicative = invoices.some(inv =>
    (inv.lineItems || []).some(li => getDuty(li.proposedCth).src === "Indicative")
  );

  const s = {
    sLabel: { fontSize: 10, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase",
      color: T.muted, marginBottom: 8 },
    metaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 12 },
    k: { color: T.muted }, v: { fontWeight: 600 },
    tbl: { width: "100%", borderCollapse: "collapse", fontSize: 11 },
    th: { padding: "6px 7px", fontSize: 9, fontWeight: 700, letterSpacing: ".05em",
      textTransform: "uppercase", color: T.muted, borderBottom: `1px solid ${T.line}`,
      background: T.wash, textAlign: "left" },
    td: { padding: "7px", borderBottom: `1px solid ${T.line}`, verticalAlign: "top" },
  };

  return (
    <div style={G.body}>
      <Header />
      <Progress step={7} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Checklist</div>
        <div style={G.sub}>JEENA & COMPANY · Bill of Entry for Home Consumption</div>

        {/* Discrepancy check — runs automatically, appears before checklist */}
        <DiscrepancyPanel
          filing={filing}
          onAcknowledge={handleDiscAcknowledge}
          acknowledged={discAcknowledged}
        />

        {/* If discrepancies exist and not yet acknowledged, dim the checklist below */}
        <div style={{ opacity: discBlocked ? 0.4 : 1, pointerEvents: discBlocked ? "none" : "auto",
          transition: "opacity 0.2s" }}>

        {/* Filing header */}
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ background: T.navy, padding: "12px 14px" }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 600, color: "#fff" }}>
              Bill of Entry Checklist
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)", marginTop: 2 }}>
              Generated {today} · Custom Stn: KOLKATA, INCCU4
            </div>
          </div>

          {/* Header meta */}
          <div style={{ ...s.section, padding: "12px 14px" }}>
            <div style={s.sLabel}>Filing Details</div>
            <div style={s.metaGrid}>
              {[
                ["CHA", loadProfile().firmName || "—"], ["CHA Licence", loadProfile().licence || "—"],
                ["Importer", fmt(filing.iecResult?.name)], ["IEC", fmt(filing.iec)],
                ["GSTIN", fmt(filing.iecResult?.gstin)], ["AD Code", fmt(filing.iecResult?.adCode)],
                ["BL / AWB", fmt(bl.blAwbNumber)], ["BL Date", fmt(bl.blAwbDate)],
                ["Port of Loading", fmt(bl.portOfLoading)], ["Port of Discharge", fmt(bl.portOfDischarge)],
                ["Country of Origin", fmt(bl.countryOfOrigin)], ["Pkgs / Weight", `${fmt(bl.numberOfPackages)} · ${fmt(bl.grossWeight)} KGS`],
                ["Vessel", fmt(bl.vessel)], ["Invoices", String(invoices.length)],
              ].map(([k, v]) => (
                <div key={k}><span style={s.k}>{k}</span><div style={s.v}>{v}</div></div>
              ))}
            </div>
          </div>

          {/* Per-invoice blocks */}
          {invoices.map((inv, ii) => {
            const tot = invTotals[ii];
            return (
            <div key={ii} style={{ ...s.section, padding: "12px 14px" }}>
              <div style={s.sLabel}>Invoice {ii + 1} / {invoices.length}</div>
              <div style={{ background: T.wash, padding: "8px 10px", borderRadius: 6, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {inv.invoiceNumber || "—"} · {inv.invoiceDate || ""}
                </div>
                <div style={{ fontSize: 11, color: T.muted }}>
                  {inv.shipperName || ""} · {inv.currency || ""} {inv.invoiceValue || ""} · {inv.incoterm || ""}
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={s.tbl}>
                  <thead>
                    <tr>
                      {["#", "Description", "CTH", "Qty", "Value", "BCD", "IGST"].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(inv.lineItems || []).map((li, ki) => {
                      const d = getDuty(li.proposedCth);
                      return (
                        <tr key={ki}>
                          <td style={s.td}>{ki + 1}</td>
                          <td style={{ ...s.td, maxWidth: 140 }}>{li.description}</td>
                          <td style={{ ...s.td, fontFamily: "monospace", fontWeight: 600,
                            color: T.navy, fontSize: 11 }}>{li.proposedCth || "—"}</td>
                          <td style={s.td}>{li.quantity} {li.unit}</td>
                          <td style={s.td}>{inv.currency} {li.amount}</td>
                          <td style={s.td}>
                            {d.bcd}
                            {d.src === "Indicative" && <span style={{ fontSize: 9, color: T.amber }}> est.*</span>}
                          </td>
                          <td style={s.td}>
                            {d.igst}
                            {d.src === "Indicative" && <span style={{ fontSize: 9, color: T.amber }}> est.*</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Per-invoice duty summary */}
              <div style={{ marginTop: 10, padding: "10px 12px", background: T.wash,
                border: `1px solid ${T.line}`, borderRadius: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
                  <span style={{ color: T.muted }}>Assessable Value (INR)</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtINR(tot.avTotal)}</span>
                  <span style={{ color: T.muted }}>BCD{hasIndicative ? " est.*" : ""}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtINR(tot.bcdTotal)}</span>
                  <span style={{ color: T.muted }}>SWS (10% of BCD){hasIndicative ? " est.*" : ""}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtINR(tot.swsTotal)}</span>
                  {(tot.aidcTotal || 0) > 0.5 && <>
                    <span style={{ color: T.muted }}>AID Cess (AIDC)</span>
                    <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtINR(tot.aidcTotal)}</span>
                  </>}
                  {(tot.healthTotal || 0) > 0.5 && <>
                    <span style={{ color: T.muted }}>Health Cess</span>
                    <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtINR(tot.healthTotal)}</span>
                  </>}
                  <span style={{ color: T.muted }}>IGST{hasIndicative ? " est.*" : ""}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtINR(tot.igstTotal)}</span>
                  {(tot.compTotal || 0) > 0.5 && <>
                    <span style={{ color: T.muted }}>Compensation Cess</span>
                    <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtINR(tot.compTotal)}</span>
                  </>}
                  <span style={{ fontWeight: 700, borderTop: `1px solid ${T.line}`, paddingTop: 6, marginTop: 4 }}>
                    Invoice Duty Total{hasIndicative ? " est.*" : ""}
                  </span>
                  <span style={{ fontWeight: 700, color: T.navy, textAlign: "right",
                    borderTop: `1px solid ${T.line}`, paddingTop: 6, marginTop: 4 }}>
                    {fmtINR(tot.dutyTotal)}
                  </span>
                </div>
              </div>
            </div>
            );
          })}

          {/* Grand total */}
          <div style={{ padding: "14px 14px", background: T.navy }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em",
              textTransform: "uppercase", color: "rgba(255,255,255,.6)", marginBottom: 10 }}>
              Total Duty Payable — All Invoices
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: 12 }}>
              <span style={{ color: "rgba(255,255,255,.7)" }}>Total BCD{hasIndicative ? " est.*" : ""}</span>
              <span style={{ color: "#fff", fontWeight: 600, textAlign: "right" }}>{fmtINR(grandBcd)}</span>
              <span style={{ color: "rgba(255,255,255,.7)" }}>Total SWS{hasIndicative ? " est.*" : ""}</span>
              <span style={{ color: "#fff", fontWeight: 600, textAlign: "right" }}>{fmtINR(grandSws)}</span>
              <span style={{ color: "rgba(255,255,255,.7)" }}>Total IGST{hasIndicative ? " est.*" : ""}</span>
              <span style={{ color: "#fff", fontWeight: 600, textAlign: "right" }}>{fmtINR(grandIgst)}</span>
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.2)",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                TOTAL DUTY PAYABLE{hasIndicative ? " est.*" : ""}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: T.amber }}>
                {fmtINR(grandDuty)}
              </span>
            </div>
            {hasIndicative && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", marginTop: 6 }}>
                * Figures marked est.* are indicative — verify against current CBIC tariff before filing.
              </div>
            )}
          </div>

          {/* Declaration */}
          <div style={{ padding: "12px 14px", background: T.wash }}>
            <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.6, marginBottom: 12 }}>
              I/We Certify that the above entries are correct. I/We further declare that wherever
              the RSP is applicable same has been truthfully declared.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <div>
                <div style={{ color: T.muted, fontSize: 10, marginBottom: 20 }}>CHA Name</div>
                <div style={{ fontWeight: 600 }}>{loadProfile().firmName || "—"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: T.muted, fontSize: 10, marginBottom: 20 }}>Importer Name</div>
                <div style={{ fontWeight: 600 }}>{fmt(filing.iecResult?.name)}</div>
              </div>
            </div>
            <div style={{ fontSize: 9, color: T.amber, marginTop: 10 }}>
              * Duty marked est.* is indicative — verify against current CBIC tariff before filing.
            </div>
          </div>
        </div>
        </div>{/* end dimming wrapper */}
      </div>

      <div style={G.foot}>
        <button style={{ ...G.btn(), ...G.btnBack }} onClick={onBack}>← Back</button>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ ...G.btn(), ...G.btnAmber }} onClick={exportPDF}
            disabled={discBlocked} title={discBlocked ? "Acknowledge discrepancies first" : ""}>
            ⬇ Download PDF
          </button>
          <button style={{ ...G.btn(), ...G.btnBack }} onClick={onHome}>New Filing</button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
const INITIAL = { iec: "", iecResult: null, iecProceeded: false,
  blData: {}, invoices: [], classified: false, docs: {}, status: "draft" };

// ── SHIPPING BILL FLOW ────────────────────────────────────────────────────────

const SB_STEPS = ["IEC", "New / Recent", "SB / AWB", "Invoices", "Classify", "Benefits", "Checklist"];
const SB_INITIAL = { id: Date.now().toString(), type: "SB" };

function SBProgress({ step, onNavigate }) {
  return (
    <div style={G.prog}>
      {SB_STEPS.map((s, i) => {
        const n = i + 1;
        const st = n < step ? "done" : n === step ? "active" : "pending";
        const canTap = onNavigate && n < step;
        return (
          <div key={s} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
            <div style={{ ...G.stepWrap, cursor: canTap ? "pointer" : "default" }}
              onClick={() => canTap && onNavigate(n)}>
              <div style={G.circle(st)}>{n < step ? "✓" : n}</div>
              <div style={G.stepLabel(st)}>{s}</div>
            </div>
            {i < SB_STEPS.length - 1 && <div style={G.conn(n < step)} />}
          </div>
        );
      })}
    </div>
  );
}

// SB Screen 1 — IEC & Export Eligibility Check
function SB1_IEC({ filing, update, onNext, onBack, onNavigate }) {
  const [iec, setIec] = useState(filing.iec || "");
  const [result, setResult] = useState(filing.iecResult || null);
  const [checking, setChecking] = useState(false);
  const [proceeded, setProceeded] = useState(filing.iecProceeded || false);
  const [manual, setManual] = useState(filing.iecManual || { name: "", gstin: "", adCode: "" });
  const [showManual, setShowManual] = useState(false);
  const [overrideText, setOverrideText] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  const check = async () => {
    if (!iec.trim()) return;
    setChecking(true);
    try {
      if (isSupabaseConfigured() && _currentUser) {
        const dirEntry = await lookupIec(iec.trim());
        if (dirEntry) {
          setResult({
            name: dirEntry.name, gstin: dirEntry.gstin || "", adCode: dirEntry.ad_code || "",
            status: "Active", rodtep: "Unknown",
            epcg: { active: dirEntry.epcg_active, licNo: dirEntry.epcg_lic },
            _meta: { source: "Your client directory", confidence: "curated" },
          });
          setChecking(false);
          return;
        }
      }
      const r = await fetch("/api/iec", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iec: iec.trim() }),
      });
      const d = await safeJson(r);
      if (d.found && d.record) {
        const rec = d.record;
        setResult({
          name: rec.name, gstin: rec.gstin, adCode: rec.adCode,
          status: rec.status,
          rodtep: rec.rodtepRegistered ? "Registered" : "Not registered",
          epcg: rec.epcg?.active
            ? { active: true, licNo: rec.epcg.licNo, total: rec.epcg.totalObligation, balance: rec.epcg.balance }
            : { active: false },
          drawbackPending: false,
          _meta: d.meta,
        });
      } else {
        setResult({ notFound: true, error: d.error || "IEC not found.", _meta: d.meta });
      }
    } catch (e) {
      setResult({ notFound: true, error: `Could not reach the IEC service: ${e.message}` });
    }
    setChecking(false);
  };

  return (
    <div style={G.body}>
      <Header />
      <SBProgress step={1} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Exporter IEC</div>
        <div style={G.sub}>Enter the IEC to load the exporter profile and check export eligibility.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input style={{ ...G.input, flex: 1 }} value={iec}
            onChange={e => setIec(e.target.value.toUpperCase().slice(0, 10))}
            placeholder="10-digit IEC" />
          <button style={{ ...G.btn(), ...G.btnAmber, whiteSpace: "nowrap" }}
            onClick={check} disabled={checking}>
            {checking ? "Checking…" : "Check →"}
          </button>
        </div>
        {result && result.notFound && (
          <div style={{ ...G.card(T.amber) }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>IEC not found in registry</div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 4 }}>
              Live DGFT lookup isn't connected yet. Enter the exporter's details manually
              below and proceed — the entry is recorded against this filing.
            </div>
            {result._meta && (
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 12,
                padding: "5px 8px", background: T.wash, borderRadius: 6 }}>
                Source: {result._meta.source}
              </div>
            )}
            {!showManual ? (
              <button style={{ ...G.btn(), ...G.btnAmber, width: "100%", padding: "10px 0" }}
                onClick={() => setShowManual(true)}>
                Enter exporter details manually &rarr;
              </button>
            ) : (
              <div style={{ background: "#fff", border: `1px solid ${T.line}`,
                borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
                  textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
                  Manual exporter entry
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={G.label}>Exporter / Consignor name *</label>
                  <input style={G.input} value={manual.name}
                    onChange={e => setManual(m => ({ ...m, name: e.target.value }))}
                    placeholder="Legal name as on IEC" />
                </div>
                <div style={G.row2}>
                  <div>
                    <label style={G.label}>GSTIN</label>
                    <input style={G.input} value={manual.gstin}
                      onChange={e => setManual(m => ({ ...m, gstin: e.target.value.toUpperCase() }))}
                      placeholder="Optional" />
                  </div>
                  <div>
                    <label style={G.label}>AD Code</label>
                    <input style={G.input} value={manual.adCode}
                      onChange={e => setManual(m => ({ ...m, adCode: e.target.value }))}
                      placeholder="Optional" />
                  </div>
                </div>
                <button style={{ ...G.btn(), ...G.btnAmber, width: "100%",
                  padding: "10px 0", marginTop: 12,
                  opacity: manual.name.trim() ? 1 : 0.5 }}
                  disabled={!manual.name.trim()}
                  onClick={() => {
                    const rec = {
                      name: manual.name.trim(), gstin: manual.gstin.trim(),
                      adCode: manual.adCode.trim(), status: "Manual entry",
                      rodtep: "Unknown", epcg: { active: false },
                      _meta: { source: "Manual CHA entry", confidence: "manual" },
                      _manual: true,
                    };
                    setResult(rec);
                    setProceeded(true);
                    update({ iec, iecResult: rec, iecProceeded: true, iecManual: manual });
                    const remember = window.confirm(
                      `Save "${manual.name.trim()}" to your client directory? Next time this IEC will be found instantly.`
                    );
                    if (remember) {
                      if (isSupabaseConfigured() && _currentUser) {
                        saveIec(_currentUser.id, {
                          iec: iec.trim(), name: manual.name.trim(),
                          gstin: manual.gstin.trim(), adCode: manual.adCode.trim(),
                        }).catch(() => {});
                      } else {
                        try {
                          const list = JSON.parse(localStorage.getItem("iecDirectory") || "[]");
                          list.push({ iec: iec.trim().toUpperCase(), name: manual.name.trim(),
                            gstin: manual.gstin.trim(), ad_code: manual.adCode.trim() });
                          localStorage.setItem("iecDirectory", JSON.stringify(list));
                        } catch {}
                      }
                    }
                    onNext();
                  }}>
                  Confirm &amp; Continue &rarr;
                </button>
              </div>
            )}
          </div>
        )}
        {result && !result.notFound && !proceeded && (
          <div>
            <div style={{ ...G.card(T.green) }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{result.name}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={G.badge("ok")}>{result.status}</span>
                  {result._meta && (
                    <span style={G.badge(result._meta.confidence === "verified" ? "ok" : "info")}>
                      {result._meta.confidence === "verified" ? "Live DGFT" : "Curated"}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
                <div style={{ color: T.muted }}>IEC <span style={{ color: T.ink, fontWeight: 600 }}>{iec}</span></div>
                <div style={{ color: T.muted }}>GSTIN <span style={{ color: T.ink, fontWeight: 600 }}>{result.gstin}</span></div>
                <div style={{ color: T.muted }}>AD Code <span style={{ color: T.ink, fontWeight: 600 }}>{result.adCode}</span></div>
                <div style={{ color: T.muted }}>RODTEP <span style={{ color: T.green, fontWeight: 600 }}>{result.rodtep}</span></div>
              </div>
            </div>
            {result.epcg?.active && (
              <div style={{ background: "#FEF9C3", border: "1px solid #FDE68A",
                borderRadius: 10, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>
                  ⚠ EPCG Authorisation active
                </div>
                <div style={{ fontSize: 11, color: "#78350F", lineHeight: 1.5 }}>
                  Licence {result.epcg.licNo} · Total obligation ₹{result.epcg.total} · Balance ₹{result.epcg.balance}.
                  Verify whether goods being exported fulfil the export obligation.
                </div>
                {!showOverride ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ ...G.btn(), ...G.btnAmber, fontSize: 12, padding: "7px 14px" }}
                      onClick={() => setShowOverride(true)}>Override with reason</button>
                    <button style={{ ...G.btn(), ...G.btnBack, fontSize: 12, padding: "7px 14px" }}
                      onClick={onBack}>Hold filing</button>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <input style={{ ...G.input, marginBottom: 8 }} value={overrideText}
                      onChange={e => setOverrideText(e.target.value)}
                      placeholder="State reason for proceeding despite EPCG flag" />
                    <button style={{ ...G.btn(), ...G.btnAmber, fontSize: 12 }}
                      onClick={() => {
                        update({ iec, iecResult: result, iecProceeded: true,
                          iecOverride: { reason: overrideText, at: new Date().toISOString() } });
                        setProceeded(true);
                        onNext();
                      }} disabled={!overrideText.trim()}>
                      Confirm & Continue →
                    </button>
                  </div>
                )}
              </div>
            )}
            {!result.epcg?.active && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button style={{ ...G.btn(), ...G.btnNav }}
                  onClick={() => { update({ iec, iecResult: result, iecProceeded: true }); onNext(); }}>
                  Save & Continue →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <Foot onBack={onBack} onNext={null} nextLabel={null}
        nextStyle={G.btnNav} disabled={true} />
    </div>
  );
}

// SB Screen 2 — New SB or Recent Filings
function SB2_NewOrRecent({ filing, onNewSB, onLoadFiling, onBack, onNavigate }) {
  const recent = DB.byIec(filing.iec).filter(f => f.type === "SB");
  return (
    <div style={G.body}>
      <Header />
      <SBProgress step={2} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>New or recent?</div>
        <div style={G.sub}>
          Start a fresh Shipping Bill or continue a saved filing for{" "}
          {filing.iecResult?.name || filing.iec}.
        </div>
        <div onClick={onNewSB}
          style={{ ...G.card(), cursor: "pointer", display: "flex",
            justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>+ New Shipping Bill</div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Begin a fresh filing</div>
          </div>
          <span style={G.badge("warn")}>Export</span>
        </div>
        {recent.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>
              Recent filings — this IEC
            </div>
            {recent.map(f => (
              <div key={f.id} onClick={() => onLoadFiling(f)}
                style={{ ...G.card(), cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {f.sbData?.awbNumber || "AWB —"}
                  </div>
                  <span style={G.badge(f.status === "complete" ? "ok" : "warn")}>
                    {f.status === "complete" ? "Complete" : "Draft"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
                  {(f.invoices || []).length} invoice(s) · Saved {new Date(f.savedAt).toLocaleDateString("en-IN")}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <Foot onBack={onBack} onNext={onNewSB} nextLabel="New Shipping Bill" nextStyle={G.btnAmber} />
    </div>
  );
}

// SB Screen 3 — SB & AWB Details
function SB3_SB({ filing, update, onNext, onBack, onNavigate }) {
  const [sbData, setSbData] = useState(filing.sbData || {});
  const [loading, setLoading] = useState(false);
  const setF = (k, v) => setSbData(p => ({ ...p, [k]: v }));

  const doExtract = async (payload) => {
    const name = payload.name;
    setLoading(true);
    try {
      const r = await fetch("/api/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: extractBody(payload),
      });
      const d = await safeJson(r);
      if (d.data) {
        const x = d.data;
        setSbData(p => ({
          ...p,
          awbNumber:     x.blAwbNumber     || x.awbNumber     || p.awbNumber     || "",
          awbDate:       x.blAwbDate       || x.awbDate       || p.awbDate       || "",
          portOfExport:  x.portOfDischarge || x.portOfExport  || p.portOfExport  || "",
          destination:   x.countryOfOrigin || x.destination   || p.destination   || "",
          fobValue:      x.totalInvoiceValue || p.fobValue    || "",
          currency:      x.currency        || p.currency      || "USD",
          incoterm:      x.incoterm        || p.incoterm      || "",
          carrier:       x.vessel          || p.carrier       || "",
          consignor:     x.consignorName   || p.consignor     || "",
          consignee:     x.consigneeName   || p.consignee     || "",
          _file: name,
        }));
      }
    } catch {}
    setLoading(false);
  };



  return (
    <div style={G.body}>
      <Header />
      <SBProgress step={3} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>SB & AWB details</div>
        <div style={G.sub}>Upload the airway bill or courier manifest — AI fills the fields. Edit anything.</div>
        {sbData._aiExtracted && (
          <div style={{ padding: "9px 12px", background: "#DBEAFE",
            border: "1px solid #93C5FD", borderRadius: 8, fontSize: 12,
            color: T.blue, marginBottom: 12, display: "flex", gap: 8 }}>
            <span>ⓘ</span>
            <span>Fields filled by AI — please verify each one before continuing.</span>
          </div>
        )}
        <UploadZone label="Upload AWB / manifest" sub="PDF, image, or photograph the pages"
          onFile={doExtract} onPages={doExtract} multiPage loading={loading} />
        <div style={{ textAlign: "center", fontSize: 12, color: T.muted,
          margin: "-8px 0 12px", fontStyle: "italic" }}>or enter manually</div>
        <div style={G.row2}>
          <SbField label="AWB No." value={sbData["awbNumber"]} onChange={v => setF("awbNumber", v)} placeholder="e.g. 1234-5678" />
          <SbField label="AWB Date" value={sbData["awbDate"]} onChange={v => setF("awbDate", v)} placeholder="DD MMM YYYY" />
        </div>
        <div style={G.row2}>
          <SbField label="Port of Export" value={sbData["portOfExport"]} onChange={v => setF("portOfExport", v)} placeholder="e.g. INCCU4 — Kolkata" />
          <SbField label="Country of Destination" value={sbData["destination"]} onChange={v => setF("destination", v)} placeholder="e.g. Japan" />
        </div>
        <SbField label="Exporter / Consignor" value={sbData["consignor"]} onChange={v => setF("consignor", v)} placeholder="Legal name as on IEC" />
        <SbField label="Consignee" value={sbData["consignee"]} onChange={v => setF("consignee", v)} placeholder="" />
        <div style={G.row2}>
          <SbField label="FOB Value" value={sbData["fobValue"]} onChange={v => setF("fobValue", v)} placeholder="e.g. 14250" />
          <SbField label="Currency" value={sbData["currency"]} onChange={v => setF("currency", v)} placeholder="USD" />
        </div>
        <div style={G.row2}>
          <SbField label="Incoterm" value={sbData["incoterm"]} onChange={v => setF("incoterm", v)} placeholder="FOB / CIF / EXW" />
          <SbField label="Carrier / Airline" value={sbData["carrier"]} onChange={v => setF("carrier", v)} placeholder="Optional" />
        </div>
        <div style={G.row2}>
          <SbField label="ARE-1 No. (if any)" value={sbData["are1"]} onChange={v => setF("are1", v)} placeholder="Optional" />
          <SbField label="LEO Date (if known)" value={sbData["leoDate"]} onChange={v => setF("leoDate", v)} placeholder="Optional" />
        </div>
        <div style={G.row2}>
          <SbField label="DBK Serial No. (AIR 77/2023)" value={sbData["dbkSerial"]}
            onChange={v => setF("dbkSerial", v)} placeholder="e.g. 8401 — from Drawback Schedule" />
          <SbField label="RoDTEP Entry No. (App. 4R)" value={sbData["rodtepEntry"]}
            onChange={v => setF("rodtepEntry", v)} placeholder="e.g. 4321 — from Appendix 4R" />
        </div>
        <div style={{ background: "#FEF9C3", border: "1px solid #FDE68A", borderRadius: 8,
          padding: "9px 12px", fontSize: 11, color: "#92400E" }}>
          ⚠ DBK and RoDTEP serial/entry numbers must match the exact tariff item in the
          respective schedules — customs auto-rejects mismatched numbers at LEO.
        </div>
        <div style={{ height: 8 }} />
      </div>
      <Foot onBack={onBack} onNext={() => { update({ sbData }); onNext(); }} />
    </div>
  );
}

// SB Screen 4 — Invoices (reuse same invoice engine as BE)
function SB4_Invoices({ filing, update, onNext, onBack, onNavigate }) {
  const [invoices, setInvoices] = useState(filing.invoices || []);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const startCountdown = (seconds, thenFn) => {
    setCountdown(seconds);
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(iv); setCountdown(0); if (thenFn) thenFn(); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const doExtract = async (payload, isRetry = false) => {
    const name = payload.name;
    setLoading(true); setUploadError("");
    try {
      const r = await fetch("/api/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: extractBody(payload),
      });
      const d = await safeJson(r);
      if (d.error) {
        if (d.error.includes("rate limit") || d.error.includes("429")) {
          setLoading(false);
          if (!isRetry) {
            setUploadError("Rate limit reached — retrying automatically in 60 seconds.");
            startCountdown(60, () => doExtract(payload, true));
          } else { setUploadError("Still rate-limited. Please wait 1–2 minutes then try again."); }
          return;
        }
        setUploadError(d.error); setLoading(false); return;
      }
      if (!d.data) {
        setUploadError("Could not read invoice. Try a clearer scan or PDF.");
        setLoading(false); return;
      }
      const x = d.data;
      if (x.invoices?.length > 0) {
        setInvoices(p => [...p, ...x.invoices.map(inv => ({
          invoiceNumber: inv.invoiceNumber || "", invoiceDate: inv.invoiceDate || "",
          shipperName: inv.shipperName || inv.consignorName || "",
          shipperAddress: inv.shipperAddress || inv.consignorAddress || "",
          currency: inv.currency || "", incoterm: inv.incoterm || "",
          invoiceValue: inv.invoiceValue || "", _file: name,
          lineItems: (inv.lineItems || []).map((li, i) => ({
            srNo: li.srNo || String(i + 1), description: li.description || "",
            quantity: li.quantity || "", unit: li.unit || "",
            unitPrice: li.unitPrice || "", amount: li.amount || "", hsCode: li.hsCode || "",
          })),
        }))]);
        setLoading(false); return;
      }
      if (x.lineItems?.length > 0) {
        setInvoices(p => [...p, {
          invoiceNumber: x.invoiceNumber || name, invoiceDate: x.invoiceDate || "",
          shipperName: x.consignorName || x.shipperName || "",
          shipperAddress: x.consignorAddress || x.shipperAddress || "",
          currency: x.currency || "", incoterm: x.incoterm || "",
          invoiceValue: x.invoiceValue || x.totalInvoiceValue || "", _file: name,
          lineItems: x.lineItems.map((li, i) => ({
            srNo: li.srNo || String(i + 1), description: li.description || "",
            quantity: li.quantity || "", unit: li.unit || "",
            unitPrice: li.unitPrice || "", amount: li.amount || "", hsCode: li.hsCode || "",
          })),
        }]);
        setLoading(false); return;
      }
      setUploadError("No invoice line items found. Add manually below.");
    } catch (e) { setUploadError(`Upload failed: ${e.message}`); }
    setLoading(false);
  };

  const onUpload = (payload) => doExtract(payload);
  const updateField = (ii, k, v) =>
    setInvoices(p => p.map((inv, i) => i === ii ? { ...inv, [k]: v } : inv));
  const updateItem = (ii, ki, k, v) =>
    setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
      ...inv, lineItems: inv.lineItems.map((li, j) => j !== ki ? li : { ...li, [k]: v })
    }));
  const removeInvoice = (ii) => setInvoices(p => p.filter((_, i) => i !== ii));

  const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
  const th = { padding: "7px 8px", fontSize: 10, fontWeight: 700, letterSpacing: ".05em",
    textTransform: "uppercase", color: T.muted, borderBottom: `1px solid ${T.line}`,
    background: T.wash, textAlign: "left" };
  const td = { padding: "8px", borderBottom: `1px solid ${T.line}`, verticalAlign: "top" };
  const tdinput = { width: "100%", border: "none", outline: "none", fontSize: 12,
    fontFamily: "'Inter',sans-serif", background: "transparent", color: T.ink };

  return (
    <div style={G.body}>
      <Header />
      <SBProgress step={4} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Export invoices</div>
        <div style={G.sub}>Upload each commercial invoice. AI extracts item descriptions, quantities, and values.</div>
        <UploadZone label="Upload Invoice(s)" sub="Multiple invoices allowed · PDF, image, or photo"
          onFile={onUpload} onPages={onUpload} multiPage loading={loading || countdown > 0} />
        {(uploadError || countdown > 0) && (
          <div style={{ padding: "10px 14px",
            background: countdown > 0 ? "#DBEAFE" : "#FEF2F2",
            border: `1px solid ${countdown > 0 ? "#93C5FD" : "#FECACA"}`,
            borderRadius: 8, fontSize: 12, color: countdown > 0 ? T.blue : T.red, marginBottom: 12 }}>
            {countdown > 0 ? `⏳ Retrying in ${countdown}s…` : uploadError}
          </div>
        )}
        <button onClick={() => setInvoices(p => [...p, {
          invoiceNumber: "", invoiceDate: "", shipperName: "", shipperAddress: "",
          currency: "USD", incoterm: "", invoiceValue: "", _file: "manual",
          lineItems: [{ srNo: "1", description: "", quantity: "", unit: "", unitPrice: "", amount: "", hsCode: "" }],
        }])} style={{ width: "100%", padding: "10px 0", marginBottom: 16, background: T.paper,
          border: `1px dashed ${T.line}`, borderRadius: 8, fontSize: 13, fontWeight: 600,
          color: T.muted, cursor: "pointer" }}>
          + Add Invoice Manually
        </button>
        {invoices.map((inv, ii) => (
          <div key={ii} style={{ ...G.card(T.navy), padding: 0, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "10px 14px", background: T.wash,
              borderBottom: `1px solid ${T.line}`, display: "flex",
              justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Invoice {ii + 1} of {invoices.length}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={G.badge("ok")}>Extracted</span>
                <button onClick={() => removeInvoice(ii)}
                  style={{ fontSize: 11, color: T.red, background: "none", border: "none", cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div style={G.row2}>
                <Field label="Invoice No." value={inv.invoiceNumber}
                  onChange={v => updateField(ii, "invoiceNumber", v)} />
                <Field label="Invoice Date" value={inv.invoiceDate}
                  onChange={v => updateField(ii, "invoiceDate", v)} />
              </div>
              <Field label="Exporter Name" value={inv.shipperName}
                onChange={v => updateField(ii, "shipperName", v)} />
              <div style={G.row2}>
                <Field label="Currency" value={inv.currency}
                  onChange={v => updateField(ii, "currency", v)} />
                <Field label="Incoterm" value={inv.incoterm}
                  onChange={v => updateField(ii, "incoterm", v)} />
                <div style={G.row2}>
                  <Field label="Freight (export)" value={inv.freight}
                    onChange={v => updateField(ii, "freight", v)} placeholder="Optional" />
                  <Field label="Insurance" value={inv.insurance}
                    onChange={v => updateField(ii, "insurance", v)} placeholder="Optional" />
                </div>
              </div>
              <Field label="Invoice Value" value={inv.invoiceValue}
                onChange={v => updateField(ii, "invoiceValue", v)} />
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>Line Items</div>
              <div style={{ overflowX: "auto" }}>
                <table style={tbl}>
                  <thead>
                    <tr>{["#", "Description", "Qty", "Unit", "Rate", "Amount"].map(h =>
                      <th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {(inv.lineItems || []).map((li, ki) => (
                      <tr key={ki}>
                        <td style={td}>{ki + 1}</td>
                        <td style={{ ...td, minWidth: 160 }}>
                          <input style={tdinput} value={li.description || ""}
                            onChange={e => updateItem(ii, ki, "description", e.target.value)} />
                        </td>
                        <td style={td}><input style={{ ...tdinput, width: 50 }} value={li.quantity || ""}
                          onChange={e => updateItem(ii, ki, "quantity", e.target.value)} /></td>
                        <td style={td}><input style={{ ...tdinput, width: 40 }} value={li.unit || ""}
                          onChange={e => updateItem(ii, ki, "unit", e.target.value)} /></td>
                        <td style={td}><input style={{ ...tdinput, width: 60 }} value={li.unitPrice || ""}
                          onChange={e => updateItem(ii, ki, "unitPrice", e.target.value)} /></td>
                        <td style={td}><input style={{ ...tdinput, width: 60 }} value={li.amount || ""}
                          onChange={e => updateItem(ii, ki, "amount", e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ padding: "8px 14px 14px" }}>
              <button onClick={() => setInvoices(p => p.map((inv, i) => i !== ii ? inv : {
                ...inv, lineItems: [...(inv.lineItems || []),
                  { srNo: String((inv.lineItems || []).length + 1), description: "",
                    quantity: "", unit: "", unitPrice: "", amount: "", hsCode: "" }]
              }))} style={{ fontSize: 12, fontWeight: 600, color: T.amber,
                background: "none", border: "none", cursor: "pointer" }}>
                + Add Item Row
              </button>
            </div>
          </div>
        ))}
      </div>
      <Foot onBack={onBack} onNext={() => { update({ invoices }); onNext(); }}
        disabled={invoices.length === 0} />
    </div>
  );
}

// SB Screen 5 — Classification (same engine, export context)
function SB5_Classify({ filing, update, onNext, onBack, onNavigate }) {
  const invoices = filing.invoices || [];
  const [classifying, setClassifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  // ── Previous SB reference ──
  const [refItems, setRefItems] = useState(filing.referenceItems || []);
  const [refDoc, setRefDoc] = useState(filing.referenceDoc || null);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState("");
  const uploadReference = async (payload) => {
    const name = payload.name;
    setRefLoading(true); setRefError("");
    try {
      const r = await fetch("/api/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: extractBody(payload, { mode: "reference" }),
      });
      const d = await safeJson(r);
      if (d.error) { setRefError(d.error); setRefLoading(false); return; }
      const items = d.data?.referenceItems || [];
      if (!items.length) {
        setRefError("No classified items found. Is this a filed Shipping Bill or checklist?");
        setRefLoading(false); return;
      }
      setRefItems(prev => [...prev, ...items]);
      setRefDoc({ name, beNumber: d.data?.beNumber || "", count: items.length });
      update({ referenceItems: [...refItems, ...items],
        referenceDoc: { name, beNumber: d.data?.beNumber || "", count: items.length } });
    } catch (e) { setRefError(`Upload failed: ${e.message}`); }
    setRefLoading(false);
  };
  const [invState, setInvState] = useState(
    invoices.map(inv => ({
      ...inv,
      lineItems: (inv.lineItems || []).map(li => ({ ...li, accepted: !!li.proposedCth })),
    }))
  );
  const hasRun = useRef(false);

  const [batchProgress, setBatchProgress] = useState(null); // { done, total }

  const runClassify = useCallback(async (isRetry = false) => {
    const allItems = invState.flatMap((inv, ii) =>
      (inv.lineItems || []).map((li, ki) => ({
        invIdx: ii, itemIdx: ki,
        description: li.description, hsCode: li.hsCode,
      }))
    );
    if (!allItems.length) return;
    setClassifying(true); setError("");

    // ── Batch into chunks of 5 items ──────────────────────────────────────
    // Reduces blast radius of any single network failure — a dropped connection
    // loses one small batch instead of the entire classification run, and each
    // batch completes faster, well within Vercel's 45s function limit even for
    // large invoices with 20+ line items.
    const CHUNK_SIZE = 5;
    const chunks = [];
    for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
      chunks.push(allItems.slice(i, i + CHUNK_SIZE));
    }
    setBatchProgress({ done: 0, total: chunks.length });

    const allResults = new Array(allItems.length).fill(null);
    let rateLimited = false;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkOffset = ci * CHUNK_SIZE;
      let chunkSucceeded = false;
      // Up to 2 attempts per chunk before giving up on that chunk only
      for (let attempt = 0; attempt < 2 && !chunkSucceeded; attempt++) {
        try {
          const r = await fetch("/api/classify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: chunk.map(c => ({ description: c.description, hsCode: c.hsCode })),
              referenceItems: (filing.referenceItems || []),
            }),
          });
          const d = await safeJson(r);
          if (d.error) {
            if (d.error.includes("429") || d.error.includes("rate")) {
              rateLimited = true;
              if (attempt === 0) { await new Promise(res => setTimeout(res, 4000)); continue; }
            }
            // Non-rate error on this chunk — move on, leave these items unclassified
            break;
          }
          if (d.classifications?.length) {
            d.classifications.forEach((c, idx) => { allResults[chunkOffset + idx] = c; });
            chunkSucceeded = true;
          }
        } catch (e) {
          // Network error on this chunk — retry once, then move on
          if (attempt === 0) { await new Promise(res => setTimeout(res, 2000)); continue; }
        }
      }
      setBatchProgress({ done: ci + 1, total: chunks.length });
    }

    // Apply whatever results we got — partial success is still useful,
    // unlike an all-or-nothing single request that fails completely on one glitch.
    setInvState(prev => {
      const next = prev.map(inv => ({
        ...inv,
        lineItems: inv.lineItems.map(li => ({ ...li })),
      }));
      allResults.forEach((c, idx) => {
        if (!c || !c.proposedCth) return;
        const { invIdx, itemIdx } = allItems[idx] || {};
        if (invIdx !== undefined && next[invIdx]?.lineItems[itemIdx]) {
          next[invIdx].lineItems[itemIdx].proposedCth = c.proposedCth;
          next[invIdx].lineItems[itemIdx].cthDesc = stripMd(c.headingDescription || "");
          next[invIdx].lineItems[itemIdx].reasoning = stripMd(c.reasoning || "");
          next[invIdx].lineItems[itemIdx].confidence = c.confidence;
        }
      });
      return next;
    });

    const unclassifiedCount = allResults.filter(r => !r || !r.proposedCth).length;
    if (unclassifiedCount > 0 && unclassifiedCount < allItems.length) {
      setError(`${unclassifiedCount} of ${allItems.length} items could not be classified — enter CTH manually for those, or tap Re-classify.`);
    } else if (unclassifiedCount === allItems.length) {
      setError(rateLimited
        ? "Gemini rate limit reached. Wait a moment and tap Re-classify."
        : "Classification failed for all items. Check your connection and tap Re-classify.");
    }

    setBatchProgress(null);
    setClassifying(false);
  }, [invState, filing.referenceItems]);

  useEffect(() => {
    if (!hasRun.current && invState.some(inv => inv.lineItems.some(li => !li.proposedCth))) {
      hasRun.current = true;
      const t = setTimeout(() => runClassify(), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = (ii, ki) => setInvState(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.map((li, j) => j !== ki ? li : { ...li, accepted: true })
  }));
  const setCth = (ii, ki, v) => setInvState(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.map((li, j) => j !== ki ? li : { ...li, proposedCth: v })
  }));
  const setSbDesc = (ii, ki, v) => setInvState(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.map((li, j) => j !== ki ? li : { ...li, description: v, accepted: false })
  }));
  const addSbItem = (ii) => setInvState(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: [...inv.lineItems, {
      srNo: String(inv.lineItems.length + 1), description: "", quantity: "1", unit: "NOS",
      proposedCth: "", accepted: false,
    }]
  }));
  const removeSbItem = (ii, ki) => setInvState(p => p.map((inv, i) => i !== ii ? inv : {
    ...inv, lineItems: inv.lineItems.filter((_, j) => j !== ki)
  }));
  const classifyOneSB = async (ii, ki) => {
    const li = invState[ii]?.lineItems[ki];
    if (!li?.description?.trim()) return;
    setInvState(p => p.map((inv, i) => i !== ii ? inv : ({
      ...inv, lineItems: inv.lineItems.map((l, j) => j !== ki ? l : { ...l, classifyingOne: true })
    })));
    try {
      const r = await fetch("/api/classify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ description: li.description }], referenceItems: (filing.referenceItems || []) }),
      });
      const d = await safeJson(r);
      const c = d.classifications?.[0];
      setInvState(p => p.map((inv, i) => i !== ii ? inv : ({
        ...inv, lineItems: inv.lineItems.map((l, j) => j !== ki ? l : {
          ...l, classifyingOne: false,
          proposedCth: c?.proposedCth || l.proposedCth || "",
          cthDesc: c?.headingDescription || "No result",
          reasoning: c?.reasoning || "",
          confidence: c?.confidence || "",
        })
      })));
    } catch {
      setInvState(p => p.map((inv, i) => i !== ii ? inv : ({
        ...inv, lineItems: inv.lineItems.map((l, j) => j !== ki ? l : { ...l, classifyingOne: false })
      })));
    }
  };

  const confBadge = (c) => c === "High" ? "ok" : c === "Medium" ? "warn" : "err";
  const sbBadge = (cth) => {
    const ch = (cth || "").slice(0, 2);
    const rodtepChapters = ["84","85","90","91","73","76","39","72"];
    return rodtepChapters.includes(ch) ? "RODTEP eligible (chapter-level indicative)" : null;
  };

  return (
    <div style={G.body}>
      <Header />
      <SBProgress step={5} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Classify export items</div>
        <div style={G.sub}>
          AI proposes CTH for each item. Tick to accept, or type to correct.
          Classification drives RODTEP and Drawback eligibility.
        </div>

        <ReferencePanel docLabel="Shipping Bill" refDoc={refDoc} refItems={refItems}
          refError={refError} refLoading={refLoading}
          onUpload={uploadReference}
          onClear={() => { setRefItems([]); setRefDoc(null); update({ referenceItems: [], referenceDoc: null }); }} />
        {classifying && (
          <div style={{ padding: "10px 14px", background: "#DBEAFE", border: "1px solid #93C5FD",
            borderRadius: 8, fontSize: 12, color: T.blue, marginBottom: 12 }}>
            {batchProgress
              ? `Classifying batch ${batchProgress.done} of ${batchProgress.total}…`
              : "Classifying items…"}
          </div>
        )}
        {error && !classifying && (
          <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 8, fontSize: 12, color: T.red, marginBottom: 12 }}>{error}</div>
        )}
        {invState.map((inv, ii) => (
          <div key={ii} style={{ ...G.card(T.navy), padding: 0, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "10px 14px", background: T.wash,
              borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                Invoice {ii + 1}{inv.invoiceNumber ? ` — ${inv.invoiceNumber}` : ""}
                <span style={{ fontWeight: 400, color: T.muted, marginLeft: 8 }}>
                  {inv.lineItems?.length || 0} items
                </span>
              </div>
            </div>
            {(inv.lineItems || []).map((li, ki) => (
              <div key={ki} style={{
                background: li.accepted ? "#F0FDF4" : T.paper,
                border: `1px solid ${li.accepted ? "#BBF7D0" : T.line}`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 10
              }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.muted,
                    textTransform: "uppercase", letterSpacing: ".06em" }}>
                    Item {ki + 1}
                  </div>
                  <button onClick={() => removeSbItem(ii, ki)}
                    style={{ fontSize: 11, color: T.red, background: "none",
                      border: "none", cursor: "pointer" }}>Remove</button>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={G.label}>Description</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={li.description || ""}
                      onChange={e => setSbDesc(ii, ki, e.target.value)}
                      placeholder="Type item description to classify…"
                      style={{ ...G.input, flex: 1, fontSize: 12 }} />
                    <button onClick={() => classifyOneSB(ii, ki)}
                      disabled={!li.description?.trim() || li.classifyingOne}
                      style={{ ...G.btn(), background: T.navy, color: "#fff",
                        fontSize: 11, padding: "7px 11px", whiteSpace: "nowrap",
                        opacity: (!li.description?.trim() || li.classifyingOne) ? 0.5 : 1 }}>
                      {li.classifyingOne ? "…" : "Classify →"}
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <label style={G.label}>CTH (8 digits)</label>
                    <input style={{ ...G.input, fontFamily: "monospace", fontWeight: 700, fontSize: 15, letterSpacing: 2 }}
                      value={li.proposedCth || ""}
                      onChange={e => setCth(ii, ki, e.target.value)}
                      placeholder="00000000" />
                    {li.cthDesc && (
                      <div style={{ fontSize: 10, color: li.accepted ? T.green : T.muted, marginTop: 3 }}>
                        {li.cthDesc}{li.confidence ? ` · ${li.confidence} confidence` : ""}
                      </div>
                    )}
                    {li.reasoning && !li.accepted && (
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 2, fontStyle: "italic", lineHeight: 1.4 }}>
                        {li.reasoning}
                      </div>
                    )}
                    {li.proposedCth && sbBadge(li.proposedCth) && (
                      <span style={{ ...G.badge("info"), marginTop: 4, display: "inline-block" }}>
                        {sbBadge(li.proposedCth)}
                      </span>
                    )}
                  </div>
                  <div style={{ flexShrink: 0, paddingTop: 18 }}>
                    <div style={G.tick(li.accepted)} onClick={() => accept(ii, ki)}>✓</div>
                  </div>
                </div>
                <DutyWaiverPanel
                  waiver={li.waiver}
                  onChange={w => setInvState(p => p.map((inv2, ii2) => ii2 !== ii ? inv2 : {
                    ...inv2, lineItems: inv2.lineItems.map((li2, ki2) => ki2 !== ki ? li2 : { ...li2, waiver: w })
                  }))} />
              </div>
            ))}
          </div>
        ))}
        {invState.map((inv, ii) => (
          <button key={ii} onClick={() => addSbItem(ii)}
            style={{ width: "100%", padding: "9px 0", background: T.paper,
              border: `1px dashed ${T.line}`, borderRadius: 8, fontSize: 12,
              fontWeight: 600, color: T.amber, cursor: "pointer", marginBottom: 16 }}>
            + Add item to invoice {ii + 1}
          </button>
        ))}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <button onClick={() => { hasRun.current = false; runClassify(); }}
            style={{ fontSize: 12, color: T.amber, background: "none", border: "none", cursor: "pointer" }}>
            ↺ Re-classify all
          </button>
        </div>
      </div>
      <Foot onBack={onBack} onNext={() => {
        const merged = invState.map(inv => ({
          ...inv,
          lineItems: inv.lineItems.map(li => ({ ...li })),
        }));
        update({ invoices: merged });
        onNext();
      }} />
    </div>
  );
}

// SB Screen 6 — Export Benefits & Documents
const RODTEP_RATES = {
  "84": { rate: 0.5, desc: "Machinery" },
  "85": { rate: 0.5, desc: "Electrical equipment" },
  "90": { rate: 0.6, desc: "Optical/precision instruments" },
  "91": { rate: 0.5, desc: "Clocks & watches" },
  "73": { rate: 0.5, desc: "Iron & steel articles" },
  "76": { rate: 0.5, desc: "Aluminium articles" },
  "39": { rate: 0.5, desc: "Plastics" },
  "72": { rate: 0.4, desc: "Iron & steel" },
};
const DRAWBACK_RATES = {
  "84": { rate: 1.0, cap: "₹80/kg", desc: "Machinery" },
  "85": { rate: 1.0, cap: "₹80/kg", desc: "Electrical equipment" },
  "90": { rate: 1.2, cap: "₹60/kg", desc: "Optical/precision instruments" },
  "91": { rate: 1.2, cap: "₹60/kg", desc: "Clocks & watches" },
  "73": { rate: 1.0, cap: "₹80/kg", desc: "Iron & steel articles" },
  "76": { rate: 0.8, cap: "₹60/kg", desc: "Aluminium articles" },
  "39": { rate: 0.9, cap: "₹50/kg", desc: "Plastics" },
  "72": { rate: 0.8, cap: "₹80/kg", desc: "Iron & steel" },
};

function SB6_Benefits({ filing, update, onNext, onBack, onNavigate }) {
  const invoices = filing.invoices || [];
  const sbData = filing.sbData || {};
  const { rate: exchRate, meta: exchMeta } = useExchangeRate("USD", "export");

  const parseAmt = (s) => parseFloat((s || "0").toString().replace(/[^0-9.]/g, "")) || 0;

  // Compute FOB total in INR
  const fobINR = invoices.reduce((s, inv) => s + parseAmt(inv.invoiceValue) * exchRate, 0);

  // Unique CTH chapters across all items
  const chapters = [...new Set(invoices.flatMap(inv =>
    (inv.lineItems || []).map(li => (li.proposedCth || "").slice(0, 2)).filter(Boolean)
  ))];

  const rodtepRate = chapters.length > 0
    ? Math.min(...chapters.map(ch => RODTEP_RATES[ch]?.rate || 0))
    : 0;
  const drawbackRate = chapters.length > 0
    ? Math.min(...chapters.map(ch => DRAWBACK_RATES[ch]?.rate || 0))
    : 0;
  const rodtepAmt = (fobINR * rodtepRate) / 100;
  const drawbackAmt = (fobINR * drawbackRate) / 100;

  const [claims, setClaims] = useState(filing.claims || { rodtep: true, drawback: false, epcg: false });
  const [docs, setDocs] = useState(filing.sbDocs || {});
  const [dbkSerial, setDbkSerial] = useState(filing.dbkSerial || filing.sbData?.dbkSerial || "");
  const [rodtepEntry, setRodtepEntry] = useState(filing.rodtepEntry || filing.sbData?.rodtepEntry || "");
  const [rodtepRateOvr, setRodtepRateOvr] = useState(filing.rodtepRateOvr || "");
  const [dbkRateOvr, setDbkRateOvr] = useState(filing.dbkRateOvr || "");
  const [commInvoices, setCommInvoices] = useState(filing.sbCommInvoices || []);
  const [tdsFiles, setTdsFiles] = useState(filing.sbTdsFiles || {});
  const [techWriteups, setTechWriteups] = useState(filing.sbTechWriteups || []);

  const toggleClaim = (k) => {
    setClaims(p => {
      const next = { ...p, [k]: !p[k] };
      // Mutual exclusion: can't claim both RODTEP and Drawback on same consignment
      if (k === "rodtep" && next.rodtep) next.drawback = false;
      if (k === "drawback" && next.drawback) next.rodtep = false;
      return next;
    });
  };

  const setDoc = (id, val) => setDocs(p => ({ ...p, [id]: val }));

  const DocRow = ({ id, name, req, waivable = true }) => {
    const d = docs[id] || {};
    const isUploaded = d.uploaded;
    const isWaived = d.waived;
    const [showWaive, setShowWaive] = useState(false);
    const [reason, setReason] = useState("");
    const fileRef = useRef();
    const camRef = useRef();
    return (
      <div style={{ padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
        <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) setDoc(id, { uploaded: true, fileName: f.name }); }} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0];
            if (f) setDoc(id, { uploaded: true, fileName: f.name || "photo.jpg" });
            e.target.value = ""; }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, paddingRight: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{req}</div>
            {isUploaded && d.fileName && <div style={{ fontSize: 10, color: T.green, marginTop: 2 }}>📎 {d.fileName}</div>}
          </div>
          {isWaived ? <span style={G.badge("warn")}>⊘ Waived</span>
            : isUploaded ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <span style={G.badge("ok")}>✓ Uploaded</span>
                <button style={{ fontSize: 10, color: T.muted, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => fileRef.current?.click()}>Replace</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: T.amber,
                    border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 6 }}
                    onClick={() => fileRef.current?.click()}>Upload</button>
                  <button style={{ fontSize: 12, fontWeight: 600, color: T.navy, background: "#fff",
                    border: `1px solid ${T.navy}`, cursor: "pointer", padding: "6px 10px", borderRadius: 6 }}
                    onClick={() => camRef.current?.click()}>📷</button>
                </div>
                {waivable && !showWaive && (
                  <button style={{ fontSize: 11, color: T.muted, textDecoration: "underline",
                    background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => setShowWaive(true)}>Waive</button>
                )}
              </div>
            )}
        </div>
        {showWaive && !isWaived && (
          <div style={{ marginTop: 8, padding: 10, background: T.wash,
            border: `1px solid ${T.line}`, borderRadius: 8 }}>
            <input style={{ ...G.input, marginBottom: 8 }} value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Reason for waiving (recorded against your licence)" />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...G.btn(), ...G.btnAmber, padding: "7px 14px", fontSize: 12 }}
                onClick={() => { setDoc(id, { waived: true, reason, waivedAt: new Date().toISOString() }); setShowWaive(false); }}>
                Confirm Waiver
              </button>
              <button style={{ ...G.btn(), ...G.btnBack, padding: "7px 14px", fontSize: 12 }}
                onClick={() => setShowWaive(false)}>Cancel</button>
            </div>
          </div>
        )}
        {isWaived && <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Reason: {d.reason} · {d.waivedAt ? new Date(d.waivedAt).toLocaleTimeString("en-IN") : ""}</div>}
      </div>
    );
  };

  const BenefitCard = ({ id, title, sub, rate, amount, badgeLabel, warning, disabled }) => (
    <div style={{ ...G.card(claims[id] ? T.blue : null),
      borderLeft: `3px solid ${claims[id] ? T.blue : T.line}`,
      opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      onClick={() => !disabled && toggleClaim(id)}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
          border: `2px solid ${claims[id] ? T.green : T.line}`,
          background: claims[id] ? T.green : T.paper, color: claims[id] ? "#fff" : T.muted,
        }}>✓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{sub}</div>
          {rate > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <span style={G.badge("info")}>{rate}% of FOB</span>
              {amount > 0 && <span style={G.badge("ok")}>Est. ₹{Math.round(amount).toLocaleString("en-IN")}</span>}
              {badgeLabel && <span style={G.badge("info")}>{badgeLabel}</span>}
            </div>
          )}
          {warning && (
            <div style={{ fontSize: 10, color: T.amber, marginTop: 5 }}>⚠ {warning}</div>
          )}
        </div>
      </div>
    </div>
  );

  const fmtINR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  return (
    <div style={G.body}>
      <Header />
      <SBProgress step={6} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Benefits & Documents</div>
        <div style={G.sub}>
          Confirm which export benefits to claim, then upload required documents.
          Every claim decision is logged.
        </div>

        {/* FOB summary */}
        <div style={{ ...G.card(), display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: T.muted }}>Total FOB (indicative)</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtINR(fobINR)}</div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: T.muted, margin: "16px 0 8px" }}>
          A — Export Benefit Claims
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
          Rates are indicative (AIR schedule). Tap to select or deselect. RODTEP and Drawback are mutually exclusive.
        </div>

        <BenefitCard id="rodtep" title="RODTEP"
          sub="Remission of Duties & Taxes on Exported Products"
          rate={rodtepRate} amount={rodtepAmt}
          badgeLabel={chapters.map(ch => `Ch.${ch}`).join(", ")}
          warning={claims.drawback ? "Cannot claim alongside Drawback — deselect Drawback first" : null} />

        <BenefitCard id="drawback" title="Duty Drawback"
          sub="All Industry Rate (AIR) Drawback Schedule 2023-24"
          rate={drawbackRate} amount={drawbackAmt}
          warning={claims.rodtep ? "Cannot claim alongside RODTEP — deselect RODTEP first" : null} />

        {filing.iecResult?.epcg?.active && (
          <BenefitCard id="epcg" title="EPCG — export against licence"
            sub={`Licence ${filing.iecResult.epcg.licNo} · Balance obligation ₹${filing.iecResult.epcg.balance}`}
            rate={0} amount={0} />
        )}

        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: T.muted, margin: "16px 0 8px" }}>
          B — Required Documents
        </div>

        {/* Commercial invoices — multi-file, one per invoice in the consignment */}
        <div style={G.card(T.navy)}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 2 }}>
            Commercial Invoices
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
            Upload one file per invoice — all invoices in this consignment.
            {invoices.length > 0 && ` ${invoices.length} invoice(s) declared in this filing.`}
          </div>
          <MultiFileRow
            label="Commercial Invoice"
            sub="PDF or image of the signed commercial invoice"
            files={commInvoices}
            onAdd={f => setCommInvoices(p => [...p, f])}
            onRemove={i => setCommInvoices(p => p.filter((_, idx) => idx !== i))}
          />
          <DocRow id="pl" name="Packing List" req="Mandatory for all exports" waivable={false} />
          <DocRow id="lut" name="GST LUT / Bond" req="For zero-rated export without payment of GST" />
          <DocRow id="are1" name="ARE-1 (if applicable)" req="Central Excise removal documentation" />
          <DocRow id="rcmc" name="RCMC (if applicable)" req="Registration-cum-Membership Certificate for export schemes" />
          <DocRow id="coo_exp" name="Certificate of Origin (if required by buyer)" req="As per importing country requirements" />
        </div>

        {/* TDS — per item, keyed by invoice + item index (same pattern as BE Screen 6) */}
        <div style={G.card(T.amber)}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 2 }}>
            Technical Data Sheet (TDS) — Per Item
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>
            Upload TDS per item where available. Each TDS is logged against the item and invoice.
          </div>
          {invoices.length === 0 && (
            <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>
              No invoice items found — complete Screens 4 & 5 first.
            </div>
          )}
          {invoices.map((inv, ii) => (
            <div key={ii} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, marginBottom: 6,
                padding: "5px 8px", background: T.wash, borderRadius: 6,
                border: `1px solid ${T.line}` }}>
                Invoice {ii + 1}{inv.invoiceNumber ? ` — ${inv.invoiceNumber}` : ""}
              </div>
              {(inv.lineItems || []).map((li, ki) => {
                const key = `inv${ii}_item${ki}`;
                const existing = tdsFiles[key] || [];
                return (
                  <div key={ki} style={{ marginBottom: 10, paddingLeft: 8,
                    borderLeft: `2px solid ${T.line}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
                      Item {ki + 1}: {li.description || "(no description)"}
                      {li.proposedCth && (
                        <span style={{ ...G.badge("info"), marginLeft: 8, fontSize: 9 }}>
                          CTH {li.proposedCth}
                        </span>
                      )}
                    </div>
                    <MultiFileRow
                      label="TDS"
                      sub={null}
                      files={existing}
                      onAdd={f => setTdsFiles(p => ({ ...p, [key]: [...(p[key] || []), f] }))}
                      onRemove={i => setTdsFiles(p => ({
                        ...p, [key]: (p[key] || []).filter((_, idx) => idx !== i)
                      }))}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Technical write-up — multi-file */}
        <div style={G.card(T.blue)}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 2 }}>
            Technical Write-up
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
            Upload any technical write-up, catalogue, or product brochure. Multiple files allowed.
          </div>
          <MultiFileRow
            label="Technical Write-up"
            sub="PDF · Catalogue, brochure, technical specification"
            files={techWriteups}
            onAdd={f => setTechWriteups(p => [...p, f])}
            onRemove={i => setTechWriteups(p => p.filter((_, idx) => idx !== i))}
          />
        </div>

        <div style={{ height: 20 }} />
      </div>
      <Foot onBack={onBack} onNext={() => {
        update({ claims, sbDocs: docs, sbCommInvoices: commInvoices,
          sbTdsFiles: tdsFiles, sbTechWriteups: techWriteups,
          dbkSerial, rodtepEntry, rodtepRateOvr, dbkRateOvr,
          rodtepAmt: claims.rodtep ? rodtepAmt : 0,
          drawbackAmt: claims.drawback ? drawbackAmt : 0,
          fobINR });
        onNext();
      }} />
    </div>
  );
}

// SB Screen 7 — Checklist
function SB7_Checklist({ filing, onBack, onHome, onNavigate }) {
  const invoices = filing.invoices || [];
  const sbData = filing.sbData || {};
  const claims = filing.claims || {};
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const { rate: exchRate, meta: exchMeta } = useExchangeRate("USD", "export");

  const parseAmt = (s) => parseFloat((s || "0").toString().replace(/[^0-9.]/g, "")) || 0;
  const fmtINR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const fmt = (v) => v && v !== "undefined" ? v : "—";

  const invTotals = invoices.map(inv => {
    const fob = parseAmt(inv.invoiceValue) * exchRate;
    return { fob };
  });
  const grandFob = invTotals.reduce((s, t) => s + t.fob, 0);

  const dbkSerial = filing.dbkSerial || "";
  const rodtepRateOvr = filing.rodtepRateOvr || "";
  const dbkRateOvr = filing.dbkRateOvr || "";
  const rodtepAmt = filing.rodtepAmt || 0;
  const drawbackAmt = filing.drawbackAmt || 0;
  const totalBenefit = rodtepAmt + drawbackAmt;

  const exportPDF = () => {
    const invHtml = invoices.map((inv, ii) => {
      const rows = (inv.lineItems || []).map((li, ki) => `<tr>
        <td>${ki + 1}</td>
        <td>${li.description || ""}</td>
        <td style="font-family:monospace;font-weight:600">${li.proposedCth || "—"}</td>
        <td>${li.quantity || ""} ${li.unit || ""}</td>
        <td>${inv.currency || ""} ${li.amount || ""}</td>
      </tr>`).join("");
      return `<div class="inv-block">
        <div class="inv-hdr">
          <strong>Invoice ${ii + 1} — ${inv.invoiceNumber || "—"} · ${inv.invoiceDate || ""}</strong><br>
          <span class="muted">${inv.shipperName || ""} · ${inv.currency || ""} ${inv.invoiceValue || ""} · ${inv.incoterm || ""}</span>
        </div>
        <table>
          <thead><tr><th>#</th><th>Description</th><th>CTH</th><th>Qty</th><th>Value</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="duty-block">
          <div class="duty-row total"><span>Invoice FOB (INR)</span><span>${fmtINR(invTotals[ii].fob)}</span></div>
        </div>
      </div>`;
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>SB Checklist</title>
<style>
body{font-family:Arial,sans-serif;font-size:11px;color:#141821;margin:28px;}
h1{font-size:15px;margin:0 0 2px;} .sub{font-size:10px;color:#6B7280;margin-bottom:12px;}
.hdr{text-align:center;border-bottom:2px solid #0A1628;padding-bottom:10px;margin-bottom:14px;}
table{width:100%;border-collapse:collapse;margin-bottom:4px;}
th{background:#0A1628;color:#fff;padding:5px 7px;font-size:9px;text-transform:uppercase;text-align:left;}
td{padding:5px 7px;border-bottom:1px solid #E7E9EE;vertical-align:top;}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:12px;}
.k{color:#6B7280;} .v{font-weight:600;}
.inv-block{margin-bottom:14px;border:1px solid #E7E9EE;border-radius:4px;overflow:hidden;}
.inv-hdr{background:#F8F9FB;padding:7px 10px;border-bottom:1px solid #E7E9EE;}
.muted{color:#6B7280;font-size:10px;}
.duty-block{padding:8px 10px;background:#F8F9FB;border-top:1px solid #E7E9EE;}
.duty-row{display:flex;justify-content:space-between;font-size:10px;padding:2px 0;color:#6B7280;}
.duty-row.total{font-weight:700;color:#141821;}
.grand-total{background:#0A1628;color:#fff;padding:12px 14px;border-radius:6px;margin-bottom:14px;}
.grand-total .duty-row{color:rgba(255,255,255,.7);font-size:11px;padding:3px 0;}
.grand-total .duty-row.grand{color:#C8841A;font-size:14px;font-weight:700;border-top:1px solid rgba(255,255,255,.2);margin-top:6px;padding-top:6px;}
.foot{margin-top:14px;font-size:9px;color:#6B7280;border-top:1px solid #E7E9EE;padding-top:8px;}
</style></head><body>
<div class="hdr">
  <h1>JEENA AND COMPANY</h1>
  <div class="sub">Checklist — SHIPPING BILL FOR EXPORT · [Custom Stn.: KOLKATA, INCCU4]</div>
  <div class="sub">Generated On: ${today} · Powered by Custom House AI</div>
</div>
<div class="meta">
  <div><span class="k">CHA</span></div><div><span class="v">${(loadProfile().firmName || "—")} · ${(loadProfile().licence || "")}</span></div>
  <div><span class="k">Exporter</span></div><div><span class="v">${fmt(filing.iecResult?.name)}</span></div>
  <div><span class="k">IEC</span></div><div><span class="v">${fmt(filing.iec)}</span></div>
  <div><span class="k">GSTIN</span></div><div><span class="v">${fmt(filing.iecResult?.gstin)}</span></div>
  <div><span class="k">AWB No.</span></div><div><span class="v">${fmt(sbData.awbNumber)}</span></div>
  <div><span class="k">AWB Date</span></div><div><span class="v">${fmt(sbData.awbDate)}</span></div>
  <div><span class="k">Port of Export</span></div><div><span class="v">${fmt(sbData.portOfExport)}</span></div>
  <div><span class="k">Country of Destination</span></div><div><span class="v">${fmt(sbData.destination)}</span></div>
  <div><span class="k">Incoterm</span></div><div><span class="v">${fmt(sbData.incoterm)}</span></div>
  <div><span class="k">ARE-1 No.</span></div><div><span class="v">${fmt(sbData.are1No || sbData.are1)}</span></div>
  <div><span class="k">DBK Serial No.</span></div><div><span class="v">${sbData.dbkSerial || "________"} (Notif. 77/2023-Cus.NT as amended)</span></div>
  <div><span class="k">RoDTEP Entry No.</span></div><div><span class="v">${sbData.rodtepEntry || "________"} (Appendix 4R, DGFT Notif. 10/2025-26)</span></div>
  <div><span class="k">Exchange Rate</span></div><div><span class="v">1 USD = ₹${exchRate} — ${exchMeta?.source || "indicative"}</span></div>
</div>
${invHtml}
<div class="grand-total">
  <div class="duty-row"><span>Total FOB (INR)</span><span>${fmtINR(grandFob)}</span></div>
  <div class="duty-row"><span>RODTEP ${rodtepRateOvr ? "("+rodtepRateOvr+"% per 4R)" : "(indicative)"}</span><span>${claims.rodtep ? fmtINR(rodtepAmt)+" (claimed)" : "Not claimed"}</span></div>
  <div class="duty-row"><span>Duty Drawback ${dbkRateOvr ? "("+dbkRateOvr+"%)" : "(indicative)"} ${dbkSerial ? "· DBK Sr. "+dbkSerial : "· ⚠ No DBK serial"}</span><span>${claims.drawback ? fmtINR(drawbackAmt)+" (claimed)" : "Not claimed"}</span></div>
  <div class="duty-row grand"><span>TOTAL BENEFIT CLAIMED</span><span>${fmtINR(totalBenefit)}</span></div>
      <div style="font-size:8px;color:#C8841A;margin-top:5px">RODTEP / Drawback rates shown are chapter-level indicative estimates. Confirm the item-level rate against DGFT Appendix 4R and the AIR Drawback Schedule serial (with per-unit cap) before claiming.</div>
</div>
<div class="foot">Rates marked est.* are indicative — verify against current CBIC/DGFT notifications before filing. Exchange rate is indicative; use CBIC-notified rate. Generated by Custom House AI as a drafting aid only. The CHA bears full legal responsibility.</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  };

  return (
    <div style={G.body}>
      <Header />
      <SBProgress step={7} onNavigate={onNavigate} />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={G.title}>SB Checklist</div>
        <div style={G.sub}>JEENA/CANOPUS export format. Review all fields before filing.</div>

        {/* Meta block */}
        <div style={{ ...G.card(), marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 11 }}>
            <div style={{ color: T.muted }}>Exporter <span style={{ color: T.ink, fontWeight: 600, display: "block" }}>{fmt(filing.iecResult?.name)}</span></div>
            <div style={{ color: T.muted }}>IEC <span style={{ color: T.ink, fontWeight: 600, display: "block" }}>{fmt(filing.iec)}</span></div>
            <div style={{ color: T.muted }}>AWB No. <span style={{ color: T.ink, fontWeight: 600, display: "block" }}>{fmt(sbData.awbNumber)}</span></div>
            <div style={{ color: T.muted }}>Port of Export <span style={{ color: T.ink, fontWeight: 600, display: "block" }}>{fmt(sbData.portOfExport)}</span></div>
            <div style={{ color: T.muted }}>Destination <span style={{ color: T.ink, fontWeight: 600, display: "block" }}>{fmt(sbData.destination)}</span></div>
            <div style={{ color: T.muted }}>Incoterm <span style={{ color: T.ink, fontWeight: 600, display: "block" }}>{fmt(sbData.incoterm)}</span></div>
          </div>
        </div>

        {/* Per-invoice item tables */}
        {invoices.map((inv, ii) => (
          <div key={ii} style={{ ...G.card(T.amber), padding: 0, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "10px 14px", background: T.wash,
              borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                Invoice {ii + 1} — {inv.invoiceNumber || "—"}
              </div>
              <div style={{ fontSize: 11, color: T.muted }}>
                {inv.shipperName} · {inv.currency} {inv.invoiceValue} · {inv.incoterm}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: T.navy }}>
                    {["#", "Description", "CTH", "Qty", "Value"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", color: "#fff", fontSize: 9,
                        textTransform: "uppercase", textAlign: "left", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(inv.lineItems || []).map((li, ki) => (
                    <tr key={ki} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: "7px 8px" }}>{ki + 1}</td>
                      <td style={{ padding: "7px 8px" }}>{li.description || "—"}</td>
                      <td style={{ padding: "7px 8px", fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>
                        {li.proposedCth || "—"}
                      </td>
                      <td style={{ padding: "7px 8px" }}>{li.quantity} {li.unit}</td>
                      <td style={{ padding: "7px 8px" }}>{inv.currency} {li.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 14px", background: T.wash,
              borderTop: `1px solid ${T.line}`, display: "flex",
              justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: T.muted }}>Invoice FOB (INR)</span>
              <span style={{ fontWeight: 700 }}>{fmtINR(invTotals[ii].fob)}</span>
            </div>
          </div>
        ))}

        {/* Grand total block */}
        <div style={{ background: T.navy, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12,
            color: "rgba(255,255,255,.6)", padding: "3px 0" }}>
            <span>Total FOB (INR)</span><span>{fmtINR(grandFob)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12,
            color: "rgba(255,255,255,.6)", padding: "3px 0" }}>
            <span>RODTEP claimable</span>
            <span>{claims.rodtep ? fmtINR(rodtepAmt) : "Not claimed"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12,
            color: "rgba(255,255,255,.6)", padding: "3px 0" }}>
            <span>Drawback claimable</span>
            <span>{claims.drawback ? fmtINR(drawbackAmt) : "Not claimed"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 16, fontWeight: 700, color: T.amber,
            borderTop: "1px solid rgba(255,255,255,.2)", marginTop: 8, paddingTop: 8 }}>
            <span>TOTAL BENEFIT CLAIMED</span>
            <span>{fmtINR(totalBenefit)}</span>
          </div>
        </div>

        {/* Benefits claimed summary */}
        {/* DBK serial and rate override fields */}
        {(claims.drawback || claims.rodtep) && (
          <div style={{ background: T.wash, border: `1px solid ${T.line}`,
            borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: ".06em", color: T.muted, marginBottom: 10 }}>
              Lock in your exact rates (recommended)
            </div>
            {claims.rodtep && (
              <div style={{ marginBottom: 10 }}>
                <label style={G.label}>RODTEP rate (% of FOB) — from DGFT Appendix 4R</label>
                <input style={{ ...G.input, maxWidth: 140 }} value={rodtepRateOvr}
                  onChange={e => setRodtepRateOvr(e.target.value)}
                  placeholder="e.g. 0.8 — leave blank for indicative" />
              </div>
            )}
            {claims.drawback && (
              <div>
                <div style={G.row2}>
                  <div>
                    <label style={G.label}>Drawback AIR rate (% of FOB)</label>
                    <input style={G.input} value={dbkRateOvr}
                      onChange={e => setDbkRateOvr(e.target.value)}
                      placeholder="e.g. 2.6 — from AIR schedule" />
                  </div>
                  <div>
                    <label style={G.label}>DBK serial no. *</label>
                    <input style={G.input} value={dbkSerial}
                      onChange={e => setDbkSerial(e.target.value)}
                      placeholder="e.g. 8528 or 711301A" />
                  </div>
                </div>
                {!dbkSerial.trim() && (
                  <div style={{ fontSize: 11, color: "#DC2626", marginTop: 6, fontWeight: 600 }}>
                    ⚠ DBK serial required — customs won't sanction drawback without it.
                    Check Notification 77/2023-Customs (NT) AIR Drawback schedule.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {(claims.rodtep || claims.drawback || claims.epcg) && (
          <div style={{ ...G.card(T.green), marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: T.muted, marginBottom: 6 }}>Claims lodged</div>
            {claims.rodtep && <div style={{ fontSize: 12, color: T.green }}>✓ RODTEP — {fmtINR(rodtepAmt)} indicative</div>}
            {claims.drawback && <div style={{ fontSize: 12, color: T.green }}>✓ Duty Drawback — {fmtINR(drawbackAmt)} indicative</div>}
            {claims.epcg && <div style={{ fontSize: 12, color: T.green }}>✓ EPCG — export obligation applied</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button onClick={exportPDF}
            style={{ ...G.btn("lg"), ...G.btnAmber, flex: 1, textAlign: "center" }}>
            ⬇ Download PDF
          </button>
          <button onClick={onHome}
            style={{ ...G.btn("lg"), ...G.btnBack, flex: 1, textAlign: "center" }}>
            New Filing
          </button>
        </div>

        <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.6, paddingBottom: 20 }}>
          Rates marked est.* are indicative — verify against current CBIC/DGFT notifications.
          Exchange rate ₹{exchRate}/USD — {exchMeta?.source || "placeholder"}{exchMeta?.effectiveDate ? ` (effective ${exchMeta.effectiveDate})` : ""}. Verify before filing.
          Generated by Custom House AI as a drafting aid only. The CHA bears full legal responsibility.
        </div>
      </div>
      <Foot onBack={onBack} onNext={exportPDF} nextLabel="⬇ Download PDF"
        nextStyle={{ ...G.btnAmber }} />
    </div>
  );
}


// Amount in words — Indian numbering (crore / lakh / thousand)
function amountInWords(n) {
  n = Math.round(Math.abs(n || 0));
  if (n === 0) return "Zero Rupees Only";
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  const two = (x) => x < 20 ? ones[x] : (tens[Math.floor(x/10)] + (x%10 ? " " + ones[x%10] : ""));
  const three = (x) => (x >= 100 ? ones[Math.floor(x/100)] + " Hundred" + (x%100 ? " " : "") : "") + (x%100 ? two(x%100) : "");
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh  = Math.floor(n / 100000);   n %= 100000;
  const thou  = Math.floor(n / 1000);     n %= 1000;
  if (crore) parts.push(three(crore) + " Crore");
  if (lakh)  parts.push(two(lakh) + " Lakh");
  if (thou)  parts.push(two(thou) + " Thousand");
  if (n)     parts.push(three(n));
  return "Rupees " + parts.join(" ") + " Only";
}


// ── DUTY WAIVER — module-level component ──────────────────────────────────────
// Allows CHA to manually exempt an item under a specific notification.
// Every waiver is logged with its basis for defensibility.
function DutyWaiverPanel({ waiver, onChange }) {
  const [open, setOpen] = useState(false);
  const w = waiver || {};
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" id={"dw_" + Math.random()}
          checked={!!w.active}
          onChange={e => onChange({ ...w, active: e.target.checked })}
          style={{ width: 14, height: 14, cursor: "pointer" }} />
        <label style={{ fontSize: 11, color: T.amber, fontWeight: 600, cursor: "pointer" }}
          onClick={() => onChange({ ...w, active: !w.active })}>
          Duty exemption / waiver applies
        </label>
        {w.active && (
          <button style={{ fontSize: 10, color: T.blue, background: "none", border: "none",
            cursor: "pointer", textDecoration: "underline" }}
            onClick={() => setOpen(o => !o)}>
            {open ? "Collapse" : "Enter basis →"}
          </button>
        )}
      </div>
      {w.active && open && (
        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE",
          borderRadius: 8, padding: 10, marginTop: 6 }}>
          <div style={{ fontSize: 10, color: T.blue, fontWeight: 600,
            marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Exemption basis (required for defensible filing)
          </div>
          <div style={G.row2}>
            <div>
              <label style={G.label}>Notification No.</label>
              <input style={G.input} value={w.notifNo || ""}
                placeholder="e.g. 50/2017-Customs"
                onChange={e => onChange({ ...w, notifNo: e.target.value })} />
            </div>
            <div>
              <label style={G.label}>Serial / S.No.</label>
              <input style={G.input} value={w.serial || ""}
                placeholder="e.g. Sr. 354"
                onChange={e => onChange({ ...w, serial: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 6 }}>
            <label style={G.label}>Scheme / reason</label>
            <input style={G.input} value={w.reason || ""}
              placeholder="e.g. EPCG — Notif. 16/2015-Customs | Advance Auth. | End-use | Project import"
              onChange={e => onChange({ ...w, reason: e.target.value })} />
          </div>
          <div style={G.row2}>
            <div>
              <label style={G.label}>Effective BCD after waiver (%)</label>
              <input style={G.input} value={w.effectiveRate || "0"}
                placeholder="0 for Nil BCD"
                onChange={e => onChange({ ...w, effectiveRate: e.target.value })} />
            </div>
            <div>
              <label style={G.label}>Effective IGST after waiver (%)</label>
              <input style={G.input} value={w.effectiveIgst !== undefined ? w.effectiveIgst : ""}
                placeholder="Leave blank = normal rate"
                onChange={e => onChange({ ...w, effectiveIgst: e.target.value })} />
            </div>
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
            Enter 0 to waive. Leave IGST blank unless explicitly waived (e.g. Advance Auth).
          </div>
          {(!w.notifNo || !w.reason) && (
            <div style={{ fontSize: 10, color: "#92400E", marginTop: 6 }}>
              ⚠ Enter the notification number and reason before filing — customs may query.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SETTINGS — CHA FIRM PROFILE ───────────────────────────────────────────────
function SettingsScreen({ onBack, user }) {
  const [p, setP] = useState(loadProfile());
  const [saved, setSaved] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(!!user);
  const set = (k, v) => { setP(prev => ({ ...prev, [k]: v })); setSaved(false); };

  // If logged in, pull the firm profile from Supabase (overrides local on first load)
  useEffect(() => {
    if (!user) { setLoadingRemote(false); return; }
    getRemoteProfile(user.id).then(rp => {
      if (rp && rp.firm_name) {
        const merged = {
          firmName: rp.firm_name || "", licence: rp.licence_no || "", gstin: rp.gstin || "",
          pan: rp.pan || "", adCode: rp.ad_code || "", address: rp.address || "", port: rp.port || "",
        };
        setP(merged); saveProfile(merged);
      }
      setLoadingRemote(false);
    }).catch(() => setLoadingRemote(false));
  }, [user]);

  const handleSave = async () => {
    saveProfile(p);
    if (user && isSupabaseConfigured()) {
      try { await upsertRemoteProfile(user.id, p); } catch { /* local save still succeeded */ }
    }
    setSaved(true);
  };

  return (
    <div style={G.body}>
      <Header />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button onClick={onBack} style={{ background: "none", border: "none",
            fontSize: 18, cursor: "pointer", color: T.muted, padding: 0 }}>←</button>
          <div style={G.title}>Firm settings</div>
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.5 }}>
          These details appear on every checklist your firm generates.
          {user ? " Saved to your account — available on any device you log in from." : " Stored on this device only — nothing is uploaded."}
        </div>
        {loadingRemote && <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>Loading your saved profile…</div>}
        <Field label="CHA firm name *" value={p.firmName} onChange={v => set("firmName", v)}
          placeholder="e.g. ABC Clearing Agency Pvt Ltd" />
        <Field label="CHA licence no. (CB licence)" value={p.licence} onChange={v => set("licence", v)}
          placeholder="e.g. AAAAA0000AAA000" />
        <div style={G.row2}>
          <Field label="Firm GSTIN" value={p.gstin} onChange={v => set("gstin", v.toUpperCase())} placeholder="Optional" />
          <Field label="Firm PAN" value={p.pan} onChange={v => set("pan", v.toUpperCase())} placeholder="Optional" />
        </div>
        <div style={G.row2}>
          <Field label="AD code" value={p.adCode} onChange={v => set("adCode", v)} placeholder="Optional" />
          <Field label="Home port / custom station" value={p.port} onChange={v => set("port", v)}
            placeholder="e.g. KOLKATA, INCCU4" />
        </div>
        <Field label="Firm address" value={p.address} onChange={v => set("address", v)} placeholder="Optional" />
        <button style={{ ...G.btn("lg"), ...G.btnNav, width: "100%", marginTop: 12,
          opacity: p.firmName.trim() ? 1 : 0.5 }}
          disabled={!p.firmName.trim()}
          onClick={handleSave}>
          {saved ? "✓ Saved" : "Save profile"}
        </button>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ── IEC DIRECTORY — CHA's own client list ─────────────────────────────────────
function IECDirectoryScreen({ onBack, user }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ iec: "", name: "", gstin: "", adCode: "", address: "", epcgActive: false, epcgLic: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const localKey = "iecDirectory";
  const loadLocal = () => { try { return JSON.parse(localStorage.getItem(localKey) || "[]"); } catch { return []; } };
  const saveLocal = (list) => { try { localStorage.setItem(localKey, JSON.stringify(list)); } catch {} };

  useEffect(() => {
    if (user && isSupabaseConfigured()) {
      getIecDirectory().then(d => { setClients(d); setLoading(false); });
    } else {
      setClients(loadLocal());
      setLoading(false);
    }
  }, [user]);

  const save = async () => {
    if (!form.iec.trim() || !form.name.trim()) return setMsg("IEC and firm name are required.");
    if (form.iec.trim().length !== 10) return setMsg("IEC must be exactly 10 characters.");
    setSaving(true); setMsg("");
    try {
      if (user && isSupabaseConfigured()) {
        await saveIec(user.id, form);
        setClients(await getIecDirectory());
      } else {
        const updated = [...loadLocal().filter(c => c.iec !== form.iec.toUpperCase()), {
          iec: form.iec.toUpperCase(), name: form.name, gstin: form.gstin,
          ad_code: form.adCode, address: form.address,
          epcg_active: form.epcgActive, epcg_lic: form.epcgLic,
        }];
        saveLocal(updated); setClients(updated);
      }
      setShowAdd(false);
      setForm({ iec: "", name: "", gstin: "", adCode: "", address: "", epcgActive: false, epcgLic: "" });
    } catch (e) {
      // Translate raw Postgres errors into something a CHA can actually act on
      const raw = e.message || "";
      if (raw.includes("foreign key") || raw.includes("violates foreign key constraint")) {
        setMsg("Your account setup didn't finish correctly. Please sign out and back in once, then try again.");
      } else {
        setMsg(raw);
      }
    }
    finally { setSaving(false); }
  };

  const del = async (iec) => {
    if (!window.confirm(`Remove ${iec} from your directory?`)) return;
    if (user && isSupabaseConfigured()) {
      await deleteIec(iec);
      setClients(await getIecDirectory());
    } else {
      const updated = loadLocal().filter(c => c.iec !== iec);
      saveLocal(updated); setClients(updated);
    }
  };

  const filtered = clients.filter(c =>
    c.iec?.includes(search.toUpperCase()) || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={G.body}>
      <Header />
      <div style={G.main}>
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.muted }}>←</button>
          <div>
            <div style={G.title}>My Client Directory</div>
            <div style={{ fontSize: 12, color: T.muted }}>
              Your importers/exporters — Screen 1 finds them instantly
              {!user && " (saved on this device only — log in to sync across devices)"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input style={{ ...G.input, flex: 1 }} value={search}
            onChange={e => setSearch(e.target.value)} placeholder="Search by IEC or name…" />
          <button onClick={() => setShowAdd(!showAdd)}
            style={{ ...G.btn(), ...G.btnAmber, padding: "10px 16px", flexShrink: 0 }}>
            {showAdd ? "Cancel" : "+ Add client"}
          </button>
        </div>

        {showAdd && (
          <div style={{ ...G.card(), marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.navy, marginBottom: 12 }}>Add / update client</div>
            <div style={G.row2}>
              <Field label="IEC *" value={form.iec} onChange={v => setF("iec", v.toUpperCase().slice(0,10))} placeholder="10-character IEC" />
              <Field label="Firm name *" value={form.name} onChange={v => setF("name", v)} placeholder="As on IEC certificate" />
            </div>
            <div style={G.row2}>
              <Field label="GSTIN" value={form.gstin} onChange={v => setF("gstin", v.toUpperCase())} placeholder="Optional" />
              <Field label="AD Code" value={form.adCode} onChange={v => setF("adCode", v)} placeholder="Optional" />
            </div>
            <Field label="Address" value={form.address} onChange={v => setF("address", v)} placeholder="Optional" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 8px", cursor: "pointer" }}>
              <input type="checkbox" checked={form.epcgActive} onChange={e => setF("epcgActive", e.target.checked)} />
              <span style={{ fontSize: 13 }}>This importer has an active EPCG authorisation</span>
            </label>
            {form.epcgActive && (
              <Field label="EPCG Licence No." value={form.epcgLic} onChange={v => setF("epcgLic", v)} placeholder="e.g. 0510213945" />
            )}
            {msg && <div style={{ color: T.red, fontSize: 12, marginBottom: 8 }}>{msg}</div>}
            <button onClick={save} disabled={saving}
              style={{ ...G.btn("lg"), ...G.btnNav, width: "100%", marginTop: 4, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save to directory"}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: T.muted }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ ...G.card(), textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {search ? "No clients match your search" : "Your directory is empty"}
            </div>
            <div style={{ fontSize: 12, color: T.muted }}>
              {search ? "Try a different search." : "Add your importers and exporters above. Next time you file, Screen 1 will find them instantly."}
            </div>
          </div>
        ) : filtered.map((c, i) => (
          <div key={c.iec || i} style={{ ...G.card(), marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: T.navy }}>{c.iec}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.name}</div>
              {(c.gstin || c.ad_code) && (
                <div style={{ fontSize: 11, color: T.muted }}>
                  {c.gstin && `GSTIN: ${c.gstin}`}{c.gstin && c.ad_code && " · "}{c.ad_code && `AD: ${c.ad_code}`}
                </div>
              )}
              {c.epcg_active && <span style={{ ...G.badge("ok"), marginTop: 4, display: "inline-block" }}>EPCG</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setForm({ iec: c.iec, name: c.name, gstin: c.gstin || "", adCode: c.ad_code || "", address: c.address || "", epcgActive: c.epcg_active || false, epcgLic: c.epcg_lic || "" }); setShowAdd(true); }}
                style={{ fontSize: 11, color: T.navy, background: T.wash, border: `1px solid ${T.line}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>Edit</button>
              <button onClick={() => del(c.iec)}
                style={{ fontSize: 11, color: T.red, background: "none", border: `1px solid ${T.line}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>Remove</button>
            </div>
          </div>
        ))}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ── AUTH SCREEN — Login / Sign up ─────────────────────────────────────────────
function AuthScreen({ onAuth, backTo, reason, defaultTab, defaultType }) {
  const [tab, setTab] = useState(defaultTab || "login");
  const [userType, setUserType] = useState(defaultType || ""); // "" | "cha" | "importer"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const ok = (text) => setMsg({ type: "ok", text });
  const err = (text) => setMsg({ type: "err", text });

  const handleLogin = async () => {
    if (!email.trim() || !password) return err("Enter your email and password.");
    setBusy(true); setMsg({ type: "", text: "" });
    try {
      const { user } = await signIn(email.trim(), password);
      if (user) onAuth(user);
    } catch (e) {
      err(e.message.includes("Invalid") ? "Wrong email or password." : e.message);
    } finally { setBusy(false); }
  };

  const handleSignup = async () => {
    if (!userType) return err("Please select your account type above.");
    if (!email.trim()) return err("Enter your email address.");
    if (password.length < 8) return err("Password must be at least 8 characters.");
    if (password !== confirm) return err("Passwords don't match.");
    if (!companyName.trim()) return err(
      userType === "cha" ? "Enter your CHA firm name." : "Enter your company name."
    );
    setBusy(true); setMsg({ type: "", text: "" });
    try {
      const { user, session } = await signUpWithType(
        email.trim(), password, userType,
        { companyName: companyName.trim(), contactName: contactName.trim(), phone: phone.trim() }
      );
      if (user && session) onAuth(user, userType);
      else ok("Check your email for a confirmation link, then come back and log in.");
    } catch (e) { err(e.message); }
    finally { setBusy(false); }
  };

  const handleReset = async () => {
    if (!email.trim()) return err("Enter your email address.");
    setBusy(true);
    try { await resetPassword(email.trim()); ok("Password reset email sent — check your inbox."); }
    catch (e) { err(e.message); }
    finally { setBusy(false); }
  };

  // Type selector — shown at top of signup form
  const TypeSelector = () => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.muted,
        marginBottom: 8, letterSpacing: ".04em" }}>I am a:</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { key: "cha", icon: "🏢", label: "CHA Firm",
            sub: "Custom House Agent filing on behalf of clients" },
          { key: "importer", icon: "📦", label: "Importer / Exporter",
            sub: "Company importing or exporting goods directly" },
        ].map(t => (
          <div key={t.key} onClick={() => setUserType(t.key)}
            style={{ border: `2px solid ${userType === t.key ? T.navy : T.line}`,
              borderRadius: 10, padding: "12px 10px", cursor: "pointer",
              background: userType === t.key ? "#EFF6FF" : T.paper,
              transition: "all .15s" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.navy,
              marginBottom: 2 }}>{t.label}</div>
            <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.3 }}>{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ ...G.body, justifyContent: "center", alignItems: "center",
      background: T.wash, padding: "0 20px" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16,
        padding: "36px 28px", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>
        {backTo && (
          <button onClick={backTo} style={{ background: "none", border: "none",
            color: T.muted, fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 16 }}>
            ← Back to home
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10,
          marginBottom: reason ? 16 : 28 }}>
          <div style={G.mark}>C</div>
          <div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 22,
              fontWeight: 700, color: T.navy }}>
              Custom House <span style={{ color: T.amber }}>AI</span>
            </div>
            <div style={{ fontSize: 11, color: T.muted }}>Customs filing made simple</div>
          </div>
        </div>

        {reason && (
          <div style={{ padding: "10px 14px", background: "#EFF6FF",
            border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 12, color: T.navy,
            marginBottom: 24, lineHeight: 1.5 }}>{reason}</div>
        )}

        {tab !== "reset" && (
          <div style={{ display: "flex", background: T.wash, borderRadius: 8,
            padding: 3, marginBottom: 24, border: `1px solid ${T.line}` }}>
            {[["login","Log in"],["signup","Create account"]].map(([k,l]) => (
              <button key={k} onClick={() => { setTab(k); setMsg({type:"",text:""}); }}
                style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 6,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: tab === k ? "#fff" : "transparent",
                  color: tab === k ? T.navy : T.muted,
                  boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {tab === "reset" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Reset password</div>
            <div style={{ fontSize: 12, color: T.muted }}>We'll send a reset link to your email.</div>
          </div>
        )}

        {/* Type selector — only on signup */}
        {tab === "signup" && <TypeSelector />}

        {/* Company/firm name — only on signup */}
        {tab === "signup" && (
          <div style={{ marginBottom: 14 }}>
            <label style={G.label}>
              {userType === "importer" ? "Company name *" : "CHA firm name *"}
            </label>
            <input style={G.input} value={companyName}
              placeholder={userType === "importer" ? "e.g. ABC Textiles Pvt Ltd" : "e.g. XYZ Clearing Agency"}
              onChange={e => setCompanyName(e.target.value)} />
          </div>
        )}

        {tab === "signup" && userType === "importer" && (
          <div style={G.row2}>
            <div>
              <label style={G.label}>Contact name</label>
              <input style={G.input} value={contactName}
                placeholder="Your name" onChange={e => setContactName(e.target.value)} />
            </div>
            <div>
              <label style={G.label}>Phone</label>
              <input style={G.input} value={phone}
                placeholder="+91..." onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={G.label}>Email address</label>
          <input style={G.input} type="email" value={email}
            placeholder="you@yourcompany.com" onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (tab === "login" ? handleLogin() :
              tab === "signup" ? handleSignup() : handleReset())} />
        </div>

        {tab !== "reset" && (
          <div style={{ marginBottom: tab === "signup" ? 14 : 8 }}>
            <label style={G.label}>Password</label>
            <input style={G.input} type="password" value={password}
              placeholder="Min. 8 characters" onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && tab === "login" && handleLogin()} />
          </div>
        )}

        {tab === "signup" && (
          <div style={{ marginBottom: 8 }}>
            <label style={G.label}>Confirm password</label>
            <input style={G.input} type="password" value={confirm}
              placeholder="Same password again" onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSignup()} />
          </div>
        )}

        {tab === "login" && (
          <div style={{ textAlign: "right", marginBottom: 20 }}>
            <button onClick={() => { setTab("reset"); setMsg({type:"",text:""}); }}
              style={{ fontSize: 12, color: T.muted, background: "none",
                border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Forgot password?
            </button>
          </div>
        )}

        {msg.text && (
          <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 12,
            background: msg.type === "ok" ? "#F0FDF4" : "#FEF2F2",
            border: `1px solid ${msg.type === "ok" ? "#BBF7D0" : "#FECACA"}`,
            color: msg.type === "ok" ? T.green : T.red }}>
            {msg.text}
          </div>
        )}

        <button
          onClick={tab === "login" ? handleLogin : tab === "signup" ? handleSignup : handleReset}
          disabled={busy}
          style={{ ...G.btn("lg"), ...G.btnNav, width: "100%",
            padding: "14px 0", fontSize: 14, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Please wait…" :
            tab === "login" ? "Log in" :
            tab === "signup" ? "Create account" : "Send reset link"}
        </button>

        {tab === "reset" && (
          <button onClick={() => setTab("login")}
            style={{ width: "100%", marginTop: 10, padding: "12px 0",
              background: "none", border: "none", color: T.muted,
              fontSize: 13, cursor: "pointer" }}>
            ← Back to log in
          </button>
        )}

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: T.muted }}>
          Your data is private and only visible to you
        </div>
      </div>
    </div>
  );
}

// ── ERROR BOUNDARY — catches any crash and shows a friendly screen ────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, msg: "" }; }
  static getDerivedStateFromError(error) { return { hasError: true, msg: error?.message || "" }; }
  componentDidCatch(error, info) { console.error("App crashed:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", padding: "0 24px", textAlign: "center",
          fontFamily: "'Inter',sans-serif", background: "#F8F9FB" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0A1628", marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 20, maxWidth: 340, lineHeight: 1.6 }}>
            The app hit an unexpected error. Your filing data is saved automatically as you
            go, so nothing should be lost. Try reloading the page.
          </div>
          <button onClick={() => window.location.reload()}
            style={{ background: "#0A1628", color: "#fff", border: "none", borderRadius: 8,
              padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Reload the app
          </button>
          {this.state.msg && (
            <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 20, fontFamily: "monospace" }}>
              {this.state.msg}
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── DUTY CALCULATOR ───────────────────────────────────────────────────────────
const CURRENCIES = ["USD","EUR","GBP","JPY","CNY","SGD","AED","CHF","AUD","HKD","INR"];

function DutyCalculator({ onBack }) {
  const [mode, setMode] = useState("desc"); // "desc" | "cth"
  const [desc, setDesc] = useState("");
  const [cthInput, setCthInput] = useState("");
  const [avInput, setAvInput] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [classifying, setClassifying] = useState(false);
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState(null);   // duty record
  const [error, setError] = useState("");
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dutyHistory") || "[]"); } catch { return []; }
  });

  const { rate: exchRate, meta: exchMeta } = useExchangeRate(currency === "INR" ? "USD" : currency, "import");

  const saveHistory = (rec) => {
    const h = [rec, ...history.filter(h => h.cth !== rec.cth)].slice(0, 20);
    setHistory(h);
    try { localStorage.setItem("dutyHistory", JSON.stringify(h)); } catch {}
  };

  // Classify description → get CTH → look up duty
  const classifyAndLookup = async () => {
    if (!desc.trim()) return;
    setClassifying(true); setError(""); setResult(null);
    try {
      const rc = await fetch("/api/classify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ description: desc.trim() }] }),
      });
      const dc = await safeJson(rc);
      const cth = dc.classifications?.[0]?.proposedCth;
      if (!cth) { setError(dc.error || "Could not classify — try entering the CTH directly."); setClassifying(false); return; }
      setCthInput(cth);
      await lookupDuty(cth, dc.classifications[0]);
    } catch (e) { setError(`Classification failed: ${e.message}`); }
    setClassifying(false);
  };

  const lookupDuty = async (cthOverride, classInfo) => {
    const cth = (cthOverride || cthInput).replace(/\D/g,"").slice(0,8);
    if (cth.length < 6) { setError("Enter at least 6 digits of the CTH."); return; }
    setLooking(true); setError("");
    try {
      const rd = await fetch("/api/duty", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cth }),
      });
      const dd = await safeJson(rd);
      const rec = {
        cth, found: dd.found,
        desc: dd.desc || classInfo?.headingDescription || desc || "",
        bcd: dd.bcd ?? null, igst: dd.igst ?? null, add: dd.add ?? 0,
        addNote: dd.addNote || "", prefBcd: dd.prefBcd ?? null, fta: dd.fta || "",
        aidc: dd.aidc || 0, healthCess: dd.healthCess || 0, compCess: dd.compCess || 0,
        notif: dd.notif || "", effDate: dd.effDate || "",
        src: dd.src || "", conf: dd.conf || "unavailable",
        notes: dd.notes || "",
        meta: dd.meta || {},
        classConf: classInfo?.confidence || "",
        classReasoning: classInfo?.reasoning || "",
        lookedUpAt: new Date().toISOString(),
      };
      setResult(rec);
      if (dd.found) saveHistory(rec);
      else setError(dd.error || "CTH not found in duty table.");
    } catch (e) { setError(`Lookup failed: ${e.message}`); }
    setLooking(false);
  };

  // ── Duty calculation ──
  const pct = (v) => (parseFloat(v) || 0) / 100;
  const avNum = parseFloat((avInput || "0").replace(/[^0-9.]/g,"")) || 0;
  const avINR = currency === "INR" ? avNum : avNum * exchRate;
  const bcdAmt    = result?.found ? avINR * pct(result.bcd) : 0;
  const swsAmt    = bcdAmt * 0.1;
  const aidcAmt   = result?.found ? avINR * pct(result.aidc || 0) : 0;
  const healthAmt = result?.found ? avINR * pct(result.healthCess || 0) : 0;
  const addAmt    = result?.found ? avINR * pct(result.add) : 0;
  // IGST base legally includes ALL customs duties — BCD, SWS, cesses, and ADD
  const igstBase  = avINR + bcdAmt + swsAmt + aidcAmt + healthAmt + addAmt;
  const igstAmt   = result?.found ? igstBase * pct(result.igst) : 0;
  const compAmt   = result?.found ? igstBase * pct(result.compCess || 0) : 0;
  const totalDuty = bcdAmt + swsAmt + aidcAmt + healthAmt + addAmt + igstAmt + compAmt;
  const landedCost = avINR + totalDuty;

  const fmtINR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const fmtPct = (v) => v != null ? `${v}%` : "—";
  const confBadge = (c) => c === "verified" ? "ok" : c === "override" ? "ok" : c === "indicative" ? "warn" : c === "ai-generated" ? "info" : "info";
  const confLabel = (c) => c === "verified" ? "Verified BE" : c === "override" ? "Sheet override" : c === "indicative" ? "Indicative" : c === "ai-generated" ? "AI lookup" : c || "Unknown";

  // ── Share Estimate — printable one-page summary for a prospective client ──
  const exportEstimate = () => {
    const P = loadProfile();
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Duty Estimate — ${result.cth}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #141821; font-size: 13px; line-height: 1.5; margin: 0; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0A1628; padding-bottom: 12px; margin-bottom: 20px; }
  .firm { font-size: 20px; font-weight: 700; color: #0A1628; }
  .meta { text-align: right; font-size: 11px; color: #6B7280; }
  h1 { font-size: 16px; color: #0A1628; margin: 0 0 4px; }
  .sub { font-size: 11px; color: #6B7280; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; font-size: 9px; letter-spacing: .05em; text-transform: uppercase; color: #6B7280; border-bottom: 1px solid #E5E7EB; padding: 6px 8px; }
  td { padding: 8px; border-bottom: 1px solid #F3F4F6; font-size: 12px; }
  .num { text-align: right; font-family: 'Courier New', monospace; }
  .total-row td { font-weight: 700; font-size: 14px; border-top: 2px solid #0A1628; border-bottom: none; color: #0A1628; }
  .cth-box { background: #F8F9FB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; }
  .cth-code { font-family: monospace; font-size: 20px; font-weight: 700; color: #0A1628; letter-spacing: 2px; }
  .disclaimer { margin-top: 24px; padding: 12px 14px; background: #FEF9C3; border: 1px solid #FDE68A; border-radius: 6px; font-size: 10px; color: #92400E; }
  .footer { margin-top: 24px; font-size: 10px; color: #9CA3AF; text-align: center; }
</style></head><body>
  <div class="hdr">
    <div class="firm">${P.firmName || "Custom House Agent"}</div>
    <div class="meta">${P.licence ? `Licence: ${P.licence}<br>` : ""}${today}</div>
  </div>
  <h1>Indicative Duty Estimate</h1>
  <div class="sub">Prepared for prospective shipment planning — not a filed assessment</div>
  <div class="cth-box">
    <div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#6B7280;margin-bottom:4px">CTH</div>
    <div class="cth-code">${result.cth}</div>
    <div style="font-size:12px;color:#374151;margin-top:6px">${result.desc || ""}</div>
  </div>
  <table>
    <thead><tr><th>Particulars</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount (₹)</th></tr></thead>
    <tbody>
      <tr><td>Assessable Value</td><td class="num"></td><td class="num">${fmtINR(avINR)}</td></tr>
      <tr><td>Basic Customs Duty (BCD)</td><td class="num">${fmtPct(result.bcd)}</td><td class="num">${fmtINR(bcdAmt)}</td></tr>
      <tr><td>Social Welfare Surcharge (SWS)</td><td class="num">10% of BCD</td><td class="num">${fmtINR(swsAmt)}</td></tr>
      ${result.aidc ? `<tr><td>Agriculture Infra Dev Cess (AIDC)</td><td class="num">${fmtPct(result.aidc)}</td><td class="num">${fmtINR(aidcAmt)}</td></tr>` : ""}
      ${result.healthCess ? `<tr><td>Health Cess</td><td class="num">${fmtPct(result.healthCess)}</td><td class="num">${fmtINR(healthAmt)}</td></tr>` : ""}
      ${result.add ? `<tr><td>Anti-Dumping Duty</td><td class="num">${fmtPct(result.add)}</td><td class="num">${fmtINR(addAmt)}</td></tr>` : ""}
      <tr><td>IGST</td><td class="num">${fmtPct(result.igst)}</td><td class="num">${fmtINR(igstAmt)}</td></tr>
      ${result.compCess ? `<tr><td>Compensation Cess</td><td class="num">${fmtPct(result.compCess)}</td><td class="num">${fmtINR(compAmt)}</td></tr>` : ""}
      <tr class="total-row"><td>Total Duty Payable</td><td></td><td class="num">${fmtINR(totalDuty)}</td></tr>
      <tr class="total-row"><td>Total Landed Cost</td><td></td><td class="num">${fmtINR(landedCost)}</td></tr>
    </tbody>
  </table>
  <div class="disclaimer">
    ⚠ This is an indicative estimate based on the CTH classification and current tariff data (${confLabel(result.conf)}).
    Actual duty is determined at the time of filing based on complete import documentation, applicable notifications,
    and customs assessment. This estimate does not constitute a filing and creates no binding obligation.
  </div>
  <div class="footer">Generated by Custom House AI · ${today}</div>
</body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };


  const DutyRow = ({ label, amount, pctStr, highlight }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 0", borderBottom: `1px solid ${T.line}`,
      fontWeight: highlight ? 700 : 400 }}>
      <div>
        <div style={{ fontSize: 13 }}>{label}</div>
        {pctStr && <div style={{ fontSize: 10, color: T.muted }}>{pctStr}</div>}
      </div>
      <div style={{ fontSize: highlight ? 16 : 13, color: highlight ? T.navy : T.ink }}>
        {fmtINR(amount)}
      </div>
    </div>
  );

  return (
    <div style={G.body}>
      <Header />
      <div style={G.main}>
        <div style={{ height: 16 }} />

        {/* Back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={onBack} style={{ background: "none", border: "none",
            fontSize: 18, cursor: "pointer", color: T.muted, padding: 0 }}>←</button>
          <div>
            <div style={G.title}>Duty Calculator</div>
            <div style={{ fontSize: 12, color: T.muted }}>
              Classify any item and get the full Indian customs duty chain instantly.
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", background: T.wash, borderRadius: 8,
          padding: 3, marginBottom: 16, border: `1px solid ${T.line}` }}>
          {[["desc","By Description"], ["cth","By CTH"]].map(([k, label]) => (
            <button key={k} onClick={() => { setMode(k); setResult(null); setError(""); }}
              style={{ flex: 1, padding: "8px 0", border: "none", borderRadius: 6,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: mode === k ? "#fff" : "transparent",
                color: mode === k ? T.navy : T.muted,
                boxShadow: mode === k ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Input */}
        {mode === "desc" ? (
          <div style={{ marginBottom: 12 }}>
            <label style={G.label}>Item description</label>
            <textarea
              value={desc}
              onChange={e => { setDesc(e.target.value); setResult(null); setError(""); }}
              placeholder="e.g. brass ball valve, 1 inch, PN16 rating — be as specific as possible"
              rows={3}
              style={{ ...G.input, resize: "none", lineHeight: 1.5, fontSize: 13 }}
            />
            <button onClick={classifyAndLookup}
              disabled={!desc.trim() || classifying || looking}
              style={{ ...G.btn("lg"), ...G.btnNav, width: "100%", marginTop: 6,
                opacity: (!desc.trim() || classifying || looking) ? 0.5 : 1 }}>
              {classifying ? "Classifying…" : looking ? "Looking up…" : "🔍 Classify & Look up Duty"}
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <label style={G.label}>CTH (6–8 digits)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={cthInput}
                onChange={e => { setCthInput(e.target.value.replace(/\D/g,"").slice(0,8)); setResult(null); setError(""); }}
                placeholder="e.g. 84818081"
                style={{ ...G.input, flex: 1, fontFamily: "monospace", fontWeight: 700,
                  fontSize: 18, letterSpacing: 3 }}
              />
              <button onClick={() => lookupDuty()}
                disabled={cthInput.length < 6 || looking}
                style={{ ...G.btn(), ...G.btnNav, padding: "10px 14px",
                  opacity: (cthInput.length < 6 || looking) ? 0.5 : 1 }}>
                {looking ? "…" : "Look up"}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: "10px 14px", background: "#FEF2F2",
            border: "1px solid #FECACA", borderRadius: 8, fontSize: 12,
            color: T.red, marginBottom: 12 }}>{error}</div>
        )}

        {/* Result */}
        {result?.found && (
          <div style={{ ...G.card(T.green), padding: 0, overflow: "hidden", marginBottom: 16 }}>
            {/* CTH header */}
            <div style={{ background: T.navy, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)",
                    letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>CTH</div>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700,
                    color: "#fff", letterSpacing: 3 }}>{result.cth}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span style={G.badge(confBadge(result.conf))}>{confLabel(result.conf)}</span>
                  {result.classConf && <span style={G.badge("info")}>AI: {result.classConf}</span>}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", marginTop: 8,
                lineHeight: 1.4 }}>{result.desc}</div>
              {result.classReasoning && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 4,
                  fontStyle: "italic", lineHeight: 1.4 }}>{result.classReasoning}</div>
              )}
            </div>

            {/* Rate summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0,
              borderBottom: `1px solid ${T.line}` }}>
              {[["BCD", fmtPct(result.bcd)], ["IGST", fmtPct(result.igst)], ["ADD", result.add ? fmtPct(result.add) : "Nil"]].map(([label, val]) => (
                <div key={label} style={{ padding: "12px 14px",
                  borderRight: label !== "ADD" ? `1px solid ${T.line}` : "none" }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 700,
                    letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: T.navy }}>{val}</div>
                  {label === "BCD" && <div style={{ fontSize: 9, color: T.muted }}>+10% SWS on BCD</div>}
                  {label === "IGST" && <div style={{ fontSize: 9, color: T.muted }}>on AV+BCD+SWS</div>}
                  {label === "ADD" && result.addNote && (
                    <div style={{ fontSize: 9, color: T.muted }}>{result.addNote}</div>
                  )}
                </div>
              ))}
            </div>

            {/* FTA preferential */}
            {result.prefBcd != null && (
              <div style={{ padding: "10px 14px", background: "#F0FDF4",
                borderBottom: `1px solid ${T.line}`, fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: T.green }}>
                  ★ {result.fta || "FTA"} preferential BCD: {result.prefBcd}%
                </span>
                {" — verify CoO eligibility before claiming"}
              </div>
            )}

            {/* Source + AI warning */}
            <div style={{ padding: "8px 14px", background: T.wash,
              borderBottom: `1px solid ${T.line}` }}>
              <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>
                <b>Source:</b> {result.src}{result.notif ? ` · ${result.notif}` : ""}
                {result.effDate ? ` · effective ${result.effDate}` : ""}
              </div>
              {result.meta?.witsConfirms === true && (
                <div style={{ fontSize: 10, color: T.green }}>
                  ✓ Cross-checked against World Bank WITS tariff database
                </div>
              )}
              {result.meta?.witsConfirms === false && (
                <div style={{ fontSize: 10, color: T.amber }}>
                  ⚠ World Bank WITS shows different BCD — verify against current CBIC notification
                </div>
              )}
              {result.conf === "ai-generated" && (
                <div style={{ fontSize: 10, color: T.amber, marginTop: 3 }}>
                  ⚠ AI-generated from training data — verify against current CBIC tariff before filing.{" "}
                  <span style={{ textDecoration: "underline", cursor: "pointer" }}
                    onClick={() => window.open("https://enquiry.icegate.gov.in/enquiryatices/tariffHome", "_blank")}>
                    Check on IceGate →
                  </span>
                </div>
              )}
            </div>

            {/* Notes */}
            {result.notes && (
              <div style={{ padding: "8px 14px", background: "#FEF9C3",
                borderBottom: `1px solid ${T.line}`, fontSize: 11, color: "#92400E" }}>
                ⚠ {result.notes}
              </div>
            )}

            {/* Assessable value calculator */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
                Duty calculator
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={G.label}>Assessable value</label>
                  <input value={avInput}
                    onChange={e => setAvInput(e.target.value)}
                    placeholder="e.g. 5000"
                    style={{ ...G.input, fontFamily: "monospace", fontSize: 14 }} />
                </div>
                <div style={{ width: 80 }}>
                  <label style={G.label}>Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    style={{ ...G.input, padding: "9px 6px" }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {avNum > 0 && (
                <>
                  {currency !== "INR" && (
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
                      {currency} {avNum.toLocaleString()} × {exchRate} = {fmtINR(avINR)}
                      {" "}
                      <span style={{ fontSize: 10, opacity: 0.7 }}>
                        ({exchMeta?.confidence === "curated" ? "indicative rate" : exchMeta?.source || "rate"})
                      </span>
                    </div>
                  )}
                  <DutyRow label="Assessable Value" amount={avINR} />
                  <DutyRow label="Basic Customs Duty (BCD)"
                    amount={bcdAmt} pctStr={`${result.bcd}% of AV`} />
                  <DutyRow label="Social Welfare Surcharge (SWS)"
                    amount={swsAmt} pctStr="10% of BCD" />
                  {aidcAmt > 0.5 && <DutyRow label="AID Cess (AIDC)" amount={aidcAmt} pctStr={`${result.aidc}% of AV`} />}
                  {healthAmt > 0.5 && <DutyRow label="Health Cess" amount={healthAmt} pctStr={`${result.healthCess}% of AV`} />}
                  {result.add > 0 && (
                    <DutyRow label={`Anti-Dumping Duty${result.addNote ? ` (${result.addNote})` : ""}`}
                      amount={addAmt} pctStr={`${result.add}% of AV`} />
                  )}
                  <DutyRow label="IGST"
                    amount={igstAmt} pctStr={`${result.igst}% on AV + all duties`} />
                  {compAmt > 0.5 && <DutyRow label="Compensation Cess" amount={compAmt} pctStr={`${result.compCess}% on IGST base`} />}
                  <DutyRow label="Total Duty" amount={totalDuty} highlight />
                  <div style={{ background: T.navy, borderRadius: 8, padding: "12px 14px",
                    marginTop: 12, display: "flex", justifyContent: "space-between",
                    alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>
                      Total Landed Cost (INR)
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: T.amber }}>
                      {fmtINR(landedCost)}
                    </div>
                  </div>
                  {result.conf === "indicative" && (
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
                      * Rates are indicative — verify against current CBIC tariff and
                      applicable notifications before filing. Assessable value may differ
                      from invoice value depending on transaction value rules.
                    </div>
                  )}
                  <button onClick={exportEstimate}
                    style={{ ...G.btn(), ...G.btnAmber, width: "100%", marginTop: 12, fontSize: 12 }}>
                    ⬇ Share Estimate with Client
                  </button>
                </>
              )}
              {avNum === 0 && (
                <div style={{ fontSize: 12, color: T.muted, textAlign: "center",
                  padding: "12px 0" }}>
                  Enter an assessable value above to calculate duty amounts.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent lookups */}
        {history.length > 0 && !result && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>
              Recent lookups
            </div>
            {history.slice(0,8).map((h, i) => (
              <div key={i} onClick={() => {
                setCthInput(h.cth); setMode("cth"); setResult(h); setError("");
              }} style={{ ...G.card(), cursor: "pointer", display: "flex",
                justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700,
                    color: T.navy }}>{h.cth}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{(h.desc || "").slice(0,45)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    BCD {fmtPct(h.bcd)} · IGST {fmtPct(h.igst)}
                  </div>
                  <span style={G.badge(confBadge(h.conf))}>{confLabel(h.conf)}</span>
                </div>
              </div>
            ))}
            <button onClick={() => setHistory([])}
              style={{ fontSize: 11, color: T.muted, background: "none", border: "none",
                cursor: "pointer", textDecoration: "underline" }}>
              Clear history
            </button>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ── JOB BOARD — localStorage index (auth users only) ─────────────────────────
// Lightweight index over filings. Full filing data stays in existing DB keys.
// Keyed: chai_jobs_[userId]
const Jobs = {
  _key: (uid) => `chai_jobs_${uid}`,
  all(uid) {
    if (!uid) return [];
    try { return JSON.parse(localStorage.getItem(Jobs._key(uid)) || "[]"); } catch { return []; }
  },
  save(uid, jobs) {
    if (!uid) return;
    try { localStorage.setItem(Jobs._key(uid), JSON.stringify(jobs)); } catch {}
  },
  upsert(uid, job) {
    if (!uid) return;
    const all = Jobs.all(uid);
    const idx = all.findIndex(j => j.id === job.id);
    const updated = { ...job, updatedAt: new Date().toISOString() };
    if (idx >= 0) all[idx] = updated; else all.unshift(updated);
    Jobs.save(uid, all);
    return updated;
  },
  updateStage(uid, jobId, stage) {
    const all = Jobs.all(uid);
    const idx = all.findIndex(j => j.id === jobId);
    if (idx < 0) return;
    all[idx] = { ...all[idx], stage, updatedAt: new Date().toISOString() };
    Jobs.save(uid, all);
    // Audit log
    try {
      const log = JSON.parse(localStorage.getItem("chai_audit_log") || "[]");
      log.push({ event: "stage_change", jobId, stage, timestamp: new Date().toISOString(), userId: uid });
      localStorage.setItem("chai_audit_log", JSON.stringify(log));
    } catch {}
  },
  remove(uid, jobId) {
    const all = Jobs.all(uid).filter(j => j.id !== jobId);
    Jobs.save(uid, all);
  },
};

const STAGE_META = {
  "Draft":            { color: "#6B7280", bg: "#F3F4F6", label: "Draft" },
  "Documents Uploaded": { color: "#2563EB", bg: "#DBEAFE", label: "Docs Uploaded" },
  "Classified":       { color: "#6D28D9", bg: "#EDE9FE", label: "Classified" },
  "Checklist Ready":  { color: "#C8841A", bg: "#FEF9C3", label: "Checklist Ready" },
  "Filed":            { color: "#7C3AED", bg: "#F3E8FF", label: "Filed" },
  "Query Raised":     { color: "#DC2626", bg: "#FEE2E2", label: "Query Raised" },
  "Cleared":          { color: "#16A34A", bg: "#F0FDF4", label: "Cleared" },
};

const STAGE_ORDER = ["Draft","Documents Uploaded","Classified","Checklist Ready","Filed","Query Raised","Cleared"];

function StageBadge({ stage }) {
  const m = STAGE_META[stage] || STAGE_META["Draft"];
  return (
    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700,
      padding: "2px 8px", borderRadius: 999, background: m.bg, color: m.color,
      letterSpacing: ".04em" }}>{m.label}</span>
  );
}

// ── JOB DASHBOARD ─────────────────────────────────────────────────────────────
function JobDashboard({ user, onNewBE, onNewSB, onOpenJob, onDirectory, onDuty, onSettings, onBilling, onInvoices, onMIS, onTeam, onQueryDraft, onAuditTrail, onBatchForecast, onRatesAdmin }) {
  const [jobs, setJobs] = useState(() => Jobs.all(user?.id));
  const [filter, setFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [changingStage, setChangingStage] = useState(null);
  const [iceGateStatus, setIceGateStatus] = useState({});
  const [checkingIceGate, setCheckingIceGate] = useState(null);
  const reload = () => setJobs(Jobs.all(user?.id));

  const checkIceGate = async (job) => {
    setCheckingIceGate(job.id);
    try {
      const r = await fetch("/api/icegateStatus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blAwbNumber: job.blAwbNumber, type: job.type }),
      });
      const d = await r.json();
      setIceGateStatus(p => ({ ...p, [job.id]: d }));
    } catch (e) {
      setIceGateStatus(p => ({ ...p, [job.id]: { available: false, message: e.message } }));
    }
    setCheckingIceGate(null);
  };

  const handleStageChange = (jobId, newStage) => {
    Jobs.updateStage(user?.id, jobId, newStage);
    setChangingStage(null);
    reload();
  };

  const filtered = jobs.filter(j => {
    const q = filter.toLowerCase();
    const matchText = !q || (j.clientName || "").toLowerCase().includes(q)
      || (j.iec || "").toLowerCase().includes(q)
      || (j.blAwbNumber || "").toLowerCase().includes(q)
      || (j.filingRef || "").toLowerCase().includes(q);
    const matchStage = stageFilter === "All" || j.stage === stageFilter;
    return matchText && matchStage;
  });

  const fmt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div style={{ ...G.body, minHeight: "100vh" }}>
      {/* Header */}
      <div style={G.hdr}>
        <div style={G.brand}>
          <div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right", cursor: "pointer" }} onClick={onSettings}>
            {loadProfile().firmName
              ? <><div style={G.chaName}>{loadProfile().firmName}</div>
                  <div style={G.chaLic}>{loadProfile().licence || user?.email || ""}</div></>
              : <div style={{ ...G.chaName, color: T.amber }}>⚙ Set up firm</div>}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: "16px 16px 80px", overflowY: "auto" }}>
        {/* Welcome + new filing buttons */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600 }}>
              Job Board
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {jobs.length} filing{jobs.length !== 1 ? "s" : ""} · {jobs.filter(j => j.stage !== "Cleared").length} active
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onNewSB}
              style={{ ...G.btn(), ...G.btnAmber, fontSize: 12, padding: "9px 16px" }}>
              + Shipping Bill
            </button>
            <button onClick={onNewBE}
              style={{ ...G.btn(), ...G.btnNav, fontSize: 12, padding: "9px 16px" }}>
              + Bill of Entry
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search client, IEC, BL/AWB…"
            style={{ ...G.input, flex: 1, minWidth: 160, fontSize: 12, padding: "8px 12px" }}
          />
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
            style={{ ...G.input, width: "auto", fontSize: 12, padding: "8px 12px",
              color: T.ink, cursor: "pointer" }}>
            <option>All</option>
            {STAGE_ORDER.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Quick-access tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Client Directory", icon: "📋", color: T.blue, bg: "#EFF6FF", border: "#BFDBFE", onClick: onDirectory },
            { label: "Duty Calculator", icon: "🧮", color: T.green, bg: "#F0FDF4", border: "#BBF7D0", onClick: onDuty },
            { label: "Batch Forecast", icon: "📦", color: "#0891B2", bg: "#ECFEFF", border: "#A5F3FC", onClick: onBatchForecast },
            { label: "CHA Invoices", icon: "🧾", color: T.amber, bg: "#FFFBEB", border: "#FDE68A", onClick: onInvoices },
            { label: "MIS Report", icon: "📊", color: T.navy, bg: "#EEF2FF", border: "#C7D2FE", onClick: onMIS },
            { label: "Team Members", icon: "👥", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", onClick: onTeam },
            { label: "Plans & Billing", icon: "💳", color: "#0F766E", bg: "#F0FDFA", border: "#99F6E4", onClick: onBilling },
            { label: "Audit Trail", icon: "📜", color: "#B91C1C", bg: "#FEF2F2", border: "#FECACA", onClick: onAuditTrail },
            { label: "Exchange Rates", icon: "💱", color: "#0369A1", bg: "#F0F9FF", border: "#BAE6FD", onClick: onRatesAdmin },
          ].map(t => (
            <div key={t.label} onClick={t.onClick}
              style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10,
                padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: t.color }}>{t.label}</span>
            </div>
          ))}
        </div>

        {/* Jobs list */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: T.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
              {jobs.length === 0 ? "No filings yet" : "No results"}
            </div>
            <div style={{ fontSize: 12 }}>
              {jobs.length === 0
                ? "Start a new Bill of Entry or Shipping Bill above."
                : "Try adjusting your search or filter."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(job => (
              <div key={job.id} style={{ background: T.paper, border: `1px solid ${T.line}`,
                borderRadius: 10, padding: "12px 14px" }}>
                {/* Row top */}
                <div style={{ display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".07em",
                        textTransform: "uppercase", padding: "2px 7px", borderRadius: 999,
                        background: job.type === "SB" ? "rgba(200,132,26,.1)" : "rgba(10,22,40,.07)",
                        color: job.type === "SB" ? T.amber : T.navy }}>{job.type}</span>
                      <StageBadge stage={job.stage} />
                      <span style={{ fontSize: 10, color: T.muted }}>{job.filingRef}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink,
                      marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.clientName || job.iec || "—"}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                      {job.blAwbNumber || "No BL/AWB"} · Updated {fmt(job.updatedAt)}
                    </div>
                  </div>
                  <button onClick={() => onOpenJob(job)}
                    style={{ ...G.btn(), ...G.btnNav, fontSize: 11, padding: "7px 14px",
                      flexShrink: 0, whiteSpace: "nowrap" }}>
                    Open →
                  </button>
                </div>

                {/* Stage changer */}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`,
                  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: T.muted }}>Move to:</span>
                  {changingStage === job.id ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {STAGE_ORDER.filter(s => s !== job.stage).map(s => (
                        <button key={s} onClick={() => handleStageChange(job.id, s)}
                          style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999,
                            border: `1px solid ${T.line}`, background: T.wash,
                            cursor: "pointer", color: T.ink, fontWeight: 600 }}>{s}</button>
                      ))}
                      <button onClick={() => setChangingStage(null)}
                        style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999,
                          border: `1px solid ${T.line}`, background: T.paper,
                          cursor: "pointer", color: T.muted }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setChangingStage(job.id)}
                      style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999,
                        border: `1px solid ${T.line}`, background: T.wash,
                        cursor: "pointer", color: T.muted }}>Change stage</button>
                  )}
                </div>

                {/* IceGate status check — shown for Filed and Query Raised */}
                {(job.stage === "Filed" || job.stage === "Query Raised") && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button onClick={() => checkIceGate(job)}
                        disabled={checkingIceGate === job.id}
                        style={{ fontSize: 10, padding: "4px 12px", borderRadius: 999,
                          border: `1px solid #93C5FD`, background: "#EFF6FF", color: T.blue,
                          cursor: "pointer", fontWeight: 600 }}>
                        {checkingIceGate === job.id ? "Checking…" : "🔍 Check IceGate Status"}
                      </button>
                      <button onClick={() => onQueryDraft && onQueryDraft(job)}
                        style={{ fontSize: 10, padding: "4px 12px", borderRadius: 999,
                          border: `1px solid #FECACA`, background: "#FEF2F2", color: T.red,
                          cursor: "pointer", fontWeight: 600 }}>
                        ✍ Draft Query Response
                      </button>
                    </div>
                    {iceGateStatus[job.id] && (
                      <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, fontSize: 11,
                        background: iceGateStatus[job.id].available ? "#F0FDF4" : T.wash,
                        border: `1px solid ${iceGateStatus[job.id].available ? "#BBF7D0" : T.line}`,
                        color: iceGateStatus[job.id].available ? T.green : T.muted }}>
                        {iceGateStatus[job.id].available
                          ? `✓ ${iceGateStatus[job.id].status} — ${iceGateStatus[job.id].meaning}`
                          : <>
                              {iceGateStatus[job.id].message}
                              {" "}<a href={iceGateStatus[job.id].manualUrl} target="_blank" rel="noopener noreferrer"
                                style={{ color: T.blue }}>Check manually →</a>
                            </>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── QUERY RESPONSE DRAFTER PANEL ─────────────────────────────────────────────
function QueryDraftPanel({ job, filing, onClose }) {
  const [queryText, setQueryText] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedMeta, setExtractedMeta] = useState(null); // { beOrSbNumber, queryDate, queryNumber, officerName }
  const fileRef = useRef();

  // ── Upload query document (image/PDF) and extract its text via Gemini ──
  // This solves "where do I upload the query customs sent me" — CHAI does not
  // receive queries automatically from ICEGATE (no such integration exists),
  // but the CHA can upload a screenshot or PDF of the query notice here and
  // CHAI reads the text out of it automatically instead of manual retyping.
  const handleQueryFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true); setError("");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch("/api/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type, mode: "query" }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); }
      else if (d.data?.queryText) {
        setQueryText(d.data.queryText);
        setExtractedMeta({
          beOrSbNumber: d.data.beOrSbNumber, queryDate: d.data.queryDate,
          queryNumber: d.data.queryNumber, officerName: d.data.officerName,
        });
        // Log the query receipt to the audit trail
        try {
          const log = JSON.parse(localStorage.getItem("chai_audit_log") || "[]");
          log.push({
            event: "query_received", jobId: job?.id, filingId: filing?.id,
            beOrSbNumber: d.data.beOrSbNumber, queryDate: d.data.queryDate,
            timestamp: new Date().toISOString(),
          });
          localStorage.setItem("chai_audit_log", JSON.stringify(log));
        } catch {}
      } else {
        setError("Could not read query text from this file. Try a clearer screenshot, or paste the text manually below.");
      }
    } catch (e) { setError(`Upload failed: ${e.message}`); }
    setExtracting(false);
    e.target.value = "";
  };

  const generate = async () => {
    setLoading(true); setError(""); setDraft("");
    try {
      const classifications = (filing?.invoices || []).flatMap(inv =>
        (inv.lineItems || []).map(li => ({
          description: li.description,
          cth: li.proposedCth,
          headingDescription: li.headingDescription || "",
          reasoning: li.reasoning || "",
          confidence: li.confidence || "",
        }))
      );
      const P = loadProfile();
      const r = await fetch("/api/queryDraft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filingRef: job?.filingRef || filing?.id,
          importer: job?.clientName || filing?.iecResult?.name,
          iec: job?.iec || filing?.iec,
          blAwbNumber: job?.blAwbNumber || filing?.blData?.blAwbNumber,
          classifications,
          dutyFigures: filing?.dutyFigures || null,
          queryText,
          chaFirm: P.firmName,
        }),
      });
      const d = await r.json();
      if (d.error) setError(d.error);
      else setDraft(d.draft || "");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const copyDraft = () => {
    navigator.clipboard?.writeText(draft).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const downloadDraft = () => {
    const blob = new Blob([draft], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `query-response-${job?.filingRef || "draft"}.txt`;
    a.click();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: T.paper, width: "100%", maxWidth: 600, maxHeight: "90vh",
        borderRadius: "16px 16px 0 0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 600 }}>Draft Query Response</div>
            <div style={{ fontSize: 11, color: T.muted }}>{job?.filingRef || "Filing"} · {job?.clientName || ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none",
            fontSize: 20, cursor: "pointer", color: T.muted }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={G.label}>Upload the query notice (screenshot or PDF from ICEGATE)</label>
            <input ref={fileRef} type="file" accept=".pdf,image/*"
              style={{ display: "none" }} onChange={handleQueryFileUpload} />
            <button onClick={() => fileRef.current?.click()} disabled={extracting}
              style={{ ...G.btn(), background: "#0369A1", color: "#fff", width: "100%",
                fontSize: 12, opacity: extracting ? .6 : 1 }}>
              {extracting ? "Reading document…" : "📎 Upload Query Notice"}
            </button>
            {extractedMeta && (extractedMeta.beOrSbNumber || extractedMeta.queryDate) && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#F0FDF4",
                border: "1px solid #BBF7D0", borderRadius: 6, fontSize: 11, color: T.green }}>
                ✓ Extracted{extractedMeta.beOrSbNumber ? ` — ${extractedMeta.beOrSbNumber}` : ""}
                {extractedMeta.queryDate ? ` · ${extractedMeta.queryDate}` : ""}
                {extractedMeta.officerName ? ` · ${extractedMeta.officerName}` : ""}
              </div>
            )}
          </div>
          <div style={{ textAlign: "center", fontSize: 10, color: T.muted, margin: "4px 0 12px" }}>— or —</div>
          <div style={{ marginBottom: 12 }}>
            <label style={G.label}>Paste the Customs query text directly</label>
            <textarea value={queryText} onChange={e => setQueryText(e.target.value)}
              placeholder="Paste the query raised by Customs here — e.g. 'Please justify classification under CTH 8517...'"
              style={{ ...G.input, height: 80, resize: "vertical", fontSize: 12 }} />
          </div>
          <button onClick={generate} disabled={loading}
            style={{ ...G.btn(), ...G.btnNav, width: "100%", marginBottom: 14, opacity: loading ? .6 : 1 }}>
            {loading ? "Drafting with AI…" : "Generate Draft Response"}
          </button>
          {error && <div style={{ padding: "10px 12px", background: "#FEF2F2", border: `1px solid #FECACA`,
            borderRadius: 8, fontSize: 12, color: T.red, marginBottom: 12 }}>{error}</div>}
          {draft && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", color: T.muted, marginBottom: 6 }}>
                Draft — review and edit before sending
              </div>
              <textarea value={draft} onChange={e => setDraft(e.target.value)}
                style={{ ...G.input, height: 280, resize: "vertical", fontSize: 12,
                  fontFamily: "Georgia, serif", lineHeight: 1.6 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={copyDraft} style={{ ...G.btn(), ...G.btnNav, flex: 1, fontSize: 12 }}>
                  {copied ? "✓ Copied" : "Copy Text"}
                </button>
                <button onClick={downloadDraft} style={{ ...G.btn(), ...G.btnAmber, flex: 1, fontSize: 12 }}>
                  ⬇ Download .txt
                </button>
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
                AI-generated draft — verify all facts, add your signature, and print on firm letterhead before submission.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── BILLING SCREEN ────────────────────────────────────────────────────────────
const PLANS = [
  { key: "free", name: "Free", price: "₹0", period: "forever",
    features: ["Duty Calculator (public)", "1 user", "10 filings/month", "AI classification", "Discrepancy checker"],
    cta: "Current plan", color: T.muted },
  { key: "starter", name: "Starter", price: "₹2,999", period: "per month",
    features: ["Everything in Free", "3 users", "100 filings/month", "Job Dashboard", "Client Directory", "Email support"],
    cta: "Upgrade to Starter", color: T.blue },
  { key: "professional", name: "Professional", price: "₹6,999", period: "per month",
    features: ["Everything in Starter", "10 users", "Unlimited filings", "CHA Invoice generation", "MIS reports", "Priority support"],
    cta: "Upgrade to Professional", color: T.navy },
  { key: "enterprise", name: "Enterprise", price: "Custom", period: "contact us",
    features: ["Everything in Professional", "Unlimited users", "Multi-port", "Dedicated onboarding", "SLA"],
    cta: "Contact us", color: T.amber },
];

function BillingScreen({ user, onBack }) {
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) getSubscription(user.id).then(s => { setSub(s); setLoading(false); });
    else setLoading(false);
  }, [user]);

  const handleUpgrade = (plan) => {
    if (plan.key === "enterprise") {
      window.open("mailto:hello@customhouseai.in?subject=Enterprise Plan Enquiry", "_blank");
      return;
    }
    // Razorpay integration — opens payment widget
    // Key ID comes from the VITE_RAZORPAY_KEY_ID env var (set in Vercel).
    const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID || "";
    if (!razorpayKeyId) {
      alert("Online payment is not set up yet. Please contact us to upgrade your plan.");
      return;
    }
    if (!window.Razorpay) {
      alert("Payment gateway loading. Please try again in a moment.");
      return;
    }
    const options = {
      key: razorpayKeyId,
      name: "Custom House AI",
      description: `${plan.name} Plan — Monthly`,
      amount: plan.key === "starter" ? 299900 : 699900, // paise
      currency: "INR",
      prefill: { email: user?.email || "" },
      theme: { color: "#0A1628" },
      handler: (response) => {
        // In production: call a webhook to update subscription in Supabase
        alert(`Payment successful! Your plan will be upgraded shortly.\nPayment ID: ${response.razorpay_payment_id}`);
      },
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const currentPlan = sub?.plan || "free";

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}>
          <div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div>
        </div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 40 }}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Plans & Billing</div>
        <div style={G.sub}>Choose the plan that fits your firm. Upgrade anytime.</div>
        {loading ? <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div> : (
          <>
            {sub && (
              <div style={{ padding: "10px 14px", background: "#DBEAFE", border: "1px solid #93C5FD",
                borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
                <strong>Current plan:</strong> {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                {sub.current_period_end && ` · renews ${new Date(sub.current_period_end).toLocaleDateString("en-IN")}`}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {PLANS.map(plan => (
                <div key={plan.key} style={{ border: `1px solid ${plan.key === "professional" ? T.navy : T.line}`,
                  borderRadius: 12, padding: 16, background: plan.key === "professional" ? "#F8FAFF" : T.paper }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 600, color: plan.color }}>
                        {plan.name}
                        {plan.key === "professional" && <span style={{ fontSize: 10, background: T.navy, color: "#fff",
                          padding: "2px 8px", borderRadius: 999, marginLeft: 8, verticalAlign: "middle" }}>POPULAR</span>}
                      </div>
                      <div style={{ fontSize: 12, color: T.muted }}>{plan.period}</div>
                    </div>
                    <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.ink }}>
                      {plan.price}
                    </div>
                  </div>
                  <ul style={{ margin: "0 0 12px 0", padding: "0 0 0 16px", fontSize: 12, color: T.muted, lineHeight: 1.8 }}>
                    {plan.features.map(f => <li key={f}>{f}</li>)}
                  </ul>
                  <button
                    disabled={plan.key === currentPlan}
                    onClick={() => handleUpgrade(plan)}
                    style={{ ...G.btn(), width: "100%", fontSize: 12,
                      background: plan.key === currentPlan ? T.line : plan.color === T.navy ? T.navy : plan.color,
                      color: plan.key === currentPlan ? T.muted : "#fff",
                      cursor: plan.key === currentPlan ? "default" : "pointer" }}>
                    {plan.key === currentPlan ? "✓ Current plan" : plan.cta}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, padding: "12px 14px", background: T.wash,
              border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 11, color: T.muted }}>
              Payments processed securely via Razorpay. GST @ 18% applicable. Cancel anytime.
              Questions? Email <a href="mailto:hello@customhouseai.in" style={{ color: T.blue }}>hello@customhouseai.in</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── CHA INVOICE SCREEN ─────────────────────────────────────────────────────────
function ChaInvoiceScreen({ user, onBack }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = list, {} = new, {id:...} = edit
  const [saving, setSaving] = useState(false);

  const reload = () => {
    if (user) getChaInvoices(user.id).then(d => { setInvoices(d); setLoading(false); });
  };
  useEffect(() => { reload(); }, [user]);

  const blankInv = () => ({
    client_name: "", client_iec: "", invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    invoice_date: new Date().toISOString().slice(0, 10),
    items: [{ description: "Customs clearance charges", amount: 0 }],
    gst_rate: 18, notes: "", status: "draft",
  });

  const calcTotals = (inv) => {
    const subtotal = (inv.items || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const gst_amount = subtotal * (inv.gst_rate / 100);
    return { subtotal, gst_amount, total: subtotal + gst_amount };
  };

  const save = async () => {
    setSaving(true);
    const totals = calcTotals(editing);
    try {
      await saveChaInvoice(user.id, { ...editing, ...totals });
      reload(); setEditing(null);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const statusColor = (s) => s === "paid" ? T.green : s === "overdue" ? T.red : s === "sent" ? T.blue : T.muted;

  const fmtINR = (n) => "₹" + (parseFloat(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  if (editing !== null) {
    const inv = editing;
    const { subtotal, gst_amount, total } = calcTotals(inv);
    const set = (k, v) => setEditing(p => ({ ...p, [k]: v }));
    return (
      <div style={G.body}>
        <div style={G.hdr}>
          <div style={G.brand}><div style={G.mark}>C</div>
            <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
          <button onClick={() => setEditing(null)} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Cancel</button>
        </div>
        <div style={{ ...G.main, paddingBottom: 80 }}>
          <div style={{ height: 16 }} />
          <div style={G.title}>{inv.id ? "Edit Invoice" : "New Invoice"}</div>
          <div style={G.row2}>
            <Field label="Client Name" value={inv.client_name} onChange={v => set("client_name", v)} />
            <Field label="Client IEC" value={inv.client_iec} onChange={v => set("client_iec", v)} />
          </div>
          <div style={G.row2}>
            <Field label="Invoice Number" value={inv.invoice_number} onChange={v => set("invoice_number", v)} />
            <Field label="Invoice Date" value={inv.invoice_date} onChange={v => set("invoice_date", v)} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, margin: "12px 0 8px" }}>Line Items</div>
          {(inv.items || []).map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input value={item.description} onChange={e => {
                  const items = [...inv.items]; items[i] = { ...item, description: e.target.value };
                  set("items", items);
                }} placeholder="Service description"
                style={{ ...G.input, flex: 3, fontSize: 12, padding: "8px 10px" }} />
              <input value={item.amount} onChange={e => {
                  const items = [...inv.items]; items[i] = { ...item, amount: e.target.value };
                  set("items", items);
                }} placeholder="₹" type="number"
                style={{ ...G.input, flex: 1, fontSize: 12, padding: "8px 10px" }} />
              <button onClick={() => set("items", inv.items.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          ))}
          <button onClick={() => set("items", [...(inv.items || []), { description: "", amount: 0 }])}
            style={{ ...G.btn(), ...G.btnBack, fontSize: 12, marginBottom: 12 }}>+ Add line</button>
          <div style={G.row2}>
            <div>
              <label style={G.label}>GST Rate (%)</label>
              <select value={inv.gst_rate} onChange={e => set("gst_rate", parseFloat(e.target.value))}
                style={{ ...G.input, fontSize: 12 }}>
                {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label style={G.label}>Status</label>
              <select value={inv.status} onChange={e => set("status", e.target.value)}
                style={{ ...G.input, fontSize: 12 }}>
                {["draft","sent","paid","overdue"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ padding: "12px 14px", background: T.wash, border: `1px solid ${T.line}`,
            borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: T.muted }}>Subtotal</span><span>{fmtINR(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: T.muted }}>GST ({inv.gst_rate}%)</span><span>{fmtINR(gst_amount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14,
              fontWeight: 700, borderTop: `1px solid ${T.line}`, paddingTop: 8, marginTop: 4 }}>
              <span>Total</span><span style={{ color: T.navy }}>{fmtINR(total)}</span>
            </div>
          </div>
          <Field label="Notes (optional)" value={inv.notes} onChange={v => set("notes", v)} />
        </div>
        <div style={G.foot}>
          <button onClick={() => setEditing(null)} style={{ ...G.btn(), ...G.btnBack }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...G.btn(), ...G.btnNav }}>
            {saving ? "Saving…" : "Save Invoice"}
          </button>
        </div>
      </div>
    );
  }

  const totalOutstanding = invoices.filter(i => i.status !== "paid").reduce((s, i) => s + (i.total || 0), 0);
  const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}><div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 80 }}>
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={G.title}>CHA Invoices</div>
            <div style={G.sub}>Invoice your clients for clearance services.</div>
          </div>
          <button onClick={() => setEditing(blankInv())}
            style={{ ...G.btn(), ...G.btnNav, fontSize: 12, padding: "9px 16px" }}>+ New Invoice</button>
        </div>
        {/* MIS summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Outstanding", value: fmtINR(totalOutstanding), color: T.amber },
            { label: "Collected (paid)", value: fmtINR(totalPaid), color: T.green },
          ].map(m => (
            <div key={m.label} style={{ padding: "12px 14px", background: T.wash,
              border: `1px solid ${T.line}`, borderRadius: 10 }}>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: m.color }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
        {loading ? <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>
          : invoices.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: T.muted }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No invoices yet</div>
              <div style={{ fontSize: 12 }}>Create your first invoice above.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {invoices.map(inv => (
                <div key={inv.id} onClick={() => setEditing(inv)}
                  style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 10,
                    padding: "12px 14px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{inv.client_name || "—"}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>{inv.invoice_number} · {inv.invoice_date}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{fmtINR(inv.total)}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                        background: inv.status === "paid" ? "#F0FDF4" : inv.status === "overdue" ? "#FEF2F2" : "#EFF6FF",
                        color: statusColor(inv.status) }}>{inv.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ── MIS REPORT SCREEN ─────────────────────────────────────────────────────────
function MISScreen({ user, onBack }) {
  const [jobs, setJobs] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const j = Jobs.all(user.id);
    setJobs(j);
    getChaInvoices(user.id).then(inv => { setInvoices(inv); setLoading(false); });
  }, [user]);

  const fmtINR = (n) => "₹" + (parseFloat(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 0 });
  const thisMonth = new Date().toISOString().slice(0, 7);

  const beCount = jobs.filter(j => j.type === "BE").length;
  const sbCount = jobs.filter(j => j.type === "SB").length;
  const clearedCount = jobs.filter(j => j.stage === "Cleared").length;
  const activeCount = jobs.filter(j => !["Cleared", "Draft"].includes(j.stage)).length;
  const thisMonthJobs = jobs.filter(j => (j.createdAt || "").startsWith(thisMonth)).length;
  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
  const outstanding = invoices.filter(i => i.status !== "paid" && i.status !== "draft").reduce((s, i) => s + (i.total || 0), 0);

  const stageBreakdown = STAGE_ORDER.map(stage => ({
    stage, count: jobs.filter(j => j.stage === stage).length
  })).filter(s => s.count > 0);

  const stats = [
    { label: "Total Filings", value: jobs.length, icon: "📁" },
    { label: "Bills of Entry", value: beCount, icon: "📥" },
    { label: "Shipping Bills", value: sbCount, icon: "📤" },
    { label: "Cleared", value: clearedCount, icon: "✅" },
    { label: "Active", value: activeCount, icon: "🔄" },
    { label: "This Month", value: thisMonthJobs, icon: "📅" },
    { label: "Revenue Collected", value: fmtINR(totalRevenue), icon: "💰" },
    { label: "Outstanding", value: fmtINR(outstanding), icon: "⏳" },
  ];

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}><div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 40 }}>
        <div style={{ height: 16 }} />
        <div style={G.title}>MIS Report</div>
        <div style={G.sub}>Management information summary for your firm.</div>
        {loading ? <div style={{ color: T.muted }}>Loading…</div> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {stats.map(s => (
                <div key={s.label} style={{ padding: "12px 14px", background: T.wash,
                  border: `1px solid ${T.line}`, borderRadius: 10 }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.navy }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 14px", background: T.paper, border: `1px solid ${T.line}`,
              borderRadius: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
                textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>Filing Pipeline</div>
              {stageBreakdown.length === 0 ? <div style={{ fontSize: 12, color: T.muted }}>No filings yet.</div> :
                stageBreakdown.map(s => {
                  const m = STAGE_META[s.stage];
                  const pct = Math.round((s.count / jobs.length) * 100);
                  return (
                    <div key={s.stage} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: m?.color || T.muted, fontWeight: 600 }}>{s.stage}</span>
                        <span style={{ color: T.muted }}>{s.count} filing{s.count !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ height: 6, background: T.line, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: m?.color || T.muted, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
            </div>
            <div style={{ fontSize: 11, color: T.muted, textAlign: "center", padding: "8px 0" }}>
              Data sourced from local session. Export to Excel coming in a future update.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── TEAM MEMBERS SCREEN ────────────────────────────────────────────────────────
// ── BATCH DUTY FORECAST ────────────────────────────────────────────────────────
// Lets a CHA quote a client with multiple SKUs at once, instead of one at a time
// on the public Duty Calculator. Uses the same duty engine — no new calculation logic.
function BatchForecastScreen({ onBack }) {
  const blankRow = () => ({ id: Date.now() + Math.random(), description: "", cth: "", value: "", currency: "INR" });
  const [rows, setRows] = useState([blankRow()]);
  const [classifying, setClassifying] = useState({}); // rowId -> bool
  const [results, setResults] = useState({}); // rowId -> duty result

  const updateRow = (id, patch) => setRows(p => p.map(r => r.id === id ? { ...r, ...patch } : r));
  const addRow = () => setRows(p => [...p, blankRow()]);
  const removeRow = (id) => { setRows(p => p.filter(r => r.id !== id)); setResults(p => { const n = { ...p }; delete n[id]; return n; }); };

  const classifyRow = async (row) => {
    if (!row.description.trim()) return;
    setClassifying(p => ({ ...p, [row.id]: true }));
    try {
      const r = await fetch("/api/classify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ description: row.description.trim() }] }),
      });
      const d = await safeJson(r);
      const c = d.classifications?.[0];
      if (c?.proposedCth) updateRow(row.id, { cth: c.proposedCth, cthDesc: stripMd(c.headingDescription || "") });
    } catch {}
    setClassifying(p => ({ ...p, [row.id]: false }));
  };

  const calcAll = () => {
    const out = {};
    rows.forEach(row => {
      if (!row.cth || !row.value) return;
      const d = getDutyNum(row.cth);
      const avINR = row.currency === "INR" ? parseFloat(row.value) || 0 : (parseFloat(row.value) || 0) * 87; // fallback rate for quick estimate
      const bcdAmt = avINR * (d.bcd / 100);
      const swsAmt = bcdAmt * 0.10;
      const aidcAmt = avINR * ((d.aidc || 0) / 100);
      const healthAmt = avINR * ((d.healthCess || 0) / 100);
      const igstBase = avINR + bcdAmt + swsAmt + aidcAmt + healthAmt;
      const igstAmt = igstBase * (d.igst / 100);
      const compAmt = avINR * ((d.compCess || 0) / 100);
      const totalDuty = bcdAmt + swsAmt + aidcAmt + healthAmt + igstAmt + compAmt;
      out[row.id] = { avINR, bcdAmt, swsAmt, igstAmt, totalDuty, landed: avINR + totalDuty, conf: getDuty(row.cth).conf };
    });
    setResults(out);
  };

  const grandTotal = Object.values(results).reduce((s, r) => s + r.totalDuty, 0);
  const grandLanded = Object.values(results).reduce((s, r) => s + r.landed, 0);
  const fmtINR = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  const exportBatch = () => {
    const P = loadProfile();
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const validRows = rows.filter(r => results[r.id]);
    const bodyRows = validRows.map(r => {
      const res = results[r.id];
      return `<tr>
        <td>${r.description}</td>
        <td style="font-family:monospace">${r.cth}</td>
        <td class="num">${fmtINR(res.avINR)}</td>
        <td class="num">${fmtINR(res.totalDuty)}</td>
        <td class="num">${fmtINR(res.landed)}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Batch Duty Estimate</title>
<style>
  @page { margin: 15mm; }
  body { font-family: Georgia, serif; color: #141821; font-size: 12px; }
  h1 { font-size: 16px; color: #0A1628; margin-bottom: 2px; }
  .sub { font-size: 10px; color: #6B7280; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #6B7280; padding: 6px 8px; border-bottom: 1px solid #0A1628; }
  td { padding: 7px 8px; border-bottom: 1px solid #E5E7EB; font-size: 11px; }
  .num { text-align: right; font-family: monospace; }
  .total-row td { font-weight: 700; font-size: 13px; border-top: 2px solid #0A1628; color: #0A1628; }
  .disclaimer { margin-top: 16px; padding: 10px 12px; background: #FEF9C3; border: 1px solid #FDE68A; border-radius: 6px; font-size: 10px; color: #92400E; }
</style></head><body>
  <h1>${P.firmName || "Custom House Agent"} — Batch Duty Estimate</h1>
  <div class="sub">${today} · ${validRows.length} items</div>
  <table>
    <thead><tr><th>Description</th><th>CTH</th><th style="text-align:right">Value</th><th style="text-align:right">Duty</th><th style="text-align:right">Landed Cost</th></tr></thead>
    <tbody>${bodyRows}
      <tr class="total-row"><td colspan="3">Total</td><td class="num">${fmtINR(grandTotal)}</td><td class="num">${fmtINR(grandLanded)}</td></tr>
    </tbody>
  </table>
  <div class="disclaimer">⚠ Indicative estimate only. Actual duty determined at filing based on complete documentation and customs assessment.</div>
</body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}><div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 100 }}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Batch Duty Forecast</div>
        <div style={G.sub}>Quote a client with multiple items at once. No filing created.</div>

        {rows.map((row, i) => (
          <div key={row.id} style={{ border: `1px solid ${T.line}`, borderRadius: 10,
            padding: 12, marginBottom: 10, background: T.paper }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <input value={row.description} onChange={e => updateRow(row.id, { description: e.target.value })}
                  placeholder={`Item ${i + 1} description`}
                  style={{ ...G.input, fontSize: 12, padding: "8px 10px" }} />
              </div>
              <button onClick={() => removeRow(row.id)} disabled={rows.length === 1}
                style={{ background: "none", border: "none", color: rows.length === 1 ? T.line : T.red,
                  cursor: rows.length === 1 ? "default" : "pointer", fontSize: 18, padding: "4px 8px" }}>×</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={row.cth} onChange={e => updateRow(row.id, { cth: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                placeholder="CTH (8-digit)"
                style={{ ...G.input, width: 110, fontSize: 12, padding: "8px 10px", fontFamily: "monospace" }} />
              <button onClick={() => classifyRow(row)} disabled={classifying[row.id] || !row.description.trim()}
                style={{ ...G.btn(), ...G.btnBack, fontSize: 11, padding: "8px 10px", whiteSpace: "nowrap" }}>
                {classifying[row.id] ? "…" : "AI Suggest"}
              </button>
              <input value={row.value} onChange={e => updateRow(row.id, { value: e.target.value.replace(/[^0-9.]/g, "") })}
                placeholder="Value"
                style={{ ...G.input, flex: 1, fontSize: 12, padding: "8px 10px" }} />
              <select value={row.currency} onChange={e => updateRow(row.id, { currency: e.target.value })}
                style={{ ...G.input, width: 70, fontSize: 12, padding: "8px 6px" }}>
                <option>INR</option><option>USD</option><option>EUR</option>
              </select>
            </div>
            {row.cthDesc && <div style={{ fontSize: 10, color: T.muted, marginTop: 6 }}>{row.cthDesc}</div>}
            {results[row.id] && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}`,
                display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: T.muted }}>Duty: <strong style={{ color: T.ink }}>{fmtINR(results[row.id].totalDuty)}</strong></span>
                <span style={{ color: T.muted }}>Landed: <strong style={{ color: T.navy }}>{fmtINR(results[row.id].landed)}</strong></span>
              </div>
            )}
          </div>
        ))}

        <button onClick={addRow} style={{ ...G.btn(), ...G.btnBack, width: "100%", fontSize: 12, marginBottom: 16 }}>
          + Add Item
        </button>

        {grandTotal > 0 && (
          <div style={{ padding: "14px 16px", background: T.wash, border: `1px solid ${T.line}`,
            borderRadius: 10, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
              <span>Total Duty ({Object.keys(results).length} items)</span>
              <span style={{ color: T.navy }}>{fmtINR(grandTotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginTop: 4 }}>
              <span>Total Landed Cost</span>
              <span style={{ color: T.navy }}>{fmtINR(grandLanded)}</span>
            </div>
          </div>
        )}
      </div>
      <div style={G.foot}>
        <button onClick={calcAll} style={{ ...G.btn(), ...G.btnNav, flex: 1 }}>Calculate All</button>
        {grandTotal > 0 && (
          <button onClick={exportBatch} style={{ ...G.btn(), ...G.btnAmber, flex: 1 }}>⬇ Share Estimate</button>
        )}
      </div>
    </div>
  );
}

// ── RATES ADMIN — manual exchange rate update (no external API needed) ────────
// CBIC blocks automated scraping (confirmed 403). Instead of fighting that,
// this screen lets the CHA update rates in 2 minutes, twice a month, matching
// how every CHA firm in India already handles this today. Stored in the
// existing Google Sheet via /api/exchangeRates — same data layer as everything else.
const DEFAULT_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CNY", "SGD", "AED", "CHF", "AUD", "HKD"];

function RatesAdminScreen({ onBack }) {
  const [rates, setRates] = useState({});
  const [notification, setNotification] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("info");

  useEffect(() => {
    fetch("/api/exchangeRates")
      .then(r => r.json())
      .then(d => {
        if (d.error) { setMsg(d.error); setMsgType("warn"); }
        const initial = {};
        DEFAULT_CURRENCIES.forEach(c => {
          initial[c] = d.rates?.[c] || { import: "", export: "" };
        });
        setRates(initial);
        setNotification(d.notification || "");
        setEffectiveDate(d.effectiveDate || "");
        setLoading(false);
      })
      .catch(e => { setMsg(`Could not load rates: ${e.message}`); setMsgType("warn"); setLoading(false); });
  }, []);

  const updateRate = (currency, field, value) => {
    setRates(p => ({ ...p, [currency]: { ...p[currency], [field]: value } }));
  };

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      const cleanRates = {};
      Object.entries(rates).forEach(([c, r]) => {
        if (r.import || r.export) {
          cleanRates[c] = { import: parseFloat(r.import) || 0, export: parseFloat(r.export) || 0 };
        }
      });
      const r = await fetch("/api/exchangeRates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification, effectiveDate, rates: cleanRates }),
      });
      const d = await r.json();
      if (d.error) { setMsg(d.error); setMsgType("warn"); }
      else { setMsg(`✓ Saved — ${d.count} currencies updated. All calculators will use these rates immediately.`); setMsgType("ok"); }
    } catch (e) { setMsg(`Save failed: ${e.message}`); setMsgType("warn"); }
    setSaving(false);
  };

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}><div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 100 }}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Exchange Rates</div>
        <div style={G.sub}>
          Update twice a month when CBIC publishes new rates. Takes 2 minutes — no developer needed.
        </div>

        <div style={{ padding: "10px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE",
          borderRadius: 8, marginBottom: 16, fontSize: 11, color: T.blue, lineHeight: 1.5 }}>
          Check the latest rate at <a href="https://www.cbic.gov.in/entities/customs-manual-notfns-cbec-english"
            target="_blank" rel="noopener noreferrer" style={{ color: T.blue }}>cbic.gov.in</a> under
          Exchange Rate Notifications, then enter the figures below.
        </div>

        {loading ? <div style={{ color: T.muted, fontSize: 13 }}>Loading current rates…</div> : (
          <>
            <div style={G.row2}>
              <Field label="Notification Reference" value={notification} onChange={setNotification}
                placeholder="e.g. Notification No. 52/2026-Customs (N.T.)" />
              <Field label="Effective Date" value={effectiveDate} onChange={setEffectiveDate}
                placeholder="YYYY-MM-DD" />
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: T.muted, margin: "16px 0 8px" }}>
              Rates (₹ per unit foreign currency)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr", gap: 8,
              fontSize: 10, color: T.muted, fontWeight: 700, marginBottom: 6, padding: "0 2px" }}>
              <span>CCY</span><span>Import Rate</span><span>Export Rate</span>
            </div>
            {DEFAULT_CURRENCIES.map(c => (
              <div key={c} style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", fontSize: 12, fontWeight: 700, color: T.ink }}>{c}</div>
                <input value={rates[c]?.import || ""} onChange={e => updateRate(c, "import", e.target.value)}
                  placeholder="0.00" type="number" step="0.01"
                  style={{ ...G.input, fontSize: 12, padding: "8px 10px" }} />
                <input value={rates[c]?.export || ""} onChange={e => updateRate(c, "export", e.target.value)}
                  placeholder="0.00" type="number" step="0.01"
                  style={{ ...G.input, fontSize: 12, padding: "8px 10px" }} />
              </div>
            ))}

            {msg && (
              <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, marginTop: 10,
                background: msgType === "ok" ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${msgType === "ok" ? "#BBF7D0" : "#FECACA"}`,
                color: msgType === "ok" ? T.green : T.red }}>
                {msg}
              </div>
            )}
          </>
        )}
      </div>
      <div style={G.foot}>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack }}>Cancel</button>
        <button onClick={save} disabled={saving || loading} style={{ ...G.btn(), ...G.btnNav }}>
          {saving ? "Saving…" : "Save Rates"}
        </button>
      </div>
    </div>
  );
}

// ── AUDIT TRAIL VIEWER ────────────────────────────────────────────────────────
// CHAI's core USP is "every decision is logged" — but the log was write-only.
// This screen makes it visible, filterable, and exportable.
const AUDIT_EVENT_META = {
  discrepancy_acknowledged: { icon: "⚠", label: "Discrepancy Acknowledged", color: T.red },
  stage_change:             { icon: "🔄", label: "Filing Stage Changed", color: T.blue },
  query_received:           { icon: "📨", label: "Customs Query Received", color: "#B45309" },
};

function AuditTrailScreen({ user, onBack }) {
  const [entries, setEntries] = useState([]);
  const [filterEvent, setFilterEvent] = useState("All");
  const [filterFiling, setFilterFiling] = useState("");

  useEffect(() => {
    try {
      const log = JSON.parse(localStorage.getItem("chai_audit_log") || "[]");
      // Most recent first
      setEntries(log.slice().reverse());
    } catch { setEntries([]); }
  }, []);

  const eventTypes = ["All", ...new Set(entries.map(e => e.event))];

  const filtered = entries.filter(e => {
    const matchEvent = filterEvent === "All" || e.event === filterEvent;
    const q = filterFiling.toLowerCase();
    const matchFiling = !q ||
      (e.filingId || "").toLowerCase().includes(q) ||
      (e.jobId || "").toLowerCase().includes(q);
    return matchEvent && matchFiling;
  });

  const fmt = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) + " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const exportLog = () => {
    const P = loadProfile();
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const rows = filtered.map(e => {
      const meta = AUDIT_EVENT_META[e.event] || { label: e.event, icon: "•" };
      let detail = "";
      if (e.event === "discrepancy_acknowledged") {
        detail = (e.mismatches || []).map(m => `${m.field}: Invoice="${m.invoiceValue}" vs BL="${m.blValue}"`).join("; ");
      } else if (e.event === "stage_change") {
        detail = `Moved to stage: ${e.stage}`;
      }
      return `<tr>
        <td>${fmt(e.timestamp)}</td>
        <td>${meta.label}</td>
        <td>${e.filingId || e.jobId || "—"}</td>
        <td>${detail}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Audit Trail Export</title>
<style>
  @page { margin: 15mm; }
  body { font-family: Georgia, serif; color: #141821; font-size: 11px; }
  h1 { font-size: 16px; color: #0A1628; margin-bottom: 2px; }
  .sub { font-size: 10px; color: #6B7280; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #6B7280; padding: 6px 8px; border-bottom: 1px solid #0A1628; }
  td { padding: 6px 8px; border-bottom: 1px solid #E5E7EB; font-size: 10px; vertical-align: top; }
  .footer { margin-top: 20px; font-size: 9px; color: #9CA3AF; text-align: center; }
</style></head><body>
  <h1>${P.firmName || "Custom House AI"} — Audit Trail Export</h1>
  <div class="sub">Generated ${today} · ${filtered.length} entries · Every decision logged per CHAI governing principle</div>
  <table>
    <thead><tr><th>Timestamp</th><th>Event</th><th>Filing Reference</th><th>Detail</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">This log is generated from CHAI's local audit trail. "The system advises, the CHA decides, every decision is logged."</div>
</body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}><div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 40 }}>
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={G.title}>Audit Trail</div>
            <div style={G.sub}>Every CHA decision logged with timestamp — full transparency for customs defensibility.</div>
          </div>
          {filtered.length > 0 && (
            <button onClick={exportLog}
              style={{ ...G.btn(), ...G.btnAmber, fontSize: 11, padding: "8px 14px", whiteSpace: "nowrap" }}>
              ⬇ Export
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <select value={filterEvent} onChange={e => setFilterEvent(e.target.value)}
            style={{ ...G.input, width: "auto", fontSize: 12, padding: "8px 12px" }}>
            {eventTypes.map(t => (
              <option key={t} value={t}>{t === "All" ? "All events" : (AUDIT_EVENT_META[t]?.label || t)}</option>
            ))}
          </select>
          <input value={filterFiling} onChange={e => setFilterFiling(e.target.value)}
            placeholder="Search filing reference…"
            style={{ ...G.input, flex: 1, minWidth: 160, fontSize: 12, padding: "8px 12px" }} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: T.muted }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📜</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No audit entries yet</div>
            <div style={{ fontSize: 12 }}>
              Entries appear here when a discrepancy is acknowledged or a filing stage changes.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((e, i) => {
              const meta = AUDIT_EVENT_META[e.event] || { icon: "•", label: e.event, color: T.muted };
              return (
                <div key={i} style={{ background: T.paper, border: `1px solid ${T.line}`,
                  borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{meta.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>{fmt(e.timestamp)}</div>
                      </div>
                    </div>
                    {(e.filingId || e.jobId) && (
                      <div style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
                        {e.filingId || e.jobId}
                      </div>
                    )}
                  </div>
                  {e.event === "discrepancy_acknowledged" && (e.mismatches || []).length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
                      {e.mismatches.map((m, j) => (
                        <div key={j} style={{ fontSize: 11, color: T.ink, marginBottom: 3 }}>
                          <strong>{m.field}:</strong> Invoice = <code>{m.invoiceValue || "—"}</code>,
                          {" "}BL/AWB = <code>{m.blValue || "—"}</code>
                        </div>
                      ))}
                    </div>
                  )}
                  {e.event === "stage_change" && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}`, fontSize: 11, color: T.ink }}>
                      Moved to stage: <strong>{e.stage}</strong>
                    </div>
                  )}
                  {e.event === "query_received" && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}`, fontSize: 11, color: T.ink }}>
                      {e.beOrSbNumber && <>BE/SB: <strong>{e.beOrSbNumber}</strong>{" "}</>}
                      {e.queryDate && <>· Query dated: <strong>{e.queryDate}</strong></>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamScreen({ user, onBack }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("junior");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState("");

  const reload = () => {
    if (user) getFirmMembers(user.id).then(m => { setMembers(m); setLoading(false); });
  };
  useEffect(() => { reload(); }, [user]);

  const doInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true); setMsg("");
    try {
      // Simple approach: show the invite link the new user should use
      // Full server-side invite requires Supabase service role key
      setMsg(`Share this with ${inviteEmail}: Ask them to sign up at your app URL, then you can add them here by their registered email. Full team invite via email coming in next update.`);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    setInviting(false);
  };

  const roleLabel = { owner: "Owner", senior: "Senior CHA", junior: "Junior Operator" };
  const roleColor = { owner: T.amber, senior: T.navy, junior: T.muted };

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}><div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 40 }}>
        <div style={{ height: 16 }} />
        <div style={G.title}>Team Members</div>
        <div style={G.sub}>Manage who can access your firm's filings.</div>

        <div style={{ padding: "12px 14px", background: "#FEF9C3", border: "1px solid #FDE68A",
          borderRadius: 8, marginBottom: 16, fontSize: 12, color: "#92400E" }}>
          ⚠ Multi-user access requires a Starter plan or above. Upgrade in Plans & Billing.
        </div>

        {/* Invite form */}
        <div style={{ padding: "14px", background: T.wash, border: `1px solid ${T.line}`,
          borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>Invite Team Member</div>
          <Field label="Email address" value={inviteEmail} onChange={setInviteEmail} placeholder="operator@yourfirm.com" />
          <div style={{ marginBottom: 10 }}>
            <label style={G.label}>Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              style={{ ...G.input, fontSize: 12 }}>
              <option value="senior">Senior CHA — can file and view all jobs</option>
              <option value="junior">Junior Operator — can file, views own jobs only</option>
            </select>
          </div>
          <button onClick={doInvite} disabled={inviting}
            style={{ ...G.btn(), ...G.btnNav, fontSize: 12, width: "100%" }}>
            {inviting ? "Inviting…" : "Invite Member"}
          </button>
          {msg && <div style={{ marginTop: 10, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{msg}</div>}
        </div>

        {/* Members list */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>Current Members</div>
        {loading ? <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>
          : members.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: T.muted }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>👥</div>
              <div style={{ fontSize: 13 }}>You are the only member. Invite your team above.</div>
            </div>
          ) : members.map(m => (
            <div key={m.id} style={{ padding: "12px 14px", background: T.paper,
              border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{m.user_id}</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                  background: T.wash, color: roleColor[m.role] || T.muted }}>{roleLabel[m.role] || m.role}</span>
              </div>
              {m.user_id !== user?.id && (
                <button onClick={() => { removeMember(user.id, m.user_id).then(reload); }}
                  style={{ fontSize: 11, color: T.red, background: "none", border: "none", cursor: "pointer" }}>
                  Remove
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// ── IMPORTER / EXPORTER PORTAL ────────────────────────────────────────────────
// Separate, simplified portal for importers and exporters who file directly
// through CHAI without their own CHA. A CHA partner is auto-assigned.
// Pricing is read from Supabase admin_settings (editable without redeploy).

const IMP_STAGE_META = {
  "Draft":            { color: "#6B7280", bg: "#F3F4F6", label: "Draft" },
  "Documents Uploaded": { color: "#2563EB", bg: "#DBEAFE", label: "Docs Uploaded" },
  "Under CHA Review": { color: "#C8841A", bg: "#FEF9C3", label: "Under Review" },
  "Filed":            { color: "#7C3AED", bg: "#F3E8FF", label: "Filed" },
  "Query Raised":     { color: "#DC2626", bg: "#FEE2E2", label: "Query Raised" },
  "Cleared":          { color: "#16A34A", bg: "#F0FDF4", label: "Cleared" },
};

function calcImporterFee(itemCount, settings) {
  const simple = parseInt(settings.imp_simple_price || "1499");
  const simpleLimit = parseInt(settings.imp_simple_items || "5");
  const standard = parseInt(settings.imp_standard_price || "2499");
  const standardLimit = parseInt(settings.imp_standard_items || "15");
  const complex = parseInt(settings.imp_complex_price || "3999");
  const platform = parseInt(settings.platform_fee || "250");
  let base = itemCount <= simpleLimit ? simple
    : itemCount <= standardLimit ? standard : complex;
  const tier = itemCount <= simpleLimit ? "Simple"
    : itemCount <= standardLimit ? "Standard" : "Complex";
  return { base, platform, total: base + platform, tier };
}

function ImporterPortal({ user, onLogout }) {
  const [filings, setFilings] = useState([]);
  const [settings, setSettings] = useState({});
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard"); // dashboard | new | detail
  const [activeFiling, setActiveFiling] = useState(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getImporterFilings(user.id),
      getAdminSettings(),
      getImporterProfile(user.id),
    ]).then(([f, s, p]) => {
      setFilings(f); setSettings(s); setProfile(p); setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const assignedCha = settings.assigned_cha_name || "CHAI Partner CHA";
  const assignedContact = settings.assigned_cha_contact || "support@customhouseai.in";

  const fmt = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (view === "new") return (
    <ImporterNewFiling user={user} settings={settings} assignedCha={assignedCha}
      onBack={() => setView("dashboard")}
      onSaved={(f) => { setFilings(p => [f, ...p]); setView("dashboard"); }} />
  );

  if (view === "detail" && activeFiling) return (
    <ImporterFilingDetail filing={activeFiling} settings={settings}
      assignedCha={assignedCha} assignedContact={assignedContact}
      onBack={() => { setView("dashboard"); setActiveFiling(null); }} />
  );

  return (
    <div style={G.body}>
      {/* Header */}
      <div style={G.hdr}>
        <div style={G.brand}>
          <div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 11, color: T.muted, textAlign: "right" }}>
            <div style={{ fontWeight: 600, color: T.ink }}>
              {profile?.company_name || user?.email}
            </div>
            <div>Importer / Exporter</div>
          </div>
          <button onClick={onLogout}
            style={{ fontSize: 11, color: T.muted, background: "none",
              border: `1px solid ${T.line}`, borderRadius: 6, padding: "5px 10px",
              cursor: "pointer" }}>Sign out</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: "16px 16px 80px", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600 }}>
              My Filings
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              {filings.length} filing{filings.length !== 1 ? "s" : ""} submitted
            </div>
          </div>
          <button onClick={() => setView("new")}
            style={{ ...G.btn(), ...G.btnNav, fontSize: 12, padding: "9px 16px" }}>
            + New Filing
          </button>
        </div>

        {/* Assigned CHA card */}
        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE",
          borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.blue, marginBottom: 4 }}>Your Assigned CHA</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.navy }}>{assignedCha}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{assignedContact}</div>
        </div>

        {loading ? (
          <div style={{ color: T.muted, fontSize: 13 }}>Loading your filings…</div>
        ) : filings.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: T.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No filings yet</div>
            <div style={{ fontSize: 12 }}>Start a new Bill of Entry or Shipping Bill above.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filings.map(f => {
              const sm = IMP_STAGE_META[f.stage] || IMP_STAGE_META["Draft"];
              const fee = calcImporterFee(f.item_count || 0, settings);
              return (
                <div key={f.id} onClick={() => { setActiveFiling(f); setView("detail"); }}
                  style={{ background: T.paper, border: `1px solid ${T.line}`,
                    borderRadius: 10, padding: "12px 14px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center",
                        flexWrap: "wrap", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px",
                          borderRadius: 999,
                          background: f.filing_type === "SB" ? "rgba(200,132,26,.1)" : "rgba(10,22,40,.07)",
                          color: f.filing_type === "SB" ? T.amber : T.navy }}>
                          {f.filing_type}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px",
                          borderRadius: 999, background: sm.bg, color: sm.color }}>
                          {sm.label}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px",
                          borderRadius: 999,
                          background: f.payment_status === "paid" ? "#F0FDF4" : "#FEF9C3",
                          color: f.payment_status === "paid" ? T.green : "#92400E" }}>
                          {f.payment_status === "paid" ? "✓ Paid" : "Payment pending"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: T.muted }}>
                        {f.item_count || 0} item{f.item_count !== 1 ? "s" : ""} · {fmt(f.created_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.navy }}>
                        ₹{fee.total.toLocaleString("en-IN")}
                      </div>
                      <div style={{ fontSize: 10, color: T.muted }}>{fee.tier}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ImporterNewFiling({ user, settings, assignedCha, onBack, onSaved }) {
  const [filingType, setFilingType] = useState("BE");
  const [itemCount, setItemCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fee = calcImporterFee(itemCount, settings);
  const fmtINR = (n) => "₹" + n.toLocaleString("en-IN");

  const submit = async () => {
    setSaving(true); setError("");
    try {
      const filing = await saveImporterFiling(user.id, {
        filing_type: filingType, stage: "Draft",
        assigned_cha: assignedCha, item_count: itemCount,
        quoted_fee: fee.total, payment_status: "pending", notes,
      });
      if (filing) onSaved(filing);
      else setError("Could not save filing — please try again.");
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}><div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 100 }}>
        <div style={{ height: 16 }} />
        <div style={G.title}>New Filing Request</div>
        <div style={G.sub}>Tell us about your shipment. Our assigned CHA will handle the filing.</div>

        {/* Filing type */}
        <div style={{ marginBottom: 16 }}>
          <label style={G.label}>Filing type</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["BE", "📥", "Bill of Entry", "Import"],
              ["SB", "📤", "Shipping Bill", "Export"]].map(([k, icon, label, tag]) => (
              <div key={k} onClick={() => setFilingType(k)}
                style={{ border: `2px solid ${filingType === k ? T.navy : T.line}`,
                  borderRadius: 10, padding: "12px", cursor: "pointer",
                  background: filingType === k ? "#EFF6FF" : T.paper }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>{label}</div>
                <div style={{ fontSize: 10, color: T.muted }}>{tag}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Item count */}
        <div style={{ marginBottom: 16 }}>
          <label style={G.label}>Number of line items in your invoice</label>
          <input type="number" min={1} max={200} value={itemCount}
            onChange={e => setItemCount(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ ...G.input, fontSize: 14 }} />
          <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
            Count each distinct product or commodity as one item.
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <label style={G.label}>Any notes or special instructions (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. EPCG licence applicable, FTA claim required..."
            style={{ ...G.input, height: 80, resize: "vertical", fontSize: 12 }} />
        </div>

        {/* Fee summary */}
        <div style={{ padding: "14px 16px", background: T.wash,
          border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>Quoted Fee</div>
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: T.muted }}>{fee.tier} filing ({itemCount} items)</span>
            <span>{fmtINR(fee.base)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 12, marginBottom: 8, paddingBottom: 8,
            borderBottom: `1px solid ${T.line}` }}>
            <span style={{ color: T.muted }}>Platform fee</span>
            <span>{fmtINR(fee.platform)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 15, fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ color: T.navy }}>{fmtINR(fee.total)}</span>
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.4 }}>
            Assigned CHA: {assignedCha}. Payment will be collected before filing begins.
            One round of Customs query response is included.
          </div>
        </div>

        {error && (
          <div style={{ padding: "10px 14px", background: "#FEF2F2",
            border: "1px solid #FECACA", borderRadius: 8, fontSize: 12,
            color: T.red, marginBottom: 12 }}>{error}</div>
        )}
      </div>
      <div style={G.foot}>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack }}>Cancel</button>
        <button onClick={submit} disabled={saving}
          style={{ ...G.btn(), ...G.btnNav, flex: 1 }}>
          {saving ? "Submitting…" : `Submit — ${fmtINR(fee.total)}`}
        </button>
      </div>
    </div>
  );
}

function ImporterFilingDetail({ filing, settings, assignedCha, assignedContact, onBack }) {
  const fee = calcImporterFee(filing.item_count || 0, settings);
  const sm = IMP_STAGE_META[filing.stage] || IMP_STAGE_META["Draft"];
  const fmtINR = (n) => "₹" + n.toLocaleString("en-IN");

  const STAGE_STEPS = ["Draft", "Documents Uploaded", "Under CHA Review", "Filed", "Cleared"];
  const currentIdx = STAGE_STEPS.indexOf(filing.stage);

  return (
    <div style={G.body}>
      <div style={G.hdr}>
        <div style={G.brand}><div style={G.mark}>C</div>
          <div style={G.brandName}>Custom House <span style={{ color: T.amber }}>AI</span></div></div>
        <button onClick={onBack} style={{ ...G.btn(), ...G.btnBack, fontSize: 12 }}>← Back</button>
      </div>
      <div style={{ ...G.main, paddingBottom: 40 }}>
        <div style={{ height: 16 }} />
        <div style={{ display: "flex", justifyContent: "space-between",
          alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={G.title}>{filing.filing_type === "SB" ? "Shipping Bill" : "Bill of Entry"}</div>
            <div style={G.sub}>{filing.item_count} items · Created {new Date(filing.created_at)
              .toLocaleDateString("en-IN")}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px",
            borderRadius: 999, background: sm.bg, color: sm.color }}>{sm.label}</span>
        </div>

        {/* Progress steps */}
        <div style={{ padding: "14px 16px", background: T.wash,
          border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 12 }}>Filing Progress</div>
          {STAGE_STEPS.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 10,
                marginBottom: i < STAGE_STEPS.length - 1 ? 10 : 0 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  background: done ? T.green : active ? T.navy : T.line,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, color: "#fff", fontWeight: 700 }}>
                  {done ? "✓" : i + 1}
                </div>
                <div style={{ fontSize: 12, fontWeight: active ? 700 : 400,
                  color: active ? T.navy : done ? T.green : T.muted }}>{s}</div>
              </div>
            );
          })}
        </div>

        {/* Assigned CHA */}
        <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE",
          borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: T.blue, marginBottom: 4 }}>Assigned CHA</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{assignedCha}</div>
          <div style={{ fontSize: 11, color: T.muted }}>{assignedContact}</div>
        </div>

        {/* Fee and payment */}
        <div style={{ padding: "14px 16px", background: T.wash,
          border: `1px solid ${T.line}`, borderRadius: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {fmtINR(filing.quoted_fee || fee.total)}
              </div>
              <div style={{ fontSize: 10, color: T.muted }}>{fee.tier} filing</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px",
              borderRadius: 999,
              background: filing.payment_status === "paid" ? "#F0FDF4" : "#FEF9C3",
              color: filing.payment_status === "paid" ? T.green : "#92400E" }}>
              {filing.payment_status === "paid" ? "✓ Paid" : "Payment pending"}
            </span>
          </div>
          {filing.payment_status !== "paid" && (
            <button style={{ ...G.btn(), ...G.btnNav, width: "100%", fontSize: 13 }}
              onClick={() => alert("Payment integration coming soon. We will contact you to complete payment.")}>
              Proceed to Payment
            </button>
          )}
        </div>

        {filing.notes && (
          <div style={{ padding: "12px 14px", background: T.paper,
            border: `1px solid ${T.line}`, borderRadius: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: T.muted, marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.5 }}>{filing.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function AppInner() {
  const [screen, setScreen] = useState("home");
  const [step, setStep] = useState(1);
  const [filing, setFiling] = useState(INITIAL);
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState("cha"); // 'cha' | 'importer'
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingScreen, setPendingScreen] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);

  // Detect user type from profile after login
  const detectAndSetUserType = async (u) => {
    if (!u) return;
    try {
      const t = await getUserType(u.id);
      setUserType(t || "cha");
    } catch { setUserType("cha"); }
  };

  // Check session on mount, listen for changes
  useEffect(() => {
    if (!isSupabaseConfigured()) { setAuthChecked(true); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user || null;
      setUser(u);
      setCurrentUserRef(u);
      if (u) {
        ensureProfileExists(u.id).catch(() => {});
        detectAndSetUserType(u);
      }
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      setUser(u);
      setCurrentUserRef(u);
      if (u) {
        ensureProfileExists(u.id).catch(() => {});
        detectAndSetUserType(u);
      }
    });
    return () => subscription?.unsubscribe();
  }, []);

  const update = useCallback((data) => {
    setFiling(p => {
      const next = { ...p, ...data };
      if (next.iec) DB.save(next.iec, next);
      if (user && next.id && isSupabaseConfigured()) {
        saveFilingRemote(user.id, next).catch(() => {});
      }
      // Sync job stage based on filing progress
      if (user && next.id) {
        let stage = "Draft";
        if (next.classified) stage = "Classified";
        else if ((next.invoices || []).length > 0) stage = "Documents Uploaded";
        if (next.status === "complete") stage = "Checklist Ready";
        const existingJob = Jobs.all(user.id).find(j => j.id === next.id);
        if (existingJob) {
          // Only auto-advance if new stage is further along
          const cur = STAGE_ORDER.indexOf(existingJob.stage);
          const nxt = STAGE_ORDER.indexOf(stage);
          if (nxt > cur) Jobs.updateStage(user.id, next.id, stage);
        }
      }
      return next;
    });
  }, [user]);

  const next = () => setStep(s => s + 1);
  const back = () => {
    if (step === 1) { setScreen("home"); setStep(1); setFiling(INITIAL); }
    else setStep(s => s - 1);
  };

  const startNew = (type) => {
    const newId = Date.now().toString();
    const filingType = type || "BE";
    setFiling(f => {
      const next = {
        ...INITIAL, type: filingType,
        id: newId,
        iec: f.iec, iecResult: f.iecResult, iecProceeded: f.iecProceeded,
      };
      if (user) {
        const filingRef = `CHAI-${filingType}-${newId.slice(-6)}`;
        Jobs.upsert(user.id, {
          id: newId, type: filingType,
          iec: f.iec || "",
          clientName: f.iecResult?.name || f.iec || "",
          blAwbNumber: "", stage: "Draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          filingRef,
        });
      }
      return next;
    });
    setActiveJobId(newId);
    setStep(3);
  };
  const loadFiling = (f) => {
    setFiling(f);
    setActiveJobId(f.id || null);
    setStep(f.status === "complete" ? 7 : 3);
  };
  const goHome = () => {
    if (user && userType === "cha") { setScreen("DASHBOARD"); }
    else { setScreen("home"); }
    setStep(1); setFiling(INITIAL); setActiveJobId(null);
  };

  if (!authChecked) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: T.wash, color: T.muted, fontSize: 14 }}>
      Loading…
    </div>
  );

  // Logged-in users go straight to Dashboard. Public users see Homepage.
  // Duty Calculator is always free/public.
  // Importer users go directly to their own portal
  if (user && userType === "importer") {
    return <ImporterPortal user={user} onLogout={async () => {
      await signOut(); setUser(null); setUserType("cha"); setScreen("home");
    }} />;
  }

  if (screen === "home") {
    if (user && userType === "cha") { setScreen("DASHBOARD"); return null; }
    return <HomePage
      user={user}
      onLogin={() => setScreen("AUTH_REQUIRED")}
      onSignUp={() => setScreen("AUTH_SIGNUP")}
      onSelect={(t) => {
        if ((t === "BE" || t === "SB") && isSupabaseConfigured() && !user) {
          setPendingScreen(t); setScreen("AUTH_REQUIRED"); return;
        }
        setScreen(t); setStep(1);
        setFiling({ ...INITIAL, id: Date.now().toString(), type: t });
      }} onDirectory={() => {
        if (isSupabaseConfigured() && !user) { setPendingScreen(null); setScreen("AUTH_REQUIRED"); return; }
        setScreen("DIRECTORY");
      }} />;
  }

  if (screen === "DASHBOARD") return <JobDashboard
    user={user}
    onNewBE={() => {
      const newId = Date.now().toString();
      const filingRef = `CHAI-BE-${newId.slice(-6)}`;
      if (user) Jobs.upsert(user.id, { id: newId, type: "BE", iec: "", clientName: "", blAwbNumber: "",
        stage: "Draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), filingRef });
      setActiveJobId(newId);
      setScreen("BE"); setStep(1);
      setFiling({ ...INITIAL, id: newId, type: "BE" });
    }}
    onNewSB={() => {
      const newId = Date.now().toString();
      const filingRef = `CHAI-SB-${newId.slice(-6)}`;
      if (user) Jobs.upsert(user.id, { id: newId, type: "SB", iec: "", clientName: "", blAwbNumber: "",
        stage: "Draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), filingRef });
      setActiveJobId(newId);
      setScreen("SB"); setStep(1);
      setFiling({ ...INITIAL, id: newId, type: "SB" });
    }}
    onOpenJob={(job) => {
      const saved = DB.load(job.id) || DB.byIec(job.iec)?.[0];
      if (saved) { loadFiling(saved); }
      else { setFiling({ ...INITIAL, id: job.id, type: job.type }); setStep(1); }
      setActiveJobId(job.id);
      setScreen(job.type || "BE");
    }}
    onDirectory={() => setScreen("DIRECTORY")}
    onDuty={() => setScreen("DUTY")}
    onSettings={() => setScreen("SETTINGS")}
    onBilling={() => setScreen("BILLING")}
    onInvoices={() => setScreen("INVOICES")}
    onMIS={() => setScreen("MIS")}
    onTeam={() => setScreen("TEAM")}
    onQueryDraft={(job) => window.dispatchEvent(new CustomEvent("chai:openQueryDraft", { detail: job }))}
    onAuditTrail={() => setScreen("AUDIT")}
    onBatchForecast={() => setScreen("BATCH_FORECAST")}
    onRatesAdmin={() => setScreen("RATES_ADMIN")}
  />;

  if (screen === "AUTH_REQUIRED") {
    return <AuthScreen
      backTo={() => { setScreen("home"); setPendingScreen(null); }}
      reason={
        pendingScreen === "BE" ? "Log in to file a Bill of Entry — your filings and clients are saved to your account."
        : pendingScreen === "SB" ? "Log in to file a Shipping Bill — your filings and clients are saved to your account."
        : "Log in to your account."
      }
      onAuth={(u, type) => {
        setUser(u);
        const resolvedType = type || "cha";
        setUserType(resolvedType);
        if (resolvedType === "importer") {
          setScreen("home"); // ImporterPortal renders above home check
        } else if (pendingScreen) {
          const newId = Date.now().toString();
          setScreen(pendingScreen); setStep(1);
          setFiling({ ...INITIAL, id: newId, type: pendingScreen });
        } else {
          setScreen("DASHBOARD");
        }
        setPendingScreen(null);
      }} />;
  }

  // Dedicated sign-up screen — launched from homepage "Sign up" button
  if (screen === "AUTH_SIGNUP") {
    return <AuthScreen
      defaultTab="signup"
      backTo={() => setScreen("home")}
      reason="Choose your account type to get started."
      onAuth={(u, type) => {
        setUser(u);
        const resolvedType = type || "cha";
        setUserType(resolvedType);
        setScreen("home"); // routing above handles portal vs dashboard
        setPendingScreen(null);
      }} />;
  }

  if (screen === "DUTY") return <DutyCalculator onBack={() => user ? setScreen("DASHBOARD") : setScreen("home")} />;
  if (screen === "SETTINGS") return <SettingsScreen onBack={() => user ? setScreen("DASHBOARD") : setScreen("home")} user={user} />;
  if (screen === "DIRECTORY") return <IECDirectoryScreen onBack={() => user ? setScreen("DASHBOARD") : setScreen("home")} user={user} />;
  if (screen === "BILLING") return <BillingScreen user={user} onBack={() => setScreen("DASHBOARD")} />;
  if (screen === "INVOICES") return <ChaInvoiceScreen user={user} onBack={() => setScreen("DASHBOARD")} />;
  if (screen === "MIS") return <MISScreen user={user} onBack={() => setScreen("DASHBOARD")} />;
  if (screen === "TEAM") return <TeamScreen user={user} onBack={() => setScreen("DASHBOARD")} />;
  if (screen === "AUDIT") return <AuditTrailScreen user={user} onBack={() => setScreen("DASHBOARD")} />;
  if (screen === "BATCH_FORECAST") return <BatchForecastScreen onBack={() => setScreen("DASHBOARD")} />;
  if (screen === "RATES_ADMIN") return <RatesAdminScreen onBack={() => setScreen("DASHBOARD")} />;

  if ((screen === "BE" || screen === "SB") && isSupabaseConfigured() && !user) {
    setScreen("AUTH_REQUIRED");
    return null;
  }

// ── SHIPPING BILL FLOW ──
  if (screen === "SB") {
    const sbNavigate = (n) => setStep(n);
    const sbProps = { filing, update, onNext: next, onBack: back, onNavigate: sbNavigate };
    if (step === 1) return <SB1_IEC {...sbProps} />;
    if (step === 2) return <SB2_NewOrRecent filing={filing}
      onNewSB={() => startNew("SB")} onLoadFiling={loadFiling} onBack={back} />;
    if (step === 3) return <SB3_SB {...sbProps} />;
    if (step === 4) return <SB4_Invoices {...sbProps} />;
    if (step === 5) return <SB5_Classify {...sbProps} />;
    if (step === 6) return <SB6_Benefits {...sbProps} />;
    if (step === 7) return <SB7_Checklist filing={filing} onBack={back} onHome={goHome} onNavigate={sbNavigate} />;
  }

  // ── BILL OF ENTRY FLOW ──
  const navigate = (n) => setStep(n);
  const props = { filing, update, onNext: next, onBack: back, onNavigate: navigate };
  if (step === 1) return <S1_IEC {...props} />;
  if (step === 2) return <S2_NewOrRecent filing={filing}
    onNewBE={() => startNew("BE")} onLoadFiling={loadFiling} onBack={back} />;
  if (step === 3) return <S3_BL {...props} />;
  if (step === 4) return <S4_Invoices {...props} />;
  if (step === 5) return <S5_Classify {...props} />;
  if (step === 6) return <S6_Docs {...props} />;
  if (step === 7) return <S7_Checklist filing={filing} onBack={back} onHome={goHome} onNavigate={navigate} />;
  return null;
}

// ── ROOT APP with query draft overlay ──────────────────────────────────────────
function AppWithOverlays() {
  const [queryDraftJob, setQueryDraftJob] = useState(null);
  // Pass setQueryDraftJob down via context would be ideal but for simplicity
  // we manage it at this level via window event
  useEffect(() => {
    const handler = (e) => setQueryDraftJob(e.detail);
    window.addEventListener("chai:openQueryDraft", handler);
    return () => window.removeEventListener("chai:openQueryDraft", handler);
  }, []);
  return (
    <>
      <AppInner />
      {queryDraftJob && (
        <QueryDraftPanel
          job={queryDraftJob}
          filing={(() => { try { return JSON.parse(localStorage.getItem("cha_filings") || "{}")[queryDraftJob.id] || {}; } catch { return {}; } })()}
          onClose={() => setQueryDraftJob(null)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppWithOverlays />
    </ErrorBoundary>
  );
}

