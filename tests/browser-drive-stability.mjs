// Full native WebAudio graph, frozen baseline vs candidate, actual 180s audio.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const baseline=execFileSync('git',['show',`${process.env.BASELINE_REF||'42ba208'}:audio.js`]);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{
 const path=req.url.split('?')[0];res.setHeader('Content-Type',path==='/'?'text/html':'text/javascript');
 res.end(path==='/audio-before.js'?baseline:await readFile(new URL('..'+(path==='/'?'/index.html':path),import.meta.url)));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const results=[]; await mkdir('docs/drive-stability',{recursive:true});
 for(const version of (process.env.VERSIONS||'before,after').split(','))for(const scenario of (process.env.SCENARIOS||'auto,low,no-reverb,no-crush,no-saturation,max-character,max-mix').split(','))for(const seed of (process.env.SEEDS||'11,6174').split(',').map(Number)){
  const result=await page.evaluate(async({version,scenario,seed})=>{
   const {Drone}=await import(version==='before'?'/audio-before.js':'/audio.js');
   const {textureScenes,TextureDrift}=await import('/texture.js');
   const {bandMetrics}=await import('/tests/audio-band-metrics.js');
   let state=seed;Math.random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/2**32);
   const sr=24000,duration=(scenario==='ember-auto'||scenario==='actual-auto'||scenario==='fixed'||(scenario==='auto'&&seed===11))?180:24;
   window.AudioContext=class extends OfflineAudioContext{constructor(){super(4,sr*duration,sr);}async resume(){}};
   const d=new Drone();d.update({...d.settings,...textureScenes.HOLLOW,attack:.01,decay:.01,sustain:1});
   await d.play([40,47,52,55,59,64]);
   // L=final output, R=pre saturation, channel2=post saturation, channel3=post input gain.
   d.analyser.disconnect();const meter=d.ctx.createChannelMerger(4);
   [d.analyser,d.saturation.input,d.saturation.output,d.saturation.drive].forEach((n,i)=>n.connect(meter,0,i));meter.connect(d.ctx.destination);
   const start={...textureScenes.HOLLOW},end=textureScenes[scenario==='ember-auto'?'EMBER':'DISSOLVE'];
   const drift=new TextureDrift(d.settings,Math.random);drift.start();
   for(let t=1;t<duration;t+=2)d.ctx.suspend(t).then(()=>{
    const x=Math.min(1,t/(duration*2/3)),v={};for(const k of Object.keys(end))v[k]=start[k]+(end[k]-start[k])*x;
    if(scenario==='actual-auto')Object.assign(v,drift.step(t*1000));
    if(scenario==='fixed')Object.assign(v,start);
    if(textureScenes[scenario])Object.assign(v,textureScenes[scenario]);
    if(scenario==='low')v.drive=.015;
    if(scenario==='no-reverb')Object.assign(v,{reverb:0,shimmer:0,delay:0});
    if(scenario==='no-crush')v.crush=0;
    if(scenario==='no-saturation')v.saturationMix=0;
    if(scenario==='max-character')v.character=2;
    if(scenario==='max-mix')v.saturationMix=1.52;
    if(scenario==='max-drive')Object.assign(v,{drive:1.8,character:2,saturationMix:1.52});
    d.update({...d.settings,...v});
    if(t%30===1)d.move(t%60<30?[40,47,52,55,59,64]:[42,49,54,57,61,66]);
    OfflineAudioContext.prototype.resume.call(d.ctx);
   });
   const at=performance.now(),b=await d.ctx.startRendering();
   const metrics=[];
   for(let ch=0;ch<4;ch++){
    const a=b.getChannelData(ch),windows=[];let nonfinite=0,peak=0,step=0;
    for(let i=1;i<a.length;i++){if(!Number.isFinite(a[i]))nonfinite++;peak=Math.max(peak,Math.abs(a[i]));step=Math.max(step,Math.abs(a[i]-a[i-1]));}
    for(const t of [duration*.05,duration/3,duration*2/3,duration-3].map(Math.floor)){
     let sum=0,dc=0,hi=0,lo=0;const alpha=1-Math.exp(-2*Math.PI*4000/sr);
     for(let i=t*sr;i<(t+2)*sr;i++){const v=a[i];sum+=v*v;dc+=v;lo+=alpha*(v-lo);hi+=(v-lo)**2;}
     windows.push({t,...bandMetrics(a,t*sr,sr),rms:Math.sqrt(sum/(2*sr)),dc:dc/(2*sr),highRatio:hi/Math.max(sum,1e-30)});
    }
    metrics.push({peak,step,nonfinite,windows});
   }
   return {version,scenario,seed,duration,sampleRate:sr,renderMs:performance.now()-at,metrics};
  },{version,scenario,seed});
  results.push(result);await writeFile(`docs/drive-stability/${process.env.REPORT||'audio'}.json`,JSON.stringify(results,null,2));console.log(version,scenario,seed,JSON.stringify(result.metrics[0]));
 }
 await mkdir('docs/drive-stability',{recursive:true});await writeFile(`docs/drive-stability/${process.env.REPORT||'audio'}.json`,JSON.stringify(results,null,2));
 for(const r of results.filter(r=>r.version==='after')){
  for(const m of r.metrics)assert.equal(m.nonfinite,0);
  assert.ok(r.metrics[0].peak<.81);assert.ok(r.metrics[0].step<.15);
  const w=r.metrics[0].windows;assert.ok(w[3].rms<w[2].rms*2+.001);
  const old=results.find(x=>x.version==='before'&&x.scenario===r.scenario&&x.seed===r.seed);
  if(old&&['auto','ember-auto','max-drive','no-reverb','max-character','max-mix'].includes(r.scenario))
   assert.ok(w[3].highRatio<old.metrics[0].windows[3].highRatio*.5,'late broadband distortion regression');
  if(['ember-auto','max-drive'].includes(r.scenario))assert.ok(w[3].above4k<.005,'high Drive must retain a tonal spectrum');
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
