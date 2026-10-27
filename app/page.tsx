import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./auth/actions";
import { RequestBox } from "./request-box";
import { Brand, ConciergeMark } from "./ui/brand";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 sm:px-8">
      <header className="flex items-center justify-between gap-4 py-6">
        <Brand />
        {/* Utilizatorul se citește din cookie-uri, deci stă în Suspense (Cache Components). */}
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </header>

      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <ConciergeMark />
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[1.9px] text-muted">
          Mai puțin căutat. Mai mult trăit.
        </p>
        <h1 className="text-5xl font-medium leading-[1.13] tracking-[-2px] sm:text-[61px] sm:tracking-[-3px]">
          Orice îți trebuie.
        </h1>
        <p className="text-[15px] text-muted">
          Un răspuns util. Oamenii potriviți. Următorul pas.
        </p>
        <div className="mt-4 w-full">
          <RequestBox />
        </div>
      </main>

      <footer className="py-8 text-[11px] text-muted">
        O singură casetă. Exact cât să mergi mai departe.
      </footer>
    </div>
  );
}

async function UserMenu() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;

  return (
    <div className="flex items-center gap-4 text-xs text-muted">
      {email && <span className="hidden sm:inline">{email}</span>}
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
