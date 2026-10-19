import {test} from 'node:test';import assert from 'node:assert/strict';
import {migrateEffects,effectModules,removedEffectKeys} from '../effects.js';
import {migrateHistory,History} from '../history.js';import {defaults,sanitize} from '../audio.js';
import {textureScenes,textureKeys,TextureDrift} from '../texture.js';import {SynthesisDSP} from '../synthesis-dsp.js';
test('v1 presets/history translate to one v2 API without changing harmony or input objects',()=>{
 const old={version:1,timebase:'active-milliseconds',events:[{type:'harmony',notes:[40,47,52,55,59,64],at:0},{type:'texture',scene:'HALO',values:{dryDrift:1.6,beating:.8,wetDrift:1.8,diffusion:1.6,shimmerDecay:19,drift:.9,inharmonicity:.06},target:{dryDrift:0}}]};
 const converted=migrateHistory(old);assert.equal(old.version,1);assert.equal(converted.version,2);assert.deepEqual(converted.events[0],old.events[0]);
 const v=converted.events[1].values;assert.equal(v.instability,1.6);assert.equal(v.reverbMotion,.9);assert.equal(v.reverbDensity,.8);assert.equal(v.reverbDecay,19);assert.equal(v.inharmonicity,.06);
 for(const k of removedEffectKeys)assert.ok(!(k in v));assert.deepEqual(migrateHistory(converted),converted);
 assert.equal(new History().toJSON().version,2);assert.throws(()=>migrateHistory({version:99,events:[]}));
 assert.equal(migrateEffects({instability:.2,dryDrift:2}).instability,.2,'v2 explicit controls win');
});
test('eight modules, twelve migrated scenes and finite controls with independent manual hold',()=>{
 assert.equal(effectModules.length,8);assert.equal(Object.keys(textureScenes).length,12);
 for(const v of Object.values(textureScenes)){
  for(const k of textureKeys)assert.ok(Number.isFinite(v[k]),k);
  for(const k of removedEffectKeys)assert.ok(!(k in v),k);
  assert.ok(v.inharmonicity<=.08);
 }
 for(const k of removedEffectKeys){assert.ok(!textureKeys.includes(k));assert.ok(!(k in defaults));}
 const t=new TextureDrift(defaults,()=>.4);t.start();t.manualChange('reverbMotion',.92);
 assert.equal(t.step(34000).reverbMotion,.92);const before=t.step(35000).reverbMotion;
 const middle=t.step(41000).reverbMotion;assert.ok(Math.abs(middle-before)<.6);assert.ok(t.overrides.has('reverbMotion'));t.step(48000);assert.ok(!t.overrides.has('reverbMotion'));
 assert.equal(sanitize({reverbDecay:Infinity}).reverbDecay,defaults.reverbDecay);
});
test('silent source DSP sleeps while preserving pre-roll for immediate freeze/reverse',()=>{
 const d=new SynthesisDSP(12000),notes=[40,47,52,55,59,64];d.set({},notes,true);
 for(let i=0;i<60000;i++)assert.equal(d.sample(.1*Math.sin(i/12)),0);
 assert.equal(d.filled,60000);assert.ok(d.sleeping);assert.equal(d.voices[0].phase,0);
 d.set({granular:1,freeze:1,reverse:1},notes,true);let energy=0,maxGrains=0,jump=0,last=0;
 for(let i=0;i<120000;i++){const x=d.sample(0);assert.ok(Number.isFinite(x));energy+=x*x;jump=Math.max(jump,Math.abs(x-last));last=x;maxGrains=Math.max(maxGrains,d.grains.filter(g=>g.length).length);}
 assert.ok(energy>.001);assert.ok(maxGrains<=8&&maxGrains>0);assert.ok(jump<.05);assert.equal(d.buffer.length,60000);
 d.set({granular:0},notes);for(let i=0;i<12000;i++)d.sample(0);assert.ok(d.sleeping);
 console.log({maxGrains,jump});
});
