"use server";

import { refresh } from "next/cache";
import { getRole } from "@/lib/auth";
import { downloadPdf, searchManuals, uploadPdf } from "@/lib/manuals/discover";
import { createClient } from "@/lib/supabase/server";

// Fiecare acțiune verifică rolul pe server: Server Actions pot fi apelate
// direct prin POST. Baza de date verifică și ea (RLS), ca a doua barieră.
async function requireAdmin() {
  if ((await getRole()) !== "admin") {
    throw new Error("Doar administratorul poate face această modificare.");
  }
  return createClient();
}

export async function addProduct(formData: FormData) {
  const manufacturerId = Number(formData.get("manufacturerId"));
  // Modelele în majuscule, ca „sp4000” și „SP4000” să fie același produs.
  const model = String(formData.get("model") ?? "").trim().toUpperCase();
  if (!manufacturerId || !model) return;

  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("products")
    .insert({ manufacturer_id: manufacturerId, model });

  // 23505 = produsul există deja: nu e nimic de adăugat.
  if (error && error.code !== "23505") {
    console.error("addProduct failed:", error.code, error.message);
    throw new Error("Produsul nu a putut fi adăugat.");
  }
  refresh();
}

export async function updateDomains(formData: FormData) {
  const manufacturerId = Number(formData.get("manufacturerId"));
  const domains = String(formData.get("domains") ?? "")
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));

  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("manufacturers")
    .update({ domains: [...new Set(domains)] })
    .eq("id", manufacturerId);

  if (error) {
    console.error("updateDomains failed:", error.code, error.message);
    throw new Error("Domeniile nu au putut fi salvate.");
  }
  refresh();
}

const STATUSES = ["propus", "aprobat", "respins"] as const;

export async function setManualStatus(formData: FormData) {
  const manualId = Number(formData.get("manualId"));
  const status = String(formData.get("status"));
  if (!manualId || !STATUSES.includes(status as (typeof STATUSES)[number])) return;

  const supabase = await requireAdmin();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from("manuals")
    .update({
      status,
      approved_by: status === "aprobat" ? claims?.claims?.sub : null,
    })
    .eq("id", manualId);

  if (error) {
    console.error("setManualStatus failed:", error.code, error.message);
    throw new Error("Statusul nu a putut fi schimbat.");
  }
  refresh();
}

export type FindState = { status: "idle" | "done" | "error"; lines: string[] };

// Caută manualele oficiale ale unui produs și le salvează ca „propus”.
export async function findManuals(_prev: FindState, formData: FormData): Promise<FindState> {
  const productId = Number(formData.get("productId"));
  const supabase = await requireAdmin();

  const { data: product } = await supabase
    .from("products")
    .select("id, model, manufacturers(name, domains)")
    .eq("id", productId)
    .single();
  const manufacturer = product?.manufacturers as unknown as
    | { name: string; domains: string[] }
    | null;
  if (!product || !manufacturer) return { status: "error", lines: ["Produsul nu există."] };
  if (manufacturer.domains.length === 0) {
    return { status: "error", lines: ["Producătorul nu are domenii aprobate."] };
  }

  let candidates;
  try {
    candidates = await searchManuals(manufacturer.name, product.model, manufacturer.domains);
  } catch (error) {
    console.error("searchManuals failed:", error);
    return { status: "error", lines: ["Căutarea cu AI a eșuat. Detalii în jurnalele Vercel."] };
  }
  if (candidates.length === 0) {
    return { status: "done", lines: ["Nu am găsit manuale pe domeniile aprobate."] };
  }

  const lines: string[] = [];
  for (const candidate of candidates) {
    try {
      const pdf = await downloadPdf(candidate.url, manufacturer.domains);

      const { data: existing } = await supabase
        .from("manuals")
        .select("id")
        .eq("product_id", product.id)
        .eq("sha256", pdf.sha256)
        .maybeSingle();
      if (existing) {
        lines.push(`Există deja: ${candidate.title}`);
        continue;
      }

      const filename = `${manufacturer.name}-${product.model}-${candidate.kind}.pdf`;
      const fileId = await uploadPdf(pdf, filename);
      const { error } = await supabase.from("manuals").insert({
        product_id: product.id,
        kind: candidate.kind,
        title: candidate.title,
        source_url: pdf.finalUrl,
        sha256: pdf.sha256,
        page_count: pdf.pageCount,
        anthropic_file_id: fileId,
      });
      if (error) throw new Error(error.message);
      lines.push(`Propus: ${candidate.title}`);
    } catch (error) {
      console.error("manual candidate failed:", candidate.url, error);
      const reason = error instanceof Error ? error.message : "eroare necunoscută";
      lines.push(`Sărit: ${candidate.title} (${reason})`);
    }
  }

  refresh();
  return { status: "done", lines };
}
