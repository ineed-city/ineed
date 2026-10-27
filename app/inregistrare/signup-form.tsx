"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignUpState } from "./actions";

const initialState: SignUpState = { status: "idle" };

const inputClass =
  "rounded-xl border border-line bg-white px-4 py-3 focus:border-brand focus:outline-none";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <label htmlFor="code" className="text-sm font-medium">
        Codul de invitație
      </label>
      <input
        id="code"
        name="code"
        type="password"
        required
        autoComplete="off"
        className={inputClass}
      />
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
        className={inputClass}
      />
      <label htmlFor="password" className="text-sm font-medium">
        Parola (minim 8 caractere)
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        className={inputClass}
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
        className={inputClass}
      />
      {state.status === "error" && (
        <p className="text-sm text-red-700">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Se creează contul..." : "Creează contul"}
      </button>
      <Link href="/login" className="text-center text-sm text-muted underline">
        Ai deja cont? Intră în cont
      </Link>
    </form>
  );
}
