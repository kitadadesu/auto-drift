import {readFile,writeFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
const result={};
for(const tag of process.argv.slice(2)){
const events=JSON.parse(gunzipSync(await readFile(`docs/effects-bench/${tag}-trace.json.gz`))).traceEvents;
const threads=new Map(events.filter(x=>x.name==='thread_name').map(x=>[`${x.pid}:${x.tid}`,x.args.name]));
const summary={};
for(const thread of ['Realtime AudioWorklet thread','AudioOutputDevice','CrRendererMain']){
const all=events.filter(x=>threads.get(`${x.pid}:${x.tid}`)===thread&&x.ph==='X'&&x.tdur!==undefined);
const counts={};for(const x of all){counts[x.name]??={n:0,tdur:0,dur:0};counts[x.name].n++;counts[x.name].tdur+=x.tdur;counts[x.name].dur+=x.dur;}
summary[thread]=Object.entries(counts).sort((a,b)=>b[1].tdur-a[1].tdur).slice(0,8);
}
console.log(tag,JSON.stringify(summary));
const marks=events.filter(x=>x.name.startsWith('bench:'));
result[tag]={};
for(const start of marks.filter(x=>x.name.endsWith(':start'))){
 const id=start.name.slice(0,-6),end=marks.find(x=>x.name===id+':end');if(!end)continue;
 const report={seconds:(end.ts-start.ts)/1e6};
 for(const thread of ['Realtime AudioWorklet thread','AudioOutputDevice','CrRendererMain']){
 const name=thread==='AudioOutputDevice'?'AudioOutputDevice::FireRenderCallback':'ThreadControllerImpl::RunTask';
 const xs=events.filter(x=>x.ph==='X'&&x.name===name&&threads.get(`${x.pid}:${x.tid}`)===thread&&x.ts>=start.ts&&x.ts<end.ts);
 const cpu=xs.map(x=>x.tdur||0).sort((a,b)=>a-b),wall=xs.map(x=>x.dur||0).sort((a,b)=>a-b);
 report[thread]={count:xs.length,cpuMs:cpu.reduce((a,b)=>a+b,0)/1000,cpuPercent:cpu.reduce((a,b)=>a+b,0)/(end.ts-start.ts)*100,meanUs:cpu.reduce((a,b)=>a+b,0)/cpu.length,p95Us:cpu[Math.floor(cpu.length*.95)],maxUs:cpu.at(-1),wallP95Us:wall[Math.floor(wall.length*.95)],wallMaxUs:wall.at(-1)};
 }
 result[tag][id]=report;
}
}
await writeFile('docs/effects-bench/trace-summary.json',JSON.stringify(result,null,2));
