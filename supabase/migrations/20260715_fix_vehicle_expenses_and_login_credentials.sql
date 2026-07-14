-- ═══════════════════════════════════════════════════════════════════════════
-- FIX — Vehicle-expense saving (PGRST204 ac_filter_changed) + Settings login
--       credentials (email / username / password) update.
-- ═══════════════════════════════════════════════════════════════════════════
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New query → paste this WHOLE file → Run.
--   (Project referenced by VITE_SUPABASE_URL in .env)
--
-- This file is IDEMPOTENT — safe to run multiple times.
--
-- What it fixes:
--   1. "Could not find the 'ac_filter_changed' column of 'vehicle_expenses'
--      in the schema cache" (PGRST204) when saving a vehicle expense from the
--      Maintenance page, the car row "Dépenses" button, or the Expenses page.
--      → the four *_filter_changed columns (and the other tracking columns the
--        app writes) are added if missing, then the PostgREST schema cache is
--        reloaded so the REST API sees them immediately.
--   2. Settings → "Informations de Connexion": changing email / username /
--      password now actually updates the account used at login.
-- ---------------------------------------------------------------------------

-- 0) pgcrypto (crypt / gen_salt). On Supabase it lives in `extensions`.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) vehicle_expenses — make sure every column the app writes exists.
-- ---------------------------------------------------------------------------
alter table public.vehicle_expenses
  add column if not exists current_mileage     int,
  add column if not exists next_vidange_km     int,
  add column if not exists expiration_date     date,
  add column if not exists expense_name        text,
  add column if not exists oil_filter_changed  boolean not null default false,
  add column if not exists air_filter_changed  boolean not null default false,
  add column if not exists fuel_filter_changed boolean not null default false,
  add column if not exists ac_filter_changed   boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) update_login_credentials() — change the email / username / password of the
--    currently-logged-in account, verifying the current password first.
--
--    The app disables the Supabase SDK session (persistSession = false), so
--    supabase.auth.updateUser() is not reliable here. This SECURITY DEFINER
--    function updates both:
--      • auth.users (email + bcrypt password + identities)  → Supabase Auth login
--      • public.workers (email / username / password)       → login_worker fallback
--    It requires the CURRENT password, so an anonymous caller cannot hijack an
--    account.
-- ---------------------------------------------------------------------------
create or replace function public.update_login_credentials(
  p_current_email    text,
  p_current_password text,
  p_new_email        text default null,
  p_new_password     text default null,
  p_new_username     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email     text := lower(trim(p_current_email));
  v_new_email text := nullif(lower(trim(coalesce(p_new_email, ''))), '');
  v_new_pass  text := nullif(p_new_password, '');
  v_new_user  text := nullif(trim(coalesce(p_new_username, '')), '');
  v_uid       uuid;
  v_worker    public.workers%rowtype;
  v_has_worker boolean := false;
  v_auth_ok   boolean := false;
  v_worker_ok boolean := false;
begin
  if v_email is null or length(v_email) = 0 then
    raise exception 'EMAIL_REQUIRED';
  end if;
  if p_current_password is null or length(p_current_password) = 0 then
    raise exception 'CURRENT_PASSWORD_REQUIRED';
  end if;

  -- Verify current password against the Supabase Auth account (admin + workers
  -- created through admin_create_worker).
  select id into v_uid
  from auth.users
  where lower(email) = v_email
    and encrypted_password is not null
    and encrypted_password = crypt(p_current_password, encrypted_password)
  limit 1;

  if v_uid is not null then
    v_auth_ok := true;
  end if;

  -- Verify / locate the HR worker row (legacy fallback + Settings display).
  select * into v_worker
  from public.workers
  where lower(email) = v_email
  limit 1;

  if found then
    v_has_worker := true;
    if v_worker.password is not null and (
         v_worker.password = p_current_password
         or (v_worker.password like '$2%' and v_worker.password = crypt(p_current_password, v_worker.password))
       ) then
      v_worker_ok := true;
    end if;
    if v_uid is null and v_worker.user_id is not null then
      v_uid := v_worker.user_id;
    end if;
  end if;

  if not v_auth_ok and not v_worker_ok then
    raise exception 'INVALID_CURRENT_PASSWORD';
  end if;

  -- Block collisions when changing to an email owned by a different account.
  if v_new_email is not null and v_new_email <> v_email then
    if exists (
      select 1 from auth.users
      where lower(email) = v_new_email and id is distinct from v_uid
    ) then
      raise exception 'EMAIL_ALREADY_EXISTS';
    end if;
    if exists (
      select 1 from public.workers
      where lower(email) = v_new_email and (v_worker.id is null or id <> v_worker.id)
    ) then
      raise exception 'EMAIL_ALREADY_EXISTS';
    end if;
  end if;

  -- Update the Supabase Auth account (email + password) when one exists.
  if v_uid is not null then
    update auth.users
    set email              = coalesce(v_new_email, email),
        encrypted_password = case when v_new_pass is not null
                                  then crypt(v_new_pass, gen_salt('bf'))
                                  else encrypted_password end,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = case when v_new_user is not null
                                  then coalesce(raw_user_meta_data, '{}'::jsonb)
                                       || jsonb_build_object('username', v_new_user)
                                  else raw_user_meta_data end,
        updated_at         = now()
    where id = v_uid;

    -- Keep the email identity in sync so signInWithPassword still matches.
    update auth.identities
    set identity_data = jsonb_set(
          coalesce(identity_data, '{}'::jsonb),
          '{email}',
          to_jsonb(coalesce(v_new_email, v_email))
        ),
        updated_at = now()
    where user_id = v_uid and provider = 'email';

    -- profiles username (if the profiles table exists in this project).
    if v_new_user is not null and to_regclass('public.profiles') is not null then
      update public.profiles set username = v_new_user where id = v_uid;
    end if;
  end if;

  -- Update the HR worker row (email / username / password) for the legacy
  -- login_worker() fallback and so the Settings form reloads the new values.
  if v_has_worker then
    update public.workers
    set email         = coalesce(v_new_email, email),
        username      = coalesce(v_new_user, username),
        password      = coalesce(v_new_pass, password),
        login_enabled = true
    where id = v_worker.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'email',   coalesce(v_new_email, v_email)
  );
end $$;

grant execute on function public.update_login_credentials(text, text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Tell PostgREST to reload its schema cache NOW, so the newly-added
--    vehicle_expenses columns and the new function are visible immediately
--    (otherwise the PGRST204 error can persist until the next cache refresh).
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
