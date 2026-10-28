"use client";

import { useRef, useState } from "react";
import { askConcierge } from "./concierge-actions";
import type { ConciergeResult } from "@/lib/concierge/contracts";

export function ConciergeBox() {
  const [language, setLanguage] = useState<"en" | "ro">("en");
  const [city, setCity] = useState("Bucharest, Romania");
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState<string[]>([]);
  const [result, setResult] = useState<ConciergeResult | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const ro = language === "ro";
  const examples = ro ? ["Am nevoie de un instalator pentru un robinet care curge", "Ce pot găti cu orez și năut?", "Un restaurant liniștit pentru cină"] : ["I need a plumber for a leaking tap", "What can I cook with rice and chickpeas?", "A quiet restaurant for dinner"];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || question.trim().length < 2) return;
    setPending(true); setFeedback("");
    try {
      const answer = await askConcierge({ question: question.trim(), city, language, context });
      setResult(answer);
      if (answer.status !== "error") {
        const reply = answer.status === "clarify" ? answer.message : answer.segments.map(s => s.text).join("");
        setContext(previous => [...previous, `User: ${question.trim()}\nPrevious response (recheck current facts): ${(reply || "").slice(0, 1800)}`.slice(0, 4000)].slice(-4));
        setQuestion("");
      }
    } catch {
      setResult({ status: "error", segments: [], message: ro ? "Conexiunea s-a întrerupt. Încearcă din nou." : "Connection interrupted. Please try again." });
    } finally { setPending(false); }
  }

  return <section lang={language} className="w-full text-left">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
      <label>{ro ? "Zona de căutare" : "Search area"} <input aria-label={ro ? "Oraș" : "City"} value={city} maxLength={100} disabled={pending} onChange={e => setCity(e.target.value)} className="ml-2 w-40 rounded-lg border border-line bg-transparent px-2 py-1.5 text-ink" /></label>
      <label><span className="sr-only">Language</span><select aria-label="Language" value={language} disabled={pending} onChange={e => setLanguage(e.target.value as "en" | "ro")} className="rounded-lg border border-line bg-transparent p-1.5"><option value="en">English</option><option value="ro">Română</option></select></label>
    </div>
    <form onSubmit={submit} className="rounded-[22px] border border-line bg-white p-5 shadow-sm">
      <label htmlFor="need" className="sr-only">{ro ? "De ce ai nevoie?" : "What do you need?"}</label>
      <textarea id="need" ref={input} value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} minLength={2} required rows={3} disabled={pending} placeholder={context.length ? (ro ? "Adaugă detalii sau o întrebare…" : "Add details or ask a follow-up…") : (ro ? "Am nevoie de…" : "I need…")} className="w-full resize-none bg-transparent text-xl placeholder:text-muted focus:outline-none" />
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] text-muted">{ro ? "Răspunsuri scurte. Surse când contează." : "Short answers. Sources where they matter."}</span>
        <button disabled={pending || question.trim().length < 2} type="submit" className="rounded-xl bg-brand px-5 py-2.5 text-sm text-white disabled:opacity-50">{pending ? (ro ? "Lucrez…" : "Working…") : (ro ? "Ajută-mă ↑" : "Help me ↑")}</button>
      </div>
    </form>
    <p className="mt-2 text-[11px] text-muted">{ro ? "Cererea și orașul sunt trimise la Claude pentru răspuns și, când e nevoie, căutare web. Nu introduce date sensibile. Nu contactăm și nu rezervăm în locul tău." : "Your request and city go to Claude for an answer and web search when needed. Leave out sensitive details. We don’t contact or book on your behalf."}</p>
    <div role="status" aria-live="polite" aria-busy={pending} className="mt-6">
      {pending && <p className="text-center text-sm text-sage">{ro ? "Înțeleg cererea și verific informațiile necesare…" : "Understanding your request and checking what’s needed…"}</p>}
      {!pending && result && <article className="rounded-[22px] border border-line bg-white p-5 text-sm leading-relaxed">
        {result.message && <p className={result.status === "error" ? "text-red-800" : "mb-3 font-medium"}>{result.message}</p>}
        {result.segments.map((segment, index) => <span key={index} className="whitespace-pre-wrap">{segment.text.replace(/\*\*/g, "")}{segment.sources.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title} className="mx-1 inline-block rounded bg-tile px-1.5 text-xs text-brand underline">{new URL(source.url).hostname.replace(/^www\./, "")}</a>)}</span>)}
        {result.status === "answered" && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{result.searched ? (ro ? "Surse web consultate pentru acest răspuns. Confirmă prețul și disponibilitatea direct." : "Web sources consulted for this answer. Confirm prices and availability directly.") : (ro ? "Sugestie AI; fără căutare web pentru acest răspuns." : "AI-generated guidance; no web search used for this answer.")}</p>}
        {result.plan && <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">{ro ? "Cum a înțeles INeed" : "How INeed understood this"}</summary><p className="mt-2">{result.plan.goal}</p><p>{ro ? "Acesta este un rezumat al cererii, nu raționamentul intern al AI." : "This is a task brief, not the AI’s internal reasoning."}</p></details>}
      </article>}
    </div>
    {!context.length && !pending && <div className="mt-6 flex flex-wrap justify-center gap-2">{examples.map(example => <button key={example} onClick={() => {setQuestion(example);input.current?.focus();}} className="rounded-full border border-line px-3 py-2 text-xs text-sage hover:bg-tile">{example}</button>)}</div>}
    {!!context.length && !pending && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
      <button onClick={() => {setQuestion("");setContext([]);setResult(null);setFeedback("");input.current?.focus();}} className="text-brand underline">{ro ? "O cerere nouă" : "Start a new request"}</button>
      {result?.status === "answered" && <button className="text-brand underline" onClick={() => { const text = JSON.stringify({ context, city, result, feedback: "Add your feedback here / Scrie feedback aici" }, null, 2); const url = URL.createObjectURL(new Blob([text], {type:"text/plain"})); const a = document.createElement("a"); a.href=url;a.download="ineed-test-feedback.txt";a.click();URL.revokeObjectURL(url);setFeedback(ro ? "Descărcat. Adaugă observațiile și trimite organizatorului testului." : "Downloaded. Add your comments and share with the pilot organiser."); }}>{ro ? "Descarcă testul pentru feedback" : "Download this test for feedback"}</button>}
      {feedback && <p role="status" className="w-full text-muted">{feedback}</p>}
    </div>}
  </section>;
}
