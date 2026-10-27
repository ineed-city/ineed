import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Clientul Claude. Citește ANTHROPIC_API_KEY din variabilele de mediu
// (Vercel → Secret). Tot ce ține de furnizorul AI stă în lib/ai/.
export const anthropic = new Anthropic();

export const MODEL = "claude-opus-5-5";
