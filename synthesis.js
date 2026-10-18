import { SynthesisDSP } from './synthesis-dsp.js';
export async function createSynthesis(ctx,input,output) {
 let node,dsp,mode;
 try { await ctx.audioWorklet.addModule(new URL('./synthesis-worklet.js',import.meta.url)); node=new AudioWorkletNode(ctx,'drift-synthesis',{outputChannelCount:[1]}); mode='worklet'; }
 catch {
  // Legacy fallback has identical bounded DSP; larger blocks reduce callback overhead.
  if(!ctx.createScriptProcessor) return {mode:'unavailable',set(){},flush(){},dispose(){}};
  dsp=new SynthesisDSP(ctx.sampleRate); node=ctx.createScriptProcessor(1024,1,1); mode='compatibility';
  node.onaudioprocess=e=>{ const a=e.inputBuffer.getChannelData(0),b=e.outputBuffer.getChannelData(0); for(let i=0;i<b.length;i++)b[i]=dsp.sample(a[i]); };
 }
 input.connect(node); node.connect(output);
 return {mode,set(values,notes,active){if(dsp)dsp.set(values,notes,active);else node.port.postMessage({values,notes,active});},
 flush(){if(dsp)dsp.flush();else node.port.postMessage({flush:true});},
 dispose(){input.disconnect(node);node.disconnect();node.onaudioprocess=null;node.port?.close();}};
}
