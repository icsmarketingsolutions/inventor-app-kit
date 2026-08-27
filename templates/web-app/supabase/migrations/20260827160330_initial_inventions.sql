create table public.inventions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null
    constraint inventions_title_length
    check (char_length(btrim(title)) between 1 and 120),
  description text not null default ''
    constraint inventions_description_length
    check (char_length(description) <= 2000),
  status text not null default 'idea'
    constraint inventions_status_valid
    check (status in ('idea', 'prototype', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventions is
  'Ideas y prototipos privados, propiedad del usuario autenticado.';

create index inventions_user_created_idx
  on public.inventions (user_id, created_at desc);

alter table public.inventions enable row level security;

revoke all on table public.inventions from public, anon, authenticated;
revoke all on sequence public.inventions_id_seq from public, anon, authenticated;

grant select, insert, update, delete on table public.inventions to authenticated;
grant usage, select on sequence public.inventions_id_seq to authenticated;

create policy "Users select own inventions"
  on public.inventions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own inventions"
  on public.inventions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own inventions"
  on public.inventions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own inventions"
  on public.inventions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
