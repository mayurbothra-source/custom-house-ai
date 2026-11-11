// ── SHEETS SETUP & DIAGNOSTIC ENDPOINT ────────────────────────────────────────
// Utility endpoint for verifying the Google Sheets connection and initialising
// the sheet structure. Open in a browser:
//
//   /api/sheets-sync?action=help    — setup instructions
//   /api/sheets-sync?action=test    — verify credentials + sheet access
//   /api/sheets-sync?action=init    — create Duty/Notifications/State tabs
//   /api/sheets-sync?action=state   — show current scanner state

const sheets = require("../lib/gsheets.js");

const HELP = {
  setup: [
    "1. Go to console.cloud.google.com → create a project (any name).",
    "2. APIs & Services → Library → search 'Google Sheets API' → Enable.",
    "3. APIs & Services → Credentials → Create Credentials → Service Account. Any name. Skip optional steps.",
    "4. Open the created service account → Keys tab → Add Key → Create new key → JSON. A .json file downloads.",
    "5. Create a Google Sheet at sheets.google.com. Copy the ID from its URL (the long string between /d/ and /edit).",
    "6. In the sheet: Share → paste the service account email (ends with .iam.gserviceaccount.com) → Editor → Share.",
    "7. In Vercel → Settings → Environment Variables, add: GSHEET_ID = the sheet ID; GSERVICE_ACCOUNT = the entire contents of the downloaded .json file pasted as one value.",
    "8. Redeploy. Then open /api/sheets-sync?action=test to verify, then ?action=init to create the tabs.",
    "9. Optional but recommended: publish the Duty tab for the calculator — File → Share → Publish to web → select 'Duty' tab → CSV → Publish → copy URL → add as GSHEET_DUTY_URL env var → redeploy.",
  ],
  envVarsNeeded: ["GSHEET_ID", "GSERVICE_ACCOUNT", "GSHEET_DUTY_URL (optional, for calculator reads)"],
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const action = req.query?.action || req.body?.action || "help";

  if (action === "help") return res.status(200).json(HELP);

  if (action === "test") {
    const checks = { GSHEET_ID: !!process.env.GSHEET_ID, GSERVICE_ACCOUNT: !!process.env.GSERVICE_ACCOUNT };
    if (!checks.GSHEET_ID || !checks.GSERVICE_ACCOUNT) {
      return res.status(200).json({ ok: false, checks, fix: "Missing env vars — see ?action=help" });
    }
    try {
      await sheets.getAccessToken();
      checks.tokenExchange = true;
    } catch (e) {
      return res.status(200).json({ ok: false, checks: { ...checks, tokenExchange: false }, error: e.message,
        fix: "GSERVICE_ACCOUNT JSON is invalid or the key was revoked. Re-paste the full .json file contents." });
    }
    try {
      await sheets.readRange("A1:A1");
      checks.sheetAccess = true;
    } catch (e) {
      return res.status(200).json({ ok: false, checks: { ...checks, sheetAccess: false }, error: e.message,
        fix: "Token works but the sheet is not accessible. Confirm GSHEET_ID is correct AND the sheet is shared with the service account email as Editor." });
    }
    return res.status(200).json({ ok: true, checks, next: "Run ?action=init to create the tab structure." });
  }

  if (action === "init") {
    try {
      const result = await sheets.initSheet();
      return res.status(200).json({ ok: true, ...result,
        next: "Sheet ready. The scanner will populate it — trigger manually via /api/scan-cbic or wait for the daily cron." });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  if (action === "state") {
    try {
      const state = await sheets.getState();
      return res.status(200).json({ ok: true, state: state || "No scans yet" });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
  }

  return res.status(400).json({ error: `Unknown action '${action}'. Use help, test, init, or state.` });
};
