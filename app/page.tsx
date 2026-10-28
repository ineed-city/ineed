import Link from "next/link";
import { Suspense } from "react";
import { getRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./auth/actions";

import { ConciergeBox } from "./concierge-box";
import { Brand, ConciergeMark } from "./ui/brand";

// Răspunsul AI din manuale poate dura câteva zeci de secunde.
export const maxDuration = 120;

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 sm:px-8">
      <header className="flex items-center justify-between gap-4 py-6">
        <Brand /><Link href="/manuals" className="text-xs underline">Manuals / Manuale</Link>
        {/* Utilizatorul se citește din cookie-uri, deci stă în Suspense (Cache Components). */}
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </header>

      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <ConciergeMark />
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[1.9px] text-muted">
          Less searching. More living.
        </p>
        <h1 className="text-5xl font-medium leading-[1.13] tracking-[-2px] sm:text-[61px] sm:tracking-[-3px]">
          Whatever you need.
        </h1>
        <p className="text-[15px] text-muted">
          One useful answer. The right options. Your next step.
        </p>
        <div className="mt-4 w-full">
          <ConciergeBox />
        </div>
      </main>

      <footer className="py-8 text-[11px] text-muted">
        Private pilot · AI answers can be mistaken. Check sources before acting.
      </footer>
    </div>
  );
}

async function UserMenu() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  const role = await getRole();

  return (
    <div className="flex items-center gap-4 text-xs text-muted">
      {email && <span className="hidden sm:inline">{email}</span>}
      {role === "admin" && (
        <Link href="/admin" className="hover:text-ink">
          Admin
        </Link>
      )}
      <Link href="/cont/parola" className="hover:text-ink">
        Parola
      </Link>
      <form action={signOut}>
        <button type="submit" className="hover:text-ink">
          Ieși din cont
        </button>
      </form>
    </div>
  );
}
