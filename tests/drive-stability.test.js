import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,saturationSettings,saturationCurve} from '../audio.js';
import {TextureDrift,textureScenes} from '../texture.js';
test('Drive gain is independent of Character and Mix across the complete ranges',()=>{
 for(const drive of [0,.00001,.04,.3,.9,1.8]){
  const reference=saturationSettings({...defaults,drive});
  for(const character of [0,.7,1,1.85,2])for(const saturationMix of [0,.76,1,1.52]){
   const s=saturationSettings({drive,character,saturationMix});
   assert.equal(s.gain,reference.gain);assert.equal(s.compensation,reference.compensation);
   assert.ok(s.gain>=1&&s.gain<=9);assert.ok(s.mix>=0&&s.mix<=1);
   assert.ok(Math.abs(s.weights.reduce((a,b)=>a+b)-1)<1e-12);
  }
 }
 assert.notDeepEqual(saturationSettings({...defaults,character:1}).weights,saturationSettings({...defaults,character:2}).weights);
 assert.ok(saturationSettings({...defaults,drive:1e-8}).mix<1e-6);
 const fold=saturationCurve(2);assert.ok(fold[0]<0&&fold.at(-1)>0);
});
test('three seeded 60-minute AUTO journeys retain every scene and bounded smooth saturation',()=>{
 const seen=new Set();
 for(const seed of [11,6174,98765]){
  let state=seed;const rng=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/2**32);
  const t=new TextureDrift(defaults,rng);t.start();let last;
  for(let ms=0;ms<=3600000;ms+=500){
   const v=t.step(ms),s=saturationSettings(v);seen.add(t.scene);
   assert.ok(s.gain<=9&&Number.isFinite(s.compensation));
   if(last)assert.ok(Math.abs(s.gain-last.gain)<.3);
   last=s;
  }
 }
 for(const name of Object.keys(textureScenes))assert.ok(seen.has(name),name);
});
