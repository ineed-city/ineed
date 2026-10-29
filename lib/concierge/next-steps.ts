import { z } from 'zod';

const label = z.string().trim().min(1).max(60);
export function publicLink(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname.includes('.') && !/^[\d.]+$/.test(u.hostname) && !/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname);
  } catch { return false; }
}
export const NextActionSchema = z.discriminatedUnion('type', [
  z.object({ type:z.literal('followup'), label, prompt:z.string().trim().min(2).max(1000) }),
  z.object({ type:z.literal('checklist'), label, items:z.array(z.string().trim().min(1).max(180)).min(1).max(30) }),
  z.object({ type:z.literal('timer'), label, seconds:z.number().int().min(5).max(86400) }),
  z.object({ type:z.literal('copy'), label, text:z.string().trim().min(1).max(4000) }),
  z.object({ type:z.literal('website'), label, url:z.string().max(2000).refine(publicLink) }),
  z.object({ type:z.literal('maps'), label, destination:z.string().trim().min(3).max(300), sourceUrl:z.string().max(2000).refine(publicLink) }),
  z.object({ type:z.literal('call'), label, phone:z.string().regex(/^\+[1-9]\d{6,14}$/), sourceUrl:z.string().max(2000).refine(publicLink) }),
]);
export const NextStepsSchema = z.array(z.object({ title:label, actions:z.array(NextActionSchema).min(1).max(2) })).max(5);
export const PresentationSchema = z.object({ groups:NextStepsSchema });
export type NextAction = z.infer<typeof NextActionSchema>;
export type NextSteps = z.infer<typeof NextStepsSchema>;
export type ActionEvidence = { url:string; quote:string };
const normalized = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

// Model proposals are data, never executable code. External actions must match
// citation evidence from this response, not URLs supplied by the user or model.
export function verifiedSteps(raw:unknown, evidence:ActionEvidence[]):NextSteps {
  const parsed=PresentationSchema.safeParse(raw);
  if(!parsed.success) return [];
  return parsed.data.groups.flatMap(group=>{
    const actions=group.actions.filter(action=>{
      if(action.type==='website') return evidence.some(e=>e.url===action.url);
      if(action.type==='maps') return evidence.some(e=>e.url===action.sourceUrl && normalized(e.quote).includes(normalized(group.title)) && normalized(e.quote).includes(normalized(action.destination)));
      if(action.type==='call') return evidence.some(e=>e.url===action.sourceUrl && normalized(e.quote).includes(normalized(group.title)) && (e.quote.match(/\+\d[\d\s().-]{5,24}\d/g)||[]).some(phone=>phone.replace(/\D/g,'')===action.phone.slice(1)));
      return true;
    });
    return actions.length ? [{title:group.title,actions}] : [];
  });
}

export const NEXT_STEPS_INSTRUCTIONS = `Prepare useful next steps by calling present_next_steps exactly once. After its result, write the complete concise cited answer. This tool only proposes buttons; it does not execute actions. Do not describe tool internals in your answer.
Choose up to two complementary actions per group, with at most four groups total. For local recommendations, create one group per recommended business with its exact business name as title. Otherwise usually one group is enough. Labels and contents must be in the user's language. Prefer concrete actions over generic follow-ups; never force irrelevant actions or suggest unsafe tasks.
Supported actions: checklist (shopping ingredients WITH quantities and servings, preparation, packing or safe steps), timer (one specific timed step explicitly stated in your answer, seconds 5–86400, label names the step AND duration), copy (a ready-to-copy draft, never sent), followup (a specific question to continue the conversation, e.g. practice, explain, compare, adapt), website (exact cited HTTPS URL), maps (business name and full destination verbatim from cited evidence plus sourceUrl), call (public business phone in international +digits format actually printed in cited evidence plus sourceUrl).
For recipes prefer Shopping list and a timer only when the recipe specifies a useful duration; otherwise offer an adaptation. For interviews offer practice and a preparation checklist. For letters offer a draft reply or explanation. For purchases use the cited product page and comparison follow-up. For technical products offer the official cited manual or a safe clarification.
External actions must use evidence from this response. Never invent URLs, addresses or phone numbers, derive phone country codes, or include private people's contacts. If a phone or destination cannot be evidenced, offer its cited website and a relevant follow-up instead. Do not promise bookings, purchases, sending messages or background timer notifications. For emergencies or high-stakes requests prioritize the appropriate help and omit optional distractions. Keep any pre-tool text brief; only the complete final answer after the tool result is shown to the user.`;
