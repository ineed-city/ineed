'use client';

import { useEffect, useRef, useState } from 'react';
import { submitFeedback } from './feedback-actions';

export function AnswerFeedback({answerId, question, answer, language}: {
  answerId:string; question:string; answer:string; language:'en'|'ro';
}) {
  const ro = language === 'ro';
  const [rating, setRating] = useState<'helpful'|'not_helpful'|null>(null);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  async function send(e:React.FormEvent) {
    e.preventDefault();
    if (!rating || status === 'saving') return;
    setStatus('saving');
    const result = await submitFeedback({answerId, rating, comment, question, answer, language}).catch(()=>({ok:false}));
    setStatus(result.ok ? 'saved' : 'error');
  }
  return <section className="answer-feedback" aria-label={ro ? 'Feedback despre răspuns' : 'Answer feedback'}>
    {status === 'saved' ? <p role="status">{ro ? 'Mulțumim! Feedbackul a fost trimis.' : 'Thank you. Your feedback was sent.'}</p> : <form onSubmit={send}>
      <p className="mb-2">{ro ? 'Ți-a fost util acest răspuns?' : 'Was this answer useful?'}</p>
      <div className="flex flex-wrap gap-2">{(['helpful','not_helpful'] as const).map(value=><button key={value} type="button" aria-pressed={rating===value} disabled={status==='saving'} onClick={()=>setRating(value)} className="feedback-choice">{value==='helpful' ? (ro ? 'Util' : 'Helpful') : (ro ? 'Nu prea' : 'Not helpful')}</button>)}</div>
      {rating && <div className="mt-3 space-y-3">
        <label className="block">{ro ? 'Ce putem îmbunătăți? (opțional)' : 'What could we improve? (optional)'}<textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={1000} rows={3} disabled={status==='saving'} className="shared-input mt-2" /></label>
        <p className="text-muted">{ro ? 'Trimite evaluarea, comentariul, întrebarea și textul răspunsului către echipa INeed. Poza și postarea atașată nu sunt incluse. Textul răspunsului poate conține detalii din ele.' : 'Send your rating, comment, question and answer text to the INeed team. The photo and attached post are not included. Answer text may contain details from them.'}</p>
        <button className="feedback-choice" type="submit" disabled={status==='saving'}>{status==='saving' ? (ro ? 'Se trimite…' : 'Sending…') : (ro ? 'Trimite feedback' : 'Send feedback')}</button>
        {status==='error' && <p role="alert">{ro ? 'Nu am putut trimite. Încearcă din nou; comentariul este păstrat aici.' : 'Couldn’t send. Please retry; your comment is still here.'}</p>}
      </div>}
    </form>}
  </section>;
}

export function FeedbackDialog({report, language, onClose}: {
  report:{answerId:string; question:string; answer:string}|null; language:'en'|'ro'; onClose:()=>void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ro = language === 'ro';
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog ref={dialog} aria-labelledby="feedback-title" onCancel={e=>{e.preventDefault();onClose();}} className="settings-panel">
    <div className="settings-heading"><h2 id="feedback-title" className="text-xl font-medium">Feedback</h2><button type="button" onClick={onClose} aria-label={ro ? 'Închide feedbackul' : 'Close feedback'} className="icon-button">×</button></div>
    {report ? <><p className="mt-4 text-sm text-muted">{ro ? 'Despre ultimul răspuns la:' : 'About the latest answer to:'}</p><p className="mt-2 text-sm break-words">{report.question}</p><AnswerFeedback {...report} language={language}/></> : <p className="mt-4 text-sm">{ro ? 'Pune mai întâi o întrebare. După ce primești răspunsul, revino aici pentru a trimite feedback.' : 'Ask a question first. Once you receive an answer, come back here to send feedback.'}</p>}
  </dialog>;
}
