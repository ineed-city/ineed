import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./auth/actions";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">iNeed</h1>
        {/* Utilizatorul se citește din cookie-uri, deci stă în Suspense (Cache Components). */}
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      </header>
      <p className="text-zinc-600 dark:text-zinc-400">
        Ajutor pentru reparații și lucrări în casă. În curând: asistentul AI.
      </p>
    </main>
  );
}

async function UserMenu() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;

  return (
    <div className="flex items-center gap-3 text-sm">
      {email && <span className="text-zinc-600 dark:text-zinc-400">{email}</span>}
      <Link href="/cont/parola" className="underline">
        Parola
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
        >
          Ieși din cont
        </button>
      </form>
    </div>
  );
}
