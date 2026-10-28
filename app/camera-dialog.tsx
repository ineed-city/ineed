"use client";

import { useEffect, useRef, useState } from "react";
import { captureFrame, startCamera } from "@/lib/concierge/camera";

export function CameraDialog({ ro, onClose, onCapture }: { ro: boolean; onClose: () => void; onCapture: (file: File) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stop = useRef<() => void>(() => {});
  const alive = useRef(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    const element = video.current;
    const closeCamera = startCamera(navigator.mediaDevices, stream => {
      if (!element) return;
      element.srcObject = stream;
      void element.play().catch(() => { if (alive.current) setError('Playback'); });
    }, name => setError(name));
    stop.current = closeCamera;
    return () => { alive.current = false; closeCamera(); if (element) element.srcObject = null; };
  }, []);

  function close() { stop.current(); onClose(); }
  async function capture() {
    if (!ready || capturing || !video.current) return;
    setCapturing(true);
    try {
      const file = await captureFrame(video.current);
      if (!alive.current) return;
      stop.current(); onCapture(file); onClose();
    } catch { if (alive.current) { setError('Capture'); setCapturing(false); } }
  }

  const message = error === 'NotAllowedError'
    ? (ro ? 'Permite accesul la cameră în setările browserului și ale dispozitivului, apoi încearcă din nou.' : 'Allow camera access in your browser and device settings, then try again.')
    : error === 'NotFoundError'
      ? (ro ? 'Nu am găsit o cameră pe acest dispozitiv.' : 'No camera was found on this device.')
      : error === 'Unsupported'
        ? (ro ? 'Deschide app.ineed.city direct în Chrome sau Safari pentru a folosi camera.' : 'Open app.ineed.city directly in Chrome or Safari to use the camera.')
        : (ro ? 'Nu pot porni camera. Închide alte aplicații care o folosesc și încearcă din nou, sau adaugă o poză.' : 'Couldn’t use the camera. Close other apps using it and try again, or use Add a photo.');

  return <dialog ref={dialog} onCancel={event => {event.preventDefault(); close();}} className="m-auto w-[min(92vw,560px)] rounded-2xl bg-white p-5 text-ink shadow-xl backdrop:bg-black/60" aria-labelledby="camera-title">
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 id="camera-title" className="text-lg font-medium">{ro ? 'Fă o poză' : 'Take a photo'}</h2>
      <button type="button" onClick={close} className="rounded-lg border border-line px-3 py-2">{ro ? 'Închide' : 'Close camera'}</button>
    </div>
    <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} className="max-h-[55vh] w-full rounded-xl bg-black object-contain" aria-label={ro ? 'Previzualizare cameră' : 'Camera preview'} />
    {error ? <p role="alert" className="my-3 text-sm text-red-800">{message}</p> : !ready && <p role="status" className="my-3 text-sm">{ro ? 'Permite accesul la cameră când browserul te întreabă…' : 'Allow camera access when your browser asks…'}</p>}
    <p className="my-3 text-xs text-muted">{ro ? 'Previzualizarea rămâne pe dispozitiv. Poza se trimite doar când trimiți întrebarea.' : 'The preview stays on your device. The photo is sent only when you submit your question.'}</p>
    <button type="button" disabled={!ready || capturing || Boolean(error)} onClick={capture} className="rounded-xl bg-brand px-5 py-2.5 text-white disabled:opacity-50">{capturing ? (ro ? 'Pregătesc poza…' : 'Capturing…') : (ro ? 'Fotografiază' : 'Capture photo')}</button>
  </dialog>;
}
