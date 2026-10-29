/* eslint-disable @typescript-eslint/no-require-imports -- Execute the actual client component with controlled hooks and services. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const {randomUUID} = require('node:crypto');

function harness() {
  const slots=[]; let cursor=0; const calls=[]; let complete;
  const react={useEffect(){},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];}};
  const components = {};
  for(const [module,names] of Object.entries({'./place-results':['PlaceResults'],'./history-dialog':['HistoryDialog'],'./chat-transcript':['ChatTranscript'],'./answer-feedback':['FeedbackDialog'],'./next-steps':['NextSteps','ActionPanel','ActiveTimer'],'./photo-options':['PhotoOptions'],'./camera-dialog':['CameraDialog'],'./settings-menu':['SettingsMenu'],'./ui/icons':['Icon'],'./ui/brand':['Brand','ConciergeMark']}))components[module]=Object.fromEntries(names.map(name=>[name,name]));
  const mocks={...components,react,'./use-live-location':{useLiveLocation:()=>({enabled:false})},'./preference-actions':{},'@/lib/concierge/photo':{},'@/lib/concierge/history':{MAX_CHAT_TURNS:30,chatContext:turns=>turns.map(t=>t.question)},'./history-actions':{askSavedConcierge:(request,chat)=>{calls.push({request,chat});return new Promise(resolve=>{complete=resolve;});}}};
  const mod={exports:{}};
  const js=ts.transpileModule(fs.readFileSync('app/concierge-box.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(js,{module:mod,exports:mod.exports,require:name=>name in mocks?mocks[name]:require(name),crypto:{randomUUID},URL,Date});
  function render(){cursor=0;return mod.exports.ConciergeBox({initial:{language:'ro',city:'Bucharest',firstName:'',locationConfigured:true},email:'test@example.com',isAdmin:false});}
  function find(tree,type){if(!tree||typeof tree!=='object')return null;if(tree.type===type)return tree;for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,type);if(found)return found;}return null;}
  return {render,find,calls,finish:async()=>{const q=calls.at(-1).request.question;complete({answer:{status:'answered',segments:[]},turn:{question:q,result:{status:'answered',segments:[]}},saved:{ok:true,version:calls.length}});await new Promise(resolve=>setImmediate(resolve));}};
}

test('follow-up executes immediately once, preserves draft, and continues the same chat',async()=>{
  const h=harness();let tree=h.render();
  h.find(tree,'textarea').props.onChange({target:{value:'My unsent question'}});tree=h.render();
  const action={type:'followup',label:'Variantă asiatică',prompt:'O variantă asiatică pentru două persoane'};
  const click=h.find(tree,'ChatTranscript').props.onAction;
  click(action,'Pui cu orez','Ce pot găti?');click(action,'Pui cu orez','Ce pot găti?');
  assert.equal(h.calls.length,1);assert.match(h.calls[0].request.question,/variantă asiatică/);
  assert.match(h.calls[0].request.question,/Pui cu orez/);
  assert.equal(h.find(h.render(),'ChatTranscript').props.disabled,true);
  await h.finish();tree=h.render();
  assert.equal(h.find(tree,'textarea').props.value,'My unsent question');
  h.find(tree,'ChatTranscript').props.onAction(action,'Pui cu orez','Ce pot găti?');
  assert.equal(h.calls.length,2);assert.equal(h.calls[1].chat.id,h.calls[0].chat.id);
  assert.equal(h.calls[1].chat.version,1);assert.equal(h.calls[1].request.context.length,1);
  await h.finish();
});

test('ordinary form submission still sends and clears its draft',async()=>{
  const h=harness();h.find(h.render(),'textarea').props.onChange({target:{value:'Dinner please'}});
  const submitted=h.find(h.render(),'form').props.onSubmit({preventDefault(){}});
  assert.equal(h.calls[0].request.question,'Dinner please');await h.finish();await submitted;
  assert.equal(h.find(h.render(),'textarea').props.value,'');
});
