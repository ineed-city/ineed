"use client";

import { useActionState, useRef, useState } from "react";
import { askQuestion, type AskState } from "./ask-actions";

export type ProductOption = { id: number; label: string };

const IDEAS = [
  "Cum armez sistemul parțial (Stay)?",
  "Cum schimb codul unui utilizator?",
  "Ce înseamnă o eroare afișată pe tastatură?",
];

const initialState: AskState = { status: "idle", segments: [], manuals: [] };

// Caseta „Am nevoie de…”: întrebarea merge la AI, care răspunde strict din
// manualele produsului ales, cu paginile citate.
export function RequestBox({ products }: { products: ProductOption[] }) {
  const [state, action, pending] = useActionState(askQuestion, initialState);
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <form
        ref={formRef}
        action={action}
        className="w-full rounded-[22px] border border-line bg-white p-5 text-left shadow-[0_10px_32px_rgba(49,72,43,0.024)]"
      >
        <label htmlFor="request" className="sr-only">
          Întrebarea ta despre produs
        </label>
        <textarea
          id="request"
          name="question"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !pending) formRef.current?.requestSubmit();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Am nevoie de…"
          className="w-full resize-none bg-transparent text-xl tracking-[-0.4px] placeholder:text-muted/70 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span className="sr-only">Produsul</span>
            <select
              name="productId"
              required
              defaultValue=""
              className="min-w-0 max-w-[60vw] truncate rounded-lg border border-line bg-paper px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none"
            >
              <option value="" disabled>
                {products.length ? "Alege produsul" : "Niciun produs cu manuale"}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            aria-label="Trimite"
            disabled={pending || !text.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>

      {pending && <p className="text-sm text-sage">Caut în manualele produsului…</p>}

      {!pending && state.notice && (
        <p className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
          {state.notice}
        </p>
      )}

      {!pending && state.status === "error" && (
        <p className="text-sm text-red-700">{state.error}</p>
      )}

      {!pending && state.status === "answered" && (
        <article className="w-full rounded-[22px] border border-line bg-white p-5 text-left text-[15px] leading-relaxed">
          <div className="whitespace-pre-wrap">
            {state.segments.map((segment, i) => (
              <span key={i}>
                {segment.text}
                {segment.citations.map((c, j) => {
                  const manual = state.manuals[c.manual];
                  if (!manual) return null;
                  const pages =
                    c.endPage > c.startPage ? `${c.startPage}–${c.endPage}` : `${c.startPage}`;
                  return (
                    <a
                      key={j}
                      href={`${manual.sourceUrl}#page=${c.startPage}`}
                      target="_blank"
                      rel="noreferrer"
                      title={manual.title}
                      className="mx-0.5 inline-block rounded-full bg-tile px-1.5 align-baseline text-[11px] text-brand hover:underline"
                    >
                      pag. {pages}
                    </a>
                  );
                })}
              </span>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            Surse: {state.manuals.map((m) => m.title).join(" · ")}
          </p>
        </article>
      )}

      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-muted">Încearcă o întrebare</p>
        <div className="flex flex-wrap justify-center gap-2">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => {
                setText(idea);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-[#e1e5d9] px-3.5 py-1.5 text-xs text-sage transition-colors hover:bg-tile"
            >
              {idea}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
