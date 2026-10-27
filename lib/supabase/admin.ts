import "server-only";
import { createClient } from "@supabase/supabase-js";

// Client cu cheia SECRETĂ: ocolește regulile de securitate ale bazei de date.
// Doar pe server ("server-only" oprește build-ul dacă e importat în browser)
// și doar pentru operații de administrare, ca crearea conturilor.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
