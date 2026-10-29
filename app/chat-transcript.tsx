import { NextSteps } from './next-steps';
import type { NextAction } from '@/lib/concierge/next-steps';
import type { SavedTurn } from '@/lib/concierge/history';
import { safeSourceUrl } from '@/lib/concierge/contracts';

export function ChatTranscript({turns,ro,disabled,onAction}:{turns:SavedTurn[];ro:boolean;disabled:boolean;onAction:(action:NextAction,title:string,question:string)=>void}) {
  if(!turns.length) return null;
  return <section aria-label={ro?'Mesaje anterioare':'Earlier messages'} className="chat-transcript">
    {turns.map(turn=><article key={turn.id} className="chat-turn">
      <p className="chat-question whitespace-pre-wrap break-words">{turn.question}</p>
      {turn.hadPhoto&&<p className="text-xs text-muted">{ro?'Poză nesalvată · atașeaz-o din nou pentru detalii vizuale.':'Photo not saved · reattach it for visual details.'}</p>}
      {turn.shared&&(turn.shared.text||turn.shared.url)&&<details className="my-2 text-xs text-muted"><summary>{ro?'Context atașat':'Attached context'}</summary><p className="whitespace-pre-wrap break-words">{turn.shared.text}</p>{turn.shared.url&&<a href={safeSourceUrl(turn.shared.url)||undefined} target="_blank" rel="noopener noreferrer" className="underline break-all">{turn.shared.url}</a>}</details>}
      <div className="answer-card mt-3">
        {turn.result.message&&<p className="mb-2 whitespace-pre-wrap">{turn.result.message}</p>}
        {turn.result.segments.map((segment,index)=><span key={index} className="whitespace-pre-wrap break-words">{segment.text.replace(/\*\*/g,'')}{segment.sources.map((source,i)=><a key={i} href={safeSourceUrl(source.url)||undefined} target="_blank" rel="noopener noreferrer" className="source-link">{source.title}</a>)}</span>)}
        <NextSteps groups={turn.result.nextSteps} ro={ro} disabled={disabled} onAction={(action,title)=>onAction(action,title,turn.question)}/>
      </div>
    </article>)}
  </section>;
}
