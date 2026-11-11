// ── GOOGLE SHEETS LIBRARY ─────────────────────────────────────────────────────
// Zero-dependency Google Sheets access using a Service Account.
// Uses Node's built-in crypto to sign the JWT — no googleapis package needed.
//
// Required env vars:
//   GSHEET_ID        — the spreadsheet ID (from the sheet URL)
//   GSERVICE_ACCOUNT — the full service-account JSON, pasted as one line

const crypto = require("crypto");

// Module-level token cache (lives as long as the serverless instance)
let _token = null;
let _tokenExp = 0;

function getServiceAccount() {
  const raw = process.env.GSERVICE_ACCOUNT;
  if (!raw) throw new Error("GSERVICE_ACCOUNT env var not set");
  let sa;
  try { sa = JSON.parse(raw); }
  catch { throw new Error("GSERVICE_ACCOUNT is not valid JSON — paste the full service account key file contents"); }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GSERVICE_ACCOUNT JSON missing client_email or private_key");
  }
  return sa;
}

function b64url(input) {
  return Buffer.from(input).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken() {
  if (_token && Date.now() < _tokenExp - 60000) return _token;

  const sa = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signInput = `${header}.${claims}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signInput);
  // Private keys from JSON often have literal \n — normalise
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const signature = signer.sign(pem, "base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${signInput}.${signature}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(d).slice(0, 200)}`);
  }
  _token = d.access_token;
  _tokenExp = Date.now() + (d.expires_in || 3600) * 1000;
  return _token;
}

async function sheetsApi(method, path, body) {
  const token = await getAccessToken();
  const sheetId = process.env.GSHEET_ID;
  if (!sheetId) throw new Error("GSHEET_ID env var not set");
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`,
    {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    }
  );
  const d = await r.json();
  if (!r.ok) throw new Error(`Sheets API ${r.status}: ${JSON.stringify(d.error?.message || d).slice(0, 200)}`);
  return d;
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

async function readRange(range) {
  const d = await sheetsApi("GET", `/values/${encodeURIComponent(range)}`);
  return d.values || [];
}

async function appendRows(range, rows) {
  return sheetsApi("POST",
    `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: rows });
}

async function updateRange(range, rows) {
  return sheetsApi("PUT",
    `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { values: rows });
}

// Ensure the three tabs exist with correct headers. Idempotent.
async function initSheet() {
  const meta = await sheetsApi("GET", "?fields=sheets.properties.title");
  const existing = (meta.sheets || []).map(s => s.properties.title);
  const wanted = ["Duty", "Notifications", "State"];
  const toCreate = wanted.filter(t => !existing.includes(t));

  if (toCreate.length) {
    await sheetsApi("POST", ":batchUpdate", {
      requests: toCreate.map(title => ({ addSheet: { properties: { title } } })),
    });
  }

  // Write headers (idempotent — overwrites row 1 only)
  // IMPORTANT: these must match the column names read in duty.js sheetOverride()
  // and must match the Excel upload column names exactly.
  await updateRange("Duty!A1:N1", [[
    "CTH", "Description", "BCD_%", "IGST_%", "SWS_%",
    "AIDC_%", "Health_Cess_%", "Comp_Cess_%", "ADD_applicable",
    "Notification_No", "Condition", "Source", "Last_Updated", "Verified"
  ]]);
  await updateRange("Notifications!A1:G1", [[
    "Scanned_At", "Notification", "Type", "Date", "Summary", "Changes", "PDF_URL"
  ]]);
  await updateRange("State!A1:B1", [["Key", "Value"]]);
  return { created: toCreate, existing };
}

// Read scan state (stored as JSON in State!B2)
async function getState() {
  try {
    const rows = await readRange("State!A2:B10");
    const stateRow = rows.find(r => r[0] === "scan_state");
    return stateRow?.[1] ? JSON.parse(stateRow[1]) : null;
  } catch { return null; }
}

async function saveState(state) {
  return updateRange("State!A2:B2", [["scan_state", JSON.stringify(state)]]);
}

// Upsert duty rows: update existing CTH rows, append new ones.
async function upsertDutyRows(changes) {
  const existing = await readRange("Duty!A2:A2000");
  const cthToRow = {};   // cth → sheet row number
  existing.forEach((r, i) => {
    const c = (r[0] || "").replace(/\D/g, "");
    if (c) cthToRow[c] = i + 2;  // +2: 1-indexed and header row
  });

  const updates = [];
  const appends = [];

  for (const ch of changes) {
    const cth = (ch.cth || "").replace(/\D/g, "").slice(0, 8);
    if (cth.length < 6) continue;
    // Columns: CTH, Description, BCD_%, IGST_%, SWS_%, AIDC_%, Health_Cess_%,
    //          Comp_Cess_%, ADD_applicable, Notification_No, Condition, Source,
    //          Last_Updated, Verified
    const isBcd  = ch.rateType === "BCD";
    const isIgst = ch.rateType === "IGST";
    const isAdd  = ["ADD","CVD","SG"].includes(ch.rateType);
    const bcdVal = isBcd  ? ch.newRate : "";
    const igstVal= isIgst ? ch.newRate : "";
    // SWS = 10% of BCD when BCD is known
    const swsVal = isBcd && ch.newRate > 0 ? "10% of BCD" : "";
    const row = [
      cth,                                          // A: CTH
      ch.description || "",                         // B: Description
      bcdVal,                                       // C: BCD_%
      igstVal,                                      // D: IGST_%
      swsVal,                                       // E: SWS_%
      "",                                           // F: AIDC_%
      "",                                           // G: Health_Cess_%
      "",                                           // H: Comp_Cess_%
      isAdd ? ch.newRate : "No",                    // I: ADD_applicable
      ch.notifNum || "",                            // J: Notification_No
      ch.condition || ch.summary || "",             // K: Condition
      `CBIC scan ${new Date().toISOString().slice(0, 10)}`, // L: Source
      new Date().toISOString().slice(0, 10),        // M: Last_Updated
      "Scanner",                                    // N: Verified
    ];
    if (cth in cthToRow) {
      if (cthToRow[cth] === "pending") {
        // Same CTH appears twice in this batch (e.g. BCD + IGST changed together)
        // — merge into the pending append row instead of duplicating
        const pend = appends.find(a => a[0] === cth);
        if (pend) {
          if (row[2] !== "") pend[2] = row[2];
          if (row[3] !== "") pend[3] = row[3];
          if (row[4] !== "") pend[4] = row[4];
          if (row[8] && !pend[8].includes(row[8])) pend[8] = `${pend[8]}; ${row[8]}`;
        }
      } else {
        updates.push({ rowNum: cthToRow[cth], data: row, change: ch });
      }
    } else {
      appends.push(row);
      cthToRow[cth] = "pending";
    }
  }

  // Merge updates against current values so we don't blank out other rates
  for (const u of updates) {
    try {
      const cur = (await readRange(`Duty!A${u.rowNum}:N${u.rowNum}`))[0] || [];
      const merged = [...u.data];
      // Preserve existing values unless this scan update explicitly sets them
      // Col indices: 0=CTH, 1=Desc, 2=BCD_%, 3=IGST_%, 4=SWS_%, 5=AIDC_%,
      //              6=Health_Cess_%, 7=Comp_Cess_%, 8=ADD_applicable,
      //              9=Notification_No, 10=Condition, 11=Source, 12=Last_Updated, 13=Verified
      if (merged[2] === "" && cur[2]) merged[2] = cur[2];   // BCD_%
      if (merged[3] === "" && cur[3]) merged[3] = cur[3];   // IGST_%
      if (merged[4] === "" && cur[4]) merged[4] = cur[4];   // SWS_%
      if (merged[5] === "" && cur[5]) merged[5] = cur[5];   // AIDC_%
      if (merged[6] === "" && cur[6]) merged[6] = cur[6];   // Health_Cess_%
      if (merged[7] === "" && cur[7]) merged[7] = cur[7];   // Comp_Cess_%
      if (!merged[1] && cur[1]) merged[1] = cur[1];          // Description
      await updateRange(`Duty!A${u.rowNum}:N${u.rowNum}`, [merged]);
    } catch { /* skip failed row */ }
  }

  if (appends.length) {
    await appendRows("Duty!A2", appends);
  }
  return { updated: updates.length, appended: appends.length };
}

async function logNotification(entry) {
  return appendRows("Notifications!A2", [[
    new Date().toISOString(),
    entry.notifNum || "",
    entry.type || "",
    entry.date || "",
    entry.summary || "",
    entry.changesCount ?? 0,
    entry.url || "",
  ]]);
}

module.exports = {
  getAccessToken, readRange, appendRows, updateRange,
  initSheet, getState, saveState, upsertDutyRows, logNotification,
};
