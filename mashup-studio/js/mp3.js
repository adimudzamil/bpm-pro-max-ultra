let lamePromise = null;
function loadLame(){
  if (lamePromise) return lamePromise;
  lamePromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/lamejs@1.2.1/lame.min.js';
    s.onload = () => res(window.lamejs);
    s.onerror = () => rej(new Error('lamejs unavailable (offline?)'));
    document.head.appendChild(s);
  });
  return lamePromise;
}

export async function encodeMp3(wavBlob, kbps = 192){
  const lamejs = await loadLame();
  const buf = await wavBlob.arrayBuffer();
  const view = new DataView(buf);
  const numCh = view.getUint16(22, true);
  const sr    = view.getUint32(24, true);
  const dataOff = 44;
  const dataLen = view.getUint32(40, true);

  const L = new Int16Array(dataLen / 2 / numCh);
  const R = numCh > 1 ? new Int16Array(dataLen / 2 / numCh) : null;
  let o = dataOff;
  for (let i = 0; i < L.length; i++){
    L[i] = view.getInt16(o, true); o += 2;
    if (R){ R[i] = view.getInt16(o, true); o += 2; }
  }

  const enc = new lamejs.Mp3Encoder(numCh, sr, kbps);
  const chunks = [];
  const block = 1152;
  for (let i = 0; i < L.length; i += block){
    const lc = L.subarray(i, i + block);
    const rc = R ? R.subarray(i, i + block) : lc;
    const out = numCh > 1 ? enc.encodeBuffer(lc, rc) : enc.encodeBuffer(lc);
    if (out.length) chunks.push(new Uint8Array(out));
  }
  const tail = enc.flush();
  if (tail.length) chunks.push(new Uint8Array(tail));

  return new Blob(chunks, { type: 'audio/mpeg' });
}