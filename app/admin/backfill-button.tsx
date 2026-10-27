"use client";

import { useActionState } from "react";
import { backfillPageTexts, type BackfillState } from "./actions";

const initialState: BackfillState = { status: "idle", lines: [] };

export function BackfillButton() {
  const [state, action, pending] = useActionState(backfillPageTexts, initialState);

  return (
    <form action={action} className="flex flex-col gap-1">
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-xl border border-line bg-white px-3 py-2 text-sm hover:bg-tile disabled:opacity-60"
      >
        {pending ? "Se extrage textul..." : "Extrage textul manualelor existente"}
      </button>
      {state.lines.length > 0 && (
        <ul className="text-xs text-muted">
          {state.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
