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
if(process.env.FALLBACK) await page.evaluate(()=>AudioWorklet.prototype.addModule=async()=>{throw new Error('forced compatibility test')});
await page.locator('#start').click();await page.waitForFunction(()=>window.probe?.engine.running);
const results=[];
assert.equal(await page.evaluate(()=>probe.engine.synthesis.mode),process.env.FALLBACK?'compatibility':'worklet');
for(const name of ['HOLLOW','GLASS','AURORA','CHOIR','TIDAL','TAPE','HALO','ECHO','HOWL','STATIC','EMBER','DISSOLVE']) {
 await page.evaluate(async name=>{ const {textureScenes}=await import('/texture.js'); probe.engine.update({...probe.engine.settings,...textureScenes[name]}); },name);
 await page.waitForTimeout(500);
 results.push(await page.evaluate(name=>{const a=new Float32Array(probe.engine.analyser.fftSize);probe.engine.analyser.getFloatTimeDomainData(a);return {scene:name,peak:Math.max(...a.map(Math.abs)),finite:a.every(Number.isFinite)}},name));
 assert.ok(results.at(-1).finite);assert.ok(results.at(-1).peak<.81);
}
assert.ok(results.some(x=>x.peak>.001));
const report={mode:process.env.FALLBACK?'compatibility':'worklet',scenes:results,errors};
console.log(JSON.stringify(report,null,2));
await writeFile(new URL('../docs/synthesis-'+report.mode+'-results.json',import.meta.url),JSON.stringify(report,null,2));
assert.deepEqual(errors,[]);
}finally{await browser.close();server.close()}
