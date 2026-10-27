"use server";

import { createClient } from "@/lib/supabase/server";

export type PasswordState = { status: "idle" | "saved" | "error"; message?: string };

const MIN_LENGTH = 8;

export async function updatePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_LENGTH) {
    return {
      status: "error",
      message: `Parola trebuie să aibă cel puțin ${MIN_LENGTH} caractere.`,
    };
  }
  if (password !== confirm) {
    return { status: "error", message: "Cele două parole nu sunt identice." };
  }

  const supabase = await createClient();
  // Server Actions pot fi apelate direct prin POST, deci verificăm sesiunea aici.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { status: "error", message: "Sesiunea a expirat. Intră din nou în cont." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("updatePassword failed:", error.status, error.code);
    if (error.code === "same_password") {
      return { status: "error", message: "Parola nouă e la fel ca cea veche." };
    }
    return { status: "error", message: "Parola nu a putut fi salvată. Încearcă din nou." };
  }

  return { status: "saved" };
}
