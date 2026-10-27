import type { Metadata } from "next";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Setează parola · iNeed" };

// Pagina e protejată de proxy.ts: ajung aici doar utilizatorii logați.
export default function PasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Setează parola</h1>
      <PasswordForm />
    </main>
  );
}
