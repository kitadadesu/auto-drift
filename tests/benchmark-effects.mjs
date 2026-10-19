// Same harness against a frozen main checkout or this branch. Do not run other
// CPU-intensive tests concurrently. This measures thread CPU, not offline speed.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(process.env.BENCH_ROOT||'.'),tag=process.env.BENCH_TAG||'new';
const server=createServer(async(req,res)=>{
 try{
  const p=req.url.split('?')[0];let body=await readFile(resolve(root,p==='/'?'index.html':p.slice(1)),'utf8');
  if(p==='/app.js')body+=`\nwindow.bench={engine,apply(values,name){ensureJourney();if(name)texture.plan.name=name;Object.assign(texture.values,values);engine.update(texture.values);render();}};`;
  res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(body);
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(8797,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8797');
 await page.evaluate(async()=>{
  let seed=6174;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  window.counts=new WeakMap();
  for(const method of ['createGain','createOscillator','createBuffer','createBufferSource','createDelay','createBiquadFilter','createWaveShaper','createConvolver','createStereoPanner']){
   const orig=BaseAudioContext.prototype[method];if(!orig)continue;
   BaseAudioContext.prototype[method]=function(...a){let c=counts.get(this);if(!c){c={};counts.set(this,c);}c[method]=(c[method]||0)+1;return orig.apply(this,a);};
  }
  window.d=bench.engine;bench.apply(d.settings,'HOLLOW');await d.play([40,47,52,55,59,64]);
  const mute=d.ctx.createGain();mute.gain.value=0;d.analyser.disconnect();d.analyser.connect(mute).connect(d.ctx.destination);
 });
 await page.waitForTimeout(2500);
 const cdp=await page.context().newCDPSession(page),events=[];
 cdp.on('Tracing.dataCollected',x=>events.push(...x.value));
 await cdp.send('Tracing.start',{categories:'toplevel,audio,disabled-by-default-audio,blink.user_timing,devtools.timeline',options:'record-until-full'});
 const samples=[];
 for(let repeat=0;repeat<Number(process.env.REPEATS||3);repeat++){
  for(const name of ['HOLLOW','GLASS','TIDAL','ECHO','DISSOLVE','MAX','TRANSITION','CHAPTER']){
   await page.evaluate(async({name,repeat})=>{
    const {textureScenes}=await import('/texture.js');const base=textureScenes[name]||textureScenes.DISSOLVE;
    bench.apply({...d.settings,...base,...(name==='MAX'?{reverb:1.7,shimmer:1.7,shimmerDecay:21,reverbDecay:21,granular:1,fm:1,noise:1,wave:1}: {})},textureScenes[name]?name:'DISSOLVE');
    if(name==='TRANSITION'){d.move([42,49,54,57,61,66]);bench.apply({...d.settings,granular:0,fm:0,wave:0,noise:0});}
    window.updateTimes=[];window.updateTimer=setInterval(()=>{const at=performance.now();bench.apply(d.settings);updateTimes.push(performance.now()-at);},1000);
    performance.mark('bench:'+repeat+':'+name+':start');
   },{name,repeat});
   if(name==='CHAPTER'){
    await page.evaluate(()=>d.scheduleChapter(899500,1));await page.waitForTimeout(520);
    await page.evaluate(async()=>{
     await d.newChapter([40,47,52,55,59,64]);d.scheduleChapter(0,2);
     const mute=d.ctx.createGain();mute.gain.value=0;d.analyser.disconnect();d.analyser.connect(mute).connect(d.ctx.destination);
    });
   }
   await page.waitForTimeout(Number(process.env.SAMPLE_MS||2400));
   samples.push(await page.evaluate(({name,repeat})=>{
    clearInterval(updateTimer);const a=new Float32Array(512);d.analyser.getFloatTimeDomainData(a);
    performance.mark('bench:'+repeat+':'+name+':end');
    return {name,repeat,mode:d.synthesis?.mode,crushMode:d.crushMode,nodes:counts.get(d.ctx),updateTimes,peak:Math.max(...a.map(Math.abs)),rms:Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length),time:d.ctx.currentTime,sampleRate:d.ctx.sampleRate,baseLatency:d.ctx.baseLatency,outputLatency:d.ctx.outputLatency,heap:performance.memory?.usedJSHeapSize,finite:a.every(Number.isFinite)};
   },{name,repeat}));
  }
 }
 const done=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');await done;
 await mkdir('docs/effects-bench',{recursive:true});
 await writeFile(`docs/effects-bench/${tag}-trace.json.gz`,gzipSync(JSON.stringify({traceEvents:events})));
 await writeFile(`docs/effects-bench/${tag}-samples.json`,JSON.stringify({chrome:browser.version(),samples,errors},null,2));
 if(errors.length||samples.some(x=>!x.finite||x.peak>.81))throw Error('Invalid audio: '+JSON.stringify(errors));
 console.log(JSON.stringify({tag,chrome:browser.version(),scenarios:samples.length,errors}));
 await page.evaluate(()=>d.dispose());
}finally{await browser.close();server.close();}
