import { z } from 'zod';

export const VideoRequestSchema=z.object({query:z.string().trim().min(3).max(180),language:z.enum(['ro','en'])});
export type VideoResult={id:string;url:string;title:string;channel:string;channelUrl?:string};
export type VideoResponse={ok:true;videos:VideoResult[]}|{ok:false;reason:'auth'|'limit'|'unavailable'};

// Never fetch a model-provided URL. Extract an ID from an exact YouTube host,
// then construct both the metadata request and the player URL ourselves.
export function youtubeId(value:string):string|null {
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    let id:string|null=null;
    if(u.hostname==='youtu.be')id=u.pathname.slice(1);
    else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)) {
      if(u.pathname==='/watch')id=u.searchParams.get('v');
      else id=u.pathname.match(/^\/(?:shorts|embed)\/([\w-]{11})$/)?.[1]||null;
    }
    return id&&/^[\w-]{11}$/.test(id)?id:null;
  } catch {return null;}
}
const MetadataSchema=z.object({type:z.literal('video'),provider_name:z.literal('YouTube'),title:z.string().min(1).max(500),author_name:z.string().min(1).max(200),author_url:z.string().optional()});
export async function verifyVideos(urls:string[],fetcher:typeof fetch=fetch):Promise<VideoResult[]> {
  const ids=[...new Set(urls.map(youtubeId).filter((id):id is string=>Boolean(id)))].slice(0,4);
  const results=await Promise.allSettled(ids.map(async id=>{
    const url=`https://www.youtube.com/watch?v=${id}`;
    const metadata=await fetcher(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,{signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'});
    if(!metadata.ok)return null;
    const parsed=MetadataSchema.safeParse(await metadata.json());
    if(!parsed.success)return null;
    const m=parsed.data;
    let channelUrl:string|undefined;
    try {const u=new URL(m.author_url||'');if(u.protocol==='https:'&&['www.youtube.com','youtube.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port)channelUrl=u.href;}catch{}
    return {id,url,title:m.title,channel:m.author_name,...(channelUrl?{channelUrl}:{})};
  }));
  return results.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]).slice(0,2);
}
