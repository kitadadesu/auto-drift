import { createContext, accept, keyId, centerKey, scaleOf, selectKey, keyLabel } from './harmony.js';
import { initialDrift, initialMigration, beginMigration, advanceMigration, chooseNext, advanceDrift, intervalMs } from './autoplay.js';
export const chapterDuration = 900000;
export const chapterFadeOut = 8000;
export const chapterFadeIn = 12000;
// Exclude same/relative/dominant/subdominant scales, in either mode.
export function remoteKey(previous, rng = Math.random, recent = []) {
  const pool = [];
  for (const mode of ['major','minor']) for (let tonic=0;tonic<12;tonic++) {
    const key = {tonic,mode};
    if (tonic !== previous.tonic && scaleOf(key).filter(n=>scaleOf(previous).includes(n)).length <= 4) pool.push(key);
  }
  const fresh = pool.filter(k=>!recent.includes(keyId(k)));
  const choices = fresh.length ? fresh : pool;
  return choices[Math.min(choices.length-1, Math.floor(Math.max(0,rng())*choices.length))];
}
export function chapterVoicing(origin, key) {
  const slots = origin.flatMap((n,i)=>n===null?[]:[i]).sort((a,b)=>origin[a]-origin[b]);
  const offsets = [0,7,12,key.mode==='major'?16:15,19,24];
  const low = Math.max(24,Math.min(72,Math.min(...origin.filter(n=>n!==null))));
  const bass = low + ((key.tonic-low%12+18)%12)-6;
  const out = Array(6).fill(null);
  slots.forEach((slot,i)=>out[slot]=bass+offsets[i]);
  return out;
}
export const journeyDefaults = Object.freeze({ wander: 0.25, edge: 0.08 });
const unit = x => Math.max(0, Math.min(1, Number.isFinite(+x) ? +x : 0));
export class Journey {
  constructor(notes, rng = Math.random, controls = journeyDefaults) {
    this.current = [...notes]; this.context = createContext(notes); this.drift = initialDrift();
    this.drift.migration = initialMigration(); this.rng = rng; this.elapsed = 0; this.chordElapsed = 0;
    this.remaining = 12000; this.arrivals = []; this.transitions = 0;
    this.origin = [...notes]; this.chapter = 1; this.chapterTime = 0;
    this.chapterEvents = [{type:'chapter', chapter:1, at:0, phase:'start', key:keyLabel(centerKey(this.context))}];
    this.chapterKeys = [keyId(centerKey(this.context))];
    this.controls = { ...journeyDefaults }; this.setControls(controls);
  }
  setControls(values) {
    for (const k of ["wander", "edge"])
      if (values && Number.isFinite(+values[k])) this.controls[k] = unit(values[k]);
    return this.controls;
  }
  step(dt, pace = 12, complexity = 0) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid active time');
    const before = this.chapterTime;
    this.elapsed += dt; this.chapterTime += dt;
    if (before < chapterDuration-chapterFadeOut && this.chapterTime >= chapterDuration-chapterFadeOut)
      this.chapterEvents.push({type:'chapter',chapter:this.chapter,at:this.elapsed-this.chapterTime+chapterDuration-chapterFadeOut,
        phase:'fade-out',key:keyLabel(centerKey(this.context)),fadeOut:chapterFadeOut});
    let boundary = false;
    while (this.chapterTime >= chapterDuration) {
      this.chapterTime -= chapterDuration;
      const old = centerKey(this.context), key = remoteKey(old,this.rng,this.chapterKeys.slice(-3));
      this.current = chapterVoicing(this.origin,key);
      this.context = selectKey(createContext(this.current),keyId(key));
      this.drift = {...initialDrift(),migration:initialMigration()};
      this.chapter++; this.chapterKeys.push(keyId(key)); this.chapterKeys = this.chapterKeys.slice(-4);
      this.chapterEvents.push({type:'chapter',chapter:this.chapter,at:this.elapsed-this.chapterTime,
        phase:'boundary',from:keyLabel(old),key:keyLabel(key),fadeOut:chapterFadeOut,fadeIn:chapterFadeIn});
      this.remaining = chapterFadeIn; this.chordElapsed = 0; this.mode = 'chapter'; boundary = true;
    }
    if (boundary) return true;
    if (this.chapterTime >= chapterDuration-chapterFadeOut || (this.chapter>1 && this.chapterTime<chapterFadeIn)) return false;
    this.chordElapsed += dt; this.remaining -= dt;
    if (this.remaining > 0) return false;
    const old = this.current;
    const established = this.context.center;
    let m = beginMigration(this.drift.migration, this.context, this.rng);
    const scoring = {...this.drift, migration: {...m, elapsed: m.elapsed + this.chordElapsed}};
    const next = chooseNext(old, this.context, scoring, {edge:this.controls.edge, migration:true}, this.rng);
    if (!next) { this.remaining = 5000; return false; }
    this.current = [...next.candidate.voicing];
    this.context = accept(this.context, this.current, next.mode);
    m = advanceMigration(m, this.context, this.current, old, this.chordElapsed);
    // Preserve the established center until musical arrival, never a timer relabel.
    this.context = {...this.context, center: established};
    if (m.arrived) {
      this.context = {...this.context, center:keyId(m.target)};
      this.arrivals.push({at:this.elapsed, key:keyId(m.target)});
      m = {...initialMigration(), recent:m.recent};
    }
    this.drift = {...advanceDrift(this.drift, old, this.current, next.mode, this.controls.wander, this.rng), migration:m};
    this.remaining = intervalMs(old, this.current, next.mode, pace, this.rng) * (1 + complexity * .55);
    this.chordElapsed = 0; this.transitions++; this.mode = next.mode;
    return true;
  }
}
