import { migrateEffects } from './effects.js';
import { analyze } from './music.js';
import { centerKey, keyLabel } from './harmony.js';
// Detached snapshots use active time, with a bounded buffer ready for JSON.
export class History {
  constructor(limit = 600) { this.limit = limit; this.revision = 0; this.reset(); }
  reset() { this.events = []; this.dropped = 0; this.plan = null; this.bucket = -1; this.revision++; }
  add(event) {
    this.events.push(structuredClone(event));
    if (this.events.length > this.limit) { this.events.shift(); this.dropped++; }
    this.revision++;
  }
  chapters(journey) {
    for (const event of journey.chapterEvents.splice(0)) this.add(event);
  }
  harmony(journey) {
    const m = journey.drift.migration;
    this.add({type:'harmony', chapter:journey.chapter, at:journey.elapsed, chord:analyze(journey.current),
      notes:[...journey.current], mode:journey.mode || 'normal',
      key:keyLabel(centerKey(journey.context)), target:m.target ? keyLabel(m.target) : null,
      arrivals:journey.arrivals.length});
  }
  texture(texture, at) {
    const p = texture.plan;
    if (!p) return;
    const progress = texture.status.progress, bucket = Math.floor(progress * 4);
    if (p === this.plan && bucket <= this.bucket) return;
    const changed = p !== this.plan;
    this.plan = p; this.bucket = bucket;
    this.add({type:'texture', at, scene:p.name, origin:p.origin,
      phase:changed ? 'target' : bucket === 4 ? 'arrived' : 'morph', progress,
      values:{...texture.values}, target:{...p.target}, depth:texture.depth});
  }
  toJSON() { return {version:2, effectsVersion:2, timebase:'active-milliseconds', dropped:this.dropped, events:structuredClone(this.events)}; }
}

// Explicit import compatibility for archived v1 HISTORY exports. Harmony is untouched.
export function migrateHistory(json) {
 if(!json||![1,2].includes(json.version)||!Array.isArray(json.events)) throw new Error('Unsupported HISTORY');
 const copy=structuredClone(json);copy.version=2;copy.effectsVersion=2;
 for(const event of copy.events) if(event.type==='texture') {
  if(event.values)event.values=migrateEffects(event.values);
  if(event.target)event.target=migrateEffects(event.target);
 }
 return copy;
}
