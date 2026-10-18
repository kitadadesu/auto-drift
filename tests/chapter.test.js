import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Journey, remoteKey, chapterVoicing, chapterDuration} from '../journey.js';
import {centerKey,scaleOf,keyId} from '../harmony.js';
import {ActiveClock} from '../clock.js';
import {History} from '../history.js';
import {palette,sceneNames} from '../palette.js';
import {TextureDrift,textureBounds} from '../texture.js';
import {defaults,sanitize} from '../audio.js';
const origin=[40,47,52,55,59,64];
const random=()=>{let seed=42;return()=>((seed=(1664525*seed+1013904223)>>>0)/2**32)};
test('every remote destination excludes relative/near scales; anchored MIDI/mutes',()=>{
 for(const mode of ['major','minor'])for(let tonic=0;tonic<12;tonic++)for(let i=0;i<100;i++){
  const old={tonic,mode}, next=remoteKey(old,()=>i/100);
  assert.notEqual(next.tonic,tonic);
  assert.ok(scaleOf(next).filter(n=>scaleOf(old).includes(n)).length<=4);
  for(const source of [origin,[40,null,52,null,59,64],[12,24,36,100,115,127]]){
   const notes=chapterVoicing(source,next), active=notes.filter(n=>n!==null);
   assert.equal(Math.min(...active)%12,next.tonic);
   notes.forEach((n,j)=>{assert.equal(n===null,source[j]===null);if(n!==null)assert.ok(n>=12&&n<=127)});
   assert.ok(Math.max(...active)-Math.min(...active)<=24);
  }
 }
});
test('active-clock exact boundaries, resume, four chapters/hour and looping; fresh inference',()=>{
 const j=new Journey(origin,random()), clock=new ActiveClock(), h=new History();h.chapters(j);
 clock.resume(100);j.step(clock.advance(550));clock.pause();clock.resume(9999);j.step(clock.advance(10448.999));
 assert.equal(j.chapter,1);assert.ok(Math.abs(j.elapsed-899999)<1e-6);
 const old=centerKey(j.context);j.step(900000-j.elapsed);h.chapters(j);
 assert.equal(j.chapter,2);assert.equal(j.chapterTime,0);
 assert.equal(j.context.accepted.length,1);assert.equal(j.context.resolutionAnchor,null);assert.equal(j.drift.migration.target,null);
 assert.notEqual(centerKey(j.context).tonic,old.tonic);assert.equal(j.context.initialKey,keyId(centerKey(j.context)));
 j.step(chapterDuration*2-1);assert.equal(j.chapter,3); // just before hour: chapter 4 after next ms
 j.step(1);assert.equal(j.chapter,4);
 j.step(chapterDuration*5);assert.equal(j.chapter,9);h.chapters(j);
 assert.equal(h.events.filter(e=>e.type==='chapter'&&e.phase!=='fade-out').length,9);
 assert.deepEqual(h.events.filter(e=>e.phase!=='fade-out').map(e=>e.at),Array.from({length:9},(_,i)=>i*chapterDuration));
});
test('fade windows hold harmony; no ordinary migration during new tonic fade',()=>{
 const j=new Journey(origin,random());j.step(892000);const v=[...j.current];
 j.step(7999);assert.deepEqual(j.current,v);j.step(1);const next=[...j.current];
 j.step(11999);assert.deepEqual(j.current,next);assert.equal(j.context.accepted.length,1);
});
test('120 deterministic palettes and large key/scene changes',()=>{
 const ids=new Set(), colors=new Set();
 for(const mode of ['major','minor'])for(let tonic=0;tonic<12;tonic++)for(const scene of sceneNames){
  const p=palette({tonic,mode},scene);ids.add(p.id);colors.add(p.accent);assert.deepEqual(p,palette({tonic,mode},scene));
 }
 assert.equal(ids.size,120);assert.equal(colors.size,120);
});
test('automatic timeline reaches extended destruction and retains clear destinations',()=>{
 const t=new TextureDrift(defaults,random());t.start(0);const reached=new Set(), scenes=new Set();let low=false;
 for(let i=0;i<3600;i++){
  const v=t.step(i*1000);scenes.add(t.scene);low ||= v.drive<.1&&v.shimmer<.15;
  for(const k of ['crush','beating','turbulence','wandering','wetDrift','drive','character','shimmer','shimmerDecay','diffusion','reverb','delay']){
   const old={crush:.85,beating:.85,turbulence:.9,wandering:.65,wetDrift:1,drive:.9,character:1,shimmer:.85,shimmerDecay:10.5,diffusion:1,reverb:.85,delay:.52}[k];
   if(v[k]>old)reached.add(k);assert.ok(v[k]<=textureBounds[k][1]);assert.equal(sanitize({...defaults,...v})[k],v[k]);
  }
  assert.ok(v.inharmonicity<=.08);assert.ok(v.feedback<1);
 }
 assert.equal(scenes.size,5);assert.ok(low);assert.equal(reached.size,12,[...reached].join(','));
});
function hsl(h,s,l){h/=360;const a=s*Math.min(l,1-l);return [0,8,4].map(n=>{const k=(n+h*12)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1))})}
const luminance=rgb=>rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
test('all palettes keep readable accent, glow and text over the brightest field',()=>{
 let minimum=100;
 for(const mode of ['major','minor'])for(let tonic=0;tonic<12;tonic++)for(const [i,scene] of sceneNames.entries()){
  const p=palette({tonic,mode},scene), bg=luminance(hsl(p.hue,.72,(16+i*2)/100));
  for(const rgb of [hsl(p.hue,.9,.8),hsl(p.second,.9,p.glowLight/100),[.956,.913,.878]]){
   const ratio=(luminance(rgb)+.05)/(bg+.05);minimum=Math.min(minimum,ratio);
   assert.ok(ratio>=4.5,`${p.id} contrast ${ratio}`);
  }
 }
 console.log({minimumContrast:minimum});
});
