import {
  state, assets, uid, capture, pushHistory, undo, redo, subscribe, emit
} from './state.js';
import { decodeFile, play, pause, stop, rewind, isPlaying, resync, getCtx } from './audio.js';
import { initTimeline, render as renderTimeline, renderPlayhead, TRACK_H } from './timeline.js';
import { detectBPM } from './bpm.js';
import { computePeaks } from './waveform.js';
import { renderMixdown } from './export.js';
import { encodeMp3 } from './mp3.js';
import { saveProject, loadProject } from './project.js';

const $ = id => document.getElementById(id);
const DEFAULT_FADE_IN = 0.5;
const DEFAULT_FADE_OUT = 0.5;
let clipboard = [];

const escapeHtml = s => s.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initUI(){
  initTimeline();
  subscribe(onEvent);
  bindToolbar();
  bindKeys();
  renderHeaders();
  renderTimeline();
  updateTime();
  setStatus('Import an MP3, MP4, WAV or OGG file to begin.');
}

function onEvent(evt){
  if (evt === 'tick'){
    renderPlayhead();
    updateTime();
  } else if (evt === 'change'){
    renderHeaders();
    renderTimeline();
    updateTime();
  } else if (evt === 'history'){
    resync();
    renderHeaders();
    renderTimeline();
    updateTime();
  }
}

function setStatus(msg){ $('status').textContent = msg; }
let toastTimer = null;
function toast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function fmtTime(t){
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}
function updateTime(){
  $('time-display').textContent = fmtTime(state.playhead);
  $('btn-play').textContent = isPlaying() ? '⏸' : '▶';
}

function renderHeaders(){
  const host = $('track-headers');
  host.innerHTML = '';

  const spacer = document.createElement('div');
  spacer.className = 'header-spacer';
  host.appendChild(spacer);

  state.tracks.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'track-head';
    d.style.height = TRACK_H + 'px';
    d.innerHTML = `
      <div class="th-top">
        <span class="th-name" title="${escapeHtml(t.name)}">${i + 1}. ${escapeHtml(t.name)}</span>
        <button class="th-del" title="Delete track">✕</button>
      </div>
      <div class="th-ctrl">
        <button class="th-m ${t.mute ? 'on' : ''}" title="Mute">M</button>
        <button class="th-s ${t.solo ? 'on' : ''}" title="Solo">S</button>
        <input class="th-vol" type="range" min="0" max="150" value="${Math.round(t.gain * 100)}" title="Volume">
      </div>`;

    d.querySelector('.th-m').onclick = () => {
      const snap = capture();
      t.mute = !t.mute;
      pushHistory(snap);
    };
    d.querySelector('.th-s').onclick = () => {
      const snap = capture();
      t.solo = !t.solo;
      pushHistory(snap);
    };
    d.querySelector('.th-del').onclick = () => {
      const snap = capture();
      state.tracks = state.tracks.filter(x => x.id !== t.id);
      state.clips = state.clips.filter(c => c.trackId !== t.id);
      pushHistory(snap);
    };
    const vol = d.querySelector('.th-vol');
    vol.oninput = () => {
      t.gain = vol.value / 100;
      renderTimeline();
    };
    vol.onchange = () => pushHistory(capture());

    host.appendChild(d);
  });

  const add = document.createElement('button');
  add.className = 'add-track';
  add.textContent = '+ Add empty track';
  add.onclick = () => {
    const snap = capture();
    state.tracks.push({
      id: uid(), name: `Track ${state.tracks.length + 1}`,
      gain: 1, mute: false, solo: false,
    });
    pushHistory(snap);
  };
  host.appendChild(add);
}

async function importFiles(files){
  for (const file of files){
    setStatus(`Decoding ${file.name}…`);
    await new Promise(r => setTimeout(r, 0));

    let buffer;
    try {
      buffer = await decodeFile(file);
    } catch (err) {
      toast(`Could not decode "${file.name}". Try MP3, WAV or OGG.`);
      continue;
    }

    setStatus(`Analysing tempo of ${file.name}…`);
    await new Promise(r => setTimeout(r, 0));
    let bpm = 0;
    try { bpm = detectBPM(buffer); } catch (e) { bpm = 0; }

    const name = file.name.replace(/\.[^.]+$/, '');
    const assetId = uid();
    assets.set(assetId, { name, buffer, peaks: computePeaks(buffer), bpm });

    const track = { id: uid(), name, gain: 1, mute: false, solo: false };
    const snap = capture();

    state.tracks.push(track);
    state.clips.push({
      id: uid(), assetId, trackId: track.id, name,
      start: state.playhead, offset: 0, duration: buffer.duration,
      fadeIn: Math.min(DEFAULT_FADE_IN, buffer.duration / 4),
      fadeOut: Math.min(DEFAULT_FADE_OUT, buffer.duration / 4),
      gain: 1,
    });

    if (!state.bpm && bpm){
      state.bpm = bpm;
      $('bpm-input').value = Math.round(bpm);
    }
    pushHistory(snap);
    setStatus(`${name} added — ${bpm ? bpm.toFixed(1) + ' BPM' : 'tempo unknown'}.`);
  }
}

function selectedClips(){ return state.clips.filter(c => state.selection.has(c.id)); }

function copySel(){
  const clips = selectedClips();
  if (!clips.length) return;
  const minStart = Math.min(...clips.map(c => c.start));
  clipboard = clips.map(c => ({ ...c, start: c.start - minStart }));
  toast(`Copied ${clips.length} clip(s).`);
}

function pasteSel(){
  if (!clipboard.length) return;
  const snap = capture();
  const sel = new Set();
  for (const c of clipboard){
    let trackId = c.trackId;
    if (!state.tracks.some(t => t.id === trackId)){
      const nt = { id: uid(), name: c.name, gain: 1, mute: false, solo: false };
      state.tracks.push(nt);
      trackId = nt.id;
    }
    const id = uid();
    state.clips.push({ ...c, id, trackId, start: state.playhead + c.start });
    sel.add(id);
  }
  state.selection = sel;
  pushHistory(snap);
}

function duplicateSel(){
  const clips = selectedClips();
  if (!clips.length) return;
  const snap = capture();
  const sel = new Set();
  for (const c of clips){
    const id = uid();
    state.clips.push({ ...c, id, start: c.start + c.duration });
    sel.add(id);
  }
  state.selection = sel;
  pushHistory(snap);
}

function deleteSel(){
  if (!state.selection.size) return;
  const snap = capture();
  state.clips = state.clips.filter(c => !state.selection.has(c.id));
  state.selection.clear();
  pushHistory(snap);
}

function cutSel(){
  copySel();
  deleteSel();
}

function splitAtPlayhead(){
  const t = state.playhead;
  const pool = state.selection.size ? selectedClips() : state.clips;
  const targets = pool.filter(c => c.start < t - 0.001 && c.start + c.duration > t + 0.001);
  if (!targets.length) return toast('Nothing to split at the playhead.');

  const snap = capture();
  for (const c of targets){
    const leftDur = t - c.start;
    state.clips.push({
      ...c,
      id: uid(),
      start: t,
      offset: c.offset + leftDur,
      duration: c.duration - leftDur,
      fadeIn: 0,
    });
    c.duration = leftDur;
    c.fadeOut = 0;
  }
  pushHistory(snap);
}

function insertSilence(){
  const input = window.prompt('Insert silence at the playhead — duration in seconds:', '4');
  if (input === null) return;
  const secs = parseFloat(input);
  if (!isFinite(secs) || secs <= 0) return;

  const snap = capture();
  const t = state.playhead;
  for (const c of state.clips){
    if (c.start >= t - 0.0001) c.start += secs;
    else if (c.start + c.duration > t){
      const leftDur = t - c.start;
      state.clips.push({
        ...c, id: uid(), start: t + secs,
        offset: c.offset + leftDur, duration: c.duration - leftDur, fadeIn: 0,
      });
      c.duration = leftDur;
      c.fadeOut = 0;
    }
  }
  pushHistory(snap);
}

async function adjustClipBPM(){
  const clips = selectedClips();
  if (!clips.length) return toast('Select a clip first.');
  const input = window.prompt('Target BPM for selected clip(s):',
    Math.round(clips[0].tempoBPM || state.bpm || 120));
  if (!input) return;
  const bpm = parseFloat(input);
  if (!isFinite(bpm) || bpm <= 0) return;
  toast('Clip BPM adjust needs the soundtouch library — online only. Coming in v4.');
}

async function doExport(){
  if (!state.clips.length) return toast('Nothing to export yet.');
  pause();
  const format = $('export-format').value;
  setStatus('Rendering mixdown…');
  await new Promise(r => setTimeout(r, 30));
  try {
    const wavBlob = await renderMixdown(44100, 16);
    let blob = wavBlob, ext = 'wav';
    if (format === 'mp3'){
      setStatus('Encoding MP3…');
      await new Promise(r => setTimeout(r, 30));
      blob = await encodeMp3(wavBlob, 192);
      ext = 'mp3';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mashup.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    setStatus(`Exported mashup.${ext}`);
    toast(`Exported mashup.${ext}`);
  } catch (err){
    setStatus('Export failed: ' + err.message);
    toast('Export failed: ' + err.message);
  }
}

async function doSave(){
  try {
    setStatus('Saving project…');
    await saveProject();
    setStatus('Project saved');
    toast('Project saved as .mashup');
  } catch (err){
    setStatus('Save failed: ' + err.message);
    toast('Save failed: ' + err.message);
  }
}

async function doOpen(file){
  try {
    setStatus('Loading project…');
    await loadProject(file, decodeFile);
    setStatus('Project loaded');
    toast('Project loaded');
  } catch (err){
    setStatus('Load failed: ' + err.message);
    toast('Load failed: ' + err.message);
  }
}

function bindToolbar(){
  $('file-input').addEventListener('change', e => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) importFiles(files);
  });

  $('file-open').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) doOpen(f);
  });

  $('btn-play').onclick = () => (isPlaying() ? pause() : play());
  $('btn-stop').onclick = () => { stop(); updateTime(); };
  $('btn-rewind').onclick = () => rewind();

  $('btn-split').onclick = splitAtPlayhead;
  $('btn-duplicate').onclick = duplicateSel;
  $('btn-delete').onclick = deleteSel;
  $('btn-silence').onclick = insertSilence;
  $('btn-bpm').onclick = adjustClipBPM;
  $('btn-undo').onclick = () => { undo(); };
  $('btn-redo').onclick = () => { redo(); };
  $('btn-save').onclick = doSave;
  $('btn-export').onclick = doExport;

  $('zoom').addEventListener('input', e => {
    state.pxPerSec = parseInt(e.target.value, 10);
    renderTimeline();
  });

  $('snap').addEventListener('change', e => { state.snap = e.target.checked; });

  $('bpm-input').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    state.bpm = isFinite(v) && v > 0 ? v : 0;
    renderTimeline();
  });

  $('xfade-curve').addEventListener('change', e => {
    state.xfade = e.target.value;
    resync();
  });

  subscribe(evt => { if (evt === 'tick' || evt === 'change') updateTime(); });
}

function bindKeys(){
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    const meta = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (e.code === 'Space'){ e.preventDefault(); isPlaying() ? pause() : play(); }
    else if (e.code === 'Home'){ e.preventDefault(); rewind(); }
    else if (meta && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (meta && k === 'y'){ e.preventDefault(); redo(); }
    else if (meta && k === 'c'){ e.preventDefault(); copySel(); }
    else if (meta && k === 'x'){ e.preventDefault(); cutSel(); }
    else if (meta && k === 'v'){ e.preventDefault(); pasteSel(); }
    else if (meta && k === 'd'){ e.preventDefault(); duplicateSel(); }
    else if (meta && k === 'a'){
      e.preventDefault();
      state.selection = new Set(state.clips.map(c => c.id));
      renderTimeline();
    }
    else if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); deleteSel(); }
    else if (k === 's' && !meta){ e.preventDefault(); splitAtPlayhead(); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.selection.size){
      e.preventDefault();
      const step = (e.shiftKey ? 0.1 : 0.01) * (e.key === 'ArrowLeft' ? -1 : 1);
      const snap = capture();
      for (const c of state.clips){
        if (state.selection.has(c.id)) c.start = Math.max(0, c.start + step);
      }
      pushHistory(snap);
    }
  });
}