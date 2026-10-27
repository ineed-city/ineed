import { createBrowserClient } from "@supabase/ssr";

// Client Supabase pentru componentele care rulează în browser ("use client").
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
