import 'server-only';
import {z} from 'zod';
import {freshDeviceLocation, type ConciergeRequest, type ConciergeResult, type Plan} from './contracts';

const Point=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)});
const Temperature=z.object({degrees:z.number().min(-100).max(70),unit:z.literal('CELSIUS')});
const Conditions=z.object({
  temperature:Temperature,feelsLikeTemperature:Temperature.optional(),
  weatherCondition:z.object({description:z.object({text:z.string()})}).optional(),
  precipitation:z.object({probability:z.object({percent:z.number().min(0).max(100)})}).optional(),
  wind:z.object({speed:z.object({value:z.number().min(0),unit:z.literal('KILOMETERS_PER_HOUR')})}).optional(),
});
const Current=Conditions.extend({currentTime:z.string().datetime(),timeZone:z.object({id:z.string()})});
const Hour=Conditions.extend({interval:z.object({startTime:z.string().datetime(),endTime:z.string().datetime()})});
const normal=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

// Google data stays in this deterministic renderer: no model context, storage,
// logging of coordinates, API keys, or raw provider responses.
export async function weatherAnswer(input:ConciergeRequest,plan:Plan,fetcher:typeof fetch=fetch,now=Date.now()):Promise<ConciergeResult|null> {
  if(!plan.weatherRequest || input.photo || input.shared) return null;
  const key=process.env.GOOGLE_WEATHER_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if(!key) return null;
  const ro=input.language==='ro';
  const point=plan.destination?.source==='question'||plan.destination?.source==='context'?undefined:freshDeviceLocation(input.deviceLocation,now);
  const signal=AbortSignal.timeout(10_000);
  try {
    let center: z.infer<typeof Point>|undefined=point;
    if(!center) {
      if(!input.city.trim()) return {status:'clarify',segments:[],message:ro?'Pentru ce oraș vrei prognoza?':'Which city should I check the weather for?'};
      const response=await fetcher('https://places.googleapis.com/v1/places:searchText',{method:'POST',cache:'no-store',signal,headers:{'Content-Type':'application/json','X-Goog-Api-Key':process.env.GOOGLE_MAPS_API_KEY || key,'X-Goog-FieldMask':'places.location,places.addressComponents,places.types'},body:JSON.stringify({textQuery:input.city,pageSize:3})});
      if(!response.ok) return null;
      const raw=z.object({places:z.array(z.object({location:Point,types:z.array(z.string()),addressComponents:z.array(z.object({longText:z.string(),types:z.array(z.string())}))})).default([])}).parse(await response.json());
      const city=normal(input.city.split(',')[0]);
      const matches=raw.places.filter(p=>p.types.some(t=>['locality','administrative_area_level_3','sublocality','sublocality_level_1'].includes(t)) && p.addressComponents.some(c=>normal(c.longText)===city));
      if(matches.length!==1) return null;
      center=matches[0].location;
    }
    const params=new URLSearchParams({'location.latitude':String(center.latitude),'location.longitude':String(center.longitude),unitsSystem:'METRIC',languageCode:input.language});
    async function lookup(endpoint:string,extra:Record<string,string>={}) {
      const query=new URLSearchParams(params);for(const [k,v] of Object.entries(extra))query.set(k,v);
      const response=await fetcher(`https://weather.googleapis.com/v1/${endpoint}?${query}`,{cache:'no-store',signal,headers:{'X-Goog-Api-Key':key!}});
      if(!response.ok) throw Error(`Weather HTTP ${response.status}`);
      return response.json();
    }
    const ahead=plan.weatherRequest.hoursAhead;
    const [currentRaw,forecastRaw]=await Promise.all([lookup('currentConditions:lookup'),ahead>0?lookup('forecast/hours:lookup',{hours:String(ahead+1),pageSize:'24'}):Promise.resolve(null)]);
    const current=Current.parse(currentRaw);
    if(Math.abs(now-Date.parse(current.currentTime))>90*60_000) return null;
    const target=now+ahead*3600_000;
    const forecast=forecastRaw?z.object({forecastHours:z.array(Hour)}).parse(forecastRaw).forecastHours.find(h=>Date.parse(h.interval.startTime)<=target && target<Date.parse(h.interval.endTime)):undefined;
    if(ahead>0 && !forecast) return null;
    const selected=forecast || current;
    const time=new Date(forecast?.interval.startTime || current.currentTime).toLocaleString(ro?'ro-RO':'en-GB',{timeZone:current.timeZone.id,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    const temp=Math.round(selected.temperature.degrees),feels=Math.round(selected.feelsLikeTemperature?.degrees ?? selected.temperature.degrees);
    const rain=selected.precipitation?.probability.percent,wind=selected.wind?.speed.value;
    const place=input.city || (ro?'locația ta actuală':'your current location');
    let text=`${place} · ${forecast?(ro?'Prognoză':'Forecast'):(ro?'Acum':'Now')} (${time})\n${temp}°C${selected.feelsLikeTemperature?` · ${ro?'resimțit':'feels like'} ${feels}°C`:''}${selected.weatherCondition?` · ${selected.weatherCondition.description.text}`:''}.`;
    if(rain!==undefined)text+=` ${ro?'Probabilitate de precipitații':'Precipitation chance'}: ${rain}%.`;
    if(wind!==undefined)text+=` ${ro?'Vânt':'Wind'}: ${Math.round(wind)} km/h.`;
    const items:string[]=[];
    if(plan.weatherRequest.clothing) {
      items.push(feels<5?(ro?'Geacă groasă și straturi călduroase':'Warm coat and insulating layers'):feels<15?(ro?'Geacă și un pulover peste un strat de bază':'Jacket and sweater over a base layer'):feels<22?(ro?'Un strat ușor, cu o jachetă la îndemână':'Light layers with a jacket handy'):(ro?'Haine ușoare și respirabile':'Light, breathable clothing'));
      if(rain!==undefined && rain>=35) items.push(ro?'Jachetă impermeabilă sau umbrelă':'Waterproof jacket or umbrella');
      if(wind!==undefined && wind>=25)items.push(ro?'Un strat care oprește vântul':'A wind-resistant outer layer');
      text+=`\n\n${ro?'Pentru ieșire, aș alege':'For going out, I’d suggest'}: ${items.join('; ')}.`;
    }
    return {status:'answered',plan,weatherData:true,segments:[{text,sources:[]}],nextSteps:[{title:ro?'Vremea':'Weather',actions:[{type:'followup',label:ro?'Actualizează vremea':'Refresh weather',prompt:input.question},...(items.length?[{type:'checklist' as const,label:ro?'Ce iau cu mine':'What to take',items}]:[{type:'followup' as const,label:ro?'Cum mă îmbrac?':'What should I wear?',prompt:ro?'Cum să mă îmbrac pentru vremea din același loc peste o oră?':'What should I wear for the weather in the same place in one hour?'}])]}]};
  }catch(error){console.info('weather unavailable',error instanceof Error && /^Weather HTTP \d+$/.test(error.message)?error.message:error instanceof Error?error.name:'unknown');return null;}
}
