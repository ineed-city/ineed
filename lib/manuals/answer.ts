import "server-only";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { ANSWER_MODEL, anthropic } from "@/lib/ai/anthropic";

export type ManualForAnswer = {
  title: string;
  kind: "utilizare" | "instalare";
  fileId: string;
  sourceUrl: string;
};

export type Citation = { manual: number; startPage: number; endPage: number };
export type AnswerSegment = { text: string; citations: Citation[] };

const SYSTEM = `Ești asistentul tehnic iNeed pentru instalatorii de sisteme de securitate (alarme, camere video, detecție incendiu). Răspunzi în limba română.

Reguli fixe:
1. Folosești EXCLUSIV informațiile din manualele atașate. Nu adăuga cunoștințe generale și nu completa din memorie.
2. Dacă manualele nu conțin răspunsul, scrii doar: „Nu găsesc această informație în manualele produsului.” Nu ghici.
3. Răspunzi scurt, cu pași numerotați când e o procedură. Păstrezi exact denumirile de meniuri, taste și secțiuni din manual.
4. Lucrări la rețeaua electrică de 230 V sau la instalații de gaz: nu dai pași de execuție. Spui că lucrarea trebuie făcută de un electrician sau instalator autorizat ANRE.
5. Sisteme de detecție și alarmare la incendiu: orice modificare a instalației se face doar de personal autorizat; amintește asta pe scurt când e cazul.
6. Nu ajuți la dezactivarea sau ocolirea unui sistem fără acordul proprietarului.`;

// Răspunde la o întrebare strict din manualele unui produs, cu pagini citate.
export async function answerFromManuals(
  product: string,
  manuals: ManualForAnswer[],
  question: string,
): Promise<{ segments: AnswerSegment[]; refused: boolean }> {
  const documents: BetaContentBlockParam[] = manuals.map((m, i) => ({
    type: "document",
    source: { type: "file", file_id: m.fileId },
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
          { type: "text", text: `Produsul: ${product}\nÎntrebarea: ${question}` },
        ],
      },
    ],
  });
  console.info("answerFromManuals usage:", JSON.stringify(response.usage));

  if (response.stop_reason === "refusal") return { segments: [], refused: true };

  // Răspunsul vine în bucăți de text; cele bazate pe manual au citări cu pagini.
  const segments: AnswerSegment[] = [];
  for (const block of response.content) {
    if (block.type !== "text") continue;
    const citations: Citation[] = [];
    for (const c of block.citations ?? []) {
      if (c.type === "page_location") {
        citations.push({
          manual: c.document_index,
          startPage: c.start_page_number,
          endPage: c.end_page_number,
        });
      }
    }
    segments.push({ text: block.text, citations });
  }
  return { segments, refused: false };
}
