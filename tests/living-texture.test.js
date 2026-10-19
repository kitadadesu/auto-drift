import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CrushDSP} from '../crush-dsp.js';
import {defaults,sanitize} from '../audio.js';
import {TextureDrift,textureBounds} from '../texture.js';
const keys=['crush','instability','turbulence','wandering'];
test('new controls sanitize finite endpoints and exact neutral defaults',()=>{
 for(const k of keys){assert.equal(defaults[k],k==='instability'?.15:0);assert.equal(sanitize({...defaults,[k]:99})[k],textureBounds[k][1]);assert.equal(sanitize({...defaults,[k]:-1})[k],0);}
});
test('seeded 2/10/60 minute timelines vary independently within safety bounds',()=>{
 for(const duration of [120,600,3600]){
 let seed=41;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
 const d=new TextureDrift(defaults,rng);d.start(0);
 const ranges=Object.fromEntries(keys.map(k=>[k,[1,0]]));
 for(let sec=0;sec<=duration;sec++){
 const v=d.step(sec*1000);
 for(const k of keys){assert.ok(Number.isFinite(v[k])&&v[k]>=0&&v[k]<=textureBounds[k][1]);ranges[k][0]=Math.min(ranges[k][0],v[k]);ranges[k][1]=Math.max(ranges[k][1],v[k]);}
 assert.ok(v.inharmonicity<=.08);assert.ok(v.wandering<=1.3);
 }
 for(const k of keys)assert.ok(ranges[k][1]-ranges[k][0]>.01);
 console.log(JSON.stringify({duration,ranges}));
 d.manualChange('crush',.95);assert.equal(d.step(duration*1000+1000).crush,.95); // existing automatic bounds
 }
});
test('crush DSP stereo, DC decay, finite peaks, continuous transitions',()=>{
 for(const rate of [44100,48000,96000]){
 const dsp=new CrushDSP(rate);let peak=0,sum=0,jump=0,prev=0;
 for(let i=0;i<rate*12;i++){
 const a=Math.min(1,i/(rate*4));const x=.2*Math.sin(2*Math.PI*440*i/rate);
 const y=dsp.sample(x,0,a);dsp.sample(-x,1,a);
 assert.ok(Number.isFinite(y));peak=Math.max(peak,Math.abs(y));sum+=y*y;jump=Math.max(jump,Math.abs(y-prev));prev=y;
 }
 assert.ok(peak<.25);assert.ok(jump<.08);
 for(let i=0;i<rate*2;i++)prev=dsp.sample(0,0,1);
 assert.ok(Math.abs(prev)<1e-10);
 console.log(JSON.stringify({rate,peak,rms:Math.sqrt(sum/(rate*12)),jump}));
 }
});
