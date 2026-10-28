"use client";

import { useEffect, useRef, useState } from "react";
import { CameraDialog } from "./camera-dialog";
import { preparePhoto } from "@/lib/concierge/photo";
import { SettingsMenu } from "./settings-menu";
import { savePreferences } from "./preference-actions";
import { Brand, ConciergeMark } from "./ui/brand";
import { askConcierge } from "./concierge-actions";
import type { ConciergeResult } from "@/lib/concierge/contracts";

export function ConciergeBox({ initial, email, isAdmin }: { initial: { language: "en" | "ro"; city: string; locationConfigured: boolean }; email: string; isAdmin: boolean }) {
  const [language, setLanguage] = useState(initial.language);
  const [city, setCity] = useState(initial.city);
  const [locationConfigured, setLocationConfigured] = useState(initial.locationConfigured);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const [photo, setPhoto] = useState<string | undefined>();
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState<string[]>([]);
  const [result, setResult] = useState<ConciergeResult | null>(null);
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);
  const [feedback, setFeedback] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const ro = language === "ro";
  const examples = ro ? ["Am nevoie de un instalator pentru un robinet care curge", "Ce pot găti cu orez și năut?", "Un restaurant liniștit pentru cină"] : ["I need a plumber for a leaking tap", "What can I cook with rice and chickpeas?", "A quiet restaurant for dinner"];

  async function updatePreferences(patch: { city?: string; language?: "en" | "ro" }) {
    const saved = await savePreferences(patch).catch(() => ({ok:false}));
    if (!saved.ok) return false;
    if (patch.city !== undefined) {setCity(patch.city); setLocationConfigured(true);}
    if (patch.language !== undefined) setLanguage(patch.language);
    setContext([]); setResult(null); setFeedback(""); setPhotoError("");
    return true;
  }

  function removePhoto() {
    setPhoto(undefined); setPhotoError(""); setContext([]); setResult(null); setFeedback("");
  }

  async function attachPhoto(file: File | undefined) {
    if (!file || pending || preparingPhoto) return;
    setPreparingPhoto(true); setPhotoError("");
    try {
      const image = await preparePhoto(file);
      setPhoto(image); setContext([]); setResult(null); setFeedback("");
    } catch {
      setPhotoError(ro ? "Nu am putut încărca poza. Alege un JPEG, PNG sau WebP de maximum 15 MB." : "Couldn’t load that photo. Choose a JPEG, PNG or WebP up to 15 MB.");
    } finally { setPreparingPhoto(false); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || preparingPhoto || question.trim().length < 2) return;
    setElapsed(0); setPending(true); setFeedback("");
    try {
      const answer = await askConcierge({ question: question.trim(), city, language, context, ...(photo ? { photo } : {}) });
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

  return <div lang={language} className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 sm:px-8">
    <header className="flex items-center justify-between py-6">
      <Brand />
      <button type="button" aria-label={ro ? "Deschide meniul" : "Open menu"} aria-expanded={menuOpen} aria-controls="settings-menu" disabled={pending || preparingPhoto} onClick={() => setMenuOpen(true)} className="rounded-xl border border-line p-3 text-brand hover:bg-tile disabled:opacity-50"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
    </header>
    {menuOpen && <SettingsMenu language={language} city={city} email={email} isAdmin={isAdmin} onClose={() => setMenuOpen(false)} onSave={updatePreferences} />}
    <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center gap-5 py-12 text-center sm:py-16">
      <ConciergeMark />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[1.9px] text-muted">{ro ? "Mai puțin căutat. Mai mult trăit." : "Less searching. More living."}</p>
      <h1 className="text-5xl font-medium leading-[1.13] tracking-[-2px] sm:text-[61px] sm:tracking-[-3px]">{ro ? "Orice îți trebuie." : "Whatever you need."}</h1>
      <p className="text-[15px] text-muted">{ro ? "Un răspuns util. Opțiunile potrivite. Următorul pas." : "One useful answer. The right options. Your next step."}</p>
      <section className="mt-3 w-full text-left">
    {cameraOpen && <CameraDialog ro={ro} onClose={() => setCameraOpen(false)} onCapture={file => {void attachPhoto(file);}} />}
    {(!locationConfigured || city) && <button type="button" disabled={pending || preparingPhoto} onClick={() => setMenuOpen(true)} className="mb-3 text-xs text-muted underline">{city ? `${ro ? "Zona" : "Area"}: ${city}` : (ro ? "Alege locația o singură dată pentru recomandări în apropiere" : "Set your location once for nearby recommendations")}</button>}
    <form onSubmit={submit} className="rounded-[22px] border border-line bg-white p-5 shadow-sm">
      <label htmlFor="need" className="sr-only">{ro ? "De ce ai nevoie?" : "What do you need?"}</label>
      <textarea id="need" ref={input} value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} minLength={2} required rows={3} disabled={pending || preparingPhoto} placeholder={photo ? (ro ? "Ce vrei să afli despre această poză?" : "What would you like to know about this photo?") : context.length ? (ro ? "Adaugă detalii sau o întrebare…" : "Add details or ask a follow-up…") : (ro ? "Am nevoie de…" : "I need…")} className="w-full resize-none bg-transparent text-xl placeholder:text-muted focus:outline-none" />
      <div className="my-3 flex flex-wrap items-center gap-2 text-xs">
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => {const file = e.target.files?.[0]; e.target.value = ""; void attachPhoto(file);}} />
        <button type="button" disabled={pending || preparingPhoto} onClick={() => fileInput.current?.click()} className="rounded-lg border border-line px-3 py-2 text-brand disabled:opacity-50">{ro ? "Adaugă o poză" : "Add a photo"}</button>
        <button type="button" disabled={pending || preparingPhoto} onClick={() => setCameraOpen(true)} className="rounded-lg border border-line px-3 py-2 text-brand disabled:opacity-50">{ro ? "Fă o poză" : "Take a photo"}</button>
        {preparingPhoto && <span role="status">{ro ? "Pregătesc poza…" : "Preparing photo…"}</span>}
      </div>
      {photoError && <p role="alert" className="mb-3 text-xs text-red-800">{photoError}</p>}
      {photo && <div className="mb-3 flex items-center gap-3 text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element -- local compressed preview, no remote image */}
        <img src={photo} alt={ro ? "Poza atașată" : "Attached photo"} className="h-24 w-24 rounded-lg object-contain bg-tile" />
        <p className="flex-1 text-muted">{ro ? "Poza va fi trimisă cu această întrebare și următoarele până o elimini. Nu este salvată de INeed." : "This photo is sent with this question and follow-ups until removed. INeed does not save it."}</p>
        <button type="button" disabled={pending || preparingPhoto} onClick={removePhoto} className="text-brand underline">{ro ? "Elimină poza" : "Remove photo"}</button>
      </div>}
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] text-muted">{ro ? "Răspunsuri scurte. Surse când contează." : "Short answers. Sources where they matter."}</span>
        <button disabled={pending || preparingPhoto || question.trim().length < 2} type="submit" className="rounded-xl bg-brand px-5 py-2.5 text-sm text-white disabled:opacity-50">{pending ? (ro ? "Lucrez…" : "Working…") : (ro ? "Ajută-mă ↑" : "Help me ↑")}</button>
      </div>
    </form>
    <p className="mt-2 text-[11px] text-muted">{ro ? "Cererea și poza sunt procesate de Claude. Detalii în meniu → Confidențialitate." : "Your request and photo are processed by Claude. Details in menu → Privacy."}</p>
    <div role="status" aria-live="polite" aria-busy={pending} className="mt-6">
      {pending && <p className="text-center text-sm text-sage">{elapsed >= 10 ? (ro ? "Încă lucrez. Verificarea surselor web poate dura mai mult." : "Still working. Checking web sources can take longer.") : (ro ? "Pregătesc răspunsul…" : "Preparing your answer…")} <span aria-hidden="true">{elapsed}s</span></p>}
      {!pending && result && <article className="rounded-[22px] border border-line bg-white p-5 text-sm leading-relaxed">
        {result.message && <p className={result.status === "error" ? "text-red-800" : "mb-3 font-medium"}>{result.message}</p>}
        {result.segments.map((segment, index) => <span key={index} className="whitespace-pre-wrap">{segment.text.replace(/\*\*/g, "")}{segment.sources.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title} className="mx-1 inline-block rounded bg-tile px-1.5 text-xs text-brand underline">{new URL(source.url).hostname.replace(/^www\./, "")}</a>)}</span>)}
        {result.status === "answered" && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{result.searched ? (ro ? "Surse web consultate pentru acest răspuns. Confirmă prețul și disponibilitatea direct." : "Web sources consulted for this answer. Confirm prices and availability directly.") : (ro ? "Sugestie AI; fără căutare web pentru acest răspuns." : "AI-generated guidance; no web search used for this answer.")}</p>}
        {result.plan && <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">{ro ? "Cum a înțeles INeed" : "How INeed understood this"}</summary><p className="mt-2">{result.plan.goal}</p><p>{ro ? "Acesta este un rezumat al cererii, nu raționamentul intern al AI." : "This is a task brief, not the AI’s internal reasoning."}</p></details>}
      </article>}
    </div>
    {!context.length && !pending && <div className="mt-6 flex flex-wrap justify-center gap-2">{examples.map(example => <button key={example} onClick={() => {setQuestion(example);input.current?.focus();}} className="rounded-full border border-line px-3 py-2 text-xs text-sage hover:bg-tile">{example}</button>)}</div>}
    {!!context.length && !pending && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
      <button disabled={preparingPhoto} onClick={() => {setQuestion("");removePhoto();input.current?.focus();}} className="text-brand underline">{ro ? "O cerere nouă" : "Start a new request"}</button>
      {result?.status === "answered" && <button className="text-brand underline" onClick={() => { const text = JSON.stringify({ context, city, result, feedback: "Add your feedback here / Scrie feedback aici" }, null, 2); const url = URL.createObjectURL(new Blob([text], {type:"text/plain"})); const a = document.createElement("a"); a.href=url;a.download="ineed-test-feedback.txt";a.click();URL.revokeObjectURL(url);setFeedback(ro ? "Descărcat. Adaugă observațiile și trimite organizatorului testului." : "Downloaded. Add your comments and share with the pilot organiser."); }}>{ro ? "Descarcă testul pentru feedback" : "Download this test for feedback"}</button>}
      {feedback && <p role="status" className="w-full text-muted">{feedback}</p>}
    </div>}
      </section>
    </main>
    <footer className="py-6 text-[11px] text-muted">{ro ? "Versiune de test · AI poate greși. Verifică sursele." : "Private pilot · AI can be mistaken. Check sources."}</footer>
  </div>;
}
