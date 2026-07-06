-- =============================================================================
--  AUTO LOCATION — Full Supabase schema (database + storage buckets + auth + RLS)
-- -----------------------------------------------------------------------------
--  Run this ONCE in the Supabase SQL Editor of your project
--  (Dashboard → SQL Editor → New query → paste → Run).
--
--  What it creates:
--    1. All application tables (cars, clients, reservations, workers, …)
--    2. One dedicated STORAGE BUCKET per image kind
--         cars • clients • worker • inspection • website
--       The DB stores the public URL of each uploaded image; the file itself
--       lives in its bucket and is served from there.
--    3. Auth wiring:
--         - Admin account is created from the Login page (supabase.auth.signUp)
--         - Workers are created from the Team (Équipe) interface and are also
--           stored in Supabase Auth (auth.users) so each one logs in with his
--           own email + password.
--    4. Per-worker permissions: which INTERFACES a worker may open, and which
--       ACTION BUTTONS he may use inside each interface (worker_permissions).
--    5. Row-Level Security, storage policies, RPCs and the admin_count view the
--       front-end already calls.
--
--  The column names match exactly what src/services/DatabaseService.ts and the
--  upload*.ts services read/write, so no front-end change is required to run.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;      -- gen_random_uuid(), crypt(), gen_salt()

-- Generic "touch updated_at" trigger function (reused by several tables)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. AUTH / IDENTITY / PERMISSIONS
-- ═════════════════════════════════════════════════════════════════════════════

-- 1.1 Dynamic roles (the system roles 'admin' and 'worker' are not deletable) ──
create table if not exists public.roles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_system  boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.roles (name, is_system) values
  ('admin', true),
  ('worker', true)
on conflict (name) do nothing;

-- 1.2 profiles — 1 row per Supabase Auth user (admin OR worker) ────────────────
--     role = the role NAME. role = 'admin' means full access.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text,
  full_name  text,
  role       text not null default 'worker',
  avatar     text,
  agency_id  text,                       -- used by DocumentRenderer / templates
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 1.3 Auto-create a profile whenever a new auth user is created.
--     The very first user (the admin created from the Login page) becomes 'admin';
--     everyone after that defaults to 'worker' unless a role is passed in metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_is_first boolean;
begin
  select count(*) = 0 into v_is_first from public.profiles;
  v_role := coalesce(
    new.raw_user_meta_data->>'role',
    case when v_is_first then 'admin' else 'worker' end
  );

  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'username'),
    v_role
  )
  on conflict (id) do nothing;   -- Login.tsx also inserts; ignore the duplicate

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 1.4 admin_count — the Login page reads this to know if an admin already exists
--     (.from('admin_count').select('count').single()).
create or replace view public.admin_count as
  select count(*)::int as count
  from public.profiles
  where role = 'admin';


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. CORE BUSINESS TABLES
-- ═════════════════════════════════════════════════════════════════════════════

-- 2.1 Agencies ────────────────────────────────────────────────────────────────
create table if not exists public.agencies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  city       text,
  created_at timestamptz not null default now()
);

-- 2.2 Cars ──────────────────────────────────────────────────────────────────--
--     image_url  = primary photo (public URL from the "cars" bucket, read path)
--     images     = optional gallery of public URLs from the same bucket
create table if not exists public.cars (
  id                  uuid primary key default gen_random_uuid(),
  brand               text not null,
  model               text not null,
  plate_number        text,
  year                int,
  color               text,
  vin                 text,
  energy              text default 'Essence',
  transmission        text default 'Automatique',
  seats               int  default 5,
  doors               int  default 4,
  price_per_day       numeric not null default 0,
  price_week          numeric,
  price_month         numeric,
  deposit             numeric,
  image_url           text,               -- ← public URL of the uploaded car image
  images              text[] default '{}',-- ← extra gallery URLs (same bucket)
  mileage             int default 0,
  fuel_level          text,
  status              text default 'disponible',   -- only 'maintenance' is set manually
  is_hidden_from_site boolean not null default false,
  created_at          timestamptz not null default now()
);

-- 2.3 Clients ─────────────────────────────────────────────────────────────────
--     profile_photo      = public URL from the "clients" bucket
--     scanned_documents  = array of public URLs from the "clients" bucket
create table if not exists public.clients (
  id                        uuid primary key default gen_random_uuid(),
  first_name                text not null,
  last_name                 text not null,
  phone                     text,
  email                     text,
  date_of_birth             date,
  place_of_birth            text,
  id_card_number            text,
  license_number            text,
  license_expiration_date   date,
  license_delivery_date     date,
  license_delivery_place    text,
  document_type             text,
  document_number           text,
  document_delivery_date    date,
  document_expiration_date  date,
  document_delivery_address text,
  wilaya                    text,
  complete_address          text,
  profile_photo             text,          -- ← "clients" bucket URL
  scanned_documents         text[] default '{}', -- ← "clients" bucket URLs
  agency_id                 text,
  created_at                timestamptz not null default now()
);

-- 2.4 Workers (HR record) + link to their Supabase Auth account ───────────────
--     user_id     = auth.users.id  (so the worker logs in with his own account)
--     type        = 'admin' | 'worker' | 'driver'
--     profile_photo = public URL from the "worker" bucket
--     password    = legacy plaintext column kept only for the login_worker()
--                   fallback; real auth uses auth.users (see admin_create_worker).
create table if not exists public.workers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  full_name     text not null,
  date_of_birth date,
  phone         text,
  email         text,
  address       text,
  profile_photo text,                       -- ← "worker" bucket URL
  type          text not null default 'worker',
  role_id       uuid references public.roles(id) on delete set null,
  payment_type  text,                        -- 'daily' | 'monthly'
  base_salary   numeric,
  username      text,
  password      text,
  login_enabled boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- 2.5 Worker payroll sub-tables ───────────────────────────────────────────────
create table if not exists public.worker_advances (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers(id) on delete cascade,
  amount     numeric not null default 0,
  date       date not null default current_date,
  note       text,
  deducted   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.worker_absences (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers(id) on delete cascade,
  cost       numeric not null default 0,
  date       date not null default current_date,
  note       text,
  deducted   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.worker_payments (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.workers(id) on delete cascade,
  amount      numeric not null default 0,
  date        date not null default current_date,
  base_salary numeric,
  advances    numeric,
  absences    numeric,
  net_salary  numeric,
  note        text,
  created_at  timestamptz not null default now()
);

-- 2.6 WORKER PERMISSIONS ──────────────────────────────────────────────────────
--     One row per (worker, interface). interface_id matches SIDEBAR_ITEMS[].id
--     (dashboard, planner, reservations, services, vehicles, maintenance,
--      clients, agencies, team, expenses, car-gains, reports, config).
--     actions  = the allowed button ids inside that interface, from
--     INTERFACE_ACTIONS (e.g. {'view','create','edit','delete','print',...}).
--     A worker sees ONLY the interfaces he has a row for, and inside each
--     interface only the buttons listed in `actions`.
create table if not exists public.worker_permissions (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references public.workers(id) on delete cascade,
  interface_id text not null,
  actions      text[] not null default '{}',
  created_at   timestamptz not null default now(),
  unique (worker_id, interface_id)
);


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. SERVICES / INSURANCE / EXPENSES / MAINTENANCE
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  category     text,
  service_name text not null,
  description  text,
  price        numeric not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Protection-insurance packs ("assurances de protection") + reusable items ─────
create table if not exists public.protection_assurance_items (
  id            uuid primary key default gen_random_uuid(),
  item_name     text not null,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.protection_assurances (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price_per_day numeric not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.protection_assurance_item_links (
  id           uuid primary key default gen_random_uuid(),
  assurance_id uuid not null references public.protection_assurances(id) on delete cascade,
  item_id      uuid not null references public.protection_assurance_items(id) on delete cascade,
  status       boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.store_expenses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  cost       numeric not null default 0,
  date       date not null default current_date,
  note       text,
  icon       text,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_expenses (
  id              uuid primary key default gen_random_uuid(),
  car_id          uuid references public.cars(id) on delete cascade,
  type            text,                    -- vidange|assurance|controle|chaine|autre
  cost            numeric not null default 0,
  date            date not null default current_date,
  note            text,
  current_mileage int,
  next_vidange_km int,
  expiration_date date,
  expense_name    text,
  created_at      timestamptz not null default now()
);

create table if not exists public.maintenance_alerts (
  id                  uuid primary key default gen_random_uuid(),
  car_id              uuid references public.cars(id) on delete cascade,
  car_info            text,
  type                text,
  title               text,
  message             text,
  severity            text default 'medium',
  due_date            date,
  is_expired          boolean default false,
  days_until_due      int,
  current_mileage     int,
  next_service_mileage int,
  created_at          timestamptz not null default now()
);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. RESERVATIONS / PAYMENTS / INSPECTIONS
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.reservations (
  id                        uuid primary key default gen_random_uuid(),
  client_id                 uuid references public.clients(id) on delete set null,
  car_id                    uuid references public.cars(id)    on delete set null,
  departure_date            date,
  departure_time            text,
  departure_agency_id       text,
  return_date               date,
  return_time               text,
  return_agency_id          text,
  price_per_day             numeric,               -- snapshot du tarif au moment de la résa
  price_week                numeric,
  price_month               numeric,
  total_days                int,
  total_price               numeric not null default 0,
  additional_fees           numeric default 0,
  deposit                   numeric default 0,
  caution_amount_dzd        numeric,
  caution_currency          text default 'DZD',    -- 'DZD' | 'EUR'
  euro_rate                 numeric,
  assurance_enabled         boolean default false, -- ancienne assurance en %
  assurance_percentage      numeric,
  discount_amount           numeric default 0,
  discount_type             text default 'fixed',
  advance_payment           numeric default 0,
  remaining_payment         numeric,
  tva_applied               boolean default false,
  excess_mileage            numeric,
  missing_fuel              numeric,
  notes                     text,
  conditions                text,
  status                    text not null default 'pending',
  protection_assurance_id   uuid,
  protection_assurance_name  text,
  protection_assurance_price numeric,
  created_by                uuid,
  created_by_name           text,
  activated_at              timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz not null default now(),
  -- Named FK so PostgREST embed hint works:
  -- protection_assurances!reservations_protection_assurance_fkey
  constraint reservations_protection_assurance_fkey
    foreign key (protection_assurance_id)
    references public.protection_assurances(id) on delete set null
);

-- Extra services attached to a reservation ────────────────────────────────────
create table if not exists public.reservation_services (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  category       text,
  service_name   text,
  description    text,
  price          numeric not null default 0,
  created_at     timestamptz not null default now()
);

-- Payments made against a reservation ─────────────────────────────────────────
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount         numeric not null default 0,
  date           date not null default current_date,
  method         text default 'cash',       -- cash|card|transfer|check
  status         text default 'completed',  -- dashboard counts status='pending'
  note           text,
  created_at     timestamptz not null default now()
);

-- Inspection checklist master list ────────────────────────────────────────────
create table if not exists public.inspection_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  category      text,           -- security|equipment|comfort|cleanliness
  item_name     text not null,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

-- Vehicle inspection (departure / return) ─────────────────────────────────────
--     All *_photo / other_photos columns store public URLs from the
--     "inspection" bucket.
create table if not exists public.vehicle_inspections (
  id                    uuid primary key default gen_random_uuid(),
  reservation_id        uuid not null references public.reservations(id) on delete cascade,
  type                  text not null,            -- 'departure' | 'return'
  mileage               int,
  fuel_level            text,
  agency_id             text,
  exterior_front_photo  text,                     -- ← "inspection" bucket URL
  exterior_rear_photo   text,                     -- ← "inspection" bucket URL
  interior_photo        text,                     -- ← "inspection" bucket URL
  other_photos          text[] default '{}',      -- ← "inspection" bucket URLs
  client_signature      text,
  notes                 text,
  date                  date,
  time                  text,
  created_at            timestamptz not null default now(),
  unique (reservation_id, type)                   -- upsert onConflict target
);

create table if not exists public.inspection_responses (
  id                uuid primary key default gen_random_uuid(),
  inspection_id     uuid not null references public.vehicle_inspections(id) on delete cascade,
  checklist_item_id uuid not null references public.inspection_checklist_items(id) on delete cascade,
  status            boolean not null default false,
  note              text,
  created_at        timestamptz not null default now(),
  unique (inspection_id, checklist_item_id)       -- upsert onConflict target
);


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. PUBLIC WEBSITE (offers, settings, contacts, promo codes)
-- ═════════════════════════════════════════════════════════════════════════════

-- Special offers = a promotion attached to an existing car ────────────────────
create table if not exists public.special_offers (
  id             uuid primary key default gen_random_uuid(),
  car_id         uuid not null references public.cars(id) on delete cascade,
  old_price      numeric not null default 0,
  new_price      numeric not null default 0,
  note           text,
  is_active      boolean not null default true,
  label          text,
  discount_type  text,                      -- 'percentage' | 'fixed'
  discount_value numeric,
  start_date     date,
  end_date       date,
  created_at     timestamptz not null default now()
);

-- Legacy "offers" table (deprecated, kept so old code paths don't 404) ─────────
create table if not exists public.offers (
  id         uuid primary key default gen_random_uuid(),
  car_id     uuid references public.cars(id) on delete cascade,
  title      text,
  price      numeric,
  is_active  boolean default true,
  created_at timestamptz not null default now()
);

create table if not exists public.website_contacts (
  id         uuid primary key default gen_random_uuid(),
  facebook   text,
  instagram  text,
  tiktok     text,
  whatsapp   text,
  phone      text,
  address    text,
  email      text,
  updated_at timestamptz not null default now()
);

-- logo / landing_background store public URLs from the "website" bucket
create table if not exists public.website_settings (
  id                 uuid primary key default gen_random_uuid(),
  name               text,
  description        text,
  logo               text,                  -- ← "website" bucket URL
  phone_number_2     text,
  bank_number        text,
  address            text,
  phone              text,
  landing_background text,                   -- ← "website" bucket URL
  updated_at         timestamptz not null default now()
);

create table if not exists public.promo_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null,
  discount_percentage numeric not null default 0,
  is_active           boolean not null default true,
  is_used             boolean not null default false,
  used_at             timestamptz,
  reservation_id      uuid references public.reservations(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint promo_codes_code_unique unique (code)
);


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. DOCUMENT TEMPLATES / AGENCY SETTINGS / SESSIONS
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.agency_settings (
  id                 uuid primary key default gen_random_uuid(),
  agency_name        text,
  slogan             text,
  address            text,
  phone              text,
  logo               text,                  -- ← "website" bucket URL
  document_templates jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.document_templates (
  id            uuid primary key default gen_random_uuid(),
  agency_id     text,
  template_type text not null,              -- contrat|devis|facture|recu|engagement
  template      jsonb not null default '{}'::jsonb,
  template_name text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Optional audit trail for logins (create_admin_session RPC writes here) ───────
create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  access_token  text,
  refresh_token text,
  expires_at    bigint,
  user_agent    text,
  ip_address    text,
  created_at    timestamptz not null default now()
);


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. STORAGE BUCKETS  (one dedicated bucket per image kind)
-- ═════════════════════════════════════════════════════════════════════════════
--   cars        → car photos           (uploadCarImage.ts        → .from('cars'))
--   clients     → client photo + docs  (uploadClientImage.ts     → .from('clients'))
--   worker      → worker photos        (uploadWorkerImage.ts     → .from('worker'))
--   inspection  → inspection photos    (uploadInspectionImage.ts → .from('inspection'))
--   website     → logo / backgrounds   (uploadWebsiteImage.ts    → .from('website'))
--
--   public = true  →  getPublicUrl() returns a directly-viewable URL, so images
--   are displayed straight from the bucket while the DB only keeps that URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cars',       'cars',       true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif']),
  ('clients',    'clients',    true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif']),
  ('worker',     'worker',     true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif']),
  ('inspection', 'inspection', true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif']),
  ('website',    'website',    true, 5242880, array['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: anyone may READ (public display); the app may upload/replace.
do $$
declare b text;
begin
  foreach b in array array['cars','clients','worker','inspection','website'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_read');
    execute format('drop policy if exists %I on storage.objects', b || '_write');
    execute format('drop policy if exists %I on storage.objects', b || '_update');
    execute format('drop policy if exists %I on storage.objects', b || '_delete');

    execute format($f$create policy %I on storage.objects
      for select to anon, authenticated using (bucket_id = %L)$f$, b || '_read', b);

    execute format($f$create policy %I on storage.objects
      for insert to anon, authenticated with check (bucket_id = %L)$f$, b || '_write', b);

    execute format($f$create policy %I on storage.objects
      for update to anon, authenticated using (bucket_id = %L) with check (bucket_id = %L)$f$, b || '_update', b, b);

    execute format($f$create policy %I on storage.objects
      for delete to anon, authenticated using (bucket_id = %L)$f$, b || '_delete', b);
  end loop;
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 8. FUNCTIONS / RPCs  (called by the front-end)
-- ═════════════════════════════════════════════════════════════════════════════

-- 8.1 is_admin() — helper used by policies/functions ───────────────────────────
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 8.2 admin_create_worker() — create a worker FROM THE TEAM INTERFACE ──────────
--     Creates a real Supabase Auth user (so the worker logs in with his own
--     email + password), the workers HR row, and his interface/action
--     permissions — all in one call, WITHOUT disturbing the admin's session.
--     p_permissions is a JSON array like:
--       [{"interfaceId":"reservations","actions":["view","create","print"]},
--        {"interfaceId":"clients","actions":["view"]}]
create or replace function public.admin_create_worker(
  p_email       text,
  p_password    text,
  p_full_name   text,
  p_phone       text default null,
  p_type        text default 'worker',
  p_role_id     uuid default null,
  p_photo_url   text default null,
  p_base_salary numeric default null,
  p_payment_type text default null,
  p_permissions jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_uid       uuid := gen_random_uuid();
  v_worker_id uuid;
  v_perm      jsonb;
begin
  -- Only an admin may create workers
  if not public.is_admin() then
    raise exception 'ONLY_ADMIN_CAN_CREATE_WORKER';
  end if;

  if exists (select 1 from auth.users where email = lower(p_email)) then
    raise exception 'EMAIL_ALREADY_EXISTS';
  end if;

  -- 1) Create the Supabase Auth account (email confirmed so he can log in now)
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    lower(p_email), crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', p_type, 'full_name', p_full_name, 'username', p_full_name),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', lower(p_email)),
    'email', v_uid::text,
    now(), now(), now()
  );

  -- (the on_auth_user_created trigger already inserted the profile with role=p_type)

  -- 2) Create the HR worker row, linked to the auth account
  insert into public.workers (
    user_id, full_name, phone, email, profile_photo, type,
    role_id, base_salary, payment_type, login_enabled, active
  ) values (
    v_uid, p_full_name, p_phone, lower(p_email), p_photo_url, p_type,
    p_role_id, p_base_salary, p_payment_type, true, true
  )
  returning id into v_worker_id;

  -- 3) Store his permissions (which interfaces + which action buttons)
  for v_perm in select * from jsonb_array_elements(coalesce(p_permissions, '[]'::jsonb))
  loop
    insert into public.worker_permissions (worker_id, interface_id, actions)
    values (
      v_worker_id,
      v_perm->>'interfaceId',
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(v_perm->'actions') as value),
        '{}'
      )
    )
    on conflict (worker_id, interface_id)
    do update set actions = excluded.actions;
  end loop;

  return v_worker_id;
end $$;

-- 8.3 set_worker_permissions() — update a worker's permissions later ───────────
create or replace function public.set_worker_permissions(
  p_worker_id   uuid,
  p_permissions jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare v_perm jsonb;
begin
  if not public.is_admin() then
    raise exception 'ONLY_ADMIN_CAN_SET_PERMISSIONS';
  end if;

  delete from public.worker_permissions where worker_id = p_worker_id;

  for v_perm in select * from jsonb_array_elements(coalesce(p_permissions, '[]'::jsonb))
  loop
    insert into public.worker_permissions (worker_id, interface_id, actions)
    values (
      p_worker_id,
      v_perm->>'interfaceId',
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(v_perm->'actions') as value),
        '{}'
      )
    );
  end loop;
end $$;

-- 8.4 get_my_permissions() — the logged-in user asks "what can I see/do?" ──────
--     Returns { role, is_admin, permissions:[{interfaceId, actions[]}] }.
--     Admins implicitly get everything (front-end treats is_admin=true as all).
create or replace function public.get_my_permissions()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'role',        coalesce(p.role, 'worker'),
    'is_admin',    (p.role = 'admin'),
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'interfaceId', wp.interface_id,
               'actions',     wp.actions))
      from public.worker_permissions wp
      join public.workers w on w.id = wp.worker_id
      where w.user_id = auth.uid()
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

-- 8.5 login_worker() — LEGACY fallback used by Login.tsx when a worker was NOT ─
--     created as a real auth user (checks the workers table directly).
create or replace function public.login_worker(
  p_email_or_username text,
  p_password          text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare w public.workers%rowtype;
begin
  select * into w
  from public.workers
  where active = true
    and login_enabled = true
    and (lower(email) = lower(p_email_or_username) or username = p_email_or_username)
    and (password = p_password or password = crypt(p_password, password))
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'INVALID_CREDENTIALS');
  end if;

  return jsonb_build_object(
    'success', true,
    'worker', jsonb_build_object(
      'id',            w.id,
      'full_name',     w.full_name,
      'email',         w.email,
      'type',          w.type,
      'profile_photo', w.profile_photo
    )
  );
end $$;

-- 8.6 create_admin_session() — optional login audit trail (sessionService.ts) ─
create or replace function public.create_admin_session(
  p_access_token  text,
  p_refresh_token text,
  p_expires_at    bigint,
  p_user_agent    text default null,
  p_ip_address    text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_sessions (
    user_id, access_token, refresh_token, expires_at, user_agent, ip_address
  ) values (
    auth.uid(), p_access_token, p_refresh_token, p_expires_at, p_user_agent, p_ip_address
  );
end $$;

-- 8.7 get_reserved_periods() — public calendar blocking for one car ───────────
create or replace function public.get_reserved_periods(p_car_id uuid)
returns table(departure_date date, return_date date)
language sql stable security definer set search_path = public as $$
  select departure_date, return_date
  from public.reservations
  where car_id = p_car_id
    and status in ('pending','confirmed','active');
$$;

-- 8.8 get_unavailable_car_ids() — car ids booked over a period ─────────────────
create or replace function public.get_unavailable_car_ids(p_from date, p_to date)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct car_id
  from public.reservations
  where status in ('pending','accepted','confirmed','active')
    and car_id is not null
    and departure_date < p_to
    and return_date   > p_from;
$$;

-- 8.9 verify_promo_code() — validate a promo code for the public site ─────────
create or replace function public.verify_promo_code(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pc public.promo_codes%rowtype;
begin
  select * into pc from public.promo_codes
  where upper(code) = upper(trim(p_code)) limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'NOT_FOUND');
  end if;
  if not pc.is_active then
    return jsonb_build_object('valid', false, 'reason', 'INACTIVE');
  end if;
  if pc.is_used then
    return jsonb_build_object('valid', false, 'reason', 'ALREADY_USED');
  end if;

  return jsonb_build_object('valid', true, 'discount_percentage', pc.discount_percentage);
end $$;

-- 8.10 create_website_reservation() — the ONLY public write path (anon) ───────
--      Creates client + reservation + services (+ consumes a promo code) in a
--      single transaction, re-checking availability under a lock.
create or replace function public.create_website_reservation(
  p_client      jsonb,
  p_reservation jsonb,
  p_services    jsonb default '[]'::jsonb,
  p_promo_code  text  default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_client_id uuid;
  v_res_id    uuid;
  v_car_id    uuid := (p_reservation->>'car_id')::uuid;
  v_from      date := (p_reservation->>'departure_date')::date;
  v_to        date := (p_reservation->>'return_date')::date;
  v_svc       jsonb;
  v_pc        public.promo_codes%rowtype;
begin
  -- Availability check
  if exists (
    select 1 from public.reservations
    where car_id = v_car_id
      and status in ('pending','accepted','confirmed','active')
      and departure_date < v_to
      and return_date   > v_from
  ) then
    raise exception 'CAR_UNAVAILABLE';
  end if;

  -- Optional promo code
  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select * into v_pc from public.promo_codes
    where upper(code) = upper(trim(p_promo_code)) and is_active and not is_used
    limit 1;
    if not found then
      raise exception 'PROMO_CODE_INVALID';
    end if;
  end if;

  -- Client
  insert into public.clients (
    first_name, last_name, phone, email, wilaya, complete_address,
    license_number, profile_photo, scanned_documents, date_of_birth, place_of_birth
  ) values (
    p_client->>'first_name', p_client->>'last_name', p_client->>'phone',
    p_client->>'email', p_client->>'wilaya', p_client->>'complete_address',
    p_client->>'license_number', p_client->>'profile_photo',
    coalesce((select array_agg(value::text)
              from jsonb_array_elements_text(coalesce(p_client->'scanned_documents','[]'::jsonb)) as value), '{}'),
    nullif(p_client->>'date_of_birth','')::date,
    p_client->>'place_of_birth'
  )
  returning id into v_client_id;

  -- Reservation
  insert into public.reservations (
    client_id, car_id, departure_date, departure_time, departure_agency_id,
    return_date, return_time, return_agency_id, total_days, total_price,
    additional_fees, status, protection_assurance_id,
    protection_assurance_name, protection_assurance_price
  ) values (
    v_client_id, v_car_id, v_from, p_reservation->>'departure_time',
    p_reservation->>'departure_agency_id', v_to, p_reservation->>'return_time',
    p_reservation->>'return_agency_id',
    nullif(p_reservation->>'total_days','')::int,
    coalesce(nullif(p_reservation->>'total_price','')::numeric, 0),
    coalesce(nullif(p_reservation->>'additional_fees','')::numeric, 0),
    'pending',
    nullif(p_reservation->>'protection_assurance_id','')::uuid,
    p_reservation->>'protection_assurance_name',
    nullif(p_reservation->>'protection_assurance_price','')::numeric
  )
  returning id into v_res_id;

  -- Services
  for v_svc in select * from jsonb_array_elements(coalesce(p_services, '[]'::jsonb))
  loop
    insert into public.reservation_services (reservation_id, category, service_name, description, price)
    values (
      v_res_id, v_svc->>'category', v_svc->>'service_name', v_svc->>'description',
      coalesce(nullif(v_svc->>'price','')::numeric, 0)
    );
  end loop;

  -- Consume promo code
  if v_pc.id is not null then
    update public.promo_codes
      set is_used = true, used_at = now(), reservation_id = v_res_id
      where id = v_pc.id;
  end if;

  return jsonb_build_object('reservation_id', v_res_id, 'client_id', v_client_id);
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 9. ROW-LEVEL SECURITY
-- ═════════════════════════════════════════════════════════════════════════════
-- The React client (src/supabase.ts) runs with the ANON key and manages the
-- session manually, so operational tables must be reachable by anon+authenticated
-- for the dashboard to work. The per-worker gating (which interface / which
-- button) is enforced in the UI via worker_permissions + get_my_permissions().
--
-- Public-site tables allow anonymous READ only; all writes from the public site
-- go through the SECURITY DEFINER create_website_reservation() RPC above.
--
-- 🔒 HARDENING (recommended once you switch the client to attach the JWT, i.e.
--    set `persistSession: true` in src/supabase.ts): replace the `app_rw`
--    policies below with authenticated-only variants and lock workers/roles/
--    worker_permissions to is_admin(). Left permissive here so the app runs
--    as-is today.

-- 9.1 Operational tables — full access for anon + authenticated ───────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','roles','agencies','cars','clients','workers',
    'worker_advances','worker_absences','worker_payments','worker_permissions',
    'services','protection_assurance_items','protection_assurances',
    'protection_assurance_item_links','store_expenses','vehicle_expenses',
    'maintenance_alerts','reservations','reservation_services','payments',
    'inspection_checklist_items','vehicle_inspections','inspection_responses',
    'special_offers','offers','website_contacts','website_settings',
    'promo_codes','agency_settings','document_templates','user_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists app_rw on public.%I', t);
    execute format($p$create policy app_rw on public.%I
      for all to anon, authenticated using (true) with check (true)$p$, t);
  end loop;
end $$;

-- 9.2 Grants so the anon/authenticated roles can actually use the objects ──────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant select on public.admin_count to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 10. SEED DATA (optional starter rows)
-- ═════════════════════════════════════════════════════════════════════════════
insert into public.inspection_checklist_items (category, item_name, display_order) values
  ('security',   'Roue de secours',        1),
  ('security',   'Extincteur',             2),
  ('security',   'Triangle de signalisation', 3),
  ('equipment',  'Poste radio',            4),
  ('equipment',  'Climatisation',          5),
  ('comfort',    'Tapis de sol',           6),
  ('cleanliness','Propreté intérieure',    7)
on conflict do nothing;

-- =============================================================================
--  END. After running:
--   • Create your ADMIN from the app's Login page ("Créer un compte" — first
--     connection only). It signs up in Supabase Auth and becomes role 'admin'.
--   • Create WORKERS from the Team (Équipe) interface. Wire the "Ajouter un
--     travailleur" + permissions form to:  supabase.rpc('admin_create_worker', …)
--     and "Gérer les permissions" to:      supabase.rpc('set_worker_permissions', …)
--     Each worker then logs in with his own email + password, and the UI uses
--     supabase.rpc('get_my_permissions') to show only his interfaces & buttons.
-- =============================================================================
