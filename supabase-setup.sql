-- Makki Madni Travel & Tours website CMS
-- Run this entire script in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.website_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.website_hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null check (city in ('makkah','madinah')),
  badge text default '',
  view_text text default '',
  description text not null default '',
  price text default '',
  image_url text,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.website_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  badge text default '',
  description text not null default '',
  price text default '',
  image_url text,
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.website_admins enable row level security;
alter table public.website_hotels enable row level security;
alter table public.website_packages enable row level security;

drop policy if exists "admins can read own admin row" on public.website_admins;
create policy "admins can read own admin row" on public.website_admins for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "public can read visible hotels" on public.website_hotels;
create policy "public can read visible hotels" on public.website_hotels for select to anon, authenticated
using (is_visible = true or exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())));

drop policy if exists "admins manage hotels" on public.website_hotels;
create policy "admins manage hotels" on public.website_hotels for all to authenticated
using (exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())));

drop policy if exists "public can read visible packages" on public.website_packages;
create policy "public can read visible packages" on public.website_packages for select to anon, authenticated
using (is_visible = true or exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())));

drop policy if exists "admins manage packages" on public.website_packages;
create policy "admins manage packages" on public.website_packages for all to authenticated
using (exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())))
with check (exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())));

-- Storage bucket for photos (public read, only authorized website admins can upload/change/delete)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('website-photos','website-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "public can view website photos" on storage.objects;
create policy "public can view website photos" on storage.objects for select to anon, authenticated
using (bucket_id='website-photos');

drop policy if exists "admins upload website photos" on storage.objects;
create policy "admins upload website photos" on storage.objects for insert to authenticated
with check (bucket_id='website-photos' and exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())));

drop policy if exists "admins update website photos" on storage.objects;
create policy "admins update website photos" on storage.objects for update to authenticated
using (bucket_id='website-photos' and exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())))
with check (bucket_id='website-photos' and exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())));

drop policy if exists "admins delete website photos" on storage.objects;
create policy "admins delete website photos" on storage.objects for delete to authenticated
using (bucket_id='website-photos' and exists(select 1 from public.website_admins a where a.user_id=(select auth.uid())));

-- After creating your admin login under Authentication > Users, run:
-- insert into public.website_admins (user_id) values ('PASTE_AUTH_USER_UUID_HERE');
