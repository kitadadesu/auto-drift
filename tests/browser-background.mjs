import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const port = Number(process.env.PORT || 8787);
const server = createServer(async (req, res) => {
  try {
    const path = req.url.split("?")[0];
    res.setHeader(
      "Content-Type",
      path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(
      await readFile(
        new URL(".." + (path === "/" ? "/index.html" : path), import.meta.url),
      ),
    );
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(port, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: false,
  ignoreDefaultArgs:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'],
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
 const context=await browser.newContext(); const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(async()=>{
  window.count=0;
  const create=AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator=function(){window.ctx=this;window.count++;return create.call(this)};
  const {Journey}=await import('./journey.js');const step=Journey.prototype.step;
  Journey.prototype.step=function(...args){const r=step.apply(this,args);window.elapsed=this.elapsed;window.moves=this.transitions;return r};
  const {TextureDrift}=await import('./texture.js');const ts=TextureDrift.prototype.step;
  TextureDrift.prototype.step=function(...args){const r=ts.apply(this,args);window.textureTime=this.elapsed;window.inharm=this.values.inharmonicity;return r};
 });
 await page.locator('#start').click();await page.waitForTimeout(2500);
 // An audio-thread probe measures uninterrupted rendering even while the page is hidden.
 await page.evaluate(async()=>{
  const source=`class Probe extends AudioWorkletProcessor { constructor(){super();this.frames=0;this.energy=0;this.windows=0;this.silent=0;} process(inputs){const x=inputs[0]?.[0];if(x)for(const v of x)this.energy+=v*v;this.frames+=128;if(this.frames>=sampleRate){this.windows++;if(this.energy<1e-10)this.silent++;this.port.postMessage({windows:this.windows,silent:this.silent,energy:this.energy});this.energy=0;this.frames=0;}return true;} } registerProcessor('probe',Probe);`;
  const u=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));await ctx.audioWorklet.addModule(u);URL.revokeObjectURL(u);
  const probe=new AudioWorkletNode(ctx,'probe');const mute=ctx.createGain();mute.gain.value=0;probe.connect(mute).connect(ctx.destination);
  probe.port.onmessage=e=>window.probe=e.data;
  const {Drone}=await import('./audio.js'); // connect the live output via captured node
  window.probeNode=probe;window.probe={windows:0,silent:0,energy:0};
 });
 // Find the live analyser by intercepting its read call from the visualizer.
 await page.evaluate(()=>{const read=AnalyserNode.prototype.getByteTimeDomainData;AnalyserNode.prototype.getByteTimeDomainData=function(a){if(!window.tapped){this.connect(probeNode);window.tapped=true;}return read.call(this,a)}});
 await page.waitForFunction(()=>window.probe?.windows>=1,{},{timeout:15000});
 const before=await page.evaluate(()=>({elapsed,moves,textureTime,count,time:ctx.currentTime}));
 const other=await page.context().newPage();await other.goto('about:blank');await other.bringToFront();
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:false});const info=await cdp.send('Browser.getWindowForTarget');await cdp.send('Browser.setWindowBounds',{windowId:info.windowId,bounds:{windowState:'minimized'}});
 const realHidden=await page.evaluate(()=>document.hidden);
 if(!realHidden) await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForTimeout(21000);
 const hidden=await page.evaluate(()=>({hidden:document.hidden,elapsed,moves,textureTime,count,state:ctx.state,time:ctx.currentTime,probe,inharm}));
 assert.equal(hidden.hidden,true,'real Chrome background tab');assert.equal(hidden.state,'running');
 assert.ok(hidden.elapsed-before.elapsed>18000);assert.ok(hidden.textureTime-before.textureTime>18000);
 assert.ok(hidden.moves>before.moves);assert.ok(hidden.count<=before.count+6 && hidden.count<=42,'only the six bounded lazy Howl oscillators may be added');assert.ok(hidden.inharm<=.08);
 assert.ok(hidden.probe.windows>=18);assert.equal(hidden.probe.silent,0);
 await cdp.send('Browser.setWindowBounds',{windowId:info.windowId,bounds:{windowState:'normal'}});await page.bringToFront();if(!realHidden) await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>document.hidden),false);
 assert.ok(await page.evaluate(()=>parseInt(document.querySelector('#elapsed').textContent.slice(-2))>=20));
 await page.locator('#stop').click();const stopped=await page.evaluate(()=>elapsed);await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>elapsed),stopped);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({realHidden,visibilityMode:realHidden?'native':'synthetic (native tab switch/minimize remained visible in automation)',before,hidden,result:'PASS'},null,2));
} finally {await browser.close();await new Promise(r=>server.close(r));}
