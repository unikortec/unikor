// Scanner robusto para iPhone/PC usando ZXing
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
  // iOS só revela labels se já tiver permissão — “desbloqueia” com um getUserMedia rápido
  try { await navigator.mediaDevices.getUserMedia({ video:true, audio:false }).then(s=>s.getTracks().forEach(t=>t.stop())); } catch {}

  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
  // tenta câmera traseira por label
  const back = devs.find(d => /back|traseira|rear|environment/i.test(d.label));
  if (back) return { deviceId: { exact: back.deviceId } };
  // fallback por facingMode
  return { facingMode: { exact: 'environment' } };
}

export async function startScan({ onResult, onError } = {}){
  if (!navigator.mediaDevices?.getUserMedia){
    show('Câmera não disponível neste navegador.');
    return;
  }
  try{
    await ensureZXing();

    const modal = document.getElementById('scanModal');
    const video = document.getElementById('scanVideo');

    // iOS: precisa disso antes do play
    video.muted = true;
    video.setAttribute('muted','');
    video.setAttribute('playsinline','');
    video.setAttribute('autoplay','');

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
    reader = new zxing.BrowserMultiFormatReader(hints);

    const camera = await getBackCameraConstraints();
    // Deixa o ZXing gerenciar o stream: mais estável no iOS
    await reader.decodeFromConstraints({ video: camera, audio: false }, video, (result, err)=>{
      if (result?.text){
        // extrai 44 dígitos se for URL/QR
        const raw = result.text;
        const chave = (raw.match(/[?&]p=([^|&]+)/i)?.[1] || raw).replace(/\D/g,'').slice(0,44);
        try { onResult && onResult(chave || raw); } catch {}
      }
    });

    // função de parada
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
    show('Não foi possível abrir a câmera. Verifique HTTPS e permissões.');
    try{ onError && onError(e); }catch{}
    stopScan();
  }
}

export function stopScan(){
  if (stopFn) stopFn();
}