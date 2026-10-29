import { NextStepsSchema } from './next-steps';
import { z } from 'zod';
import { safeSourceUrl } from './contracts';

export const MAX_CHAT_TURNS = 30;
const SavedResultSchema = z.object({
  mapData:z.boolean().optional(),
  nextSteps: NextStepsSchema.optional(),
  answerId: z.uuid().optional(),
  status: z.enum(['answered', 'clarify']),
  message: z.string().max(4000).optional(),
  searched: z.boolean().optional(),
  segments: z.array(z.object({
    text: z.string().max(24000),
    sources: z.array(z.object({title:z.string().max(2000),url:z.string().max(4000).refine(v=>Boolean(safeSourceUrl(v)))})).max(40),
  })).max(100),
});
export const SavedTurnSchema = z.object({
  id:z.uuid(), question:z.string().trim().min(2).max(2000),
  result:SavedResultSchema, hadPhoto:z.boolean(),
  city:z.string().max(100), language:z.enum(['en','ro']),
  shared:z.object({text:z.string().max(6000),url:z.string().max(2000).refine(v=>!v||Boolean(safeSourceUrl(v)))}).optional(),
}).refine(v=>JSON.stringify(v).length <= 90000).transform(turn => {
  if(!turn.result.mapData) return turn;
  // Google Places content is transient: retain the user's request, not the
  // provider listing, address, phone, attribution or map-derived action data.
  const ro=turn.language==='ro';
  return {...turn,result:{status:'answered' as const,answerId:turn.result.answerId,segments:[{text:ro?'Rezultatele hărții nu sunt salvate. Repetă căutarea pentru date actuale.':'Map results are not saved. Search again for current listings.',sources:[]}],nextSteps:[{title:ro?'Caută din nou':'Search again',actions:[{type:'followup' as const,label:ro?'Actualizează rezultatele':'Refresh results',prompt:turn.question}]}]}};
});
export const SaveTurnSchema = z.object({id:z.uuid(),version:z.number().int().min(0).max(MAX_CHAT_TURNS),turn:SavedTurnSchema});
export const SavedChatSchema = z.object({
  id:z.uuid(), title:z.string().max(100), version:z.number().int(),
  updated_at:z.string(), turns:z.array(SavedTurnSchema).max(MAX_CHAT_TURNS),
});
export type SavedTurn = z.infer<typeof SavedTurnSchema>;
export type SavedChat = z.infer<typeof SavedChatSchema>;
export type ChatSummary = Pick<SavedChat,'id'|'title'|'updated_at'>;

export function chatContext(turns:SavedTurn[]):string[] {
  return turns.slice(-MAX_CHAT_TURNS).map(turn=>{
    const answer = turn.result.mapData ? 'Map results were shown but are not retained. Search again for current details.' : turn.result.status==='clarify' ? turn.result.message || '' : turn.result.segments.map(s=>s.text).join('');
    return `User: ${turn.question}\nArea at the time: ${turn.city || 'not set'}\n${turn.hadPhoto ? 'A photo was attached then; it is not available in saved history. Ask to reattach it if visual details are needed.\n' : ''}Previous response (recheck current facts): ${answer}`.slice(0,4000);
  });
}
