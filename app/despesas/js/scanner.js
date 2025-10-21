// ZXing + controle do modal (usa #scanModal e #scanVideo do index.html)
let zxing=null, codeReader=null, mediaStream=null;

async function ensureZXing(){
  if (zxing) return;
  await new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js';
    s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });
  zxing = window.ZXingBrowser;
}

export async function startScan({onResult, onError}={}){
  await ensureZXing();
  const modal = document.getElementById('scanModal');
  const video = document.getElementById('scanVideo');
  modal.classList.remove('hidden');

  const hints = new Map();
  hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
    zxing.BarcodeFormat.QR_CODE,
    zxing.BarcodeFormat.CODE_128,
    zxing.BarcodeFormat.CODE_39,
    zxing.BarcodeFormat.EAN_13,
    zxing.BarcodeFormat.EAN_8,
    zxing.BarcodeFormat.ITF
  ]);

  codeReader = new zxing.BrowserMultiFormatReader(hints);
  try{
    const devices = await zxing.BrowserCodeReader.listVideoInputDevices();
    const back = devices.find(d=>/back|traseira|rear/i.test(d.label))?.deviceId || devices[0]?.deviceId;
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: back?{deviceId:{exact:back}}:{facingMode:'environment'}, audio:false
    });
    video.srcObject = mediaStream;
    await video.play();

    codeReader.decodeFromVideoDevice(back || null, video, (res,err)=>{
      if (res?.text){
        try{ onResult ? onResult(res.text) : null; }catch(e){ console.warn(e); }
      }
    });
  }catch(e){
    console.warn(e);
    try{ onError && onError(e); }catch{}
    stopScan();
  }
}

export function stopScan(){
  try{ codeReader?.reset(); }catch{}
  try{ (mediaStream?.getTracks()||[]).forEach(t=>t.stop()); }catch{}
  document.getElementById('scanModal')?.classList.add('hidden');
  codeReader = null; mediaStream = null;
}