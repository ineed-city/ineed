"use server";
import { createClient } from '@/lib/supabase/server';
import { PreferencePatch, preferenceMetadata } from '@/lib/concierge/preferences';
import { revalidatePath } from 'next/cache';

export async function savePreferences(raw: unknown): Promise<{ ok: boolean }> {
  const parsed = PreferencePatch.safeParse(raw);
  if (!parsed.success) return { ok: false };
  try {
    const db = await createClient();
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) return { ok: false };
    // Only non-authoritative preferences; roles and access never use user metadata.
    const updated = await db.auth.updateUser({ data: preferenceMetadata(parsed.data) });
    if (updated.error) return { ok: false };
    revalidatePath('/');
    return { ok: true };
  } catch { return { ok: false }; }
}
