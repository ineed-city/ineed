'use server';

import { createClient } from '@/lib/supabase/server';
import { FeedbackSchema } from '@/lib/concierge/feedback';

export async function submitFeedback(raw: unknown): Promise<{ok: boolean}> {
  const parsed = FeedbackSchema.safeParse(raw);
  if (!parsed.success) return {ok:false};
  try {
    const db = await createClient();
    const {data} = await db.auth.getClaims();
    const userId = data?.claims?.sub;
    if (!userId) return {ok:false};
    const value = parsed.data;
    const {error} = await db.from('answer_feedback').upsert({
      user_id:userId, answer_id:value.answerId, rating:value.rating,
      comment:value.comment, question:value.question, answer:value.answer, language:value.language,
    }, {onConflict:'user_id,answer_id'});
    return {ok: !error};
  } catch { return {ok:false}; }
}
