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
const Response = z.object({places:z.array(Place).default([])});
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// Conservative typo tolerance: a single changed character in a distinctive
// landmark word, never an unrestricted fuzzy match across cities.
function nameMatches(requested:string, actual:string) {
  const words=normalize(requested).split(' ').filter(w=>!['parc','parcul','park','municipal','the','station','gara','strada','street'].includes(w));
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
    return Response.parse(await response.json()).places;
  }
  try {
    let anchor:z.infer<typeof Place>|undefined;
    let places:z.infer<typeof Place>[];
    if(search.landmark) {
      const candidates=await lookup('searchText',{textQuery:`${search.landmark}, ${input.city}`,pageSize:3});
      // A city mismatch or ambiguous landmark must never silently select a place.
      const matches=candidates.filter(p=>sameCity(p,input.city) && nameMatches(search.landmark!,p.displayName.text) && (!search.landmarkType || p.types?.includes(search.landmarkType)));
      if(matches.length!==1) return {status:'clarify',plan,segments:[],message:ro?`Nu pot identifica sigur „${search.landmark}” în ${input.city}. Îmi dai strada sau un link Google Maps al reperului?`:`I can’t reliably identify “${search.landmark}” in ${input.city}. What street is it on, or can you share its Google Maps link?`};
      anchor=matches[0];
      places=await lookup('searchNearby',{includedTypes:[search.placeType],maxResultCount:5,rankPreference:'DISTANCE',locationRestriction:{circle:{center:anchor.location,radius:1500}}},true);
    } else {
      places=await lookup('searchText',{textQuery:`${search.query}, ${input.city}`,includedType:search.placeType,strictTypeFiltering:true,pageSize:5},true);
      places=places.filter(p=>sameCity(p,input.city));
    }
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
      else actions.push({type:'website',label:ro?'Detalii și program':'Details and hours',url:mapUrl(p)});
      return {title:p.displayName.text.slice(0,60),actions};
    })};
  } catch(error) {
    console.info('maps lookup unavailable',error instanceof Error && /^Maps HTTP \d+$/.test(error.message)?error.message:'timeout or invalid response');
    // Do not quietly turn an unavailable map lookup into fake nearby results.
    return {status:'error',segments:[],message:ro?'Nu pot consulta harta acum. Încearcă din nou în câteva momente.':'I can’t check the map right now. Please try again shortly.'};
  }
}
