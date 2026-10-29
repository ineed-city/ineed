-- Explicitly submitted reports only. No automatic conversation or image storage.
begin;
create table public.answer_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_id uuid not null,
  rating text not null check (rating in ('helpful', 'not_helpful')),
  comment text not null default '' check (char_length(comment) <= 1000),
  question text not null check (char_length(question) between 2 and 2000),
  answer text not null check (char_length(answer) between 1 and 16000),
  language text not null check (language in ('en', 'ro')),
  created_at timestamptz not null default now(),
  unique(user_id, answer_id)
);
alter table public.answer_feedback enable row level security;
revoke all on public.answer_feedback from anon, authenticated;
grant select on public.answer_feedback to authenticated;
grant insert(user_id, answer_id, rating, comment, question, answer, language) on public.answer_feedback to authenticated;
grant update(user_id, answer_id, rating, comment, question, answer, language) on public.answer_feedback to authenticated;
create policy feedback_read on public.answer_feedback for select to authenticated
  using (user_id = (select auth.uid()) or (select private.app_role()) = 'admin');
create policy feedback_insert on public.answer_feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy feedback_update on public.answer_feedback for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index answer_feedback_created_idx on public.answer_feedback(created_at desc);
commit;
