import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TextureDrift, textureScenes, sceneSlotDuration} from '../texture.js';
import {defaults} from '../audio.js';
import {chapterDuration, chapterFadeOut, chapterFadeIn} from '../journey.js';
const seeded = seed => () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/2**32);

test('each aligned 30 minutes covers all twelve; each chapter has six audible destinations', () => {
 for (const rng of [()=>0, ()=>.999999, seeded(42), seeded(123)]) {
  const t = new TextureDrift(defaults,rng); t.start(0);
  for(let cycle=0;cycle<4;cycle++) {
   const halves=[new Set(),new Set()];
   for(let slot=0;slot<12;slot++) {
    const at=(cycle*12+slot)*sceneSlotDuration;
    t.step(at);
    const name=t.scene, p=t.plan;
    halves[Math.floor(slot/6)].add(name);
    assert.equal(p.started,at);
    assert.ok(p.duration<=100000);
    // Every delayed parameter has reached its varied destination, with full
    // chapter gain, before the final fade starts. Sample actual output values.
    const arrived=at+p.duration;
    assert.ok(arrived%chapterDuration>=chapterFadeIn);
    const end=at+sceneSlotDuration-(slot%6===5?chapterFadeOut:0);
    assert.ok(end-arrived>=42000);
    for(const ms of [arrived, end-1000]) {
     t.step(ms); assert.equal(t.scene,name); assert.ok(t.status.progress>1-1e-10);
     for(const key of ['fm','wave','noise','granular'])
      assert.ok(Math.abs(t.values[key]-p.target[key])<1e-10,key);
    }
   }
   assert.equal(halves[0].size,6);assert.equal(halves[1].size,6);
   assert.deepEqual([...new Set([...halves[0],...halves[1]])].sort(),Object.keys(textureScenes).sort());
  }
 }
});
test('shuffle renews each cycle; depth edits, holds, stop/resume and gaps retain slot alignment',()=>{
 const t=new TextureDrift(defaults,seeded(19));t.start(0);
 const first=[...t.order];
 t.step(149000);t.setDepth(.3);t.step(150000);assert.equal(t.slot,1);
 t.manualChange('fm',.9);t.step(151000);assert.equal(t.values.fm,.9);
 t.freeze(151000);t.step(151000);assert.equal(t.slot,1);
 t.step(899999,false);t.step(900000,true);assert.equal(t.slot,6);
 t.step(1800000);assert.equal(t.slot,12);assert.notDeepEqual(t.order,first);
 assert.ok(Object.values(t.values).every(Number.isFinite));
 t.stop(1800000);t.step(1806000);assert.equal(t.returning,false);
 t.start(1950000);assert.equal(t.slot,13);assert.equal(t.plan.started,1950000);
});
