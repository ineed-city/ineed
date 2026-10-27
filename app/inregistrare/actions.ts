"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SignUpState = { status: "idle" | "error"; message?: string };

const MIN_LENGTH = 8;

// Compară codurile în timp constant, ca durata răspunsului să nu dezvăluie
// câte caractere din cod au fost ghicite corect.
function codeMatches(input: string) {
  const expected = process.env.SIGNUP_CODE;
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!codeMatches(code)) {
    // O mică pauză încetinește pe cine încearcă coduri la întâmplare.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { status: "error", message: "Codul de invitație nu e corect." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "Adresa de email nu pare validă." };
  }
  if (password.length < MIN_LENGTH) {
    return {
      status: "error",
      message: `Parola trebuie să aibă cel puțin ${MIN_LENGTH} caractere.`,
    };
  }
  if (password !== confirm) {
    return { status: "error", message: "Cele două parole nu sunt identice." };
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    console.error("signUp failed: SUPABASE_SECRET_KEY is not set");
    return { status: "error", message: "Înregistrarea nu e configurată încă." };
  }

  // Contul îl creează serverul cu cheia secretă. Înscrierile directe în
  // Supabase rămân închise, deci nimeni nu poate ocoli codul de invitație.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error("signUp failed:", error.status, error.code);
    if (error.code === "email_exists") {
      return {
        status: "error",
        message: "Există deja un cont cu acest email. Intră în cont sau resetează parola.",
      };
    }
    if (error.code === "weak_password") {
      return { status: "error", message: "Parola e prea slabă. Alege una mai lungă." };
    }
    return { status: "error", message: "Contul nu a putut fi creat. Încearcă din nou." };
  }

  // Contul există: îl logăm direct, ca să nu mai treacă prin pagina de login.
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email, password });

  redirect("/");
}
