import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

// Client Supabase pentru server (Server Components, Server Actions, Route Handlers).
// Creează unul nou la fiecare cerere: nu-l păstra într-o variabilă globală.
export async function createClient() {
  // Supabase initializes session timers; keep them out of speculative prerenders.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components nu pot scrie cookie-uri. E în regulă:
            // proxy.ts reîmprospătează sesiunea la fiecare cerere.
          }
        },
      },
    },
  );
}
