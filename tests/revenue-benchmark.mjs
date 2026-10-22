import { performance } from 'node:perf_hooks';
import { mkdirSync,writeFileSync } from 'node:fs';
import { api } from '../worker/index.mjs';
import { database } from './db.mjs';
const DB=database(),queries=[];
const prepare=DB.prepare.bind(DB);
DB.prepare=sql=>{queries.push(sql);return prepare(sql);};
await DB.prepare("INSERT INTO snapshots VALUES('miricanvas',?,?)").bind(JSON.stringify({accounts:Array.from({length:13},(_,i)=>({id:'a'+i}))}),new Date().toISOString()).run();
for(let account=0;account<13;account++) for(let month=1;month<=12;month++) await DB.prepare('INSERT INTO revenue_months VALUES(?,?,?,?,?,?,?)').bind('a'+account,2026,month,10000,'',1,new Date().toISOString()).run();
const env={DB,LOCAL_MODE:true},results={};
for(const method of ['GET','POST']) {
  const timings=[],queryCounts=[];
  for(let i=0;i<220;i++) {
    queries.length=0;
    const req=new Request('https://biz.example/api/revenue?year=2026',{method,headers:{Origin:'https://biz.example'},body:method==='GET'?undefined:JSON.stringify({requestId:crypto.randomUUID(),accountId:'a0',year:2026,month:1,amountKrw:i,memo:'',revision:i+1})});
    const start=performance.now(),response=await api(req,env);await response.text();
    if(response.status!==200)throw new Error('HTTP '+response.status);
    if(i>=20){timings.push(performance.now()-start);queryCounts.push(queries.length);}
  }
  timings.sort((a,b)=>a-b);
  results[method]={samples:timings.length,p95Ms:+timings[Math.ceil(timings.length*.95)-1].toFixed(3),maxQueries:Math.max(...queryCounts),minQueries:Math.min(...queryCounts)};
}
const output={environment:'Node SQLite in-memory; LOCAL_MODE; production Cloudflare latency not measured',dataset:{accounts:13,monthsPerAccount:12,rows:156},budgetMs:100,nPlusOne:0,results};
mkdirSync('artifacts/verification',{recursive:true});writeFileSync('artifacts/verification/revenue-benchmark.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output));
