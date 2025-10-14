// /app/despesas/js/app.js
import { auth, onAuthUser, saveManualToFirestore } from './firebase.js';
import { initDrive, uploadArtifacts, saveManualDespesaToDrive } from './drive.js';
import { QRScanner } from './scanner.js';
import { parseNFCe } from './nfce.js';
import { ocrImageToExpense } from './ocr.js'; // NEW

// ---------- CONFIG GOOGLE OAUTH (Drive) ----------
const GOOGLE_CLIENT_ID = '329806123621-p2ttq9g7th9fdul74u6t7gntla0q2gcm.apps.googleusercontent.com';
let googleReady = false;
async function ensureGoogle(){
  if (googleReady) return;
  await new Promise(r => gapi.load('client:auth2', r));
  await gapi.client.init({
    clientId: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
  });
  googleReady = true;
}
async function getGoogleAccessToken(){
  await ensureGoogle();
  const auth2 = gapi.auth2.getAuthInstance();
  let user = auth2.currentUser.get();
  if (!user || !user.isSignedIn()) user = await auth2.signIn();
  return user.getAuthResponse(true).access_token;
}

// ---------- UI helpers ----------
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
function toast(txt){ const b=$('#statusBox'); if (b) b.textContent = txt; }

// ---------- Header: voltar e logo ----------
document.addEventListener('click', (ev)=>{
  if (ev.target.id==='btnVoltar' || ev.target.closest('.logo')) {
    ev.preventDefault();
    location.href = '/';
  }
});

// ---------- Usuário logado no topo ----------
onAuthUser((user)=>{
  const el = $('#usuarioLogado');
  if (!el) return;
  if (user) {
    const nomePreferencial = user.displayName || user.email || 'Usuário';
    el.textContent = `Usuário: ${nomePreferencial}`;
  } else {
    el.textContent = 'Usuário: —';
  }
});

// ---------- Categorias recentes (localStorage) ----------
const CAT_KEY = 'unikor_despesas:cats';
function getCats(){
  try{ return JSON.parse(localStorage.getItem(CAT_KEY)||'[]'); }catch{ return []; }
}
function setCats(arr){
  localStorage.setItem(CAT_KEY, JSON.stringify(Array.from(new Set(arr)).slice(0,50)));
}
function refreshCatDatalist(){
  const dl = $('#listaCategorias'); if (!dl) return;
  dl.innerHTML = '';
  getCats().forEach(c=>{
    const o=document.createElement('option');
    o.value = c; dl.appendChild(o);
  });
}

// ---------- Despesa Manual ----------
function addLinhaProduto(){
  const line = document.createElement('div');
  line.className = 'produto-linha';
  line.innerHTML = `
    <input class="produto-nome" placeholder="Produto" />
    <input class="produto-valor" type="number" step="0.01" inputmode="decimal" placeholder="Valor (R$)" />
    <button type="button" class="btn btn-add-linha">+</button>
    <button type="button" class="btn btn-rem-linha" title="Remover">–</button>
  `;
  $('#linhasProdutos').appendChild(line);
}
$('#linhasProdutos')?.addEventListener('click', (e)=>{
  if (e.target.classList.contains('btn-add-linha')) addLinhaProduto();
  if (e.target.classList.contains('btn-rem-linha')) {
    const row = e.target.closest('.produto-linha');
    if (row && $('#linhasProdutos').children.length>1) row.remove();
  }
});
addLinhaProduto(); // primeira linha
refreshCatDatalist();

function getFormaPagamento(){ return ($('#formaPagamento')?.value || 'OUTROS').toUpperCase(); }

// Salvar Manual
$('#btnSalvarManual')?.addEventListener('click', async ()=>{
  const categoria = ($('#categoriaManual').value||'GERAL').trim();
  const estabelecimento = ($('#estabelecimento').value||'').trim();
  const formaPagamento = getFormaPagamento();
  const itens = $$('.produto-linha').map(r=>{
    return {
      nome: r.querySelector('.produto-nome').value.trim(),
      valor: Number(r.querySelector('.produto-valor').value||0)
    };
  }).filter(p=>p.nome || p.valor);

  if (!itens.length){ alert('Adicione ao menos 1 item.'); return; }

  setCats([categoria, ...getCats()]); refreshCatDatalist();
  const total = itens.reduce((s,p)=>s+(p.valor||0),0);

  try{
    toast('Gerando PDF…');
    if (!window.jspdf) {
      await new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const now = new Date();
    doc.setFontSize(16); doc.text('DESPESA MANUAL', 14, 16);
    doc.setFontSize(11);
    doc.text(`Categoria: ${(categoria||'GERAL').toUpperCase()}`, 14, 26);
    doc.text(`Estabelecimento: ${estabelecimento||'-'}`, 14, 33);
    doc.text(`Forma: ${formaPagamento}`, 14, 40);
    doc.text(`Data: ${now.toLocaleString('pt-BR')}`, 14, 47);
    doc.text('Itens:', 14, 57);

    let y = 65;
    itens.forEach(p=>{
      doc.text(`• ${p.nome} — R$ ${(p.valor||0).toFixed(2)}`, 18, y);
      y += 7; if (y > 280) { doc.addPage(); y = 20; }
    });
    doc.setFontSize(12); doc.text(`TOTAL: R$ ${total.toFixed(2)}`, 14, y+6);

    const pdfBlob = doc.output('blob');

    toast('Conectando ao Google Drive…');
    await initDrive(getGoogleAccessToken);

    toast('Enviando ao Drive…');
    await saveManualDespesaToDrive({
      categoria, estabelecimento,
      produtos: itens, criadoEm: now.toISOString()
    });
    await uploadArtifacts({
      isoDate: now.toISOString(),
      visualBlob: pdfBlob,
      visualName: `MANUAL_${(categoria||'GERAL').toUpperCase()}_${now.toISOString().slice(0,16).replace(/[:T]/g,'-')}.pdf`,
      tipo: 'Manuais',
      categoria
    });

    try{
      await saveManualToFirestore({ categoria, estabelecimento, itens, total, formaPagamento, source:'MANUAL' });
    }catch(e){ console.warn('Firestore: opcional falhou', e); }

    toast('Despesa manual salva com sucesso!');
    alert('Despesa manual salva!');
    $('#linhasProdutos').innerHTML = ''; addLinhaProduto();
    $('#estabelecimento').value = '';
  }catch(e){
    console.error(e); alert('Falha ao salvar despesa manual.'); toast(String(e.message||e));
  }
});

// ---------- OCR: preview + downscale ----------
let ocrBlob = null;
function blobToDataURL(blob){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
async function downscaleImage(file, maxSide = 1600, mime = 'image/jpeg', quality = 0.9){
  const dataUrl = await blobToDataURL(file);
  const img = new Image();
  await new Promise((res, rej)=>{ img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const { width:w0, height:h0 } = img;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise(res=> canvas.toBlob(b=> res(b), mime, quality));
}
async function setOcrPreview(file){
  ocrBlob = await downscaleImage(file);
  const url = await blobToDataURL(ocrBlob);
  const img = $('#ocrPreviewImg'); if (img) img.src = url;
  $('#ocrPreviewWrap')?.classList.remove('hidden');
}
function clearOcrPreview(){
  ocrBlob = null;
  const img = $('#ocrPreviewImg'); if (img) img.src = '';
  $('#ocrPreviewWrap')?.classList.add('hidden');
  const inp = $('#fotoNota'); if (inp) inp.value = '';
}

$('#fotoNota')?.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0]; if (!f) return;
  try{ toast('Preparando imagem…'); await setOcrPreview(f); toast('Imagem pronta para OCR.'); }
  catch(err){ console.warn(err); alert('Não foi possível preparar a imagem.'); }
});
$('#btnOcrTrocar')?.addEventListener('click', ()=> $('#fotoNota')?.click());
$('#btnOcrLimpar')?.addEventListener('click', ()=> clearOcrPreview());

$('#btnOcr')?.addEventListener('click', async ()=>{
  const f = ocrBlob || $('#fotoNota')?.files?.[0];
  if (!f){ alert('Selecione uma foto de nota primeiro.'); return; }
  try{
    toast('Fazendo OCR…');
    const res = await ocrImageToExpense(f); // {estabelecimento, data, itens, total}
    if (res.estabelecimento) $('#estabelecimento').value = res.estabelecimento.slice(0,80);

    $('#linhasProdutos').innerHTML = '';
    (res.itens.length ? res.itens : [{nome:'',valor:0}]).forEach(i=>{
      const wrap = document.createElement('div');
      wrap.className = 'produto-linha';
      wrap.innerHTML = `
        <input class="produto-nome" placeholder="Produto" value="${i.nome||''}"/>
        <input class="produto-valor" type="number" step="0.01" inputmode="decimal" placeholder="Valor (R$)" value="${(i.valor||0).toFixed(2)}"/>
        <button type="button" class="btn btn-add-linha">+</button>
        <button type="button" class="btn btn-rem-linha" title="Remover">–</button>`;
      $('#linhasProdutos').appendChild(wrap);
    });

    toast(`OCR concluído. Itens: ${res.itens.length} | Total sugerido: R$ ${res.total.toFixed(2)}`);
    alert('OCR concluído! Revise os itens antes de salvar.');
  }catch(e){
    console.error(e);
    alert('Falha no OCR. Tente outra foto ou edite manualmente.');
    toast('Falha no OCR.');
  }
});

// ---------- NFC-e (URL e Câmera) ----------
let scanner = null;

function openNfcePortal(url){
  try { window.open(url, '_blank', 'noopener'); }
  catch { location.href = url; }
}

// (opcional) Cloud Function para PDF automático
async function downloadPdfFromFunction(nfceUrl){
  // Ajuste este endpoint se você usar rewrite no Hosting.
  const endpoint = '/api/api/nfce/pdf?url=' + encodeURIComponent(nfceUrl);
  const resp = await fetch(endpoint, { method:'GET' });
  if (!resp.ok) throw new Error('Falha ao gerar PDF (' + resp.status + ')');
  return await resp.blob(); // application/pdf
}

$('#btnProcessarNfce')?.addEventListener('click', async ()=>{
  const raw = ($('#qrUrl').value||'').trim();
  if (!raw){ alert('Cole a URL do QR da NFC-e.'); return; }
  const parsed = parseNFCe(raw);
  if (!parsed){ alert('URL inválida de NFC-e.'); return; }
  toast(`Chave: ${parsed.accessKey}`);

  // Escolha: abrir página oficial OU tentar PDF automático
  const go = confirm('QR reconhecido. OK = abrir página oficial; Cancelar = gerar PDF automático e salvar no Drive.');
  if (go) { openNfcePortal(raw); return; }

  try{
    toast('Gerando PDF da NFC-e…');
    const pdfBlob = await downloadPdfFromFunction(raw);

    toast('Conectando ao Google Drive…');
    await initDrive(getGoogleAccessToken);

    const now = new Date();
    const cat = ($('#categoriaNfce')?.value || 'GERAL').trim();
    await uploadArtifacts({
      isoDate: now.toISOString(),
      visualBlob: pdfBlob,
      visualName: `NFCe_${parsed.accessKey.slice(0,8)}…${parsed.accessKey.slice(-6)}_${now.toISOString().slice(0,10)}.pdf`,
      tipo: 'NFCe',
      categoria: cat
    });

    try{
      await saveManualToFirestore({
        categoria: cat, estabelecimento: '', itens: [], total: 0,
        formaPagamento: 'OUTROS', source:'NFCe-PDF(Auto)'
      });
    }catch{}

    alert('PDF da NFC-e salvo no Drive com sucesso!');
    toast('NFC-e arquivada (PDF).');
  }catch(e){
    console.warn(e);
    alert('Falha ao gerar PDF automático. Você pode abrir a página e anexar o PDF manualmente.');
    toast('Falha ao gerar PDF automático.');
  }
});

$('#btnAbrirCamera')?.addEventListener('click', async ()=>{
  const vid = $('#video'); const out = $('#qrUrl');
  if (!navigator.mediaDevices?.getUserMedia){
    alert('Seu navegador não oferece câmera nessa página.');
    return;
  }
  scanner = new QRScanner({
    video: vid,
    onResult: (text)=>{
      out.value = text;
      toast('QR lido com sucesso!');
      alert('QR lido! URL preenchida.');
      scanner?.stop();
      $('#btnFecharCamera').disabled = true;
      $('#btnAbrirCamera').disabled = false;
    },
    onError: (e)=>{ console.warn(e); alert('Falha ao acessar câmera. Verifique permissões/HTTPS.'); }
  });
  $('#btnAbrirCamera').disabled = true;
  $('#btnFecharCamera').disabled = false;
  await scanner.start();
});

$('#btnFecharCamera')?.addEventListener('click', ()=>{
  scanner?.stop();
  $('#btnFecharCamera').disabled = true;
  $('#btnAbrirCamera').disabled = false;
});

// Upload manual do PDF salvo via “Compartilhar”
$('#btnUploadPdfNfce')?.addEventListener('click', async ()=>{
  const f = $('#pdfNfce')?.files?.[0];
  if (!f){ alert('Selecione o PDF exportado da página da NFC-e.'); return; }
  try{
    toast('Enviando PDF ao Drive…');
    await initDrive(getGoogleAccessToken);
    const now = new Date();
    const cat = ($('#categoriaNfce')?.value || 'GERAL').trim();
    await uploadArtifacts({
      isoDate: now.toISOString(),
      visualBlob: f,
      visualName: `NFCe_${now.toISOString().slice(0,10)}.pdf`,
      tipo: 'NFCe',
      categoria: cat
    });
    try{
      await saveManualToFirestore({
        categoria: cat, estabelecimento: '', itens: [], total: 0,
        formaPagamento: 'OUTROS', source: 'NFCe-PDF'
      });
    }catch{}
    alert('PDF da NFC-e enviado ao Drive com sucesso!');
    toast('PDF enviado ao Drive.');
  }catch(e){
    console.error(e); alert('Falha ao enviar PDF ao Drive.'); toast('Erro no upload do PDF.');
  }
});

// ---------- SW: auto-update (FIX) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async ()=>{
    try{
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible') reg.update(); });
      setInterval(()=>reg.update(), 5*60*1000);
      reg.addEventListener('updatefound', ()=>{
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', ()=>{
          if (nw.state==='installed' && navigator.serviceWorker.controller) {
            reg.waiting && reg.waiting.postMessage('SKIP_WAITING'); // <- string correta
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', ()=>{
        if (!window._reloadedBySW) { window._reloadedBySW = true; location.reload(); }
      });
    }catch(e){ console.warn('SW register:', e); }
  });
}