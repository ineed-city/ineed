"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendResetLink, type ResetState } from "./actions";

const initialState: ResetState = { status: "idle" };

export function ResetForm() {
  const [state, action, pending] = useActionState(sendResetLink, initialState);

  if (state.status === "sent") {
    return (
      <p className="rounded-xl bg-tile p-4 text-ink">
        Dacă adresa are cont în iNeed, ți-am trimis un link pentru o parolă nouă.
        Deschide-l în acest browser.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label htmlFor="email" className="text-sm font-medium">
        Adresa de email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="nume@exemplu.ro"
        className="rounded-xl border border-line bg-white px-4 py-3 focus:border-brand focus:outline-none"
      />
      {state.status === "error" && (
        <p className="text-sm text-red-700">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Se trimite..." : "Trimite-mi linkul de resetare"}
      </button>
      <Link
        href="/login"
        className="text-center text-sm text-muted underline"
      >
        Înapoi la logare
      </Link>
    </form>
  );
}
