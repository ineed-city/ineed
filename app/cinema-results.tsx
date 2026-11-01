'use client';
import { useState } from 'react';
import type { CinemaProgramme } from '@/lib/concierge/cinema';

export function CinemaResults({programme,ro}:{programme:CinemaProgramme;ro:boolean}) {
  const [playing,setPlaying]=useState<string|null>(null);
  return <section className="my-5 space-y-5" aria-label={ro?'Filme și ore':'Films and showtimes'}>
    <p className="text-xs text-muted">{ro?'Verificat':'Checked'} {new Date(programme.checkedAt).toLocaleString(ro?'ro-RO':'en-GB',{timeZone:'Europe/Bucharest'})} · {ro?'Ora României. Disponibilitatea se confirmă la rezervare.':'Romanian time. Availability is confirmed when booking.'}</p>
    {programme.films.map(film=><article key={film.url} className="rounded-2xl border border-line bg-white p-4">
      <div className="flex gap-4">
        {film.poster&&<a href={film.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- Official source image, loaded directly without storing provider media. */}
          <img src={film.poster} alt={film.title} width={96} height={144} loading="lazy" referrerPolicy="no-referrer" className="w-20 sm:w-24 rounded-xl object-cover" onError={e=>{e.currentTarget.style.display='none';}}/>
        </a>}
        <div className="min-w-0 flex-1"><h3 className="font-medium text-lg">{film.title}</h3><p className="text-sm text-muted">{film.minutes} min · {film.details}</p>
          <div className="mt-3 flex flex-wrap gap-2">{film.times.map((session,i)=>session.url?<a key={i} className="next-step-button" href={session.url} target="_blank" rel="noopener noreferrer" aria-label={`${ro?'Bilete':'Tickets'} ${film.title}, ${session.time}, ${session.format}`}>{session.time} · {session.format}</a>:<span key={i} className="text-sm text-muted">{session.time} · {session.format} · {session.soldOut?(ro?'Epuizat':'Sold out'):(ro?'Rezervare online indisponibilă':'Online booking unavailable')}</span>)}</div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-brand"><a href={film.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{ro?'Despre film':'Film details'}</a>{film.trailer&&<button type="button" className="underline underline-offset-4" onClick={()=>setPlaying(playing===film.trailer?null:film.trailer!)}>{playing===film.trailer?(ro?'Închide trailerul':'Close trailer'):'Trailer'}</button>}</div>
        </div>
      </div>
      {film.trailer&&playing===film.trailer&&<iframe className="mt-4 w-full aspect-video rounded-xl" src={`https://www.youtube-nocookie.com/embed/${film.trailer}?playsinline=1&rel=0`} title={`${film.title} trailer`} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}
    </article>)}
  </section>;
}
