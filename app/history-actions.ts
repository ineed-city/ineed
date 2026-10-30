"use server";
import * as session from "@/lib/concierge/session";
export async function listChats(offset=0) { return session.listChats(offset); }
export async function loadChat(id:string) { return session.loadChat(id); }
export async function saveChatTurn(raw:unknown) { return session.saveChatTurn(raw); }
export async function askSavedConcierge(raw:unknown, identity:unknown) { return session.askSavedConcierge(raw,identity); }
