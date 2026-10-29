"use client";
import Link from 'next/link';
import { Icon } from './ui/icons';
import { useEffect, useRef, useState } from 'react';
import { signOut } from './auth/actions';
import { detectArea } from '@/lib/concierge/location';

export function SettingsMenu({ language, city, email, isAdmin, onClose, onSave, onAddContext, onHistory, onNewChat }: {
  language: 'en' | 'ro'; city: string; email: string; isAdmin: boolean;
  onAddContext: () => void; onHistory: () => void; onNewChat: () => void;
  onClose: () => void; onSave: (patch: { city?: string; language?: 'en' | 'ro' }) => Promise<boolean>;
}) {
  const ro = language === 'ro';
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const [draft, setDraft] = useState(city);
  const locationRequest = useRef<AbortController | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<'saved' | 'removed' | 'failed' | 'detected' | 'denied' | 'timeout' | 'unsupported' | 'locationError' | ''>('');
  useEffect(() => {active.current = true; dialog.current?.showModal(); return () => {active.current = false; locationRequest.current?.abort();};}, []);
  async function save(patch: { city?: string; language?: 'en' | 'ro' }) {
    if (busy) return;
    cancelLocation();
    setBusy(true); setMessage('');
    const ok = await onSave(patch);
    if (active.current) {
      setMessage(ok ? patch.city === '' ? 'removed' : 'saved' : 'failed');
      if (ok && patch.city !== undefined) setDraft(patch.city);
      setBusy(false);
    }
  }
  function cancelLocation() {
    locationRequest.current?.abort();
    locationRequest.current = null;
    setLocating(false);
  }
  async function locate() {
    if (busy || locating) return;
    const controller = new AbortController();
    locationRequest.current = controller;
    setLocating(true);setMessage('');
    try {
      const area = await detectArea(navigator.geolocation, fetch, controller.signal);
      if (active.current && !controller.signal.aborted) {setDraft(area);setMessage('detected');}
    } catch(error) {
      if (active.current && !controller.signal.aborted) {
        const reason = error instanceof Error ? error.message : '';
        setMessage(reason === 'denied' || reason === 'timeout' || reason === 'unsupported' ? reason : 'locationError');
      }
    } finally {
      if (active.current && locationRequest.current === controller) {locationRequest.current = null;setLocating(false);}
    }
  }
  const messages = {
    saved: ro ? 'Salvat în cont.' : 'Saved to your account.',
    removed: ro ? 'Locația salvată a fost eliminată. Nu o vom folosi în cererile următoare.' : 'Saved location removed. Future requests will not use it.',
    failed: ro ? 'Nu am putut salva. Încearcă din nou.' : 'Couldn’t save. Please try again.',
    detected: ro ? 'Verifică zona, apoi salvează.' : 'Check the area, then save it.',
    denied: ro ? 'Acces refuzat. Poți scrie zona manual.' : 'Permission denied. You can type your area instead.',
    timeout: ro ? 'Browserul nu a răspuns. Deschide linkul direct în Safari sau Chrome, apoi încearcă din nou. Poți scrie orașul manual.' : 'The browser did not respond. Open the link directly in Safari or Chrome, then try again. You can also type your city.',
    unsupported: ro ? 'Acest browser nu oferă localizare. Deschide linkul în Safari sau Chrome, ori scrie orașul.' : 'Location is unavailable in this browser. Open the link in Safari or Chrome, or type your city.',
    locationError: ro ? 'Nu am putut găsi zona. Scrie orașul manual.' : 'Couldn’t find your area. Type your city instead.',
  };
  return <dialog ref={dialog} id="settings-menu" aria-labelledby="settings-title" onCancel={event=>{event.preventDefault();onClose();}} className="settings-panel">
    <div className="settings-heading"><h2 id="settings-title" className="text-xl font-medium">{ro ? 'Meniu' : 'Menu'}</h2><button type="button" aria-label={ro ? 'Închide meniul' : 'Close menu'} onClick={onClose} className="icon-button"><Icon name="close" /></button></div>
    <nav className="settings-navigation" aria-label={ro ? 'Navigare' : 'Navigation'}>
      <button type="button" onClick={onHistory} className="flex w-full items-center justify-between py-3 text-sm">{ro ? "Istoric" : "History"}<Icon name="history" /></button>
      <button type="button" onClick={onNewChat} className="flex w-full items-center justify-between py-3 text-sm">{ro ? "Conversație nouă" : "New chat"}<Icon name="message" /></button>
      <button type="button" onClick={onAddContext} className="flex w-full items-center justify-between py-3 text-sm">{ro ? "Adaugă context · postare sau link" : "Add context · post or link"}<Icon name="link" /></button>
      <Link href="/manuals">{ro ? 'Manuale și produse' : 'Manuals & products'} <Icon name="chevron" /></Link>
      {isAdmin && <Link href="/admin/feedback">{ro ? 'Feedback răspunsuri' : 'Answer feedback'} <Icon name="chevron" /></Link>}
      {isAdmin && <Link href="/admin">{ro ? 'Administrare' : 'Administration'} <Icon name="chevron" /></Link>}
    </nav>
    <section className="settings-group">
      <label className="flex items-center justify-between text-sm">{ro ? 'Limbă' : 'Language'}<select aria-label={ro ? 'Limbă' : 'Language'} value={language} disabled={busy} onChange={e=>void save({language:e.target.value as 'en'|'ro'})} className="rounded-lg border border-line bg-white p-2"><option value="en">English</option><option value="ro">Română</option></select></label>
    </section>
    <section className="settings-group space-y-3 text-sm">
      <h3 className="font-medium">{ro ? 'Locația mea' : 'My location'}</h3>
      <p className="text-xs text-muted">{ro ? 'Alege o dată. Zona este salvată în cont și folosită la cererile viitoare, pe orice dispozitiv. O poți schimba când călătorești.' : 'Choose once. Your area is saved to your account for future requests on any device. Change it when you travel.'}</p>
      <label className="block">{ro ? 'Oraș sau zonă' : 'City or area'}<input value={draft} disabled={busy} maxLength={100} placeholder={ro ? 'Ex. București, România' : 'E.g. London, UK'} onChange={e=>{cancelLocation();setDraft(e.target.value);setMessage('');}} className="mt-2 w-full rounded-lg border border-line bg-white p-2" /></label>
      <button type="button" disabled={busy || locating} onClick={locate} className="text-brand underline">{locating ? (ro ? 'Caut locația…' : 'Finding your location…') : (ro ? 'Folosește locația dispozitivului' : 'Use device location')}</button>
      <div role="status" aria-live="polite" className="text-xs text-brand">
        {locating ? <p>{ro ? 'Permite accesul dacă browserul întreabă. Dacă nu apare nimic, poți scrie orașul manual.' : 'Allow location if your browser asks. If nothing appears, you can type your city instead.'} <button type="button" onClick={cancelLocation} className="underline">{ro ? 'Anulează' : 'Cancel'}</button></p> : message ? <p>{messages[message]}</p> : null}
      </div>
      <details className="text-xs text-muted"><summary>{ro ? 'Pe iPhone nu se întâmplă nimic?' : 'Nothing happens on iPhone?'}</summary><p className="mt-2">{ro ? 'Deschide linkul direct în Safari. Verifică în Configurări → Intimitate și securitate → Servicii de localizare că localizarea este activată și permisă pentru browser. Dacă ai refuzat accesul pentru site, schimbă permisiunea din setările site-ului în Safari. Sau scrie orașul mai sus și apasă Salvează locația.' : 'Open the link directly in Safari. In Settings → Privacy & Security → Location Services, check that location is enabled and your browser can use it. If you denied this website access, change its location permission in Safari’s website settings. Or type your city above and choose Save location.'}</p></details>
      <p className="text-[11px] text-muted">{ro ? "Butonul de localizare trimite coordonate aproximative și IP-ul la BigDataCloud." : "Device location shares approximate coordinates and your IP with BigDataCloud."}</p><details className="text-xs text-muted"><summary className="cursor-pointer">{ro ? 'Cum folosim locația' : 'How location is used'}</summary><p className="mt-2">{ro ? 'Doar când apeși butonul, coordonatele aproximative și IP-ul ajung la BigDataCloud pentru identificarea zonei și îmbunătățirea datelor lor. Salvăm doar numele zonei în cont; acesta ajunge la Claude cu cererea. Fără urmărire în fundal.' : 'Only when you press the button, approximate coordinates and your IP go to BigDataCloud to find the area and improve their data. We save only the area name to your account; it goes to Claude with your request. No background tracking.'} <a href="https://www.bigdatacloud.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">{ro ? 'Confidențialitate' : 'Privacy'}</a></p></details>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !draft.trim()} onClick={()=>void save({city:draft.trim()})} className="rounded-lg bg-brand px-3 py-2 text-white disabled:opacity-50">{ro ? 'Salvează locația' : 'Save location'}</button><button type="button" disabled={busy} onClick={()=>void save({city:''})} className="text-brand underline">{city ? (ro ? 'Elimină locația salvată' : 'Remove saved location') : (ro ? 'Continuă fără locație' : 'Continue without location')}</button></div>
      <details className="text-xs text-muted"><summary className="cursor-pointer">{ro ? 'Revocă permisiunea browserului' : 'Revoke browser permission'}</summary><p className="mt-2">{ro ? 'Aplicația nu poate revoca permisiuni în browser. Deschide pictograma de setări de lângă adresa site-ului → Permisiuni/Setări site → Locație → Blochează sau Resetează. Pe telefon, verifică și setările de localizare ale browserului. Eliminarea locației salvate oprește folosirea ei în INeed.' : 'The app cannot revoke browser permissions. Open the settings icon beside the website address → Permissions/Site settings → Location → Block or Reset. On a phone, also check the browser’s location settings. Removing the saved location stops INeed using it.'}</p></details>
    </section>
    <details className="settings-group text-xs text-muted"><summary className="cursor-pointer">{ro ? 'Confidențialitate și despre INeed' : 'Privacy & about INeed'}</summary><p className="mt-3">{ro ? 'Întrebările, răspunsurile, sursele și textul atașat sunt salvate privat în cont pentru a redeschide conversațiile. Pozele nu sunt stocate; atașează-le din nou când este necesar. Cererea, conținutul distribuit și poza ajung la Claude. Dacă trimiți feedback, evaluarea, comentariul, întrebarea și textul răspunsului sunt salvate pentru echipa INeed. Pozele și postările atașate nu sunt salvate cu feedbackul, dar răspunsul poate cita detalii din ele. Răspunsurile pot fi greșite; verifică sursele. Nu contactăm furnizori și nu facem rezervări în locul tău.' : 'Chat questions, answers, source links and shared text are saved privately to your account so you can reopen conversations. Photos are not stored; reattach them when needed. Your request, shared content and attached photo go to Claude. If you submit feedback, its rating, comment, question and answer text are saved for the INeed team. Photos and attached posts are not saved with feedback, but the answer may quote details from them. Answers can be wrong; check the sources. We do not contact providers or make bookings for you.'}</p></details>
    <section className="settings-group space-y-4 text-sm"><h3 className="font-medium">{ro ? 'Contul meu' : 'My account'}</h3><p className="break-all text-xs text-muted">{email}</p><Link href="/cont/parola" className="block">{ro ? 'Schimbă parola' : 'Change password'}</Link><form action={signOut}><button type="submit">{ro ? 'Ieși din cont' : 'Sign out'}</button></form></section>
  </dialog>;
}
