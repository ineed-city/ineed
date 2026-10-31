import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "../ui/brand";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Creează cont · iNeed" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Brand />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-[-1px]">Creează cont</h1>
        <p className="text-muted">
          Ai nevoie de codul de invitație primit de la echipa iNeed.
        </p>
      </div>
      <SignUpForm />
      <p className="text-center text-xs text-muted">
        Înainte de a crea contul, citește{" "}
        <Link href="/privacy" className="underline">Confidențialitatea</Link> și{" "}
        <Link href="/terms" className="underline">Termenii</Link>.
      </p>
    </main>
  );
}
