"use client";
import { useEffect, useRef, useState } from 'react';
import { NextStepsSchema, type NextAction, type NextSteps as Steps } from '@/lib/concierge/next-steps';
import { VideoResults } from './video-results';
import { Icon } from './ui/icons';

export function NextSteps({groups,ro,disabled,onAction}:{groups?:Steps;ro:boolean;disabled:boolean;onAction:(action:NextAction,title:string)=>void}) {
  const parsed=NextStepsSchema.safeParse(groups);
  if(!parsed.success || !parsed.data.length) return null;
  return <section className="next-steps" aria-label={ro?'Pașii următori':'Next steps'}>
    {parsed.data.map((group,index)=><div key={index} className="next-step-group">
      <h3 className="text-sm font-medium">{group.title}</h3>
      <div className="next-step-buttons">{group.actions.map((action,i)=>{
        const href=action.type==='website'?action.url:action.type==='maps'?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(action.destination)}`:action.type==='call'?`tel:${action.phone}`:null;
        return href ? <a key={i} className="next-step-button" href={href} target={action.type==='call'?undefined:'_blank'} rel="noopener noreferrer" title={action.type==='call'?action.phone:action.type==='maps'?action.destination:href}><Icon name={action.type==='maps'?'pin':'link'}/>{action.label}</a> : <button key={i} type="button" disabled={disabled} className="next-step-button" onClick={()=>onAction(action,group.title)}><Icon name={action.type==='video'?'play':action.type==='followup'?'message':'chevron'}/>{action.label}</button>;
      })}</div>
      {group.actions.some(a=>a.type==='maps'||a.type==='call'||a.type==='website')&&<p className="text-[11px] text-muted">{ro?'Se deschide aplicația sau sursa externă. Verifică destinația și detaliile; nu facem rezervări.':'Opens an app or external source. Check destination and details; no booking is made.'}</p>}
    </div>)}
  </section>;
}

export function ActionPanel({action,title,ro,onClose,onStartTimer}:{action:NextAction;title:string;ro:boolean;onClose:()=>void;onStartTimer:(seconds:number,label:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [items,setItems]=useState(action.type==='checklist'?action.items.map(text=>({text,done:false})):[]);
  const [draft,setDraft]=useState(action.type==='copy'?action.text:'');
  const [copied,setCopied]=useState(false);
  const [copyFailed,setCopyFailed]=useState(false);
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function copy() {
    try { await navigator.clipboard.writeText(action.type==='checklist'?items.map(item=>`${item.done?'✓':'☐'} ${item.text}`).join('\n'):draft);setCopied(true);setCopyFailed(false); }
    catch {setCopyFailed(true);}
  }
  return <dialog ref={dialog} className="settings-panel" aria-labelledby="action-panel-title" onCancel={e=>{e.preventDefault();onClose();}}>
    <div className="settings-heading"><h2 id="action-panel-title" className="font-medium">{action.label}</h2><button type="button" className="icon-button" aria-label={ro?'Închide':'Close'} onClick={onClose}><Icon name="close"/></button></div>
    <p className="mb-4 text-sm text-muted">{title}</p>
    {action.type==='video'&&<VideoResults query={action.query} ro={ro}/>}
    {action.type==='checklist'&&<><div className="space-y-3">{items.map((item,i)=><label key={i} className="flex items-center gap-3"><input type="checkbox" checked={item.done} onChange={()=>{setItems(old=>old.map((x,j)=>j===i?{...x,done:!x.done}:x));setCopied(false);}}/><input aria-label={`${ro?'Element':'Item'} ${i+1}`} value={item.text} maxLength={180} onChange={e=>{setItems(old=>old.map((x,j)=>j===i?{...x,text:e.target.value}:x));setCopied(false);}} className={`w-full min-w-0 rounded-lg border border-line p-2 text-sm ${item.done?'line-through text-muted':''}`}/></label>)}</div><p className="mt-4 text-xs text-muted">{ro?'Lista originală rămâne în Istoric. Modificările și bifările sunt temporare; copiază lista pentru a le păstra.':'The original list stays in History. Edits and checkmarks are temporary; copy the list to keep them.'}</p></>}
    {action.type==='copy'&&<><textarea aria-label={ro?'Text de copiat':'Text to copy'} value={draft} maxLength={4000} rows={12} onChange={e=>{setDraft(e.target.value);setCopied(false);}} className="w-full rounded-lg border border-line p-3 text-sm"/><p className="mt-2 text-xs text-muted">{ro?'Verifică și modifică textul. Nu trimitem mesaje în locul tău.':'Review and edit this draft. We do not send messages for you.'}</p></>}
    {(action.type==='copy'||action.type==='checklist')&&<button type="button" onClick={()=>void copy()} className="next-step-button mt-4">{copied?(ro?'Copiat':'Copied'):(ro?'Copiază':'Copy')}</button>}
    {copyFailed&&<p role="status" className="mt-2 text-sm">{ro?'Copierea nu este disponibilă. Selectează și copiază textul manual.':'Clipboard is unavailable. Select and copy the text manually.'}</p>}
    {action.type==='timer'&&<><p className="text-3xl font-medium">{Math.floor(action.seconds/60)}:{String(action.seconds%60).padStart(2,'0')}</p><p className="my-4 text-sm text-muted">{ro?'Pornește când începi acest pas. Cronometrul funcționează în această pagină; telefonul poate suspenda pagina în fundal. Nu există alarmă garantată când aplicația este închisă. Pentru o alarmă sigură folosește Ceasul telefonului.':'Start when you begin this step. This timer runs in this page; your phone may suspend it in the background. No alarm is guaranteed when the app is closed. For a reliable alarm use your phone’s Clock.'}</p><button type="button" className="next-step-button" onClick={()=>{onStartTimer(action.seconds,`${title} · ${action.label}`);onClose();}}>{ro?'Pornește cronometrul':'Start timer'}</button></>}
  </dialog>;
}

export function ActiveTimer({end,label,ro,onStop}:{end:number;label:string;ro:boolean;onStop:()=>void}) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const tick=()=>setNow(Date.now());const timer=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[]);
  const seconds=Math.max(0,Math.ceil((end-now)/1000));
  return <aside className="active-timer"><div><p className="text-xs truncate max-w-64">{label}</p><p role={seconds===0?'status':'timer'} className="font-medium">{seconds===0?(ro?'Timpul a expirat':'Time is up'):`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}</p></div><button type="button" className="text-xs underline" onClick={onStop}>{ro?'Oprește':'Stop'}</button></aside>;
}
