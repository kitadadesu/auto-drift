// AUTO TEXTURE is a separate, deterministic musical timeline. It owns no
// AudioNodes, timers or DOM, and never overwrites the musician's manual values.
export const textureKeys = [
  "bloom", "harmonics", "inharmonicity", "drift",
  "dryDrift", "wetDrift", "shimmer", "shimmerDecay", "diffusion",
  "drive", "character", "saturationMix", "reverb", "delay", "detune", "saturationPost", "glide", "attack", "decay", "sustain", "release", "time", "feedback",
];
export const textureBounds = {
  bloom: [0, 1], harmonics: [0, 1], inharmonicity: [0, 1],
  drift: [0, 1], dryDrift: [0, 1], wetDrift: [0, 1],
  shimmer: [0, 0.85], shimmerDecay: [1, 10.5], diffusion: [0, 1],
  drive: [0, 0.9], character: [0, 1], saturationMix: [0, 0.76],
  reverb: [0, 0.85], delay: [0, 0.52], detune: [0, 26],
};
Object.assign(textureBounds, { saturationPost: [0,1], glide: [1,8], attack: [.4,4], decay: [.5,4], sustain: [.55,.9], release: [1,5], time: [.15,1.2], feedback: [.05,.5] });
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
  saturationPost: i % 2, glide: [7,3,6,4,8][i], attack: [3,1,4,2,3.5][i], decay: [1,2,3,2.5,4][i],
  sustain: [.6,.8,.7,.85,.65][i], release: [2,1.5,5,3,4][i], time: [.3,.4,.8,.6,1.1][i], feedback: [.08,.15,.35,.25,.45][i]
});
const nearby = {
  HOLLOW: ["CLEAR", "HAZE"],
  CLEAR: ["HOLLOW", "HAZE", "GLOW"],
  HAZE: ["CLEAR", "GLOW", "DISSOLVE"],
  GLOW: ["HAZE", "DISSOLVE", "CLEAR"],
  DISSOLVE: ["GLOW", "HAZE", "HOLLOW"],
};
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
    out.shimmer *= 1 - density*.43;
    out.reverb *= 1 - density*.38;
    out.delay *= 1 - density*.27;
    if (out.drive > .65 && out.character > .65) {
      out.shimmer = Math.min(out.shimmer, .42);
      out.shimmerDecay = Math.min(out.shimmerDecay, 7.5);
    }
  }
  return out;
}
export function textureDistance(a, b) {
  const keys = ["bloom", "harmonics", "shimmer", "wetDrift", "drive", "character", "reverb"];
  return keys.reduce((sum, key) => {
    const [lo, hi] = textureBounds[key];
    return sum + Math.abs(a[key] - b[key]) / (hi - lo);
  }, 0) / keys.length;
}
function destination(name, rng) {
  const profile = textureScenes[name];
  const values = {};
  for (const k of textureKeys) {
    const [lo, hi] = textureBounds[k];
    // Vary ordinary knobs ±5%; inharmonicity only ±0.2 percentage points.
    values[k] = clamp(profile[k] + (rng() - .5) * (k === "inharmonicity" ? .004 : (hi - lo) * .10), lo, hi);
  }
  return safeTextureValues(values);
}
export class TextureDrift {
  constructor(manual, rng = Math.random) {
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
    const anchor = textureScenes[macro > .5 ? "HAZE" : "HOLLOW"];
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
    const dt = Math.max(0, Math.min(2000, now - this.wall));
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
