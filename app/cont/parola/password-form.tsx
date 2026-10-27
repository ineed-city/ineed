"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePassword, type PasswordState } from "./actions";

const initialState: PasswordState = { status: "idle" };

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);

  if (state.status === "saved") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-xl bg-tile p-4 text-ink">
          Parola a fost salvată. De acum intri cu emailul și parola, de pe orice
          dispozitiv.
        </p>
        <Link href="/" className="text-sm underline">
          Înapoi la iNeed
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label htmlFor="password" className="text-sm font-medium">
        Parola nouă (minim 8 caractere)
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className="rounded-xl border border-line bg-white px-4 py-3 focus:border-brand focus:outline-none"
      />
      <label htmlFor="confirm" className="text-sm font-medium">
        Repetă parola
      </label>
      <input
        id="confirm"
        name="confirm"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
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
        {pending ? "Se salvează..." : "Salvează parola"}
      </button>
    </form>
  );
}
