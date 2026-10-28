/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness loads compiled modules. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

// Execute the actual TypeScript modules with only external services substituted.
function load(file, mocks = {}) {
  const filename = path.join(__dirname, '..', file);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const testModule = {exports:{}};
  vm.runInNewContext(js, {module:testModule, exports:testModule.exports, require:name => name in mocks ? mocks[name] : require(name), URL, Date, AbortSignal, process:{env:{}}, console:{info(){}}}, {filename});
  return testModule.exports;
}
const contracts = load('lib/concierge/contracts.ts');
const request = {question:'A quiet restaurant for dinner',city:'Bucharest, Romania',language:'en',context:[]};
const plan = {goal:'Find dinner options',category:'local',needsWeb:true,clarification:null};
function service(responses, chosen = plan) {
  const calls=[];
  const api={beta:{messages:{parse:async()=>({parsed_output:chosen}),create:async args=>{calls.push(args);return responses.shift();}}}};
  const {answerNeed}=load('lib/concierge/answer.ts', {'server-only':{}, './contracts':contracts, '@/lib/ai/anthropic':{anthropic:api,ANSWER_MODEL:'test'}, '@anthropic-ai/sdk/helpers/beta/zod':{betaZodOutputFormat:()=>({})}});
  return {answerNeed,calls};
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
