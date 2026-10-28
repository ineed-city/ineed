"use client";

import { useEffect, useRef, useState } from "react";
import { CameraDialog } from "./camera-dialog";
import { preparePhoto } from "@/lib/concierge/photo";
import { SettingsMenu } from "./settings-menu";
import { savePreferences } from "./preference-actions";
import { Icon } from "./ui/icons";
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

  const exampleLabels = ro ? ["Ajutor acasă", "Ce gătesc?", "Unde ieșim?"] : ["Help at home", "Something to cook", "Somewhere to go"];

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

  return <div lang={language} className="concierge-shell">
    <header className="concierge-header">
      <Brand />
      <button type="button" aria-label={ro ? "Deschide meniul" : "Open menu"} aria-expanded={menuOpen} aria-controls="settings-menu" disabled={pending || preparingPhoto} onClick={() => setMenuOpen(true)} className="icon-button menu-button"><Icon name="menu" /></button>
    </header>
    {menuOpen && <SettingsMenu language={language} city={city} email={email} isAdmin={isAdmin} onClose={() => setMenuOpen(false)} onSave={updatePreferences} />}
    <main className={`concierge-main ${result || pending ? "has-answer" : ""}`}>
      <div className="concierge-intro"><ConciergeMark />
      <p className="concierge-eyebrow">{ro ? "Concierge-ul tău de zi cu zi" : "Your everyday concierge"}</p>
      <h1 className="concierge-title">{ro ? "Orice îți trebuie." : "Whatever you need."}</h1>
      <p className="concierge-subtitle">{ro ? "Spune-ne ce cauți. Găsim următorul pas." : "Tell us what you need. Find your next step."}</p></div>
      <section className="concierge-workspace">
    {cameraOpen && <CameraDialog ro={ro} onClose={() => setCameraOpen(false)} onCapture={file => {void attachPhoto(file);}} />}
    {(!locationConfigured || city) && <button type="button" disabled={pending || preparingPhoto} onClick={() => setMenuOpen(true)} className="location-chip"><Icon name="pin" /><span>{city || (ro ? "Alege zona ta" : "Set your area")}</span><Icon name="chevron" /></button>}
    <form onSubmit={submit} className="need-composer">
      <label htmlFor="need" className="sr-only">{ro ? "De ce ai nevoie?" : "What do you need?"}</label>
      <textarea id="need" ref={input} value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} minLength={2} required rows={3} disabled={pending || preparingPhoto} placeholder={photo ? (ro ? "Ce vrei să afli despre această poză?" : "What would you like to know about this photo?") : context.length ? (ro ? "Adaugă detalii sau o întrebare…" : "Add details or ask a follow-up…") : (ro ? "Am nevoie de…" : "I need…")} className="need-input" />
      {photoError && <p role="alert" className="mb-3 text-xs text-red-800">{photoError}</p>}
      {photo && <div className="mb-3 flex items-center gap-3 text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element -- local compressed preview, no remote image */}
        <img src={photo} alt={ro ? "Poza atașată" : "Attached photo"} className="h-24 w-24 rounded-lg object-contain bg-tile" />
        <p className="flex-1 text-muted">{ro ? "Poza va fi trimisă cu această întrebare și următoarele până o elimini. Nu este salvată de INeed." : "This photo is sent with this question and follow-ups until removed. INeed does not save it."}</p>
        <button type="button" disabled={pending || preparingPhoto} onClick={removePhoto} className="text-brand underline">{ro ? "Elimină poza" : "Remove photo"}</button>
      </div>}
      <div className="composer-toolbar">
        <div className="photo-actions">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => {const file = e.target.files?.[0]; e.target.value = ""; void attachPhoto(file);}} />
          <button type="button" disabled={pending || preparingPhoto} onClick={() => fileInput.current?.click()} className="composer-tool" title={ro ? "Adaugă o poză" : "Add a photo"}><Icon name="photo" /><span>{ro ? "Poză" : "Photo"}</span></button>
          <button type="button" disabled={pending || preparingPhoto} onClick={() => setCameraOpen(true)} className="composer-tool" title={ro ? "Fă o poză" : "Take a photo"}><Icon name="camera" /><span>{ro ? "Cameră" : "Camera"}</span></button>
        </div>
        <button disabled={pending || preparingPhoto || question.trim().length < 2} type="submit" aria-label={pending ? (ro ? "Se pregătește răspunsul" : "Preparing your answer") : (ro ? "Trimite cererea" : "Send request")} className="send-button">{pending ? <span className="loading-spinner" /> : <Icon name="arrow" />}</button>
      </div>
      {preparingPhoto && <p role="status" className="text-xs text-muted">{ro ? "Pregătesc poza…" : "Preparing photo…"}</p>}
    </form>
    <p className="composer-privacy">{ro ? "Cererea și poza sunt procesate de Claude. Confidențialitate în meniu." : "Your request and photo are processed by Claude. Privacy details in the menu."}</p>
    <div role="status" aria-live="polite" aria-busy={pending} className={pending || result ? "answer-region" : ""}>
      {pending && <p className="answer-loading">{elapsed >= 10 ? (ro ? "Încă lucrez. Verificarea surselor web poate dura mai mult." : "Still working. Checking web sources can take longer.") : (ro ? "Pregătesc răspunsul…" : "Preparing your answer…")} <span aria-hidden="true">{elapsed}s</span></p>}
      {!pending && result && <article className="answer-card">
        <div className="answer-label"><ConciergeMark /><span>{ro ? "Pentru tine" : "For you"}</span></div>
        {result.message && <p className={result.status === "error" ? "text-red-800" : "mb-3 font-medium"}>{result.message}</p>}
        {result.segments.map((segment, index) => <span key={index} className="whitespace-pre-wrap">{segment.text.replace(/\*\*/g, "")}{segment.sources.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title} className="source-link">{new URL(source.url).hostname.replace(/^www\./, "")}</a>)}</span>)}
        {result.status === "answered" && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{result.searched ? (ro ? "Surse web consultate pentru acest răspuns. Confirmă prețul și disponibilitatea direct." : "Web sources consulted for this answer. Confirm prices and availability directly.") : (ro ? "Sugestie AI; fără căutare web pentru acest răspuns." : "AI-generated guidance; no web search used for this answer.")}</p>}
        {result.plan && <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">{ro ? "Cum a înțeles INeed" : "How INeed understood this"}</summary><p className="mt-2">{result.plan.goal}</p><p>{ro ? "Acesta este un rezumat al cererii, nu raționamentul intern al AI." : "This is a task brief, not the AI’s internal reasoning."}</p></details>}
      </article>}
    </div>
    {!context.length && !pending && <div className="suggestions">{examples.map((example, index) => <button key={example} title={example} onClick={() => {setQuestion(example);input.current?.focus();}} className="suggestion"><Icon name={index === 0 ? "home" : index === 1 ? "cook" : "place"} />{exampleLabels[index]}</button>)}</div>}
    {!!context.length && !pending && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
      <button disabled={preparingPhoto} onClick={() => {setQuestion("");removePhoto();input.current?.focus();}} className="text-brand underline">{ro ? "O cerere nouă" : "Start a new request"}</button>
      {result?.status === "answered" && <button className="text-brand underline" onClick={() => { const text = JSON.stringify({ context, city, result, feedback: "Add your feedback here / Scrie feedback aici" }, null, 2); const url = URL.createObjectURL(new Blob([text], {type:"text/plain"})); const a = document.createElement("a"); a.href=url;a.download="ineed-test-feedback.txt";a.click();URL.revokeObjectURL(url);setFeedback(ro ? "Descărcat. Adaugă observațiile și trimite organizatorului testului." : "Downloaded. Add your comments and share with the pilot organiser."); }}>{ro ? "Descarcă testul pentru feedback" : "Download this test for feedback"}</button>}
      {feedback && <p role="status" className="w-full text-muted">{feedback}</p>}
    </div>}
      </section>
    </main>
    <footer className="concierge-footer">{ro ? "Versiune de test · AI poate greși. Verifică sursele." : "Private pilot · AI can be mistaken. Check sources."}</footer>
  </div>;
}
