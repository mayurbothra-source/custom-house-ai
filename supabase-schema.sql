-- ══════════════════════════════════════════════════════════════════════════════
-- CUSTOM HOUSE AI — SUPABASE DATABASE SCHEMA
-- Run this entire script in: Supabase Dashboard → SQL Editor → New query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. PROFILES (one per user, auto-created on signup) ────────────────────────
create table if not exists public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  firm_name  text    not null default '',
  licence_no text    not null default '',
  gstin      text    not null default '',
  pan        text    not null default '',
  ad_code    text    not null default '',
  address    text    not null default '',
  port       text    not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. IEC DIRECTORY (each CHA's client list) ────────────────────────────────
create table if not exists public.iec_directory (
  id          uuid     not null default gen_random_uuid() primary key,
  user_id     uuid     not null references public.profiles on delete cascade,
  iec         text     not null,
  name        text     not null,
  gstin       text     not null default '',
  ad_code     text     not null default '',
  address     text     not null default '',
  epcg_active boolean  not null default false,
  epcg_lic    text     not null default '',
  notes       text     not null default '',
  created_at  timestamptz not null default now(),
  unique (user_id, iec)
);

-- ── 3. FILINGS ────────────────────────────────────────────────────────────────
create table if not exists public.filings (
  id         uuid    not null primary key,
  user_id    uuid    not null references public.profiles on delete cascade,
  type       text    not null check (type in ('BE', 'SB')),
  status     text    not null default 'draft' check (status in ('draft', 'complete')),
  data       jsonb   not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 4. ROW LEVEL SECURITY — every table is private to its owner by default ────
alter table public.profiles      enable row level security;
alter table public.iec_directory enable row level security;
alter table public.filings       enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "iec_own" on public.iec_directory;
create policy "iec_own" on public.iec_directory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "filings_own" on public.filings;
create policy "filings_own" on public.filings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 5. AUTO-CREATE A BLANK PROFILE ROW ON SIGNUP ──────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 6. INDEXES ────────────────────────────────────────────────────────────────
create index if not exists iec_directory_user_id_idx on public.iec_directory (user_id);
create index if not exists iec_directory_iec_idx     on public.iec_directory (iec);
create index if not exists filings_user_id_idx       on public.filings (user_id);
create index if not exists filings_updated_idx       on public.filings (updated_at desc);

-- Done. Next: Authentication → URL Configuration → Site URL = your Vercel app URL.

-- ══════════════════════════════════════════════════════════════════════════════
-- v2.3.0 ADDITIONS — Multi-user firm roles + billing subscriptions
-- Run these additions in Supabase SQL Editor after the original schema above.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 7. FIRM MEMBERS — multi-user support ─────────────────────────────────────
-- A firm owner can invite staff. Each member has a role.
-- owner:  full access — all filings, settings, billing, invite/remove members
-- senior: file BE/SB, manage clients, view all filings
-- junior: file BE/SB, view own filings only
create table if not exists public.firm_members (
  id          uuid        not null default gen_random_uuid() primary key,
  firm_id     uuid        not null references public.profiles on delete cascade,
  user_id     uuid        not null references auth.users on delete cascade,
  role        text        not null default 'junior' check (role in ('owner','senior','junior')),
  invited_by  uuid        references auth.users,
  joined_at   timestamptz not null default now(),
  unique (firm_id, user_id)
);

alter table public.firm_members enable row level security;

drop policy if exists "members_firm_visible" on public.firm_members;
create policy "members_firm_visible" on public.firm_members
  for select using (
    firm_id = auth.uid()
    or user_id = auth.uid()
    or exists (select 1 from firm_members fm where fm.firm_id = firm_members.firm_id and fm.user_id = auth.uid())
  );

drop policy if exists "members_owner_manage" on public.firm_members;
create policy "members_owner_manage" on public.firm_members
  for all using (firm_id = auth.uid())
  with check (firm_id = auth.uid());

create index if not exists firm_members_firm_idx on public.firm_members (firm_id);
create index if not exists firm_members_user_idx on public.firm_members (user_id);

-- ── 8. SUBSCRIPTIONS — billing tier tracking ─────────────────────────────────
-- Tracks the firm's subscription plan. Razorpay webhook updates this table.
create table if not exists public.subscriptions (
  id                 uuid        not null default gen_random_uuid() primary key,
  firm_id            uuid        not null references public.profiles on delete cascade unique,
  plan               text        not null default 'free' check (plan in ('free','starter','professional','enterprise')),
  status             text        not null default 'active' check (status in ('active','cancelled','past_due','trialing')),
  razorpay_sub_id    text,
  razorpay_cust_id   text,
  current_period_end timestamptz,
  trial_end          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "sub_own" on public.subscriptions;
create policy "sub_own" on public.subscriptions
  for all using (firm_id = auth.uid()) with check (firm_id = auth.uid());

-- ── 9. CHA INVOICES — for billing importer/exporter clients ──────────────────
create table if not exists public.cha_invoices (
  id             uuid        not null default gen_random_uuid() primary key,
  firm_id        uuid        not null references public.profiles on delete cascade,
  filing_id      text,
  client_iec     text        not null default '',
  client_name    text        not null default '',
  invoice_number text        not null default '',
  invoice_date   date        not null default current_date,
  items          jsonb       not null default '[]',
  subtotal       numeric     not null default 0,
  gst_rate       numeric     not null default 18,
  gst_amount     numeric     not null default 0,
  total          numeric     not null default 0,
  status         text        not null default 'draft' check (status in ('draft','sent','paid','overdue')),
  notes          text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.cha_invoices enable row level security;

drop policy if exists "invoices_own" on public.cha_invoices;
create policy "invoices_own" on public.cha_invoices
  for all using (firm_id = auth.uid()) with check (firm_id = auth.uid());

create index if not exists cha_invoices_firm_idx on public.cha_invoices (firm_id);
create index if not exists cha_invoices_date_idx on public.cha_invoices (invoice_date desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- v2.5.0 ADDITIONS — Importer/Exporter portal + user type routing
-- Run these in Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 10. Add user_type to profiles ─────────────────────────────────────────────
-- 'cha' = Custom House Agent firm (default for all existing accounts)
-- 'importer' = Importer or Exporter using the direct portal
alter table public.profiles
  add column if not exists user_type text not null default 'cha'
    check (user_type in ('cha', 'importer'));

-- ── 11. Add importer-specific fields to profiles ──────────────────────────────
alter table public.profiles
  add column if not exists company_name text not null default '';
alter table public.profiles
  add column if not exists contact_name text not null default '';
alter table public.profiles
  add column if not exists phone text not null default '';
alter table public.profiles
  add column if not exists iec_number text not null default '';

-- ── 12. IMPORTER FILINGS — tracks BE/SB requests submitted by importers ───────
create table if not exists public.importer_filings (
  id              uuid        not null default gen_random_uuid() primary key,
  importer_id     uuid        not null references public.profiles on delete cascade,
  filing_type     text        not null default 'BE' check (filing_type in ('BE', 'SB')),
  stage           text        not null default 'Draft',
  assigned_cha    text        not null default '',
  item_count      int         not null default 0,
  quoted_fee      numeric     not null default 0,
  payment_status  text        not null default 'pending' check (payment_status in ('pending','paid','refunded')),
  razorpay_order  text        not null default '',
  filing_data     jsonb       not null default '{}',
  notes           text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.importer_filings enable row level security;

drop policy if exists "importer_filings_own" on public.importer_filings;
create policy "importer_filings_own" on public.importer_filings
  for all using (importer_id = auth.uid()) with check (importer_id = auth.uid());

create index if not exists importer_filings_importer_idx on public.importer_filings (importer_id);
create index if not exists importer_filings_stage_idx on public.importer_filings (stage);

-- ── 13. ADMIN SETTINGS — key-value store for editable config ──────────────────
-- Stores assigned CHA details, pricing overrides, and other admin config.
-- In the short term this is seeded manually; later it can be edited from
-- an admin screen without a redeploy.
create table if not exists public.admin_settings (
  key   text primary key,
  value text not null default ''
);

-- Seed default values (safe to re-run — upsert)
insert into public.admin_settings (key, value) values
  ('assigned_cha_name',    'CHAI Partner CHA'),
  ('assigned_cha_contact', 'support@customhouseai.in'),
  ('assigned_cha_licence', 'To be confirmed'),
  ('imp_simple_price',     '1499'),
  ('imp_simple_items',     '5'),
  ('imp_standard_price',   '2499'),
  ('imp_standard_items',   '15'),
  ('imp_complex_price',    '3999'),
  ('platform_fee',         '250'),
  ('cha_starter_price',    '1999'),
  ('cha_professional_price','4999'),
  ('cha_enterprise_price', '9999')
on conflict (key) do nothing;

-- RLS: admin_settings is readable by all authenticated users, not writable via client
alter table public.admin_settings enable row level security;
drop policy if exists "admin_settings_read" on public.admin_settings;
create policy "admin_settings_read" on public.admin_settings
  for select using (auth.role() = 'authenticated');
