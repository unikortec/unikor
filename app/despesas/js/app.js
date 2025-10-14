// /app/despesas/js/app.js  — CONSOLIDADO
import { auth, onAuthUser, saveManualToFirestore } from './firebase.js';
import { initDrive, uploadArtifacts, saveManualDespesaToDrive } from './drive.js';
import { QRScanner } from './scanner.js';
import { parseNFCe } from './nfce.js';
import { ocrImageToExpense } from './ocr.js'; // <- manter import no topo

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

// ---------- Navegação (logo/voltar) ----------
document.addEventListener('click', (ev)=>{
  if (ev.target.id==='btnVoltar' || ev.target.closest('.logo')) {
    ev.preventDefault();
    location.href = '/';
  }
});

// ---------- Usuário logado ----------
onAuthUser((user)=>{
  const el = $('#usuarioLogado');
  if (!el) return;
  el.textContent = user
    ? `Usuário: ${user.displayName || user.email || 'Usuário'}`
    : 'Usuário: —';
});

// ---------- Categorias recentes (localStorage) ----------
const CAT_KEY = 'unikor_despesas:cats';
function getCats(){ try{ return JSON.parse(localStorage.getItem(CAT_KEY)||'[]'); }catch{ return []; } }
function setCats(arr){ localStorage.setItem(CAT_KEY, JSON.stringify(Array.from(new Set(arr)).slice(0,50))); }
function refreshCatDatalist(){
  const dl = $('#listaCategorias'); if (!dl) return;
  dl.innerHTML = '';
  getCats().forEach(c=>{ const o=document.createElement('option'); o.value=c; dl.appendChild(o); });
}

// ---------- Linhas de produtos ----------
function addLinhaProduto(){
  const line = document.createElement('div');
  line.className = 'produto-linha';
  line.innerHTML = `
    <input class="produto-nome" placeholder="Produto" />
    <input class="produto-valor" type="number" inputmode="decimal" step="0.01" placeholder="Valor (R$)" />
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

// ---------- Forma de pagamento ----------
function getFormaPagamento(){ return ($('#formaPagamento')?.value || 'OUTROS').toUpperCase(); }

// ---------- Salvar despesa manual ----------
$('#btnSalvarManual')?.addEventListener('click', async ()=>{
  const categoria = ($('#categoriaManual').value||'GERAL').trim();
  const estabelecimento = ($('#estabelecimento').value||'').trim();
  const formaPagamento = getFormaPagamento();

  const itens = $$('.produto-linha').map(r=>({
    nome:  (r.querySelector('.produto-nome').value||'').trim(),
    valor: Number(r.querySelector('.produto-valor').value||0)
  })).filter(p=>p.nome || p.valor);

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
      categoria, estabelecimento, produtos: itens, criadoEm: now.toISOString()
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
    console.error(e);
    alert('Falha ao salvar despesa manual.');
    toast(String(e.message||e));
  }
});

// ---------- OCR (Foto da nota) ----------
$('#btnOcr')?.addEventListener('click', async ()=>{
  const f = $('#fotoNota')?.files?.[0];
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
        <input class="produto-valor" type="number" inputmode="decimal" step="0.01" placeholder="Valor (R$)" value="${(i.valor||0).toFixed(2)}"/>
        <button type="button" class="btn btn-add-linha">+</button>
        <button type="button" class="btn btn-rem-linha" title="Remover">–</button>`;
      $('#linhasProdutos').appendChild(wrap);
    });
    toast(`OCR concluído. Itens: ${res.itens.length} | Total sugerido: R$ ${res.total.toFixed(2)}`);
    alert('OCR concluído! Revise os itens antes de salvar.');
  }catch(e){
    console.error(e);
    alert('Falha no OCR. Edite manualmente ou tente outra foto.');
    toast('Falha no OCR.');
  }
});

// ---------- NFC-e (URL e Câmera) ----------
let scanner = null;

$('#btnProcessarNfce')?.addEventListener('click', async ()=>{
  const raw = ($('#qrUrl').value||'').trim();
  if (!raw){ alert('Cole a URL do QR da NFC-e.'); return; }
  const parsed = parseNFCe(raw);
  if (!parsed){ alert('URL inválida de NFC-e.'); return; }
  toast(`Chave: ${parsed.accessKey}`);
  alert('URL de NFC-e reconhecida!');
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

// ---------- SW: auto-update (string 'SKIP_WAITING') ----------
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
            reg.waiting && reg.waiting.postMessage('SKIP_WAITING');
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', ()=>{
        if (!window._reloadedBySW) { window._reloadedBySW = true; location.reload(); }
      });
    }catch(e){ console.warn('SW register:', e); }
  });
}