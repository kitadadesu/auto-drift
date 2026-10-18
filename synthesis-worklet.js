import { SynthesisDSP } from './synthesis-dsp.js';
class SynthesisProcessor extends AudioWorkletProcessor {
 constructor() { super(); this.dsp=new SynthesisDSP(sampleRate); this.port.onmessage=({data})=>{ if(data.flush)this.dsp.flush(); else this.dsp.set(data.values,data.notes,data.active); }; }
 process(inputs,outputs) { const input=inputs[0]?.[0],out=outputs[0]; for(let i=0;i<out[0].length;i++){ const v=this.dsp.sample(input?.[i]||0); for(const ch of out)ch[i]=v; } return true; }
}
registerProcessor('drift-synthesis',SynthesisProcessor);
