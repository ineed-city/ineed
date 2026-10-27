"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initialState);

  if (state.status === "sent") {
    return (
      <p className="rounded-lg bg-green-50 p-4 text-green-900 dark:bg-green-950 dark:text-green-100">
        Dacă adresa are acces la iNeed, ți-am trimis un link de logare. Verifică
        emailul (și folderul Spam) și deschide linkul în acest browser.
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
        {pending ? "Se trimite..." : "Trimite-mi linkul de logare"}
      </button>
    </form>
  );
}
