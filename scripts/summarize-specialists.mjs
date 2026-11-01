// Usage: node scripts/summarize-specialists.mjs < exported-runtime-logs.txt
// Only the numeric/categorical fields of the specialist metrics are retained.
import { readFileSync } from 'node:fs';
const raw=readFileSync(0,'utf8');
const groups=new Map();
for(const line of raw.split('\n')) {
  let message=line;
  try {const row=JSON.parse(line);message=typeof row.message==='string'?row.message:line;}catch{}
  const at=message.indexOf('concierge specialist ');if(at<0)continue;
  try {
    const row=JSON.parse(message.slice(at+'concierge specialist '.length));
    if(!['local_places','entertainment','web_research','general'].includes(row.specialist)||!Number.isFinite(row.totalMs))continue;
    const key=`${row.version==='specialists-v1'?'specialists-v1':'shared-prompt-v1'}/${row.specialist}`;
    const bucket=groups.get(key)||[];
    bucket.push({ms:row.totalMs,failed:row.outcome==='error',fast:row.fastPlan===true,singlePass:row.singlePass===true,calls:Number(row.modelCalls)||0,searches:Number(row.searches)||0,fetches:Number(row.fetches)||0,recoveries:Number(row.recoveries)||0,input:Number(row.inputTokens)||0,output:Number(row.outputTokens)||0,cacheRead:Number(row.cacheReadTokens)||0,cacheWrite:Number(row.cacheWriteTokens)||0});groups.set(key,bucket);
  }catch{}
}
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];};
for(const [route,rows] of groups) {
 const avg=k=>Math.round(rows.reduce((s,r)=>s+r[k],0)/rows.length*100)/100;
 console.log(JSON.stringify({route,requests:rows.length,p50Ms:percentile(rows.map(r=>r.ms),.5),p95Ms:percentile(rows.map(r=>r.ms),.95),errors:rows.filter(r=>r.failed).length,fastPlanRequests:rows.filter(r=>r.fast).length,singlePassRequests:rows.filter(r=>r.singlePass).length,averageModelCalls:avg('calls'),averageSearches:avg('searches'),averageFetches:avg('fetches'),averageRecoveries:avg('recoveries'),averageInputTokens:avg('input'),averageOutputTokens:avg('output'),averageCacheReadTokens:avg('cacheRead'),averageCacheWriteTokens:avg('cacheWrite')}));
}
if(!groups.size)console.error('No specialist metrics found. Supply exported runtime log messages containing "concierge specialist".');
