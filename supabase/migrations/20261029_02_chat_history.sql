begin;
create table public.concierge_chats (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  turns jsonb not null default '[]'::jsonb check(jsonb_typeof(turns)='array' and jsonb_array_length(turns)<=30),
  version integer not null default 0 check(version between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index concierge_chats_owner_recent on public.concierge_chats(user_id,updated_at desc,id desc);
alter table public.concierge_chats enable row level security;
revoke all on public.concierge_chats from anon,authenticated;
grant select on public.concierge_chats to authenticated;
create policy chats_owner_read on public.concierge_chats for select to authenticated
  using(user_id=(select auth.uid()));

-- The only write path. The authenticated owner is checked before reading or
-- appending. Row locking plus a version check prevents lost multi-tab updates.
create function public.append_concierge_turn(p_id uuid,p_version integer,p_turn jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); current_chat public.concierge_chats; safe_turn jsonb;
begin
  if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_id is null or p_version is null or p_version<0 or p_version>=30
    or p_turn is null or jsonb_typeof(p_turn)<>'object'
    or coalesce(p_turn->>'id','') !~ '^[0-9a-fA-F-]{36}$'
    or char_length(coalesce(p_turn->>'question','')) not between 2 and 2000
    or coalesce(p_turn->'result'->>'status','') not in ('answered','clarify')
    or octet_length(p_turn::text)>360000 then
    raise exception 'Invalid turn';
  end if;
  -- Allow-list fields: never retain raw photo data or arbitrary user metadata.
  safe_turn := jsonb_build_object('id',p_turn->'id','question',p_turn->'question',
    'result',p_turn->'result','hadPhoto',p_turn->'hadPhoto','city',p_turn->'city','language',p_turn->'language');
  if p_turn ? 'shared' then safe_turn:=safe_turn||jsonb_build_object('shared',p_turn->'shared'); end if;
  insert into public.concierge_chats(id,user_id,title)
    values(p_id,owner_id,left(p_turn->>'question',100)) on conflict(id) do nothing;
  select * into current_chat from public.concierge_chats where id=p_id for update;
  if current_chat.user_id<>owner_id then raise exception 'Chat unavailable' using errcode='42501'; end if;
  -- Retrying a lost HTTP response must not append a duplicate turn.
  if exists(select 1 from jsonb_array_elements(current_chat.turns) t where t->>'id'=p_turn->>'id') then
    return current_chat.version;
  end if;
  if current_chat.version<>p_version then raise exception 'Chat changed in another tab' using errcode='40001'; end if;
  update public.concierge_chats set turns=turns||jsonb_build_array(safe_turn),version=version+1,updated_at=now() where id=p_id;
  return current_chat.version+1;
end;
$$;
revoke all on function public.append_concierge_turn(uuid,integer,jsonb) from public,anon;
grant execute on function public.append_concierge_turn(uuid,integer,jsonb) to authenticated;
commit;
