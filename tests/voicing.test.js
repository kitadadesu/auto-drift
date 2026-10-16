import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerDrift, voicingColor, voiceChordVariants, voiceChord, voicingKey, soundKey, pcs, comparison, candidatePool, createContext } from '../harmony.js';
import { chooseNext, initialDrift } from '../autoplay.js';
test('register scoring distinguishes the same harmonic color without banning high seconds',()=>{
  const low=[36,38,40,55,59,62], open=[36,43,52,59,62,67];
  assert.equal(soundKey(low),soundKey(open));
  assert.ok(voicingColor(open).score>voicingColor(low).score);
  assert.ok(voicingColor([72,74,76,79,83,86]).crowding===0);
  assert.ok(voicingColor([36,38,40,43,47,50]).crowding>0);
  for(const v of [[],[60],[12,12,12,12,12,12],[127,127,127,127,127,127]])
    assert.ok(Object.values(voicingColor(v)).every(Number.isFinite));
  assert.notEqual(voicingKey(low),voicingKey(open));
});
test('bounded variants retain complete sets, baseline, mutes and hard leaps across registers',()=>{
  for(const source of [[40,47,52,55,59,64],[48,52,55,60,64,67],[60,60,60,null,60,60],[12,12,19,24,28,31],[112,113,null,115,117,120]])
    for(const target of [[0,4,7],[0,4,7,11],[0,2,4,7,11],[1,3,6,10]]) {
      const before=JSON.stringify(source), variants=voiceChordVariants(source,target);
      assert.ok(variants.length<=3);
      assert.deepEqual(variants[0]??null,voiceChord(source,target));
      assert.equal(new Set(variants.map(v=>[...v].sort((a,b)=>a-b).join(','))).size,variants.length);
      for(const v of variants){
        assert.deepEqual(pcs(v).sort((a,b)=>a-b),[...target].sort((a,b)=>a-b));
        assert.ok(comparison(source,v).maxLeap<=7);
        v.forEach((n,i)=>{assert.equal(n===null,source[i]===null);if(n!==null)assert.ok(n>=12&&n<=127)});
      }
      assert.equal(JSON.stringify(source),before);
    }
  const v=[40,47,52,55,59,64], target=[0,4,7,11];
  assert.ok(voiceChordVariants(v,target).length>1);
  assert.equal(voiceChordVariants(v,[0,1,2,3,4,5,6]).length,0);
});
test('actual normal and Edge pools retain multiple registers of one pitch-class set',()=>{
  const source=[40,47,52,55,59,64],context=createContext(source);
  for(const edge of [false,true]) {
    const pool=candidatePool(source,context,edge), groups=new Map();
    for(const c of pool){const k=soundKey(c.voicing);groups.set(k,(groups.get(k)??0)+1);assert.ok(c.color);assert.ok(c.comparison.maxLeap<=7)}
    assert.ok([...groups.values()].some(n=>n>1));
    assert.equal(new Set(pool.map(c=>voicingKey(c.voicing))).size,pool.length);
  }
});
test('extra equivalent variants do not multiply a harmony\'s total lottery mass',()=>{
  const current=[48,52,55,60,64,67], context=createContext(current);
  const a={voicing:[48,52,55,60,65,69],score:10},b={voicing:[50,53,57,62,65,69],score:10};
  const state=initialDrift();
  for(let i=0;i<100;i++) {
    const one=chooseNext(current,context,state,{edge:0},()=>i/100,()=>[a,b]);
    const many=chooseNext(current,context,state,{edge:0},()=>i/100,()=>[a,a,a,b]);
    assert.equal(soundKey(one.candidate.voicing),soundKey(many.candidate.voicing));
  }
});

test('soft register tether permits an octave but resists unbounded upward/downward drift',()=>{
  const v=[40,47,52,55,59,64];
  assert.equal(registerDrift(v.map(n=>n+12),v),0);
  assert.ok(registerDrift(v.map(n=>n+24),v)>0);
  assert.ok(Math.abs(registerDrift(v.map(n=>n+24),v)-registerDrift(v.map(n=>n-24),v))<1e-10);
});
test('migration merge retains another actual voicing of the same harmony',()=>{
  const v=[48,52,55,60,64,67],ctx=createContext(v);
  const a={voicing:[48,52,55,60,65,69],score:10};
  const b={voicing:[48,53,55,60,64,69],score:10};
  assert.equal(soundKey(a.voicing),soundKey(b.voicing));
  const target=ctx.keys.find(k=>`${k.tonic}:${k.mode}`!==ctx.center);
  const pool=(v,c)=>c.center===ctx.center?[a]:[b];
  const result=chooseNext(v,ctx,{...initialDrift(),migration:{target,elapsed:0}},{edge:0,migration:true},()=>.999,pool);
  assert.deepEqual(result.candidate.voicing,b.voicing);
});
