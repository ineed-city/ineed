export type LiveLocationState = { enabled: boolean; area: string; status: 'off' | 'checking' | 'ready' | 'unavailable' | 'denied' };
export const INITIAL_LOCATION: LiveLocationState = { enabled: false, area: '', status: 'off' };

// Stores only the current area in memory. No coordinate or movement history.
export function createLiveLocation(detect: (signal: AbortSignal) => Promise<string>, visible: () => boolean, now = Date.now) {
  let state = INITIAL_LOCATION;
  let updated = 0;
  let revision = 0;
  let controller: AbortController | undefined;
  let pending: Promise<string> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: LiveLocationState) => { state = next; listeners.forEach(fn => fn()); };
  const cancel = () => { revision++; controller?.abort(); controller = undefined; pending = undefined; updated = 0; };
  const refresh = (force=false): Promise<string> => {
    if (!state.enabled || !visible() || state.status === 'denied') return Promise.resolve('');
    if (pending) return pending;
    if (!force && state.status === 'ready' && now() - updated < 60_000) return Promise.resolve(state.area);
    controller = new AbortController();
    const token = ++revision;
    publish({ enabled: true, area: '', status: 'checking' });
    pending = detect(controller.signal).then(area => {
      if (token !== revision || !state.enabled || !visible()) return '';
      updated = now(); publish({ enabled: true, area, status: 'ready' }); return area;
    }).catch(error => {
      if (token === revision && state.enabled) publish({ enabled: true, area: '', status: error instanceof Error && error.message === 'denied' ? 'denied' : 'unavailable' });
      return '';
    }).finally(() => { if (token === revision) { pending = undefined; controller = undefined; } });
    return pending;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    enable: () => { cancel(); publish({ enabled: true, area: '', status: 'checking' }); return refresh(); },
    disable: () => { cancel(); publish(INITIAL_LOCATION); },
    pause: () => { cancel(); if (state.enabled) publish({ enabled: true, area: '', status: state.status === 'denied' ? 'denied' : 'unavailable' }); },
  };
}
