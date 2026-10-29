'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { SaveTurnSchema, SavedChatSchema, chatContext, type SavedChat, type ChatSummary } from '@/lib/concierge/history';
import { RequestSchema, resolveDestination, type ConciergeResult } from '@/lib/concierge/contracts';
import { askConcierge } from './concierge-actions';

async function account() {
  const db = await createClient();
  const {data} = await db.auth.getClaims();
  if (!data?.claims?.sub) throw new Error('Sign in required');
  return {db,userId:data.claims.sub};
}
export async function listChats(offset=0):Promise<{ok:true;chats:ChatSummary[];more:boolean}|{ok:false}> {
  if (!z.number().int().min(0).max(100000).safeParse(offset).success) return {ok:false};
  try {
    const {db,userId}=await account();
    const {data,error}=await db.from('concierge_chats').select('id,title,updated_at').eq('user_id',userId).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+20);
    if (error) return {ok:false};
    return {ok:true,chats:(data||[]).slice(0,20),more:(data||[]).length>20};
  } catch { return {ok:false}; }
}
export async function loadChat(id:string):Promise<{ok:true;chat:SavedChat}|{ok:false}> {
  if (!z.uuid().safeParse(id).success) return {ok:false};
  try {
    const {db,userId}=await account();
    const {data,error}=await db.from('concierge_chats').select('id,title,version,updated_at,turns').eq('id',id).eq('user_id',userId).single();
    const parsed=SavedChatSchema.safeParse(data);
    return !error && parsed.success ? {ok:true,chat:parsed.data} : {ok:false};
  } catch { return {ok:false}; }
}
export async function saveChatTurn(raw:unknown):Promise<{ok:true;version:number}|{ok:false;conflict:boolean}> {
  const parsed=SaveTurnSchema.safeParse(raw);
  if (!parsed.success) return {ok:false,conflict:false};
  try {
    const {db}=await account();
    const {data,error}=await db.rpc('append_concierge_turn',{p_id:parsed.data.id,p_version:parsed.data.version,p_turn:parsed.data.turn});
    if (error || typeof data!=='number') return {ok:false,conflict:error?.code==='40001'};
    return {ok:true,version:data};
  } catch { return {ok:false,conflict:false}; }
}

// Save on the server before returning, so a closed tab cannot interrupt the
// persistence step after generation. The same turn ID is reused for retries.
export async function askSavedConcierge(raw:unknown, identity:unknown) {
  const input=RequestSchema.parse(raw);
  const meta=z.object({id:z.uuid(),version:z.number().int().min(0).max(29),turnId:z.uuid()}).parse(identity);
  if(meta.version>0) {
    const existing=await loadChat(meta.id);
    if(existing.ok) {
      const duplicate=existing.chat.turns.find(turn=>turn.id===meta.turnId);
      if(duplicate) return {answer:duplicate.result,turn:duplicate,saved:{ok:true as const,version:existing.chat.version}};
    }
    if(!existing.ok || existing.chat.version!==meta.version) return {answer:{status:'error',segments:[],message:input.language==='ro'?'Conversația s-a modificat sau nu este disponibilă. Redeschide-o din Istoric înainte să continui.':'This chat changed or is unavailable. Reopen it from History before continuing.'} satisfies ConciergeResult};
    input.context=chatContext(existing.chat.turns);
  }
  const answer=await askConcierge(input);
  if(answer.status==='error') return {answer};
  const turn={id:meta.turnId,question:input.question,result:{...answer,status:answer.status},city:answer.plan?resolveDestination(input,answer.plan).city:input.city,language:input.language,hadPhoto:Boolean(input.photo),...(input.shared?{shared:input.shared}:{})};
  const saved=await saveChatTurn({id:meta.id,version:meta.version,turn});
  return {answer,turn,saved};
}
