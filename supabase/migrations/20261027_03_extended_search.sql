-- iNeed · căutare extinsă (în afara site-ului oficial) pentru unii producători.
-- Se rulează o singură dată în Supabase → SQL Editor.

-- „oficial”: doar pe domeniile aprobate. „extins”: oriunde, cu verificare și
-- aprobare manuală (ex. Esser, Schrack, care țin manualele în spatele unui cont).
alter table public.manufacturers
  add column search_mode text not null default 'oficial'
    check (search_mode in ('oficial', 'extins'));

-- Manual găsit pe site-ul producătorului (true) sau pe alt site (false).
alter table public.manuals
  add column official boolean not null default true;

update public.manufacturers
set search_mode = 'extins'
where name in ('Esser', 'Schrack Seconet');
