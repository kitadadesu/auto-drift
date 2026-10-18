// Bijective hue indexing across 24 keys × the current scene identities.
import { textureScenes } from './texture.js';
export const sceneNames = Object.keys(textureScenes);
export function colorLuminance(h,s,l) {
  const a=s*Math.min(l,1-l);
  return [0,8,4].map(n=>{const k=(n+h/30)%12;const v=l-a*Math.max(-1,Math.min(k-3,9-k,1));return v<=.04045?v/12.92:((v+.055)/1.055)**2.4})
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
export function palette(key, scene) {
  const sceneIndex = Math.max(0,sceneNames.indexOf(scene));
  const id = (key.tonic*2 + Number(key.mode==='minor'))*sceneNames.length+sceneIndex;
  const hue = (id*137.507764)%360;
  const second = (hue+75+sceneIndex*29)%360;
  const fieldLight = 16+sceneIndex*.65;
  const background = colorLuminance(hue,.72,fieldLight/100);
  let glowLight=70;
  while(glowLight<96 && (colorLuminance(second,.9,glowLight/100)+.05)/(background+.05)<4.5) glowLight++;
  return {id,hue,second,glowLight,accent:`hsl(${hue} 90% 80%)`, glow:`hsl(${second} 90% ${glowLight}%)`,
    base:`hsl(${hue} 65% 9%)`, surface:`hsl(${second} 55% 13%)`,
    field:`hsl(${hue} 72% ${fieldLight}%)`};
}
