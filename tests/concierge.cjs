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
  vm.runInNewContext(js, {module:testModule, exports:testModule.exports, require:name => name in mocks ? mocks[name] : require(name), URL, Date, AbortSignal, process:{env:{}}, console:{info(){}}, ...globals}, {filename});
  return testModule.exports;
}
const contracts = load('lib/concierge/contracts.ts');
const request = {question:'Find somewhere for tonight',city:'Bucharest, Romania',language:'en',context:[]};
const plan = {goal:'Find dinner options',category:'local',needsWeb:true,clarification:null};
function service(responses, chosen = plan) {
  const calls=[]; const planning=[];
  const api={beta:{messages:{parse:async args=>{planning.push(args);return {parsed_output:chosen};},create:async args=>{calls.push(args);return responses.shift();}}}};
  const {answerNeed}=load('lib/concierge/answer.ts', {'server-only':{}, './contracts':contracts, '@/lib/ai/anthropic':{anthropic:api,ANSWER_MODEL:'test'}, '@anthropic-ai/sdk/helpers/beta/zod':{betaZodOutputFormat:()=>({})}});
  return {answerNeed,calls,planning};
}
const cited={type:'text',text:'An option from an official site.',citations:[{type:'web_search_result_location',url:'https://example.com/menu',title:'Menu'}]};
const searched={type:'web_search_tool_result',content:[]};
test('rejects oversized inputs, invalid languages and excessive context',()=>{
  assert.equal(contracts.RequestSchema.safeParse(request).success,true);
  for(const change of [{question:' '},{question:'x'.repeat(2001)},{language:'xx'},{context:Array(5).fill('x')}]) assert.equal(contracts.RequestSchema.safeParse({...request,...change}).success,false);
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
  assert.equal((await s.answerNeed(request)).status,'answered');assert.equal(s.calls[0].tools,undefined);
});
test('paused search preserves provider blocks and stops after two rounds',async()=>{
  const s=service([{stop_reason:'pause_turn',content:[searched]},{stop_reason:'end_turn',content:[cited]}]);
  assert.equal((await s.answerNeed(request)).status,'answered');assert.equal(s.calls.length,2);
  assert.equal(s.calls[1].messages[1].content[0],searched);
  const stuck=service([{stop_reason:'pause_turn',content:[]},{stop_reason:'pause_turn',content:[]}]);
  await assert.rejects(stuck.answerNeed(request),/timed out/);assert.equal(stuck.calls.length,2);
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
    assert.equal(s.planning.length,0);assert.equal(s.calls[0].tools,undefined);
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
