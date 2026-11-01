import 'server-only';
import { z } from 'zod';
import type { ConciergeRequest, ConciergeResult, Plan } from './contracts';
import { youtubeId } from './videos';

const HOME='https://www.cinemacity.ro';
const BASE=`${HOME}/ro/data-api-service/v1/quickbook/10107`;
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function cinemaUrl(value:string):string|undefined {
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['www.cinemacity.ro','tickets.cinemacity.ro'].includes(u.hostname)?u.href:undefined;}catch{return undefined;}
}
export type CinemaFilm={title:string;minutes:number;details:string;poster?:string;trailer?:string;url:string;times:{time:string;url?:string;soldOut:boolean;format:string}[]};
export type CinemaProgramme={venue:string;date:string;checkedAt:string;url:string;films:CinemaFilm[]};
const Film=z.object({id:z.string(),name:z.string(),length:z.number(),link:z.string(),posterLink:z.string().optional(),videoLink:z.string().optional(),attributeIds:z.array(z.string())});
const Event=z.object({filmId:z.string(),cinemaId:z.string(),businessDay:z.string(),eventDateTime:z.string(),bookingLink:z.string().optional(),soldOut:z.boolean().optional(),attributeIds:z.array(z.string()),compositeBookingLink:z.object({blockOnlineSales:z.boolean().optional()}).optional()});
const Feed=z.object({body:z.object({films:z.array(Film).max(100),events:z.array(Event).max(1000)})});
const Site=z.object({externalCode:z.string().regex(/^\d+$/),uri:z.string().startsWith('/cinemas/'),name:z.string(),address:z.object({city:z.string()})});
export function parseProgramme(raw:unknown,venue:{id:string;name:string;url:string},date:string,now=new Date()):CinemaProgramme {
  const data=Feed.parse(raw).body;
  const localNow=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now).replace(' ','T');
  const films=data.films.flatMap(f=>{
    const url=cinemaUrl(f.link);if(!url)return [];
    const times=data.events.filter(e=>e.filmId===f.id&&e.cinemaId===venue.id&&e.businessDay===date&&e.eventDateTime.startsWith(date+'T')&&e.eventDateTime>=localNow&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(e.eventDateTime)).sort((a,b)=>a.eventDateTime.localeCompare(b.eventDateTime)).map(e=>({time:e.eventDateTime.slice(11,16),soldOut:e.soldOut===true,...(!e.soldOut&&!e.compositeBookingLink?.blockOnlineSales&&e.bookingLink?{url:cinemaUrl(e.bookingLink)}:{}),format:e.attributeIds.filter(a=>/^(2d|3d|imax|4dx|subbed|dubbed)$/.test(a)).join(' · ')}));
    if(!times.length)return [];
    const trailer=f.videoLink?youtubeId(f.videoLink):null;
    return [{title:f.name,minutes:f.length,details:f.attributeIds.filter(a=>!a.includes('lang')&&!['2d','3d','subbed','dubbed','original'].includes(a)).join(' · '),url,poster:f.posterLink?cinemaUrl(f.posterLink):undefined,...(trailer?{trailer}:{}),times}];
  });
  return {venue:venue.name,date,checkedAt:now.toISOString(),url:venue.url,films};
}
// Fixed official host only. No model-generated URL is fetched by this adapter.
export async function cinemaAnswer(input:ConciergeRequest,plan:Plan,fetcher:typeof fetch=fetch,now=new Date()):Promise<ConciergeResult|null> {
  if(!plan.cinemaRequest||!input.city||input.photo||input.shared)return null;
  const date=plan.cinemaRequest.date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||Math.abs(Date.parse(date)-now.getTime())>32*86400000)return null;
  const signal=AbortSignal.timeout(12000);
  try {
    const response=await fetcher(`${HOME}/cinemas/drobeta-turnu-severin/1821`,{signal,cache:'no-store',redirect:'error'});
    if(!response.ok)return null;
    const html=await response.text(); if(html.length>2_000_000)return null;
    const match=html.match(/apiSitesList\s*=\s*(\[[\s\S]*?\]),\s*pluginLocale/);if(!match)return null;
    const sites=z.array(Site).parse(JSON.parse(match[1]));
    const city=norm(input.city);
    const choices=sites.filter(s=>city===norm(s.address.city)||city.startsWith(norm(s.address.city)+' ')||city===norm(s.name));
    // Multiple branches need venue selection; let research handle that rather than guessing.
    if(choices.length!==1)return null;
    const site=choices[0];
    const feed=await fetcher(`${BASE}/film-events/in-cinema/${site.externalCode}/at-date/${date}?attr=`,{signal,cache:'no-store',redirect:'error'});
    if(!feed.ok)return null;
    const programme=parseProgramme(await feed.json(),{id:site.externalCode,name:`Cinema City ${site.name}`,url:`${HOME}${site.uri}/${site.externalCode}`},date,now);
    if(plan.cinemaRequest.filmTitle) programme.films=programme.films.filter(f=>norm(f.title).includes(norm(plan.cinemaRequest!.filmTitle!)));
    if(!programme.films.length)return null; // Empty data is not evidence that the venue has no films.
    const ro=input.language==='ro';
    const text=`${programme.venue} · ${date}\n${ro?'Proiecțiile disponibile în programul oficial, ora locală:':'Screenings listed in the official programme, local time:'}`;
    return {status:'answered',plan,searched:true,cinema:programme,segments:[{text,sources:[{title:'Cinema City',url:programme.url}]}],nextSteps:[{title:ro?'Program actualizat':'Current programme',actions:[{type:'followup',label:ro?'Actualizează':'Refresh',prompt:input.question},{type:'maps',label:ro?'Deschide harta':'Open map',destination:`${programme.venue}, ${input.city}`,sourceUrl:programme.url}]}]};
  }catch(error){console.warn('cinema lookup',error instanceof Error?error.name:'error');return null;}
}
