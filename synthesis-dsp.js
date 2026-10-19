// Fixed memory, fixed voice/grain budgets; shared by worklet and compatibility path.
export const sourceDefaults = { fm:0, fmRatio:2, wave:0, noise:0, material:0, granular:0, freeze:0, reverse:0 };
export const sourceBounds = { fm:[0,1], fmRatio:[.5,4], wave:[0,1], noise:[0,1], material:[0,1], granular:[0,1], freeze:[0,1], reverse:[0,1] };
export class SynthesisDSP {
 constructor(rate) {
  this.rate=rate; this.buffer=new Float32Array(Math.ceil(rate*5)); this.write=0; this.filled=0;
  this.voices=Array.from({length:6},()=>({phase:0,mod:0,f:0,a:0,y:0,z:0}));
  this.grains=Array.from({length:8},()=>({age:0,length:0,pos:0,speed:1}));
  this.target={...sourceDefaults}; this.p={...sourceDefaults}; this.notes=Array(6).fill(null);
  this.coefficient=1/(rate*.04); this.voiceEase=1/(rate*.3); this.ampEase=1/(rate*.08);
  this.sleeping=true; this.seed=12345; this.tick=0; this.dc=0; this.last=0; this.active=false;
 }
 set(values,notes,active=true) {
  for(const [k,[lo,hi]] of Object.entries(sourceBounds)) if(Number.isFinite(values[k])) this.target[k]=Math.max(lo,Math.min(hi,values[k]));
  if(notes) this.notes=notes.slice(0,6); this.active=active;
  if(['wave','fm','noise','granular'].some(k=>this.target[k]>0))this.sleeping=false;
  this.wanted=this.notes.map(n=>n===null?0:Math.min(this.rate*.08,440*2**((n-69)/12)));
  // Trigonometric resonator coefficients change at control rate, not 6x/sample.
  this.resonance=this.notes.map((n,i)=>{
   const f=Math.min(this.rate*.18,Math.max(30,(this.wanted[i]||30)*(1+this.target.material*(i%2?.5:1))));
   const r=Math.exp(-Math.PI*(12+80*this.target.material)/this.rate);
   return {c:2*r*Math.cos(2*Math.PI*f/this.rate),r2:r*r,g:1-r};
  });
 }
 capture(x) { this.buffer[this.write]=Math.max(-.8,Math.min(.8,Number.isFinite(x)?x:0));if(++this.write===this.buffer.length)this.write=0;this.filled=Math.min(this.buffer.length,this.filled+1); }
 flush() { this.buffer.fill(0); this.filled=0; this.write=0; this.grains.forEach(g=>g.length=0); }
 sample(input=0) {
  const sr=this.rate,p=this.p;
  if(this.sleeping){if(this.active&&p.freeze<.5)this.capture(input);return 0;}
  // Explicit neutral snap only below -100 dB, after the 40ms smoothing tail.
  let audible=false;
  for(const k in p) { p[k]+=(this.target[k]-p[k])*this.coefficient; if(this.target[k]===0&&Math.abs(p[k])<.00001)p[k]=0; }
  const waveOn=p.wave>.00001, fmOn=p.fm>.00001, noiseOn=p.noise>.00001, grainOn=p.granular>.00001;
  audible=waveOn||fmOn||noiseOn||grainOn;
  if(!audible){
   // Keep the five-second pre-roll even in SINE: Freeze must capture the sound
   // heard immediately before entering a granular scene.
   if(this.active&&p.freeze<.5)this.capture(input);
   for(const g of this.grains)g.length=0;
   this.sleeping=true;this.dc=0;this.last=0;return 0;
  }
  let generated=0;
  this.seed=(1664525*this.seed+1013904223)>>>0; const noise=this.seed/2147483648-1;
  for(let i=0;i<6;i++) {
   const v=this.voices[i],n=this.notes[i];
   const wanted=this.wanted?.[i]||0;
   v.f+=(wanted-v.f)*this.voiceEase; v.a+=((this.active&&n!==null?1:0)-v.a)*this.ampEase;
   if(v.a<.00001)continue;
   v.phase+=v.f/sr; if(v.phase>=1)v.phase-=1;
   if(fmOn){v.mod+=v.f*p.fmRatio/sr; if(v.mod>=1)v.mod%=1;}
   const angle=v.phase*Math.PI*2;
   // Finite additive table: no discontinuous saw/pulse edges. Harmonics below Nyquist.
   let wave=0;
   if(waveOn) for(let h=2;h<=10;h++) if(h*v.f<sr*.35) wave+=Math.sin(angle*h)*(h%2?1:1-p.wave)/h;
   const index=Math.min(6*p.fm*(.65+i*.07),Math.max(0,sr*.3/Math.max(1,v.f)-p.fmRatio-1));
   const fm=fmOn?Math.sin(angle+index*Math.sin(v.mod*Math.PI*2))-Math.sin(angle):0;
   // Stable damped two-pole resonator driven by noise, tuned to each actual voice.
   let y=0;
   if(noiseOn){
    const target=this.resonance[i];
    // Smooth coefficients preserves resonator continuity on tuning/material moves.
    v.c??=target.c;v.r2??=target.r2;v.g??=target.g;
    v.c+=(target.c-v.c)*this.voiceEase;v.r2+=(target.r2-v.r2)*this.voiceEase;v.g+=(target.g-v.g)*this.voiceEase;
    y=v.g*noise+v.c*v.y-v.r2*v.z;v.z=v.y;v.y=y;
   } else {v.y=0;v.z=0;}
   generated+=v.a*(p.wave*wave*.012+p.fm*fm*.018+p.noise*y*.025);
  }
  const mixBudget=1/Math.max(1,p.fm+p.wave+p.noise);
  generated*=mixBudget;
  // Capture upstream audio and synthesis only; granular output never feeds recording.
  if(this.active&&p.freeze<.5)this.capture(input+generated);
  if(++this.tick>=sr/(5+25*p.granular)) {
   this.tick=0;
   if(this.active&&p.granular>.001&&this.filled>sr*.3) {
    const g=this.grains.find(g=>g.length===0);
    if(g) { g.age=0; g.length=Math.floor(sr*(.04+.16*p.granular));
     const delay=sr*.25+(this.seed%Math.max(1,Math.floor(this.filled-sr*.25)));
     g.pos=(this.write-delay+this.buffer.length)%this.buffer.length;
     g.speed=(p.reverse>.5?-1:1)*(p.granular>.65?.5:1); }
   }
  }
  let grains=0;
  for(const g of this.grains) if(g.length) {
   const j=Math.floor(g.pos),frac=g.pos-j;
   grains+=(this.buffer[j]*(1-frac)+this.buffer[(j+1)%this.buffer.length]*frac)*Math.sin(Math.PI*g.age/g.length)**2;
   g.pos=(g.pos+g.speed+this.buffer.length)%this.buffer.length;
   if(++g.age>=g.length) g.length=0;
  }
  const x=generated+grains*p.granular*.18;
  const out=x-this.last+.995*this.dc; this.last=x; this.dc=Number.isFinite(out)?out:0;
  return .4*Math.tanh(this.dc/.4);
 }
}
