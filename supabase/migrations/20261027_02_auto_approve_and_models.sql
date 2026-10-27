-- iNeed · aprobarea manualelor propuse și curățarea modelelor duplicate.
-- Se rulează o singură dată în Supabase → SQL Editor.

-- 1. Manualele găsite înainte de aprobarea automată devin aprobate.
update public.manuals
set status = 'aprobat'
where status = 'propus';

-- 2. Șterge dublurile fără manuale (ex. „sp4000” când există „SP4000” cu manuale).
delete from public.products p
where not exists (select 1 from public.manuals m where m.product_id = p.id)
  and exists (
    select 1 from public.products q
    where q.manufacturer_id = p.manufacturer_id
      and upper(q.model) = upper(p.model)
      and q.id <> p.id
  );

-- 3. Toate modelele cu majuscule, ca în aplicație.
update public.products
set model = upper(model)
where model <> upper(model);

-- 4. De acum, același model nu mai poate apărea de două ori la un producător,
--    indiferent de litere mari sau mici.
create unique index products_manufacturer_model_upper_idx
  on public.products (manufacturer_id, upper(model));
