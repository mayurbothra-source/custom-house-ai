import { createClient } from '@supabase/supabase-js';

// Public keys — safe in frontend. Security comes from Row Level Security policies
// defined in supabase-schema.sql. Set these two in Vercel → Environment Variables:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || '';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (SUPABASE_URL && SUPABASE_ANON)
  ? createClient(SUPABASE_URL, SUPABASE_ANON)
  : null;

export const isSupabaseConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON);

// Self-healing profile creation. The database trigger (handle_new_user in
// supabase-schema.sql) SHOULD auto-create a profiles row on signup, but if
// that trigger didn't run for any reason — a partial schema run, a signup
// that happened before the trigger existed — every foreign-key-dependent
// insert (iec_directory, filings) fails with a cryptic Postgres error.
// This guarantees the row exists before any such insert, regardless of
// whether the trigger fired. Safe to call repeatedly — it's a no-op upsert.
export async function ensureProfileExists(userId) {
  if (!supabase || !userId) return;
  await supabase.from('profiles').upsert(
    { id: userId },
    { onConflict: 'id', ignoreDuplicates: true }
  );
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
export async function signUp(email, password) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function resetPassword(email) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
}

// ── PROFILE (firm details, one row per user) ─────────────────────────────────
export async function getRemoteProfile(userId) {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

export async function upsertRemoteProfile(userId, profile) {
  if (!supabase) return;
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    firm_name: profile.firmName || '',
    licence_no: profile.licence || '',
    gstin: profile.gstin || '',
    pan: profile.pan || '',
    ad_code: profile.adCode || '',
    address: profile.address || '',
    port: profile.port || '',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ── IEC DIRECTORY (each CHA's own client list) ────────────────────────────────
export async function getIecDirectory() {
  if (!supabase) return [];
  const { data } = await supabase.from('iec_directory').select('*').order('name');
  return data || [];
}

export async function lookupIec(iec) {
  if (!supabase) return null;
  const { data } = await supabase.from('iec_directory')
    .select('*').eq('iec', iec.trim().toUpperCase()).maybeSingle();
  return data;
}

export async function saveIec(userId, record) {
  if (!supabase) return;
  await ensureProfileExists(userId);  // guarantees the FK target exists first
  const { error } = await supabase.from('iec_directory').upsert({
    user_id: userId,
    iec: record.iec.trim().toUpperCase(),
    name: record.name,
    gstin: record.gstin || '',
    ad_code: record.adCode || '',
    address: record.address || '',
    epcg_active: record.epcgActive || false,
    epcg_lic: record.epcgLic || '',
    notes: record.notes || '',
  }, { onConflict: 'user_id,iec' });
  if (error) throw error;
}

export async function deleteIec(iec) {
  if (!supabase) return;
  await supabase.from('iec_directory').delete().eq('iec', iec.trim().toUpperCase());
}

// ── FILINGS (cloud backup, accessible from any device) ────────────────────────
export async function saveFilingRemote(userId, filing) {
  if (!supabase || !filing?.id) return null;
  await ensureProfileExists(userId);  // guarantees the FK target exists first
  const { data, error } = await supabase.from('filings').upsert({
    id: filing.id,
    user_id: userId,
    type: filing.type || 'BE',
    status: filing.status || 'draft',
    data: filing,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select().maybeSingle();
  if (error) { console.warn('saveFilingRemote failed:', error.message); return null; }
  return data;
}

export async function getRemoteFilings() {
  if (!supabase) return [];
  const { data } = await supabase.from('filings').select('*')
    .order('updated_at', { ascending: false }).limit(50);
  return data || [];
}

// ── FIRM MEMBERS (multi-user) ─────────────────────────────────────────────────
export async function getFirmMembers(firmId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('firm_members')
    .select('*')
    .eq('firm_id', firmId);
  return data || [];
}

export async function inviteMember(firmId, email, role = 'junior') {
  if (!supabase) throw new Error('Supabase not configured');
  // First create the auth user via admin invite (requires service role — done server-side in production)
  // For now: add to firm_members if user already exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', (await supabase.auth.admin?.getUserByEmail?.(email))?.data?.user?.id || '')
    .maybeSingle();
  if (!existing) throw new Error('User must sign up first. Share the signup link with them.');
  const { error } = await supabase.from('firm_members').upsert({
    firm_id: firmId, user_id: existing.id, role
  }, { onConflict: 'firm_id,user_id' });
  if (error) throw error;
}

export async function removeMember(firmId, userId) {
  if (!supabase) return;
  await supabase.from('firm_members').delete()
    .eq('firm_id', firmId).eq('user_id', userId);
}

export async function updateMemberRole(firmId, userId, role) {
  if (!supabase) return;
  await supabase.from('firm_members').update({ role })
    .eq('firm_id', firmId).eq('user_id', userId);
}

// ── SUBSCRIPTION ──────────────────────────────────────────────────────────────
export async function getSubscription(firmId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('firm_id', firmId)
    .maybeSingle();
  return data;
}

export async function upsertSubscription(firmId, payload) {
  if (!supabase) return;
  await supabase.from('subscriptions').upsert(
    { firm_id: firmId, ...payload, updated_at: new Date().toISOString() },
    { onConflict: 'firm_id' }
  );
}

// ── CHA INVOICES ──────────────────────────────────────────────────────────────
export async function getChaInvoices(firmId) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('cha_invoices')
    .select('*')
    .eq('firm_id', firmId)
    .order('invoice_date', { ascending: false });
  return data || [];
}

export async function saveChaInvoice(firmId, invoice) {
  if (!supabase) return;
  const payload = { ...invoice, firm_id: firmId, updated_at: new Date().toISOString() };
  if (invoice.id) {
    const { data } = await supabase.from('cha_invoices').upsert(payload, { onConflict: 'id' }).select().single();
    return data;
  } else {
    const { data } = await supabase.from('cha_invoices').insert(payload).select().single();
    return data;
  }
}

export async function deleteChaInvoice(invoiceId) {
  if (!supabase) return;
  await supabase.from('cha_invoices').delete().eq('id', invoiceId);
}

// ── IMPORTER/EXPORTER SUPPORT ──────────────────────────────────────────────────

// Sign up with a specific user type ('cha' or 'importer')
export async function signUpWithType(email, password, userType, extraProfile) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    // Write the profile immediately with user_type and extra fields
    await supabase.from('profiles').upsert({
      id: data.user.id,
      user_type: userType,
      company_name: extraProfile?.companyName || '',
      contact_name: extraProfile?.contactName || '',
      phone: extraProfile?.phone || '',
      iec_number: extraProfile?.iec || '',
      firm_name: extraProfile?.firmName || extraProfile?.companyName || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }
  return data;
}

// Get the user_type for a logged-in user
export async function getUserType(userId) {
  if (!supabase || !userId) return 'cha';
  const { data } = await supabase.from('profiles')
    .select('user_type').eq('id', userId).maybeSingle();
  return data?.user_type || 'cha';
}

// Get importer profile extras
export async function getImporterProfile(userId) {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles')
    .select('company_name, contact_name, phone, iec_number, user_type')
    .eq('id', userId).maybeSingle();
  return data;
}

// Admin settings — read all key-value config
export async function getAdminSettings() {
  if (!supabase) return {};
  const { data } = await supabase.from('admin_settings').select('key, value');
  if (!data) return {};
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}

// Importer filings CRUD
export async function getImporterFilings(importerId) {
  if (!supabase) return [];
  const { data } = await supabase.from('importer_filings')
    .select('*').eq('importer_id', importerId)
    .order('updated_at', { ascending: false });
  return data || [];
}

export async function saveImporterFiling(importerId, filing) {
  if (!supabase) return null;
  const payload = { ...filing, importer_id: importerId, updated_at: new Date().toISOString() };
  if (filing.id) {
    const { data } = await supabase.from('importer_filings')
      .upsert(payload, { onConflict: 'id' }).select().single();
    return data;
  } else {
    const { data } = await supabase.from('importer_filings')
      .insert(payload).select().single();
    return data;
  }
}
