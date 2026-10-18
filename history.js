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
  toJSON() { return {version:1, timebase:'active-milliseconds', dropped:this.dropped, events:structuredClone(this.events)}; }
}
