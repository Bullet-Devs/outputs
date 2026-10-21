-- CineMax: perfiles, listas personales y opiniones privadas por perfil.
create table if not exists public.cinemax_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now()
);

create table if not exists public.cinemax_library (
  profile_id uuid not null references public.cinemax_profiles(id) on delete cascade,
  list_type text not null check (list_type in ('favorites', 'later')),
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id bigint not null check (tmdb_id > 0),
  title text not null,
  poster_url text,
  created_at timestamptz not null default now(),
  primary key (profile_id, list_type, media_type, tmdb_id)
);

create table if not exists public.cinemax_reviews (
  profile_id uuid not null references public.cinemax_profiles(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id bigint not null check (tmdb_id > 0),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 1 and 800),
  updated_at timestamptz not null default now(),
  primary key (profile_id, media_type, tmdb_id)
);

create or replace function public.cinemax_limit_profiles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.cinemax_profiles where user_id = new.user_id) >= 5 then
    raise exception 'Una cuenta puede tener hasta 5 perfiles.';
  end if;
  return new;
end;
$$;

drop trigger if exists cinemax_profile_limit on public.cinemax_profiles;
create trigger cinemax_profile_limit
  before insert on public.cinemax_profiles
  for each row execute function public.cinemax_limit_profiles();

alter table public.cinemax_profiles enable row level security;
alter table public.cinemax_library enable row level security;
alter table public.cinemax_reviews enable row level security;

drop policy if exists "CineMax users manage own profiles" on public.cinemax_profiles;
create policy "CineMax users manage own profiles" on public.cinemax_profiles
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "CineMax profile owners manage library" on public.cinemax_library;
create policy "CineMax profile owners manage library" on public.cinemax_library
  for all to authenticated
  using (exists (select 1 from public.cinemax_profiles p where p.id = profile_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cinemax_profiles p where p.id = profile_id and p.user_id = (select auth.uid())));

drop policy if exists "CineMax profile owners manage reviews" on public.cinemax_reviews;
create policy "CineMax profile owners manage reviews" on public.cinemax_reviews
  for all to authenticated
  using (exists (select 1 from public.cinemax_profiles p where p.id = profile_id and p.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cinemax_profiles p where p.id = profile_id and p.user_id = (select auth.uid())));
