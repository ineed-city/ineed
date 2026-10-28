import { z } from "zod";

export const RequestSchema = z.object({
  question: z.string().trim().min(2).max(2000),
  city: z.string().trim().max(100),
  language: z.enum(["en", "ro"]),
  context: z.array(z.string().max(4000)).max(4),
});
export const PlanSchema = z.object({
  goal: z.string(),
  category: z.enum(["local", "recipe", "howto", "research", "general"]),
  needsWeb: z.boolean(),
  clarification: z.string().nullable(),
});
export type ConciergeRequest = z.infer<typeof RequestSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Segment = { text: string; sources: { title: string; url: string }[] };
export type ConciergeResult = {
  status: "answered" | "clarify" | "error";
  segments: Segment[];
  plan?: Plan;
  message?: string;
  searched?: boolean;
};

// Only web citation URLs returned by the search tool become clickable links.
export function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (!url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
