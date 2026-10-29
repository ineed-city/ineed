import 'server-only';
import { z } from 'zod';
import { freshDeviceLocation } from './contracts';
import type { ConciergeRequest, ConciergeResult, Plan } from './contracts';
import type { NextAction } from './next-steps';

const Point = z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)});
const Place = z.object({
  rating:z.number().min(0).max(5).optional(), userRatingCount:z.number().int().min(0).optional(),
  primaryTypeDisplayName:z.object({text:z.string()}).optional(),
  currentOpeningHours:z.object({openNow:z.boolean().optional()}).optional(),
  servesVegetarianFood:z.boolean().optional(), dineIn:z.boolean().optional(), takeout:z.boolean().optional(),
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
      rating:typeof record.rating==='number' && record.rating>=0 && record.rating<=5?record.rating:undefined,
      userRatingCount:typeof record.userRatingCount==='number' && Number.isInteger(record.userRatingCount) && record.userRatingCount>=0?record.userRatingCount:undefined,
      primaryTypeDisplayName:typeof (record.primaryTypeDisplayName as {text?:unknown})?.text==='string'?record.primaryTypeDisplayName:undefined,
      currentOpeningHours:typeof (record.currentOpeningHours as {openNow?:unknown})?.openNow==='boolean'?record.currentOpeningHours:undefined,
      ...Object.fromEntries(['servesVegetarianFood','dineIn','takeout'].map(k=>[k,typeof record[k]==='boolean'?record[k]:undefined])),
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
export function distanceMeters(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}) {
  const rad=Math.PI/180;
  const h=Math.sin((b.latitude-a.latitude)*rad/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
function placeDetails(p:z.infer<typeof Place>,ro:boolean,origin?:{latitude:number;longitude:number}) {
  const facts:string[]=[];
  if(p.primaryTypeDisplayName?.text) facts.push(p.primaryTypeDisplayName.text);
  const cuisines:Record<string,[string,string]>={italian_restaurant:['Bucătărie italiană','Italian cuisine'],pizza_restaurant:['Pizza','Pizza'],chinese_restaurant:['Bucătărie chinezească','Chinese cuisine'],japanese_restaurant:['Bucătărie japoneză','Japanese cuisine'],indian_restaurant:['Bucătărie indiană','Indian cuisine'],seafood_restaurant:['Pește și fructe de mare','Seafood'],vegetarian_restaurant:['Vegetarian','Vegetarian'],vegan_restaurant:['Vegan','Vegan'],barbecue_restaurant:['Grătar','Barbecue'],fast_food_restaurant:['Fast-food','Fast food']};
  const cuisine=(p.types||[]).find(t=>cuisines[t]);
  if(cuisine) facts.push(cuisines[cuisine][ro?0:1]);
  if(p.rating!==undefined) facts.push(`${p.rating.toFixed(1)} / 5 Google${p.userRatingCount!==undefined?` · ${p.userRatingCount} ${ro?'recenzii':'reviews'}`:''}`);
  if(p.currentOpeningHours?.openNow!==undefined) facts.push(p.currentOpeningHours.openNow?(ro?'Deschis acum':'Open now'):(ro?'Închis acum':'Closed now'));
  const features=[p.servesVegetarianFood===true?(ro?'Opțiuni vegetariene':'Vegetarian options'):'',p.dineIn===true?(ro?'Servire la masă':'Dine-in'):'',p.takeout===true?(ro?'La pachet':'Takeaway'):''].filter(Boolean);
  if(features.length) facts.push(features.join(' · '));
  if(origin) {const d=distanceMeters(origin,p.location);facts.push(`${ro?'La aproximativ':'Approximately'} ${d<1000?`${Math.round(d/50)*50} m`:`${(d/1000).toFixed(1)} km`} ${ro?'în linie dreaptă':'in a straight line'}`);}
  return facts;
}
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
    const response=await fetcher(`https://places.googleapis.com/v1/places:${method}`,{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fields+(phone?',places.internationalPhoneNumber,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.currentOpeningHours,places.servesVegetarianFood,places.dineIn,places.takeout':'')},body:JSON.stringify({...body,languageCode:input.language})});
    if(!response.ok) throw new Error(`Maps HTTP ${response.status}`);
    return parsePlaces(await response.json());
  }
  try {
    const origin=plan.destination?.source==='question'||plan.destination?.source==='context'?undefined:freshDeviceLocation(input.deviceLocation);
    const businessName=search.businessName?.trim();
    const query=businessName || search.query;
    let anchor:z.infer<typeof Place>|undefined;
    let places:z.infer<typeof Place>[];
    if(search.landmark && !businessName) {
      const candidates=await lookup('searchText',{textQuery:`${search.landmark.replace(/\bparcului\b/gi, 'parcul')}, ${input.city}`,pageSize:3});
      // A city mismatch or ambiguous landmark must never silently select a place.
      const matches=candidates.filter(p=>sameCity(p,input.city) && nameMatches(search.landmark!,p.displayName.text) && (!search.landmarkType || p.types?.includes(search.landmarkType)));
      if(matches.length!==1) return {status:'clarify',plan,segments:[],message:ro?`Nu pot identifica sigur „${search.landmark}” în ${input.city}. Îmi dai strada sau un link Google Maps al reperului?`:`I can’t reliably identify “${search.landmark}” in ${input.city}. What street is it on, or can you share its Google Maps link?`};
      anchor=matches[0];
      places=await lookup('searchNearby',{includedTypes:[search.placeType],maxResultCount:10,rankPreference:'DISTANCE',locationRestriction:{circle:{center:anchor.location,radius:1500}}},true);
    } else if(origin) {
      places=await lookup('searchText',{textQuery:query,locationBias:{circle:{center:{latitude:origin.latitude,longitude:origin.longitude},radius:5000}},...(businessName?{}:{rankPreference:'DISTANCE'}),pageSize:20},true);
      places=places.filter(p=>distanceMeters(origin,p.location)<=5000);
    } else {
      places=await lookup('searchText',{textQuery:`${query}, ${input.city}`,...(businessName?{}:{includedType:search.placeType,strictTypeFiltering:true}),pageSize:10},true);
      places=places.filter(p=>sameCity(p,input.city) && p.businessStatus!=='CLOSED_PERMANENTLY' && p.businessStatus!=='CLOSED_TEMPORARILY');
      // Listings may be tagged as hair_care or beauty_salon rather than
      // hair_salon. Retry the same public query without the strict type filter,
      // but never relax the city boundary or the user's requested service.
      if(!places.length && !businessName) {
        places=await lookup('searchText',{textQuery:`${query}, ${input.city}`,pageSize:10},true);
        places=places.filter(p=>sameCity(p,input.city));
      }
    }
    if(businessName) places=places.filter(p=>nameMatches(businessName,p.displayName.text));
    if(businessName && !places.length) return null; // Let sourced web research check the named venue.
    places=places.filter(p=>search.placeType!=='pharmacy' || !/\b(fito farmacie|fitofarmacie|fitosanitara|farmacie veterinara|veterinary pharmacy)\b/.test(normalize(p.displayName.text)));
    places=places.filter(p=>p.businessStatus!=='CLOSED_PERMANENTLY'&&p.businessStatus!=='CLOSED_TEMPORARILY');
    if(origin && !anchor) places.sort((a,b)=>distanceMeters(origin,a.location)-distanceMeters(origin,b.location));
    places=places.slice(0,businessName?1:5);
    const segments:ConciergeResult['segments']=[];
    if(origin && !anchor) segments.push({text:ro?'În apropierea locației tale actuale, în raza de 5 km:':'Near your current location, within 5 km:',sources:[]});
    else if(!anchor) segments.push({text:ro?`Rezultate în ${input.city}. Pentru distanțe față de tine, activează localizarea automată din meniu.`:`Results in ${input.city}. Enable automatic location in the menu for distances from you.`,sources:[]});
    if(anchor) segments.push({text:ro?`Am găsit reperul ${anchor.displayName.text}. Opțiuni de pe hartă în raza de 1,5 km:\n\n`:`I found ${anchor.displayName.text}. Map listings within 1.5 km:\n\n`,sources:[{title:'Google Maps',url:mapUrl(anchor)}]});
    if(!places.length) segments.push({text:ro?'Nu am găsit rezultate pe hartă în această zonă. Poți extinde căutarea; lipsa unui rezultat nu înseamnă că nu există afaceri acolo.':'No map listings were returned for this area. You can broaden the search; missing listings do not mean no businesses exist.',sources:[]});
    for(const p of places) segments.push({text:`${p.displayName.text}\n${p.formattedAddress}\n${placeDetails(p,ro,anchor?.location||origin).join("\n")}\n\n`,sources:[{title:'Google Maps',url:mapUrl(p)}]});
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
