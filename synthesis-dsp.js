// Fixed memory, fixed voice/grain budgets; shared by worklet and compatibility path.
export const sourceDefaults = { fm:0, fmRatio:2, wave:0, noise:0, material:0, granular:0, freeze:0, reverse:0 };
export const sourceBounds = { fm:[0,1], fmRatio:[.5,4], wave:[0,1], noise:[0,1], material:[0,1], granular:[0,1], freeze:[0,1], reverse:[0,1] };
export class SynthesisDSP {
 constructor(rate) {
  this.rate=rate; this.buffer=new Float32Array(Math.ceil(rate*5)); this.write=0; this.filled=0;
  this.voices=Array.from({length:6},()=>({phase:0,mod:0,f:0,a:0,y:0,z:0}));
  this.grains=Array.from({length:24},()=>({age:0,length:0,pos:0,speed:1}));
  this.target={...sourceDefaults}; this.p={...sourceDefaults}; this.notes=Array(6).fill(null);
  this.seed=12345; this.tick=0; this.dc=0; this.last=0; this.active=false;
 }
 set(values,notes,active=true) {
  for(const [k,[lo,hi]] of Object.entries(sourceBounds)) if(Number.isFinite(values[k])) this.target[k]=Math.max(lo,Math.min(hi,values[k]));
  if(notes) this.notes=notes.slice(0,6); this.active=active;
 }
 flush() { this.buffer.fill(0); this.filled=0; this.write=0; this.grains.forEach(g=>g.length=0); }
 sample(input=0) {
  const sr=this.rate,p=this.p;
  for(const k in p) p[k]+=(this.target[k]-p[k])/(sr*.04);
  let generated=0;
  this.seed=(1664525*this.seed+1013904223)>>>0; const noise=this.seed/2147483648-1;
  for(let i=0;i<6;i++) {
   const v=this.voices[i],n=this.notes[i];
   const wanted=n===null?0:Math.min(sr*.08,440*2**((n-69)/12));
   v.f+=(wanted-v.f)/(sr*.3); v.a+=((this.active&&n!==null?1:0)-v.a)/(sr*.08);
   v.phase=(v.phase+v.f/sr)%1; v.mod=(v.mod+v.f*p.fmRatio/sr)%1;
   const angle=v.phase*Math.PI*2;
   // Finite additive table: no discontinuous saw/pulse edges. Harmonics below Nyquist.
   let wave=0;
   for(let h=2;h<=10;h++) if(h*v.f<sr*.35) wave+=Math.sin(angle*h)*(h%2?1:1-p.wave)/h;
   const index=Math.min(6*p.fm*(.65+i*.07),Math.max(0,sr*.3/Math.max(1,v.f)-p.fmRatio-1));
   const fm=Math.sin(angle+index*Math.sin(v.mod*Math.PI*2))-Math.sin(angle);
   // Stable damped two-pole resonator driven by noise, tuned to each actual voice.
   const ratio=1+p.material*(i%2?.5:1), f=Math.min(sr*.18,Math.max(30,v.f*ratio));
   const r=Math.exp(-Math.PI*(12+80*p.material)/sr), c=2*r*Math.cos(2*Math.PI*f/sr);
   const y=(1-r)*noise+c*v.y-r*r*v.z; v.z=v.y; v.y=y;
   generated+=v.a*(p.wave*wave*.012+p.fm*fm*.018+p.noise*y*.025);
  }
  const mixBudget=1/Math.max(1,p.fm+p.wave+p.noise);
  generated*=mixBudget;
  // Capture upstream audio and synthesis only; granular output never feeds recording.
  if(this.active&&p.freeze<.5) {
   this.buffer[this.write]=Math.max(-.8,Math.min(.8,input+generated));
   this.write=(this.write+1)%this.buffer.length; this.filled=Math.min(this.buffer.length,this.filled+1);
  }
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
