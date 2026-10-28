"use client";
import Link from 'next/link';
import { Icon } from './ui/icons';
import { useEffect, useRef, useState } from 'react';
import { signOut } from './auth/actions';
import { detectArea } from '@/lib/concierge/location';

export function SettingsMenu({ language, city, email, isAdmin, onClose, onSave }: {
  language: 'en' | 'ro'; city: string; email: string; isAdmin: boolean;
  onClose: () => void; onSave: (patch: { city?: string; language?: 'en' | 'ro' }) => Promise<boolean>;
}) {
  const ro = language === 'ro';
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const [draft, setDraft] = useState(city);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<'saved' | 'removed' | 'failed' | 'detected' | 'denied' | 'locationError' | ''>('');
  useEffect(() => {active.current = true; dialog.current?.showModal(); return () => {active.current = false;};}, []);
  async function save(patch: { city?: string; language?: 'en' | 'ro' }) {
    if (busy) return;
    setBusy(true); setMessage('');
    const ok = await onSave(patch);
    if (active.current) {
      setMessage(ok ? patch.city === '' ? 'removed' : 'saved' : 'failed');
      if (ok && patch.city !== undefined) setDraft(patch.city);
      setBusy(false);
    }
  }
  async function locate() {
    if (busy) return;
    setBusy(true);setMessage('');
    try {const area = await detectArea(navigator.geolocation); if (active.current) {setDraft(area);setMessage('detected');}}
    catch(error) {if (active.current) setMessage(error instanceof Error && error.message === 'denied' ? 'denied' : 'locationError');}
    finally {if (active.current) setBusy(false);}
  }
  const messages = {
    saved: ro ? 'Salvat în cont.' : 'Saved to your account.',
    removed: ro ? 'Locația salvată a fost eliminată. Nu o vom folosi în cererile următoare.' : 'Saved location removed. Future requests will not use it.',
    failed: ro ? 'Nu am putut salva. Încearcă din nou.' : 'Couldn’t save. Please try again.',
    detected: ro ? 'Verifică zona, apoi salvează.' : 'Check the area, then save it.',
    denied: ro ? 'Acces refuzat. Poți scrie zona manual.' : 'Permission denied. You can type your area instead.',
    locationError: ro ? 'Nu am putut găsi zona. Scrie orașul manual.' : 'Couldn’t find your area. Type your city instead.',
  };
  return <dialog ref={dialog} id="settings-menu" aria-labelledby="settings-title" onCancel={event=>{event.preventDefault();onClose();}} className="settings-panel">
    <div className="settings-heading"><h2 id="settings-title" className="text-xl font-medium">{ro ? 'Meniu' : 'Menu'}</h2><button type="button" aria-label={ro ? 'Închide meniul' : 'Close menu'} onClick={onClose} className="icon-button"><Icon name="close" /></button></div>
    <nav className="settings-navigation" aria-label={ro ? 'Navigare' : 'Navigation'}>
      <Link href="/manuals">{ro ? 'Manuale și produse' : 'Manuals & products'} <Icon name="chevron" /></Link>
      {isAdmin && <Link href="/admin">{ro ? 'Administrare' : 'Administration'} <Icon name="chevron" /></Link>}
    </nav>
    <section className="settings-group">
      <label className="flex items-center justify-between text-sm">{ro ? 'Limbă' : 'Language'}<select aria-label={ro ? 'Limbă' : 'Language'} value={language} disabled={busy} onChange={e=>void save({language:e.target.value as 'en'|'ro'})} className="rounded-lg border border-line bg-white p-2"><option value="en">English</option><option value="ro">Română</option></select></label>
    </section>
    <section className="settings-group space-y-3 text-sm">
      <h3 className="font-medium">{ro ? 'Locația mea' : 'My location'}</h3>
      <p className="text-xs text-muted">{ro ? 'Alege o dată. Zona este salvată în cont și folosită la cererile viitoare, pe orice dispozitiv. O poți schimba când călătorești.' : 'Choose once. Your area is saved to your account for future requests on any device. Change it when you travel.'}</p>
      <label className="block">{ro ? 'Oraș sau zonă' : 'City or area'}<input value={draft} disabled={busy} maxLength={100} onChange={e=>setDraft(e.target.value)} className="mt-2 w-full rounded-lg border border-line bg-white p-2" /></label>
      <button type="button" disabled={busy} onClick={locate} className="text-brand underline">{busy ? (ro ? 'Se procesează…' : 'Working…') : (ro ? 'Folosește locația dispozitivului' : 'Use device location')}</button>
      <p className="text-[11px] text-muted">{ro ? "Butonul de localizare trimite coordonate aproximative și IP-ul la BigDataCloud." : "Device location shares approximate coordinates and your IP with BigDataCloud."}</p><details className="text-xs text-muted"><summary className="cursor-pointer">{ro ? 'Cum folosim locația' : 'How location is used'}</summary><p className="mt-2">{ro ? 'Doar când apeși butonul, coordonatele aproximative și IP-ul ajung la BigDataCloud pentru identificarea zonei și îmbunătățirea datelor lor. Salvăm doar numele zonei în cont; acesta ajunge la Claude cu cererea. Fără urmărire în fundal.' : 'Only when you press the button, approximate coordinates and your IP go to BigDataCloud to find the area and improve their data. We save only the area name to your account; it goes to Claude with your request. No background tracking.'} <a href="https://www.bigdatacloud.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">{ro ? 'Confidențialitate' : 'Privacy'}</a></p></details>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !draft.trim()} onClick={()=>void save({city:draft.trim()})} className="rounded-lg bg-brand px-3 py-2 text-white disabled:opacity-50">{ro ? 'Salvează locația' : 'Save location'}</button><button type="button" disabled={busy} onClick={()=>void save({city:''})} className="text-brand underline">{city ? (ro ? 'Elimină locația salvată' : 'Remove saved location') : (ro ? 'Continuă fără locație' : 'Continue without location')}</button></div>
      <details className="text-xs text-muted"><summary className="cursor-pointer">{ro ? 'Revocă permisiunea browserului' : 'Revoke browser permission'}</summary><p className="mt-2">{ro ? 'Aplicația nu poate revoca permisiuni în browser. Deschide pictograma de setări de lângă adresa site-ului → Permisiuni/Setări site → Locație → Blochează sau Resetează. Pe telefon, verifică și setările de localizare ale browserului. Eliminarea locației salvate oprește folosirea ei în INeed.' : 'The app cannot revoke browser permissions. Open the settings icon beside the website address → Permissions/Site settings → Location → Block or Reset. On a phone, also check the browser’s location settings. Removing the saved location stops INeed using it.'}</p></details>
    </section>
    {message && <p role="status" className="mb-4 text-sm text-brand">{messages[message]}</p>}
    <details className="settings-group text-xs text-muted"><summary className="cursor-pointer">{ro ? 'Confidențialitate și despre INeed' : 'Privacy & about INeed'}</summary><p className="mt-3">{ro ? 'Cererea și poza atașată ajung la Claude. Răspunsurile pot fi greșite; verifică sursele. Nu contactăm furnizori și nu facem rezervări în locul tău.' : 'Your request and attached photo go to Claude. Answers can be wrong; check the sources. We do not contact providers or make bookings for you.'}</p></details>
    <section className="settings-group space-y-4 text-sm"><h3 className="font-medium">{ro ? 'Contul meu' : 'My account'}</h3><p className="break-all text-xs text-muted">{email}</p><Link href="/cont/parola" className="block">{ro ? 'Schimbă parola' : 'Change password'}</Link><form action={signOut}><button type="submit">{ro ? 'Ieși din cont' : 'Sign out'}</button></form></section>
  </dialog>;
}
