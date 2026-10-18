import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const server=createServer(async(req,res)=>{try{const p=req.url.split('?')[0];res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../'+(p==='/'?'index.html':p.slice(1)),import.meta.url)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(8793,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8793');
 const result=await page.evaluate(async()=>{
 const {Drone}=await import('./audio.js');const Native=AudioContext;
 const render=async(extra)=>{
 let seed=42;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
 window.AudioContext=class extends OfflineAudioContext{constructor(){super(2,48000*18,48000);}async resume(){}};
 const Worklet=window.AudioWorkletNode;
 if(extra.fallback)window.AudioWorkletNode=class{constructor(){throw Error('force native fallback')}};
 const d=new Drone();d.update({...d.settings,attack:.1,decay:.2,sustain:.75,volume:.55,...extra});
 await d.play([40,45,50,55,59,64]);window.AudioWorkletNode=Worklet;const ctx=d.ctx;const mode=d.crushMode;
 if(extra.chapterFade) d.scheduleChapter(extra.chapterFade==='out'?892000:0,extra.chapterFade==='out'?1:2);
 const moving = extra.crush===1.7 && extra.wandering===1.3;
 let changes;
 if(moving) changes=ctx.suspend(6).then(async()=>{d.move([42,47,52,57,60,65]);const silence=ctx.suspend(13);await OfflineAudioContext.prototype.resume.call(ctx);await silence;d.stop();await OfflineAudioContext.prototype.resume.call(ctx);});
 const b=await ctx.startRendering();if(changes)await changes;let peak=0,sum=0,jump=0;const data=b.getChannelData(0);
 for(let i=0;i<data.length;i++){if(!Number.isFinite(data[i]))throw Error('NaN');peak=Math.max(peak,Math.abs(data[i]));sum+=data[i]*data[i];if(i)jump=Math.max(jump,Math.abs(data[i]-data[i-1]));}
 const pcm = Array.from({length:Math.floor(data.length/3)},(_,i)=>Math.round(Math.max(-1,Math.min(1,data[i*3]))*32767));
 let tail=0;if(moving)for(let i=48000*17;i<data.length;i++)tail=Math.max(tail,Math.abs(data[i]));
 let afterFade=0,early=0,late=0;
 for(let i=0;i<data.length;i++){if(i>=48000*8)afterFade=Math.max(afterFade,Math.abs(data[i]));if(i<48000*3)early+=data[i]**2;if(i>=48000*14)late+=data[i]**2;}
 if(extra.chapterFade==='out' && afterFade>1e-7)throw Error('Chapter output tail remained');
 if(extra.chapterFade==='in' && early/(48000*3)>=late/(48000*4))throw Error('No slow fade-in');
 return {peak,afterFade,early,late,rms:Math.sqrt(sum/data.length),jump,mode,tail,...(extra.crush===1.7&&extra.wandering===1.3 ? {pcm}: {})};
 };
 const samples={};for(const [name,extra] of Object.entries({neutral:{},fallback:{fallback:true,crush:1.7,drive:1.8,character:2,shimmer:1.7,reverb:1.7},fadeOut:{chapterFade:'out',shimmer:1.7,reverb:1.7,shimmerDecay:21,feedback:.65},fadeIn:{chapterFade:'in'},crush:{crush:1},beating:{beating:1,detune:0},turbulence:{turbulence:1},wandering:{wandering:1},legacyMax:{crush:.85,beating:.85,turbulence:.9,wandering:.65,drive:.9,character:1,saturationMix:.76,reverb:.85,delay:.52,shimmer:.85,shimmerDecay:10.5},all:{crush:1.7,beating:1.7,turbulence:1.8,wandering:1.3,dryDrift:2,wetDrift:2,drive:1.8,character:2,saturationMix:1.52,reverb:1.7,delay:1.04,shimmer:1.7,shimmerDecay:21,diffusion:2,feedback:.65}}))samples[name]=await render(extra);
 window.AudioContext=Native;
 const live=new Drone();await live.play([40,45,50,55,59,64]);live.update({...live.settings,crush:.8,beating:.8,turbulence:.8,wandering:.8});
 const voices=[...live.voices];for(let i=0;i<100;i++){live.move([41,46,51,56,60,65]);live.update({...live.settings,wandering:i%2});}
 const reused=voices.every((v,i)=>live.voices[i]===v);
 const graphSizes=[];
 const initialContext=live.ctx;
 for(let chapter=0;chapter<4;chapter++){
   live.chapterGate.gain.value=0; const old=live.ctx;
   await live.newChapter([42,49,54,57,61,66]);
   if(old.state!=='closed')throw Error('Old tails/context survived');
   live.scheduleChapter(0,chapter+2);
   graphSizes.push({voices:live.voices.filter(Boolean).length,retiring:live.retiring.size,
     voiceNodes:live.voices.reduce((n,v)=>n+v.textureNodes.length+v.partials.length*3+v.oscs.length+3,0)});
 }
 const mode=live.crushMode;live.move(Array(6).fill(null));live.stop();await live.play([40,45,50,55,59,64]);await live.dispose();
 return {samples,reused,mode,graphSizes};
 });
 for(const v of Object.values(result.samples)){assert.ok(v.peak<.8);assert.ok(v.jump<.1);assert.ok(v.rms>0);}
 if(result.samples.all.pcm){const pcm=result.samples.all.pcm;delete result.samples.all.pcm;const wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);pcm.forEach((v,i)=>wav.writeInt16LE(v,44+i*2));if(process.env.SAMPLE_PATH)await writeFile(process.env.SAMPLE_PATH,wav);}
 assert.ok(result.samples.all.tail<1e-6);
 assert.ok(result.graphSizes.every(g=>g.voices===6&&g.retiring===0&&g.voiceNodes===result.graphSizes[0].voiceNodes));
 assert.ok(result.reused);assert.equal(result.mode,'worklet');assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
 await writeFile(new URL('../docs/rupture-audio-results.json',import.meta.url),JSON.stringify(result,null,2));
}finally{await browser.close();server.close();}
