"use client";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { freshDeviceLocation, type DeviceLocation } from '@/lib/concierge/contracts';
import { detectArea } from '@/lib/concierge/location';
import { createLiveLocation, INITIAL_LOCATION } from '@/lib/concierge/live-location';

export function useLiveLocation(account: string) {
  const key = `ineed:live-location-gps-v2:${account}`;
  const [tracker] = useState(() => {
    let point:DeviceLocation|undefined;
    const source=createLiveLocation(signal => detectArea(navigator.geolocation, fetch, signal, value=>{point=value;}), () => document.visibilityState === 'visible');
    return {...source, forSearch:async()=>{
      point=undefined;
      const area=await source.refresh(true);
      return {area,deviceLocation:area && source.getSnapshot().enabled ? freshDeviceLocation(point) : undefined};
    }};
  });
  const state = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot, () => INITIAL_LOCATION);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try { if (localStorage.getItem(key) === 'on') void tracker.enable(); } catch { /* Optional persistence; current session still works. */ }
    });
    const resume = () => { if (document.visibilityState === 'visible') void tracker.refresh(); else tracker.pause(); };
    const sync = (event: StorageEvent) => { if (event.key !== key && event.key !== null) return; if (event.newValue === 'on') void tracker.enable(); else tracker.disable(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('pagehide', tracker.pause);
    window.addEventListener('storage', sync);
    const timer = setInterval(resume, 120_000);
    return () => { active = false; clearInterval(timer); tracker.disable(); document.removeEventListener('visibilitychange', resume); window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume); window.removeEventListener('pagehide', tracker.pause); window.removeEventListener('storage', sync); };
  }, [key, tracker]);
  const enable = () => { try { localStorage.setItem(key, 'on'); } catch {} return tracker.enable(); };
  const disable = () => { try { localStorage.removeItem(key); } catch {} tracker.disable(); };
  return { ...state, enable, disable, refresh: tracker.refresh, forSearch:tracker.forSearch };
}
