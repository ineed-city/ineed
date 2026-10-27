-- iNeed · textul fiecărei pagini din manual, extras o singură dată.
-- Claude primește textul (nu imaginile paginilor): de ~4 ori mai puțini tokeni,
-- iar citările rămân pe pagină (o pagină = un bloc de text).
-- Se rulează o singură dată în Supabase → SQL Editor.

alter table public.manuals
  add column page_texts text[];
