-- iNeed · pasul 5a: roluri, producători, produse și manuale.
-- Se rulează o singură dată în Supabase → SQL Editor.

-- ---------------------------------------------------------------------------
-- Roluri
-- ---------------------------------------------------------------------------

-- Schema „private” nu e expusă prin API: funcțiile de aici nu pot fi apelate
-- direct din browser, doar folosite în regulile de securitate (RLS).
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'tehnician'
    check (role in ('admin', 'tehnician', 'utilizator')),
  created_at timestamptz not null default now()
);

-- Rolul utilizatorului logat. „security definer” îi permite să citească
-- profiles fără să intre în buclă cu regulile RLS ale tabelului.
create function private.app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

-- Fiecare cont nou primește automat un profil (implicit „tehnician”).
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Profiluri pentru conturile care existau deja.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'admin@advancefortify.com');

-- ---------------------------------------------------------------------------
-- Producători, produse, manuale
-- ---------------------------------------------------------------------------

create table public.manufacturers (
  id bigint generated always as identity primary key,
  name text not null unique,
  category text not null check (category in ('camere', 'efractie', 'incendiu')),
  -- Singurele domenii pe care AI-ul are voie să caute manuale.
  domains text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.products (
  id bigint generated always as identity primary key,
  manufacturer_id bigint not null references public.manufacturers (id),
  model text not null,
  created_at timestamptz not null default now(),
  unique (manufacturer_id, model)
);

create table public.manuals (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  kind text not null check (kind in ('utilizare', 'instalare')),
  title text not null,
  source_url text not null,
  -- Amprenta SHA-256 a PDF-ului: se schimbă dacă producătorul publică altă versiune.
  sha256 text not null,
  page_count int,
  -- ID-ul fișierului stocat la Anthropic (Files API); PDF-ul nu e ținut la noi.
  anthropic_file_id text,
  status text not null default 'propus'
    check (status in ('propus', 'aprobat', 'respins')),
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (product_id, sha256)
);

create index manuals_product_id_idx on public.manuals (product_id);
create index products_manufacturer_id_idx on public.products (manufacturer_id);

-- ---------------------------------------------------------------------------
-- Reguli de securitate (RLS)
-- Fără politici, un tabel cu RLS activ nu poate fi citit de nimeni prin API.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.manufacturers enable row level security;
alter table public.products enable row level security;
alter table public.manuals enable row level security;

-- Profiluri: fiecare își vede profilul; adminul le vede pe toate.
-- Rolurile se schimbă doar din Supabase (nicio politică de scriere).
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.app_role()) = 'admin');

-- Producători și produse: toți cei logați citesc, doar adminul scrie.
create policy "manufacturers_select" on public.manufacturers
  for select to authenticated using (true);
create policy "manufacturers_admin_write" on public.manufacturers
  for all to authenticated
  using ((select private.app_role()) = 'admin')
  with check ((select private.app_role()) = 'admin');

create policy "products_select" on public.products
  for select to authenticated using (true);
create policy "products_admin_write" on public.products
  for all to authenticated
  using ((select private.app_role()) = 'admin')
  with check ((select private.app_role()) = 'admin');

-- Manuale: doar cele aprobate; cele de instalare doar pentru tehnicieni și admin.
-- Adminul vede tot, inclusiv manualele propuse, ca să le aprobe.
create policy "manuals_select" on public.manuals
  for select to authenticated
  using (
    (select private.app_role()) = 'admin'
    or (
      status = 'aprobat'
      and (kind = 'utilizare' or (select private.app_role()) = 'tehnician')
    )
  );
create policy "manuals_admin_write" on public.manuals
  for all to authenticated
  using ((select private.app_role()) = 'admin')
  with check ((select private.app_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- Producătorii de pornire (domeniile se pot corecta oricând)
-- ---------------------------------------------------------------------------

insert into public.manufacturers (name, category, domains) values
  ('Dahua',          'camere',   '{dahuasecurity.com}'),
  ('Hikvision',      'camere',   '{hikvision.com}'),
  ('Axis',           'camere',   '{axis.com}'),
  ('Paradox',        'efractie', '{paradox.com}'),
  ('Honeywell',      'efractie', '{resideo.com,honeywell.com}'),
  ('DSC',            'efractie', '{dsc.com}'),
  ('Schrack Seconet','incendiu', '{schrack-seconet.com}'),
  ('Esser',          'incendiu', '{esser-systems.com}');
