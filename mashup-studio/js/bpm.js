export function detectBPM(buffer, minBPM = 70, maxBPM = 180){
  const sr = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const hop = 512;
  const frames = Math.floor(ch.length / hop);
  if (frames < 64) return 0;

  const energy = new Float32Array(frames);
  for (let i = 0; i < frames; i++){
    const s = i * hop;
    let sum = 0;
    for (let j = 0; j < hop; j++){ const v = ch[s + j]; sum += v * v; }
    energy[i] = Math.sqrt(sum / hop);
  }

  const onset = new Float32Array(frames);
  for (let i = 1; i < frames; i++) onset[i] = Math.max(0, energy[i] - energy[i - 1]);

  let mean = 0;
  for (let i = 0; i < frames; i++) mean += onset[i];
  mean /= frames;

  const fps = sr / hop;
  const minLag = Math.max(2, Math.floor(fps * 60 / maxBPM));
  const maxLag = Math.min(frames - 2, Math.ceil(fps * 60 / minBPM));

  let best = -Infinity, bestLag = minLag;
  for (let lag = minLag; lag <= maxLag; lag++){
    let c = 0;
    for (let i = lag; i < frames; i++) c += (onset[i] - mean) * (onset[i - lag] - mean);
    c /= (frames - lag);
    if (c > best){ best = c; bestLag = lag; }
  }

  let bpm = 60 * fps / bestLag;
  while (bpm < minBPM) bpm *= 2;
  while (bpm > maxBPM) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}