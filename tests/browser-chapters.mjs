import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const server=createServer(async(req,res)=>{try{const path=req.url.split('?')[0];let body=await readFile(new URL('../'+(path==='/'?'index.html':path.slice(1)),import.meta.url),'utf8');if(path==='/app.js')body+=`\nwindow.probe={engine,get journey(){return journey},get texture(){return texture},tick,render,clock};`;res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(body)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(8794,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const page=await browser.newPage({viewport:{width:1366,height:768}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8794');
await page.evaluate(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){const mute=dest.context.createGain();mute.gain.value=0;connect.call(this,mute);return connect.call(mute,dest,...args)}return connect.call(this,dest,...args)}});
await page.locator('#start').click();await page.waitForFunction(()=>window.probe?.engine.running);
const results=[];
for(let chapter=2;chapter<=6;chapter++){
 const before=await page.evaluate(()=>{const p=probe;window.oldContext=p.engine.ctx;const key=p.journey.context.center;document.hidden; p.clock.last=p.engine.ctx.currentTime-(900000-p.journey.chapterTime)/1000;p.tick();return key});
 await page.waitForFunction(n=>probe.journey.chapter===n && probe.engine.running && probe.engine.ctx!==window.oldContext,chapter);
 await page.waitForTimeout(100);
 results.push(await page.evaluate(()=>({chapter:probe.journey.chapter,key:probe.journey.context.center,oldClosed:oldContext.state==='closed',accepted:probe.journey.context.accepted.length,voices:probe.engine.voices.filter(Boolean).length,palette:document.querySelector('.landscape').dataset.palette})));
 assert.notEqual(results.at(-1).key,before);assert.ok(results.at(-1).oldClosed);assert.equal(results.at(-1).accepted,1);assert.equal(results.at(-1).voices,6);
}
await page.locator('#stop').click();const elapsed=await page.evaluate(()=>probe.journey.elapsed);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>probe.journey.elapsed),elapsed);
await page.locator('#start').click();await page.waitForTimeout(600);assert.ok(await page.evaluate(n=>probe.journey.elapsed>n,elapsed));
await page.evaluate(async()=>{await probe.engine.ctx.suspend()});const paused=await page.evaluate(()=>probe.journey.elapsed);await page.waitForTimeout(600);assert.equal(await page.evaluate(()=>probe.journey.elapsed),paused);
await page.locator('#start').click();await page.waitForTimeout(600);assert.ok(await page.evaluate(n=>probe.journey.elapsed>n,paused));
await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});const hidden=await page.evaluate(()=>probe.journey.elapsed);await page.waitForTimeout(1200);assert.ok(await page.evaluate(n=>probe.journey.elapsed>n,hidden));await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
await page.locator('#history summary').click();await page.waitForFunction(()=>Array.from(document.querySelector('#history-list').children).filter(n=>n.textContent.includes('CHAPTER')&&!n.textContent.includes('fade-out')).length===6);assert.equal(await page.locator('#history-list').evaluate(el=>Array.from(el.children).filter(n=>n.textContent.includes('CHAPTER')&&!n.textContent.includes('fade-out')).length),6);await page.locator('#history .close-panel').click();
for(const [width,height] of [[1366,768],[390,844]]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width>950)assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));if(process.env.OUTPUT_DIR)await page.screenshot({path:`${process.env.OUTPUT_DIR}/chapter-${width}.png`,fullPage:true});}
await page.locator('#texture-panel summary').click();await page.locator('#tab-CRUSH').click();assert.equal(await page.locator('#knob-crush').getAttribute('max'),'1.7');await page.locator('#knob-crush').evaluate(e=>{e.value='1.5';e.dispatchEvent(new Event('input',{bubbles:true}))});assert.ok(await page.evaluate(()=>Math.abs(probe.engine.settings.crush-1.5)<.002));
await page.locator('#texture-panel .close-panel').click();await page.locator('#stop').click();assert.deepEqual(errors,[]);
console.log(JSON.stringify({chapters:results,stopResume:true,suspend:true,background:true,manualExtended:true,layouts:[1366,390],errors},null,2));
await writeFile(new URL('../docs/chapter-browser-results.json',import.meta.url),JSON.stringify({chapters:results,errors},null,2));
}finally{await browser.close();server.close()}
