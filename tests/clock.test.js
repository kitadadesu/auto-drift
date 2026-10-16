import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActiveClock} from '../clock.js';
import {Journey} from '../journey.js';
import {TextureDrift} from '../texture.js';
import {defaults} from '../audio.js';
test('audio clock consumes hidden gaps once and excludes STOP and suspended time',()=>{
 const c=new ActiveClock();c.resume(10);assert.equal(c.advance(11),1000);assert.equal(c.advance(11),0);
 assert.equal(c.advance(611),600000);c.pause();c.resume(900);assert.equal(c.advance(901),1000);
});
test('long worker suspension catches up without a harmony burst and texture tracks audio time',()=>{
 const j=new Journey([40,47,52,55,59,64],()=>.4);j.step(600000);assert.equal(j.elapsed,600000);assert.equal(j.transitions,1);
 const t=new TextureDrift({...defaults,inharmonicity:.01});t.start(0);t.step(600000,true);
 assert.equal(t.elapsed,600000);assert.ok(t.values.inharmonicity<=.08);assert.ok(Object.values(t.values).every(Number.isFinite));
});
