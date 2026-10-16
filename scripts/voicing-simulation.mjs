// node scripts/voicing-simulation.mjs [baseline repository path] [output.json]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { voicingColor } from '../harmony.js';
const root = resolve(process.argv[2] || '.');
const { Journey } = await import(pathToFileURL(`${root}/journey.js`));
const { candidatePool, soundKey, comparison } = await import(pathToFileURL(`${root}/harmony.js`));
const rng = seed => () => ((seed = Math.imul(seed,1664525)+1013904223>>>0)/2**32);
const reports = [];
for (const [seed, controls] of [[23,{wander:.25,edge:.08}],[91,{wander:.25,edge:.08}],[19,{wander:1,edge:1}]]) {
  const j = new Journey([40,47,52,55,59,64],rng(seed),controls);
  const harmonies=new Set(), registers=new Set(), times=[];
  let crowding=0, roughness=0, edges=0, min=127, max=12, leap=0, lastEdge=-10;
  for (let ms=500;ms<=3600000;ms+=500) {
    const prior=[...j.current], start=performance.now();
    if (j.step(500)) {
      times.push(performance.now()-start);
      const c=voicingColor(j.current);
      crowding+=c.crowding; roughness+=c.roughness;
      harmonies.add(soundKey(j.current));registers.add([...j.current].sort((a,b)=>a-b).join(','));
      min=Math.min(min,...j.current);max=Math.max(max,...j.current);
      leap=Math.max(leap,comparison(prior,j.current).maxLeap);
      assert.ok(leap<=7 && min>=12 && max<=127);
      if(j.mode==='edge') { assert.ok(j.transitions-lastEdge>=5);lastEdge=j.transitions;edges++; }
      assert.ok(j.context.accepted.length<=16);
    }
    if([600000,1800000,3600000].includes(ms)) {
      const pool=candidatePool(j.current,j.context), counts=new Map();
      for(const c of pool)counts.set(soundKey(c.voicing),(counts.get(soundKey(c.voicing))??0)+1);
      const sorted=[...times].sort((a,b)=>a-b);
      reports.push({seed,controls,minutes:ms/60000,transitions:j.transitions,crowding:crowding/j.transitions,roughness:roughness/j.transitions,harmonies:harmonies.size,registers:registers.size,edges,arrivals:j.arrivals.length,range:[min,max],maxLeap:leap,pool:pool.length,poolHarmonies:counts.size,multipleRegisters:[...counts.values()].filter(n=>n>1).length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)});
      console.log(JSON.stringify(reports.at(-1)));
    }
  }
}
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify({root,reports},null,2)+'\n');
