import type { ResponseEvent, SavedResponse } from './progress';

export async function askStreamingConcierge(request:unknown,identity:unknown,onEvent:(event:ResponseEvent)=>void):Promise<SavedResponse> {
  const response=await fetch('/api/concierge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request,identity}),signal:AbortSignal.timeout(115_000)});
  if(!response.ok || !response.body) throw new Error('Request failed');
  const reader=response.body.getReader();
  const decoder=new TextDecoder(); let buffer=''; let result:SavedResponse|undefined;
  try {
    for(;;){
      const {value,done}=await reader.read();
      buffer+=decoder.decode(value,{stream:!done});
      let end;
      while((end=buffer.indexOf('\n'))!==-1){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
        if(!line.trim())continue;
        const event:ResponseEvent=JSON.parse(line);
        if(event.type==='error')throw new Error('Request failed');
        onEvent(event);
        if(event.type==='done')result=event.response;
      }
      if(done)break;
    }
    if(!result)throw new Error('Incomplete response');
    return result;
  } finally {reader.releaseLock();}
}
