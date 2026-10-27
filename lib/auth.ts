import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "tehnician" | "utilizator";

// Rolul utilizatorului logat, citit din tabelul profiles (null dacă nu e logat).
export async function getRole(): Promise<Role | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  return (profile?.role as Role | undefined) ?? null;
}
