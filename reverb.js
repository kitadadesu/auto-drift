// One four-comb/two-allpass space for the full band and Bloom shimmer.
// Separate passive loops, strictly sub-unity RT60 gain and nonresonant damping.
// No nonlinear element or shimmer recirculation in the loop.
export function createReverb(c, modulation) {
 const input=c.createGain(), output=c.createGain(), diffuse=c.createGain(), direct=c.createGain();
 const nodes=[input,output,diffuse,direct];
 input.connect(direct); let chain=input;
 for(const seconds of [.0071,.0113]) {
  const delay=c.createDelay(.03), feedback=c.createGain(), dry=c.createGain(), out=c.createGain(), tap=c.createGain();
  delay.delayTime.value=seconds;feedback.gain.value=.5;dry.gain.value=-.5;tap.gain.value=.75;
  chain.connect(delay).connect(tap).connect(out);chain.connect(dry).connect(out);delay.connect(feedback).connect(delay);
  nodes.push(delay,feedback,dry,out,tap);chain=out;
 }
 const feed=c.createGain();direct.connect(feed);chain.connect(diffuse).connect(feed);nodes.push(feed);
 const lines=[.0311,.0437,.0593,.0739].map((seconds,i)=>{
  const delay=c.createDelay(.4), low=c.createBiquadFilter(), high=c.createBiquadFilter(), feedback=c.createGain(), motion=c.createGain(), level=c.createGain();
  motion.gain.value=0;delay.delayTime.value=seconds;low.type='lowpass';low.frequency.value=6000;low.Q.value=-3.0103;
  high.type='highpass';high.frequency.value=65;high.Q.value=-3.0103;feedback.gain.value=0;level.gain.value=.25;
  feed.connect(delay);delay.connect(low).connect(high).connect(feedback);
  // Alternating output polarity avoids a mono DC-heavy sum, with unequal delays.
  high.connect(level);
  if(c.createStereoPanner){const pan=c.createStereoPanner();pan.pan.value=[-.85,.65,-.35,.95][i];level.connect(pan).connect(output);nodes.push(pan);}else level.connect(output);
  level.gain.value=i===3?-.25:.25;
  modulation.connect(motion).connect(delay.delayTime);
  nodes.push(delay,low,high,feedback,motion,level);
  return {seconds,delay,low,high,feedback,motion};
 });
 // Separate passive loops avoid browser-dependent cross-cycle scheduling.
 for(const l of lines) l.feedback.connect(l.delay);
 return {input,output,lines,nodes,set(s,t){
  const p=(n,v)=>n.setTargetAtTime(v,t,.15),scale=.45+s.reverbSize*2.55;
  p(direct.gain,1-s.reverbDensity*.7);p(diffuse.gain,s.reverbDensity*.7);
  for(const [i,l] of lines.entries()){
   const seconds=l.seconds*scale;p(l.delay.delayTime,seconds);
   p(l.feedback.gain,Math.min(.997,10**(-3*seconds/s.reverbDecay)));
   p(l.low.frequency,6500/(1+s.reverbDensity*2));
   p(l.motion.gain,s.reverbMotion*.0007*(i%2?-1:1));
  }
 },dispose(){for(const n of nodes)n.disconnect();}};
}
