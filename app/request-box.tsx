"use client";

import { useRef, useState } from "react";

const IDEAS = ["Robinetul picură", "Un instalator în zonă", "Zugrăvesc o cameră"];

// Caseta „Am nevoie de…”. Asistentul AI se leagă aici la pasul următor.
export function RequestBox() {
  const [text, setText] = useState("");
  const [notice, setNotice] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim()) setNotice(true);
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <form
        onSubmit={submit}
        className="w-full rounded-[22px] border border-line bg-white p-5 shadow-[0_10px_32px_rgba(49,72,43,0.024)]"
      >
        <label htmlFor="request" className="sr-only">
          Spune-i lui iNeed de ce ai nevoie
        </label>
        <textarea
          id="request"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          rows={2}
          placeholder="Am nevoie de…"
          className="w-full resize-none bg-transparent text-xl tracking-[-0.4px] placeholder:text-muted/70 focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            București
          </span>
          <button
            type="submit"
            aria-label="Trimite"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white transition-opacity hover:opacity-90"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </form>

      {notice && (
        <p className="text-sm text-sage">
          Asistentul AI vine la pasul următor. Cererea ta nu a fost trimisă încă.
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-muted">Încearcă o idee</p>
        <div className="flex flex-wrap justify-center gap-2">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => {
                setText(idea);
                setNotice(false);
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
