-- iNeed: manuals move to a separate app. Removes their tables and all their data.
-- Run once in Supabase SQL Editor, only after the code without manuals is live.
-- profiles and private.app_role() stay: /admin/feedback still uses them.

begin;
drop table public.manuals;
drop table public.products;
drop table public.manufacturers;
commit;
