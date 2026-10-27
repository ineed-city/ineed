"use server";

import { refresh } from "next/cache";
import { getRole } from "@/lib/auth";
import {
  downloadPdf,
  searchManuals,
  uploadPdf,
  verifyPdf,
  type SearchMode,
} from "@/lib/manuals/discover";
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

// Caută manualele unui produs. Cele de pe site-ul oficial se aprobă automat;
// cele de pe alte site-uri (căutare extinsă) trec prin verificare și rămân „propus”.
export async function findManuals(_prev: FindState, formData: FormData): Promise<FindState> {
  const productId = Number(formData.get("productId"));
  const supabase = await requireAdmin();

  const { data: product } = await supabase
    .from("products")
    .select("id, model, manufacturers(name, domains, search_mode)")
    .eq("id", productId)
    .single();
  const manufacturer = product?.manufacturers as unknown as
    | { name: string; domains: string[]; search_mode: SearchMode }
    | null;
  if (!product || !manufacturer) return { status: "error", lines: ["Produsul nu există."] };
  const mode = manufacturer.search_mode;
  if (mode === "oficial" && manufacturer.domains.length === 0) {
    return { status: "error", lines: ["Producătorul nu are domenii aprobate."] };
  }

  let candidates;
  try {
    candidates = await searchManuals(manufacturer.name, product.model, manufacturer.domains, mode);
  } catch (error) {
    console.error("searchManuals failed:", error);
    return { status: "error", lines: ["Căutarea cu AI a eșuat. Detalii în jurnalele Vercel."] };
  }
  if (candidates.length === 0) {
    return { status: "done", lines: ["Nu am găsit manuale."] };
  }

  const { data: claims } = await supabase.auth.getClaims();
  const lines: string[] = [];
  for (const candidate of candidates) {
    try {
      const pdf = await downloadPdf(candidate.url, manufacturer.domains, mode);

      // Același PDF (aceeași amprentă) poate aparține mai multor produse,
      // ex. un manual comun pentru o familie întreagă de centrale.
      const { data: same } = await supabase
        .from("manuals")
        .select("product_id, anthropic_file_id")
        .eq("sha256", pdf.sha256);
      if (same?.some((m) => m.product_id === product.id)) {
        lines.push(`Există deja: ${candidate.title}`);
        continue;
      }
      const reusedFileId = same?.find((m) => m.anthropic_file_id)?.anthropic_file_id ?? null;

      // Un PDF de pe alt site decât al producătorului e citit întâi de Claude.
      if (!pdf.official && !reusedFileId) {
        const verdict = await verifyPdf(pdf, manufacturer.name, product.model);
        if (!verdict.ok) {
          lines.push(`Sărit: ${candidate.title} (${verdict.reason})`);
          continue;
        }
      }

      const fileId =
        reusedFileId ??
        (await uploadPdf(pdf, `${manufacturer.name}-${product.model}-${candidate.kind}.pdf`));
      const { error } = await supabase.from("manuals").insert({
        product_id: product.id,
        kind: candidate.kind,
        title: candidate.title,
        source_url: pdf.finalUrl,
        sha256: pdf.sha256,
        page_count: pdf.pageCount,
        anthropic_file_id: fileId,
        official: pdf.official,
        // Oficial: aprobat automat (a trecut verificările de domeniu, PDF și amprentă).
        // Neoficial: rămâne „propus” până îl aprobă adminul.
        status: pdf.official ? "aprobat" : "propus",
        approved_by: pdf.official ? claims?.claims?.sub : null,
      });
      if (error) throw new Error(error.message);

      const source = pdf.official ? "" : ` · neoficial, ${new URL(pdf.finalUrl).hostname}`;
      const reused = reusedFileId ? " · fișier refolosit" : "";
      lines.push(
        `${pdf.official ? "Aprobat automat" : "Propus"}: ${candidate.title}${source}${reused}`,
      );
    } catch (error) {
      console.error("manual candidate failed:", candidate.url, error);
      const reason = error instanceof Error ? error.message : "eroare necunoscută";
      lines.push(`Sărit: ${candidate.title} (${reason})`);
    }
  }

  refresh();
  return { status: "done", lines };
}

export async function setSearchMode(formData: FormData) {
  const manufacturerId = Number(formData.get("manufacturerId"));
  const mode = String(formData.get("mode"));
  if (!manufacturerId || (mode !== "oficial" && mode !== "extins")) return;

  const supabase = await requireAdmin();
  const { error } = await supabase
    .from("manufacturers")
    .update({ search_mode: mode })
    .eq("id", manufacturerId);
  if (error) {
    console.error("setSearchMode failed:", error.code, error.message);
    throw new Error("Modul de căutare nu a putut fi salvat.");
  }
  refresh();
}
