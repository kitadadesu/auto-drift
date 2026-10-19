import {readFile,writeFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
const tags=['baseline-final','new-final'],out={};
const normal=['HOLLOW','GLASS','TIDAL','ECHO','DISSOLVE'];
const stats=xs=>{const a=xs.slice().sort((a,b)=>a-b);return {count:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
for(const tag of tags){
 const events=JSON.parse(gunzipSync(await readFile(`docs/effects-bench/${tag}-trace.json.gz`))).traceEvents;
 const samples=JSON.parse(await readFile(`docs/effects-bench/${tag}-samples.json`));
 const threads=new Map(events.filter(x=>x.name==='thread_name').map(x=>[`${x.pid}:${x.tid}`,x.args.name]));
 const marks=events.filter(x=>x.name.startsWith('bench:'));
 const spans=marks.filter(x=>x.name.endsWith(':start')).map(x=>{const end=marks.find(e=>e.name===x.name.slice(0,-6)+':end');return {name:x.name.split(':')[2],start:x.ts,end:end.ts};});
 if(spans.length!==24)throw Error('Incomplete trace');
 for(const s of spans)if(s.name!=='CHAPTER'&&(s.end-s.start<2300000||s.end-s.start>3500000))throw Error('Invalid measurement window '+JSON.stringify(s));
 const rows={};
 for(const group of [...normal,'MAX','TRANSITION','CHAPTER','normal','all']){
  const ranges=spans.filter(x=>group==='all'||(group==='normal'?normal.includes(x.name):x.name===group));
  const seconds=ranges.reduce((s,x)=>s+(x.end-x.start)/1e6,0),r={seconds};
  for(const [label,thread,event] of [['render','Realtime AudioWorklet thread','ThreadControllerImpl::RunTask'],['transport','AudioOutputDevice','AudioOutputDevice::FireRenderCallback'],['main','CrRendererMain','ThreadControllerImpl::RunTask'],['workletSubset','Realtime AudioWorklet thread','FunctionCall']]){
   const selected=events.filter(e=>e.ph==='X'&&e.name===event&&threads.get(`${e.pid}:${e.tid}`)===thread&&ranges.some(x=>e.ts>=x.start&&e.ts<x.end));
   const cpu=selected.map(e=>e.tdur||0),wall=selected.map(e=>e.dur||0);
   r[label]={cpuMs:cpu.reduce((s,v)=>s+v,0)/1000,cpuPercent:cpu.reduce((s,v)=>s+v,0)/1e4/seconds,cpuUs:stats(cpu),wallUs:stats(wall)};
  }
  const frames=events.filter(e=>e.ph==='X'&&e.name==='FireAnimationFrame'&&ranges.some(x=>e.ts>=x.start&&e.ts<x.end));
  r.animationCallbacksPerSecond=frames.length/seconds;
  r.audioCpuPercent=r.render.cpuPercent+r.transport.cpuPercent;
  rows[group]=r;
 }
 const tasks=samples.samples.flatMap(x=>x.updateTimes);
 const glitches=events.filter(x=>/underrun|glitch|RenderError/i.test(x.name));
 out[tag]={chrome:samples.chrome,rows,updateMs:stats(tasks),glitchEventNames:[...new Set(glitches.map(x=>x.name))],nodes:samples.samples[0].nodes,heap:samples.samples.map(x=>({scene:x.name,repeat:x.repeat,bytes:x.heap})),finite:samples.samples.every(x=>x.finite)};
}
const a=out['baseline-final'].rows,b=out['new-final'].rows;
out.comparison=Object.fromEntries(Object.keys(a).map(k=>[k,{oldAudioCpu:a[k].audioCpuPercent,newAudioCpu:b[k].audioCpuPercent,reductionPercent:100*(1-b[k].audioCpuPercent/a[k].audioCpuPercent),mainReductionPercent:100*(1-b[k].main.cpuPercent/a[k].main.cpuPercent),workletReductionPercent:100*(1-b[k].workletSubset.cpuPercent/a[k].workletSubset.cpuPercent)}]));
await writeFile('docs/effects-bench/comparison.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out.comparison,null,2));
