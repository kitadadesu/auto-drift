import { Drone, defaults } from './audio.js';
import { parse, note, analyze } from './music.js';
import { centerKey, keyLabel } from './harmony.js';
import { Journey } from './journey.js';
import { TextureDrift, textureKeys, textureBounds } from './texture.js';
const $ = id => document.getElementById(id);
const engine = new Drone();
let journey, texture, requested = false, generation = 0, last = null, timer = null, applied = 0;
const labels = {bloom:'Bloom', harmonics:'Harmonics', inharmonicity:'Inharmonicity', drift:'Spectral Drift',dryDrift:'Dry Tape',wetDrift:'Wet Tape',shimmer:'Shimmer',shimmerDecay:'Shimmer Decay',diffusion:'Diffusion',drive:'Saturation Drive',character:'Character',saturationMix:'Saturation Mix',reverb:'Reverb',delay:'Delay',detune:'Detune',saturationPost:'PRE → POST',glide:'Glide',attack:'Attack',decay:'Decay',sustain:'Sustain',release:'Release',time:'Delay Time',feedback:'Delay Feedback'};
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
function ensureJourney() {
  if (journey) return;
  const tokens = $('notes').value.trim().split(/[\s,]+/);
  const notes = tokens.map(t => /^x$/i.test(t) ? null : parse(t));
  if (tokens.length !== 6 || tokens.some((t,i) => notes[i] === null && !/^x$/i.test(t)) || notes.every(n => n === null)) throw new Error('音名を6つ入力してください（例 E2 B2 E3 G3 B3 E4）。休符は x。');
  journey = new Journey(notes); texture = new TextureDrift(defaults); texture.start(0); if (+$('depth').value !== 1) texture.setDepth(+$('depth').value);
}
function cancelTimer() { if (timer !== null) clearTimeout(timer); timer = null; last = null; }
function stop() {
  requested = false; ++generation; cancelTimer(); engine.stop();
  $('status').textContent = '停止中 · STARTで同じ旅を再開'; render();
}
async function start() {
  if (requested && engine.running && engine.ctx?.state === 'running' && !document.hidden) return;
  try {
    ensureJourney(); requested = true; const id = ++generation;
    $('start').disabled = true; $('stop').disabled = false;
    await engine.play(journey.current);
    if (id !== generation || !requested || document.hidden) { if (!requested || document.hidden) engine.stop(); return; }
    engine.ctx.onstatechange = () => {
      if (engine.ctx.state !== 'running') { cancelTimer(); $('status').textContent = '音声待機中 · STARTで再開'; $('start').disabled = false; }
      else if (requested && !document.hidden && timer === null) schedule();
    };
    texture.freeze(journey.elapsed); schedule();
    $('status').textContent = '● DRIFTING · 和声と音色が自律演奏中'; render();
  } catch (error) { stop(); $('status').textContent = error.message; }
}
function schedule() { cancelTimer(); last = performance.now(); timer = setTimeout(tick,500); }
function tick() {
  timer = null;
  if (!requested || document.hidden || engine.ctx?.state !== 'running') { last = null; return; }
  const now = performance.now(); const dt = Math.min(1000, Math.max(0,now-last)); last = now;
  try {
    const v = texture.values;
    const complexity = (v.harmonics + v.drive + v.shimmer) / 3;
    const changed = journey.step(dt,+$('pace').value,complexity);
    if (changed) engine.move(journey.current);
    texture.step(journey.elapsed, $('auto-texture').checked);
    applied += dt;
    // At most 1 Hz for expensive Bloom/spectrum scheduling; AudioParams smooth between updates.
    if (applied >= 1000) { engine.update({...engine.settings,...texture.values}); applied = 0; }
    render(); timer = setTimeout(tick,500);
  } catch (error) { stop(); $('status').textContent = `演奏を停止しました: ${error.message}`; }
}
function render() {
  const values = texture?.values ?? defaults;
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
    $('migration').textContent = `${journey.transitions} 和声遷移 · ${journey.arrivals.length} 回到着 · Wander ${Math.round(journey.drift.wander*100)}%${m.target ? ' · '+Math.floor(m.elapsed/1000)+'秒 / 主音の定着を待機' : ''}`;
    $('scene').textContent = $('auto-texture').checked ? texture.status.label : 'TEXTURE HOLD';
    $('progress').value = texture.status.progress;
  }
  $('start').disabled = requested && engine.running && engine.ctx?.state === 'running' && !document.hidden;
  $('start').textContent = journey ? 'RESUME ↗' : 'START ↗'; $('stop').disabled = !requested;
}
$('start').onclick = start; $('stop').onclick = stop;
$('reset').onclick = () => { stop(); journey = null; texture = null; engine.update(defaults); $('elapsed').textContent='00:00:00'; $('scene').textContent='ORIGIN → …'; $('key').textContent='—'; $('chord').textContent='新しい出発点'; $('voices').textContent=''; $('progress').value=0; $('migration').textContent='主音と和声の定着を待って到着します'; $('status').textContent='新しい旅 · 出発点を入力してSTART'; render(); };
$('depth').oninput = () => { texture?.setDepth(+$('depth').value); $('depth-value').value = Math.round(+$('depth').value*100)+'%'; };
$('pace').oninput = () => $('pace-value').value = $('pace').value+' s';
$('auto-texture').onchange = () => { texture?.freeze(journey.elapsed); render(); };
document.addEventListener('visibilitychange', () => {
  cancelTimer();
  if (document.hidden) { if (requested) { ++generation; engine.stop(); $('status').textContent='タブ非表示 · 音声と旅を一時停止'; render(); } }
  else if (requested) start();
});
window.addEventListener('pagehide',stop);
render();
