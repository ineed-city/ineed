import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Clientul Claude. Citește ANTHROPIC_API_KEY din variabilele de mediu
// (Vercel → Secret). Tot ce ține de furnizorul AI stă în lib/ai/.
export const anthropic = new Anthropic();

// Modelul implicit pentru răspunsuri (se poate schimba prin CONCIERGE_MODEL).
export const ANSWER_MODEL = "claude-haiku-5-5";
