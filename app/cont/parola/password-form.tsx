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
        <p className="rounded-lg bg-green-50 p-4 text-green-900 dark:bg-green-950 dark:text-green-100">
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
        className="rounded-lg border border-zinc-300 bg-transparent px-4 py-3 dark:border-zinc-700"
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
        className="rounded-lg border border-zinc-300 bg-transparent px-4 py-3 dark:border-zinc-700"
      />
      {state.status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-3 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Se salvează..." : "Salvează parola"}
      </button>
    </form>
  );
}
