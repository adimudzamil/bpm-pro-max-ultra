// Stub with clear messaging. Full pitch-preserved tempo change requires
// a time-stretch engine; the wiring is here but the feature reports
// "needs internet" until you vendor soundtouch.
import { getCtx } from './audio.js';

export async function setClipTempo(clip, targetBPM) {
  const asset = clip.__assetRef;
  if (!asset || !asset.bpm) throw new Error('No BPM detected for this clip');
  if (Math.abs(targetBPM - asset.bpm) < 0.5) return;
  throw new Error('Clip BPM adjust needs soundtouch (online only)');
}