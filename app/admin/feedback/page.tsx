import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { readPreferences } from '@/lib/concierge/preferences';

export default function FeedbackPage() {
  return <Suspense fallback={<p className="p-8">INeed…</p>}><Reports /></Suspense>;
}
async function Reports() {
  if (await getRole() !== 'admin') notFound();
  const db = await createClient();
  const {data:account} = await db.auth.getUser();
  const ro = readPreferences(account.user?.user_metadata || {}).language === 'ro';
  const {data, error} = await db.from('answer_feedback').select('id,rating,comment,question,answer,created_at').order('created_at',{ascending:false}).limit(100);
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-5 py-8">
    <Link href="/" className="text-sm underline">{ro ? 'Înapoi la INeed' : 'Back to INeed'}</Link>
    <h1 className="text-3xl font-medium">{ro ? 'Feedback răspunsuri' : 'Answer feedback'}</h1>
    <p className="text-sm text-muted">{ro ? 'Ultimele 100 de rapoarte trimise de utilizatori. Vizibile doar administratorilor. Textul este raportat de utilizator, nu un jurnal verificat al conversației.' : 'Latest 100 user-submitted reports. Visible only to administrators. Text is reported by the user, not a verified conversation log.'}</p>
    {error ? <p role="alert">{ro ? 'Nu am putut încărca feedbackul.' : 'Couldn’t load feedback.'}</p> : !data?.length ? <p>{ro ? 'Niciun feedback încă.' : 'No feedback yet.'}</p> : data.map(item=><article key={item.id} className="rounded-2xl border border-line bg-white p-5 space-y-3">
      <div className="flex justify-between gap-3 text-sm"><strong>{item.rating==='helpful' ? (ro ? 'Util' : 'Helpful') : (ro ? 'Nu prea' : 'Not helpful')}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(ro ? 'ro-RO' : 'en-GB',{timeZone:'UTC'})} UTC</time></div>
      {item.comment && <p className="whitespace-pre-wrap break-words">{item.comment}</p>}
      <details className="text-sm"><summary>{ro ? 'Vezi întrebarea și răspunsul' : 'View question and answer'}</summary><p className="mt-3 whitespace-pre-wrap break-words font-medium">{item.question}</p><p className="mt-3 whitespace-pre-wrap break-words">{item.answer}</p></details>
    </article>)}
  </main>;
}
