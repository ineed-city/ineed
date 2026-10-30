import { askSavedConcierge } from '@/lib/concierge/session';
import type { ResponseEvent } from '@/lib/concierge/progress';

export const maxDuration = 120;

export async function POST(request:Request) {
  // Cookie-authenticated endpoint: unlike Server Actions, Route Handlers need
  // an explicit same-origin check before any paid generation or persistence.
  if(request.headers.get('origin')!==new URL(request.url).origin) return new Response('Forbidden',{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json')) return new Response('Invalid request',{status:415});
  if(Number(request.headers.get('content-length'))>800_000) return new Response('Too large',{status:413});
  const reader=request.body?.getReader();
  if(!reader) return new Response('Invalid request',{status:400});
  let size=0; const chunks:Uint8Array[]=[];
  for(;;) {const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>800_000){await reader.cancel();return new Response('Too large',{status:413});}chunks.push(part.value);}
  let payload;
  try {payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {return new Response('Invalid JSON',{status:400});}
  const encoder=new TextEncoder();
  let connected=true; const started=Date.now();let firstVisible=false;
  const stream=new ReadableStream<Uint8Array>({
    async start(controller) {
      const send=(event:ResponseEvent)=>{if(!firstVisible&&(event.type==='draft'||event.type==='answer')){firstVisible=true;console.info('concierge first visible',JSON.stringify({ms:Date.now()-started}));}if(connected)controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));};
      try {
        const response=await askSavedConcierge(payload.request,payload.identity,send,answer=>send({type:'answer',answer}));
        send({type:'done',response});
      } catch {send({type:'error'});}
      finally {if(connected)controller.close();}
    },
    // Finish the bounded server request and save even if a tab disconnects.
    cancel(){connected=false;},
  });
  return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
}
