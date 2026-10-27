import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Intră în cont · iNeed" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">iNeed</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Primești pe email un link cu care intri în cont, fără parolă.
        </p>
      </div>
      {/* searchParams se citesc la cerere, deci stau în Suspense (Cache Components). */}
      <Suspense fallback={null}>
        <LinkError searchParams={searchParams} />
      </Suspense>
      <LoginForm />
    </main>
  );
}

async function LinkError({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const { error } = await searchParams;
  if (!error) return null;

  return (
    <p className="text-sm text-red-600 dark:text-red-400">
      Linkul a expirat sau a fost deja folosit. Cere unul nou.
    </p>
  );
}
