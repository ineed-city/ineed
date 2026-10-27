"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { status: "idle" | "sent" | "error"; message?: string };

// Trimite un email cu link de resetare. Linkul duce la /auth/callback,
// care deschide sesiunea și trimite utilizatorul la /cont/parola.
export async function sendResetLink(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const origin = (await headers()).get("origin");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/cont/parola`,
  });

  if (error) {
    console.error("sendResetLink failed:", error.status, error.code);
    if (error.status === 429) {
      return {
        status: "error",
        message: "Prea multe cereri. Încearcă din nou peste câteva minute.",
      };
    }
  }

  // Același mesaj și pentru emailurile fără cont, ca să nu dezvăluim
  // cine are acces în aplicație.
  return { status: "sent" };
}
