export const state = {
  tracks: [],
  clips: [],
  playhead: 0,
  pxPerSec: 80,
  snap: true,
  bpm: 0,
  xfade: 'equal',
  selection: new Set(),
};

export const assets = new Map();

let undoStack = [];
let redoStack = [];
const listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(evt, data) { for (const fn of listeners) fn(evt, data); }
export function uid() { return Math.random().toString(36).slice(2, 10); }

export function projectDuration() {
  let d = 0;
  for (const c of state.clips) d = Math.max(d, c.start + c.duration);
  return Math.max(d, 20);
}

export function snapshot() {
  return {
    tracks: state.tracks.map(t => ({ ...t })),
    clips: state.clips.map(c => ({ ...c })),
    playhead: state.playhead,
    bpm: state.bpm,
  };
}

export function capture() { return snapshot(); }

export function pushHistory(snap) {
  undoStack.push(snap);
  if (undoStack.length > 120) undoStack.shift();
  redoStack.length = 0;
  emit('history');
}

function restore(s) {
  state.tracks = s.tracks.map(t => ({ ...t }));
  state.clips = s.clips.map(c => ({ ...c }));
  state.playhead = s.playhead;
  state.bpm = s.bpm;
  const ids = new Set(state.clips.map(c => c.id));
  state.selection = new Set([...state.selection].filter(id => ids.has(id)));
  emit('change');
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  return true;
}
export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  return true;
}