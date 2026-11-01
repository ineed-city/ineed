/* eslint-disable @typescript-eslint/no-require-imports -- Test actual routing without paid providers. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/concierge/specialists.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Date,Intl});
const {selectSpecialist,specialistQuickPlan,createSpecialistMetrics}=m.exports;
const input={question:'Find dinner',city:'Orsova',language:'en',context:[]};
const plan={goal:'Find dinner',category:'local',needsWeb:true,clarification:null};
test('specialists use task evidence, not incidental words or shared-post instructions',()=>{
 const cases=[
  [{question:'restaurant near cinema'},plan,'local_places','maps'],
  [{question:'restaurant with ramen'},{...plan,requiresWebsiteCheck:true},'local_places',null],
  [{question:'Filme azi'},{...plan,category:'research',cinemaRequest:{date:'2026-11-01'}},'entertainment','cinema'],
  [{question:'Concerts tonight'},{...plan,category:'research'},'entertainment',null],
  [{question:'Read https://example.com/film'},{...plan,cinemaRequest:{date:'2026-11-01'}},'web_research',null],
  [{question:'Vremea acum'},{...plan,category:'research',weatherRequest:{hoursAhead:0,clothing:false}},'web_research','weather'],
  [{question:'Snacks for movie night'},{...plan,category:'recipe',needsWeb:false},'general',null],
  [{question:'Repair this tap'},{...plan,category:'howto',needsWeb:false},'general',null],
 ];
 for(const [change,p,id,direct] of cases){const route=selectSpecialist({...input,...change},p);assert.equal(route.id,id);assert.equal(route.direct,direct);}
});
test('cinema shortcut uses the Romanian local date and literal explicit destination',()=>{
 const p=specialistQuickPlan({...input,question:'Ce filme pot vedea la cinema astăzi în Drobeta Turnu Severin?'},new Date('2026-11-01T23:30:00Z'));
 assert.equal(p.cinemaRequest.date,'2026-11-02');assert.equal(p.destination.city,'Drobeta Turnu Severin');assert.equal(p.destination.source,'question');
});
test('ambiguous, multi-part, other timezone, dated and contextual requests keep the planner',()=>{
 for(const question of ['Ce filme sunt maine in Orsova','What movies are showing today in London','What movies are showing today in Orsova and find dinner','Weather today','Weather now in London','Read these two pages https://example.com and https://example.org'])assert.equal(specialistQuickPlan({...input,question}),null,question);
 for(const change of [{context:['earlier turn']},{photo:'image'},{shared:{text:'reference',url:''}}])assert.equal(specialistQuickPlan({...input,question:'Weather now',...change}),null);
});
test('metrics contain counters and timing only, not requests, coordinates, names or source content',()=>{
 let now=10;const metrics=createSpecialistMetrics(()=>now);metrics.data.specialist='local_places';metrics.data.modelCalls=1;now=110;
 const out=metrics.finish('answered',3);assert.equal(out.totalMs,100);assert.equal(out.evidenceSources,3);assert.equal(out.modelCalls,1);
 assert.deepEqual(Object.keys(out).sort(),['version','specialist','fastPlan','planningMs','directMs','direct','modelCalls','searches','fetches','recoveries','inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','outcome','evidenceSources','totalMs'].sort());
});
