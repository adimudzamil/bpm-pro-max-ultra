// Save/load via JSZip (loaded on demand from CDN).
import { state, assets, uid, capture, pushHistory, emit } from './state.js';
import { encodeWav } from './export.js';
import { computePeaks } from './waveform.js';

const FORMAT = 'mashup-studio/1';

let jszipPromise = null;
function loadJSZip(){
  if (jszipPromise) return jszipPromise;
  jszipPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => res(window.JSZip);
    s.onerror = () => rej(new Error('JSZip unavailable (offline?)'));
    document.head.appendChild(s);
  });
  return jszipPromise;
}

export async function saveProject(){
  const JSZip = await loadJSZip();
  const zip = new JSZip();

  const proj = {
    format: FORMAT,
    savedAt: new Date().toISOString(),
    bpm: state.bpm,
    xfade: state.xfade,
    pxPerSec: state.pxPerSec,
    tracks: state.tracks.map(t => ({ ...t })),
    clips: state.clips.map(c => ({ ...c })),
    assets: [],
  };

  let i = 0;
  for (const [assetId, a] of assets){
    const name = `assets/${String(i++).padStart(3,'0')}.wav`;
    zip.file(name, encodeWav(a.buffer, 16));
    proj.assets.push({
      assetId, file: name, name: a.name,
      bpm: a.bpm, duration: a.buffer.duration, sampleRate: a.buffer.sampleRate,
    });
  }

  zip.file('project.json', JSON.stringify(proj, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mashup-${Date.now()}.mashup`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

export async function loadProject(file, decodeFile){
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(file);
  const projFile = zip.file('project.json');
  if (!projFile) throw new Error('Not a Mashup Studio project');
  const proj = JSON.parse(await projFile.async('string'));
  if (!proj.format || !proj.format.startsWith('mashup-studio/')) {
    throw new Error('Unsupported project format');
  }

  assets.clear();
  for (const a of proj.assets){
    const blob = await zip.file(a.file).async('blob');
    const f = new File([blob], a.name + '.wav', { type: 'audio/wav' });
    const buffer = await decodeFile(f);
    assets.set(a.assetId, {
      name: a.name, bpm: a.bpm, buffer, peaks: computePeaks(buffer),
    });
  }

  state.tracks = proj.tracks;
  state.clips = proj.clips;
  state.bpm = proj.bpm || 0;
  state.xfade = proj.xfade || 'equal';
  state.pxPerSec = proj.pxPerSec || 80;
  state.selection.clear();
  emit('change');
}