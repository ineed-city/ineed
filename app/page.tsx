import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { readPreferences } from '@/lib/concierge/preferences';
import { ConciergeBox } from './concierge-box';

export const maxDuration = 120;
export default function Home() {
  return <Suspense fallback={<div className="m-auto p-8 text-brand" role="status">iNeed…</div>}><AccountConcierge /></Suspense>;
}
async function AccountConcierge() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) redirect('/login');
  const role = await getRole();
  return <ConciergeBox initial={readPreferences(data.user.user_metadata)} email={data.user.email || ''} isAdmin={role === 'admin'} />;
}
