-- Between Us: database schema for Supabase.
-- Run this whole file once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Safe to re-run: every statement is idempotent.

create extension if not exists pgcrypto;

-- ───────────────────────── tables ─────────────────────────

-- One row per paired space (a couple).
create table if not exists public.couples (
  id           uuid primary key default gen_random_uuid(),
  invite_code  text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- The (up to) two people in a space. A person can belong to one space.
create table if not exists public.members (
  couple_id     uuid not null references public.couples(id) on delete cascade,
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  display_name  text not null default 'Me' check (char_length(display_name) between 1 and 40),
  joined_at     timestamptz not null default now(),
  primary key (couple_id, user_id)
);

-- Licence codes you hand to buyers. max_uses = 1 for unique codes, higher for a shared code.
create table if not exists public.licenses (
  code        text primary key,
  max_uses    int  not null default 1 check (max_uses >= 1),
  uses        int  not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);

create table if not exists public.license_redemptions (
  code         text not null references public.licenses(code),
  user_id      uuid not null references auth.users(id) on delete cascade,
  couple_id    uuid references public.couples(id) on delete set null,
  redeemed_at  timestamptz not null default now(),
  primary key (code, user_id)
);

-- The journal itself: one JSON document per path, scoped to a couple.
-- Deletes are soft (deleted = true) so realtime can filter them by couple.
create table if not exists public.docs (
  couple_id   uuid not null references public.couples(id) on delete cascade,
  path        text not null check (char_length(path) between 3 and 400),
  data        jsonb not null default '{}'::jsonb check (octet_length(data::text) < 262144),
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (couple_id, path)
);
create index if not exists docs_couple_updated_idx on public.docs (couple_id, updated_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.touch_updated_at();

-- ───────────────────────── row level security ─────────────────────────

create or replace function public.my_couple_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select couple_id from public.members where user_id = auth.uid()
$$;
revoke all on function public.my_couple_ids() from public, anon;
grant execute on function public.my_couple_ids() to authenticated;

alter table public.couples              enable row level security;
alter table public.members              enable row level security;
alter table public.docs                 enable row level security;
alter table public.licenses             enable row level security;
alter table public.license_redemptions  enable row level security;
-- licenses and license_redemptions get no policies on purpose: only the functions below touch them.

drop policy if exists couples_select on public.couples;
create policy couples_select on public.couples for select to authenticated
  using (id in (select public.my_couple_ids()));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (couple_id in (select public.my_couple_ids()));

drop policy if exists members_update_self on public.members;
create policy members_update_self on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists docs_select on public.docs;
create policy docs_select on public.docs for select to authenticated
  using (couple_id in (select public.my_couple_ids()));

drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated
  with check (couple_id in (select public.my_couple_ids()));

drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
  using (couple_id in (select public.my_couple_ids()))
  with check (couple_id in (select public.my_couple_ids()));

-- ───────────────────────── functions the app calls ─────────────────────────

-- Recursive JSON merge: objects merge key by key, anything else is replaced.
create or replace function public.jsonb_merge_deep(a jsonb, b jsonb) returns jsonb
language plpgsql immutable as $$
declare
  k text; v jsonb; res jsonb;
begin
  if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(b) is distinct from 'object' then
    return b;
  end if;
  res := a;
  for k, v in select * from jsonb_each(b) loop
    if jsonb_typeof(v) = 'object' and jsonb_typeof(res -> k) = 'object' then
      res := jsonb_set(res, array[k], public.jsonb_merge_deep(res -> k, v));
    else
      res := jsonb_set(res, array[k], v, true);
    end if;
  end loop;
  return res;
end $$;

-- Atomic merge of fields into an existing document. Runs as the caller, so RLS applies.
create or replace function public.merge_doc(p_couple uuid, p_path text, p_data jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.docs
     set data = public.jsonb_merge_deep(data, p_data)
   where couple_id = p_couple and path = p_path and not deleted;
  if not found then
    raise exception 'document does not exist' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.merge_doc(uuid, text, jsonb) from public, anon;
grant execute on function public.merge_doc(uuid, text, jsonb) to authenticated;

-- A buyer redeems a licence code and gets a new space.
create or replace function public.redeem_license(p_code text, p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text := upper(trim(p_code));
  lic      public.licenses%rowtype;
  v_couple uuid;
  v_invite text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception 'You already have a space.' using errcode = 'P0001';
  end if;
  select * into lic from public.licenses where code = v_code for update;
  if not found or lic.uses >= lic.max_uses then
    raise exception 'That code is not valid, or it has already been used.' using errcode = 'P0001';
  end if;
  v_invite := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.couples (invite_code, created_by) values (v_invite, v_uid) returning id into v_couple;
  insert into public.members (couple_id, user_id, display_name)
    values (v_couple, v_uid, coalesce(nullif(left(trim(p_name), 40), ''), 'Me'));
  update public.licenses set uses = uses + 1 where code = v_code;
  insert into public.license_redemptions (code, user_id, couple_id) values (v_code, v_uid, v_couple);
  return json_build_object('couple_id', v_couple, 'invite_code', v_invite);
end $$;
revoke all on function public.redeem_license(text, text) from public, anon;
grant execute on function public.redeem_license(text, text) to authenticated;

-- The partner joins the space with the invite code. No payment needed for the second person.
create or replace function public.join_couple(p_code text, p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception 'You already have a space.' using errcode = 'P0001';
  end if;
  select id into v_couple from public.couples where invite_code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'No space has that invite code.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.members where couple_id = v_couple) >= 2 then
    raise exception 'That space already has two people.' using errcode = 'P0001';
  end if;
  insert into public.members (couple_id, user_id, display_name)
    values (v_couple, v_uid, coalesce(nullif(left(trim(p_name), 40), ''), 'Me'));
  return json_build_object('couple_id', v_couple);
end $$;
revoke all on function public.join_couple(text, text) from public, anon;
grant execute on function public.join_couple(text, text) to authenticated;

-- ───────────────────────── seller tools (run these yourself in the SQL editor) ─────────────────────────
-- Not callable from the app: execute is revoked from every API role.

-- Create n unique single-use codes like BU-3F9A-C21D-77B0. Returns the codes.
create or replace function public.create_licenses(n int default 1, p_note text default null) returns setof text
language plpgsql security definer set search_path = public as $$
declare
  i int; c text;
begin
  for i in 1..n loop
    c := 'BU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
         || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
         || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    insert into public.licenses (code, max_uses, note) values (c, 1, p_note);
    return next c;
  end loop;
end $$;
revoke all on function public.create_licenses(int, text) from public, anon, authenticated;

-- Create one shared code that works for up to max_uses buyers (useful when your checkout shows one code to everyone).
create or replace function public.create_shared_license(p_code text, p_max_uses int, p_note text default null) returns text
language plpgsql security definer set search_path = public as $$
begin
  if length(trim(p_code)) < 10 then
    raise exception 'Use a code with at least 10 characters.';
  end if;
  insert into public.licenses (code, max_uses, note) values (upper(trim(p_code)), p_max_uses, p_note);
  return upper(trim(p_code));
end $$;
revoke all on function public.create_shared_license(text, int, text) from public, anon, authenticated;

-- ───────────────────────── realtime ─────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
      alter publication supabase_realtime add table public.docs;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members') then
      alter publication supabase_realtime add table public.members;
    end if;
  end if;
end $$;
