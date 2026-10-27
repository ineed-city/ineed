"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  askQuestion,
  identifyFromPhoto,
  type AskState,
  type IdentifyResult,
} from "./ask-actions";

export type ProductOption = { id: number; label: string };

const IDEAS = [
  "Cum armez sistemul parțial (Stay)?",
  "Cum schimb codul unui utilizator?",
  "Ce înseamnă o eroare afișată pe tastatură?",
];

const CONFIDENCE: Record<string, string> = { mare: "sigur", medie: "probabil", mica: "nesigur" };

const initialState: AskState = { status: "idle", segments: [], manuals: [] };

// Micșorează poza în browser (max 1280 px, JPEG) înainte de trimitere:
// Server Actions primesc cel mult 1 MB, iar pentru recunoaștere ajunge.
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}

// Caseta „Am nevoie de…”: întrebarea (și poza, opțional) merge la AI, care
// răspunde strict din manualele produsului ales, cu paginile citate.
export function RequestBox({ products }: { products: ProductOption[] }) {
  const [state, action, pending] = useActionState(askQuestion, initialState);
  const [text, setText] = useState("");
  const [productId, setProductId] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentifyResult | null>(null);
  const [identifying, startIdentify] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = !pending && Boolean(productId) && Boolean(text.trim() || photo);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const dataUrl = await shrinkPhoto(file);
    setPhoto(dataUrl);
    setIdentity(null);
    startIdentify(async () => {
      const formData = new FormData();
      formData.set("image", dataUrl);
      setIdentity(await identifyFromPhoto(formData));
    });
  }

  function removePhoto() {
    setPhoto(null);
    setIdentity(null);
    if (fileRef.current) fileRef.current.value = "";
  }

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
              if (canSend) formRef.current?.requestSubmit();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder={photo ? "Ce vrei să afli despre poză? (opțional)" : "Am nevoie de…"}
          className="w-full resize-none bg-transparent text-xl tracking-[-0.4px] placeholder:text-muted/70 focus:outline-none"
        />

        {photo && (
          <div className="mb-3 flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- previzualizare locală (data URL) */}
            <img src={photo} alt="Poza atașată" className="h-16 w-16 rounded-lg object-cover" />
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
              {identifying && <p className="text-sage">Recunosc produsul din poză…</p>}
              {identity && "error" in identity && <p className="text-red-700">{identity.error}</p>}
              {identity && !("error" in identity) && (
                <>
                  {identity.productId ? (
                    <p>
                      Pare un <strong>{identity.label}</strong> ({CONFIDENCE[identity.confidence]}).
                      {String(identity.productId) !== productId && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => setProductId(String(identity.productId))}
                            className="rounded-lg bg-tile px-2 py-0.5 text-brand hover:underline"
                          >
                            Da, e corect
                          </button>
                        </>
                      )}
                    </p>
                  ) : identity.label ? (
                    <p>
                      Pare un <strong>{identity.label}</strong>, dar nu are încă manuale în
                      bibliotecă. Alege alt produs sau cere adminului să-l adauge.
                    </p>
                  ) : (
                    <p>Nu recunosc produsul din poză. Alege-l din listă.</p>
                  )}
                  {identity.seen && <p className="text-muted">În poză: {identity.seen}</p>}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={removePhoto}
              aria-label="Șterge poza"
              className="text-muted hover:text-ink"
            >
              ×
            </button>
          </div>
        )}
        <input type="hidden" name="image" value={photo ?? ""} />

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Fă o poză sau alege o imagine"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:bg-tile hover:text-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </button>
            <label className="flex min-w-0 items-center text-xs text-muted">
              <span className="sr-only">Produsul</span>
              <select
                name="productId"
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="min-w-0 max-w-[50vw] truncate rounded-lg border border-line bg-paper px-2 py-1.5 text-xs text-ink focus:border-brand focus:outline-none"
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
          </div>
          <button
            type="submit"
            aria-label="Trimite"
            disabled={!canSend}
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
                {/* Modelul e rugat să nu folosească Markdown; eliminăm oricum asteriscurile rămase. */}
                {segment.text.replace(/\*\*/g, "")}
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
