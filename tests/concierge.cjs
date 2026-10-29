/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness loads compiled modules. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

// Execute the actual TypeScript modules with only external services substituted.
function load(file, mocks = {}, globals = {}) {
  const filename = path.join(__dirname, '..', file);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const testModule = {exports:{}};
  vm.runInNewContext(js, {module:testModule, exports:testModule.exports, require:name => name in mocks ? mocks[name] : require(name), URL, Date, AbortSignal, AbortController, setTimeout, clearTimeout, process:{env:{}}, console:{info(){}}, ...globals}, {filename});
  return testModule.exports;
}
const nextSteps = load('lib/concierge/next-steps.ts');
const localCorrections = load('lib/concierge/local-corrections.ts');
const contracts = load('lib/concierge/contracts.ts');
const request = {question:'Find somewhere for tonight',city:'Bucharest, Romania',language:'en',context:[]};
const plan = {goal:'Find dinner options',category:'local',needsWeb:true,clarification:null};
function service(responses, chosen = plan, globals = {}) {
  const calls=[]; const planning=[];
  const api={beta:{messages:{parse:async args=>{planning.push(args);return {parsed_output:chosen};},create:async args=>{calls.push(args);return responses.shift();}}}};
  const {answerNeed}=load('lib/concierge/answer.ts', {'server-only':{}, './maps':{mapAnswer:async()=>globals.mapResult || null}, './contracts':contracts, './next-steps':nextSteps, './local-corrections':{...localCorrections,reviewedLocalSources:(...args)=>localCorrections.reviewedLocalSources(...args, globals.reviewDate || new Date()),reviewedLocalAnswer:(...args)=>localCorrections.reviewedLocalAnswer(...args, globals.reviewDate || new Date())}, '@/lib/ai/anthropic':{anthropic:api,ANSWER_MODEL:'test'}, '@anthropic-ai/sdk/helpers/beta/zod':{betaZodOutputFormat:()=>({})}});
  return {answerNeed,calls,planning};
}
const cited={type:'text',text:'An option from an official site.',citations:[{type:'web_search_result_location',url:'https://example.com/menu',title:'Menu'}]};
const searched={type:'web_search_tool_result',content:[]};
test('rejects oversized inputs, invalid languages and excessive context',()=>{
  assert.equal(contracts.RequestSchema.safeParse(request).success,true);
  for(const change of [{question:' '},{question:'x'.repeat(2001)},{language:'xx'},{context:Array(31).fill('x')}]) assert.equal(contracts.RequestSchema.safeParse({...request,...change}).success,false);
});
test('citation links reject script schemes, credentials and local addresses',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,x','https://user:pass@example.com','http://127.0.0.1','http://localhost']) assert.equal(contracts.safeSourceUrl(url),null);
  assert.equal(contracts.safeSourceUrl('https://example.com/menu'),'https://example.com/menu');
});
test('clarification does not call paid answer generation',async()=>{
  const s=service([],{...plan,clarification:'Which city?'});
  const result=await s.answerNeed({...request,city:''});
  assert.equal(result.status,'clarify');assert.equal(s.calls.length,0);
});
test('local results require search and cite their source',async()=>{
  const s=service([{stop_reason:'end_turn',content:[searched,cited]}],{...plan,needsWeb:false});
  const result=await s.answerNeed(request);
  assert.equal(result.status,'answered');assert.equal(result.segments[0].sources[0].url,'https://example.com/menu');
  assert.equal(s.calls[0].tools[0].max_uses,2);
});
test('local answer without evidence is withheld',async()=>{
  const s=service([{stop_reason:'end_turn',content:[{type:'text',text:'Made-up plumber'}]}]);
  const result=await s.answerNeed(request);
  assert.equal(result.status,'error');assert.equal(result.segments.length,0);
});
test('search tool error cannot produce unverified recommendations',async()=>{
  const s=service([{stop_reason:'end_turn',content:[{type:'web_search_tool_result',content:{error_code:'unavailable'}},{type:'text',text:'Try this business'}]}]);
  assert.equal((await s.answerNeed(request)).status,'error');
});
test('recipe answer avoids web tools',async()=>{
  const s=service([{stop_reason:'end_turn',content:[{type:'text',text:'Cook the rice.'}]}],{...plan,category:'recipe',needsWeb:false});
  assert.equal((await s.answerNeed(request)).status,'answered');assert.equal(s.calls[0].tools.some(t=>t.name==='web_search'),false);
});
test('paused search preserves provider blocks and stops after three rounds',async()=>{
  const s=service([{stop_reason:'pause_turn',content:[searched]},{stop_reason:'end_turn',content:[cited]}]);
  assert.equal((await s.answerNeed(request)).status,'answered');assert.equal(s.calls.length,2);
  assert.equal(s.calls[1].messages[1].content[0],searched);
  const stuck=service([{stop_reason:'pause_turn',content:[]},{stop_reason:'pause_turn',content:[]},{stop_reason:'pause_turn',content:[]}]);
  await assert.rejects(stuck.answerNeed(request),/timed out/);assert.equal(stuck.calls.length,3);
});
test('truncated and refused answers are not presented as complete',async()=>{
  for(const stop_reason of ['max_tokens','refusal']) {
    const s=service([{stop_reason,content:[searched,cited]}]);
    await assert.rejects(s.answerNeed(request),/Incomplete/);
  }
});

const {detectArea}=load('lib/concierge/location.ts');
const fakeGeo=(coords)=>({getCurrentPosition(resolve){resolve({coords});}});
test('location returns only area names and rounds coordinates before lookup',async()=>{
  let sent;
  const area=await detectArea(fakeGeo({latitude:44.426789,longitude:26.102345,accuracy:50}),async(url,options)=>{
    sent={url,options};return {ok:true,json:async()=>({locality:'Sector 1',city:'Bucharest',principalSubdivision:'Bucharest',countryName:'Romania'})};
  });
  assert.equal(area,'Sector 1, Bucharest, Romania');
  assert.equal(new URL(sent.url).searchParams.get('latitude'),'44.427');
  assert.equal(new URL(sent.url).searchParams.get('longitude'),'26.102');
  assert.equal(sent.options.credentials,'omit');
});
test('denial or inaccurate location never calls external lookup',async()=>{
  const unexpected=async()=>{assert.fail('must not transmit location');};
  await assert.rejects(detectArea({getCurrentPosition(resolve,reject){reject({code:1});}},unexpected),/denied/);
  await assert.rejects(detectArea(fakeGeo({latitude:44,longitude:26,accuracy:50000}),unexpected),/inaccurate/);
  await assert.rejects(detectArea(undefined,unexpected),/unsupported/);
});
test('lookup failures do not silently choose another location',async()=>{
  const geo=fakeGeo({latitude:44,longitude:26,accuracy:10});
  await assert.rejects(detectArea(geo,async()=>({ok:false})),/lookup/);
  await assert.rejects(detectArea(geo,async()=>({ok:true,json:async()=>({countryName:'Romania'})})),/lookup/);
});

test('clear local requests skip planner but retain mandatory search evidence',async()=>{
  const s=service([{stop_reason:'end_turn',content:[searched,cited]}]);
  assert.equal((await s.answerNeed({...request,question:'I need a plumber'})).status,'answered');
  assert.equal(s.planning.length,0);assert.equal(s.calls.length,1);assert.equal(s.calls[0].tools[0].name,'web_search');
  const unverified=service([{stop_reason:'end_turn',content:[{type:'text',text:'An unverified plumber'}]}]);
  assert.equal((await unverified.answerNeed({...request,question:'I need a plumber'})).status,'error');
});
test('simple ingredient requests skip planner and web search',async()=>{
  for(const question of ['What can I cook with rice and chickpeas?','Ce pot găti cu orez și năut?']) {
    const s=service([{stop_reason:'end_turn',content:[{type:'text',text:'Recipe'}]}]);
    assert.equal((await s.answerNeed({...request,question})).status,'answered');
    assert.equal(s.planning.length,0);assert.equal(s.calls[0].tools.some(t=>t.name==='web_search'),false);
  }
});
test('ambiguous, missing-location, follow-up and nonstandard food requests keep planner',()=>{
  for(const change of [
    {question:'I need a plumber',city:''},
    {question:'I need a plumber',context:['Earlier request']},
    {question:'What can I cook with wild mushrooms?'},
    {question:'What can I cook with rice for a baby with allergies?'},
    {question:'Help me with something'},
  ]) assert.equal(contracts.quickPlan({...request,...change}),null);
});

const testPhoto='data:image/jpeg;base64,/9j/AAAA';
test('photo validation rejects oversized, malformed and non-JPEG payloads',()=>{
  assert.equal(contracts.RequestSchema.safeParse({...request,photo:testPhoto}).success,true);
  for(const photo of ['https://example.com/image.jpg','data:image/svg+xml;base64,AAAA','data:image/jpeg;base64,not-an-image',testPhoto+'A'.repeat(650000)]) {
    assert.equal(contracts.RequestSchema.safeParse({...request,photo}).success,false);
  }
});
test('vision receives image blocks in both calls, never base64 inside text',async()=>{
  const s=service([{stop_reason:'end_turn',content:[{type:'text',text:'A visible object'}]}],{...plan,category:'general',needsWeb:false});
  const input={...request,question:'What can I cook with rice and chickpeas?',photo:testPhoto};
  assert.equal(contracts.quickPlan(input),null);
  assert.equal((await s.answerNeed(input)).status,'answered');
  for(const call of [s.planning[0],s.calls[0]]) {
    const content=call.messages[0].content;
    assert.equal(content[0].type,'image');assert.equal(content[0].source.data,'/9j/AAAA');
    assert.equal(content[1].type,'text');assert.equal(content[1].text.includes('/9j/'),false);
    assert.equal(JSON.parse(content[1].text).question,input.question);
  }
});
test('photo preparation resizes locally and releases bitmap resources',async()=>{
  let closed=false; const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=>testPhoto};
  const photoModule=load('lib/concierge/photo.ts',{}, {createImageBitmap:async()=>({width:4000,height:3000,close(){closed=true;}}),document:{createElement:()=>canvas}});
  assert.equal(await photoModule.preparePhoto({type:'image/png',size:1000}),testPhoto);
  assert.equal(canvas.width,1280);assert.equal(canvas.height,960);assert.equal(closed,true);
  await assert.rejects(photoModule.preparePhoto({type:'image/svg+xml',size:10}),/format/);
  await assert.rejects(photoModule.preparePhoto({type:'image/jpeg',size:16000000}),/size/);
});
test('photo compression refuses payloads that would overflow the action body',async()=>{
  let closed=false;
  const photoModule=load('lib/concierge/photo.ts',{}, {createImageBitmap:async()=>({width:1280,height:1280,close(){closed=true;}}),document:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=>testPhoto+'A'.repeat(650000)})}});
  await assert.rejects(photoModule.preparePhoto({type:'image/jpeg',size:1000}),/size/);
  assert.equal(closed,true);
});

const camera=load('lib/concierge/camera.ts');
test('camera requests video only and stops tracks when closed',async()=>{
  let stopped=0;let constraints;let received;
  const stream={getTracks:()=>[{stop(){stopped++;}}]};
  const stop=camera.startCamera({getUserMedia:async c=>{constraints=c;return stream;}},s=>{received=s;},()=>assert.fail());
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(constraints.audio,false);assert.equal(received,stream);
  stop();stop();assert.equal(stopped,1);
});
test('closing before camera permission resolves stops the late stream',async()=>{
  let grant;let stopped=0;
  const stop=camera.startCamera({getUserMedia:()=>new Promise(resolve=>{grant=resolve;})},()=>assert.fail('closed preview must not receive a stream'),()=>assert.fail());
  stop();grant({getTracks:()=>[{stop(){stopped++;}}]});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,1);
});
test('camera denial and unsupported browsers expose errors',async()=>{
  let error;
  camera.startCamera(undefined,()=>assert.fail(),name=>{error=name;});assert.equal(error,'Unsupported');
  camera.startCamera({getUserMedia:async()=>{throw {name:'NotAllowedError'};}},()=>assert.fail(),name=>{error=name;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(error,'NotAllowedError');
});
test('camera capture rejects frames before video is ready',async()=>{
  await assert.rejects(camera.captureFrame({videoWidth:0,videoHeight:0,readyState:0}),/NotReady/);
});

const prefs=load('lib/concierge/preferences.ts');
test('account preferences accept only language and area, never account IDs or roles',()=>{
  for(const bad of [{language:'fr'},{city:'x'.repeat(101)},{role:'admin'},{city:'Paris',userId:'other'},{}]) assert.equal(prefs.PreferencePatch.safeParse(bad).success,false);
  const patch=prefs.PreferencePatch.parse({city:'  Paris, France  '});
  assert.equal(patch.city,'Paris, France');
  const meta=prefs.preferenceMetadata(patch);
  assert.equal(meta.ineed_city,'Paris, France');assert.equal(meta.ineed_location_configured,true);
  assert.equal('ineed_language' in meta,false);
});
test('clearing location stays configured and language survives account reload',()=>{
  const meta={ineed_language:'ro',...prefs.preferenceMetadata({city:''})};
  const result=prefs.readPreferences(meta);
  assert.equal(result.city,'');assert.equal(result.locationConfigured,true);assert.equal(result.language,'ro');
  assert.equal(prefs.readPreferences({ineed_language:'invalid'}).language,'en');
});
test('preference saves require an authenticated user and update only that account',async()=>{
  let writes=0;let stored;let authenticated=false;let fail=false;
  const {savePreferences}=load('app/preference-actions.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:'signed-in'}:null},error:null}),updateUser:async args=>{writes++;stored=args;return {error:fail?{}:null};}}})},
    '@/lib/concierge/preferences':prefs,'next/cache':{revalidatePath(){}},
  });
  assert.equal((await savePreferences({city:'Paris'})).ok,false);assert.equal(writes,0);
  authenticated=true;
  assert.equal((await savePreferences({language:'ro'})).ok,true);
  assert.equal(stored.data.ineed_language,'ro');assert.equal(Object.keys(stored.data).length,1);
  fail=true;assert.equal((await savePreferences({city:''})).ok,false);
});


test('a silent location prompt times out and late permission does not transmit coordinates', async()=>{
  let timeout, success, cleared = false;
  const {detectArea: detect}=load('lib/concierge/location.ts',{}, {setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{cleared=true;}});
  let calls=0;
  const result=detect({getCurrentPosition(resolve){success=resolve;}},async()=>{calls++;});
  timeout();
  await assert.rejects(result,/timeout/);
  success({coords:{latitude:44,longitude:26,accuracy:10}});
  assert.equal(calls,0);assert.equal(cleared,true);
});
test('cancelling location leaves manual entry safe from a late GPS result', async()=>{
  const controller=new AbortController();let success;let calls=0;
  const result=detectArea({getCurrentPosition(resolve){success=resolve;}},async()=>{calls++;},controller.signal);
  controller.abort();await assert.rejects(result,/cancelled/);
  success({coords:{latitude:44,longitude:26,accuracy:10}});
  assert.equal(calls,0);
});
test('location lookup works without AbortSignal.timeout',async()=>{
  const {detectArea: detect}=load('lib/concierge/location.ts',{}, {AbortSignal:{}});
  const result=await detect(fakeGeo({latitude:44,longitude:26,accuracy:10}),async()=>({ok:true,json:async()=>({city:'Bucharest',countryName:'Romania'})}));
  assert.equal(result,'Bucharest, Romania');
});

test('shared content is bounded and private or executable source URLs rejected',()=>{
  for (const shared of [{text:'x'.repeat(6001),url:''},{text:'post',url:'javascript:alert(1)'},{text:'post',url:'http://127.0.0.1/test'}]) assert.equal(contracts.RequestSchema.safeParse({...request,shared}).success,false);
  assert.equal(contracts.RequestSchema.safeParse({...request,shared:{text:'Recommended by a neighbour',url:'https://facebook.com/groups/example/posts/1'}}).success,true);
  assert.equal(contracts.quickPlan({...request,question:'I need a plumber',shared:{text:'A community recommendation',url:''}}),null);
});
test('shared link forces evidence search even when the planner suggests general guidance',async()=>{
  const s=service([{stop_reason:'end_turn',content:[searched,cited]}],{...plan,category:'general',needsWeb:false});
  const result=await s.answerNeed({...request,shared:{url:'https://facebook.com/groups/example',text:''}});
  assert.equal(result.status,'answered');assert.equal(s.calls[0].tools[0].name,'web_search');
  assert.match(s.calls[0].system,/never call its recommendations verified/);
});
test('unreadable shared link asks for text or a screenshot instead of inventing a recommendation',async()=>{
  const s=service([{stop_reason:'end_turn',content:[{type:'text',text:'Unverified claim'}]}]);
  const result=await s.answerNeed({...request,shared:{url:'https://facebook.com/groups/example',text:''}});
  assert.equal(result.status,'error');assert.match(result.message,/screenshot/);
});
const feedbackRules=load('lib/concierge/feedback.ts');
const feedbackReport={answerId:'550e8400-e29b-41d4-a716-446655440000',rating:'helpful',comment:'Useful',question:'How can I cook rice?',answer:'Simmer until cooked.',language:'en'};
test('feedback rejects malformed IDs, ratings and oversized reports',()=>{
  assert.equal(feedbackRules.FeedbackSchema.safeParse(feedbackReport).success,true);
  for (const change of [{answerId:'fake'},{rating:'bad'},{comment:'x'.repeat(1001)},{answer:'x'.repeat(16001)}]) assert.equal(feedbackRules.FeedbackSchema.safeParse({...feedbackReport,...change}).success,false);
});
test('feedback requires auth, uses authenticated ID and strips photos or posts',async()=>{
  let id=null, captured, dbError=null;
  const db={auth:{getClaims:async()=>({data:{claims:id?{sub:id}:null}})},from:()=>({upsert:async row=>{captured=row;return {error:dbError};}})};
  const {submitFeedback}=load('app/feedback-actions.ts',{'@/lib/supabase/server':{createClient:async()=>db},'@/lib/concierge/feedback':feedbackRules});
  assert.equal((await submitFeedback(feedbackReport)).ok,false);assert.equal(captured,undefined);
  id='authenticated-user';
  assert.equal((await submitFeedback({...feedbackReport,user_id:'another-user',photo:'private',shared:{text:'private'}})).ok,true);
  assert.equal(captured.user_id,id);assert.equal(captured.photo,undefined);assert.equal(captured.shared,undefined);
  dbError={code:'unavailable'};assert.equal((await submitFeedback(feedbackReport)).ok,false);
});

const historyRules=load('lib/concierge/history.ts',{'./contracts':contracts,'./next-steps':nextSteps});
const historyTurn={id:'550e8400-e29b-41d4-a716-446655440001',question:'Remember that my test project is called Cedar.',result:{status:'answered',answerId:'550e8400-e29b-41d4-a716-446655440002',segments:[{text:'Your test project is Cedar.',sources:[]}]},hadPhoto:false,city:'Bucharest',language:'en'};
const historyId='550e8400-e29b-41d4-a716-446655440003';
test('saved turns exclude raw photos and reject unsafe sources or error responses',()=>{
  const saved=historyRules.SavedTurnSchema.parse({...historyTurn,photo:'base64-secret',user_id:'other'});
  assert.equal(saved.photo,undefined);assert.equal(saved.user_id,undefined);
  assert.equal(historyRules.SavedTurnSchema.safeParse({...historyTurn,result:{status:'error',segments:[]}}).success,false);
  assert.equal(historyRules.SavedTurnSchema.safeParse({...historyTurn,result:{status:'answered',segments:[{text:'x',sources:[{title:'unsafe',url:'javascript:alert(1)'}]}]}}).success,false);
});
test('restored conversation context includes prior questions, answers and missing-photo reminder',()=>{
  const context=historyRules.chatContext([{...historyTurn,hadPhoto:true},historyTurn]);
  assert.match(context[0],/Cedar/);assert.match(context[0],/photo was attached/);
  assert.equal(context.length,2);
  assert.equal(contracts.RequestSchema.safeParse({...request,context}).success,true);
  assert.equal(historyRules.chatContext(Array(40).fill(historyTurn)).length,30);
  assert.ok(historyRules.chatContext([{...historyTurn,question:'q'.repeat(2000),result:{status:'answered',segments:[{text:'a'.repeat(20000),sources:[]}]}}])[0].length<=4000);
});
function historyActions(authId, response={data:[],error:null}) {
  const calls=[];
  const query={select(...args){calls.push(['select',...args]);return this;},eq(...args){calls.push(['eq',...args]);return this;},order(){return this;},range(){return Promise.resolve(response);},single(){return Promise.resolve(response);}};
  const db={auth:{getClaims:async()=>({data:{claims:authId?{sub:authId}:null}})},from:()=>query,rpc:async(name,params)=>{calls.push(['rpc',name,params]);return response;}};
  return {...load('app/history-actions.ts',{'@/lib/supabase/server':{createClient:async()=>db},'@/lib/concierge/history':historyRules,'@/lib/concierge/contracts':contracts,'./concierge-actions':{askConcierge:async()=>historyTurn.result}}),calls};
}
test('history read and write actions reject signed-out requests',async()=>{
  const h=historyActions(null);
  assert.equal((await h.listChats()).ok,false);
  assert.equal((await h.loadChat(historyId)).ok,false);
  assert.equal((await h.saveChatTurn({id:historyId,version:0,turn:historyTurn})).ok,false);
  assert.equal(h.calls.length,0);
});
test('history listing and opening always scope queries to the signed-in owner',async()=>{
  const h=historyActions('owner',{data:{id:historyId,title:'Cedar',version:1,updated_at:'2026-10-29T10:00:00Z',turns:[historyTurn]},error:null});
  assert.equal((await h.loadChat(historyId)).ok,true);
  assert.ok(h.calls.some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]==='owner'));
  const list=historyActions('owner');await list.listChats();assert.ok(list.calls.some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]==='owner'));
});
test('history writes use the versioned RPC and surface conflicts instead of overwriting',async()=>{
  const h=historyActions('owner',{data:1,error:null});
  assert.equal((await h.saveChatTurn({id:historyId,version:0,turn:{...historyTurn,photo:'private'}})).version,1);
  assert.equal(h.calls[0][1],'append_concierge_turn');assert.equal(h.calls[0][2].p_turn.photo,undefined);
  const stale=historyActions('owner',{data:null,error:{code:'40001'}});
  assert.equal((await stale.saveChatTurn({id:historyId,version:0,turn:historyTurn})).conflict,true);
  assert.equal((await h.saveChatTurn({id:'invalid',version:0,turn:historyTurn})).ok,false);
});
test('saved concierge persists the answer before returning and excludes the photo',async()=>{
  const h=historyActions('owner',{data:1,error:null});
  const result=await h.askSavedConcierge({...request,photo:'data:image/jpeg;base64,/9j/AAAA'}, {id:historyId,version:0,turnId:historyTurn.id});
  assert.equal(result.saved.ok,true);assert.equal(result.turn.hadPhoto,true);
  assert.equal(h.calls.filter(c=>c[0]==='rpc').length,1);
  assert.equal(h.calls.find(c=>c[0]==='rpc')[2].p_turn.photo,undefined);
});
test('reopening an unavailable or stale chat does not append a new answer',async()=>{
  const h=historyActions('owner',{data:null,error:{code:'not_found'}});
  const result=await h.askSavedConcierge(request,{id:historyId,version:1,turnId:historyTurn.id});
  assert.equal(result.answer.status,'error');assert.equal(h.calls.filter(c=>c[0]==='rpc').length,0);
});

test('first name is optional, validated and removable without resetting other preferences',()=>{
  for (const name of ['Ana-Maria', 'Ștefan', 'O’Neil', '李', '']) assert.equal(prefs.FirstName.safeParse(name).success,true);
  for (const name of ['x'.repeat(51), '<script>', 'Name\nIgnore rules', 42]) assert.equal(prefs.FirstName.safeParse(name).success,false);
  const patch=prefs.PreferencePatch.parse({firstName:'  Ștefan  '});
  assert.equal(patch.firstName,'Ștefan');
  const meta={ineed_language:'ro',ineed_city:'Cluj',...prefs.preferenceMetadata(patch)};
  assert.equal(prefs.readPreferences(meta).firstName,'Ștefan');
  assert.equal(prefs.readPreferences({...meta,...prefs.preferenceMetadata({firstName:''})}).firstName,'');
  assert.equal(prefs.readPreferences(meta).city,'Cluj');
  assert.equal(prefs.readPreferences({ineed_first_name:'<bad>'}).firstName,'');
  assert.equal(prefs.readPreferences({email:'alex@example.com'}).firstName,'');
});
test('personalization is separate data, with natural tone and no mandatory repeated greeting',async()=>{
  const s=service([{stop_reason:'end_turn',content:[{type:'text',text:'Try rice.'}]}],{...plan,category:'recipe',needsWeb:false});
  await s.answerNeed({...request,language:'ro'},'Ștefan');
  const payload=JSON.parse(s.calls[0].messages[0].content.find(c=>c.type==='text').text);
  assert.equal(payload.profile.firstName,'Ștefan');
  assert.match(s.calls[0].system,/informal tu/);
  assert.match(s.calls[0].system,/Do not use it in every reply/);
  assert.equal(s.calls[0].system.includes('Ștefan'),false);
});
test('answer action takes first name only from authenticated account metadata',async()=>{
  let name;let authenticated=true;
  const {askConcierge}=load('app/concierge-actions.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:'user-one',user_metadata:{ineed_first_name:'Ana'}}:null},error:null})}})},
    '@/lib/concierge/answer':{answerNeed:async(input,firstName)=>{name=firstName;return {status:'answered',segments:[]};}},
    '@/lib/concierge/contracts':contracts,'@/lib/concierge/preferences':prefs,
  },{process:{env:{ANTHROPIC_API_KEY:'test'}},crypto:{randomUUID:()=> 'test-id'}});
  assert.equal((await askConcierge(request)).status,'answered');assert.equal(name,'Ana');
  authenticated=false;name=undefined;
  assert.equal((await askConcierge(request)).status,'error');assert.equal(name,undefined);
});

const {createLiveLocation}=load('lib/concierge/live-location.ts',{}, {Error});
test('automatic location is opt-in, refreshes changed cities, and reuses only a fresh area',async()=>{
  let now=0,calls=0,area='Bucharest';
  const tracker=createLiveLocation(async()=>{calls++;return area;},()=>true,()=>now);
  assert.equal(await tracker.refresh(),'');assert.equal(calls,0);
  assert.equal(await tracker.enable(),'Bucharest');assert.equal(calls,1);
  now=59_999;area='Cluj';assert.equal(await tracker.refresh(),'Bucharest');assert.equal(calls,1);
  now=60_000;assert.equal(await tracker.refresh(),'Cluj');assert.equal(calls,2);
  tracker.disable();assert.equal(tracker.getSnapshot().area,'');assert.equal(await tracker.refresh(),'');assert.equal(calls,2);
});
test('turning automatic location off cancels in-flight updates and ignores a late result',async()=>{
  let resolve,signal;
  const tracker=createLiveLocation(s=>{signal=s;return new Promise(r=>{resolve=r;});},()=>true);
  const pending=tracker.enable();tracker.disable();
  assert.equal(signal.aborted,true);resolve('Old city');assert.equal(await pending,'');
  assert.equal(tracker.getSnapshot().enabled,false);assert.equal(tracker.getSnapshot().area,'');
});
test('hidden pages do not locate and resume requires a new fix',async()=>{
  let visible=true,calls=0;
  const tracker=createLiveLocation(async()=>{calls++;return 'Paris';},()=>visible);
  await tracker.enable();visible=false;tracker.pause();assert.equal(await tracker.refresh(),'');assert.equal(calls,1);
  assert.equal(tracker.getSnapshot().area,'');visible=true;assert.equal(await tracker.refresh(),'Paris');assert.equal(calls,2);
});
test('location denial clears old area and does not repeatedly prompt without a retry',async()=>{
  let now=0,calls=0,denied=false;
  const tracker=createLiveLocation(async()=>{calls++;if(denied)throw new Error('denied');return 'Paris';},()=>true,()=>now);
  await tracker.enable();denied=true;now=61_000;
  assert.equal(await tracker.refresh(),'');assert.equal(tracker.getSnapshot().status,'denied');assert.equal(tracker.getSnapshot().area,'');
  await tracker.refresh();assert.equal(calls,2);
  denied=false;assert.equal(await tracker.enable(),'Paris');assert.equal(calls,3);
});
test('automatic location coalesces concurrent refreshes and recovers from lookup failures',async()=>{
  let resolve,calls=0,fail=false,now=0;
  const tracker=createLiveLocation(()=>{calls++;return fail?Promise.reject(new Error('lookup')):new Promise(r=>{resolve=r;});},()=>true,()=>now);
  const first=tracker.enable(),second=tracker.refresh();resolve('Paris');
  assert.equal(await first,'Paris');assert.equal(await second,'Paris');assert.equal(calls,1);
  fail=true;now=61_000;assert.equal(await tracker.refresh(),'');assert.equal(tracker.getSnapshot().status,'unavailable');assert.equal(tracker.getSnapshot().area,'');
  fail=false;const retry=tracker.refresh();resolve('Lyon');assert.equal(await retry,'Lyon');
});


test('next steps reject dangerous links, unsupported capabilities and unbounded payloads',()=>{
  for(const url of ['javascript:alert(1)','https://127.0.0.1','http://example.com','https://user:pass@example.com','https://internal.local','https://example.com:8443']) assert.equal(nextSteps.publicLink(url),false);
  for(const action of [{type:'booking',label:'Book'}, {type:'timer',label:'Wait',seconds:-1},{type:'timer',label:'Wait',seconds:90000},{type:'call',label:'Call',phone:'123;456',sourceUrl:'https://example.com'}]) assert.equal(nextSteps.NextActionSchema.safeParse(action).success,false);
});
test('external action proposals require actual citation evidence',()=>{
  const source='https://example.com';
  const evidence=[{url:source,quote:'Bistro One at Bistro One, 10 Main Street, Paris. Call +33 1 23 45 67 89.'}];
  const groups=[{title:'Bistro One',actions:[{type:'maps',label:'Maps',destination:'Bistro One, 10 Main Street, Paris',sourceUrl:source},{type:'call',label:'Call',phone:'+33123456789',sourceUrl:source}]}];
  assert.equal(nextSteps.verifiedSteps({groups},evidence)[0].actions.length,2);
  assert.equal(nextSteps.verifiedSteps({groups},[]).length,0);
  groups[0].actions[1].phone='+33123456788';assert.equal(nextSteps.verifiedSteps({groups},evidence)[0].actions.length,1);
  groups[0].actions[0].sourceUrl='https://evil.example.com';assert.equal(nextSteps.verifiedSteps({groups},evidence).length,0);
});
test('recipe actions receive a complete final answer and survive saved history',async()=>{
  const groups=[{title:'Rice for two',actions:[{type:'checklist',label:'Shopping list',items:['150 g rice','300 ml water']},{type:'timer',label:'Simmer 10 minutes',seconds:600}]}];
  const s=service([{stop_reason:'tool_use',content:[{type:'text',text:'Simmer rice for 10 minutes.'},{type:'tool_use',id:'steps',name:'present_next_steps',input:{groups}}]},{stop_reason:'end_turn',content:[{type:'text',text:'Simmer rice for 10 minutes, then let it rest for 5 minutes.'}]}],{...plan,category:'recipe',needsWeb:false});
  const result=await s.answerNeed(request);
  assert.equal(result.nextSteps[0].actions[1].seconds,600);assert.equal(s.calls.length,2);assert.equal(result.segments[0].text,'Simmer rice for 10 minutes, then let it rest for 5 minutes.');assert.equal(s.calls[1].tool_choice.type,'none');
  const saved=historyRules.SavedTurnSchema.parse({...historyTurn,result});
  assert.equal(saved.result.nextSteps[0].actions[0].items.length,2);
});
test('malformed action metadata never replaces a valid answer',async()=>{
  const s=service([{stop_reason:'tool_use',content:[{type:'text',text:'Cook the rice.'},{type:'tool_use',id:'steps',name:'present_next_steps',input:{groups:[{bad:true}]}}]},{stop_reason:'end_turn',content:[{type:'text',text:'Cook the rice.'}]}],{...plan,category:'recipe',needsWeb:false});
  const result=await s.answerNeed(request);assert.equal(result.status,'answered');assert.equal(result.nextSteps.length,0);assert.equal(result.segments[0].text,'Cook the rice.');
});
test('a tool-only response gets one bounded continuation for the readable answer',async()=>{
  const s=service([{stop_reason:'tool_use',content:[{type:'tool_use',id:'steps',name:'present_next_steps',input:{groups:[{title:'Practice',actions:[{type:'followup',label:'Practice interview',prompt:'Ask me a practice interview question.'}]}]}}]},{stop_reason:'end_turn',content:[{type:'text',text:'Prepare two examples of your work.'}]}],{...plan,category:'general',needsWeb:false});
  const result=await s.answerNeed(request);assert.equal(result.status,'answered');assert.equal(result.nextSteps.length,1);assert.equal(s.calls.length,2);
});

test('local search preserves explicit destination and neighborhood through planning and answering',async()=>{
  const localPlan={goal:'Find a pharmacy in Riverside, Exampletown',category:'local',needsWeb:true,clarification:null};
  const s=service([{stop_reason:'end_turn',content:[searched,cited]}],localPlan);
  const result=await s.answerNeed({...request,question:'Where can I find a pharmacy in Riverside, Exampletown?',city:'Another city'});
  assert.equal(result.status,'answered');
  assert.match(s.planning[0].system,/explicit destination in the current question takes priority over the city field/);
  assert.match(s.planning[0].system,/Preserve every explicit city, neighborhood, street and landmark/);
  const system=s.calls[0].system;
  assert.match(system,/use the remaining search to check branch addresses/);
  assert.match(system,/Do not silently replace a neighborhood request with city-wide recommendations/);
  assert.match(system,/stock is unconfirmed, not that a shop does not sell the product/);
  assert.match(system,/Do not assume an ambiguous phrase/);
  assert.equal(s.calls[0].tools[0].max_uses,2);
  const payload=JSON.parse(s.calls[0].messages[0].content[0].text);
  assert.equal(payload.question,'Where can I find a pharmacy in Riverside, Exampletown?');
  assert.equal(payload.city,'Another city');
});

test('reviewed local corrections match the city, area and need, expire, and never use private context',()=>{
  const input={...request,question:'Caut o FARMACIE in zona Blocuri din Campia Turzii.',city:'Orsova'};
  const now=new Date('2026-10-29T12:00:00Z');
  const sources=localCorrections.reviewedLocalSources(input,plan,now);
  assert.equal(sources.length,2);assert.match(sources[0].content[0].text,/Barițiu nr.59/);
  for(const patch of [{question:'Caut restaurant in zona Blocuri din Campia Turzii'}, {question:'Caut farmacie in zona Blocuri din Turda',city:'Campia Turzii'}, {question:'Caut farmacie in centru Campia Turzii'}, {question:'Caut farmacie',context:[input.question]}, {shared:{text:input.question,url:''}}, {photo:'a photo'}]) {
    assert.equal(localCorrections.reviewedLocalSources({...input,...patch},plan,now).length,0);
  }
  assert.equal(localCorrections.reviewedLocalSources(input,{...plan,category:'general'},now).length,0);
  assert.equal(localCorrections.reviewedLocalSources(input,plan,new Date('2026-11-28')).length,0);
  assert.equal(localCorrections.reviewedLocalSources(input,plan,new Date('2026-10-28')).length,0);
});

test('reviewed sources reach the model and their citations support maps and calls',async()=>{
  const input={...request,question:'Verifica farmacia din zona Blocuri Campia Turzii'};
  const reviewDate=new Date('2026-10-29T12:00:00Z');
  const sources=localCorrections.reviewedLocalSources(input,plan,reviewDate);
  const title='Catena Gheorghe Baritiu 59';
  const destination='Str. Gheorghe Baritiu Nr. 59, Câmpia Turzii, 405100, Cluj';
  const groups=[{title,actions:[{type:'maps',label:'Hartă',destination,sourceUrl:sources[1].source},{type:'call',label:'Sună',phone:'+40755011335',sourceUrl:sources[1].source}]}];
  const response={stop_reason:'end_turn',content:[{type:'text',text:'Catena, la adresa indicată.',citations:[{type:'search_result_location',source:sources[1].source,search_result_index:1,start_block_index:0,end_block_index:1,cited_text:sources[1].content[0].text}]}]};
  const s=service([{stop_reason:'tool_use',content:[{type:'tool_use',id:'actions',name:'present_next_steps',input:{groups}}]},response],plan,{reviewDate});
  const result=await s.answerNeed(input);
  assert.equal(s.calls[0].messages[0].content.filter(b=>b.type==='search_result').length,2);
  assert.equal(result.status,'answered');assert.equal(result.searched,false);
  assert.equal(result.segments[0].sources[0].url,sources[1].source);
  assert.equal(result.nextSteps[0].actions.length,2);
});

test('model cannot turn arbitrary source citations into reviewed facts',async()=>{
  const reviewDate=new Date('2026-10-29T12:00:00Z');
  const s=service([{stop_reason:'end_turn',content:[{type:'text',text:'Fake listing',citations:[{type:'search_result_location',source:'https://fake.example',search_result_index:0,start_block_index:0,end_block_index:1,cited_text:'fake'}]}]}],plan,{reviewDate});
  const result=await s.answerNeed({...request,question:'Verifica farmacia din zona Blocuri Campia Turzii'});
  assert.equal(result.status,'error');
});


test('a resolved street follow-up retains the task destination instead of the device city',()=>{
  const input={...request,question:'Gheorghe Baritiu',city:'Orsova'};
  const resolved={...plan,goal:'Find a pharmacy on Gheorghe Baritiu in Campia Turzii for the same task'};
  const sources=localCorrections.reviewedLocalSources(input,resolved,new Date('2026-10-29T12:00:00Z'));
  assert.equal(sources.length,2);
  assert.equal(localCorrections.reviewedLocalSources(input,{...resolved,goal:'Find a pharmacy on Gheorghe Baritiu in Orsova'},new Date('2026-10-29T12:00:00Z')).length,0);
});


test('basic neighborhood lookup returns the reviewed branch with map and phone without answer generation',async()=>{
  const reviewDate=new Date('2026-10-29T12:00:00Z');
  const s=service([],plan,{reviewDate});
  const result=await s.answerNeed({...request,question:'Caut o farmacie in zona Blocuri din Campia Turzii. Ce optiuni am in acea zona?',language:'ro'});
  assert.equal(s.calls.length,0);assert.equal(result.status,'answered');assert.equal(result.searched,false);
  assert.match(result.segments[0].text,/Catena Gheorghe Baritiu 59/);
  assert.equal(result.nextSteps[0].actions[0].type,'maps');
  assert.equal(result.nextSteps[0].actions[1].phone,'+40755011335');
  assert.match(result.segments[0].sources[0].url,/catena.ro/);
});

test('reviewed directory does not substitute for hours, stock, access, distance, exclusions or medical advice',()=>{
  const now=new Date('2026-10-29T12:00:00Z');
  for(const ending of ['deschisa acum','cu rampa de acces','cu medicamentul X in stoc','nu Catena','cea mai apropiata','cu livrare','de garda']) {
    const result=localCorrections.reviewedLocalAnswer({...request,question:`Caut o farmacie in zona Blocuri Campia Turzii ${ending}`},plan,now);
    assert.equal(result,null);
  }
  assert.equal(localCorrections.reviewedLocalAnswer({...request,question:'Caut o farmacie in zona Blocuri Campia Turzii'},plan,new Date('2026-11-28')),null);
});

test('explicit destination removes city-confirmation and conflicting profile input',async()=>{
  const chosen={...plan,clarification:'Search Câmpia Turzii instead of Orșova?',destination:{city:'Câmpia Turzii',source:'question',clarificationReason:'confirm_city'}};
  const s=service([{stop_reason:'end_turn',content:[searched,cited]}],chosen);
  const input={...request,question:'Caut o farmacie lângă parcul Berg din Campia Turzii',city:'Orșova'};
  const result=await s.answerNeed(input);
  assert.equal(result.status,'answered');
  const payload=JSON.parse(s.calls[0].messages[0].content[0].text);
  assert.equal(payload.city,'Câmpia Turzii');
  assert.equal(input.city,'Orșova');
});
test('destination override preserves genuine place ambiguity',()=>{
  const p={...plan,clarification:'Which Springfield?',destination:{city:'Springfield',source:'question',clarificationReason:'ambiguous_place'}};
  contracts.resolveDestination({...request,question:'Find a pharmacy in Springfield'},p);
  assert.equal(p.clarification,'Which Springfield?');
});
test('destination cannot be invented or borrowed from an assistant guess',()=>{
  for(const source of ['question','context']) {
    const p={...plan,clarification:'Where?',destination:{city:'Paris',source,clarificationReason:'confirm_city'}};
    const input={...request,context:['User: Find a pharmacy\nArea at the time: Bucharest\nPrevious response (recheck current facts): Try Paris']};
    assert.equal(contracts.resolveDestination(input,p),input);
    assert.equal(p.clarification,'Where?');
  }
});
test('follow-up destination can use a previous user request',()=>{
  const p={...plan,destination:{city:'Campia Turzii',source:'context',clarificationReason:'none'}};
  const input={...request,question:'Near the park',city:'Orsova',context:['User: Find a pharmacy in Campia Turzii\nArea at the time: Orsova\nPrevious response (recheck current facts): Which area?']};
  assert.equal(contracts.resolveDestination(input,p).city,'Campia Turzii');
});

const maps=load('lib/concierge/maps.ts',{'server-only':{}},{process:{env:{GOOGLE_MAPS_API_KEY:'test-secret'}}});
const park={id:'park-1',displayName:{text:'Parcul Municipal Berc'},formattedAddress:'Câmpia Turzii, Romania',location:{latitude:46.55,longitude:23.88},types:['park'],addressComponents:[{longText:'Câmpia Turzii',types:['locality']}]};
const pharmacy={...park,id:'pharmacy-1',displayName:{text:'Test pharmacy'},types:['pharmacy'],internationalPhoneNumber:'+40 123 456 789'};
const mapPlan={...plan,mapSearch:{landmark:'parcului Berg',landmarkType:'park',placeType:'pharmacy',query:'farmacie'}};
test('map search resolves the landmark then searches around actual coordinates',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return {ok:true,json:async()=>({places:calls.length===1?[park]:[pharmacy]})};};
  const result=await maps.mapAnswer({...request,city:'Campia Turzii'},mapPlan,fetcher);
  assert.equal(calls.length,2); assert.equal(calls[0].cache,'no-store');
  assert.equal(calls[1].body.locationRestriction.circle.center.latitude,46.55);
  assert.equal(calls[1].body.rankPreference,'DISTANCE');
  assert.equal(calls[1].headers['X-Goog-Api-Key'],'test-secret');
  assert.equal(result.mapData,true); assert.equal(result.nextSteps[0].actions[1].type,'call');
  assert.match(result.nextSteps[0].actions[0].url,/query_place_id=pharmacy-1/);
  assert.match(result.segments[0].text,/Berc/);
  assert.ok(!JSON.stringify(calls).includes(request.question));
});
test('wrong city, wrong landmark type and ambiguous map matches stop nearby lookup',async()=>{
  for(const candidates of [[{...park,addressComponents:[{longText:'Orșova',types:['locality']}]}],[{...park,types:['factory']}],[park,{...park,id:'park-2'}],[]]) {
    let calls=0;
    const result=await maps.mapAnswer({...request,city:'Campia Turzii'},mapPlan,async()=>{calls++;return {ok:true,json:async()=>({places:candidates})};});
    assert.equal(result.status,'clarify');assert.equal(calls,1);
  }
});
test('map failure never fabricates a nearby result',async()=>{
  const result=await maps.mapAnswer({...request,city:'Campia Turzii'},mapPlan,async()=>({ok:false,status:403}));
  assert.equal(result.status,'error'); assert.equal(result.segments.length,0);
});
test('map adapter skips unavailable credentials and unsupported tasks',async()=>{
  const noKey=load('lib/concierge/maps.ts',{'server-only':{}},{fetch:()=>{throw Error('unexpected')}});
  assert.equal(await noKey.mapAnswer(request,mapPlan),null);
  assert.equal(await maps.mapAnswer(request,{...plan,mapSearch:null},()=>{throw Error('unexpected')}),null);
});
test('history strips Google listings and keeps a refresh action',()=>{
  const raw={id:'11111111-1111-4111-8111-111111111111',question:'Find a pharmacy by the park',city:'Campia Turzii',language:'en',hadPhoto:false,result:{status:'answered',mapData:true,segments:[{text:'Provider listing not to store',sources:[{title:'Google Maps',url:'https://www.google.com/maps'}]}],nextSteps:[{title:'Provider name',actions:[{type:'call',label:'Call',phone:'+40123456789',sourceUrl:'https://www.google.com/maps'}]}]}};
  const parsed=historyRules.SavedTurnSchema.parse(raw);
  assert.ok(!JSON.stringify(parsed).includes('Provider'));
  assert.ok(!JSON.stringify(parsed).includes('+40123456789'));
  assert.equal(parsed.result.nextSteps[0].actions[0].prompt,raw.question);
  assert.ok(!historyRules.chatContext([raw])[0].includes('Provider'));
});

test('ordinary pharmacy lookup excludes explicitly agricultural pharmacy listings',async()=>{
 let calls=0;
 const result=await maps.mapAnswer({...request,city:'Campia Turzii'},mapPlan,async()=>({ok:true,json:async()=>({places:++calls===1?[park]:[{...pharmacy,id:'agri',displayName:{text:'Fito Farmacie'}},pharmacy]})}));
 assert.equal(result.nextSteps.length,1);
 assert.equal(result.nextSteps[0].title,'Test pharmacy');
});

 test('Google optional fields and malformed rows do not reject valid listings',()=>{
 const partial={...pharmacy,addressComponents:[{shortText:'Câmpia Turzii',types:['locality']},{types:['political']}],internationalPhoneNumber:null,attributions:[{}, {provider:'Provider'}]};
 const parsed=maps.parsePlaces({places:[{id:'incomplete'},partial,pharmacy]});
 assert.equal(parsed.length,2);assert.equal(parsed[0].addressComponents[0].longText,'Câmpia Turzii');
 assert.equal(parsed[0].internationalPhoneNumber,undefined);
 assert.equal(parsed[0].attributions.length,1);
 });
 test('map response envelope failures stay distinct from an empty result',()=>{
 assert.equal(maps.parsePlaces({}).length,0);
 assert.throws(()=>maps.parsePlaces({places:'invalid'}));
 assert.throws(()=>maps.parsePlaces({places:[{id:'missing-fields'}]}),/invalid listings/);
 });
 test('map failure falls back to cited web search without claiming geographic ranking',async()=>{
 const s=service([{stop_reason:'end_turn',content:[searched,cited]}],plan,{mapResult:{status:'error',segments:[],message:'Map unavailable'}});
 const result=await s.answerNeed(request);
 assert.equal(result.status,'answered');assert.match(result.message,/checked web sources/);
 assert.match(s.calls[0].system,/Do not claim a map was checked/);
 });
 test('map fallback still withholds an answer without sources',async()=>{
 const s=service([{stop_reason:'end_turn',content:[{type:'text',text:'Unsupported suggestion'}]}],plan,{mapResult:{status:'error',segments:[]}});
 assert.equal((await s.answerNeed(request)).status,'error');
 });


test('hairdresser plans support the actual Places category',()=>{
  const parsed=contracts.PlanSchema.parse({...mapPlan,mapSearch:{landmark:null,landmarkType:null,placeType:'hair_salon',query:'coafor'}});
  assert.equal(parsed.mapSearch.placeType,'hair_salon');
});
test('empty strict salon search retries by service text and keeps the city boundary',async()=>{
  const calls=[];
  const salon={...pharmacy,id:'salon-1',displayName:{text:'Test salon'},types:['beauty_salon']};
  const otherCity={...salon,id:'other',addressComponents:[{longText:'Orsova',types:['locality']}]};
  const closed={...salon,id:'closed',businessStatus:'CLOSED_PERMANENTLY'};
  const fetcher=async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({places:calls.length===1?[]:[otherCity,closed,salon]})};};
  const result=await maps.mapAnswer({...request,city:'Campia Turzii'},{...mapPlan,mapSearch:{landmark:null,landmarkType:null,placeType:'hair_salon',query:'coafor'}},fetcher);
  assert.equal(calls.length,2);assert.equal(calls[0].includedType,'hair_salon');
  assert.equal(calls[1].includedType,undefined);assert.equal(calls[1].textQuery,'coafor, Campia Turzii');
  assert.equal(result.nextSteps.length,1);assert.equal(result.nextSteps[0].title,'Test salon');
  assert.match(result.nextSteps[0].actions[0].url,/salon-1/);
});
test('successful salon search does not issue an extra lookup',async()=>{
  let calls=0;
  const result=await maps.mapAnswer({...request,city:'Campia Turzii'},{...mapPlan,mapSearch:{landmark:null,landmarkType:null,placeType:'hair_salon',query:'coafor'}},async()=>{calls++;return {ok:true,json:async()=>({places:[{...pharmacy,types:['hair_salon']}]})};});
  assert.equal(calls,1);assert.equal(result.nextSteps.length,1);
});
