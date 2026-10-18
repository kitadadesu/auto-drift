import { CrushDSP } from './crush-dsp.js';
class DriftCrush extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{name:'amount',defaultValue:0,minValue:0,maxValue:1.7,automationRate:'k-rate'}];
  }
  constructor() { super(); this.dsp = new CrushDSP(sampleRate); }
  process(inputs, outputs, parameters) {
    outputs[0].forEach((out, ch) => {
      const input = inputs[0]?.[ch] || inputs[0]?.[0];
      for (let i=0;i<out.length;i++) out[i] = this.dsp.sample(input?.[i] || 0, ch, parameters.amount[0]);
    });
    return true;
  }
}
registerProcessor('drift-crush', DriftCrush);
