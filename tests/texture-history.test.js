import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TextureDrift, textureScenes, safeTextureValues} from '../texture.js';
import {defaults} from '../audio.js';
import {History} from '../history.js';
import {Journey} from '../journey.js';
const rng = seed => () => ((seed = Math.imul(seed,1664525)+1013904223>>>0)/2**32);
test('automatic inharmonicity caps cover variation, macro, depth and unsafe origins; manual remains expressive',()=>{
 assert.ok(defaults.inharmonicity<=.02);
 assert.equal(textureScenes.HOLLOW.inharmonicity,0);
 for(const n of ['CLEAR','HAZE','GLOW']) assert.ok(textureScenes[n].inharmonicity<=.03);
 assert.equal(safeTextureValues({...defaults,inharmonicity:1}).inharmonicity,.08);
 for(const depth of [0,.3,1]) for(const random of [()=>0,()=>.999999,rng(13)]) {
  const t=new TextureDrift({...defaults,inharmonicity:1},random);t.start(0);t.setDepth(depth);
  for(let ms=500;ms<=600000;ms+=500){t.step(ms);assert.ok(t.values.inharmonicity<=.08);assert.ok(t.plan.target.inharmonicity<=.08);}
 }
 const t=new TextureDrift(defaults,rng(3));t.start(0);t.manualChange('inharmonicity',.8);
 t.step(500);assert.equal(t.values.inharmonicity,.8);
 for(let ms=1000;ms<=34500;ms+=500)t.step(ms);
 assert.equal(t.values.inharmonicity,.8);
 let prior=.8;
 for(let ms=35000;ms<=48000;ms+=500){t.step(ms);assert.ok(Math.abs(t.values.inharmonicity-prior)<.06);prior=t.values.inharmonicity;}
 assert.ok(t.values.inharmonicity<=.08);
});
test('history records origin, target, quarter morphs, arrival, adopted notes and bounded detached JSON',()=>{
 const h=new History(12),j=new Journey([40,47,52,55,59,64],rng(23)),t=new TextureDrift(defaults,rng(3));t.start(0);
 h.harmony(j);h.texture(t,0);assert.equal(h.events[0].at,0);assert.deepEqual(h.events[0].notes,j.current);assert.equal(h.events[1].phase,'target');
 for(let ms=500;ms<=300000;ms+=500){if(j.step(500))h.harmony(j);t.step(ms);h.texture(t,ms);}
 assert.ok(h.events.some(e=>e.phase==='arrived'));assert.ok(h.events.some(e=>e.phase==='morph'));
 assert.equal(h.events.length,12);assert.ok(h.dropped>0);const json=h.toJSON();json.events[0].at=-1;assert.notEqual(h.events[0].at,-1);
 const count=h.events.length;h.texture(t,j.elapsed);assert.equal(h.events.length,count);
 h.reset();assert.equal(h.events.length,0);assert.equal(h.dropped,0);h.harmony(j);assert.equal(h.events.length,1);
});
