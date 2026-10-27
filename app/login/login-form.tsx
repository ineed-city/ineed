"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type FormState } from "./actions";

const initialState: FormState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState);

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
      <label htmlFor="password" className="text-sm font-medium">
        Parola
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
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
        {pending ? "Se verifică..." : "Intră în cont"}
      </button>
      <Link
        href="/login/resetare"
        className="text-center text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        Ai uitat parola?
      </Link>
    </form>
  );
}
