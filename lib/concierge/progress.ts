import type { ConciergeResult } from './contracts';
import type { askSavedConcierge } from './session';
export type AnswerStage = 'planning' | 'maps' | 'research' | 'recovering' | 'writing';
export type AnswerProgress = (event: {type:'stage';stage:AnswerStage}|{type:'draft';text:string})=>void;
export type SavedResponse = Awaited<ReturnType<typeof askSavedConcierge>>;
export type ResponseEvent = Parameters<AnswerProgress>[0] | {type:'answer';answer:ConciergeResult} | {type:'done';response:SavedResponse} | {type:'error'};
