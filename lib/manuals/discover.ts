import "server-only";
import { createHash } from "node:crypto";
import { toFile } from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { anthropic, DISCOVERY_MODEL } from "@/lib/ai/anthropic";

// Ce trebuie să returneze Claude: doar linkuri directe către PDF-uri.
const CandidatesSchema = z.object({
  manuals: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      kind: z.enum(["utilizare", "instalare"]),
    }),
  ),
});

export type Candidate = z.infer<typeof CandidatesSchema>["manuals"][number];

// Pasul 1: Claude caută pe internet, DOAR pe domeniile aprobate ale producătorului.
// Restricția e impusă de API (allowed_domains), nu doar cerută în text.
export async function searchManuals(
  manufacturer: string,
  model: string,
  domains: string[],
): Promise<Candidate[]> {
  const messages: BetaMessageParam[] = [
    {
      role: "user",
      content: `Find the official PDF manuals for the ${manufacturer} ${model} security product.
I need the user manual and the installation manual (installer/programming guide).
Rules:
- Return only direct links to PDF files published by ${manufacturer} on its official website.
- Never return forums, retailer or reseller pages, datasheets, brochures, or marketing material.
- If the same manual exists in several languages, prefer English and Romanian.
- If you cannot find a manual, return an empty list rather than guessing a link.
- You have at most 3 searches: start with "${manufacturer} ${model} manual pdf", then refine only if needed.
For each PDF give the URL, its title as shown on the site, and kind: "utilizare" for user manuals, "instalare" for installation, installer or programming manuals.`,
    },
  ];

  // Căutarea web poate cere mai multe runde („pause_turn”): continuăm conversația.
  for (let round = 0; round < 4; round++) {
    const response = await anthropic.beta.messages.parse({
      model: DISCOVERY_MODEL,
      max_tokens: 8000,
      // Rezultatele căutărilor se retrimit la fiecare pas: din cache costă ~10%.
      cache_control: { type: "ephemeral" },
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
          allowed_domains: domains,
        },
      ],
      output_config: { effort: "low", format: betaZodOutputFormat(CandidatesSchema) },
      messages,
    });
    // Consumul fiecărui apel, vizibil în jurnalele Vercel, ca să urmărim costul.
    console.info("searchManuals usage:", JSON.stringify(response.usage));

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "refusal") {
      throw new Error("Cererea a fost refuzată de model.");
    }
    return response.parsed_output?.manuals ?? [];
  }
  throw new Error("Căutarea nu s-a terminat în timpul permis.");
}

// Domeniul e aprobat dacă e chiar el sau un subdomeniu (ex. www.paradox.com).
export function isAllowedHost(hostname: string, domains: string[]) {
  const host = hostname.toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

// Claude primește PDF-uri de cel mult 32 MB într-o cerere.
const MAX_PDF_BYTES = 32 * 1024 * 1024;

export type DownloadedPdf = {
  buffer: Buffer;
  sha256: string;
  pageCount: number | null;
  finalUrl: string;
};

// Pasul 2: descărcăm PDF-ul și îl verificăm în cod, fără să ne bazăm pe AI.
export async function downloadPdf(url: string, domains: string[]): Promise<DownloadedPdf> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !isAllowedHost(parsed.hostname, domains)) {
    throw new Error(`Domeniu neaprobat: ${parsed.hostname}`);
  }

  const res = await fetch(parsed, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; iNeed manual fetcher)" },
  });
  if (!res.ok) throw new Error(`Descărcarea a eșuat (${res.status})`);

  // Și după redirecționări trebuie să fim tot pe un domeniu aprobat.
  const finalUrl = new URL(res.url);
  if (!isAllowedHost(finalUrl.hostname, domains)) {
    throw new Error(`Redirecționat pe un domeniu neaprobat: ${finalUrl.hostname}`);
  }
  if (Number(res.headers.get("content-length") ?? 0) > MAX_PDF_BYTES) {
    throw new Error("PDF-ul depășește 32 MB");
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_PDF_BYTES) throw new Error("PDF-ul depășește 32 MB");
  // Orice PDF începe cu „%PDF”: așa respingem paginile HTML deghizate.
  if (buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new Error("Fișierul nu este un PDF");
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  // Număr aproximativ de pagini; în unele PDF-uri comprimate nu poate fi citit.
  const pages = buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0;

  return { buffer, sha256, pageCount: pages || null, finalUrl: finalUrl.toString() };
}

// Pasul 3: urcăm PDF-ul la Anthropic (Files API). La noi rămâne doar ID-ul.
export async function uploadPdf(pdf: DownloadedPdf, filename: string) {
  const uploaded = await anthropic.files.upload({
    file: await toFile(pdf.buffer, filename, { type: "application/pdf" }),
  });
  return uploaded.id;
}
