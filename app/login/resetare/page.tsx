import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Parolă uitată · iNeed" };

export default function ResetPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Ai uitat parola?</h1>
        <p className="text-muted">
          Îți trimitem pe email un link cu care îți alegi o parolă nouă.
        </p>
      </div>
      <ResetForm />
    </main>
  );
}
