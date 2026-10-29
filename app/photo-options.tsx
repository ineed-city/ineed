"use client";
import { useEffect, useRef } from 'react';
import { Icon } from './ui/icons';

export function PhotoOptions({ ro, onClose, onCamera, onUpload }: {
  ro: boolean; onClose: () => void; onCamera: () => void; onUpload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby="photo-options-title" className="photo-options-panel" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="flex items-center justify-between gap-4 mb-4">
      <h2 id="photo-options-title" className="text-lg font-medium">{ro ? 'Adaugă o poză' : 'Add a photo'}</h2>
      <button type="button" className="icon-button" aria-label={ro ? 'Închide opțiunile pentru poză' : 'Close photo options'} onClick={onClose}><Icon name="close" /></button>
    </div>
    <button type="button" className="photo-option" onClick={()=>{dialog.current?.close();onCamera();}}><Icon name="camera" /><span>{ro ? 'Fă o poză' : 'Take a photo'}</span></button>
    <button type="button" className="photo-option" onClick={()=>{dialog.current?.close();onUpload();}}><Icon name="photo" /><span>{ro ? 'Încarcă din dispozitiv' : 'Upload from device'}</span></button>
  </dialog>;
}
