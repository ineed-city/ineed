"use client";

import { useEffect, useRef, useState } from "react";
import { HistoryDialog } from "./history-dialog";
import { ChatTranscript } from "./chat-transcript";
import { saveChatTurn, askSavedConcierge } from "./history-actions";
import { chatContext, MAX_CHAT_TURNS, type SavedTurn, type SavedChat } from "@/lib/concierge/history";
import { FeedbackDialog } from "./answer-feedback";
import { NextSteps, ActionPanel, ActiveTimer } from "./next-steps";
import type { NextAction } from "@/lib/concierge/next-steps";
import { PhotoOptions } from "./photo-options";
import { CameraDialog } from "./camera-dialog";
import { preparePhoto } from "@/lib/concierge/photo";
import { useLiveLocation } from "./use-live-location";
import { SettingsMenu } from "./settings-menu";
import { savePreferences } from "./preference-actions";
import { Icon } from "./ui/icons";
import { Brand, ConciergeMark } from "./ui/brand";
import type { ConciergeResult } from "@/lib/concierge/contracts";

export function ConciergeBox({ initial, email, isAdmin }: { initial: { language: "en" | "ro"; city: string; locationConfigured: boolean; firstName: string }; email: string; isAdmin: boolean }) {
  const [activeAction,setActiveAction] = useState<{action:NextAction;title:string}|null>(null);
  const [activeTimer,setActiveTimer] = useState<{end:number;label:string}|null>(null);
  const liveLocation = useLiveLocation(email);
  const [language, setLanguage] = useState(initial.language);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [city, setCity] = useState(initial.city);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const [photo, setPhoto] = useState<string | undefined>();
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [photoOptionsOpen, setPhotoOptionsOpen] = useState(false);
  const photoButton = useRef<HTMLButtonElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<SavedTurn[]>([]);
  const context = chatContext(turns);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatVersion, setChatVersion] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [unsaved, setUnsaved] = useState<SavedTurn | null>(null);
  const [saveIssue, setSaveIssue] = useState<"" | "failed" | "conflict">("");
  const [saving, setSaving] = useState(false);
  useEffect(()=>{
    if(!unsaved&&!saving) return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[unsaved,saving]);
  const [result, setResult] = useState<ConciergeResult | null>(null);
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedText, setSharedText] = useState("");
  const [sharedUrl, setSharedUrl] = useState("");
  const [answeredQuestion, setAnsweredQuestion] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const ro = language === "ro";
  const examples = ro ? ["Am nevoie de un instalator pentru un robinet care curge", "Ce pot găti cu orez și năut?", "Un restaurant liniștit pentru cină"] : ["I need a plumber for a leaking tap", "What can I cook with rice and chickpeas?", "A quiet restaurant for dinner"];

  const exampleLabels = ro ? ["Ajutor acasă", "Ce gătesc?", "Unde ieșim?"] : ["Help at home", "Something to cook", "Somewhere to go"];

  async function updatePreferences(patch: { firstName?: string; city?: string; language?: "en" | "ro" }) {
    const saved = await savePreferences(patch).catch(() => ({ok:false}));
    if (!saved.ok) return false;
    if (patch.city !== undefined) {liveLocation.disable(); setCity(patch.city);}
    if (patch.firstName !== undefined) setFirstName(patch.firstName);
    if (patch.language !== undefined) setLanguage(patch.language);
     setPhotoError("");
    return true;
  }

  function runAction(action:NextAction,title:string,sourceQuestion:string) {
    if(action.type==='followup') {
      if(question.trim() && !window.confirm(ro?'Înlocuiești întrebarea netrimisă?':'Replace the unsent question?')) return;
      setQuestion(`${action.prompt}\n${ro?'Referitor la':'Regarding'}: ${title}. ${sourceQuestion}`.slice(0,2000));
      input.current?.focus();input.current?.scrollIntoView({block:'center',behavior:'smooth'});
    } else setActiveAction({action,title});
  }
  function removePhoto() {
    setPhoto(undefined); setPhotoError("");
  }

  async function attachPhoto(file: File | undefined) {
    if (!file || pending || saving || preparingPhoto) return;
    setPreparingPhoto(true); setPhotoError("");
    try {
      const image = await preparePhoto(file);
      setPhoto(image);
    } catch {
      setPhotoError(ro ? "Nu am putut încărca poza. Alege un JPEG, PNG sau WebP de maximum 15 MB." : "Couldn’t load that photo. Choose a JPEG, PNG or WebP up to 15 MB.");
    } finally { setPreparingPhoto(false); }
  }

  function canLeave() {
    if(pending || saving) return false;
    return !(unsaved || question.trim() || photo || sharedText !== (turns.at(-1)?.shared?.text || "") || sharedUrl !== (turns.at(-1)?.shared?.url || "")) || window.confirm(ro ? "Părăsești conversația? Textul netrimis, poza sau răspunsul nesalvat se vor pierde din această filă." : "Leave this conversation? Any unsent text, photo or unsaved answer will be discarded from this tab.");
  }
  function startNew() {
    if (!canLeave()) return;
    setTurns([]);setChatId(null);setChatVersion(0);setUnsaved(null);setSaveIssue("");
    setQuestion("");setResult(null);setPhoto(undefined);setPhotoError("");
    setSharedText("");setSharedUrl("");setShareOpen(false);setHistoryOpen(false);setMenuOpen(false);
    input.current?.focus();
  }
  function openConversation(chat:SavedChat) {
    if(!canLeave()) return;
    const last=chat.turns.at(-1);
    setTurns(chat.turns);setChatId(chat.id);setChatVersion(chat.version);setUnsaved(null);setSaveIssue("");
    setResult(last?.result||null);setAnsweredQuestion(last?.question||"");setQuestion("");
    setPhoto(undefined);setPhotoError("");setSharedText(last?.shared?.text||"");setSharedUrl(last?.shared?.url||"");
    setShareOpen(Boolean(last?.shared?.text||last?.shared?.url));setHistoryOpen(false);
    input.current?.focus();
  }
  async function persist(id:string,version:number,turn:SavedTurn) {
    setSaving(true);
    const saved=await saveChatTurn({id,version,turn}).catch(()=>({ok:false as const,conflict:false}));
    if(saved.ok){setChatVersion(saved.version);setUnsaved(null);setSaveIssue("");}
    else {setUnsaved(turn);setSaveIssue(saved.conflict?"conflict":"failed");}
    setSaving(false);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || saving || unsaved || preparingPhoto || turns.length>=MAX_CHAT_TURNS || question.trim().length < 2) return;
    setElapsed(0); setPending(true);
    const asked=question.trim();
    try {
      const requestCity = liveLocation.enabled ? await liveLocation.refresh() : city;
      const id=chatId||crypto.randomUUID();
      const response = await askSavedConcierge({ question: asked, city: requestCity, language, context, ...(shareOpen ? { shared: {text:sharedText.trim(), url:sharedUrl.trim()} } : {}), ...(photo ? { photo } : {}) }, {id,version:chatVersion,turnId:crypto.randomUUID()});
      const {answer}=response;
      setResult(answer); setAnsweredQuestion(asked);
      if (response.turn && response.saved) {
        const turn:SavedTurn=response.turn;
        setChatId(id);setTurns(previous=>[...previous,turn]);setQuestion("");
        if(response.saved.ok){setChatVersion(response.saved.version);setUnsaved(null);setSaveIssue("");}
        else {setUnsaved(turn);setSaveIssue(response.saved.conflict?"conflict":"failed");}
      }
    } catch {
      setResult({ status: "error", segments: [], message: ro ? "Conexiunea s-a întrerupt. Încearcă din nou." : "Connection interrupted. Please try again." });
    } finally { setPending(false); }
  }

  return <div lang={language} className="concierge-shell">
    {activeAction&&<ActionPanel key={JSON.stringify(activeAction)} {...activeAction} ro={ro} onClose={()=>setActiveAction(null)} onStartTimer={(seconds,label)=>{if(activeTimer&&!window.confirm(ro?'Înlocuiești cronometrul curent?':'Replace the current timer?')) return;setActiveTimer({end:Date.now()+seconds*1000,label});}}/>}
    {activeTimer&&<ActiveTimer key={activeTimer.end} {...activeTimer} ro={ro} onStop={()=>setActiveTimer(null)}/>}
    <header className="concierge-header">
      <Brand />
      <button type="button" aria-label={ro ? "Deschide meniul" : "Open menu"} aria-expanded={menuOpen} aria-controls="settings-menu" disabled={pending || saving || preparingPhoto} onClick={() => setMenuOpen(true)} className="icon-button menu-button"><Icon name="menu" /></button>
    </header>
    {menuOpen && <SettingsMenu liveLocation={liveLocation} firstName={firstName} language={language} city={city} email={email} isAdmin={isAdmin} onClose={() => setMenuOpen(false)} onSave={updatePreferences} onHistory={()=>{setMenuOpen(false);setHistoryOpen(true);}} onNewChat={startNew} onAddContext={()=>{setMenuOpen(false);setShareOpen(true);input.current?.focus();}} />}
    {historyOpen && <HistoryDialog ro={ro} onClose={()=>setHistoryOpen(false)} onOpen={openConversation} onNew={startNew} />}
    {feedbackOpen && <FeedbackDialog onClose={()=>setFeedbackOpen(false)} language={language} report={result?.status === "answered" && result.answerId ? {answerId:result.answerId,question:answeredQuestion,answer:result.segments.map(s=>s.text).join("").slice(0,16000)} : null} />}
    <main className={`concierge-main ${result || pending ? "has-answer" : ""}`}>
      <div className="concierge-intro"><ConciergeMark />
      <p className="concierge-eyebrow">{ro ? "Ajutorul tău de zi cu zi" : "Your everyday helper"}</p>
      <h1 className="concierge-title">{ro ? "Orice îți trebuie." : "Whatever you need."}</h1>
      <p className="concierge-subtitle">{ro ? "Spune-ne ce cauți. Găsim următorul pas." : "Tell us what you need. Find your next step."}</p></div>
      <section className="concierge-workspace">
    {photoOptionsOpen && <PhotoOptions ro={ro} onClose={()=>{setPhotoOptionsOpen(false);photoButton.current?.focus();}} onCamera={()=>{setPhotoOptionsOpen(false);setCameraOpen(true);}} onUpload={()=>{setPhotoOptionsOpen(false);photoButton.current?.focus();fileInput.current?.click();}} />}
    {cameraOpen && <CameraDialog ro={ro} onClose={() => setCameraOpen(false)} onCapture={file => {void attachPhoto(file);}} />}

    {!!turns.length && <div className="mb-4 flex items-center justify-between gap-3 text-xs"><span className="text-muted">{ro ? "Conversație" : "Conversation"} · {turns[0].question.slice(0,65)}</span><button type="button" disabled={pending||saving} onClick={startNew} className="text-brand underline">{ro ? "Conversație nouă" : "New chat"}</button></div>}
    <ChatTranscript turns={result?.status === "error" ? turns : turns.slice(0,-1)} ro={ro} disabled={pending||saving||preparingPhoto} onAction={runAction}/>
    {turns.some(turn=>turn.hadPhoto)&&!photo&&<p className="mb-4 text-xs text-muted">{ro ? "Pozele anterioare nu sunt salvate. Atașează din nou poza dacă întrebarea depinde de ea." : "Earlier photos are not saved. Reattach the photo if your follow-up depends on it."}</p>}
    <form onSubmit={submit} className="need-composer">
      <label htmlFor="need" className="sr-only">{ro ? "De ce ai nevoie?" : "What do you need?"}</label>
      <textarea id="need" ref={input} value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} minLength={2} required rows={3} disabled={pending || saving || preparingPhoto} placeholder={photo ? (ro ? "Ce vrei să afli despre această poză?" : "What would you like to know about this photo?") : context.length ? (ro ? "Adaugă detalii sau o întrebare…" : "Add details or ask a follow-up…") : (ro ? "Am nevoie de…" : "I need…")} className="need-input" />
      {photoError && <p role="alert" className="mb-3 text-xs text-red-800">{photoError}</p>}
      {photo && <div className="mb-3 flex items-center gap-3 text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element -- local compressed preview, no remote image */}
        <img src={photo} alt={ro ? "Poza atașată" : "Attached photo"} className="h-24 w-24 rounded-lg object-contain bg-tile" />
        <p className="flex-1 text-muted">{ro ? "Poza va fi trimisă cu această întrebare și următoarele până o elimini. Nu este salvată de INeed." : "This photo is sent with this question and follow-ups until removed. INeed does not save it."}</p>
        <button type="button" disabled={pending || saving || preparingPhoto} onClick={removePhoto} className="text-brand underline">{ro ? "Elimină poza" : "Remove photo"}</button>
      </div>}
      {shareOpen && <section id="share-recommendation" className="share-panel">
        <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium">{ro ? "Adaugă context" : "Add context"}</h2><button type="button" disabled={pending} onClick={()=>{setShareOpen(false);setSharedText("");setSharedUrl("");}} className="text-xs underline">{ro ? "Elimină" : "Remove"}</button></div>
        <p className="text-xs text-muted">{ro ? "Adaugă o recomandare, o postare sau o captură de ecran cu butonul Poză. Scrie mai sus ce vrei să afli." : "Add a recommendation, post, or screenshot using Photo. Tell us above what you want to know."}</p>
        <label className="block text-xs">{ro ? "Link către sursă (opțional)" : "Source link (optional)"}<input type="url" value={sharedUrl} maxLength={2000} disabled={pending} onChange={e=>{setSharedUrl(e.target.value);}} placeholder="https://…" className="shared-input mt-2" /></label>
        <label className="block text-xs">{ro ? "Textul postării sau recomandării (opțional)" : "Post or recommendation text (optional)"}<textarea value={sharedText} maxLength={6000} rows={4} disabled={pending} onChange={e=>{setSharedText(e.target.value);}} className="shared-input mt-2" /></label>
        <p className="text-xs text-muted">{ro ? "Linkurile private pot fi inaccesibile. Copiază textul sau adaugă o captură, fără date personale inutile. Conținutul rămâne atașat pentru întrebările următoare până îl elimini; textul și linkul sunt salvate în istoricul conversației." : "Private links may be inaccessible. Paste text or add a screenshot, leaving out unnecessary personal details. Content stays attached for follow-ups until removed; text and links are saved in your chat history."}</p>
      </section>}
      <div className="composer-toolbar">
        <div className="photo-actions">
          <button type="button" disabled={pending || saving || preparingPhoto} aria-haspopup="dialog" onClick={()=>setFeedbackOpen(true)} className="composer-tool"><Icon name="message" /><span>Feedback</span></button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => {const file = e.target.files?.[0]; e.target.value = ""; void attachPhoto(file);}} />
          <button ref={photoButton} type="button" disabled={pending || saving || preparingPhoto} aria-haspopup="dialog" onClick={() => setPhotoOptionsOpen(true)} className="composer-tool" title={ro ? "Adaugă o poză" : "Add a photo"}><Icon name="photo" /><span>{ro ? "Poză" : "Photo"}</span></button>
          <button type="button" disabled={pending || saving || preparingPhoto} onClick={() => setMenuOpen(true)} className="composer-tool composer-location" title={liveLocation.enabled ? liveLocation.area || (ro ? "Locație automată indisponibilă" : "Automatic location unavailable") : city || (ro ? "Alege orașul" : "Choose city")} aria-label={ro ? "Schimbă locația" : "Change location"}><Icon name="pin" /><span>{liveLocation.enabled ? (liveLocation.status === "checking" ? "…" : liveLocation.area.split(',')[0] || (ro ? "Locație" : "Location")) : city.split(',')[0] || (ro ? "Oraș" : "City")}</span></button>
        </div>
        <button disabled={pending || saving || Boolean(unsaved) || turns.length>=MAX_CHAT_TURNS || preparingPhoto || question.trim().length < 2} type="submit" aria-label={pending ? (ro ? "Se pregătește răspunsul" : "Preparing your answer") : (ro ? "Trimite cererea" : "Send request")} className="send-button">{pending ? <span className="loading-spinner" /> : <Icon name="arrow" />}</button>
      </div>
      {preparingPhoto && <p role="status" className="text-xs text-muted">{ro ? "Pregătesc poza…" : "Preparing photo…"}</p>}
    </form>
    <p className="composer-privacy">{ro ? "Textul conversației și linkurile sunt salvate în Istoric. Pozele nu sunt salvate. Cererile sunt procesate de Claude." : "Chat text and links are saved to History. Photos are not saved. Requests are processed by Claude."}</p>
    {saveIssue && <div role="alert" className="my-4 text-sm text-red-800"><p>{saveIssue === "conflict" ? (ro ? "Conversația a fost modificată în altă filă. Acest răspuns nu a fost salvat. Copiază-l înainte să redeschizi conversația din Istoric." : "This chat changed in another tab. This answer was not saved. Copy it before reopening the conversation from History.") : (ro ? "Răspunsul nu a fost salvat în Istoric. Reîncearcă înainte să închizi pagina." : "This answer wasn’t saved to History. Retry before closing the page.")}</p>{saveIssue === "failed" && <button type="button" disabled={saving} onClick={()=>{if(chatId&&unsaved) void persist(chatId,chatVersion,unsaved);}} className="mt-2 underline">{saving ? (ro?"Se salvează…":"Saving…") : (ro?"Reîncearcă salvarea":"Retry saving")}</button>}</div>}
    {turns.length>=MAX_CHAT_TURNS&&<p className="my-4 text-sm">{ro ? "Această conversație a ajuns la 30 de răspunsuri. Începe una nouă pentru a continua." : "This conversation has reached 30 replies. Start a new chat to continue."}</p>}
    <div role="status" aria-live="polite" aria-busy={pending} className={pending || result ? "answer-region" : ""}>
      {pending && <p className="answer-loading">{elapsed >= 10 ? (ro ? "Încă lucrez. Verificarea surselor web poate dura mai mult." : "Still working. Checking web sources can take longer.") : (ro ? "Pregătesc răspunsul…" : "Preparing your answer…")} <span aria-hidden="true">{elapsed}s</span></p>}
      {!pending && result && <article className="answer-card">
        <p className="chat-question mb-4 whitespace-pre-wrap break-words">{answeredQuestion}</p>
        <div className="answer-label"><ConciergeMark /><span>{ro ? "Pentru tine" : "For you"}</span></div>
        {result.message && <p className={result.status === "error" ? "text-red-800" : "mb-3 font-medium"}>{result.message}</p>}
        {result.segments.map((segment, index) => <span key={index} className="whitespace-pre-wrap">{segment.text.replace(/\*\*/g, "")}{segment.sources.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title} className="source-link">{new URL(source.url).hostname.replace(/^www\./, "")}</a>)}</span>)}
        {result.status === "answered" && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{result.searched ? (ro ? "Surse web consultate pentru acest răspuns. Confirmă prețul și disponibilitatea direct." : "Web sources consulted for this answer. Confirm prices and availability directly.") : (ro ? "Sugestie AI; fără căutare web pentru acest răspuns." : "AI-generated guidance; no web search used for this answer.")}</p>}
        {result.status==='answered'&&<NextSteps groups={result.nextSteps} ro={ro} disabled={pending||saving||preparingPhoto} onAction={(action,title)=>runAction(action,title,answeredQuestion)}/>}
        {result.plan && <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">{ro ? "Cum a înțeles INeed" : "How INeed understood this"}</summary><p className="mt-2">{result.plan.goal}</p><p>{ro ? "Acesta este un rezumat al cererii, nu raționamentul intern al AI." : "This is a task brief, not the AI’s internal reasoning."}</p></details>}
        {result.status === "answered" && result.answerId && <button type="button" onClick={()=>setFeedbackOpen(true)} className="mt-4 text-xs text-brand underline">{ro ? "Lasă feedback" : "Leave feedback"}</button>}
      </article>}
    </div>
    {!context.length && !pending && <div className="suggestions">{examples.map((example, index) => <button key={example} title={example} onClick={() => {setQuestion(example);input.current?.focus();}} className="suggestion"><Icon name={index === 0 ? "home" : index === 1 ? "cook" : "place"} />{exampleLabels[index]}</button>)}</div>}
    {!!context.length && !pending && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
      <button disabled={pending || saving || preparingPhoto} onClick={startNew} className="text-brand underline">{ro ? "O cerere nouă" : "Start a new request"}</button>
    </div>}
      </section>
    </main>
    <footer className="concierge-footer">{ro ? "Versiune de test · AI poate greși. Verifică sursele." : "Private pilot · AI can be mistaken. Check sources."}</footer>
  </div>;
}
