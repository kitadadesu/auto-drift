import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const server=createServer(async(req,res)=>{try{const p=req.url.split('?')[0];res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../'+(p==='/'?'index.html':p.slice(1)),import.meta.url)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8792,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8792');
 const result=await page.evaluate(async()=>{
 const {Drone}=await import('./audio.js');const Native=AudioContext;
 const render=async(extra)=>{
 window.AudioContext=class extends OfflineAudioContext{constructor(){super(2,48000*18,48000);}async resume(){}};
 const d=new Drone();d.update({...d.settings,attack:.1,decay:.2,sustain:.75,volume:.55,...extra});
 await d.play([40,45,50,55,59,64]);const ctx=d.ctx;const mode=d.crushMode;
 const moving = extra.crush===1 && extra.wandering===1;
 let changes;
 if(moving) changes=ctx.suspend(6).then(async()=>{d.move([42,47,52,57,60,65]);const silence=ctx.suspend(13);await OfflineAudioContext.prototype.resume.call(ctx);await silence;d.stop();await OfflineAudioContext.prototype.resume.call(ctx);});
 const b=await ctx.startRendering();if(changes)await changes;let peak=0,sum=0,jump=0;const data=b.getChannelData(0);
 for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))throw Error('NaN');peak=Math.max(peak,Math.abs(data[i]));sum+=data[i]*data[i];if(i)jump=Math.max(jump,Math.abs(data[i]-data[i-1]));}
 const pcm = Array.from({length:Math.floor(data.length/3)},(_,i)=>Math.round(Math.max(-1,Math.min(1,data[i*3]))*32767));
 let tail=0;if(moving)for(let i=48000*17;i<data.length;i++)tail=Math.max(tail,Math.abs(data[i]));
 return {peak,rms:Math.sqrt(sum/data.length),jump,mode,tail,...(extra.crush===1&&extra.wandering===1 ? {pcm}: {})};
 };
 const samples={};for(const [name,extra] of Object.entries({neutral:{},crush:{crush:1},instability:{instability:1,detune:0},turbulence:{turbulence:1},wandering:{wandering:1},all:{crush:1,instability:1,turbulence:1,wandering:1,reverb:1,delay:.7,shimmer:1,reverbDecay:12}}))samples[name]=await render(extra);
 window.AudioContext=Native;
 const live=new Drone();await live.play([40,45,50,55,59,64]);live.update({...live.settings,crush:.8,instability:.8,turbulence:.8,wandering:.8});
 const voices=[...live.voices];for(let i=0;i<100;i++){live.move([41,46,51,56,60,65]);live.update({...live.settings,wandering:i%2});}
 const reused=voices.every((v,i)=>live.voices[i]===v);const mode=live.crushMode;live.move(Array(6).fill(null));live.stop();await live.play([40,45,50,55,59,64]);await live.dispose();
 return {samples,reused,mode};
 });
 for(const v of Object.values(result.samples)){assert.ok(v.peak<.8);assert.ok(v.jump<.1);assert.ok(v.rms>0);}
 if(result.samples.all.pcm){const pcm=result.samples.all.pcm;delete result.samples.all.pcm;const wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);pcm.forEach((v,i)=>wav.writeInt16LE(v,44+i*2));if(process.env.SAMPLE_PATH)await writeFile(process.env.SAMPLE_PATH,wav);}
 assert.ok(result.samples.all.tail<1e-6);
 assert.ok(result.reused);assert.equal(result.mode,'worklet');assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
 await writeFile(new URL('../docs/living-audio-results.json',import.meta.url),JSON.stringify(result,null,2));
}finally{await browser.close();server.close();}
