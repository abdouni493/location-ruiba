-- ═══════════════════════════════════════════════════════════════════════════
-- CONSOLIDATED FIX — Worker creation + login (Team / Équipe interface)
-- ═══════════════════════════════════════════════════════════════════════════
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this WHOLE file → Run.
--   (Project: the one referenced by VITE_SUPABASE_URL in .env)
--
-- This file is IDEMPOTENT — safe to run even if parts were already applied.
-- It consolidates supabase/migrations/20260707_fix_worker_auth_login.sql plus
-- every dependency it needs (profiles table + trigger, is_admin(), the
-- worker_permissions table) so it works even on a project where schema.sql's
-- function section was never fully executed.
--
-- What it fixes:
--   • New worker doesn't appear in Supabase Authentication → Users.
--   • Worker (incl. type = Admin) can't log in / "Invalid login credentials" /
--     "Email not confirmed".
--   • "function gen_salt(text) does not exist" when creating a worker.
--   • Username / date of birth / address from the Team form never stored.
-- ---------------------------------------------------------------------------

-- 0) pgcrypto (crypt / gen_salt / gen_random_uuid). On Supabase it lives in
--    the `extensions` schema.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) profiles — 1 row per Supabase Auth user. is_admin() reads role from here.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text,
  full_name  text,
  role       text not null default 'worker',
  avatar     text,
  agency_id  text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever a new auth user is created. First user ever
-- becomes 'admin'; later ones default to 'worker' unless metadata says otherwise.
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
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2) Make sure every column/table the worker flow writes exists.
-- ---------------------------------------------------------------------------
alter table public.workers
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.workers
  add column if not exists login_enabled boolean not null default false;
alter table public.workers
  add column if not exists active boolean not null default true;
alter table public.workers
  add column if not exists date_of_birth date;
alter table public.workers
  add column if not exists address text;
alter table public.workers
  add column if not exists username text;
alter table public.workers
  add column if not exists password text;

create table if not exists public.worker_permissions (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references public.workers(id) on delete cascade,
  interface_id text not null,
  actions      text[] not null default '{}',
  created_at   timestamptz not null default now(),
  unique (worker_id, interface_id)
);

-- ---------------------------------------------------------------------------
-- 3) is_admin() — used by admin_create_worker() to gate creation.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- 4) admin_create_worker() — creates a REAL, EMAIL-CONFIRMED auth user + the
--    HR worker row + permissions, in one server-side call, without touching
--    the admin's session.
--
--    Old overloads are dropped first so PostgREST doesn't see two functions
--    with the same name (that makes rpc('admin_create_worker', …) ambiguous —
--    the exact failure mode described as "worker not created, no error shown").
-- ---------------------------------------------------------------------------
drop function if exists public.admin_create_worker(
  text, text, text, text, text, uuid, text, numeric, text, jsonb);
drop function if exists public.admin_create_worker(
  text, text, text, text, text, date, text, text, uuid, text, numeric, text, jsonb);

create or replace function public.admin_create_worker(
  p_email         text,
  p_password      text,
  p_full_name     text,
  p_username      text  default null,
  p_phone         text  default null,
  p_date_of_birth date  default null,
  p_address       text  default null,
  p_type          text  default 'worker',
  p_role_id       uuid  default null,
  p_photo_url     text  default null,
  p_base_salary   numeric default null,
  p_payment_type  text  default null,
  p_permissions   jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid       uuid := gen_random_uuid();
  v_worker_id uuid;
  v_perm      jsonb;
  v_email     text := lower(trim(p_email));
begin
  -- Only an admin may create workers (blocks anonymous privilege escalation).
  if not public.is_admin() then
    raise exception 'ONLY_ADMIN_CAN_CREATE_WORKER';
  end if;

  if v_email is null or length(v_email) = 0 then
    raise exception 'EMAIL_REQUIRED';
  end if;
  if p_password is null or length(p_password) = 0 then
    raise exception 'PASSWORD_REQUIRED';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'EMAIL_ALREADY_EXISTS';
  end if;

  -- 4.1) Auth account (email_confirmed_at = now() → can log in immediately).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'role', p_type,
      'full_name', p_full_name,
      'username', coalesce(p_username, p_full_name)
    ),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    'email', v_uid::text,
    now(), now(), now()
  );

  -- (the on_auth_user_created trigger inserts the profile with role = p_type)

  -- 4.2) HR worker row, linked to the auth account. login_enabled/password
  --      kept for the legacy login_worker() fallback.
  insert into public.workers (
    user_id, full_name, date_of_birth, phone, email, address, profile_photo,
    type, role_id, base_salary, payment_type, username, password,
    login_enabled, active
  ) values (
    v_uid, p_full_name, p_date_of_birth, p_phone, v_email, p_address, p_photo_url,
    p_type, p_role_id, p_base_salary, p_payment_type,
    coalesce(p_username, split_part(v_email, '@', 1)), p_password,
    true, true
  )
  returning id into v_worker_id;

  -- 4.3) Permissions (interfaces + action buttons).
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

grant execute on function public.admin_create_worker(
  text, text, text, text, text, date, text, text, uuid, text, numeric, text, jsonb
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) login_worker() — LEGACY fallback used by Login.tsx only for workers that
--    do NOT have a Supabase Auth account (created before this fix).
-- ---------------------------------------------------------------------------
create or replace function public.login_worker(
  p_email_or_username text,
  p_password          text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare w public.workers%rowtype;
begin
  select * into w
  from public.workers
  where active = true
    and login_enabled = true
    and (lower(email) = lower(p_email_or_username) or username = p_email_or_username)
    and (
      password = p_password
      or (password like '$2%' and password = crypt(p_password, password))
    )
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

grant execute on function public.login_worker(text, text) to anon, authenticated;

-- 6) Let workers created before this fix log in through the fallback.
update public.workers
set login_enabled = true
where login_enabled is distinct from true;

-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNOSTICS (read-only — run these after the fix to sanity-check the data)
-- ═══════════════════════════════════════════════════════════════════════════

-- A) Workers with NO matching auth account (created before the fix). These
--    can only log in through the legacy login_worker() fallback. To give them
--    real accounts: delete + recreate them from the Team page, or create the
--    auth user manually in Authentication → Users and set workers.user_id.
-- select w.id, w.full_name, w.email
-- from public.workers w
-- left join auth.users u on u.id = w.user_id
-- where u.id is null;

-- B) Is the currently-logged-in admin really 'admin' in profiles?
--    (admin_create_worker raises ONLY_ADMIN_CAN_CREATE_WORKER otherwise.)
-- select u.email, p.role from public.profiles p join auth.users u on u.id = p.id;

-- C) Promote a user to admin manually (needed to bootstrap the very first
--    admin now that the Login page no longer offers account creation):
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
