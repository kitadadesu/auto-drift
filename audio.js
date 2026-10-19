import { effectDefaults, effectBounds, migrateEffects } from './effects.js';
import { createReverb } from './reverb.js';
import { sourceDefaults, sourceBounds } from "./synthesis-dsp.js";
import { createSynthesis } from "./synthesis.js";
import { frequency } from "./music.js";
// LP/HP WebAudio Q is in dB: -3.0103 dB is the nonresonant Butterworth value (Q=1/√2).
export const dampedQ = -3.0103;
export const defaults = {
  ...sourceDefaults,
  ...effectDefaults,
  crush: 0,
  turbulence: 0,
  wandering: 0,
  glide: 2.5,
  harmonics: 0,
  bloom: 0.7,
  shimmer: 0.35,
  drive: 0.25,
  character: 0.15,
  saturationMix: 0.4,
  inharmonicity: 0.01,
  detune: 7,
  attack: 1.2,
  decay: 1.5,
  sustain: 0.75,
  release: 1.8,
  volume: 0.55,
  reverb: 0.35,
  delay: 0.2,
  time: 0.48,
  feedback: 0.32,
};
const limits = {
  ...sourceBounds,
  ...effectBounds,
  crush: [0, 1.7], turbulence: [0, 1.8], wandering: [0, 1.3],
  glide: [0.02, 8],
  harmonics: [0, 1],
  bloom: [0, 1],
  shimmer: [0, 1.7],
  drive: [0, 1.8],
  character: [0, 2],
  saturationMix: [0, 1.52],
  inharmonicity: [0, 1],
  detune: [0, 30],
  attack: [0.01, 4],
  decay: [0.01, 4],
  sustain: [0, 1],
  release: [0.03, 5],
  volume: [0, 1],
  reverb: [0, 1],
  delay: [0, 1.04],
  time: [0.05, 1.5],
  feedback: [0, 0.65],
};
export function sanitize(s) {
  s = migrateEffects(s);
  return Object.fromEntries(
    Object.entries(defaults).map(([k, d]) => [
      k,
      Number.isFinite(s[k])
        ? Math.max(limits[k][0], Math.min(limits[k][1], s[k]))
        : d,
    ]),
  );
}
// Four bounded sine partials per string, never detuned copies of the fundamental.
const partials = [
  { ratio: 2, stretch: 0.015, weight: 0.30 },
  { ratio: 3, stretch: 0.07, weight: 0.22 },
  { ratio: 4, stretch: 0.17, weight: 0.14 },
  { ratio: 6, stretch: -0.08, weight: 0.09 },
];
const oscillators = (v) => [...(v.howl ? [v.howl] : []), ...v.oscs, ...v.partials.map((p) => p.osc)];
const disconnectVoice = (v) => {
  v.textureNodes?.forEach(n => { try { n.stop?.(); } catch {} n.disconnect(); });
  v.gain.disconnect();
  v.tone.disconnect();
  v.spectralEnvelope.disconnect();
  v.partials.forEach(p => p.send.disconnect());
  v.partials.forEach((p) => p.gain.disconnect());
};
// Bloom shares the four partial sources; it needs neither timers nor more oscillators.
const bloomWeights = [0.20, 0.12, 0.07, 0.035];
export function bloomLevel(index, age) {
  const delay = [0.3, 1.8, 3.8, 6][index];
  const duration = [3, 4, 5, 6][index];
  const x = Math.max(0, Math.min(1, (age - delay) / duration));
  return x * x * (3 - 2 * x);
}
export function spectrumLevels(targets, settings, age) {
  const weights = targets.map((p, i) => settings.harmonics * p.weight +
    settings.bloom * bloomWeights[i] * bloomLevel(i, age) * (p.weight / partials[i].weight));
  const norm = 1 / (1 + weights.reduce((a, b) => a + b, 0));
  return { core: norm, partials: weights.map(w => 2 * w * norm) };
}
export function partialTarget(midi, index, settings, sampleRate) {
  const p = partials[index];
  const raw = frequency(midi) * p.ratio * (1 + p.stretch * settings.inharmonicity);
  // Fade before the ceiling; never schedule ultrasonic oscillator frequencies.
  const ceiling = sampleRate * 0.45;
  return { frequency: Math.min(raw, ceiling),
    weight: p.weight * Math.max(0, Math.min(1, (ceiling - raw) / (sampleRate * 0.05))),
    glide: settings.glide };
}
export function partialFrequencyAt(motion, time) {
  const progress = motion.end <= motion.start ? 1 :
    Math.max(0, Math.min(1, (time - motion.start) / (motion.end - motion.start)));
  return motion.from * (motion.to / motion.from) ** progress;
}
// Independent looping control signals: shallow wow/flutter plus smooth random
// drift. Buffer sources run for the context lifetime, never on UI timers.
function driftSignal(c, duration, wow, flutter) {
  // Control signals stay below 5 Hz; 128 Hz preserves their motion while
  // removing 95.7% of the former 3 kHz control-buffer storage.
  const rate = 128, buffer = c.createBuffer(1, rate * duration, 3000);
  const data = buffer.getChannelData(0);
  const knots = Array.from({ length: Math.ceil(duration / 7) + 1 }, () => Math.random() * 2 - 1);
  knots[knots.length - 1] = knots[0];
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, x = t / duration * (knots.length - 1), k = Math.floor(x);
    const f = x - k, smooth = f * f * (3 - 2 * f);
    // Integer cycles ensure a seamless loop, including the random component.
    data[i] = 0.55 * Math.sin(2 * Math.PI * wow * t / duration) +
      0.08 * Math.sin(2 * Math.PI * flutter * t / duration) +
      0.37 * (knots[k] + (knots[k + 1] - knots[k]) * smooth);
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate / 3000;
  source.loop = true;
  source.start();
  return source;
}
// Mirror the string ADSR on a separate high-partial-only envelope.
function envelope(v, method, ...args) {
  v.gain.gain[method](...args);
  v.spectralEnvelope.gain[method](...args);
}
// Fixed curves: Character morphs gains, never replaces a live WaveShaper curve.
export function saturationCurve(kind, size = 8193) {
  return Float32Array.from({ length: size }, (_, i) => {
    const x = i * 2 / (size - 1) - 1;
    if (kind === 0) return Math.tanh(x * 2) / 2;
    if (kind === 1) return (Math.tanh(x * 2 + 0.35) - Math.tanh(0.35)) / 2.3;
    // A single, bounded fold retains polarity at the clamped curve endpoints.
    // The old sin(5*x) inverted large inputs and turned clipping into edges.
    return Math.sin(2.4 * Math.tanh(x * 1.6)) / 3;
  });
}
export function characterWeights(x) {
  const asymmetric = Math.max(0, Math.min(1, (x - 0.3) / 0.4));
  const fold = Math.max(0, Math.min(1, (x - 0.7) / 0.3));
  return [1 - asymmetric, asymmetric * (1 - fold), fold];
}
// The full public ranges map continuously to independent circuit controls.
export function saturationSettings({drive, character, saturationMix}) {
  const amount = Math.max(0, Math.min(1, drive / 1.8));
  const gain = 1 + 8 * amount * amount;
  const mix = Math.max(0, Math.min(1, saturationMix / 1.52));
  const active = Math.min(1, drive / .04);
  return {gain, mix: mix * active, compensation: 1 / Math.sqrt(gain),
    weights: characterWeights(Math.max(0, Math.min(1, character / 2)))};
}
function saturation(c) {
  const input = c.createGain(), output = c.createGain(), dry = c.createGain();
  const drive = c.createGain(), wet = c.createGain();
  wet.gain.value = 0;
  input.connect(dry).connect(output);
  input.connect(drive);
  const colors = [0, 1, 2].map(kind => {
    const shape = c.createWaveShaper(), gain = c.createGain();
    shape.curve = saturationCurve(kind); shape.oversample = "2x";
    drive.connect(shape).connect(gain).connect(wet);
    return { shape, gain };
  });
  const hp = c.createBiquadFilter(), lp = c.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 30; hp.Q.value = dampedQ;
  lp.type = "lowpass"; lp.frequency.value = 6500; lp.Q.value = dampedQ;
  wet.connect(hp).connect(lp).connect(output);
  return { input, output, dry, drive, wet, colors, nodes: [input, output, dry, drive, wet, hp, lp, ...colors.flatMap(x => [x.shape, x.gain])] };
}
export class Drone {
  constructor() {
    this.settings = { ...defaults };
    this.voices = Array(6).fill(null);
    this.generation = 0;
    this.retiring = new Set();
  }
  async ready() {
    if (!this.ctx) {
      const c = (this.ctx = new AudioContext());
      this.input = c.createGain();
      this.core = c.createGain(); this.core.connect(this.input);
      this.processed = c.createGain();
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.dry = c.createGain();
      this.wet = c.createGain();
      this.echo = c.createGain();
      this.feedback = c.createGain();
      this.delay = c.createDelay(1.5);
      this.processed.connect(this.dry).connect(this.master);
      this.texture();
      this.processed.connect(this.space.input);
      this.space.output.connect(this.wet).connect(this.wetInput);
      this.processed.connect(this.delay);
      this.delay.connect(this.echo).connect(this.wetInput);
      const filter = c.createBiquadFilter();
      filter.frequency.value = 2400;
      this.delay.connect(filter).connect(this.feedback).connect(this.delay);
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 12;
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 512;
      // Dedicated final chapter gate includes every dry/wet/feedback tail.
      this.chapterGate = c.createGain();
      this.outputDC = c.createBiquadFilter(); this.outputDC.type = 'highpass';
      this.outputDC.frequency.value = 25; this.outputDC.Q.value = dampedQ;
      this.safety = c.createWaveShaper();
      this.safety.curve = Float32Array.from({length:8193},(_,i)=>.8*Math.tanh((i/4096-1)/.8));
      this.safety.oversample = '4x';
      this.master.connect(this.outputDC).connect(comp).connect(this.safety).connect(this.chapterGate).connect(this.analyser).connect(c.destination);
      this.preparing = Promise.all([this.prepareCrush(), createSynthesis(c,this.core,this.input).then(layer=>this.synthesis=layer)]).then(() => this.update(this.settings));
      this.update(this.settings);
    }
    await Promise.all([this.ctx.resume(), this.preparing]);
  }
  texture() {
    const c = this.ctx;
    this.dryMod = c.createGain();
    this.dryMod.gain.value = 0;
    this.modulators = [driftSignal(c, 97, 17, 397)];
    this.modulators[0].connect(this.dryMod);
    this.echoMod = c.createGain(); this.echoMod.gain.value = 0;
    this.modulators[0].connect(this.echoMod).connect(this.delay.delayTime);
    this.wetInput = c.createGain();
    this.space = createReverb(c, this.modulators[0]);
    this.crushInput = c.createGain();
    this.crushDry = c.createGain();
    this.crushWet = c.createGain(); this.crushWet.gain.value = 0;
    this.crushInput.connect(this.crushDry).connect(this.master);
    this.crushInput.connect(this.crushWet);
    const hpCrush = c.createBiquadFilter(), lpCrush = c.createBiquadFilter();
    hpCrush.type = "highpass"; hpCrush.frequency.value = 80; hpCrush.Q.value = dampedQ;
    lpCrush.type = "lowpass"; lpCrush.frequency.value = 4800; lpCrush.Q.value = dampedQ;
    this.crushOutput = hpCrush; hpCrush.connect(lpCrush).connect(this.master);
    this.wetInput.connect(this.crushInput);
    this.fullCrush = c.createGain(); this.fullCrush.gain.value = 0;
    this.processed.connect(this.fullCrush).connect(this.crushInput);
    this.spectralInput = c.createGain();
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 650;
    lp.type = "lowpass"; lp.frequency.value = 6200;
    hp.Q.value = lp.Q.value = dampedQ;
    this.saturation = saturation(c);
    this.input.connect(this.saturation.input);
    this.saturation.output.connect(this.processed);
    this.spectralInput.connect(hp).connect(lp);
    this.spectralWet = c.createGain(); this.spectralWet.gain.value = 0;
    lp.connect(this.spectralWet).connect(this.space.input);
  }
  async prepareCrush() {
    const c = this.ctx;
    try {
      if (!c.audioWorklet) throw new Error("AudioWorklet unavailable");
      await c.audioWorklet.addModule(new URL("./crush-worklet.js", import.meta.url));
      this.crusher = new AudioWorkletNode(c, "drift-crush");
      this.crushMode = "worklet";
    } catch {
      // Native quantizer fallback: no main-thread audio callbacks, valid on file:// too.
      this.crusher = c.createWaveShaper();
      this.crusher.curve = Float32Array.from({length: 65537}, (_, i) =>
        Math.round((i / 32768 - 1) * 128) / 128);
      this.crushMode = "quantizer fallback";
    }
    if (this.crushMode === 'quantizer fallback') {
      this.fallbackDry = c.createGain(); this.fallbackWet = c.createGain();
      this.fallbackWet.gain.value = 0;
      const coarse = c.createWaveShaper(); coarse.oversample = '4x';
      coarse.curve = Float32Array.from({length:65537},(_,i)=>Math.round((i/32768-1)*4)/4);
      this.crushWet.connect(this.crusher).connect(this.fallbackDry).connect(this.crushOutput);
      this.crushWet.connect(coarse).connect(this.fallbackWet).connect(this.crushOutput);
    } else this.crushWet.connect(this.crusher).connect(this.crushOutput);
  }
  voiceTexture(v, index) {
    if (v.motionGain) return;
    const c = this.ctx;
    const motion = driftSignal(c, 83 + index * 8, 3 + index, 127 + index * 10);
    const breath = driftSignal(c, 173, 3, 41);
    const amplitude = c.createGain(), global = c.createGain();
    v.motionGain = c.createGain(); v.motionGain.gain.value = 1;
    v.gain.disconnect(); v.gain.connect(v.motionGain).connect(this.core);
    v.spectralEnvelope.disconnect(); v.spectralEnvelope.connect(v.motionGainSpectral = c.createGain()).connect(this.spectralInput);
    v.motionGainSpectral.gain.value = 1;
    motion.connect(amplitude); breath.connect(global);
    for (const node of [v.motionGain, v.motionGainSpectral]) {
      amplitude.connect(node.gain); global.connect(node.gain);
    }
    v.beatMod = c.createGain(); motion.connect(v.beatMod).connect(v.oscs[1].detune);
    v.textureNodes = [motion, breath, amplitude, global, v.motionGain, v.motionGainSpectral, v.beatMod];
    v.amplitude = amplitude; v.breath = global;
  }
  updateVoiceTexture(v, index) {
    const t = this.ctx.currentTime, s = this.settings;
    const p = (param, value) => param.setTargetAtTime(value, t, .7);
    this.voiceTexture(v, index);
    // Existing two fundamentals supply the beat; independent cents offsets and motion.
    p(v.oscs[1].detune, s.detune + (s.instability * .85) * (1.1 + index * .41));
    p(v.beatMod.gain, (s.instability * .85) * 1.2);
    for (const node of [v.motionGain, v.motionGainSpectral]) p(node.gain, 1 - .32 * Math.min(1.8,s.turbulence));
    p(v.amplitude.gain, .22 * s.turbulence); p(v.breath.gain, .08 * s.turbulence);
    if (s.wandering > 0 && !v.howl) {
      v.howl = this.ctx.createOscillator(); v.howl.type = "sine";
      v.howlGain = this.ctx.createGain(); v.howlGain.gain.value = 0;
      v.howl.frequency.value = frequency(v.midi) * 3;
      v.howl.connect(v.howlGain).connect(v.spectralEnvelope);
      v.wanderMod = this.ctx.createGain(); v.wanderMod.gain.value = 19;
      v.textureNodes[0].connect(v.wanderMod).connect(v.howl.detune);
      v.howlBreath = this.ctx.createGain();
      v.textureNodes[1].connect(v.howlBreath).connect(v.howlGain.gain);
      v.textureNodes.push(v.howlGain, v.wanderMod, v.howlBreath);
      v.howl.start(); this.dryMod.connect(v.howl.detune);
    }
    if (v.howl) {
      const hz = Math.min(this.ctx.sampleRate * .2, 4200, frequency(v.midi) * (index % 2 ? 3 : 4));
      p(v.howl.frequency, hz);
      p(v.wanderMod.gain, 19 * (1 + Math.max(0,s.wandering-0.65)*2));
      // No recursive path. Envelope bounds <= .20 of a .035 voice; six voices <= .042.
      p(v.howlGain.gain, .11 * Math.min(1,s.wandering));
      p(v.howlBreath.gain, .09 * Math.min(1,s.wandering));
    }
  }
  update(s) {
    const previous = this.settings;
    this.settings = sanitize(s);
    if (!this.ctx) return;
    const t = this.ctx.currentTime,
      p = (n, v) => n.setTargetAtTime(v, t, 0.035),
      s2 = this.settings;
    this.synthesis?.set(s2,this.voices.map(v=>v&&!v.muted?v.midi:null),this.running);
    p(this.crushDry.gain, 1 - .75 * Math.min(1,s2.crush));
    p(this.crushWet.gain, .75 * Math.min(1,s2.crush));
    this.crusher?.parameters?.get("amount")?.setTargetAtTime(s2.crush, t, .1);
    if (this.fallbackWet) {
      const harsh = Math.max(0,Math.min(1,(s2.crush-.85)/.85));
      p(this.fallbackDry.gain,1-harsh); p(this.fallbackWet.gain,harsh);
    }
    p(this.master.gain, this.running ? s2.volume : 0);
    p(this.dry.gain, (1 - Math.min(1,s2.reverb)) * (1-s2.crushPost));
    p(this.wet.gain, Math.min(1,s2.reverb) * 2);
    p(this.echo.gain, Math.min(.65,s2.delay));
    p(this.delay.delayTime, s2.time);
    p(this.feedback.gain, s2.feedback);
    p(this.fullCrush.gain, (1-Math.min(1,s2.reverb))*s2.crushPost);
    p(this.dryMod.gain, s2.instability * 4);
    p(this.echoMod.gain, Math.max(0,s2.delay-.52)/.52*.04);
    p(this.spectralWet.gain, Math.min(1.7,s2.shimmer)*2);
    this.space.set(s2,t);
    const stage=this.saturation;
    const {gain, mix, compensation, weights}=saturationSettings(s2);
    p(stage.dry.gain,1-mix);p(stage.wet.gain,mix);
    p(stage.drive.gain,gain);
    weights.forEach((weight,j)=>p(stage.colors[j].gain.gain,weight*compensation));
    this.voices.forEach((v, i) => {
      if (!v) return;
      v.oscs.forEach((o, j) => p(o.detune, j ? s2.detune : -s2.detune));
      this.updateVoiceTexture(v, i);
      if (previous.bloom === 0 && s2.bloom > 0) v.bloomStart = t;
      if (["harmonics", "inharmonicity", "glide"].some((k) => previous[k] !== s2[k]))
        this.spectrum(v);
      else if (previous.bloom !== s2.bloom) {
        this.spectrum(v, false);
      }
    });
  }
  scheduleChapter(position, number) {
    if (!this.ctx || !this.chapterGate) return;
    const t=this.ctx.currentTime, p=this.chapterGate.gain;
    const gain = number>1 && position<12000 ? Math.sin(position/12000*Math.PI/2)**2 :
      position>892000 ? Math.cos(Math.min(1,(position-892000)/8000)*Math.PI/2)**2 : 1;
    p.cancelScheduledValues(t); p.setValueAtTime(gain,t);
    if(number>1 && position<12000) p.linearRampToValueAtTime(1,t+(12000-position)/1000);
    p.setValueAtTime(1,t+Math.max(0,(892000-position)/1000));
    if(position>=892000) { p.cancelScheduledValues(t); p.setValueAtTime(gain,t); }
    p.linearRampToValueAtTime(0,t+Math.max(.001,(900000-position)/1000));
  }
  async newChapter(notes) {
    // At zero output, discard all delay/convolution state and old oscillators.
    // Closing also releases worklets and modulators; graph size stays bounded.
    if (this.ctx) this.ctx.onstatechange = null;
    await this.dispose();
    await this.ready();
    this.chapterGate.gain.value = 0;
    this.running = true; this.master.gain.value = this.settings.volume;
    this.move(notes);
  }
  async play(notes) {
    const id = ++this.generation;
    await this.ready();
    if (id !== this.generation) return;
    this.clearRetiring();
    this.running = true;
    this.master.gain.setTargetAtTime(
      this.settings.volume,
      this.ctx.currentTime,
      0.03,
    );
    this.move(notes);
  }
  move(notes) {
    if (!this.running) return;
    const c = this.ctx,
      t = c.currentTime,
      s = this.settings;
    notes.forEach((n, i) => {
      let v = this.voices[i];
      if (n === null) {
        if (v && !v.muted) {
          v.muted = true;
          envelope(v, "cancelAndHoldAtTime", t);
          envelope(v, "linearRampToValueAtTime", 0, t + s.release);
        }
        return;
      }
      if (!v) {
        const gain = c.createGain();
        gain.gain.value = 0;
        gain.connect(this.core);
        const spectralEnvelope = c.createGain();
        spectralEnvelope.gain.value = 0;
        spectralEnvelope.connect(this.spectralInput);
        const tone = c.createGain();
        tone.connect(gain);
        const oscs = [-s.detune, s.detune].map((d) => {
          const o = c.createOscillator();
          o.type = "sine";
          o.detune.value = d;
          o.frequency.value = frequency(n);
          this.dryMod.connect(o.detune);
          o.connect(tone);
          o.start();
          return o;
        });
        v = this.voices[i] = { gain, spectralEnvelope, tone, oscs, partials: [], midi: n, bloomStart: t };
        envelope(v, "linearRampToValueAtTime", 0.035, t + s.attack);
        envelope(v, "linearRampToValueAtTime",
          0.035 * s.sustain,
          t + s.attack + s.decay,
        );
      } else {
        if (v.midi !== n || v.muted) v.bloomStart = t;
        v.midi = n;
        const unmuting = v.muted;
        v.muted = false;
        v.oscs.forEach((o) => {
          o.frequency.cancelAndHoldAtTime(t);
          o.frequency.exponentialRampToValueAtTime(frequency(n), t + s.glide);
        });
        envelope(v, "cancelAndHoldAtTime", t);
        if (unmuting) {
          envelope(v, "linearRampToValueAtTime", 0.035, t + s.attack);
          envelope(v, "linearRampToValueAtTime",
            0.035 * s.sustain,
            t + s.attack + s.decay,
          );
        } else envelope(v, "linearRampToValueAtTime", 0.035 * s.sustain, t + 0.08);
      }
      this.updateVoiceTexture(v, i);
      this.spectrum(v);
    });
    this.synthesis?.set(this.settings,notes,true);
  }
  spectrum(v, retune = true) {
    const c = this.ctx, t = c.currentTime, s = this.settings;
    const creating = (s.harmonics > 0 || s.bloom > 0) && !v.partials.length;
    if (creating) {
      v.partials = partials.map((_, i) => {
        const osc = c.createOscillator(), gain = c.createGain(), send = c.createGain();
        send.gain.value = 0;
        osc.connect(send).connect(v.spectralEnvelope);
        this.dryMod.connect(osc.detune);
        osc.type = "sine";
        osc.frequency.value = partialTarget(v.midi, i, s.harmonics > 0 ? s : { ...s, inharmonicity: 0 }, c.sampleRate).frequency;
        gain.gain.value = 0;
        osc.connect(gain).connect(v.gain);
        osc.start();
        const hz = osc.frequency.value;
        return { osc, gain, send, motion: { from: hz, to: hz, start: t, end: t } };
      });
    }
    const pitchSettings = s.harmonics > 0 ? s : { ...s, inharmonicity: 0 };
    const targets = partials.map((_, i) => partialTarget(v.midi, i, pitchSettings, c.sampleRate));
    // Every endpoint has the legacy absolute amplitude budget of 2. Linear
    // interpolation between endpoints preserves that bound, including interrupts.
    const params = [v.tone.gain, ...v.partials.map(p => p.gain.gain)];
    params.forEach(p => p.cancelAndHoldAtTime(t));
    v.partials.forEach(p => p.send.gain.cancelAndHoldAtTime(t));
    const end = Math.max(t + 0.08, v.bloomStart + 12);
    const times = [t + 0.08];
    if (s.bloom > 0) {
      for (let at = t + 0.33; at < end; at += 0.5) times.push(at);
      if (end > times[0]) times.push(end);
    }
    for (const at of times) {
      const levels = spectrumLevels(targets, s, at - v.bloomStart);
      v.partials.forEach((p, i) => {
        // Only Bloom's 3rd/4th/6th partials, independent of Harmonics level.
        const amount = i === 0 ? 0 : 2 * s.bloom * bloomWeights[i] *
          bloomLevel(i, at - v.bloomStart) * levels.core * targets[i].weight / partials[i].weight;
        p.send.gain.linearRampToValueAtTime(amount, at);
      });
      [levels.core, ...levels.partials].forEach((value, i) =>
        params[i]?.linearRampToValueAtTime(value, at));
    }
    v.partials.forEach((p, i) => {
      const target = targets[i];
      // Track the exponential trajectory independently of AudioParam.value.
      // Explicitly anchor interruptions, including multiple events in one audio quantum.
      if (!creating && retune) {
        const held = partialFrequencyAt(p.motion, t);
        p.osc.frequency.cancelScheduledValues(t);
        p.osc.frequency.setValueAtTime(held, t);
        p.osc.frequency.exponentialRampToValueAtTime(target.frequency, t + target.glide);
        p.motion = { from: held, to: target.frequency, start: t, end: t + target.glide };
      }
    });
  }
  clearRetiring() {
    for (const v of this.retiring) {
      oscillators(v).forEach((o) => {
        o.onended = null;
        try {
          o.stop();
        } catch {}
        o.disconnect();
      });
      oscillators(v).forEach(o => this.dryMod.disconnect(o.detune));
      disconnectVoice(v);
    }
    this.retiring.clear();
  }
  retire(v, fast = false) {
    this.retiring.add(v);
    const t = this.ctx.currentTime,
      r = fast ? 0.025 : this.settings.release;
    envelope(v, "cancelAndHoldAtTime", t);
    envelope(v, "linearRampToValueAtTime", 0, t + r);
    const sources = oscillators(v);
    let remaining = sources.length;
    sources.forEach((o) => {
      o.onended = () => {
        o.disconnect();
        if (--remaining === 0) {
          oscillators(v).forEach(o => this.dryMod.disconnect(o.detune));
          disconnectVoice(v);
          this.retiring.delete(v);
        }
      };
      o.stop(t + r + 0.01);
    });
  }
  stop() {
    ++this.generation;
    this.running = false;
    this.synthesis?.set(this.settings,Array(6).fill(null),false);
    this.synthesis?.flush();
    if (!this.ctx) return;
    this.voices.forEach((v) => v && this.retire(v));
    this.voices.fill(null);
    this.master.gain.cancelAndHoldAtTime(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(
      0,
      this.ctx.currentTime + this.settings.release,
    );
  }
  async dispose() {
    this.stop();
    this.modulators?.forEach(source => { source.stop(); source.disconnect(); });
    this.saturation?.nodes.forEach(n => n.disconnect());
    this.space?.dispose();
    this.synthesis?.dispose(); this.synthesis=null;
    await this.ctx?.close();
    this.clearRetiring();
    this.ctx = null; this.fallbackDry = this.fallbackWet = null;
  }
}
