import type { Metadata } from "next";
import { Suspense } from "react";
import { Brand } from "../ui/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Intră în cont · iNeed" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Brand />
      <h1 className="text-3xl font-medium tracking-[-1px]">Intră în cont</h1>
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
    <p className="text-sm text-red-700">
      Linkul din email a expirat sau a fost deja folosit. Fiecare link merge o
      singură dată, în browserul în care l-ai cerut.
    </p>
  );
}
