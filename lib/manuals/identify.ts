import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ANSWER_MODEL, anthropic } from "@/lib/ai/anthropic";
import type { JpegImage } from "./image";

const IdentifySchema = z.object({
  // Numerele produselor din catalog care se potrivesc cu poza (gol dacă niciunul).
  catalog_numbers: z.array(z.number()),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  confidence: z.enum(["mare", "medie", "mica"]),
  // Ce se vede în poză: textul de pe etichetă sau ecran, mesajul de eroare etc.
  seen: z.string(),
});

export type Identification = {
  // Produsele din bibliotecă potrivite cu poza (mai multe dacă poza e ambiguă).
  matches: { id: number; label: string }[];
  // Ce a recunoscut Claude, chiar dacă nu e în bibliotecă.
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
În catalog_numbers pune numerele TUTUROR produselor din listă care se potrivesc cu poza (ex. când pe etichetă apar mai multe modele, sau aceeași tastatură e folosită la mai multe centrale). Listă goală dacă niciunul.
Dacă se potrivesc mai multe, confidence e „medie” sau „mica”.
În „seen” scrie în română, pe scurt, ce text sau ce mesaj de eroare se vede.`,
          },
        ],
      },
    ],
  });
  console.info("identifyProduct usage:", JSON.stringify(response.usage));

  const result = response.parsed_output;
  if (!result) return { matches: [], label: null, confidence: "mica", seen: "" };

  // Păstrăm doar numerele valide din listă, fără dubluri.
  const matches = [...new Set(result.catalog_numbers)]
    .map((n) => catalog[n - 1])
    .filter((p): p is { id: number; label: string } => Boolean(p));
  const guessed = [result.manufacturer, result.model].filter(Boolean).join(" ") || null;
  return { matches, label: guessed, confidence: result.confidence, seen: result.seen };
}
