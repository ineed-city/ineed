"use server";

import { refresh } from "next/cache";
import { getRole } from "@/lib/auth";
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
  const model = String(formData.get("model") ?? "").trim();
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
