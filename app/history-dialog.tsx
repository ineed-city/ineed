'use client';
import { useEffect, useRef, useState } from 'react';
import { listChats, loadChat } from './history-actions';
import type { ChatSummary, SavedChat } from '@/lib/concierge/history';
import { Icon } from './ui/icons';

export function HistoryDialog({ro,onClose,onOpen,onNew}: {ro:boolean;onClose:()=>void;onOpen:(chat:SavedChat)=>void;onNew:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [items,setItems]=useState<ChatSummary[]>([]);
  const [offset,setOffset]=useState(0);
  const [more,setMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [opening,setOpening]=useState<string|null>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  useEffect(()=>{
    let active=true;
    listChats(0).then(result=>{if (!active) return; if(result.ok){setItems(result.chats);setOffset(result.chats.length);setMore(result.more);}else setError(true);setLoading(false);}).catch(()=>{if(active){setError(true);setLoading(false);}});
    return ()=>{active=false;};
  },[]);
  async function moreChats() {
    setLoading(true);setError(false);
    const result=await listChats(offset).catch(()=>({ok:false as const}));
    if(result.ok){setItems(previous=>[...previous,...result.chats.filter(item=>!previous.some(p=>p.id===item.id))]);setOffset(offset+result.chats.length);setMore(result.more);}else setError(true);
    setLoading(false);
  }
  async function open(id:string) {
    if(opening) return;
    setOpening(id);setError(false);
    const result=await loadChat(id).catch(()=>({ok:false as const}));
    if(result.ok) onOpen(result.chat);else setError(true);
    setOpening(null);
  }
  return <dialog ref={dialog} aria-labelledby="history-title" onCancel={e=>{e.preventDefault();onClose();}} className="settings-panel">
    <div className="settings-heading"><h2 id="history-title" className="text-xl font-medium">{ro?'Istoric':'History'}</h2><button type="button" className="icon-button" aria-label={ro?'Închide istoricul':'Close history'} onClick={onClose}><Icon name="close"/></button></div>
    <p className="mt-4 text-xs text-muted">{ro?'Conversațiile noi sunt salvate în cont. Chaturile dinaintea activării istoricului nu sunt disponibile. Pozele nu sunt salvate.':'New conversations are saved to your account. Chats from before history was enabled are unavailable. Photos are not saved.'}</p>
    <button type="button" className="feedback-choice my-4 text-sm" onClick={onNew}>{ro?'Conversație nouă':'New chat'}</button>
    <div className="space-y-2">{items.map(item=><button type="button" key={item.id} disabled={Boolean(opening)} onClick={()=>void open(item.id)} className="history-item"><span className="block break-words font-medium">{item.title}</span><time dateTime={item.updated_at} className="mt-1 block text-xs text-muted">{new Date(item.updated_at).toLocaleString(ro?'ro-RO':'en-GB')}</time>{opening===item.id&&<span role="status" className="text-xs">{ro?'Se deschide…':'Opening…'}</span>}</button>)}</div>
    {loading&&<p role="status" className="mt-4 text-sm">{ro?'Se încarcă…':'Loading…'}</p>}
    {!loading&&!items.length&&!error&&<p className="text-sm text-muted">{ro?'Nicio conversație salvată încă.':'No saved conversations yet.'}</p>}
    {error&&<p role="alert" className="mt-4 text-sm">{ro?'Nu am putut încărca conversațiile. Încearcă din nou.':'Couldn’t load conversations. Please try again.'}</p>}
    {(more||error)&&<button type="button" disabled={loading} onClick={()=>void moreChats()} className="mt-4 text-sm underline">{error?(ro?'Reîncearcă':'Retry'):(ro?'Mai multe conversații':'Load more')}</button>}
  </dialog>;
}
