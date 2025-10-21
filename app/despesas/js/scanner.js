// ===== UNIKOR • Scanner universal (vídeo + fallback foto) =====
let zxing = null;
let reader = null;
let stream = null;

function show(msg){
  const el = document.getElementById('statusBox');
  if (el){ el.classList.remove('hidden'); el.textContent = msg; }
}

// Carrega ZXing de fonte estável, com fallback
async function ensureZXing(){
  if (zxing) return;
  const urls = [
    'https://unpkg.com/@zxing/browser@0.1.5/umd/index.min.js',
    'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js'
  ];
  for (const u of urls){
    try{
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src=u; s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
      if (window.ZXingBrowser){ zxing = window.ZXingBrowser; console.log('[Scanner] ZXing carregado:', u); return; }
    }catch(e){ console.warn('[Scanner] falha em', u); }
  }
  throw new Error('ZXing não pôde ser carregado');
}

async function getBackCamera(){
  // “desbloqueia” labels no iOS
  try{ await navigator.mediaDevices.getUserMedia({ video:true }).then(s=>s.getTracks().forEach(t=>t.stop())); }catch{}
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
  const back = devs.find(d=>/back|rear|traseira|environment/i.test(d.label));
  return back ? { deviceId:{ exact: back.deviceId } } : { facingMode:{ ideal:'environment' } };
}

export async function startScan({ onResult } = {}){
  const modal   = document.getElementById('scanModal');
  const videoEl = document.getElementById('scanVideo');
  const photoUI = document.getElementById('scanPhoto');

  try{
    if (!navigator.mediaDevices?.getUserMedia) { show('Sem suporte à câmera. Use o modo foto.'); return openFallback(onResult); }

    await ensureZXing();

    videoEl.muted = true;
    videoEl.setAttribute('muted',''); videoEl.setAttribute('playsinline',''); videoEl.setAttribute('autoplay','');

    modal.classList.remove('hidden');
    photoUI.classList.add('hidden');
    videoEl.classList.remove('hidden');

    // abre stream “puro” (melhor pro iOS) e usa decode contínuo
    const cam = await getBackCamera();
    stream = await navigator.mediaDevices.getUserMedia({ video: cam });
    videoEl.srcObject = stream;

    reader = new zxing.BrowserMultiFormatReader();
    reader.decodeFromVideoElementContinuously(videoEl, (res, err)=>{
      if (res?.text){
        const raw   = res.text;
        const chave = (raw.match(/[?&]p=([^|&]+)/i)?.[1] || raw).replace(/\D/g,'').slice(0,44);
        stopScan();
        onResult && onResult(chave || raw);
      }
    });
  }catch(e){
    console.error('[scanner] erro:', e);
    show('Falha ao abrir câmera. Usando modo foto.');
    openFallback(onResult);
  }
}

export function stopScan(){
  try{ reader?.reset(); }catch{}
  try{
    if (stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
  }catch{}
  document.getElementById('scanModal')?.classList.add('hidden');
}

/* ===== Fallback por foto ===== */
function openFallback(onResult){
  const modal   = document.getElementById('scanModal');
  const videoEl = document.getElementById('scanVideo');
  const photoUI = document.getElementById('scanPhoto');
  modal.classList.remove('hidden');
  videoEl.classList.add('hidden');
  photoUI.classList.remove('hidden');

  let input = document.getElementById('fileQr');
  if (!input){
    input = document.createElement('input');
    input.id = 'fileQr';
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.display = 'none';
    document.body.appendChild(input);
  }

  document.getElementById('btnTakePhoto').onclick = ()=> input.click();

  input.onchange = async (ev)=>{
    const file = ev.target.files?.[0];
    if (!file) return;
    show('Processando imagem...');
    await ensureZXing();
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise(r=>img.onload=r);

    try{
      const result = await zxing.BrowserMultiFormatReader.decodeFromImageElement(img);
      if (result?.text){
        const raw   = result.text;
        const chave = (raw.match(/[?&]p=([^|&]+)/i)?.[1] || raw).replace(/\D/g,'').slice(0,44);
        stopScan();
        onResult && onResult(chave || raw);
      }else{
        show('Nenhum QR reconhecido. Tente outra foto.');
      }
    }catch{ show('Erro ao processar a imagem.'); }
    input.value = '';
  };
}