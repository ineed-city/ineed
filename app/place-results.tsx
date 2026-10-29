import type { ConciergeResult } from '@/lib/concierge/contracts';
import { safeSourceUrl } from '@/lib/concierge/contracts';

/** Keep each provider listing and its actions together, including older turns. */
export function PlaceResults({result,ro}:{result:Pick<ConciergeResult,'segments'|'nextSteps'>;ro:boolean}) {
  const groups=result.nextSteps || [];
  const listings=groups.map(group=>{
    const link=group.actions.find(a=>a.type==='website');
    const segment=link?.type==='website' ? result.segments.find(s=>s.sources.some(source=>source.url===link.url)) : undefined;
    const [name,...address]=(segment?.text.trim() || group.title).split('\n');
    return {group,segment,name,address:address.join(' ').trim()};
  });
  const attribution=result.segments.at(-1);
  const introduction=result.segments.filter(s=>s!==attribution&&!listings.some(l=>l.segment===s));
  return <section className="place-results" aria-label={ro?'Locuri găsite':'Places found'}>
    {introduction.map((s,i)=><p key={i} className="place-intro">{s.text.trim()}</p>)}
    <div className="place-list">{listings.map(({group,name,address},i)=><article className="place-card" key={i}>
      <h3 className="place-name">{name}</h3>
      {address&&<p className="place-address">{address}</p>}
      <div className="place-actions">{group.actions.map((action,j)=>{
        const isCall=action.type==='call';
        const href=isCall?`tel:${action.phone}`:action.type==='website'?safeSourceUrl(action.url):null;
        if(!href) return null;
        const directions=!isCall&&href.includes('/maps/dir/');
        const label=isCall?(ro?'Sună':'Call'):directions?(ro?'Traseu':'Directions'):(ro?'Hartă':'Map');
        return <a key={j} href={href} className="place-action" target={isCall?undefined:'_blank'} rel="noopener noreferrer" aria-label={`${label} · ${name}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {isCall?<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.79a2 2 0 0 1-.45 2.11L8.08 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.69A2 2 0 0 1 22 16.92z"/>:directions?<path d="m21 3-7 18-4-7-7-4 18-7Z"/>:<><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>}
          </svg>{label}
        </a>;
      })}</div>
    </article>)}</div>
    <footer className="place-attribution">
      <span className="place-provider">Google Maps</span>
      {attribution?.sources.map((source,i)=><a key={i} href={safeSourceUrl(source.url)||undefined} target="_blank" rel="noopener noreferrer">{source.title}</a>)}
      <p>{ro?'Confirmă programul și disponibilitatea direct.':'Confirm hours and availability directly.'}</p>
    </footer>
  </section>;
}
