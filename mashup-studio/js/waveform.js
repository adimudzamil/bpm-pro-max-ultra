export function computePeaks(buffer, bucketsPerSec = 300){
  const bucket = Math.max(1, Math.floor(buffer.sampleRate / bucketsPerSec));
  const n = Math.ceil(buffer.length / bucket);
  const peaks = new Float32Array(n);
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));

  for (let b = 0; b < n; b++){
    const s = b * bucket;
    const e = Math.min(buffer.length, s + bucket);
    let p = 0;
    for (const d of chans){
      for (let i = s; i < e; i++){
        const v = d[i] < 0 ? -d[i] : d[i];
        if (v > p) p = v;
      }
    }
    peaks[b] = p;
  }
  return { peaks, bucketsPerSec: buffer.sampleRate / bucket };
}

export function drawClipWave(canvas, clip, assets, pxPerSec, height){
  const asset = assets.get(clip.assetId);
  if (!asset) return;

  const w = Math.max(2, Math.round(clip.duration * pxPerSec));
  const h = Math.max(20, height);
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)){
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const { peaks, bucketsPerSec } = asset.peaks;

  g.fillStyle = 'rgba(230,248,255,0.82)';
  for (let x = 0; x < w; x++){
    const t0 = clip.offset + (x / w) * clip.duration;
    const t1 = clip.offset + ((x + 1) / w) * clip.duration;
    const i0 = Math.floor(t0 * bucketsPerSec);
    const i1 = Math.max(i0 + 1, Math.floor(t1 * bucketsPerSec));
    let p = 0;
    for (let i = i0; i < i1 && i < peaks.length; i++){
      if (i >= 0 && peaks[i] > p) p = peaks[i];
    }
    const amp = Math.min(1, p) * (h / 2) * 0.94;
    g.fillRect(x, h / 2 - amp, 1, Math.max(1, amp * 2));
  }

  const fIn = (clip.fadeIn || 0) * pxPerSec;
  const fOut = (clip.fadeOut || 0) * pxPerSec;
  g.fillStyle = 'rgba(0,0,0,0.5)';
  if (fIn > 0){
    g.beginPath(); g.moveTo(0, 0); g.lineTo(fIn, 0); g.lineTo(0, h); g.closePath(); g.fill();
  }
  if (fOut > 0){
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w - fOut, 0); g.lineTo(w, h); g.closePath(); g.fill();
  }

  g.fillStyle = 'rgba(255,255,255,0.95)';
  if (fIn > 0)  g.fillRect(fIn - 1, 0, 2, h);
  if (fOut > 0) g.fillRect(w - fOut - 1, 0, 2, h);
}

export function drawRuler(canvas, pxPerSec, duration, bpm, width){
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(600, width);
  const h = 32;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#12151c';
  g.fillRect(0, 0, w, h);

  if (bpm > 0){
    const beat = 60 / bpm;
    if (beat * pxPerSec > 5){
      g.strokeStyle = 'rgba(120,200,255,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      for (let t = 0; t <= duration + beat; t += beat){
        const x = Math.round(t * pxPerSec) + 0.5;
        g.moveTo(x, h - 8); g.lineTo(x, h);
      }
      g.stroke();
    }
  }

  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find(s => s * pxPerSec >= 90) || 600;

  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.fillStyle = '#7c8798';
  g.font = '11px ui-monospace, monospace';
  g.beginPath();
  for (let t = 0; t <= duration + step; t += step){
    const x = Math.round(t * pxPerSec) + 0.5;
    g.moveTo(x, 0); g.lineTo(x, h - 8);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    g.fillText(`${m}:${s.toFixed(2).padStart(5, '0')}`, x + 4, 13);
  }
  g.stroke();
}