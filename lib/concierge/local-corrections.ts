import type { BetaSearchResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { ConciergeRequest, ConciergeResult, Plan } from './contracts';

// Reviewed public business facts only. Never import raw feedback, customer names,
// medical requests or private contact details. New entries require source review.
// Area aliases are retrieval leads, not evidence of official neighborhood borders.
const corrections = [{
  city: 'Câmpia Turzii',
  name: 'Catena Gheorghe Baritiu 59',
  address: 'Str. Gheorghe Baritiu Nr. 59, Câmpia Turzii, 405100, Cluj',
  phone: '+40755011335',
  areas: ['Blocuri', 'Barițiu'],
  needs: ['farmacie', 'farmacii', 'farmacia', 'pharmacy', 'pharmacies', 'catena'],
  reviewedAt: '2026-10-29',
  expiresAt: '2026-11-28',
  sources: [{
    source: 'https://www.catena.ro/assets/uploads/files/files/lista-farmacii-cu-iodura-de-potasiu-iod-pe-judete-2(1).pdf',
    title: 'Catena — lista farmaciilor',
    text: 'CATENA FARMACIE. CÂMPIA TURZII. Strada Gheorghe Barițiu nr.59, ap. III.',
  }, {
    source: 'https://firmania.ro/campia-turzii/catena-gheorghe-baritiu-59-123137',
    title: 'Catena Gheorghe Baritiu 59 — date de contact',
    text: 'Catena Gheorghe Baritiu 59. Str. Gheorghe Baritiu Nr. 59, Câmpia Turzii, 405100, Cluj. Telefon: +40 755 011 335.',
  }],
}];
const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const contains = (text:string, phrase:string) => ` ${text} `.includes(` ${normalize(phrase)} `);

function matchingCorrections(input:ConciergeRequest, plan:Plan, now:Date) {
  if(plan.category !== 'local' || input.shared || input.photo) return [];
  // Match the current request or its resolved task brief, including follow-up
  // landmarks. Do not directly scan raw history or use the device city as a match.
  const question = normalize(input.question);
  const resolved = normalize(plan.goal);
  const date = now.toISOString().slice(0,10);
  return corrections.filter(entry => date >= entry.reviewedAt && date < entry.expiresAt &&
    (contains(question,entry.city) || contains(resolved,entry.city)) && entry.areas.some(area=>contains(question,area) || contains(resolved,area)) &&
    entry.needs.some(need=>contains(question,need) || contains(normalize(plan.goal),need)));
}

export function reviewedLocalSources(input:ConciergeRequest, plan:Plan, now = new Date()):BetaSearchResultBlockParam[] {
  return matchingCorrections(input,plan,now).flatMap(entry=>entry.sources.map(source=>({
      type:'search_result' as const, source:source.source, title:source.title,
      citations:{enabled:true}, content:[{type:'text' as const,text:source.text}],
    })));
}

export const LOCAL_CORRECTION_INSTRUCTIONS = `When reviewed local source blocks are supplied, consult that exact business before wider-city options and cite the supplied evidence. They are manually reviewed listing excerpts, not live inventory or proof of present opening hours. They were retrieved using a locally reported area alias; this does not establish official neighborhood boundaries, distance, or nearest ranking. Present the specific street address helpfully, rather than withholding the business because the informal neighborhood name is absent from the listing. Check current web evidence for changes; if it contradicts an excerpt, explain the conflict and prefer fresher reliable evidence. Never imply the feedback itself is a public source or reveal who submitted it. Do not repeat the stored profile city or narrate search strategy. For a simple local request, usually one relevant option, a short uncertainty note if necessary, and useful map/contact actions are enough.`;


// For a self-contained directory lookup, render reviewed facts and their actions
// directly. Let the model/search handle qualifications, hours, stock and advice.
export function reviewedLocalAnswer(input:ConciergeRequest, plan:Plan, now = new Date()):ConciergeResult | null {
  const question = normalize(input.question.replace(/^\[Test[^\]]*\]\s*/i,''));
  const basicLookup = /^(?:caut (?:o )?farmacie|unde (?:este|e|gasesc) (?:o )?farmacie|find (?:a )?pharmacy|where (?:is|can i find) (?:a )?pharmacy)\b/.test(question);
  const constraints = /\b(?:program|orar|deschis|deschisa|deschise|acum|azi|maine|garda|nonstop|non stop|stoc|produs|medicament|antibiotic|antibiotice|probiotic|probiotice|pret|ieftin|ieftina|livrare|acces|rampa|scaun|wheelchair|open|opening|hours|today|tomorrow|stock|medicine|delivery|cheap|price|nearest|aproape|apropiata|departe|distanta|24|noapte|night|inchis|inchisa|closed|not|nu|fara|without|except|doar|only)\b/;
  if(!basicLookup || constraints.test(question) || question.length>180) return null;
  const entry=matchingCorrections(input,plan,now)[0];
  if(!entry || !contains(question,entry.city)) return null;
  const ro=input.language==='ro';
  return {
    status:'answered', plan, searched:false,
    segments:[
      {text:ro ? `O opțiune semnalată local pentru zona cerută este ${entry.name}.\n${entry.address}.` : `A locally suggested option for your requested area is ${entry.name}.\n${entry.address}.`,sources:[{title:entry.sources[0].title,url:entry.sources[0].source}]},
      {text:`\n${ro?'Telefon':'Phone'}: ${entry.phone}.`,sources:[{title:entry.sources[1].title,url:entry.sources[1].source}]},
      {text:ro ? '\nSună înainte pentru a confirma programul și disponibilitatea produsului.' : '\nCall ahead to confirm opening hours and product availability.',sources:[]},
    ],
    nextSteps:[{title:entry.name,actions:[
      {type:'maps',label:ro?'Vezi pe hartă':'Open maps',destination:entry.address,sourceUrl:entry.sources[0].source},
      {type:'call',label:ro?'Sună farmacia':'Call pharmacy',phone:entry.phone,sourceUrl:entry.sources[1].source},
    ]}],
  };
}
