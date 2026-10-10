-- Run once in your Supabase SQL Editor. Turn on Authentication > Providers > Anonymous sign-ins.
-- Members are anonymous Supabase users linked to an unguessable invite code.

create table if not exists public.quote_rooms (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null default (gen_random_uuid()::text || gen_random_uuid()::text),
  created_at timestamptz not null default now()
);
create table if not exists public.quote_members (
  room_id uuid not null references public.quote_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id)
);
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.quote_rooms(id) on delete cascade,
  quote_text text not null check (length(trim(quote_text)) between 1 and 1000),
  speaker text not null check (length(trim(speaker)) between 1 and 80),
  place text not null default '' check (length(place) <= 120),
  said_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
create index if not exists quotes_room_said_at on public.quotes(room_id,said_at desc);

alter table public.quote_rooms enable row level security;
alter table public.quote_members enable row level security;
alter table public.quotes enable row level security;

revoke all on public.quote_rooms from anon,authenticated;
revoke all on public.quote_members from anon,authenticated;
revoke all on public.quotes from anon,authenticated;
grant select on public.quote_members to authenticated;
grant select,insert,update,delete on public.quotes to authenticated;

create policy "members see own membership" on public.quote_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "room members read quotes" on public.quotes
  for select to authenticated using (exists (
    select 1 from public.quote_members m where m.room_id = quotes.room_id and m.user_id = (select auth.uid())
  ));
create policy "room members add own quotes" on public.quotes
  for insert to authenticated with check (created_by = (select auth.uid()) and exists (
    select 1 from public.quote_members m where m.room_id = quotes.room_id and m.user_id = (select auth.uid())
  ));
create policy "authors update own quotes" on public.quotes
  for update to authenticated using (created_by = (select auth.uid()) and exists (
    select 1 from public.quote_members m where m.room_id = quotes.room_id and m.user_id = (select auth.uid())
  )) with check (created_by = (select auth.uid()) and exists (
    select 1 from public.quote_members m where m.room_id = quotes.room_id and m.user_id = (select auth.uid())
  ));
create policy "authors delete own quotes" on public.quotes
  for delete to authenticated using (created_by = (select auth.uid()) and exists (
    select 1 from public.quote_members m where m.room_id = quotes.room_id and m.user_id = (select auth.uid())
  ));

create or replace function public.create_quote_room()
returns table(room_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare r public.quote_rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.quote_rooms default values returning * into r;
  insert into public.quote_members(room_id,user_id) values (r.id,auth.uid());
  return query select r.id,r.invite_code;
end; $$;

create or replace function public.join_quote_room(p_invite_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare found_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into found_id from public.quote_rooms where invite_code = trim(p_invite_code);
  if found_id is null then raise exception 'Invite code not found'; end if;
  insert into public.quote_members(room_id,user_id) values (found_id,auth.uid()) on conflict do nothing;
  return found_id;
end; $$;

create or replace function public.get_quote_room()
returns table(room_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return query select r.id,r.invite_code from public.quote_rooms r
    join public.quote_members m on m.room_id = r.id
    where m.user_id = auth.uid() order by m.joined_at desc limit 1;
end; $$;

revoke execute on function public.create_quote_room() from public,anon;
revoke execute on function public.join_quote_room(text) from public,anon;
revoke execute on function public.get_quote_room() from public,anon;
grant execute on function public.create_quote_room() to authenticated;
grant execute on function public.join_quote_room(text) to authenticated;
grant execute on function public.get_quote_room() to authenticated;
