"use server";
import { askConcierge as run } from "@/lib/concierge/service";
export async function askConcierge(raw: unknown) { return run(raw); }
