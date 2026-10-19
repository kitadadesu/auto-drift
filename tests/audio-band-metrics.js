// Hann-windowed radix-2 FFT. Ratios describe spectra, not perceived quality.
export function bandMetrics(samples, offset, sampleRate) {
 const n=4096,re=new Float64Array(n),im=new Float64Array(n);
 for(let i=0;i<n;i++)re[i]=(samples[offset+i]||0)*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let size=2;size<=n;size*=2)for(let start=0;start<n;start+=size)for(let j=0;j<size/2;j++){
  const a=-2*Math.PI*j/size,c=Math.cos(a),s=Math.sin(a),k=start+j,l=k+size/2;
  const r=re[l]*c-im[l]*s,v=re[l]*s+im[l]*c;
  re[l]=re[k]-r;im[l]=im[k]-v;re[k]+=r;im[k]+=v;
 }
 let total=0,high=0,weighted=0,logs=0,count=0;
 for(let i=1;i<n/2;i++){
  const hz=i*sampleRate/n,p=re[i]**2+im[i]**2;
  total+=p;weighted+=p*hz;if(hz>=4000)high+=p;
  logs+=Math.log(Math.max(1e-24,p));count++;
 }
 return {above4k:high/Math.max(total,1e-24),centroidHz:weighted/Math.max(total,1e-24),flatness:Math.exp(logs/count)/(total/count+1e-24)};
}
