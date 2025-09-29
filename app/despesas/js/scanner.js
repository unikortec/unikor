// /app/despesas/js/scanner.js — leitor de QR com fallback (BarcodeDetector → jsQR)
let JSQR = null;

async function ensureJSQR(){
  if (JSQR) return JSQR;
  const mod = await import('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
  JSQR = mod.default || mod;
  return JSQR;
}
function hasBarcodeDetector(){ return 'BarcodeDetector' in window; }
async function supportsQRFormat(){
  if (!hasBarcodeDetector()) return false;
  try{ const f = await window.BarcodeDetector.getSupportedFormats(); return f.includes('qr_code'); }
  catch{ return false; }
}

export class QRScanner {
  constructor({ video, canvas, onResult, onError }){
    this.video = video;
    this.canvas = canvas || document.createElement('canvas');
    this.onResult = onResult || (()=>{});
    this.onError  = onError  || ((e)=>console.warn('QR error:', e));
    this._detector = null; this._stream = null; this._loop = null; this._useBD = false;
  }
  async start(){
    try{
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio:false,
        video:{ facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} }
      });
      this.video.srcObject = this._stream;
      this.video.setAttribute('playsinline',''); this.video.setAttribute('muted','');
      await this.video.play();

      this._useBD = await supportsQRFormat();
      if (this._useBD){
        this._detector = new window.BarcodeDetector({ formats:['qr_code'] });
        this._scanWithBarcodeDetector();
      } else {
        await ensureJSQR(); this._scanWithJSQR();
      }
    }catch(e){
      if (location.protocol !== 'https:' && location.hostname !== 'localhost'){
        this.onError(new Error('Câmera exige HTTPS ou localhost.')); 
      } else { this.onError(e); }
      this.stop();
    }
  }
  stop(){
    if (this._loop) cancelAnimationFrame(this._loop); this._loop = null;
    if (this.video){ this.video.pause(); this.video.removeAttribute('srcObject'); this.video.srcObject = null; }
    if (this._stream){ this._stream.getTracks().forEach(t=>t.stop()); this._stream = null; }
  }
  _emit(text){ try{ this.onResult(String(text||'').trim()); }catch(e){ this.onError(e); } }
  _scanWithBarcodeDetector = async ()=>{
    const tick = async ()=>{
      if (!this.video || this.video.readyState < 2){ this._loop = requestAnimationFrame(tick); return; }
      try{
        const dets = await this._detector.detect(this.video);
        if (dets && dets.length){ this._emit(dets[0].rawValue || dets[0].rawValue); return; }
      }catch{}
      this._loop = requestAnimationFrame(tick);
    };
    this._loop = requestAnimationFrame(tick);
  }
  _scanWithJSQR = ()=>{
    const ctx = this.canvas.getContext('2d', { willReadFrequently:true });
    const tick = ()=>{
      if (!this.video || this.video.readyState < 2){ this._loop = requestAnimationFrame(tick); return; }
      const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
      this.canvas.width = vw; this.canvas.height = vh;
      ctx.drawImage(this.video, 0, 0, vw, vh);
      const img = ctx.getImageData(0, 0, vw, vh);
      try{
        const res = JSQR(img.data, vw, vh, { inversionAttempts:'dontInvert' });
        if (res && res.data){ this._emit(res.data); return; }
      }catch{}
      this._loop = requestAnimationFrame(tick);
    };
    this._loop = requestAnimationFrame(tick);
  }
}