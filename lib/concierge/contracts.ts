import { z } from "zod";

export const PhotoSchema = z.string().max(650_000)
  .regex(/^data:image\/jpeg;base64,\/9j\/(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

export const RequestSchema = z.object({
  photo: PhotoSchema.optional(),
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

// Skip the separate AI planner only for clear first-turn requests. Ambiguous
// requests and all follow-ups keep the planner and its clarification behavior.
export function quickPlan(input: ConciergeRequest): Plan | null {
  if (input.photo || input.context.length || input.question.length > 240) return null;
  const q = input.question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (input.city.trim() && /\b(plumber|handyman|restaurant|restaurants|cafe|cafes|electrician|instalator|restaurante|cafenea)\b/.test(q)) {
    return { goal: input.question, category: "local", needsWeb: true, clarification: null };
  }
  // Restrict the no-search shortcut to ordinary ingredient-only requests.
  const recipe = q.match(/^(?:what can i cook with|ce pot gati cu) (.+?)[?.!]?$/);
  if (recipe && /^(?:(?:rice|chickpeas|eggs|pasta|potatoes|tomatoes|onions|carrots|beans|lentils|spinach|cheese|orez|naut|oua|paste|cartofi|rosii|ceapa|morcovi|fasole|linte|spanac|branza|and|si|,|\s)+)$/.test(recipe[1])) {
    return { goal: input.question, category: "recipe", needsWeb: false, clarification: null };
  }
  return null;
}
