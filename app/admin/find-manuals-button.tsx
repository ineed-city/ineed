"use client";

import { useActionState } from "react";
import { findManuals, type FindState } from "./actions";

const initialState: FindState = { status: "idle", lines: [] };

export function FindManualsButton({ productId }: { productId: number }) {
  const [state, action, pending] = useActionState(findManuals, initialState);

  return (
    <form action={action} className="mt-2 flex flex-col gap-1">
      <input type="hidden" name="productId" value={productId} />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg border border-line px-2 py-0.5 text-xs hover:bg-tile disabled:opacity-60"
      >
        {pending ? "Se caută manualele (1–2 minute)..." : "Caută manuale cu AI"}
      </button>
      {state.lines.length > 0 && (
        <ul className={`text-xs ${state.status === "error" ? "text-red-700" : "text-muted"}`}>
          {state.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
