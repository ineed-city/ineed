"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type FormState } from "./actions";

const initialState: FormState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialState);

  return (
    <form action={action} className="auth-form flex flex-col gap-4">
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
      <label htmlFor="password" className="text-sm font-medium">
        Parola
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
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
        {pending ? "Se verifică..." : "Intră în cont"}
      </button>
      <Link
        href="/login/resetare"
        className="text-center text-sm text-muted underline"
      >
        Ai uitat parola?
      </Link>
      <Link href="/inregistrare" className="text-center text-sm text-muted underline">
        Nu ai cont? Creează unul cu codul de invitație
      </Link>
    </form>
  );
}
