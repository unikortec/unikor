// /app/despesas/js/app.js
import { auth, onAuthUser, getGoogleAccessToken } from './firebase.js';
import { initDrive, uploadArtifacts, saveManualDespesaToDrive } from './drive.js';
import { QRScanner } from './scanner.js';
import { parseNFCe } from './nfce.js';
import { parseNFCeXML, parseNFe55XML } from './nfe.js';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
let scanner = null;
let gapiInitDone = false;

function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function status(msg){ $('#statusBox').textContent = String(msg || ''); }
function toast(msg){ try{ alert(msg); }catch{} }

async function ensureDrive(){
  if (gapiInitDone) return;
  await initDrive(async ()=> await getGoogleAccessToken(DRIVE_SCOPE));
  gapiInitDone = true;
}

/* ---------- Header / Navegação ---------- */
function wireHeader(){
  $('#btnVoltar')?.addEventListener('click', ()=> location.href = '/');
  $('#logoHome')?.addEventListener('click',   ()=> location.href = '/');

  onAuthUser((user)=>{
    const el = $('#usuarioLogado');
    if (!el) return;
    if (user) {
      const name = user.displayName || (user.email ? user.email.split('@')[0] : user.uid);
      el.textContent = `Usuário: ${name}`;
    } else {
      el.textContent = 'Usuário: —';
    }
  });
}

/* ---------- Categorias (persistir no localStorage) ---------- */
const CAT_KEY = 'unikor_despesas:cats';
function getCats(){
  try{ return JSON.parse(localStorage.getItem(CAT_KEY)||'[]'); }catch{ return []; }
}
function setCats(list){
  try{ localStorage.setItem(CAT_KEY, JSON.stringify(list||[])); }catch{}
}
function addCatIfNew(cat){
  const c = (String(cat||'').trim());
  if (!c) return;
  const list = getCats();
  if (!list.includes(c)) { list.push(c); setCats(list); hydrateCats(); }
}
function hydrateCats(){
  const dl = $('#listaCategorias'); if (!dl) return;
  dl.innerHTML = '';
  getCats().forEach(c=>{
    const o = document.createElement('option'); o.value = c; dl.appendChild(o);
  });
}

/* ---------- Linhas de produto (manual) ---------- */
function addProdutoLinha(){
  const box = $('#produtosBox');
  const linha = document.createElement('div');
  linha.className = 'produto-linha';
  linha.innerHTML = `
    <input class="produto-nome"  placeholder="Produto">
    <input class="produto-valor" type="number" step="0.01" placeholder="Valor (R$)">
    <button type="button" class="btn btn-add-linha" title="Adicionar linha">+</button>`;
  box.appendChild(linha);
}
function wireProdutos(){
  document.body.addEventListener('click', (e)=>{
    const t = e.target;
    if (t && t.classList && t.classList.contains('btn-add-linha')){
      addProdutoLinha();
    }
  });
}

/* ---------- PDF helpers ---------- */
function manualToPDFBlob({ categoria, estabelecimento, produtos, userName }){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });

  let y = 40;
  doc.setFontSize(16); doc.text('UNIKOR • Despesa Manual', 40, y); y += 22;
  doc.setFontSize(11);
  doc.text(`Usuário: ${userName||'-'}`, 40, y); y += 16;
  doc.text(`Categoria: ${categoria||'-'}`, 40, y); y += 16;
  doc.text(`Estabelecimento: ${estabelecimento||'-'}`, 40, y); y += 22;

  doc.setFontSize(12); doc.text('Itens:', 40, y); y += 16;
  doc.setFontSize(11);
  let total = 0;
  (produtos||[]).forEach((p, idx)=>{
    const nome = String(p.nome||'-');
    const val  = Number(p.valor)||0;
    total += val;
    doc.text(`${idx+1}. ${nome}`, 50, y);
    doc.text(`R$ ${val.toFixed(2)}`, 480, y, { align:'right' });
    y += 16;
  });
  y += 12;
  doc.setFontSize(12);
  doc.text(`TOTAL: R$ ${total.toFixed(2)}`, 480, y, { align:'right' });

  return doc.output('blob');
}

function simpleNFCePDFBlob({ url, categoria, userName }){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  let y = 40;
  doc.setFontSize(16); doc.text('UNIKOR • NFC-e', 40, y); y += 22;
  doc.setFontSize(11);
  doc.text(`Usuário: ${userName||'-'}`, 40, y); y += 16;
  doc.text(`Categoria: ${categoria||'-'}`, 40, y); y += 16;
  doc.text('URL do QR:', 40, y); y += 16;
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(String(url||'-'), 520);
  lines.forEach(l=>{ doc.text(l, 40, y); y += 14; });
  return doc.output('blob');
}

/* ---------- Salvar Despesa Manual ---------- */
async function handleSalvarManual(){
  const categoria = $('#categoriaManual')?.value?.trim() || 'GERAL';
  const estabelecimento = $('#estabelecimento')?.value?.trim() || '';
  const produtos = $all('.produto-linha').map(l=>({
    nome:  l.querySelector('.produto-nome')?.value?.trim(),
    valor: parseFloat(l.querySelector('.produto-valor')?.value||0) || 0
  })).filter(p=>p.nome || p.valor);

  if (!produtos.length){
    toast('Adicione pelo menos um produto.');
    return;
  }

  addCatIfNew(categoria);

  // nome do usuário logado
  const user = auth.currentUser;
  const userName = user?.displayName || (user?.email ? user.email.split('@')[0] : '-');

  try{
    status('Gerando PDF…');
    const pdfBlob = manualToPDFBlob({ categoria, estabelecimento, produtos, userName });

    await ensureDrive();
    status('Enviando ao Drive…');
    const nowISO = new Date().toISOString();
    const safeEstab = (estabelecimento||'SEM-ESTAB').replace(/[^\p{L}\p{N}\-_. ]/gu,'').trim();
    const filename = `MANUAL_${categoria.toUpperCase()}_${safeEstab}_${nowISO.slice(0,16).replace(/[:T]/g,'-')}.pdf`;

    await uploadArtifacts({
      isoDate: nowISO,
      visualBlob: pdfBlob,
      visualName: filename,
      xmlBlob: null,
      xmlName: null,
      tipo: 'Manuais',
      categoria
    });

    status('OK! Salvo no Drive.');
    toast('Despesa manual salva em PDF no Drive.');
  }catch(e){
    console.error(e);
    status('Erro ao salvar no Drive.');
    toast('Falha ao salvar a despesa.');
  }
}

/* ---------- NFC-e: URL e Câmera ---------- */
async function processarNfceUrl(){
  const url = $('#qrUrl')?.value?.trim();
  const categoria = $('#categoriaNfce')?.value?.trim() || 'GERAL';
  if (!url){ toast('Cole a URL do QR.'); return; }

  const parsed = parseNFCe(url);
  if (!parsed){ toast('URL inválida de NFC-e.'); return; }

  const user = auth.currentUser;
  const userName = user?.displayName || (user?.email ? user.email.split('@')[0] : '-');

  try{
    status('Gerando PDF da NFC-e…');
    const pdfBlob = simpleNFCePDFBlob({ url, categoria, userName });

    await ensureDrive();
    status('Enviando ao Drive…');
    const nowISO = new Date().toISOString();
    const filename = `NFCE_${categoria.toUpperCase()}_${parsed.accessKey.slice(0,10)}_${nowISO.slice(0,16).replace(/[:T]/g,'-')}.pdf`;

    await uploadArtifacts({
      isoDate: nowISO,
      visualBlob: pdfBlob,
      visualName: filename,
      xmlBlob: null,
      xmlName: null,
      tipo: 'NFCe',
      categoria
    });

    status('OK! NFC-e salva no Drive.');
    toast('NFC-e salva em PDF no Drive.');
  }catch(e){
    console.error(e); status('Erro ao salvar NFC-e no Drive.'); toast('Falha ao salvar NFC-e.');
  }
}

function wireCamera(){
  const video = $('#qrVideo');
  $('#btnStartCam')?.addEventListener('click', async ()=>{
    try{
      if (!scanner) scanner = new QRScanner({
        video,
        onResult: (text)=>{ $('#qrUrl').value = text; processarNfceUrl(); stopCam(); },
        onError: (e)=> status('Câmera: ' + (e?.message||e))
      });
      await scanner.start();
      $('#btnStartCam').disabled = true;
      $('#btnStopCam').disabled = false;
      status('Câmera ligada. Mire no QR da NFC-e.');
    }catch(e){
      console.error(e); toast('Não foi possível abrir a câmera.'); status('Erro na câmera.');
    }
  });
  function stopCam(){
    try{ scanner && scanner.stop(); }catch{} 
    $('#btnStartCam').disabled = false;
    $('#btnStopCam').disabled = true;
    status('Câmera desligada.');
  }
  $('#btnStopCam')?.addEventListener('click', stopCam);
}

/* ---------- NFe-55 (XML) -> PDF bem simples + XML no Drive ---------- */
async function handleProcessarNfe(){
  const inp = $('#xmlFile');
  const f = inp?.files?.[0];
  if (!f){ toast('Selecione um arquivo XML.'); return; }

  let xmlStr = '';
  try{ xmlStr = await f.text(); }catch{ toast('Erro ao ler arquivo.'); return; }

  // tenta ambos parsers (NFCe e NFe55) para gerar um PDF rápido
  let data = null;
  try{ data = parseNFe55XML(xmlStr); }catch{}
  if (!data){ try{ data = parseNFCeXML(xmlStr); }catch{} }
  if (!data){ toast('XML inválido.'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  let y = 40;
  doc.setFontSize(16); doc.text('UNIKOR • NFe-55 / NFC-e (resumo)', 40, y); y += 22;
  doc.setFontSize(11);
  doc.text(`Empresa: ${data.empresa||'-'}`, 40, y); y += 16;
  doc.text(`CNPJ: ${data.cnpj||'-'}`, 40, y); y += 16;
  doc.text(`Data: ${data.data||'-'}`, 40, y); y += 16;
  doc.text(`Total: R$ ${(Number(data.total)||0).toFixed(2)}`, 40, y); y += 22;
  doc.text('Itens:', 40, y); y += 16;
  (data.itens||[]).slice(0,25).forEach((it, i)=>{
    doc.text(`${i+1}. ${it.nome||'-'}`, 50, y);
    doc.text(`${(it.qtd||0)} x R$ ${(it.unit||0).toFixed(2)} = R$ ${(it.subtotal||0).toFixed(2)}`, 480, y, { align:'right' });
    y += 14;
  });
  const pdfBlob = doc.output('blob');

  try{
    await ensureDrive();
    const nowISO = new Date().toISOString();
    const pdfName = `NFE55_${(data.empresa||'EMPRESA').replace(/[^\p{L}\p{N}\-_. ]/gu,'')}_${nowISO.slice(0,16).replace(/[:T]/g,'-')}.pdf`;
    await uploadArtifacts({
      isoDate: nowISO,
      visualBlob: pdfBlob,
      visualName: pdfName,
      xmlBlob: new Blob([xmlStr], { type:'text/xml' }),
      xmlName: f.name,
      tipo: 'NFe55',
      categoria: 'GERAL'
    });
    status('OK! XML e PDF enviados ao Drive.');
    toast('XML processado e salvo no Drive.');
  }catch(e){
    console.error(e); status('Erro ao enviar XML ao Drive.'); toast('Falha ao salvar XML.');
  }
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', ()=>{
  wireHeader();
  hydrateCats();
  wireProdutos();
  wireCamera();

  $('#btnSalvarManual')?.addEventListener('click', handleSalvarManual);
  $('#btnProcessarNfce')?.addEventListener('click', processarNfceUrl);
  $('#btnProcessarNfe')?.addEventListener('click', handleProcessarNfe);

  status('Pronto.');
});