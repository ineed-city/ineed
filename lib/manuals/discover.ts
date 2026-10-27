import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { toFile } from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { anthropic, DISCOVERY_MODEL } from "@/lib/ai/anthropic";

export type SearchMode = "oficial" | "extins";

// În căutarea extinsă excludem forumuri, rețele sociale, magazine și
// agregatoare de manuale (ale căror termeni interzic descărcarea automată).
const BLOCKED_DOMAINS = [
  "reddit.com", "facebook.com", "youtube.com", "instagram.com", "tiktok.com",
  "x.com", "twitter.com", "linkedin.com", "pinterest.com", "quora.com",
  "manualslib.com", "manua.ls", "manualsonline.com", "scribd.com", "issuu.com",
  "amazon.com", "ebay.com", "aliexpress.com", "emag.ro", "olx.ro",
];

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

// Pasul 1: Claude caută pe internet. În modul „oficial” doar pe domeniile
// aprobate; în modul „extins” oriunde, în afară de domeniile blocate.
// Restricția e impusă de API (allowed_domains / blocked_domains).
export async function searchManuals(
  manufacturer: string,
  model: string,
  domains: string[],
  mode: SearchMode,
): Promise<Candidate[]> {
  const where =
    mode === "oficial"
      ? `- Return only direct links to PDF files published by ${manufacturer} on its official website.`
      : `- Prefer PDFs on the official ${manufacturer} website. If they are not public there, you may return the original ${manufacturer} PDF hosted by a distributor or installer company.`;

  const messages: BetaMessageParam[] = [
    {
      role: "user",
      content: `Find the PDF manuals for the ${manufacturer} ${model} security product.
I need the user manual and the installation manual (installer/programming guide).
Rules:
${where}
- Only original manufacturer documents. Never forums, Q&A pages, datasheets, brochures, or marketing material.
- If the same manual exists in several languages, prefer English and Romanian.
- If you cannot find a manual, return an empty list rather than guessing a link.
- You have at most 3 searches: start with "${manufacturer} ${model} manual pdf", then refine only if needed.
For each PDF give the URL, its title as shown on the site, and kind: "utilizare" for user manuals, "instalare" for installation, installer or programming manuals.`,
    },
  ];

  const webSearch =
    mode === "oficial"
      ? { type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 3, allowed_domains: domains }
      : { type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 3, blocked_domains: BLOCKED_DOMAINS };

  // Căutarea web poate cere mai multe runde („pause_turn”): continuăm conversația.
  for (let round = 0; round < 4; round++) {
    const response = await anthropic.beta.messages.parse({
      model: DISCOVERY_MODEL,
      max_tokens: 8000,
      // Rezultatele căutărilor se retrimit la fiecare pas: din cache costă ~10%.
      cache_control: { type: "ephemeral" },
      tools: [webSearch],
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

// Adrese pe care nu le descărcăm niciodată: IP-uri directe, rețele interne,
// domenii blocate. Așa un link primit de la AI nu poate ținti serverele noastre.
function isPermittedHost(hostname: string, domains: string[], mode: SearchMode) {
  const host = hostname.toLowerCase();
  if (isIP(host) || !host.includes(".") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (isAllowedHost(host, BLOCKED_DOMAINS)) return false;
  return mode === "extins" || isAllowedHost(host, domains);
}

// Claude primește PDF-uri de cel mult 32 MB într-o cerere.
const MAX_PDF_BYTES = 32 * 1024 * 1024;

export type DownloadedPdf = {
  buffer: Buffer;
  sha256: string;
  pageCount: number | null;
  finalUrl: string;
  // true dacă PDF-ul vine de pe un domeniu oficial al producătorului.
  official: boolean;
};

// Pasul 2: descărcăm PDF-ul și îl verificăm în cod, fără să ne bazăm pe AI.
export async function downloadPdf(
  url: string,
  domains: string[],
  mode: SearchMode,
): Promise<DownloadedPdf> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !isPermittedHost(parsed.hostname, domains, mode)) {
    throw new Error(`Domeniu neaprobat: ${parsed.hostname}`);
  }

  const res = await fetch(parsed, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; iNeed manual fetcher)" },
  });
  if (!res.ok) throw new Error(`Descărcarea a eșuat (${res.status})`);

  // Și după redirecționări trebuie să fim tot pe o adresă permisă.
  const finalUrl = new URL(res.url);
  if (finalUrl.protocol !== "https:" || !isPermittedHost(finalUrl.hostname, domains, mode)) {
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

  return {
    buffer,
    sha256,
    pageCount: pages || null,
    finalUrl: finalUrl.toString(),
    official: isAllowedHost(finalUrl.hostname, domains),
  };
}

const VerdictSchema = z.object({
  is_original_manual: z.boolean(),
  matches_product: z.boolean(),
  reason: z.string(),
});

// Pentru PDF-urile de pe alte site-uri: Claude citește documentul și confirmă
// că e manualul original al producătorului, pentru modelul cerut.
export async function verifyPdf(pdf: DownloadedPdf, manufacturer: string, model: string) {
  const response = await anthropic.beta.messages.parse({
    model: DISCOVERY_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: betaZodOutputFormat(VerdictSchema) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdf.buffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: `Is this PDF an original ${manufacturer} manual (not rewritten or third-party), and does it cover the ${manufacturer} ${model}? Answer in Romanian in "reason", one short sentence.`,
          },
        ],
      },
    ],
  });
  console.info("verifyPdf usage:", JSON.stringify(response.usage));

  const verdict = response.parsed_output;
  return {
    ok: Boolean(verdict?.is_original_manual && verdict.matches_product),
    reason: verdict?.reason ?? "verificarea nu a dat un răspuns",
  };
}

// Pasul 3: urcăm PDF-ul la Anthropic (Files API). La noi rămâne doar ID-ul.
export async function uploadPdf(pdf: DownloadedPdf, filename: string) {
  const uploaded = await anthropic.files.upload({
    file: await toFile(pdf.buffer, filename, { type: "application/pdf" }),
  });
  return uploaded.id;
}
