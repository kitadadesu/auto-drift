import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const server=createServer(async(req,res)=>{try{const p=req.url.split('?')[0];let b=await readFile(new URL('../'+(p==='/'?'index.html':p.slice(1)),import.meta.url),'utf8');if(p==='/app.js')b+='\nwindow.probe={engine,get journey(){return journey},get texture(){return texture},tick,render,clock};';res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(b);}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(8798,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8798');
const reverb=await page.evaluate(async()=>{
 const {createReverb}=await import('/reverb.js');
 const results={};let reference;
 for(const [name,settings] of Object.entries({room:{reverbDecay:.3,reverbSize:0},long:{reverbDecay:30,reverbSize:1},sparse:{reverbDecay:8,reverbDensity:0},dense:{reverbDecay:8,reverbDensity:1},motion:{reverbDecay:8,reverbDensity:1,reverbMotion:1}})){
 const sr=24000,c=new OfflineAudioContext(1,sr*16,sr),mod=c.createOscillator();mod.frequency.value=.3;mod.start();
 const space=createReverb(c,mod);space.set({reverbDecay:8,reverbSize:.6,reverbDensity:.6,reverbMotion:0,...settings},0);
 const ff=Float32Array.from({length:4096},(_,i)=>20*500**(i/4095)),mm=new Float32Array(4096),pp=new Float32Array(4096);space.lines[0].low.getFrequencyResponse(ff,mm,pp);const lowPeak=Math.max(...mm);space.lines[0].high.getFrequencyResponse(ff,mm,pp);const highPeak=Math.max(...mm);
 const source=c.createBufferSource(),b=c.createBuffer(1,sr,sr);const data=b.getChannelData(0);data[0]=.5;source.buffer=b;source.connect(space.input);space.output.connect(c.destination);source.start(1);
 const rendered=await c.startRendering(),a=rendered.getChannelData(0);let peak=0,sum=0,jump=0,late=0,early=0,diff=0;
 for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i]))throw Error(name+' nonfinite');peak=Math.max(peak,Math.abs(a[i]));sum+=a[i]*a[i];if(i)jump=Math.max(jump,Math.abs(a[i]-a[i-1]));if(i>sr*12)late+=a[i]*a[i];if(i>sr&&i<sr*2)early+=a[i]*a[i];if(reference)diff+=(a[i]-reference[i])**2;}
 if(name==='dense')reference=a.slice();results[name]={lowPeak,highPeak,peak,rms:Math.sqrt(sum/a.length),jump,lateEnergy:late,earlyEnergy:early,difference:diff};
 }
 return results;
});
assert.ok(reverb.long.lateEnergy>reverb.room.lateEnergy*1000);assert.ok(reverb.long.lateEnergy>1e-9);assert.ok(reverb.motion.difference>1e-5);
console.log("impulse",JSON.stringify(reverb));
for(const x of Object.values(reverb))assert.ok(x.peak<.6);
// Exercise all source/effect combinations in the real AudioWorklet graph.
await page.evaluate(()=>{const orig=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...a){if(dest instanceof AudioDestinationNode){const m=dest.context.createGain();m.gain.value=0;orig.call(this,m);return orig.call(m,dest,...a);}return orig.call(this,dest,...a);}});
await page.locator('#start').click();await page.waitForFunction(()=>probe.engine.running);
const scenes=[];
for(const name of ['HOLLOW','GLASS','AURORA','CHOIR','TIDAL','TAPE','HALO','ECHO','HOWL','STATIC','EMBER','DISSOLVE']){
 await page.evaluate(async name=>{const {textureScenes}=await import('/texture.js');probe.engine.update({...probe.engine.settings,...textureScenes[name]});},name);
 await page.waitForTimeout(650);
 scenes.push(await page.evaluate(name=>{const d=probe.engine,a=new Float32Array(2048);d.analyser.getFloatTimeDomainData(a);return {name,peak:Math.max(...a.map(Math.abs)),rms:Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length),finite:a.every(Number.isFinite)}},name));
}
assert.ok(scenes.every(x=>x.finite&&x.peak<.81&&x.rms>1e-5));
await page.locator('#texture-panel summary').click();await page.locator('#tab-REVERB').click();
assert.equal(await page.locator('#knob-wetDrift').count(),0);assert.equal(await page.locator('#knob-drift').count(),0);
const latency=await page.locator('#knob-reverbMotion').evaluate(e=>{const t=performance.now();e.value='.9';e.dispatchEvent(new Event('input',{bubbles:true}));return performance.now()-t;});
assert.ok(await page.evaluate(()=>Math.abs(probe.engine.settings.reverbMotion-.9)<.002));
const layouts=[];for(const [w,h] of [[1366,768],[390,844]]){await page.setViewportSize({width:w,height:h});layouts.push({w,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});await page.screenshot({path:`docs/effects-bench/ui-${w}.png`,fullPage:true});}
assert.ok(layouts.every(x=>!x.overflow));
await page.locator('#texture-panel .close-panel').click();
// A simulated hour advances application clocks and resets four real graphs; it
// is an allocation/ownership test, not an hour of real-time thermal testing.
const endurance=[];const heapSession=await page.context().newCDPSession(page);await heapSession.send('Performance.enable');
for(let chapter=2;chapter<=5;chapter++){
 await page.evaluate(()=>{window.old=probe.engine.ctx;probe.clock.last=probe.engine.ctx.currentTime-(900000-probe.journey.chapterTime)/1000;probe.tick();});
 await page.waitForFunction(n=>probe.journey.chapter===n&&probe.engine.running&&probe.engine.ctx!==old,chapter);
 await heapSession.send('HeapProfiler.collectGarbage');
 const heap=(await heapSession.send('Performance.getMetrics')).metrics.find(x=>x.name==='JSHeapUsedSize').value;
 endurance.push(await page.evaluate(()=>({chapter:probe.journey.chapter,oldClosed:old.state==='closed',voices:probe.engine.voices.filter(Boolean).length,retiring:probe.engine.retiring.size,history:probe.journey.elapsed,heap:performance.memory?.usedJSHeapSize})));endurance.at(-1).retainedHeap=heap;
}
assert.ok(endurance.at(-1).retainedHeap<endurance[0].retainedHeap*1.3+1e6,'bounded retained heap after chapter replacement');
assert.ok(endurance.every(x=>x.oldClosed&&x.voices===6&&x.retiring===0));assert.deepEqual(errors,[]);
await page.locator('#stop').click();
const report={chrome:browser.version(),reverb,scenes,latencyMs:latency,layouts,endurance,errors};await writeFile('docs/effects-bench/browser-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();server.close();}
