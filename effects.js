// v2 public effect API. Legacy history/presets are translated once at the edge.
export const effectModules = ['INSTABILITY','BLOOM','TURBULENCE','FEEDBACK','SATURATION','CRUSH','DELAY','REVERB'];
export const effectDefaults = {instability:.15,reverbSize:.6,reverbDecay:8,reverbDensity:.6,reverbMotion:.35,crushPost:0};
export const effectBounds = {instability:[0,2],reverbSize:[0,1],reverbDecay:[.25,35],reverbDensity:[0,1],reverbMotion:[0,1],crushPost:[0,1]};
export const removedEffectKeys = ['beating','dryDrift','wetDrift','diffusion','shimmerDecay','drift','saturationPost'];
export function migrateEffects(values={}) {
 const s={...values};
 if(!Number.isFinite(s.instability)&&(Number.isFinite(s.dryDrift)||Number.isFinite(s.beating))) s.instability=Math.max(s.dryDrift||0,(s.beating||0)/.85);
 if(!Number.isFinite(s.reverbMotion)&&Number.isFinite(s.wetDrift)) s.reverbMotion=s.wetDrift/2;
 if(!Number.isFinite(s.reverbDensity)&&Number.isFinite(s.diffusion)) s.reverbDensity=s.diffusion/2;
 if(!Number.isFinite(s.reverbDecay)&&Number.isFinite(s.shimmerDecay)) s.reverbDecay=s.shimmerDecay;
 if(!Number.isFinite(s.reverbSize)&&Number.isFinite(s.reverb)) s.reverbSize=Math.min(1,.25+s.reverb*.45);
 if(Number.isFinite(s.reverb))s.reverb=Math.max(0,Math.min(1,s.reverb));
 for(const k of removedEffectKeys) delete s[k];
 return s;
}
