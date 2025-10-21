let codeReader, zxing, stream;
const video = document.getElementById('scanVideo');
const modal = document.getElementById('scanModal');

export async function startScan(){
  await ensureZXing();
  modal.classList.remove('hidden');
  const hints = new Map();
  const formats = [ zxing.BarcodeFormat.QR_CODE, zxing.BarcodeFormat.CODE_128 ];
  hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, formats);
  codeReader = new zxing.BrowserMultiFormatReader(hints);
  try{
    const devices = await zxing.BrowserCodeReader.listVideoInputDevices();
    const back = devices.find(d=>/back|rear/i.test(d.label))?.deviceId || devices[0]?.deviceId;
    stream = await navigator.mediaDevices.getUserMedia({video: back?{deviceId:{exact:back}}:{facingMode:'environment'}});
    video.srcObject = stream;
    await video.play();
    codeReader.decodeFromVideoDevice(back || null, video, (res)=>{
      if(res && res.text){
        document.getElementById('chave').value = res.text.replace(/\D/g,'').slice(0,44);
        stopScan();
      }
    });
  }catch(e){ alert('Erro ao abrir câmera: '+e.message); }
}
export function stopScan(){
  try{codeReader?.reset();}catch{}
  try{(stream?.getTracks()||[]).forEach(t=>t.stop());}catch{}
  modal.classList.add('hidden');
}
async function ensureZXing(){
  if(zxing) return;
  await new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js';
    s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });
  zxing = window.ZXingBrowser;
}