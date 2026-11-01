/* eslint-disable @typescript-eslint/no-require-imports -- Load actual TypeScript with provider substitutes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},env={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:n=>n in mocks?mocks[n]:require(n),URL,URLSearchParams,Date,AbortSignal,process:{env},console:{info(){}}});return mod.exports;}
const contracts=load('lib/concierge/contracts.ts');
const weather=load('lib/concierge/weather.ts',{'server-only':{},'./contracts':contracts},{GOOGLE_MAPS_API_KEY:'test-key'});
const now=Date.parse('2026-11-01T09:20:00Z');
const input={question:'What should I wear outside in an hour?',city:'Orsova, Romania',context:[],language:'en',deviceLocation:{latitude:44.72,longitude:22.40,accuracy:30,capturedAt:now}};
const plan={goal:input.question,category:'research',needsWeb:true,clarification:null,weatherRequest:{hoursAhead:1,clothing:true},destination:{city:input.city,source:'profile',clarificationReason:'none'}};
const current={currentTime:'2026-11-01T09:15:00Z',timeZone:{id:'Europe/Bucharest'},temperature:{degrees:12,unit:'CELSIUS'}};
const hour={interval:{startTime:'2026-11-01T10:00:00Z',endTime:'2026-11-01T11:00:00Z'},temperature:{degrees:10,unit:'CELSIUS'},feelsLikeTemperature:{degrees:7,unit:'CELSIUS'},precipitation:{probability:{percent:70}},wind:{speed:{value:30,unit:'KILOMETERS_PER_HOUR'}}};
const response=data=>({ok:true,json:async()=>data});
test('cinema requests cannot become cafe results even with a mistaken planner',()=>{
 const p=contracts.guardTask({...input,question:'Ce filme pot vedea la cinema astăzi în Drobeta Turnu Severin?'},{...plan,category:'local',mapSearch:{placeType:'cafe',query:'cafe'},weatherRequest:null});
 assert.equal(p.category,'research');assert.equal(p.mapSearch,null);assert.equal(p.requiresWebsiteCheck,true);
});
test('dish-specific restaurant searches require menu research; recipes do not',()=>{
 const p=contracts.guardTask({...input,question:'Restaurant cu ramen bun'},{...plan,category:'local',requiresWebsiteCheck:false});assert.equal(p.requiresWebsiteCheck,true);
 const recipe=contracts.guardTask({...input,question:'How to make ramen?'},{...plan,category:'recipe',needsWeb:false,weatherRequest:null});assert.equal(recipe.requiresWebsiteCheck,undefined);assert.equal(recipe.needsWeb,false);
});
test('outdoor clothing gets hourly weather, while body temperature and fashion do not',()=>{
 const base={...plan,weatherRequest:null};
 assert.equal(contracts.guardTask({...input,question:'Cum ar trebui să mă îmbrac dacă ies peste o oră?'},base).weatherRequest.hoursAhead,1);
 for(const question of ['What should I wear to a wedding?','Temperatura corpului este mare','Cum va fi vremea mâine?'])assert.equal(contracts.guardTask({...input,question},base).weatherRequest,null);
});
test('weather uses fresh location and the actual next-hour interval, not current temperature',async()=>{
 const calls=[];const result=await weather.weatherAnswer(input,plan,async(url,options)=>{calls.push({url,options});return response(url.includes('currentConditions')?current:{forecastHours:[hour]});},now);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>new URL(c.url).hostname==='weather.googleapis.com'));assert.ok(calls.every(c=>!c.url.includes('test-key')));
 assert.equal(result.weatherData,true);const text=result.segments[0].text;assert.match(text,/10°C/);assert.match(text,/12:00/);assert.match(text,/70%/);assert.match(text,/Waterproof/);assert.match(text,/wind-resistant/);assert.ok(!JSON.stringify(result).includes('44.72'));
});
test('an explicit destination discards GPS and resolves the requested city',async()=>{
 const destinationPlan={...plan,destination:{city:'Bucharest',source:'question',clarificationReason:'none'}};const calls=[];
 const result=await weather.weatherAnswer({...input,city:'Bucharest'},destinationPlan,async(url,options)=>{calls.push({url,options});if(url.includes('places:searchText'))return response({places:[{location:{latitude:44.43,longitude:26.1},types:['locality'],addressComponents:[{longText:'Bucharest',types:['locality']}]}]});return response(url.includes('currentConditions')?current:{forecastHours:[hour]});},now);
 assert.equal(result.weatherData,true);assert.equal(JSON.parse(calls[0].options.body).textQuery,'Bucharest');assert.equal(new URL(calls[1].url).searchParams.get('location.latitude'),'44.43');
});
test('stale GPS, ambiguous city, stale weather and missing forecast fail honestly to web research',async()=>{
 let calls=0;const stale={...input,deviceLocation:{...input.deviceLocation,capturedAt:now-180000}};
 assert.equal(await weather.weatherAnswer(stale,plan,async(url)=>{calls++;assert.match(url,/places:searchText/);return response({places:[]});},now),null);assert.equal(calls,1);
 for(const data of [{...current,currentTime:'2026-10-01T09:15:00Z'}, {...current,temperature:{degrees:60,unit:'FAHRENHEIT'}}])assert.equal(await weather.weatherAnswer(input,plan,async(url)=>response(url.includes('currentConditions')?data:{forecastHours:[hour]}),now),null);
 assert.equal(await weather.weatherAnswer(input,plan,async(url)=>response(url.includes('currentConditions')?current:{forecastHours:[]}),now),null);
 assert.equal(await weather.weatherAnswer(input,plan,async()=>({ok:false,status:403}),now),null);
});
test('weather values are removed from saved history and model context',()=>{
 const steps=load('lib/concierge/next-steps.ts');const history=load('lib/concierge/history.ts',{'./next-steps':steps,'./contracts':contracts});
 const raw={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',question:'Weather now?',city:'Orsova',language:'en',hadPhoto:false,result:{status:'answered',weatherData:true,segments:[{text:'Provider weather 12°C',sources:[]}]}};
 const saved=history.SavedTurnSchema.parse(raw);assert.ok(!JSON.stringify(saved).includes('12°C'));assert.ok(!history.chatContext([raw]).join('').includes('12°C'));assert.match(saved.result.segments[0].text,/Weather data is not saved/);
});
