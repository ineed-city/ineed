import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { ANSWER_MODEL, anthropic } from "@/lib/ai/anthropic";
import type { JpegImage } from "./image";

export type ManualForAnswer = {
  title: string;
  kind: "utilizare" | "instalare";
  pages: string[];
  sourceUrl: string;
};

// `manual` e indexul în lista de manuale trimise; paginile încep de la 1.
export type Citation = { manual: number; startPage: number; endPage: number };
export type AnswerSegment = { text: string; citations: Citation[] };

const SYSTEM = `Ești asistentul tehnic iNeed pentru instalatorii de sisteme de securitate (alarme, camere video, detecție incendiu).

Reguli fixe:
1. Folosești EXCLUSIV informațiile din manualele atașate. Nu adăuga cunoștințe generale și nu completa din memorie.
2. Dacă manualele nu conțin răspunsul, scrii doar: „Nu găsesc această informație în manualele produsului.” Nu ghici.
3. Scrii integral în limba română. Manualele pot fi în engleză: traduci, nu copiezi propoziții în engleză. Păstrezi în original doar numele exacte ale tastelor, meniurilor și opțiunilor, între paranteze drepte, ex. [STAY].
4. Text simplu, fără Markdown: fără **, #, sau tabele. Pentru proceduri folosești pași numerotați, „1.”, „2.”, câte unul pe rând.
5. Lucrări la rețeaua electrică de 230 V sau la instalații de gaz: nu dai pași de execuție. Spui că lucrarea trebuie făcută de un electrician sau instalator autorizat ANRE.
6. Sisteme de detecție și alarmare la incendiu: orice modificare a instalației se face doar de personal autorizat; amintește asta pe scurt când e cazul.
7. Nu ajuți la dezactivarea sau ocolirea unui sistem fără acordul proprietarului.
8. Dacă utilizatorul a trimis o poză, o folosești doar ca să înțelegi situația (ex. ce eroare sau ce led se vede). Explicația vine tot din manuale.`;

const RouteSchema = z.object({ kinds: z.array(z.enum(["utilizare", "instalare"])) });

// Un apel foarte mic (doar titlurile, fără manuale) alege ce manual trebuie citit:
// o întrebare de utilizare nu are nevoie de ghidul de programare.
async function chooseManuals(manuals: ManualForAnswer[], question: string) {
  const kinds = [...new Set(manuals.map((m) => m.kind))];
  if (kinds.length < 2) return manuals;

  const response = await anthropic.beta.messages.parse({
    model: ANSWER_MODEL,
    max_tokens: 500,
    output_config: { effort: "low", format: betaZodOutputFormat(RouteSchema) },
    messages: [
      {
        role: "user",
        content: `Manuale disponibile: "utilizare" (operare zilnică: armare, coduri, ecran, evenimente) și "instalare" (programare, cablare, configurare, secțiuni de instalator).
Întrebarea: ${question}
Ce manuale trebuie citite? Alege "instalare" doar dacă întrebarea ține de programare, cablare sau configurare. Dacă nu e clar, alege ambele.`,
      },
    ],
  });
  console.info("chooseManuals usage:", JSON.stringify(response.usage));

  const chosen = response.parsed_output?.kinds ?? [];
  const picked = manuals.filter((m) => chosen.includes(m.kind));
  return picked.length ? picked : manuals;
}

// Răspunde la o întrebare strict din manualele unui produs, cu pagini citate.
export async function answerFromManuals(
  product: string,
  allManuals: ManualForAnswer[],
  question: string,
  image: JpegImage | null = null,
): Promise<{ segments: AnswerSegment[]; manuals: ManualForAnswer[]; refused: boolean }> {
  const manuals = await chooseManuals(allManuals, question);

  // Fiecare pagină e un bloc de text: Claude citează blocuri, deci pagini.
  const documents: BetaContentBlockParam[] = manuals.map((m, i) => ({
    type: "document",
    source: {
      type: "content",
      content: m.pages.map((text, p) => ({
        type: "text" as const,
        text: text || `(pagina ${p + 1} nu conține text)`,
      })),
    },
    title: `${m.title} (manual de ${m.kind})`,
    citations: { enabled: true },
    // Cache după ultimul manual: la întrebările următoare despre același produs,
    // manualele se citesc din cache cu ~10% din preț.
    ...(i === manuals.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));

  const response = await anthropic.beta.messages.create({
    model: ANSWER_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...documents,
          ...(image
            ? [
                {
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: image.mediaType, data: image.data },
                },
              ]
            : []),
          {
            type: "text",
            text: `Produsul: ${product}\n${image ? "Utilizatorul a atașat o poză.\n" : ""}Întrebarea: ${question}`,
          },
        ],
      },
    ],
  });
  console.info("answerFromManuals usage:", JSON.stringify(response.usage));

  if (response.stop_reason === "refusal") return { segments: [], manuals, refused: true };

  // Răspunsul vine în bucăți de text; cele bazate pe manual au citări pe blocuri.
  const segments: AnswerSegment[] = [];
  for (const block of response.content) {
    if (block.type !== "text") continue;
    const citations: Citation[] = [];
    for (const c of block.citations ?? []) {
      if (c.type === "content_block_location") {
        citations.push({
          manual: c.document_index,
          startPage: c.start_block_index + 1,
          // end_block_index e exclusiv, deci e chiar ultima pagină numerotată de la 1.
          endPage: c.end_block_index,
        });
      }
    }
    segments.push({ text: block.text, citations });
  }
  return { segments, manuals, refused: false };
}
