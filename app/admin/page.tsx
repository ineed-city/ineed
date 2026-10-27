import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "../ui/brand";
import { addProduct, setManualStatus, updateDomains } from "./actions";

export const metadata: Metadata = { title: "Admin · iNeed" };

const CATEGORIES = [
  { key: "camere", label: "Camere video" },
  { key: "efractie", label: "Efracție" },
  { key: "incendiu", label: "Incendiu" },
] as const;

const STATUS_STYLE: Record<string, string> = {
  propus: "bg-amber-50 text-amber-800",
  aprobat: "bg-tile text-brand",
  respins: "bg-red-50 text-red-700",
};

export default function AdminPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 sm:px-8">
      <header className="flex items-center justify-between gap-4 py-6">
        <Brand />
        <Link href="/" className="text-xs text-muted hover:text-ink">
          Înapoi la iNeed
        </Link>
      </header>
      {/* Rolul și datele se citesc la cerere, deci stau în Suspense (Cache Components). */}
      <Suspense fallback={<p className="text-sm text-muted">Se încarcă...</p>}>
        <AdminContent />
      </Suspense>
    </div>
  );
}

async function AdminContent() {
  // Cine nu e admin vede „pagina nu există”, nu „acces interzis”.
  if ((await getRole()) !== "admin") notFound();

  const supabase = await createClient();
  const { data: manufacturers, error } = await supabase
    .from("manufacturers")
    .select(
      "id, name, category, domains, products(id, model, manuals(id, kind, title, source_url, status, page_count))",
    )
    .order("name");

  if (error) {
    console.error("admin load failed:", error.code, error.message);
    return <p className="text-sm text-red-700">Datele nu au putut fi încărcate.</p>;
  }

  return (
    <main className="flex flex-col gap-10 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-[-1px]">Produse și manuale</h1>
        <p className="text-muted">
          Domeniile aprobate sunt singurele site-uri pe care AI-ul are voie să caute
          manuale. Manualele găsite apar aici ca „propus” până le aprobi.
        </p>
      </div>

      {CATEGORIES.map((category) => (
        <section key={category.key} className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[1.9px] text-muted">
            {category.label}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {manufacturers
              ?.filter((m) => m.category === category.key)
              .map((m) => (
                <article
                  key={m.id}
                  className="flex flex-col gap-4 rounded-[22px] border border-line bg-white p-5"
                >
                  <h3 className="text-lg font-medium">{m.name}</h3>

                  <form action={updateDomains} className="flex flex-col gap-2">
                    <input type="hidden" name="manufacturerId" value={m.id} />
                    <label htmlFor={`domains-${m.id}`} className="text-xs text-muted">
                      Domenii aprobate (separate prin virgulă)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`domains-${m.id}`}
                        name="domains"
                        defaultValue={m.domains.join(", ")}
                        className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-tile"
                      >
                        Salvează
                      </button>
                    </div>
                  </form>

                  <div className="flex flex-col gap-3">
                    {m.products.length === 0 && (
                      <p className="text-sm text-muted">Niciun produs încă.</p>
                    )}
                    {m.products.map((p) => (
                      <div key={p.id} className="rounded-xl bg-paper p-3">
                        <p className="text-sm font-medium">{p.model}</p>
                        {p.manuals.length === 0 ? (
                          <p className="text-xs text-muted">Niciun manual încă.</p>
                        ) : (
                          <ul className="mt-2 flex flex-col gap-2">
                            {p.manuals.map((manual) => (
                              <li key={manual.id} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[manual.status]}`}>
                                  {manual.status}
                                </span>
                                <span className="text-muted">{manual.kind}</span>
                                <a
                                  href={manual.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline"
                                >
                                  {manual.title}
                                </a>
                                {manual.page_count && (
                                  <span className="text-muted">{manual.page_count} pag.</span>
                                )}
                                {manual.status !== "aprobat" && (
                                  <StatusButton manualId={manual.id} status="aprobat" label="Aprobă" />
                                )}
                                {manual.status !== "respins" && (
                                  <StatusButton manualId={manual.id} status="respins" label="Respinge" />
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>

                  <form action={addProduct} className="flex gap-2">
                    <input type="hidden" name="manufacturerId" value={m.id} />
                    <label htmlFor={`model-${m.id}`} className="sr-only">
                      Model nou pentru {m.name}
                    </label>
                    <input
                      id={`model-${m.id}`}
                      name="model"
                      required
                      placeholder="Model nou, ex. SP4000"
                      className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-brand px-3 py-2 text-sm text-white hover:opacity-90"
                    >
                      Adaugă
                    </button>
                  </form>
                </article>
              ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function StatusButton({
  manualId,
  status,
  label,
}: {
  manualId: number;
  status: string;
  label: string;
}) {
  return (
    <form action={setManualStatus}>
      <input type="hidden" name="manualId" value={manualId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className="rounded-lg border border-line px-2 py-0.5 hover:bg-tile">
        {label}
      </button>
    </form>
  );
}
