// app/despesas/js/app.js
import { app, auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getFirestore, collection, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

import { uploadArtifacts, saveManualDespesaPDF, initDrive } from './drive.js';
import { parseNFCe } from './nfce.js';
import { parseNFCeXML, parseNFe55XML } from './nfe.js';
import { store } from './store.js';
import { QRScanner } from './scanner.js';

// ===== CONFIG OAuth Google =====
const GOOGLE_OAUTH_CLIENT_ID = '329806123621-p2ttq9g7th9fdul74u6t7gntla0q2gcm.apps.googleusercontent.com';

// ===== Firestore (para log das despesas) =====
const db = getFirestore(app);

// ===== helpers UI =====
const $  = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
const setStatus = (t)=> { $('#statusBox').textContent = t || '—'; };

$('#btnVoltar').addEventListener('click', ()=> location.href = '/' );

// Usuário visível no topo (só o nome)
let currentUser = null;
onAuthStateChanged(auth, (user)=>{
  currentUser = user || null;
  const el = $('#usuarioLogado');
  if (user) {
    const nome = user.displayName || (user.email ? user.email.split('@')[0] : user.uid);
    el.textContent = `Usuário: ${nome}`;
  } else {
    el.textContent = 'Usuário: —';
  }
});

// ====== Drive OAuth (escopo drive.file) ======
let tokenClient;
function getGoogleAccessToken(scope){
  return new Promise((resolve, reject)=>{
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope,
        callback: (resp)=>{
          if (resp && resp.access_token) resolve(resp.access_token);
          else reject(new Error('Sem token OAuth'));
        }
      });
    }
    tokenClient.requestAccessToken({ prompt: '' });
  });
}
async function ensureDrive(){ await initDrive(getGoogleAccessToken); }

// ====== categorias ======
function hydrateCategorias(){
  const list = $('#listaCategorias');
  list.innerHTML = '';
  store.getCategorias().forEach(c=>{
    const o=document.createElement('option'); o.value=c; list.appendChild(o);
  });
}
hydrateCategorias();

// ====== adicionar linha produto ======
document.body.addEventListener('click', (e)=>{
  if (e.target.classList.contains('btn-add-linha')){
    const linha = e.target.closest('.produto-linha');
    const clone = linha.cloneNode(true);
    clone.querySelectorAll('input').forEach(i=> i.value = '');
    $('#produtosBox').appendChild(clone);
  }
});

// ====== salvar manual (PDF + Drive + log Firebase) ======
$('#btnSalvarManual').addEventListener('click', async ()=>{
  const cat  = ($('#categoriaManual').value || '').trim();
  const estab= ($('#estabelecimento').value || '').trim();
  const itens= $$('.produto-linha').map(l => ({
    nome:  l.querySelector('.produto-nome').value.trim(),
    valor: parseFloat(l.querySelector('.produto-valor').value || 0) || 0
  })).filter(p => p.nome || p.valor>0);

  if (!cat) return alert('Informe a categoria.');
  if (!itens.length) return alert('Adicione ao menos um item.');

  // lembrar categoria
  const cats = Array.from(new Set([cat, ...store.getCategorias()]));
  store.setCategorias(cats); hydrateCategorias();

  setStatus('Gerando PDF e enviando ao Drive…');
  try{
    await ensureDrive();
    const when = new Date();
    const pdfBlob = await saveManualDespesaPDF({ categoria:cat, estabelecimento:estab, itens, criadoEm: when });
    const yyyy = when.getFullYear();
    const mm = String(when.getMonth()+1).padStart(2,'0');
    const dd = String(when.getDate()).padStart(2,'0');
    const HH = String(when.getHours()).padStart(2,'0');
    const MM = String(when.getMinutes()).padStart(2,'0');
    const estabSlug = (estab||'SEM-ESTAB').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'').toUpperCase();
    const pdfName = `MANUAL_${cat.toUpperCase()}_${yyyy}-${mm}-${dd}_${HH}${MM}_${estabSlug}.pdf`;

    const up = await uploadArtifacts({
      isoDate: when.toISOString(),
      visualBlob: pdfBlob,
      visualName: pdfName,
      tipo: 'Manuais',
      categoria: cat
    });

    // log no Firebase
    try{
      await addDoc(collection(db,'despesas'), {
        userUid: currentUser?.uid || null,
        userEmail: currentUser?.email || null,
        tipo: 'Manual',
        categoria: cat,
        estabelecimento: estab || null,
        total: itens.reduce((s,p)=> s + (p.valor||0), 0),
        drive: up,
        createdAt: serverTimestamp()
      });
    }catch(e){ console.warn('Log Firebase falhou:', e); }

    setStatus('OK • salvo no Drive.');
    alert('Despesa manual salva no Drive!');
  }catch(e){
    console.error(e);
    setStatus('Falha ao salvar no Drive.');
    alert('Falha ao salvar no Drive.');
  }
});

/* ==================== NFC-e (URL) ==================== */
$('#btnProcessarNfce').addEventListener('click', async ()=>{
  const cat = ($('#categoriaNfce').value || 'GERAL').trim() || 'GERAL';
  const url = ($('#qrUrl').value || '').trim();
  if (!url) return alert('Cole a URL do QR da NFC-e.');

  const parsed = parseNFCe(url);
  if (!parsed) return alert('URL da NFC-e inválida.');

  setStatus('Processando NFC-e…');
  try{
    await ensureDrive();

    const when = new Date();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('NFC-e (QR) • Registro', 14, 18);
    doc.setFontSize(11);
    doc.text(`Categoria: ${cat}`, 14, 28);
    doc.text(`Chave: ${parsed.accessKey}`, 14, 36);
    doc.text(`URL: ${url}`, 14, 44, { maxWidth: 180 });
    const pdfBlob = doc.output('blob');

    const yyyy = when.getFullYear();
    const mm = String(when.getMonth()+1).padStart(2,'0');
    const dd = String(when.getDate()).padStart(2,'0');
    const HH = String(when.getHours()).padStart(2,'0');
    const MM = String(when.getMinutes()).padStart(2,'0');
    const name = `NFCE_${cat.toUpperCase()}_${yyyy}-${mm}-${dd}_${HH}${MM}_${parsed.accessKey.slice(-8)}.pdf`;

    const up = await uploadArtifacts({
      isoDate: when.toISOString(),
      visualBlob: pdfBlob,
      visualName: name,
      tipo: 'NFCe',
      categoria: cat
    });

    $('#nfcePreview').style.display='block';
    $('#nfcePreview').textContent = `Chave: ${parsed.accessKey}\nCategoria: ${cat}`;

    try{
      await addDoc(collection(db,'despesas'), {
        userUid: currentUser?.uid || null,
        userEmail: currentUser?.email || null,
        tipo: 'NFCe_URL',
        categoria: cat,
        chave: parsed.accessKey,
        drive: up,
        createdAt: serverTimestamp()
      });
    }catch(e){ console.warn('Log Firebase falhou:', e); }

    setStatus('NFC-e salva no Drive.');
  }catch(e){
    console.error(e);
    setStatus('Falha ao processar NFC-e.');
    alert('Falha ao processar NFC-e.');
  }
});

/* ==================== Scanner (Câmera) + OCR ==================== */
import('./scanner.js'); // garante que o arquivo esteja no cache do SW
let scanner = null;
const video = $('#qrVideo');

async function startScanner(){
  if (scanner) return;
  setStatus('Abrindo câmera…');
  scanner = new QRScanner({
    video,
    onResult: async (text)=>{
      try{
        const cat = ($('#categoriaNfce').value || 'GERAL').trim() || 'GERAL';
        const parsed = parseNFCe(text);
        if (parsed) {
          $('#qrUrl').value = text;
          $('#btnProcessarNfce').click(); // reaproveita fluxo de URL
        } else {
          // Se não for URL válida de NFC-e, deixe usuário tentar OCR
          setStatus('Código lido mas não é NFC-e. Tente OCR (foto atual).');
        }
      } finally {
        stopScannerButtonsOnly(); // mantemos vídeo on para OCR se quiser
      }
    },
    onError: (e)=>{
      console.warn('Scanner error:', e);
      setStatus(e?.message || 'Erro de câmera');
    }
  });
  await scanner.start();
  $('#btnFecharCamera').disabled = false;
  $('#btnPararLeitura').disabled = false;
  $('#btnRodarOCR').disabled = false;
}
function stopScanner(){
  if (scanner){ scanner.stop(); scanner = null; }
  $('#btnFecharCamera').disabled = true;
  $('#btnPararLeitura').disabled = true;
  // mantemos OCR desabilitado sem vídeo
  $('#btnRodarOCR').disabled = true;
}
function stopScannerButtonsOnly(){
  $('#btnPararLeitura').disabled = true;
  // mantemos vídeo aberto para o OCR
}

$('#btnAbrirCamera').addEventListener('click', startScanner);
$('#btnFecharCamera').addEventListener('click', ()=>{ stopScanner(); setStatus('Câmera fechada.'); });
$('#btnPararLeitura').addEventListener('click', ()=>{ stopScannerButtonsOnly(); setStatus('Leitura pausada.'); });

$('#btnRodarOCR').addEventListener('click', async ()=>{
  if (!video || video.readyState < 2) return alert('Abra a câmera antes.');
  setStatus('Executando OCR… isso pode levar alguns segundos.');

  // captura frame atual
  const canvas = document.createElement('canvas');
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  canvas.width = vw; canvas.height = vh;
  canvas.getContext('2d').drawImage(video, 0, 0, vw, vh);
  const dataUrl = canvas.toDataURL('image/png');

  try{
    const result = await Tesseract.recognize(dataUrl, 'por', { logger:()=>{} });
    const texto = (result?.data?.text || '').trim() || '(sem texto)';
    // gera PDF do OCR
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('OCR de NFC-e • Registro Visual', 14, 18);
    doc.setFontSize(10);
    doc.text('Imagem capturada da câmera e reconhecida por OCR (Tesseract).', 14, 26);
    doc.setFontSize(11);
    doc.text(texto, 14, 38, { maxWidth: 180 });
    const pdfBlob = doc.output('blob');

    await ensureDrive();
    const when = new Date();
    const yyyy = when.getFullYear();
    const mm = String(when.getMonth()+1).padStart(2,'0');
    const dd = String(when.getDate()).padStart(2,'0');
    const HH = String(when.getHours()).padStart(2,'0');
    const MM = String(when.getMinutes()).padStart(2,'0');

    const cat = ($('#categoriaNfce').value || 'GERAL').trim() || 'GERAL';
    const name = `OCR_${cat.toUpperCase()}_${yyyy}-${mm}-${dd}_${HH}${MM}.pdf`;

    const up = await uploadArtifacts({
      isoDate: when.toISOString(),
      visualBlob: pdfBlob,
      visualName: name,
      tipo: 'OCR',
      categoria: cat
    });

    try{
      await addDoc(collection(db,'despesas'), {
        userUid: currentUser?.uid || null,
        userEmail: currentUser?.email || null,
        tipo: 'OCR',
        categoria: cat,
        ocrTextLen: texto.length,
        drive: up,
        createdAt: serverTimestamp()
      });
    }catch(e){ console.warn('Log Firebase falhou:', e); }

    setStatus('OCR salvo no Drive.');
    alert('OCR salvo no Drive!');
  }catch(e){
    console.error(e);
    setStatus('Falha no OCR');
    alert('Falha no OCR');
  }
});

/* ==================== XML (55/65) ==================== */
$('#btnProcessarNfe').addEventListener('click', async ()=>{
  const file = $('#xmlFile').files[0];
  if (!file) return alert('Selecione o XML (.xml)');
  setStatus('Lendo XML…');
  try{
    await ensureDrive();
    const xmlStr = await file.text();
    const data55 = parseNFe55XML(xmlStr);
    const data = data55?.itens?.length ? data55 : parseNFCeXML(xmlStr);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`${data.origem === 'nfe55' ? 'NFe-55' : 'NFC-e'} • Registro`, 14, 18);
    doc.setFontSize(11);
    doc.text(`Empresa: ${data.empresa || '-'}`, 14, 28);
    if (data.cnpj) doc.text(`CNPJ: ${data.cnpj}`, 14, 36);

    let y = 48;
    doc.text('Itens:', 14, y); y+=6;
    (data.itens||[]).slice(0,30).forEach(it=>{
      const line = `${it.nome}  x${it.qtd}  R$ ${Number(it.unit||0).toFixed(2)}  =  R$ ${Number(it.subtotal||0).toFixed(2)}`;
      doc.text(line, 14, y, { maxWidth: 180 }); y+=6;
      if (y > 280) { doc.addPage(); y = 20; }
    });
    y+=4;
    doc.setFontSize(12);
    doc.text(`TOTAL: R$ ${Number(data.total||0).toFixed(2)}`, 14, y);
    const pdfBlob = doc.output('blob');

    const when = new Date();
    const yyyy = when.getFullYear();
    const mm = String(when.getMonth()+1).padStart(2,'0');
    const dd = String(when.getDate()).padStart(2,'0');
    const HH = String(when.getHours()).padStart(2,'0');
    const MM = String(when.getMinutes()).padStart(2,'0');
    const base = `${data.origem.toUpperCase()}_${yyyy}-${mm}-${dd}_${HH}${MM}_${(data.empresa||'EMPRESA').substring(0,20).toUpperCase().replace(/[^A-Z0-9]+/g,'-')}`;

    const up = await uploadArtifacts({
      isoDate: when.toISOString(),
      visualBlob: pdfBlob,
      visualName: base + '.pdf',
      xmlBlob: new Blob([xmlStr], { type:'text/xml' }),
      xmlName: base + '.xml',
      tipo: data.origem === 'nfe55' ? 'NFe55' : 'NFCe',
      categoria: 'GERAL'
    });

    $('#nfePreview').style.display='block';
    $('#nfePreview').textContent = `${data.empresa||'-'}  •  Total R$ ${Number(data.total||0).toFixed(2)}`;

    try{
      await addDoc(collection(db,'despesas'), {
        userUid: currentUser?.uid || null,
        userEmail: currentUser?.email || null,
        tipo: data.origem.toUpperCase(),
        categoria: 'GERAL',
        total: Number(data.total||0),
        drive: up,
        createdAt: serverTimestamp()
      });
    }catch(e){ console.warn('Log Firebase falhou:', e); }

    setStatus('XML processado e salvo no Drive.');
  }catch(e){
    console.error(e);
    setStatus('Falha ao processar XML.');
    alert('Falha ao processar XML.');
  }
});