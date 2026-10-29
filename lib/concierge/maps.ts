import 'server-only';
import { z } from 'zod';
import type { ConciergeRequest, ConciergeResult, Plan } from './contracts';
import type { NextAction } from './next-steps';

const Point = z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)});
const Place = z.object({
  id:z.string(), displayName:z.object({text:z.string()}), formattedAddress:z.string(), location:Point,
  addressComponents:z.array(z.object({longText:z.string(),types:z.array(z.string())})).optional(),
  internationalPhoneNumber:z.string().optional(), googleMapsUri:z.string().optional(),
  businessStatus:z.string().optional(), types:z.array(z.string()).optional(),
  attributions:z.array(z.object({provider:z.string(),providerUri:z.string().optional()})).optional(),
});
const Response = z.object({places:z.array(z.unknown()).default([])});
const Component = z.object({longText:z.string().optional(),shortText:z.string().optional(),types:z.array(z.string()).default([])});
const Attribution = z.object({provider:z.string(),providerUri:z.string().optional()});

// Google's field mask requests fields; it does not guarantee each listing or
// address component contains them. One incomplete listing must not erase others.
export function parsePlaces(raw:unknown):z.infer<typeof Place>[] {
  const response=Response.parse(raw);
  const places=response.places.flatMap(item=>{
    if(!item || typeof item!=='object') return [];
    const record=item as Record<string,unknown>;
    const components=Array.isArray(record.addressComponents)?record.addressComponents.flatMap(c=>{
      const parsed=Component.safeParse(c);
      if(!parsed.success) return [];
      const longText=parsed.data.longText || parsed.data.shortText;
      return longText?[{longText,types:parsed.data.types}]:[];
    }):[];
    const attributions=Array.isArray(record.attributions)?record.attributions.flatMap(a=>{
      const parsed=Attribution.safeParse(a);return parsed.success?[parsed.data]:[];
    }):[];
    const parsed=Place.safeParse({...record,addressComponents:components,attributions,
      internationalPhoneNumber:typeof record.internationalPhoneNumber==='string'?record.internationalPhoneNumber:undefined,
      googleMapsUri:typeof record.googleMapsUri==='string'?record.googleMapsUri:undefined,
      businessStatus:typeof record.businessStatus==='string'?record.businessStatus:undefined,
      types:Array.isArray(record.types)?record.types.filter(t=>typeof t==='string'):[],
    });
    if(!parsed.success) {
      console.info('maps listing omitted',JSON.stringify(parsed.error.issues.map(i=>({path:i.path.join('.'),code:i.code}))));
      return [];
    }
    return [parsed.data];
  });
  if(response.places.length && !places.length) throw new Error('Maps invalid listings');
  return places;
}
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// Conservative typo tolerance: a single changed character in a distinctive
// landmark word, never an unrestricted fuzzy match across cities.
function nameMatches(requested:string, actual:string) {
  const words=normalize(requested).split(' ').filter(w=>!['parc','parcul','parcului','park','municipal','the','station','gara','strada','street'].includes(w));
  const names=normalize(actual).split(' ');
  return words.length>0 && words.every(w=>names.some(n=>w===n || (w.length>=4 && w.length===n.length && [...w].filter((c,i)=>c!==n[i]).length===1)));
}
const sameCity=(p:z.infer<typeof Place>,city:string)=> (p.addressComponents||[]).some(c=>c.types.some(t=>['locality','postal_town','administrative_area_level_3'].includes(t)) && normalize(c.longText)===normalize(city.split(',')[0]));
const fields='places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents,places.types,places.businessStatus,places.attributions';
const mapUrl=(p:z.infer<typeof Place>)=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName.text+' '+p.formattedAddress)}&query_place_id=${encodeURIComponent(p.id)}`;

// Public place query only. Never send the whole chat, photo, profile name or
// medical/product question to Google. No Places content is cached or logged.
export async function mapAnswer(input:ConciergeRequest,plan:Plan,fetcher:typeof fetch=fetch):Promise<ConciergeResult|null> {
  const search=plan.mapSearch;
  const key=process.env.GOOGLE_MAPS_API_KEY || '';
  if(!key || !search || plan.category!=='local' || input.photo || input.shared || !input.city.trim()) return null;
  const ro=input.language==='ro';
  const signal=AbortSignal.timeout(15_000);
  async function lookup(method:'searchText'|'searchNearby',body:Record<string,unknown>,phone=false) {
    const response=await fetcher(`https://places.googleapis.com/v1/places:${method}`,{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fields+(phone?',places.internationalPhoneNumber':'')},body:JSON.stringify({...body,languageCode:input.language})});
    if(!response.ok) throw new Error(`Maps HTTP ${response.status}`);
    return parsePlaces(await response.json());
  }
  try {
    let anchor:z.infer<typeof Place>|undefined;
    let places:z.infer<typeof Place>[];
    if(search.landmark) {
      const candidates=await lookup('searchText',{textQuery:`${search.landmark.replace(/\bparcului\b/gi, 'parcul')}, ${input.city}`,pageSize:3});
      // A city mismatch or ambiguous landmark must never silently select a place.
      const matches=candidates.filter(p=>sameCity(p,input.city) && nameMatches(search.landmark!,p.displayName.text) && (!search.landmarkType || p.types?.includes(search.landmarkType)));
      if(matches.length!==1) return {status:'clarify',plan,segments:[],message:ro?`Nu pot identifica sigur „${search.landmark}” în ${input.city}. Îmi dai strada sau un link Google Maps al reperului?`:`I can’t reliably identify “${search.landmark}” in ${input.city}. What street is it on, or can you share its Google Maps link?`};
      anchor=matches[0];
      places=await lookup('searchNearby',{includedTypes:[search.placeType],maxResultCount:10,rankPreference:'DISTANCE',locationRestriction:{circle:{center:anchor.location,radius:1500}}},true);
    } else {
      places=await lookup('searchText',{textQuery:`${search.query}, ${input.city}`,includedType:search.placeType,strictTypeFiltering:true,pageSize:5},true);
      places=places.filter(p=>sameCity(p,input.city));
    }
    places=places.filter(p=>search.placeType!=='pharmacy' || !/\b(fito farmacie|fitofarmacie|fitosanitara|farmacie veterinara|veterinary pharmacy)\b/.test(normalize(p.displayName.text)));
    places=places.filter(p=>p.businessStatus!=='CLOSED_PERMANENTLY'&&p.businessStatus!=='CLOSED_TEMPORARILY').slice(0,3);
    const segments:ConciergeResult['segments']=[];
    if(anchor) segments.push({text:ro?`Am găsit reperul ${anchor.displayName.text}. Opțiuni de pe hartă în raza de 1,5 km:\n\n`:`I found ${anchor.displayName.text}. Map listings within 1.5 km:\n\n`,sources:[{title:'Google Maps',url:mapUrl(anchor)}]});
    if(!places.length) segments.push({text:ro?'Nu am găsit rezultate pe hartă în această zonă. Poți extinde căutarea; lipsa unui rezultat nu înseamnă că nu există afaceri acolo.':'No map listings were returned for this area. You can broaden the search; missing listings do not mean no businesses exist.',sources:[]});
    for(const p of places) segments.push({text:`${p.displayName.text}\n${p.formattedAddress}\n\n`,sources:[{title:'Google Maps',url:mapUrl(p)}]});
    const attributions=[...(anchor?[anchor]:[]),...places].flatMap(p=>p.attributions||[]);
    segments.push({text:ro?'Date: Google Maps. Confirmă programul și disponibilitatea direct.':'Data: Google Maps. Confirm hours and availability directly.',sources:attributions.flatMap(a=>a.providerUri?.startsWith('https://')?[{title:a.provider,url:a.providerUri}]:[])});
    return {status:'answered',plan,segments,mapData:true,searched:false,nextSteps:places.map(p=>{
      const actions:NextAction[]=[{type:'website',label:ro?'Deschide harta':'Open map',url:mapUrl(p)}];
      const phone=p.internationalPhoneNumber?.replace(/[\s().-]/g,'');
      if(phone && /^\+[1-9]\d{6,14}$/.test(phone)) actions.push({type:'call',label:ro?'Sună':'Call',phone,sourceUrl:mapUrl(p)});
      else actions.push({type:'website',label:ro?'Traseu':'Directions',url:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.displayName.text+' '+p.formattedAddress)}&destination_place_id=${encodeURIComponent(p.id)}`});
      return {title:p.displayName.text.slice(0,60),actions};
    })};
  } catch(error) {
    console.info('maps lookup unavailable',error instanceof Error && /^Maps (HTTP \d+|invalid listings)$/.test(error.message)?error.message:error instanceof z.ZodError?'invalid envelope':error instanceof Error?error.name:'unknown');
    // Do not quietly turn an unavailable map lookup into fake nearby results.
    return {status:'error',segments:[],message:ro?'Nu pot consulta harta acum. Încearcă din nou în câteva momente.':'I can’t check the map right now. Please try again shortly.'};
  }
}
