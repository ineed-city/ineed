"use client";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { detectArea } from '@/lib/concierge/location';
import { createLiveLocation, INITIAL_LOCATION } from '@/lib/concierge/live-location';

export function useLiveLocation(account: string) {
  const key = `ineed:live-location:${account}`;
  const [tracker] = useState(() => createLiveLocation(signal => detectArea(navigator.geolocation, fetch, signal), () => document.visibilityState === 'visible'));
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
  return { ...state, enable, disable, refresh: tracker.refresh };
}
