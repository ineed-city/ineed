'use client';
import { startTransition, useEffect, useRef, useState } from 'react';
import { findVideos } from './video-actions';
import type { VideoResponse } from '@/lib/concierge/videos';
import { Icon } from './ui/icons';

export function VideoResults({query,ro}:{query:string;ro:boolean}) {
  const [response,setResponse]=useState<VideoResponse|null>(null);
  const [playing,setPlaying]=useState<string|null>(null);
  const lookup=useRef<Promise<VideoResponse>|null>(null);
  useEffect(()=>{
    let active=true;
    startTransition(()=>{
      lookup.current??=findVideos({query,language:ro?'ro':'en'}).catch(()=>({ok:false,reason:'unavailable'}));
      void lookup.current.then(value=>{if(active)setResponse(value);});
    });
    return()=>{active=false;};
  },[query,ro]);
  return <div className="space-y-4">
    <p className="text-sm text-muted">{query}</p>
    {!response&&<p role="status" className="text-sm">{ro?'Caut videoclipuri relevante…':'Finding relevant videos…'}</p>}
    {response&&!response.ok&&<p role="status" className="text-sm">{response.reason==='auth'?(ro?'Intră din nou în cont pentru a căuta videoclipuri.':'Sign in again to search for videos.'):response.reason==='limit'?(ro?'Ai atins limita de căutări video. Încearcă mai târziu.':'Video search limit reached. Try again later.'):(ro?'Căutarea video nu este disponibilă acum. Poți căuta direct pe YouTube.':'Video search is unavailable right now. You can search directly on YouTube.')}</p>}
    {response?.ok&&!response.videos.length&&<p role="status" className="text-sm">{ro?'Nu am putut confirma un videoclip potrivit. Poți verifica direct pe YouTube.':'I couldn’t confirm a suitable video. You can check directly on YouTube.'}</p>}
    {response?.ok&&response.videos.map(video=><article key={video.id} className="rounded-2xl border border-line bg-white p-4 space-y-3">
      <h3 className="text-base font-medium leading-snug">{video.title}</h3>
      <p className="text-sm text-muted">{video.channelUrl?<a href={video.channelUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{video.channel}</a>:video.channel} · YouTube</p>
      <p className="text-xs text-muted">{ro?'Legat de':'Related to'}: {query}</p>
      {playing===video.id?<iframe className="w-full min-h-[200px] aspect-video rounded-xl" src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=0&playsinline=1&rel=0`} title={video.title} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button type="button" className="next-step-button" onClick={()=>setPlaying(video.id)}><Icon name="play"/>{ro?'Deschide videoclipul':'Open video'}</button>}
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-brand underline underline-offset-4">{ro?'Vezi pe YouTube':'Watch on YouTube'}</a>
    </article>)}
    {response?.ok&&Boolean(response.videos.length)&&<p className="text-xs text-muted">{ro?'Potrivire după titlu și informațiile din căutare; pașii videoclipului nu sunt verificați. Playerul YouTube se încarcă doar când îl deschizi.':'Matched using titles and search information; video steps aren’t verified. The YouTube player loads only when you open it.'}</p>}
    {response&&(!response.ok||!response.videos.length)&&<a className="next-step-button" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer">{ro?'Caută pe YouTube':'Search on YouTube'}</a>}
  </div>;
}
