"use server";

import { createClient } from "@/lib/supabase/server";
import { answerNeed } from "@/lib/concierge/answer";
import { RequestSchema, type ConciergeResult } from "@/lib/concierge/contracts";

// Best-effort pilot guard per server instance. Not a distributed billing cap.
const usage = new Map<string, { count: number; expires: number; busy: boolean }>();

export async function askConcierge(raw: unknown): Promise<ConciergeResult> {
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", segments: [], message: "Please enter a request of 2–2,000 characters." };
  const ro = parsed.data.language === "ro";
  try {
    const db = await createClient();
    const { data } = await db.auth.getClaims();
    const id = data?.claims?.sub;
    if (!id) return { status: "error", segments: [], message: ro ? "Intră din nou în cont." : "Please sign in again." };
    const now = Date.now();
    for (const [key, item] of usage) if (item.expires <= now) usage.delete(key);
    const entry = usage.get(id) || { count: 0, expires: now + 60 * 60 * 1000, busy: false };
    if (entry.busy || entry.count >= 15) return { status: "error", segments: [], message: ro ? "Ai atins limita pilotului. Încearcă mai târziu." : "Pilot request limit reached. Please try again later." };
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI not configured");
    entry.count++; entry.busy = true; usage.set(id, entry);
    try { return await answerNeed(parsed.data); }
    finally { entry.busy = false; }
  } catch (error) {
    console.error("concierge failed", error instanceof Error ? error.name : "UnknownError");
    return { status: "error", segments: [], message: ro ? "Nu am putut răspunde acum. Încearcă din nou; dacă persistă, anunță administratorul." : "I couldn’t finish that request. Try again; if it persists, let the pilot administrator know." };
  }
}
