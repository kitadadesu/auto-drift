import { ActiveClock } from './clock.js';
import { Drone, defaults } from './audio.js';
import { parse, note, analyze } from './music.js';
import { centerKey, keyLabel } from './harmony.js';
import { History } from './history.js';
import { Journey } from './journey.js';
import { palette } from './palette.js';
import { TextureDrift, textureKeys, textureBounds } from './texture.js';
const $ = id => document.getElementById(id);
const engine = new Drone();
// Keep AutoDrift's starting sound clear; the autonomous timeline can travel much farther.
const initialSettings = {...defaults, shimmer:.20, reverb:.24, wetDrift:.23,
  inharmonicity:.01, diffusion:.50, drive:.16, saturationMix:.28, delay:.11};
engine.update(initialSettings);
let journey, texture, requested = false, generation = 0, timer = null, applied = 0;
let lastVoicing = null, resetting = false, paletteId = null, renderedHue = 25, targetHue = 25;
const clock = new ActiveClock();
const wake = new Worker(new URL('./pulse.js', import.meta.url), {type:'module'});
wake.onmessage = () => { try { if (requested) tick(); } finally { wake.postMessage('ack'); } };
const groups = {TEXTURE:['crush','beating','turbulence','wandering'],SPECTRUM:['bloom','harmonics','inharmonicity','drift','detune'], SPACE:['wetDrift','shimmer','shimmerDecay','diffusion','reverb','delay'], COLOR:['dryDrift','drive','character','saturationMix','saturationPost'], ENVELOPE:['glide','attack','decay','sustain','release','time','feedback']};
let activeGroup = 'SPECTRUM';
for (const group of Object.keys(groups)) {
 const tab = document.createElement('button'); tab.textContent=group; tab.id='tab-'+group; tab.setAttribute('role','tab');
 tab.onclick=()=>{activeGroup=group; showGroup();}; $('texture-tabs').append(tab);
}
function showGroup(){
 for(const [group,keys] of Object.entries(groups)){
  const selected=group===activeGroup; $('tab-'+group).setAttribute('aria-selected',selected);
  for(const k of keys) if($('knob-'+k)){const el=$('knob-'+k).closest('label'); el.hidden=!selected; el.setAttribute('role','tabpanel'); el.setAttribute('aria-labelledby','tab-'+group);}
 }
}

const history = new History();
let historyRevision = -1;
const labels = {crush:'Digital Crush',beating:'Beating',turbulence:'Turbulence',wandering:'Wandering Feedback',bloom:'Bloom', harmonics:'Harmonics', inharmonicity:'Inharmonicity', drift:'Spectral Drift',dryDrift:'Dry Tape',wetDrift:'Wet Tape',shimmer:'Shimmer',shimmerDecay:'Shimmer Decay',diffusion:'Diffusion',drive:'Saturation Drive',character:'Character',saturationMix:'Saturation Mix',reverb:'Reverb',delay:'Delay',detune:'Detune',saturationPost:'PRE → POST',glide:'Glide',attack:'Attack',decay:'Decay',sustain:'Sustain',release:'Release',time:'Delay Time',feedback:'Delay Feedback'};
for (const k of textureKeys) {
  const [lo,hi] = textureBounds[k];
  const el = document.createElement('label'); el.className = 'knob';
  el.innerHTML = `<div class="dial" id="dial-${k}" aria-hidden="true"></div>${labels[k]}<input aria-label="${labels[k]}" id="knob-${k}" type="range" min="${lo}" max="${hi}" step="${(hi-lo)/1000}" value="${defaults[k]}"><output id="value-${k}"></output>`;
  $('knobs').append(el);
  el.querySelector('input').oninput = e => {
    try {
      ensureJourney(); texture.manualChange(k,+e.target.value);
      engine.update({...engine.settings,...texture.values}); render();
    } catch(error) { $('status').textContent = error.message; }
  };
}
showGroup();
function ensureJourney() {
  if (journey) return;
  const tokens = $('notes').value.trim().split(/[\s,]+/);
  const notes = tokens.map(t => /^x$/i.test(t) ? null : parse(t));
  if (tokens.length !== 6 || tokens.some((t,i) => notes[i] === null && !/^x$/i.test(t)) || notes.every(n => n === null)) throw new Error('音名を6つ入力してください（例 E2 B2 E3 G3 B3 E4）。休符は x。');
  journey = new Journey(notes, Math.random, {wander:+$('wander').value, edge:+$('edge').value});
  texture = new TextureDrift(initialSettings); texture.start(0);
  history.chapters(journey); history.harmony(journey); history.texture(texture, journey.elapsed);
  transitionPitch(null, notes); if (+$('depth').value !== 1) texture.setDepth(+$('depth').value);
}
function cancelTimer() { timer = null; clock.pause(); wake.postMessage(false); }
function stop(account = true) {
  if (account && requested && !resetting) tick();
  requested = false; ++generation; cancelTimer(); engine.stop();
  $('status').textContent = '停止中 · STARTで同じ旅を再開'; render();
}
async function start() {
  if (resetting) return;
  if (requested && engine.running && engine.ctx?.state === 'running') return;
  try {
    ensureJourney(); requested = true; const id = ++generation;
    $('start').disabled = true; $('stop').disabled = false;
    await engine.play(journey.current);
    if (id !== generation || !requested) { if (!requested) engine.stop(); return; }
    bindAudioState();
    texture.freeze(journey.elapsed); schedule();
    $('status').textContent = '● DRIFTING · 和声と音色が自律演奏中'; render();
  } catch (error) { stop(false); $('status').textContent = error.message; }
}
function bindAudioState() {
    engine.ctx.onstatechange = () => {
      if (engine.ctx.state !== 'running') { if (engine.ctx.state==='suspended') tick(true); cancelTimer(); $('status').textContent = '音声待機中 · STARTで再開'; $('start').disabled = false; }
      else if (requested && timer === null) schedule();
    };
}
function schedule() { cancelTimer(); clock.resume(engine.ctx.currentTime); timer = true; engine.scheduleChapter(journey.chapterTime,journey.chapter); wake.postMessage(true); }
function tick(allowSuspended = false) {
  if (resetting || !requested || (engine.ctx?.state !== 'running' && !(allowSuspended && engine.ctx?.state === 'suspended'))) { return; }
  const dt = clock.advance(engine.ctx.currentTime);
  if (!dt) return;
  try {
    const v = texture.values;
    const complexity = (v.harmonics + v.drive + v.shimmer) / 3;
    const priorChapter = journey.chapter;
    const changed = journey.step(dt,+$('pace').value,complexity);
    history.chapters(journey);
    if (journey.chapter !== priorChapter) {
      resetting = true; cancelTimer(); const id = generation;
      history.chapters(journey); transitionPitch(lastVoicing,journey.current); history.harmony(journey);
      engine.newChapter(journey.current).then(()=>{
        resetting = false;
        if (!requested || generation !== id) { engine.stop(); return; }
        bindAudioState(); schedule(); render();
      }).catch(error=>{resetting=false;stop(false);$('status').textContent=error.message;});
    } else if (changed) { transitionPitch(lastVoicing, journey.current); engine.move(journey.current); history.harmony(journey); }
    // Analytic scene interpolation consumes the full audio-clock gap; at most one new plan.
    texture.step(journey.elapsed, $('auto-texture').checked);
    history.texture(texture, journey.elapsed);
    applied += dt;
    // At most 1 Hz for expensive Bloom/spectrum scheduling; AudioParams smooth between updates.
    if (applied >= 1000) { engine.update({...engine.settings,...texture.values}); applied = 0; }
    if (!document.hidden) render();
  } catch (error) { stop(false); $('status').textContent = `演奏を停止しました: ${error.message}`; }
}
function render() {
  const values = texture?.values ?? initialSettings;
  renderHistory();
  for (const k of textureKeys) {
    const [lo,hi] = textureBounds[k]; const n = values[k];
    $('dial-'+k).style.setProperty('--angle',`${270*(n-lo)/(hi-lo)}deg`);
    if (document.activeElement !== $('knob-'+k)) $('knob-'+k).value = n;
    $('value-'+k).value = ['shimmerDecay','glide','attack','decay','release','time'].includes(k) ? `${n.toFixed(1)} s` : k === 'detune' ? `${n.toFixed(1)} ct` : `${Math.round(n*100)}%`;
  }
  if (journey) {
    $('chord').textContent = analyze(journey.current);
    $('voices').textContent = journey.current.map(n=>n===null?'—':note(n)).join(' · ');
    const seconds = Math.floor(journey.elapsed/1000);
    $('elapsed').textContent = [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
    const m = journey.drift.migration;
    $('key').textContent = `${keyLabel(centerKey(journey.context))}${m.target ? ' → '+keyLabel(m.target) : ' · 次の調を探索'}`;
    $('migration').textContent = `CHAPTER ${journey.chapter} · ${journey.chapterTime>=892000?'FADE OUT · ':journey.chapter>1&&journey.chapterTime<12000?'FADE IN · ':''}${journey.transitions} 回変化 · ${journey.arrivals.length} 回到着 · Wander 現在 ${Math.round(journey.drift.wander*100)}%${m.target ? ' · '+Math.floor(m.elapsed/1000)+'秒 / 主音の定着を待機' : ''}`;
    $('scene').textContent = $('auto-texture').checked ? texture.status.label : 'TEXTURE HOLD';
    $('texture-state').textContent = $('auto-texture').checked ? (texture.status.progress >= 1 ? texture.plan.name : texture.plan?.origin || 'ORIGIN') : 'HOLD';
    const colors = palette(centerKey(journey.context), texture.plan?.name);
    if (paletteId !== colors.id) {
      paletteId = colors.id;
      const root = document.documentElement;
      for(const k of ['accent','glow','base','surface','field']) root.style.setProperty('--'+k,colors[k]);
      targetHue = colors.hue;
      document.querySelector('.landscape').dataset.palette = colors.id;
    }
    $('progress').value = texture.status.progress;
  }
  for (const key of ['bloom','shimmer','drive','wetDrift']) $('meter-'+key).value = values[key];
  $('start').disabled = requested && engine.running && engine.ctx?.state === 'running';
  $('start').textContent = requested ? 'PLAYING' : journey ? 'RESUME ↗' : 'START ↗'; $('stop').disabled = !requested;
}
$('start').onclick = start; $('stop').onclick = stop;
$('reset').onclick = () => { stop(); journey = null; texture = null; history.reset(); motions.fill(null); lastVoicing = null; engine.update(initialSettings); $('elapsed').textContent='00:00:00'; $('scene').textContent='ORIGIN → …'; $('key').textContent='—'; $('chord').textContent='新しい出発点'; $('voices').textContent=''; $('progress').value=0; $('migration').textContent='主音と和声の定着を待って到着します'; $('status').textContent='新しい旅 · 出発点を入力してSTART'; render(); };
$('depth').oninput = () => { texture?.setDepth(+$('depth').value); $('depth-value').value = Math.round(+$('depth').value*100)+'%'; };
$('pace').oninput = () => $('pace-value').value = $('pace').value+' s';
for (const k of ['wander','edge']) {
  $(k).oninput = () => {
    $(k+'-value').value = Math.round( +$(k).value*100)+'%';
    journey?.setControls({[k]:+$(k).value});
    render();
  };
}
$('auto-texture').onchange = () => { if (texture) texture.freeze(journey.elapsed); render(); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(frame);
  else { frame=requestAnimationFrame(drawField); if(requested) tick(); render(); }
});
window.addEventListener('pagehide',stop);
// Six-voice pitch field: the real accepted MIDI notes glide along six colored
// traces. The optional waveform comes from the existing WebAudio analyser.
const field = $('pitch-field'), fieldCtx = field.getContext('2d');
let voiceColors = ['#f9cfa0','#ffae8c','#e48fbc','#bc9ef2','#e9b9d2','#f5d9b4'];
let motions = Array(6).fill(null), pitchCamera = 52, pitchRange = 52, frameAt = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function currentPitch(m, at) {
  if (!m) return null;
  if (m.from === null) return m.to;
  const x = Math.max(0, Math.min(1,(at - m.start)/m.duration));
  return m.from + (m.to - m.from) * x;
}
function transitionPitch(previous, next) {
  const at = performance.now();
  for (let i=0;i<6;i++) {
    const to = next[i], from = currentPitch(motions[i], at) ?? previous?.[i] ?? to;
    motions[i] = to === null ? null : {from:from === null ? to : from,to,start:at,duration:reduceMotion ? 1 : Math.max(80,(engine.settings.glide||2.5)*1000)};
  }
  lastVoicing = [...next];
}
function drawField(at) {
  if (document.hidden) return;
  frame = requestAnimationFrame(drawField);
  if (!field.isConnected || at-frameAt < (reduceMotion ? 100 : 33)) return;
  const delta = Math.min(100, Math.max(0, at-frameAt));frameAt = at;
  const rect = field.getBoundingClientRect(), w = rect.width, h = rect.height;
  if (w<30 || h<30) return;
  const d = Math.min(devicePixelRatio||1,2);
  if (field.width !== Math.round(w*d) || field.height !== Math.round(h*d)) {
    field.width = Math.round(w*d);field.height = Math.round(h*d);
  }
  const c=fieldCtx;c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,w,h);
  const ns=motions.map(m=>currentPitch(m,at)).filter(n=>n!==null);
  const goalCenter = ns.length ? (Math.min(...ns)+Math.max(...ns))/2 : 53;
  const goalRange = ns.length ? Math.max(38,Math.max(...ns)-Math.min(...ns)+20) : 50;
  const cameraEase=1-Math.exp(-delta/2500);
  pitchCamera+=(goalCenter-pitchCamera)*cameraEase;
  pitchRange+=(goalRange-pitchRange)*cameraEase;
  const yFor=n=>h/2 -(n-pitchCamera)*(h-42)/pitchRange;
  const first=Math.floor((pitchCamera-pitchRange/2)/12)*12;
  for(let midi=first;midi<pitchCamera+pitchRange/2+12;midi+=12){
    const y=yFor(midi);if(y<6||y>h-6)continue;
    c.strokeStyle='#d4b4bf17';c.lineWidth=1;c.beginPath();c.moveTo(13,y);c.lineTo(w-13,y);c.stroke();
    c.fillStyle='#c1acba99';c.font='9px system-ui';c.fillText(note(midi),15,y-4);
  }
  // The analyser is drawn quietly underneath, not fabricated as a decorative oscillator.
  if(engine.analyser && engine.running){
    const samples=new Uint8Array(engine.analyser.frequencyBinCount);
    engine.analyser.getByteTimeDomainData(samples);
    c.beginPath();c.lineWidth=1;c.strokeStyle='#e0a6d320';
    samples.forEach((value,i)=>{const x=(i/(samples.length-1))*w;
      const y=h*.5+(value-128)/128*h*.24; i?c.lineTo(x,y):c.moveTo(x,y);});
    c.stroke();
  }
  const hueDelta = ((targetHue-renderedHue+540)%360)-180;
  renderedHue = (renderedHue+hueDelta*(reduceMotion?1:1-Math.exp(-delta/2500))+360)%360;
  voiceColors = Array.from({length:6},(_,i)=>`hsl(${(renderedHue+i*27)%360} 85% 78%)`);
  motions.forEach((m,i)=>{
    if (!m) return;
    const x=43+(i+.5)*(w-86)/6;
    const yy=yFor(currentPitch(m,at)),yTarget=yFor(m.to);
    const sway=0;
    const y=yy+sway;
    const grad=c.createLinearGradient(10,0,x+8,0);
    grad.addColorStop(0,'#e5afc005');grad.addColorStop(.68,voiceColors[i].replace(')', ' / .33)'));grad.addColorStop(1,voiceColors[i].replace(')', ' / .79)'));
    c.strokeStyle=grad;c.lineWidth=1.4;c.beginPath();
    c.moveTo(10,y);c.bezierCurveTo(x*.42,y+Math.sin(at/1800+i)*3,x*.73,y-2.5,x,y);c.stroke();
    const targetY=yTarget;
    if(Math.abs(y-targetY)>1.1){
      c.setLineDash([2,5]);c.strokeStyle=voiceColors[i].replace(')', ' / .4)');
      c.beginPath();c.moveTo(x,y);c.lineTo(x,targetY);c.stroke();c.setLineDash([]);
    }
    c.shadowColor=voiceColors[i];c.shadowBlur=reduceMotion?0:15;c.fillStyle=voiceColors[i];
    c.beginPath();c.arc(x,y,4.3,0,Math.PI*2);c.fill();c.shadowBlur=0;
    c.font='10px system-ui';c.fillStyle='#e0eeea';
    const label=(6-i)+' · '+note(m.to);
    c.fillText(label,Math.min(w-55,x+8),Math.max(14,y-9));
  });
}
let frame = requestAnimationFrame(drawField);
render();

function renderHistory() {
  $('history-count').textContent = `${history.events.length} EVENTS${history.dropped ? ' · 古い記録は省略' : ''}`;
  if (!$('history').open || historyRevision === history.revision) return;
  historyRevision = history.revision;
  const rows = history.events.slice().reverse().map(e => {
    const row = document.createElement('li');
    const stamp = new Date(e.at).toISOString().slice(11,19);
    row.textContent = e.type === 'chapter' ? `${stamp} · CHAPTER ${e.chapter} · ${e.phase} · ${e.from || 'START'} → ${e.key} · fade ${e.fadeOut || 0}/${e.fadeIn || 0} ms` : e.type === 'harmony' ? `${stamp} · ${e.chord} · ${e.notes.map(n => n === null ? '—' : note(n)).join(' / ')} · ${e.mode} · ${e.key}${e.target ? ' → '+e.target : ''}` : `${stamp} · ${e.origin} → ${e.scene} · ${e.phase} ${Math.round(e.progress*100)}% · Inharm ${Math.round(e.values.inharmonicity*1000)/10}% / Bloom ${Math.round(e.values.bloom*100)}% / Harm ${Math.round(e.values.harmonics*100)}% / Drive ${Math.round(e.values.drive*100)}% / Shimmer ${Math.round(e.values.shimmer*100)}%`;
    return row;
  });
  $('history-list').replaceChildren(...rows);
}
for (const panel of document.querySelectorAll('.sound-details')) panel.addEventListener('toggle', () => {
  if (panel.open) { panel.querySelector('.close-panel').focus(); }
  if (panel.open) for (const other of document.querySelectorAll('.sound-details')) if (other !== panel) other.open = false;
  renderHistory();
});
$('export-history').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(history.toJSON(), null, 2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'autodrift-history.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

for(const button of document.querySelectorAll('.close-panel')) button.onclick=()=>{const p=button.closest('details');p.open=false;p.querySelector('summary').focus()};
document.addEventListener('keydown', e=>{if(e.key==='Escape') for(const p of document.querySelectorAll('details[open]')){p.open=false;p.querySelector('summary').focus();}});
