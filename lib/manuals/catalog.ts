import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CatalogProduct = { id: number; label: string };

// Produsele care pot primi întrebări: cel puțin un manual aprobat.
// RLS decide ce manuale vede fiecare cont.
export async function getAnswerableProducts(): Promise<CatalogProduct[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("id, model, manufacturers(name), manuals!inner(status)")
    .eq("manuals.status", "aprobat")
    .order("model");

  return (data ?? [])
    .map((p) => ({
      id: p.id,
      label: `${(p.manufacturers as unknown as { name: string } | null)?.name ?? ""} ${p.model}`.trim(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
