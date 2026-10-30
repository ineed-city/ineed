/* eslint-disable @typescript-eslint/no-require-imports -- Test actual modules with provider substitutes. */
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function load(file,mocks={}){const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(js,{module:mod,exports:mod.exports,require:name=>name in mocks?mocks[name]:require(name),URL,AbortSignal,Date,process:{env:{}}});return mod.exports;}
const videos=load('lib/concierge/videos.ts');
const id='AbCdEfGhI12';const url=`https://www.youtube.com/watch?v=${id}`;
test('accepts only canonical YouTube video IDs, never lookalike hosts or arbitrary endpoints',()=>{
 for(const value of [url,`https://youtu.be/${id}?t=12`,`https://www.youtube.com/shorts/${id}`])assert.equal(videos.youtubeId(value),id);
 for(const value of ['https://youtube.com.evil.example/watch?v='+id,'https://youtube.com@evil.example/watch?v='+id,'http://www.youtube.com/watch?v='+id,'https://www.youtube.com/results?search_query=rice','https://www.youtube.com/watch?v=bad','https://127.0.0.1/'+id,`https://youtu.be/${id}/extra`])assert.equal(videos.youtubeId(value),null);
});
test('verification fetches fixed oEmbed endpoints, deduplicates and returns at most two verified cards',async()=>{
 const calls=[];const result=await videos.verifyVideos([url,url,'https://evil.example/video','https://youtu.be/BbCdEfGhI12','https://youtu.be/CbCdEfGhI12'],async(endpoint,options)=>{calls.push({endpoint,options});return {ok:true,json:async()=>({type:'video',provider_name:'YouTube',title:'Rice technique',author_name:'Kitchen channel',author_url:'https://www.youtube.com/@kitchen',html:'<script>evil</script>'})};});
 assert.equal(calls.length,3);assert.equal(result.length,2);assert.equal(result[0].title,'Rice technique');assert.equal(result[0].html,undefined);
 for(const call of calls){assert.equal(new URL(call.endpoint).hostname,'www.youtube.com');assert.equal(new URL(call.endpoint).pathname,'/oembed');assert.equal(call.options.redirect,'error');}
});
test('deleted, failed and malformed videos do not replace a valid result',async()=>{
 let n=0;const result=await videos.verifyVideos([url,'https://youtu.be/BbCdEfGhI12','https://youtu.be/CbCdEfGhI12','https://youtu.be/DbCdEfGhI12'],async()=>{n++;if(n===1)throw Error('timeout');if(n===2)return {ok:false};if(n===3)return {ok:true,json:async()=>({title:'wrong provider'})};return {ok:true,json:async()=>({type:'video',provider_name:'YouTube',title:'Available video',author_name:'Creator',author_url:'https://evil.example'})};});
 assert.equal(result.length,1);assert.equal(result[0].title,'Available video');assert.equal(result[0].channelUrl,undefined);
});
function action(authenticated=true){let calls=0,sent,verified;const mod=load('app/video-actions.ts',{
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:'viewer'}:null}})}})},
 '@/lib/ai/anthropic':{ANSWER_MODEL:'test',anthropic:{beta:{messages:{create:async params=>{calls++;sent=params;return {stop_reason:'end_turn',content:[{type:'text',text:'Suggested video',citations:[{type:'web_search_result_location',url}]}]};}}}}},
 '@/lib/concierge/videos':{...videos,verifyVideos:async urls=>{verified=urls;return [];}}
 });return {...mod,get calls(){return calls;},get sent(){return sent;},get verified(){return verified;}};}
test('video action requires authentication and validates input before paid searches',async()=>{
 const a=action(false);assert.equal((await a.findVideos({query:'rice technique',language:'en'})).reason,'auth');assert.equal(a.calls,0);
 const b=action();assert.equal((await b.findVideos({query:'x'.repeat(181),language:'en'})).ok,false);assert.equal(b.calls,0);
});
test('video request forwards only short topic and language, and verifies cited URLs',async()=>{
 const a=action();await a.findVideos({query:'rice technique',language:'en',photo:'private',context:['private'],deviceLocation:{latitude:1,longitude:2}});
 assert.deepEqual(JSON.parse(a.sent.messages[0].content),{query:'rice technique',language:'en'});
 assert.equal(a.sent.tools[0].max_uses,2);assert.equal(a.verified[0],url);
 for(let i=1;i<15;i++)await a.findVideos({query:'rice technique',language:'en'});
 assert.equal((await a.findVideos({query:'rice technique',language:'en'})).reason,'limit');assert.equal(a.calls,15);
});
test('video next steps survive validation and history without storing search results',()=>{
 const steps=load('lib/concierge/next-steps.ts');const groups=[{title:'Rice',actions:[{type:'video',label:'Watch a video',query:'rice pilaf cooking technique'}]}];
 assert.equal(steps.verifiedSteps({groups},[])[0].actions[0].type,'video');
 const history=load('lib/concierge/history.ts',{'./next-steps':steps,'./contracts':{safeSourceUrl:()=>true}});
 const saved=history.SavedTurnSchema.parse({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',question:'How to cook rice?',city:'',language:'en',hadPhoto:false,result:{status:'answered',segments:[],nextSteps:groups,videos:[{title:'Do not store'}]}});
 assert.equal(saved.result.nextSteps[0].actions[0].query,'rice pilaf cooking technique');assert.equal(saved.result.videos,undefined);
});

test('video panel loads once on demand and creates a non-autoplay player only after a click',async()=>{
 const slots=[];let cursor=0,calls=0;const effects=[];
 const react={startTransition:f=>f(),useEffect:f=>effects.push(f),useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=v;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
 const panel=load('app/video-results.tsx',{react,'./ui/icons':{Icon:'Icon'},'./video-actions':{findVideos:async()=>{calls++;return {ok:true,videos:[{id,url,title:'Rice tutorial',channel:'Kitchen'}]};}}});
 const render=()=>{cursor=0;return panel.VideoResults({query:'rice pilaf',ro:false});};
 function find(tree,type){if(!tree||typeof tree!=='object')return null;if(tree.type===type)return tree;for(const child of [tree.props?.children].flat(Infinity)){const match=find(child,type);if(match)return match;}return null;}
 assert.equal(find(render(),'iframe'),null);assert.equal(calls,0);
 effects[0]()();effects[0]();await new Promise(resolve=>setImmediate(resolve));
 let tree=render();assert.equal(calls,1);assert.equal(find(tree,'iframe'),null);
 find(tree,'button').props.onClick();tree=render();const frame=find(tree,'iframe');
 assert.equal(new URL(frame.props.src).hostname,'www.youtube-nocookie.com');assert.equal(new URL(frame.props.src).searchParams.get('autoplay'),'0');
});
