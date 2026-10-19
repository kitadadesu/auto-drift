import { effectDefaults, effectBounds, migrateEffects } from './effects.js';
import { sourceDefaults, sourceBounds } from "./synthesis-dsp.js";
// AUTO TEXTURE is a separate, deterministic musical timeline. It owns no
// AudioNodes, timers or DOM, and never overwrites the musician's manual values.
export const textureKeys = [
  ...Object.keys(effectDefaults),
  ...Object.keys(sourceDefaults),
  "crush", "turbulence", "wandering",
  "bloom", "harmonics", "inharmonicity",
  "shimmer",
  "drive", "character", "saturationMix", "reverb", "delay", "detune", "glide", "attack", "decay", "sustain", "release", "time", "feedback",
];
export const textureBounds = {
  ...sourceBounds,
  ...effectBounds,
  crush: [0, 1.7], turbulence: [0, 1.8], wandering: [0, 1.3],
  bloom: [0, 1], harmonics: [0, 1], inharmonicity: [0, 1],
  shimmer: [0, 1.7],
  drive: [0, 1.8], character: [0, 2], saturationMix: [0, 1.52],
  reverb: [0, 1], delay: [0, 1.04], detune: [0, 26],
};
Object.assign(textureBounds, { glide: [1,8], attack: [.4,4], decay: [.5,4], sustain: [.55,.9], release: [1,5], time: [.15,1.2], feedback: [.05,.5] });
export const autoInharmonicityMax = .08;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };

// Unlike a sequence of fixed presets, these are probabilistic destinations.
// Each visit is varied within a safe range; individual controls approach their
// destinations with different delayed envelopes. Distinct characters emerge
// every ~1–3 minutes, while the 25-minute macro arc stays slower.
export const textureScenes = {
  HOLLOW: { bloom: .02, harmonics: .015, inharmonicity: 0, drift: .10,
    dryDrift: .01, wetDrift: .01, shimmer: .02, shimmerDecay: 2,
    diffusion: .08, drive: .015, character: .02, saturationMix: .05,
    reverb: .12, delay: .01, detune: 1 },
  CLEAR: { bloom: .36, harmonics: .13, inharmonicity: .005, drift: .20,
    dryDrift: .07, wetDrift: .12, shimmer: .13, shimmerDecay: 4,
    diffusion: .25, drive: .09, character: .04, saturationMix: .16,
    reverb: .26, delay: .08, detune: 4 },
  HAZE: { bloom: .92, harmonics: .16, inharmonicity: .015, drift: .47,
    dryDrift: .27, wetDrift: .73, shimmer: .63, shimmerDecay: 8.2,
    diffusion: .86, drive: .09, character: .08, saturationMix: .23,
    reverb: .55, delay: .25, detune: 14 },
  GLOW: { bloom: .98, harmonics: .93, inharmonicity: .025, drift: .72,
    dryDrift: .19, wetDrift: .38, shimmer: .30, shimmerDecay: 6.2,
    diffusion: .57, drive: .46, character: .27, saturationMix: .45,
    reverb: .25, delay: .13, detune: 11 },
  DISSOLVE: { bloom: .65, harmonics: .77, inharmonicity: .06, drift: .94,
    dryDrift: .53, wetDrift: .87, shimmer: .31, shimmerDecay: 6.5,
    diffusion: .85, drive: .82, character: .93, saturationMix: .52,
    reverb: .38, delay: .23, detune: 21 },
};
for (const [i, scene] of Object.values(textureScenes).entries()) Object.assign(scene, {
  crush: [.02,.08,.42,.12,.78][i], beating: [.12,.3,.65,.42,.24][i],
  turbulence: [.18,.32,.76,.48,.68][i], wandering: [.04,.16,.28,.58,.14][i],
  saturationPost: i % 2, glide: [7,3,6,4,8][i], attack: [3,1,4,2,3.5][i], decay: [1,2,3,2.5,4][i],
  sustain: [.6,.8,.7,.85,.65][i], release: [2,1.5,5,3,4][i], time: [.3,.4,.8,.6,1.1][i], feedback: [.08,.15,.35,.25,.45][i]
});
// Keep transparent scenes intact. Only destructive destinations enter overdrive.
Object.assign(textureScenes.DISSOLVE, {crush:1.6,beating:1.35,turbulence:1.65,
  wandering:1.15,dryDrift:1.8,drive:1.7,character:1.85,saturationMix:1.4});
Object.assign(textureScenes.HAZE, {wetDrift:1.8,shimmer:1.5,shimmerDecay:19,
  diffusion:1.85,reverb:1.55,delay:.95,turbulence:1.3});
// Inherit proven effect ranges, then assign a distinct source phenomenon.
const old = structuredClone(textureScenes);
for (const name of Object.keys(textureScenes)) delete textureScenes[name];
const definitions = [
 ['HOLLOW','HOLLOW',{}], ['GLASS','CLEAR',{fm:.85,fmRatio:3.5}],
 ['AURORA','HAZE',{wave:.32}], ['CHOIR','CLEAR',{wave:.15,beating:1.1}],
 ['TIDAL','HAZE',{noise:.65,material:.1,turbulence:1.6,shimmer:.18}],
 ['TAPE','CLEAR',{wave:.55,dryDrift:1.6,crush:.3}],
 ['HALO','HAZE',{noise:.75,material:1}],
 ['ECHO','CLEAR',{granular:.55,delay:.85,time:1.1}],
 ['HOWL','GLOW',{noise:.8,material:.55,wandering:1.1}],
 ['STATIC','DISSOLVE',{noise:.9,material:.25,fm:.08,drive:.4,crush:1.7}],
 ['EMBER','DISSOLVE',{wave:.95,fm:.65,fmRatio:1,granular:0,noise:0}],
 ['DISSOLVE','DISSOLVE',{granular:1,freeze:.85,reverse:1,drive:.6,crush:.8}],
];
for(const [name,base,values] of definitions) textureScenes[name]={...sourceDefaults,...old[base],...values};
for(const [name,values] of Object.entries(textureScenes)) textureScenes[name]={...effectDefaults,...migrateEffects(values)};
Object.assign(textureScenes.STATIC,{crushPost:.95});
Object.assign(textureScenes.EMBER,{crushPost:.4});
Object.assign(textureScenes.DISSOLVE,{crushPost:.2});
const names=Object.keys(textureScenes);
const nearby=Object.fromEntries(names.map((name,i)=>[name,[names[(i+1)%12],names[(i+11)%12],names[(i+3)%12]]]));
export function chooseTextureScene(scene, previous = null, rng = Math.random) {
  const all = Object.keys(textureScenes).filter((x) => x !== scene);
  if (!all.length) return scene;
  // About one in four scene changes bypasses the nearest neighborhoods.
  const farther = all.filter((x) => !(nearby[scene] || []).includes(x));
  const neighbors = all.filter((x) => (nearby[scene] || []).includes(x));
  let pool = (rng() < .26 && farther.length) ? farther : neighbors.length ? neighbors : all;
  const noBacktrack = pool.filter((x) => x !== previous);
  if (noBacktrack.length) pool = noBacktrack;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
export function safeTextureValues(values, balance = true) {
  const out = {};
  for (const k of textureKeys) {
    const [lo, hi] = textureBounds[k];
    out[k] = clamp(Number.isFinite(values[k]) ? values[k] : lo, lo, hi);
  }
  out.inharmonicity = Math.min(out.inharmonicity, autoInharmonicityMax);
  // An aggressive folded spectrum and a very loud shimmer return should not
  // reach maximum level together, regardless of random target variation.
  // Prevent simultaneous full-spectrum partials, smeared wet tails and
  // intermodulation distortion from burying the six-note harmony. Keep the
  // contrast between *dry bright* and *wet soft* scenes pronounced.
  const density = clamp((out.harmonics*.57 + out.drive*.46 + out.saturationMix*.28 + out.bloom*.18 - .56)/.65);
  if (balance) {
    out.wandering *= 1 - .25 * Math.max(out.crush / 1.7, density);
    out.shimmer *= 1 - density*.43;
    out.reverb *= 1 - density*.38;
    out.delay *= 1 - density*.27;
    if (out.drive > .65 && out.character > .65) {
      out.shimmer = Math.min(out.shimmer, .42);
      out.reverbDecay = Math.min(out.reverbDecay, 7.5);
    }
  }
  return out;
}
export function textureDistance(a, b) {
  const keys = ["fm", "wave", "noise", "granular", "bloom", "harmonics", "shimmer", "reverbMotion", "drive", "character", "reverb"];
  return keys.reduce((sum, key) => {
    const [lo, hi] = textureBounds[key];
    return sum + Math.abs(a[key] - b[key]) / (hi - lo);
  }, 0) / keys.length;
}
function destination(name, rng) {
  const profile = textureScenes[name];
  const values = {};
  const intensity = rng()<.25 ? .3+rng()*.25 : .85+rng()*.15;
  for (const k of textureKeys) {
    const [lo, hi] = textureBounds[k];
    // Vary ordinary knobs ±5%; inharmonicity only ±0.2 percentage points.
    values[k] = clamp((profile[k] * (Object.hasOwn(sourceDefaults,k) && textureBounds[k][0]===0 ? intensity : 1)) + (rng() - .5) * (k === "inharmonicity" ? .004 : (hi - lo) * .10), lo, hi);
  }
  return safeTextureValues(values);
}
export class TextureDrift {
  constructor(manual, rng = Math.random) {
    manual = {...effectDefaults,...migrateEffects(manual)};
    this.manual = { ...manual };
    this.values = { ...manual, inharmonicity: clamp(manual.inharmonicity, 0, autoInharmonicityMax) };
    this.rng = rng;
    this.enabled = false;
    this.returning = false;
    this.depth = 1; // A full-range journey by default.
    this.elapsed = 0;
    this.wall = null;
    this.scene = null;
    this.previous = null;
    this.plan = null;
    this.overrides = new Map();
  }
  freeze(now) { this.wall = now; }
  start(now = 0) {
    if (this.enabled) return;
    this.enabled = true;
    this.returning = false;
    this.wall = now;
    this.elapsed = 0;
    this.scene = null;
    this.previous = null;
    this.overrides.clear();
    this.nextPlan(true);
  }
  nextPlan(first = false) {
    const prior = this.scene;
    const targetName = chooseTextureScene(prior, this.previous, this.rng);
    const target = destination(targetName, this.rng);
    const far = prior && !(nearby[prior] || []).includes(targetName);
    // Around 2–3 active minutes per full scene, with nonperiodic holds.
    const duration = first ? 78000 + this.rng() * 52000 :
      far ? 80000 + this.rng() * 60000 : 100000 + this.rng() * 50000;
    const hold = first ? 5000 : 8000 + this.rng() * 24000;
    // A continuously varying 15–60 minute arc biases, but never fixes, scene order.
    const macro = .5 + .5 * Math.sin(this.elapsed / 1500000 * Math.PI * 2 + .8);
    const anchor = textureScenes[macro > .5 ? "AURORA" : "HOLLOW"];
    for (const k of textureKeys) target[k] = lerp(target[k], anchor[k], .08);
    this.plan = {
      from: { ...this.values },
      target,
      name: targetName,
      duration,
      hold,
      started: this.elapsed,
      offsets: Object.fromEntries(textureKeys.map((k) => [k, this.rng() * .20])),
      origin: prior || "ORIGIN",
    };
    this.previous = prior;
    this.scene = targetName;
  }
  setDepth(depth) {
    this.depth = clamp(depth);
    if (this.enabled && this.plan) {
      const p = this.plan;
      // Smoothly retarget the active scene rather than jumping to a new depth.
      this.plan = { ...p, from: { ...this.values }, started: this.elapsed,
        duration: 12000, hold: 20000, offsets: Object.fromEntries(textureKeys.map(k => [k, 0])) };
    }
  }
  manualChange(key, value) {
    this.manual[key] = value;
    this.values[key] = value;
    if (this.enabled && textureKeys.includes(key))
      this.overrides.set(key, { value, until: this.elapsed + 35000, release: 12000 });
    if (this.returning) this.returnFrom[key] = value;
  }
  stop(now = 0) {
    if (!this.enabled) return;
    this.enabled = false;
    this.returning = true;
    this.wall = now;
    this.returnFrom = { ...this.values };
    this.returnTime = 0;
    this.overrides.clear();
  }
  step(now, playing = true) {
    if (this.wall === null) this.wall = now;
    const dt = Math.max(0, now - this.wall);
    this.wall = now;
    if (this.returning) {
      this.returnTime += dt;
      const blend = smooth(this.returnTime / 6000);
      for (const k of textureKeys)
        this.values[k] = lerp(this.returnFrom[k], this.manual[k], blend);
      if (blend >= 1) this.returning = false;
      return this.values;
    }
    if (!this.enabled || !playing) return null;
    this.elapsed += dt;
    if (this.elapsed > this.plan.started + this.plan.duration + this.plan.hold)
      this.nextPlan();
    const p = this.plan;
    const raw = clamp((this.elapsed - p.started) / p.duration);
    const desired = {};
    for (const k of textureKeys) {
      const progress = smooth((raw - p.offsets[k]) / (1 - p.offsets[k]));
      const baseline = k === "inharmonicity" ? clamp(this.manual[k], 0, autoInharmonicityMax) : this.manual[k];
      const from = k === "inharmonicity" ? clamp(p.from[k], 0, autoInharmonicityMax) : p.from[k];
      const profile = lerp(baseline, p.target[k], this.depth);
      const automatic = lerp(from, profile, progress);
      const override = this.overrides.get(k);
      if (!override) desired[k] = automatic;
      else if (this.elapsed < override.until) desired[k] = override.value;
      else if (this.elapsed < override.until + override.release) {
        desired[k] = lerp(override.value, automatic,
          smooth((this.elapsed - override.until) / override.release));
      } else {
        this.overrides.delete(k);
        desired[k] = automatic;
      }
    }
    // Manual overrides retain the full knob range through their smooth release.
    const safe = safeTextureValues(desired, false);
    if (this.overrides.has("inharmonicity")) safe.inharmonicity = clamp(desired.inharmonicity);
    this.values = { ...this.values, ...safe };
    return this.values;
  }
  get status() {
    const plan = this.plan;
    if (this.returning) return { label: "MANUALへ復帰", progress: Math.min(1, this.returnTime / 6000) };
    if (!this.enabled || !plan) return { label: "待機", progress: 0 };
    return {
      label: plan.origin + " → " + plan.name,
      progress: clamp((this.elapsed - plan.started) / plan.duration),
      elapsed: this.elapsed,
    };
  }
}
