import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ANSWER_MODEL, anthropic } from "@/lib/ai/anthropic";
import type { JpegImage } from "./image";

const IdentifySchema = z.object({
  // Numărul produsului din catalog, dacă poza se potrivește cu unul (altfel null).
  catalog_number: z.number().nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  confidence: z.enum(["mare", "medie", "mica"]),
  // Ce se vede în poză: textul de pe etichetă sau ecran, mesajul de eroare etc.
  seen: z.string(),
});

export type Identification = {
  productId: number | null;
  label: string | null;
  confidence: "mare" | "medie" | "mica";
  seen: string;
};

// Claude se uită la poză și o potrivește cu produsele din bibliotecă.
export async function identifyProduct(
  image: JpegImage,
  catalog: { id: number; label: string }[],
): Promise<Identification> {
  const list = catalog.map((p, i) => `${i + 1}. ${p.label}`).join("\n");

  const response = await anthropic.beta.messages.parse({
    model: ANSWER_MODEL,
    max_tokens: 1000,
    output_config: { effort: "low", format: betaZodOutputFormat(IdentifySchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          {
            type: "text",
            text: `Poza arată un echipament de securitate (centrală de alarmă, tastatură, cameră video, centrală de incendiu) sau eticheta lui.
Identifică producătorul și modelul doar din ce se vede: logo, etichetă, text pe ecran, forma tastaturii.
Produsele din bibliotecă:
${list || "(niciunul)"}
Dacă poza se potrivește cu un produs din listă, dă-i numărul în catalog_number; altfel null.
Familiile de produse pot arăta la fel (ex. aceeași tastatură la mai multe centrale): în acest caz confidence „medie” sau „mica”.
În „seen” scrie în română, pe scurt, ce text sau ce mesaj de eroare se vede.`,
          },
        ],
      },
    ],
  });
  console.info("identifyProduct usage:", JSON.stringify(response.usage));

  const result = response.parsed_output;
  if (!result) return { productId: null, label: null, confidence: "mica", seen: "" };

  const match = result.catalog_number ? catalog[result.catalog_number - 1] : undefined;
  const guessed = [result.manufacturer, result.model].filter(Boolean).join(" ") || null;
  return {
    productId: match?.id ?? null,
    label: match?.label ?? guessed,
    confidence: result.confidence,
    seen: result.seen,
  };
}
