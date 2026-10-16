import { createContext, accept, keyId } from './harmony.js';
import { initialDrift, initialMigration, beginMigration, advanceMigration, chooseNext, advanceDrift, intervalMs } from './autoplay.js';
export const journeyDefaults = Object.freeze({ wander: 0.25, edge: 0.08 });
const unit = x => Math.max(0, Math.min(1, Number.isFinite(+x) ? +x : 0));
export class Journey {
  constructor(notes, rng = Math.random, controls = journeyDefaults) {
    this.current = [...notes]; this.context = createContext(notes); this.drift = initialDrift();
    this.drift.migration = initialMigration(); this.rng = rng; this.elapsed = 0; this.chordElapsed = 0;
    this.remaining = 12000; this.arrivals = []; this.transitions = 0;
    this.controls = { ...journeyDefaults }; this.setControls(controls);
  }
  setControls(values) {
    for (const k of ["wander", "edge"])
      if (values && Number.isFinite(+values[k])) this.controls[k] = unit(values[k]);
    return this.controls;
  }
  step(dt, pace = 12, complexity = 0) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid active time');
    this.elapsed += dt; this.chordElapsed += dt; this.remaining -= dt;
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
