import type { NextSteps } from "./next-steps";
import { z } from "zod";

export const PhotoSchema = z.string().max(650_000)
  .regex(/^data:image\/jpeg;base64,\/9j\/(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

export const DeviceLocationSchema = z.object({
  latitude:z.number().min(-90).max(90), longitude:z.number().min(-180).max(180),
  accuracy:z.number().min(0).max(1000), capturedAt:z.number().int().positive(),
});
export type DeviceLocation = z.infer<typeof DeviceLocationSchema>;
export function freshDeviceLocation(point:DeviceLocation|undefined, now=Date.now()) {
  return point && point.capturedAt<=now+5000 && now-point.capturedAt<=120000 ? point : undefined;
}
export const RequestSchema = z.object({
  shared: z.object({
    text: z.string().trim().max(6000),
    url: z.string().trim().max(2000).refine(value => !value || Boolean(safeSourceUrl(value))),
  }).optional(),
  photo: PhotoSchema.optional(),
  question: z.string().trim().min(2).max(2000),
  city: z.string().trim().max(100),
  deviceLocation: DeviceLocationSchema.optional(),
  language: z.enum(["en", "ro"]),
  context: z.array(z.string().max(4000)).max(30),
});
export const PlanSchema = z.object({
  goal: z.string(),
  category: z.enum(["local", "recipe", "howto", "research", "general"]),
  needsWeb: z.boolean(),
  clarification: z.string().nullable(),
  mapSearch: z.object({
    businessName: z.string().max(160).nullable().optional(),
    landmark: z.string().max(160).nullable(),
    landmarkType: z.enum(['park','train_station','shopping_mall','hospital']).nullable(),
    placeType: z.enum(['pharmacy','restaurant','cafe','supermarket','hospital','gas_station','lodging','car_repair','bakery','dentist','veterinary_care','atm','hair_salon','hair_care','barber_shop','beauty_salon','nail_salon','plumber','electrician','locksmith','florist','laundry']),
    query: z.string().min(2).max(180),
  }).nullable().optional(),
  // Literal location text, not a model-invented address or normalized alias.
  destination: z.object({
    city: z.string().max(100),
    source: z.enum(["question", "context", "profile"]),
    clarificationReason: z.enum(["none", "confirm_city", "ambiguous_place", "missing_detail"]),
  }).optional(),
});
export type ConciergeRequest = z.infer<typeof RequestSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Segment = { text: string; sources: { title: string; url: string }[] };
export type ConciergeResult = {
  placeNotes?: Record<string, {description?:string;review?:{text:string;author:string;authorUrl?:string;avatar?:string;url:string;date?:string;visit?:string}} >;
  mapData?: boolean;
  nextSteps?: NextSteps;
  answerId?: string;
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
  if (input.shared || input.photo || input.context.length || input.question.length > 240) return null;
  const q = input.question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!process.env.GOOGLE_MAPS_API_KEY && input.city.trim() && !/\b(in|din|la|near|around|langa|zona)\b/.test(q) && /\b(plumber|handyman|restaurant|restaurants|cafe|cafes|electrician|instalator|restaurante|cafenea)\b/.test(q)) {
    return { goal: input.question, category: "local", needsWeb: true, clarification: null };
  }
  // Restrict the no-search shortcut to ordinary ingredient-only requests.
  const recipe = q.match(/^(?:what can i cook with|ce pot gati cu) (.+?)[?.!]?$/);
  if (recipe && /^(?:(?:rice|chickpeas|eggs|pasta|potatoes|tomatoes|onions|carrots|beans|lentils|spinach|cheese|orez|naut|oua|paste|cartofi|rosii|ceapa|morcovi|fasole|linte|spanac|branza|and|si|,|\s)+)$/.test(recipe[1])) {
    return { goal: input.question, category: "recipe", needsWeb: false, clarification: null };
  }
  return null;
}

// Only accept an explicit override if its literal text occurs in user-authored
// input. The model cannot use a previous assistant guess as destination evidence.
export function resolveDestination(input: ConciergeRequest, plan: Plan): ConciergeRequest {
  const destination = plan.destination;
  if (!destination || destination.source === 'profile' || !destination.city.trim()) return input;
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const city = normalize(destination.city);
  const userText = destination.source === 'question' ? input.question : input.context.map(turn => turn.match(/^User: ([\s\S]*?)\nArea at the time:/)?.[1] || '').join(' ');
  if (!city || !(` ${normalize(userText)} `).includes(` ${city} `)) return input;
  // A different saved city is never a reason to ask permission to search.
  // Preserve genuine ambiguity and missing task details.
  if (destination.clarificationReason === 'confirm_city') plan.clarification = null;
  return { ...input, city: destination.city, deviceLocation: undefined };
}
