import { state, assets, capture, pushHistory, emit, projectDuration } from './state.js';
import { drawClipWave, drawRuler } from './waveform.js';
import { pause as pauseAudio, isPlaying } from './audio.js';

export const TRACK_H = 96;
const RULER_H = 32;
const CLIP_H = 84;
const WAVE_H = 62;
const PALETTE = ['#1f6feb', '#8957e5', '#1a7f37', '#bb8009', '#bf4b8a', '#0f6f7a', '#a13a2f', '#2f6ea1'];

let timelineEl, lanesEl, rulerEl, rulerCanvas, playheadEl, headersEl;
const clipEls = new Map();
let drag = null;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function initTimeline(){
  timelineEl = document.getElementById('timeline');
  lanesEl = document.getElementById('lanes');
  rulerEl = document.getElementById('ruler');
  rulerCanvas = document.getElementById('ruler-canvas');
  playheadEl = document.getElementById('playhead');
  headersEl = document.getElementById('track-headers');

  timelineEl.addEventListener('scroll', () => {
    headersEl.scrollTop = timelineEl.scrollTop;
  });

  rulerEl.addEventListener('pointerdown', startScrub);

  lanesEl.addEventListener('pointerdown', e => {
    if (e.target === lanesEl || e.target.classList.contains('lane')){
      if (!e.shiftKey){ state.selection.clear(); render(); }
      startScrub(e);
    }
  });
}

function startScrub(e){
  if (isPlaying()) pauseAudio();
  const rect = lanesEl.getBoundingClientRect();
  const apply = ev => {
    state.playhead = Math.max(0, (ev.clientX - rect.left) / state.pxPerSec);
    emit('tick');
  };
  apply(e);
  const move = ev => apply(ev);
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function snapTime(t, exclude){
  if (!state.snap) return t;
  const thr = 8 / state.pxPerSec;
  let best = t, bd = thr;

  if (state.bpm > 0){
    const beat = 60 / state.bpm;
    const nb = Math.round(t / beat) * beat;
    const d = Math.abs(nb - t);
    if (d < bd){ best = nb; bd = d; }
  }
  for (const c of state.clips){
    if (exclude && exclude.has(c.id)) continue;
    for (const edge of [c.start, c.start + c.duration]){
      const d = Math.abs(edge - t);
      if (d < bd){ best = edge; bd = d; }
    }
  }
  return Math.max(0, best);
}

function createClipEl(clip){
  const el = document.createElement('div');
  el.className = 'clip';
  el.dataset.id = clip.id;

  const label = document.createElement('div');
  label.className = 'clip-label';
  const canvas = document.createElement('canvas');
  canvas.className = 'clip-wave';

  el.appendChild(canvas);
  el.appendChild(label);

  el.addEventListener('pointerdown', e => onClipPointerDown(e, clip.id));

  return { el, canvas, label, sig: '' };
}

function syncClipEl(clip, rec){
  const w = Math.max(2, clip.duration * state.pxPerSec);
  rec.el.style.left = (clip.start * state.pxPerSec) + 'px';
  rec.el.style.width = w + 'px';
  rec.el.style.height = CLIP_H + 'px';
  rec.el.classList.toggle('selected', state.selection.has(clip.id));
  rec.label.textContent = clip.name;
  rec.label.title = clip.name;

  const sig = `${Math.round(w)}|${clip.offset.toFixed(3)}|${clip.duration.toFixed(3)}|${(clip.fadeIn || 0).toFixed(3)}|${(clip.fadeOut || 0).toFixed(3)}`;
  if (rec.sig !== sig){
    rec.sig = sig;
    drawClipWave(rec.canvas, clip, assets, state.pxPerSec, WAVE_H);
  }
}

function onClipPointerDown(e, id){
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  e.stopPropagation();

  const clip = state.clips.find(c => c.id === id);
  if (!clip) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = rect.width;

  let mode = 'move';
  if (y < 22 && x < 24) mode = 'fadeIn';
  else if (y < 22 && x > w - 24) mode = 'fadeOut';
  else if (x < 12) mode = 'trimL';
  else if (x > w - 12) mode = 'trimR';

  if (e.shiftKey){
    if (state.selection.has(id)) state.selection.delete(id);
    else state.selection.add(id);
  } else if (!state.selection.has(id)){
    state.selection.clear();
    state.selection.add(id);
  }

  drag = {
    mode, id,
    x0: e.clientX,
    before: capture(),
    initial: state.clips.map(c => ({ ...c })),
    moved: false,
  };

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp);
  render();
}

function onDragMove(e){
  if (!drag) return;

  const dx = e.clientX - drag.x0;
  if (Math.abs(dx) > 3) drag.moved = true;

  const fine = e.shiftKey ? 0.15 : 1;
  const dt = (dx / state.pxPerSec) * fine;

  const clip = state.clips.find(c => c.id === drag.id);
  const init = drag.initial.find(c => c.id === drag.id);
  if (!clip || !init) return;

  if (drag.mode === 'move'){
    const target = snapTime(Math.max(0, init.start + dt), state.selection);
    let delta = target - init.start;
    if (init.start + delta < 0) delta = -init.start;

    for (const c of state.clips){
      if (!state.selection.has(c.id)) continue;
      const i0 = drag.initial.find(v => v.id === c.id);
      if (!i0) continue;
      c.start = Math.max(0, i0.start + delta);
    }
  }
  else if (drag.mode === 'trimL'){
    const minStart = Math.max(0, init.start - init.offset);
    const maxStart = init.start + init.duration - 0.05;
    const s = clamp(snapTime(init.start + dt, new Set([clip.id])), minStart, maxStart);
    clip.start = s;
    clip.offset = init.offset + (s - init.start);
    clip.duration = init.start + init.duration - s;
  }
  else if (drag.mode === 'trimR'){
    const asset = assets.get(clip.assetId);
    const maxDur = asset ? asset.buffer.duration - init.offset : init.duration;
    const maxEnd = init.start + Math.max(0.05, maxDur);
    const end = clamp(snapTime(init.start + init.duration + dt, new Set([clip.id])),
                      init.start + 0.05, maxEnd);
    clip.duration = end - init.start;
  }
  else if (drag.mode === 'fadeIn'){
    clip.fadeIn = clamp(init.fadeIn + dt, 0, clip.duration);
  }
  else if (drag.mode === 'fadeOut'){
    clip.fadeOut = clamp(init.fadeOut - dt, 0, clip.duration);
  }

  if (clip.fadeIn > clip.duration) clip.fadeIn = clip.duration;
  if (clip.fadeOut > clip.duration) clip.fadeOut = clip.duration;

  render();
}

function onDragUp(){
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  if (drag && drag.moved) pushHistory(drag.before);
  drag = null;
  render();
}

export function renderPlayhead(){
  const x = state.playhead * state.pxPerSec;
  playheadEl.style.transform = `translateX(${x}px)`;

  if (timelineEl && isPlaying()){
    const viewRight = timelineEl.scrollLeft + timelineEl.clientWidth - 80;
    if (x > viewRight) timelineEl.scrollLeft = x - timelineEl.clientWidth * 0.5;
  }
}

export function render(){
  if (!lanesEl) return;

  const dur = projectDuration();
  const W = Math.max(800, Math.ceil(dur * state.pxPerSec) + 400);

  lanesEl.style.width = W + 'px';
  lanesEl.style.height = (state.tracks.length * TRACK_H) + 'px';

  drawRuler(rulerCanvas, state.pxPerSec, dur, state.bpm, W);

  while (lanesEl.children.length > state.tracks.length) lanesEl.lastElementChild.remove();
  while (lanesEl.children.length < state.tracks.length){
    const d = document.createElement('div');
    d.className = 'lane';
    lanesEl.appendChild(d);
  }
  state.tracks.forEach((t, i) => {
    const lane = lanesEl.children[i];
    lane.style.height = TRACK_H + 'px';
    lane.dataset.track = t.id;
    lane.style.setProperty('--track-color', PALETTE[i % PALETTE.length]);
  });

  const alive = new Set();
  for (const clip of state.clips){
    const idx = state.tracks.findIndex(t => t.id === clip.trackId);
    const lane = lanesEl.children[idx];
    if (!lane) continue;

    alive.add(clip.id);
    let rec = clipEls.get(clip.id);
    if (!rec){ rec = createClipEl(clip); clipEls.set(clip.id, rec); }
    if (rec.el.parentElement !== lane) lane.appendChild(rec.el);
    syncClipEl(clip, rec);
  }
  for (const [id, rec] of [...clipEls]){
    if (!alive.has(id)){ rec.el.remove(); clipEls.delete(id); }
  }

  playheadEl.style.height = Math.max(lanesEl.offsetHeight, 300) + 'px';
  renderPlayhead();
}