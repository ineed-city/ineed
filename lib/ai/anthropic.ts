import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Clientul Claude. Citește ANTHROPIC_API_KEY din variabilele de mediu
// (Vercel → Secret). Tot ce ține de furnizorul AI stă în lib/ai/.
export const anthropic = new Anthropic();

// Găsirea unui link PDF e o sarcină simplă: modelul cel mai ieftin ajunge.
export const DISCOVERY_MODEL = "claude-haiku-5-5";

// Răspunsurile din manuale: Haiku, cu manualele în cache între întrebări.
export const ANSWER_MODEL = "claude-haiku-5-5";
