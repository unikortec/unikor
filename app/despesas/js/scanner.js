// ===== UNIKOR • Scanner com Fallback =====
// Usa ZXing (vídeo ou foto). Suporta iPhone e PC.

let zxing = null, reader = null, stopFn = null;

function show(msg){
  const el = document.getElementById('statusBox');
  if (el){ el.classList.remove('hidden'); el.textContent = msg; }
}

async function ensureZXing(){
  if (zxing) return;
  await new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src  = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  zxing = window.ZXingBrowser;
}

async function getBackCameraConstraints(){
  try { await navigator.mediaDevices.getUserMedia({ video:true, audio:false }).then(s=>s.getTracks().forEach(t=>t.stop())); } catch {}
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
  const back = devs.find(d => /back|traseira|rear|environment/i.test(d.label));
  if (back) return { deviceId: { exact: back.deviceId } };
  return { facingMode: { exact: 'environment' } };
}

export async function startScan({ onResult, onError } = {}){
  if (!navigator.mediaDevices?.getUserMedia){
    show('Câmera não disponível neste navegador.');
    openFallbackInput(onResult);
    return;
  }

  try{
    await ensureZXing();
    const modal = document.getElementById('scanModal');
    const video = document.getElementById('scanVideo');
    const photo = document.getElementById('scanPhoto');

    video.muted = true;
    video.setAttribute('muted','');
    video.setAttribute('playsinline','');
    video.setAttribute('autoplay','');

    modal.classList.remove('hidden');
    photo.classList.add('hidden');
    video.classList.remove('hidden');

    const hints = new Map();
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
      zxing.BarcodeFormat.QR_CODE,
      zxing.BarcodeFormat.CODE_128,
      zxing.BarcodeFormat.CODE_39,
      zxing.BarcodeFormat.EAN_13,
      zxing.BarcodeFormat.EAN_8,
      zxing.BarcodeFormat.ITF
    ]);
    reader = new zxing.BrowserMultiFormatReader(hints);

    const camera = await getBackCameraConstraints();
    await reader.decodeFromConstraints({ video: camera, audio: false }, video, (result)=>{
      if (result?.text){
        const raw = result.text;
        const chave = (raw.match(/[?&]p=([^|&]+)/i)?.[1] || raw).replace(/\D/g,'').slice(0,44);
        try{ onResult && onResult(chave || raw); }catch{}
      }
    });

    stopFn = async ()=>{
      try { reader?.reset(); } catch {}
      const s = video.srcObject;
      if (s && s.getTracks) s.getTracks().forEach(t=>t.stop());
      video.srcObject = null;
      modal.classList.add('hidden');
      reader = null; stopFn = null;
    };

  }catch(e){
    console.warn('[scanner] erro', e);
    show('Não foi possível abrir a câmera. Usando fallback de foto.');
    openFallbackInput(onResult);
  }
}

export function stopScan(){
  if (stopFn) stopFn();
}

/* ===== Fallback por foto (upload) ===== */
async function openFallbackInput(onResult){
  await ensureZXing();
  const modal = document.getElementById('scanModal');
  const video = document.getElementById('scanVideo');
  const photo = document.getElementById('scanPhoto');
  video.classList.add('hidden');
  photo.classList.remove('hidden');
  modal.classList.remove('hidden');

  // cria input dinâmico se não existir
  let input = document.getElementById('fileQr');
  if (!input){
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'fileQr';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.display = 'none';
    document.body.appendChild(input);
  }

  input.onchange = async (ev)=>{
    const file = ev.target.files[0];
    if (!file) return;
    show('Processando imagem...');
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise(r=>img.onload=r);
    const result = await zxing.BrowserMultiFormatReader.decodeFromImageElement(img)
      .catch(()=>null);
    if (result?.text){
      const raw = result.text;
      const chave = (raw.match(/[?&]p=([^|&]+)/i)?.[1] || raw).replace(/\D/g,'').slice(0,44);
      try{ onResult && onResult(chave || raw); }catch{}
      modal.classList.add('hidden');
    }else{
      show('Nenhum código reconhecido. Tente outra foto.');
    }
    input.value = '';
  };

  // botão que dispara o input
  const btn = document.getElementById('btnTakePhoto');
  btn.onclick = ()=>input.click();
}