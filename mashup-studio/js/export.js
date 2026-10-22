import { state, projectDuration } from './state.js';
import { scheduleAll } from './audio.js';

export async function renderMixdown(sampleRate = 44100, bitDepth = 16) {
  const duration = projectDuration() + 0.5;
  const frames = Math.ceil(duration * sampleRate);
  
  const oc = new OfflineAudioContext(2, frames, sampleRate);
  scheduleAll(oc, 0, 0);
  const rendered = await oc.startRendering();
  return encodeWav(rendered, bitDepth);
}

function writeStr(dv, off, str) {
  for (let i = 0; i < str.length; i++) dv.setUint8(off + i, str.charCodeAt(i));
}

export function encodeWav(buffer, bitDepth = 16) {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bps = bitDepth / 8;
  const dataSize = len * numCh * bps;
  
  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);
  
  writeStr(dv, 0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  writeStr(dv, 8, 'WAVE');
  writeStr(dv, 12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * numCh * bps, true);
  dv.setUint16(32, numCh * bps, true);
  dv.setUint16(34, bitDepth, true);
  writeStr(dv, 36, 'data');
  dv.setUint32(40, dataSize, true);
  
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = chans[c][i];
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      if (bitDepth === 16) dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      else dv.setInt32(off, s < 0 ? s * 0x80000000 : s * 0x7fffffff, true);
      off += bps;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}