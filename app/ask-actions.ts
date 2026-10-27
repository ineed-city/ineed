"use server";

import { getRole } from "@/lib/auth";
import { answerFromManuals, type AnswerSegment } from "@/lib/manuals/answer";
import { getAnswerableProducts } from "@/lib/manuals/catalog";
import { identifyProduct, type Identification } from "@/lib/manuals/identify";
import { parseImageDataUrl } from "@/lib/manuals/image";
import { createClient } from "@/lib/supabase/server";

export type AskState = {
  status: "idle" | "answered" | "error";
  segments: AnswerSegment[];
  manuals: { title: string; sourceUrl: string }[];
  notice?: string;
  error?: string;
};

// Verificare în cod, independentă de AI: la gaz și curent de rețea afișăm
// mereu trimiterea la un specialist autorizat ANRE, oricare ar fi răspunsul.
const ANRE_TOPICS =
  /\b(gaz|gaze|centrala termic|cazan|230\s?v|220\s?v|re[tț]ea(ua)? electric|tablou electric|siguran[tț][aăe] automat|priz[aăe]|[îi]mp[aă]m[aâ]ntare|electrician)/i;

const ANRE_NOTICE =
  "Lucrările la rețeaua electrică de 230 V sau la instalații de gaz se fac doar de un electrician sau instalator autorizat ANRE.";

const EMPTY: Omit<AskState, "status"> = { segments: [], manuals: [] };

export async function askQuestion(_prev: AskState, formData: FormData): Promise<AskState> {
  const productId = Number(formData.get("productId"));
  const image = parseImageDataUrl(formData.get("image"));
  // Doar cu poză, fără text: întrebăm ce înseamnă ce se vede.
  const question =
    String(formData.get("question") ?? "").trim().slice(0, 2000) ||
    (image ? "Ce înseamnă ce se vede în poză și ce trebuie să fac?" : "");
  if (!productId) return { status: "error", ...EMPTY, error: "Alege întâi produsul." };
  if (!question) return { status: "error", ...EMPTY, error: "Scrie întrebarea." };

  // Server Actions pot fi apelate direct prin POST: verificăm login-ul aici.
  if (!(await getRole())) return { status: "error", ...EMPTY, error: "Intră din nou în cont." };

  const supabase = await createClient();
  // RLS alege ce manuale vede fiecare: utilizatorii obișnuiți doar pe cele de utilizare.
  const { data: product } = await supabase
    .from("products")
    .select("model, manufacturers(name), manuals(title, kind, page_texts, source_url, status)")
    .eq("id", productId)
    .single();
  const manufacturer = product?.manufacturers as unknown as { name: string } | null;
  const manuals = (product?.manuals ?? []).filter(
    (m) => m.status === "aprobat" && m.page_texts?.length,
  );
  if (!product || !manufacturer || manuals.length === 0) {
    return { status: "error", ...EMPTY, error: "Produsul nu are încă manuale pregătite (aprobate și cu text extras)." };
  }

  const notice = ANRE_TOPICS.test(question) ? ANRE_NOTICE : undefined;
  try {
    const { segments, manuals: used, refused } = await answerFromManuals(
      `${manufacturer.name} ${product.model}`,
      manuals.map((m) => ({
        title: m.title,
        kind: m.kind,
        pages: m.page_texts as string[],
        sourceUrl: m.source_url,
      })),
      question,
      image,
    );
    if (refused) {
      return { status: "error", ...EMPTY, notice, error: "Nu pot răspunde la această întrebare." };
    }
    return {
      status: "answered",
      segments,
      // Citările se referă la manualele citite efectiv, în ordinea trimisă.
      manuals: used.map((m) => ({ title: m.title, sourceUrl: m.sourceUrl })),
      notice,
    };
  } catch (error) {
    console.error("askQuestion failed:", error);
    return { status: "error", ...EMPTY, notice, error: "Răspunsul nu a putut fi generat. Încearcă din nou." };
  }
}

export type IdentifyResult = Identification | { error: string };

// Recunoaște produsul dintr-o poză și îl potrivește cu biblioteca de manuale.
export async function identifyFromPhoto(formData: FormData): Promise<IdentifyResult> {
  if (!(await getRole())) return { error: "Intră din nou în cont." };
  const image = parseImageDataUrl(formData.get("image"));
  if (!image) return { error: "Poza nu a putut fi citită. Încearcă din nou." };

  try {
    return await identifyProduct(image, await getAnswerableProducts());
  } catch (error) {
    console.error("identifyFromPhoto failed:", error);
    return { error: "Nu am putut analiza poza. Încearcă din nou." };
  }
}
