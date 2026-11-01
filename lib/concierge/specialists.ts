import type { ConciergeRequest, Plan } from './contracts';

export type SpecialistId='local_places'|'entertainment'|'web_research'|'general';
export type Specialist={id:SpecialistId;instructions:string;searchBudget:number;fetchesPerRound:number;fetchBudget:number;direct:'cinema'|'weather'|'maps'|null};
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const ENTERTAINMENT_INSTRUCTIONS='Cinema/event requests: identify the actual venue in the requested city, then check its official programme for the exact requested local date. Give film title, showtime, format/language and age rating only when supported. An old weekday page or undated snippet is not today\'s schedule. Never substitute cafes or unrelated activities. If exact sessions cannot be verified, give the verified official programme/booking page for that venue, explain the date gap briefly, and offer Open programme / Tickets actions linked to verified URLs (not a promise that a seat is available). Recover with a targeted venue + date search before stopping.';
export const WEATHER_INSTRUCTIONS='Weather/clothing requests: use an up-to-date local hourly forecast for the requested place and time. Never present national averages, seasonal guesses, stale news, or another city\'s temperature as local conditions. State the location, forecast time, temperature/feels-like, rain and wind when supported, then practical clothing advice. If the direct weather feed is unavailable, search dedicated local weather forecast pages, and provide the verified forecast link if values cannot be confirmed.';

// Routing is local code over the existing task brief, not another paid model call.
export function selectSpecialist(input:ConciergeRequest,plan:Plan):Specialist {
  const base={searchBudget:plan.requiresWebsiteCheck?6:4,fetchesPerRound:2,fetchBudget:plan.requiresWebsiteCheck?6:4};
  const explicitPage=/https?:\/\//i.test(input.question)||Boolean(input.shared?.url);
  if(explicitPage)return {...base,id:'web_research',direct:null,instructions:'You are INeed’s website research specialist. Open the exact supplied page first. Extract the requested facts, not navigation instructions. Follow relevant public detail links. Use search only for missing facts or inaccessible pages, and clearly distinguish alternative-source evidence. Do not replace the requested page with unrelated recommendations. If a URL is sufficient, do not ask for the user’s location.'};
  if(plan.cinemaRequest || (plan.category==='research'&&/\b(cinema|cinematograf|filme|film|movies?|showtimes|concert|concerts|event|events|eveniment|evenimente|tickets|bilete)\b/.test(normalize(input.question+' '+plan.goal))))return {...base,id:'entertainment',direct:plan.cinemaRequest?'cinema':null,instructions:`You are INeed’s entertainment specialist. Prefer the direct official schedule adapter for supported venues. Preserve the requested city/date/film and return usable sessions, film details and verified booking actions. ${ENTERTAINMENT_INSTRUCTIONS}`};
  if(plan.category==='local'||plan.mapSearch)return {...base,id:'local_places',direct:!plan.requiresWebsiteCheck?'maps':null,instructions:'You are INeed’s local places specialist. Use the resolved destination and fresh device location through the map tool. A category lookup can use map facts directly. Specific dishes, services or amenities require official menu/site evidence. Keep named businesses distinct, and distinguish confirmed matches from unconfirmed leads. Return up to five useful options with factual descriptions and two supported actions per option when available. Never infer distance or live availability from a search snippet. Retain the exact requirement during recovery.'};
  if(plan.needsWeb||plan.category==='research')return {...base,id:'web_research',direct:plan.weatherRequest?'weather':null,instructions:`You are INeed’s research specialist. Prefer a structured live source when available. Otherwise read primary sources, extract the requested facts, compare dates and resolve disagreements before answering. Stop when sufficient evidence answers the question; avoid redundant searches. ${plan.weatherRequest?WEATHER_INSTRUCTIONS:''}`};
  return {...base,id:'general',direct:null,instructions:'Answer stable-knowledge requests directly. Preserve the existing cooking, photo and practical-help behavior. Do not initiate web research unless the task requires current or source-specific facts.'};
}

// Narrow first-turn shortcuts only. Complex/mixed requests and follow-ups still
// use the full planner; these never infer a new location from assistant history.
export function specialistQuickPlan(input:ConciergeRequest,now=new Date()):Plan|null {
  if(input.photo||input.shared||input.context.length||input.question.length>300)return null;
  const q=normalize(input.question).replace(/[?.!]+$/,'');
  const base={goal:input.question,clarification:null,category:'research' as const,needsWeb:true};
  if(/^(read|open|summarize|summarise|citeste|deschide|rezuma) https:\/\//.test(q)&& (input.question.match(/https?:\/\//g)||[]).length===1)return {...base,requiresWebsiteCheck:true};
  if(input.city&&/^(weather now|vremea acum|temperatura acum|what is the temperature now|care este temperatura acum)$/.test(q))return {...base,weatherRequest:{hoursAhead:0,clothing:false},destination:{city:input.city,source:'profile',clarificationReason:'none'}};
  const match=q.match(/^(?:ce filme (?:pot vedea|sunt|ruleaza) (?:la cinema )?(?:astazi|azi)|what movies (?:are showing|can i see) (?:at the cinema )?today)(?: (?:in|din) (.+))?$/);
  if(!match)return null;
  const explicit=match[1];
  // Only these unambiguous Romanian places use the Bucharest day shortcut.
  // Other countries/timezones and qualified requests stay with the planner.
  const city=explicit||input.city;
  if(!/^(drobeta[ -]turnu severin|orsova|campia turzii|bucuresti|bucharest|cluj[ -]napoca|timisoara|iasi|brasov|constanta|arad|braila|bacau|baia mare|targu[ -]jiu|targu mures|suceava|pitesti|ploiesti|deva)(?:, romania)?$/.test(normalize(city)))return null;
  // Capture the original literal suffix so destination validation sees accents.
  const originalCity=explicit?input.question.match(/\s(?:în|in|din)\s+(.+?)[?.!]*$/i)?.[1]:input.city;
  if(!originalCity)return null;
  return {...base,requiresWebsiteCheck:true,cinemaRequest:{date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),filmTitle:null},destination:{city:originalCity,source:explicit?'question':'profile',clarificationReason:'none'}};
}

export function createSpecialistMetrics(now:()=>number=Date.now) {
  const start=now();
  const data={version:'specialists-v1',specialist:'general' as SpecialistId,fastPlan:false,singlePass:false,planningMs:0,directMs:0,direct:'none',modelCalls:0,searches:0,fetches:0,recoveries:0,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0};
  return {data,finish:(outcome:string,evidenceSources=0)=>({ ...data,outcome,evidenceSources,totalMs:now()-start })};
}
