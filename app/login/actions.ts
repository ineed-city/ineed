"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

// Trimite un link de logare pe email. Doar conturile create (invitate) din
// Supabase pot intra: shouldCreateUser: false blochează înscrierile noi.
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Adresa de email nu pare validă." };
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  // Prea multe cereri la rând: Supabase limitează trimiterea de emailuri.
  if (error?.status === 429) {
    return {
      status: "error",
      message: "Ai cerut prea multe linkuri. Încearcă din nou peste un minut.",
    };
  }

  // Același mesaj și pentru emailurile fără cont, ca să nu dezvăluim
  // cine are acces în aplicație.
  return { status: "sent" };
}
