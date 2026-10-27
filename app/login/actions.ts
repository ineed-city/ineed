"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { status: "idle" | "error"; message?: string };

export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Eroarea reală ajunge în jurnalele Vercel; utilizatorul vede un mesaj neutru.
    console.error("signIn failed:", error.status, error.code);
    if (error.status === 429) {
      return {
        status: "error",
        message: "Prea multe încercări. Așteaptă un minut și încearcă din nou.",
      };
    }
    return { status: "error", message: "Email sau parolă greșite." };
  }

  redirect("/");
}
