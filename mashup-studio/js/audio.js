import { state, assets, projectDuration, emit } from './state.js';

let ctx = null;
let playing = false;
let t0 = 0;
let ph0 = 0;
let sources = [];
let raf = null;

export function getCtx() {
  if (!ctx) ctx = new(window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export async function decodeFile(file) {
  const data = await file.arrayBuffer();
  return await getCtx().decodeAudioData(data);
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function buildEnvelope(clip, track, from, playDur) {
  const n = Math.max(2, Math.min(8000, Math.ceil(playDur / 0.01)));
  const out = new Float32Array(n);
  const start = clip.start;
  const end = clip.start + clip.duration;
  const fIn = Math.min(clip.fadeIn || 0, clip.duration);
  const fOut = Math.min(clip.fadeOut || 0, clip.duration);
  
  const partners = state.clips.filter(c =>
    c.trackId === clip.trackId && c.id !== clip.id &&
    c.start < end && c.start + c.duration > start
  );
  
  for (let i = 0; i < n; i++) {
    const t = from + (i / (n - 1)) * playDur;
    let v = clip.gain * track.gain;
    
    if (fIn > 0) v *= clamp01((t - start) / fIn);
    if (fOut > 0) v *= clamp01((end - t) / fOut);
    
    for (const p of partners) {
      const oS = Math.max(start, p.start);
      const oE = Math.min(end, p.start + p.duration);
      if (oE <= oS || t < oS || t > oE) continue;
      const x = (t - oS) / (oE - oS);
      const earlier = (start < p.start) || (start === p.start && clip.id < p.id);
      if (state.xfade === 'linear') {
        v *= earlier ? (1 - x) : x;
      } else {
        v *= earlier ? Math.cos(x * Math.PI / 2) : Math.sin(x * Math.PI / 2);
      }
    }
    out[i] = v;
  }
  return out;
}

export function scheduleAll(ac, when0, playhead) {
  const nodes = [];
  const soloed = state.tracks.some(t => t.solo);
  
  for (const clip of state.clips) {
    const track = state.tracks.find(t => t.id === clip.trackId);
    if (!track || track.mute) continue;
    if (soloed && !track.solo) continue;
    
    const asset = assets.get(clip.assetId);
    if (!asset) continue;
    
    const clipEnd = clip.start + clip.duration;
    if (clipEnd <= playhead) continue;
    
    const from = Math.max(playhead, clip.start);
    const playDur = clipEnd - from;
    if (playDur <= 0.001) continue;
    
    const offset = clip.offset + (from - clip.start);
    
    const src = ac.createBufferSource();
    const targetBPM = clip.tempoBPM || asset.bpm;
    src.buffer = (asset.stretched && asset.stretched.get(targetBPM)) || asset.buffer;
    
    const g = ac.createGain();
    const env = buildEnvelope(clip, track, from, playDur);
    try { g.gain.setValueCurveAtTime(env, when0 + (from - playhead), playDur); }
    catch (e) { g.gain.value = clip.gain * track.gain; }
    
    src.connect(g);
    g.connect(ac.destination);
    
    try { src.start(when0 + (from - playhead), offset, playDur); }
    catch (e) { continue; }
    
    nodes.push(src);
  }
  return nodes;
}

export function isPlaying() { return playing; }

function killSources() {
  for (const s of sources) { try { s.stop(); } catch (e) {} }
  sources = [];
}

function tick() {
  if (!playing) return;
  const ac = getCtx();
  state.playhead = Math.max(0, ph0 + (ac.currentTime - t0));
  if (state.playhead > projectDuration() + 0.2) {
    pause();
    return;
  }
  emit('tick');
  raf = requestAnimationFrame(tick);
}

export function play() {
  if (playing || !state.clips.length) return;
  const ac = getCtx();
  if (ac.state === 'suspended') ac.resume();
  t0 = ac.currentTime + 0.08;
  ph0 = state.playhead;
  sources = scheduleAll(ac, t0, ph0);
  playing = true;
  emit('tick');
  raf = requestAnimationFrame(tick);
}

export function pause() {
  if (!playing) return;
  playing = false;
  if (raf) cancelAnimationFrame(raf);
  killSources();
  emit('tick');
}

export function stop() {
  pause();
  state.playhead = ph0;
  emit('tick');
}

export function rewind() {
  pause();
  state.playhead = 0;
  emit('tick');
}

export function seek(t) {
  const wasPlaying = playing;
  pause();
  state.playhead = Math.max(0, t);
  emit('tick');
  if (wasPlaying) play();
}

export function resync() {
  if (!playing) return;
  const ac = getCtx();
  killSources();
  ph0 = state.playhead;
  t0 = ac.currentTime + 0.05;
  sources = scheduleAll(ac, t0, ph0);
}