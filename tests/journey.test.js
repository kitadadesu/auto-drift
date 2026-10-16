import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Journey } from '../journey.js';
import { TextureDrift, textureKeys, textureBounds } from '../texture.js';
import { defaults } from '../audio.js';
const rng = seed => () => ((seed = Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
test('seeded 2/10/30/60 minute journeys change actual harmony and texture within bounds', () => {
  const j = new Journey([40,47,52,55,59,64],rng(23)); const t = new TextureDrift({...defaults,inharmonicity:.01},rng(91)); t.start(0);
  const ranges = Object.fromEntries(textureKeys.map(k=>[k,[Infinity,-Infinity]])); const scenes = new Set(); const reports=[];
  let prior = t.values;
  for(let ms=500;ms<=3600000;ms+=500) {
    j.step(500,12,(t.values.harmonics+t.values.drive+t.values.shimmer)/3); t.step(ms);
    scenes.add(t.plan.name);
    assert.ok(t.values.inharmonicity <= .08);
    for(const k of textureKeys) {
      const [lo,hi]=textureBounds[k]; assert.ok(Number.isFinite(t.values[k]) && t.values[k]>=lo && t.values[k]<=hi);
      ranges[k][0]=Math.min(ranges[k][0],t.values[k]); ranges[k][1]=Math.max(ranges[k][1],t.values[k]);
      assert.ok(Math.abs(t.values[k]-prior[k])/(hi-lo)<.04, `${k} jumped`);
    }
    prior={...t.values};
    assert.ok(j.context.accepted.length<=16); assert.ok(j.drift.migration.recent.length<=3);
    if([120000,600000,1800000,3600000].includes(ms)) reports.push({minutes:ms/60000,chords:j.transitions,arrivals:j.arrivals.length,scenes:scenes.size});
  }
  assert.ok(j.transitions>100); assert.ok(j.arrivals.length>1); assert.ok(scenes.size>=4);
  for(const k of textureKeys.filter(k=>k!=="inharmonicity")) {const [lo,hi]=textureBounds[k];assert.ok((ranges[k][1]-ranges[k][0])/(hi-lo)>.15,`${k} too static`);}
  console.log(JSON.stringify({reports,arrivals:j.arrivals,ranges}));
});
test('pause excludes wall time, same seeded journey is reproducible, override returns smoothly',()=>{
 const t=new TextureDrift(defaults,rng(3));t.start(0);t.step(1000);const a={...t.values};t.step(100000,false);assert.equal(t.elapsed,1000);assert.deepEqual(t.values,a);t.freeze(1000);t.step(1500);assert.equal(t.elapsed,1500);
 t.manualChange('bloom',.2);t.step(2000);assert.equal(t.values.bloom,.2);
 const j=new Journey([40,47,52,55,59,64],rng(2)),other=new Journey([40,47,52,55,59,64],rng(2));for(let i=0;i<200;i++){j.step(500);other.step(500);}assert.deepEqual(j.current,other.current);assert.equal(j.elapsed,100000);
});
