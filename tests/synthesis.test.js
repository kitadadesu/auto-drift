import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SynthesisDSP,sourceDefaults} from '../synthesis-dsp.js';
import {textureScenes,TextureDrift} from '../texture.js';
import {defaults} from '../audio.js';
const notes=[40,47,52,55,59,64];
function render(values,rate=12000) {
 const dsp=new SynthesisDSP(rate);dsp.set({...sourceDefaults,...values},notes);
 let energy=0,peak=0,delta=0,last=0,crossings=0;
 for(let i=0;i<rate*3;i++) {
  const v=dsp.sample(.07*Math.sin(i*2*Math.PI*220/rate));
  assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));delta=Math.max(delta,Math.abs(v-last));
  if(i>rate){energy+=v*v;if(v*last<0)crossings++;}last=v;
 }
 return {rms:Math.sqrt(energy/(rate*2)),peak,delta,crossings};
}
test('each source produces finite distinct signals and spectral zero crossing signatures',()=>{
 const results=Object.fromEntries(Object.entries({sine:{},fm:{fm:1},wave:{wave:1},string:{noise:1},cavity:{noise:1,material:1},grain:{granular:1},reverse:{granular:1,reverse:1}}).map(([k,v])=>[k,render(v)]));
 assert.equal(results.sine.peak,0);
 for(const [k,v] of Object.entries(results))if(k!=='sine'){assert.ok(v.rms>.0001,k);assert.ok(v.peak<.4);assert.ok(v.delta<.15,k);}
 assert.equal(new Set(Object.values(results).map(x=>x.crossings)).size,7);
 console.log('DSP measurements',JSON.stringify(results));
});
test('5s ring and 24 grains remain bounded, stop and flush remove old chapter audio',()=>{
 const d=new SynthesisDSP(1000);d.set({granular:1},notes);
 for(let i=0;i<60000;i++)d.sample(.1);
 assert.equal(d.filled,5000);assert.equal(d.buffer.length,5000);assert.equal(d.grains.length,24);
 d.set({freeze:1},notes);for(let i=0;i<2000;i++)d.sample(.2);const write=d.write;
 for(let i=0;i<2000;i++)d.sample(.2);assert.equal(d.write,write);
 d.set({},Array(6).fill(null),false);d.flush();
 for(let i=0;i<2000;i++)d.sample();assert.equal(d.filled,0);assert.ok(d.buffer.every(x=>x===0));assert.ok(d.grains.every(g=>!g.length));
});
test('all 12 scene profiles are distinct and long clocks remain finite with manual hold',()=>{
 assert.equal(Object.keys(textureScenes).length,12);
 assert.equal(new Set(Object.values(textureScenes).map(v=>JSON.stringify(v))).size,12);
 for(const minutes of [2,15,60]){
  let seed=90;const t=new TextureDrift(defaults,()=>((seed=(1664525*seed+1013904223)>>>0)/2**32));t.start();
  for(let ms=0;ms<=minutes*60000;ms+=1000){const v=t.step(ms);assert.ok(Object.values(v).every(Number.isFinite));}
  t.manualChange('fm',.91);assert.equal(t.step(minutes*60000+1000).fm,.91);
 }
});
