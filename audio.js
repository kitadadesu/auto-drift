import { frequency } from "./music.js";
// LP/HP WebAudio Q is in dB: -3.0103 dB is the nonresonant Butterworth value (Q=1/√2).
export const dampedQ = -3.0103;
export const defaults = {
  crush: 0,
  beating: 0,
  turbulence: 0,
  wandering: 0,
  glide: 2.5,
  harmonics: 0,
  bloom: 0.7,
  dryDrift: 0.15,
  wetDrift: 0.35,
  shimmer: 0.35,
  shimmerDecay: 8,
  diffusion: 0.6,
  drive: 0.25,
  character: 0.15,
  saturationMix: 0.4,
  saturationPost: 0,
  inharmonicity: 0.01,
  drift: 0.4,
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
  crush: [0, 1.7], beating: [0, 1.7], turbulence: [0, 1.8], wandering: [0, 1.3],
  glide: [0.02, 8],
  harmonics: [0, 1],
  bloom: [0, 1],
  dryDrift: [0, 2],
  wetDrift: [0, 2],
  shimmer: [0, 1.7],
  shimmerDecay: [1, 21],
  diffusion: [0, 2],
  drive: [0, 1.8],
  character: [0, 2],
  saturationMix: [0, 1.52],
  saturationPost: [0, 1],
  inharmonicity: [0, 1],
  drift: [0, 1],
  detune: [0, 30],
  attack: [0.01, 4],
  decay: [0.01, 4],
  sustain: [0, 1],
  release: [0.03, 5],
  volume: [0, 1],
  reverb: [0, 1.7],
  delay: [0, 1.04],
  time: [0.05, 1.5],
  feedback: [0, 0.65],
};
export function sanitize(s) {
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
  { ratio: 2, stretch: 0.015, weight: 0.30, speed: 0.45 },
  { ratio: 3, stretch: 0.07, weight: 0.22, speed: 1.8 },
  { ratio: 4, stretch: 0.17, weight: 0.14, speed: 3.2 },
  { ratio: 6, stretch: -0.08, weight: 0.09, speed: 5 },
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
// Bloom shares Drift's four sources; it needs neither timers nor more oscillators.
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
    glide: Math.min(30, settings.glide * Math.exp(settings.drift * Math.log(p.speed))) };
}
export function partialFrequencyAt(motion, time) {
  const progress = motion.end <= motion.start ? 1 :
    Math.max(0, Math.min(1, (time - motion.start) / (motion.end - motion.start)));
  return motion.from * (motion.to / motion.from) ** progress;
}
// Independent looping control signals: shallow wow/flutter plus smooth random
// drift. Buffer sources run for the context lifetime, never on UI timers.
function driftSignal(c, duration, wow, flutter) {
  const rate = 3000, buffer = c.createBuffer(1, rate * duration, rate);
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
    return Math.sin(x * 5) / 4;
  });
}
export function characterWeights(x) {
  const asymmetric = Math.max(0, Math.min(1, (x - 0.3) / 0.4));
  const fold = Math.max(0, Math.min(1, (x - 0.7) / 0.3));
  return [1 - asymmetric, asymmetric * (1 - fold), fold];
}
function saturation(c) {
  const input = c.createGain(), output = c.createGain(), dry = c.createGain();
  const drive = c.createGain(), wet = c.createGain();
  wet.gain.value = 0;
  input.connect(dry).connect(output);
  input.connect(drive);
  const colors = [0, 1, 2].map(kind => {
    const shape = c.createWaveShaper(), gain = c.createGain();
    shape.curve = saturationCurve(kind); shape.oversample = "4x";
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
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.dry = c.createGain();
      this.wet = c.createGain();
      this.echo = c.createGain();
      this.feedback = c.createGain();
      this.delay = c.createDelay(1.5);
      this.conv = c.createConvolver();
      const impulse = c.createBuffer(2, c.sampleRate * 3, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = impulse.getChannelData(ch);
        for (let i = 0; i < d.length; i++)
          d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3 * 0.5;
      }
      this.conv.buffer = impulse;
      this.input.connect(this.dry).connect(this.master);
      this.texture();
      this.input.connect(this.conv).connect(this.wet).connect(this.wetInput);
      this.input.connect(this.delay);
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
      this.preparing = this.prepareCrush().then(() => this.update(this.settings));
      this.update(this.settings);
    }
    await Promise.all([this.ctx.resume(), this.preparing]);
  }
  texture() {
    const c = this.ctx;
    this.dryMod = c.createGain();
    this.wetMod = c.createGain();
    this.dryMod.gain.value = 0;
    this.wetMod.gain.value = 0;
    this.modulators = [driftSignal(c, 97, 17, 397), driftSignal(c, 109, 23, 503)];
    this.modulators[0].connect(this.dryMod);
    this.modulators[1].connect(this.wetMod);
    // Over-range delay becomes unstable tape time, never extra loop gain.
    this.echoMod = c.createGain(); this.echoMod.gain.value = 0;
    this.modulators[0].connect(this.echoMod).connect(this.delay.delayTime);
    this.wetInput = c.createGain();
    this.wetBypass = c.createGain();
    this.wetEffect = c.createGain();
    this.wetEffect.gain.value = 0;
    this.wetDelay = c.createDelay(0.03);
    this.wetDelay.delayTime.value = 0.008;
    this.wetMod.connect(this.wetDelay.delayTime);
    this.crushInput = c.createGain();
    this.crushDry = c.createGain();
    this.crushWet = c.createGain(); this.crushWet.gain.value = 0;
    this.crushInput.connect(this.crushDry).connect(this.master);
    this.crushInput.connect(this.crushWet);
    const hpCrush = c.createBiquadFilter(), lpCrush = c.createBiquadFilter();
    hpCrush.type = "highpass"; hpCrush.frequency.value = 80; hpCrush.Q.value = dampedQ;
    lpCrush.type = "lowpass"; lpCrush.frequency.value = 4800; lpCrush.Q.value = dampedQ;
    this.crushOutput = hpCrush; hpCrush.connect(lpCrush).connect(this.master);
    this.wetInput.connect(this.wetBypass).connect(this.crushInput);
    this.wetInput.connect(this.wetDelay).connect(this.wetEffect).connect(this.crushInput);
    this.spectralInput = c.createGain();
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 650;
    lp.type = "lowpass"; lp.frequency.value = 6200;
    hp.Q.value = lp.Q.value = dampedQ;
    this.preSaturation = saturation(c);
    this.postSaturation = saturation(c);
    this.spectralInput.connect(hp).connect(lp).connect(this.preSaturation.input);
    // Short Schroeder allpasses smear onsets; each feedback is fixed below unity.
    this.diffuseBypass = c.createGain();
    this.diffuseWet = c.createGain();
    this.diffuseWet.gain.value = 0;
    const reverbInput = c.createGain();
    this.preSaturation.output.connect(this.diffuseBypass).connect(reverbInput);
    let chain = this.preSaturation.output;
    for (const seconds of [0.017, 0.023, 0.031]) {
      const delay = c.createDelay(0.04), direct = c.createGain();
      const feedback = c.createGain(), out = c.createGain();
      delay.delayTime.value = seconds;
      direct.gain.value = -0.45; feedback.gain.value = 0.45;
      const delayed = c.createGain();
      delayed.gain.value = 1 - 0.45 ** 2;
      chain.connect(delay).connect(delayed).connect(out);
      chain.connect(direct).connect(out);
      delay.connect(feedback).connect(delay);
      chain = out;
    }
    chain.connect(this.diffuseWet).connect(reverbInput);
    this.spectralWet = c.createGain();
    this.spectralWet.gain.value = 0;
    this.spectralWet.connect(this.postSaturation.input);
    this.postSaturation.output.connect(this.wetInput);
    // Four damped combs, with bounded RT60 feedback and a conservative return.
    // No connection returns to the voice or ordinary reverb input.
    this.tailLines = [0.211, 0.239, 0.269, 0.293].map(seconds => {
      const delay = c.createDelay(0.4), damping = c.createBiquadFilter(), highpass = c.createBiquadFilter();
      const feedback = c.createGain(), level = c.createGain();
      delay.delayTime.value = seconds;
      damping.type = "lowpass"; damping.frequency.value = 4200;
      damping.Q.value = dampedQ; // monotone response: magnitude never exceeds unity
      highpass.type = "highpass"; highpass.frequency.value = 180; highpass.Q.value = dampedQ;
      level.gain.value = 0.08;
      feedback.gain.value = 0;
      reverbInput.connect(delay).connect(damping).connect(level).connect(this.spectralWet);
      damping.connect(highpass).connect(feedback).connect(delay);
      return { seconds, feedback, damping, highpass, level };
    });
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
    v.gain.disconnect(); v.gain.connect(v.motionGain).connect(this.input);
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
    p(v.oscs[1].detune, s.detune + s.beating * (1.1 + index * .41));
    p(v.beatMod.gain, s.beating * 1.2);
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
    p(this.crushDry.gain, 1 - .75 * Math.min(1,s2.crush));
    p(this.crushWet.gain, .75 * Math.min(1,s2.crush));
    this.crusher?.parameters?.get("amount")?.setTargetAtTime(s2.crush, t, .1);
    if (this.fallbackWet) {
      const harsh = Math.max(0,Math.min(1,(s2.crush-.85)/.85));
      p(this.fallbackDry.gain,1-harsh); p(this.fallbackWet.gain,harsh);
    }
    p(this.master.gain, this.running ? s2.volume : 0);
    p(this.dry.gain, 1 - Math.min(1,s2.reverb) * 0.45);
    p(this.wet.gain, Math.min(.85,s2.reverb * 0.55));
    p(this.echo.gain, Math.min(.65,s2.delay));
    p(this.delay.delayTime, s2.time);
    p(this.feedback.gain, s2.feedback);
    p(this.dryMod.gain, s2.dryDrift * 4); // maximum ±8 cents, additive to Detune
    p(this.wetMod.gain, s2.wetDrift * 0.0006 + Math.max(0,s2.shimmer-.85)*.001);
    p(this.echoMod.gain, Math.max(0,s2.delay-.52)/.52*.04);
    p(this.wetBypass.gain, s2.wetDrift === 0 ? 1 : 0);
    p(this.wetEffect.gain, s2.wetDrift === 0 ? 0 : 1);
    p(this.spectralWet.gain, Math.min(1,s2.shimmer));
    p(this.diffuseBypass.gain, 1 - Math.min(1,s2.diffusion));
    p(this.diffuseWet.gain, Math.min(1,s2.diffusion));
    [this.preSaturation, this.postSaturation].forEach((stage, i) => {
      const placement = i ? s2.saturationPost : 1 - s2.saturationPost;
      const mix = s2.drive === 0 ? 0 : Math.min(.95,s2.saturationMix) * placement;
      p(stage.dry.gain, 1 - mix);
      p(stage.wet.gain, mix);
      // Voices are deliberately quiet; excite the curves then compensate drive.
      p(stage.drive.gain, 1 + s2.drive * 12 + Math.max(0,s2.character-1)*16 + Math.max(0,s2.saturationMix-.76)*8);
      characterWeights(Math.min(1,s2.character)).forEach((weight, j) =>
        p(stage.colors[j].gain.gain, weight / (1 + s2.drive * 6)));
    });
    this.tailLines.forEach(({ seconds, feedback, damping }) => {
      p(feedback.gain, Math.min(0.94, 10 ** (-3 * seconds / s2.shimmerDecay)));
      p(damping.frequency, 4200 / (1 + Math.max(0,s2.reverb-.85)*2 + Math.max(0,s2.diffusion-1)*3));
    });
    this.voices.forEach((v, i) => {
      if (!v) return;
      v.oscs.forEach((o, j) => p(o.detune, j ? s2.detune : -s2.detune));
      this.updateVoiceTexture(v, i);
      if (previous.bloom === 0 && s2.bloom > 0) v.bloomStart = t;
      if (["harmonics", "inharmonicity", "drift", "glide"].some((k) => previous[k] !== s2[k]))
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
        gain.connect(this.input);
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
        osc.frequency.value = partialTarget(v.midi, i, s.harmonics > 0 ? s : { ...s, inharmonicity: 0, drift: 0 }, c.sampleRate).frequency;
        gain.gain.value = 0;
        osc.connect(gain).connect(v.gain);
        osc.start();
        const hz = osc.frequency.value;
        return { osc, gain, send, motion: { from: hz, to: hz, start: t, end: t } };
      });
    }
    const pitchSettings = s.harmonics > 0 ? s : { ...s, inharmonicity: 0, drift: 0 };
    const targets = partials.map((_, i) => partialTarget(v.midi, i, pitchSettings, c.sampleRate));
    // Every endpoint has the legacy absolute amplitude budget of 2. Linear
    // interpolation between endpoints preserves that bound, including interrupts.
    const params = [v.tone.gain, ...v.partials.map(p => p.gain.gain)];
    params.forEach(p => p.cancelAndHoldAtTime(t));
    v.partials.forEach(p => p.send.gain.cancelAndHoldAtTime(t));
    const end = Math.max(t + 0.08, v.bloomStart + 12);
    const times = [t + 0.08];
    if (s.bloom > 0) {
      for (let at = t + 0.33; at < end; at += 0.25) times.push(at);
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
    [this.preSaturation, this.postSaturation].forEach(stage => stage?.nodes.forEach(n => n.disconnect()));
    await this.ctx?.close();
    this.clearRetiring();
    this.ctx = null; this.fallbackDry = this.fallbackWet = null;
  }
}
