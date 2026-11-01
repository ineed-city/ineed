/* eslint-disable @typescript-eslint/no-require-imports -- Test the actual adapter with substituted network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync('lib/concierge/cinema.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const booking={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/concierge/cinema-booking.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:booking,exports:booking.exports,URL});
const mod={exports:{}};vm.runInNewContext(js,{module:mod,exports:mod.exports,require:n=>n==='server-only'?{}:n==='./cinema-booking'?booking.exports:n==='./videos'?{youtubeId:u=>u==='https://www.youtube.com/watch?v=abcdefghijk'?'abcdefghijk':null}:require(n),URL,Date,Intl,AbortSignal,console});
const {parseProgramme,cinemaAnswer,cinemaUrl}=mod.exports;
const now=new Date('2026-11-01T10:00:00Z'),venue={id:'1821',name:'Cinema City',url:'https://www.cinemacity.ro/cinemas/drobeta-turnu-severin/1821'};
const film={id:'f1',name:'Example',length:100,link:'https://www.cinemacity.ro/films/example/f1',posterLink:'https://www.cinemacity.ro/poster.jpg',videoLink:'https://www.youtube.com/watch?v=abcdefghijk',attributeIds:['comedy','ap-12','2d']};
const event={filmId:'f1',cinemaId:'1821',businessDay:'2026-11-01',eventDateTime:'2026-11-01T13:20:00',attributeIds:['2d','subbed'],bookingLink:'https://tickets.cinemacity.ro/api/order/123',soldOut:false};
const feed=events=>({body:{films:[film],events}});
test('official schedule joins films to exact venue/date, removes past sessions and preserves posters/trailers',()=>{
 const p=parseProgramme(feed([event,{...event,eventDateTime:'2026-11-01T09:00:00'},{...event,cinemaId:'other'},{...event,businessDay:'2026-10-31'}]),venue,'2026-11-01',now);
 assert.equal(p.films.length,1);assert.equal(p.films[0].times.length,1);assert.equal(p.films[0].times[0].time,'13:20');assert.equal(p.films[0].trailer,'abcdefghijk');assert.equal(p.checkedAt,now.toISOString());
});
test('sold-out and blocked sales cannot produce booking buttons; off-host links rejected',()=>{
 for(const change of [{soldOut:true},{compositeBookingLink:{blockOnlineSales:true}},{bookingLink:'https://evil.example/order'}])assert.equal(parseProgramme(feed([{...event,...change}]),venue,'2026-11-01',now).films[0].times[0].url,undefined);
 for(const u of ['http://www.cinemacity.ro/a','https://www.cinemacity.ro.evil.com/a','https://user@www.cinemacity.ro/a','javascript:alert(1)'])assert.equal(cinemaUrl(u),undefined);
});
test('adapter resolves city from official catalog and uses bounded fixed-host requests',async()=>{
 const urls=[];const fetcher=async u=>{urls.push(u);return {ok:true,text:async()=>`apiSitesList = ${JSON.stringify([{externalCode:'1821',uri:'/cinemas/drobeta-turnu-severin',name:'Drobeta Turnu Severin',address:{city:'Drobeta-Turnu Severin'}}])}, pluginLocale`,json:async()=>feed([event])};};
 const input={question:'Filme astăzi',city:'Drobeta Turnu Severin',language:'ro'};const plan={cinemaRequest:{date:'2026-11-01'}};
 const r=await cinemaAnswer(input,plan,fetcher,now);assert.equal(r.cinema.films.length,1);assert.ok(urls[1].includes('/1821/at-date/2026-11-01'));
 assert.equal(await cinemaAnswer({...input,city:'Other city'},plan,fetcher,now),null);
 assert.equal(await cinemaAnswer(input,{cinemaRequest:{date:'2027-01-01'}},fetcher,now),null);
 assert.equal(await cinemaAnswer(input,plan,async()=>({ok:false}),now),null);
});

test('new programmes use official booking router and old answers use working order page',()=>{
 const router='https://www.cinemacity.ro/ro/booking-router/launch/1821/123?lang=ro';
 const p=parseProgramme(feed([{...event,bookingRouterLaunchLink:router}]),venue,'2026-11-01',now);
 assert.equal(p.films[0].times[0].url,router);
 assert.equal(parseProgramme(feed([event]),venue,'2026-11-01',now).films[0].times[0].url,'https://tickets.cinemacity.ro/order/123');
 assert.equal(booking.exports.cinemaBookingUrl('https://tickets.cinemacity.ro/api/order/123?lang=ro'),'https://tickets.cinemacity.ro/order/123?lang=ro');
 for(const bad of ['https://evil.example/order/123','https://tickets.cinemacity.ro/api/other/123','https://user@tickets.cinemacity.ro/order/123','javascript:alert(1)'])assert.equal(booking.exports.cinemaBookingUrl(bad),undefined);
});
