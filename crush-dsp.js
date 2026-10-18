// Bounded stereo sample/hold with a prefilter, DC rejection and reconstruction.
export class CrushDSP {
  constructor(rate) { this.rate = rate; this.channels = []; }
  sample(x, channel, amount) {
    const s = this.channels[channel] ||= {phase:1, low:0, held:0, out:0, dc:0};
    const a = Math.max(0, Math.min(1.7, Number.isFinite(amount) ? amount : 0));
    const hz = 18000 * (1200 / 18000) ** a;
    const alpha = 1 - Math.exp(-2 * Math.PI * Math.min(4500, hz * .35) / this.rate);
    s.low += alpha * ((Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0) - s.low);
    s.phase += hz / this.rate;
    if (s.phase >= 1) {
      s.phase %= 1;
      const steps = 2 ** Math.max(2,14 - 9 * a);
      s.held = Math.round(s.low * steps) / steps;
    }
    s.out += alpha * (s.held - s.out);
    s.dc += .002 * (s.out - s.dc);
    return Math.max(-1, Math.min(1, s.out - s.dc));
  }
}
