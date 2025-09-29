import { auth, onAuthUser } from './firebase.js';
import { uploadArtifacts } from './drive.js';
import { parseNFe55XML, parseNFCeXML } from './nfe.js';
import { parseNFCe } from './nfce.js';
import { QRScanner } from './scanner.js';

/* ---------------- Google Drive OAuth ---------------- */
const GOOGLE_CLIENT_ID = "329806123621-p2ttq9g7th9fdul74u6t7gntla0q2gcm.apps.googleusercontent.com";
let tokenClient = null;

function initTokenClient(){
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: ()=>{}
  });
  return tokenClient;
}

async function getGoogleAccessToken(scope){
  initTokenClient();
  return new Promise((resolve, reject)=>{
    tokenClient.callback = (resp)=>{
      if (resp && resp.access_token) resolve(resp.access_token);
      else reject(new Error('Falha no OAuth'));
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

/* ---------------- Utils UI ---------------- */
const $ = (s, r=document)=> r.querySelector(s);
const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
const statusBox = $('#statusBox');
const log = (msg)=> statusBox.textContent = String(msg || '—');

const NS = "unikor_despesas";
const key = (k)=> `${NS}:${k}`;
const store = {
  getCats(){ return JSON.parse(localStorage.getItem(key('cats'))||'[]'); },
  setCats(v){ localStorage.setItem(key('cats'), JSON.stringify(v)); }
};
function ensureCatInStore(cat){
  const v = (cat||'').trim();
  if (!v) return;
  const list = store.getCats();
  if (!list.includes(v)) { list.push(v); store.setCats(list); hydrateCatsDatalist(); }
}
function hydrateCatsDatalist(){
  const list = store.getCats();
  const dl = $('#listaCategorias'); dl.innerHTML = '';
  list.forEach(c=>{ const o = document.createElement('option'); o.value=c; dl.appendChild(o); });
}

/* ---------------- PDF builders ---------------- */
function buildManualPDF({categoria, estabelecimento, produtos, userName}){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 14;

  doc.setFontSize(16); doc.text("DESPESA MANUAL", 14, y); y += 8;
  doc.setFontSize(11);
  doc.text(`Usuário: ${userName||'-'}`, 14, y); y+=6;
  doc.text(`Categoria: ${categoria||'GERAL'}`, 14, y); y+=6;
  doc.text(`Estabelecimento: ${estabelecimento||'-'}`, 14, y); y+=8;

  doc.text("Itens:", 14, y); y+=6;
  let total = 0;
  (produtos||[]).forEach(p=>{
    const v = Number(p.valor)||0; total += v;
    doc.text(`- ${p.nome||'-'}  R$ ${v.toFixed(2)}`, 18, y);
    y+=6; if (y>280){ doc.addPage(); y=14; }
  });
  y+=4; doc.text(`TOTAL: R$ ${total.toFixed(2)}`, 14, y);

  return doc.output('blob');
}

function buildNotaPDF({ tipo, categoria, empresa, cnpj, data, itens, total, qrUrl, userName }){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y=14;

  doc.setFontSize(16); doc.text(`NOTA • ${tipo}`, 14, y); y+=8;
  doc.setFontSize(11);
  doc.text(`Usuário: ${userName||'-'}`, 14, y); y+=6;
  doc.text(`Categoria: ${categoria||'GERAL'}`, 14, y); y+=6;
  if (empresa) doc.text(`Empresa: ${empresa}`, 14, y), y+=6;
  if (cnpj)    doc.text(`CNPJ: ${cnpj}`, 14, y), y+=6;
  if (data)    doc.text(`Data: ${data}`, 14, y), y+=8;

  doc.text("Itens:", 14, y); y+=6;
  let tot = 0;
  (itens||[]).forEach(p=>{
    const sub = (Number(p.subtotal) || (Number(p.qtd)||0)*(Number(p.unit)||0));
    tot += sub;
    const line = p.nome ? p.nome : '—';
    doc.text(`- ${line}`, 18, y); y+=6;
    doc.text(`   ${p.qtd||''} x R$ ${(p.unit||0).toFixed?.(2) || p.unit}  =  R$ ${sub.toFixed(2)}`, 18, y);
    y+=6; if (y>280){ doc.addPage(); y=14; }
  });

  y+=4; const t = (Number(total)||tot);
  doc.text(`TOTAL: R$ ${t.toFixed(2)}`, 14, y); y+=8;

  if (qrUrl){
    doc.setTextColor(80);
    doc.text(`QR / URL: ${qrUrl}`, 14, y, { maxWidth: 180 });
    doc.setTextColor(0);
  }

  return doc.output('blob');
}

/* ---------------- Camera / QR ---------------- */
let scanner = null;
function setupScanner(){
  if (scanner) return scanner;
  scanner = new QRScanner({
    video: $('#qrVideo'),
    canvas: $('#qrCanvas'),
    onResult: (text)=>{
      $('#qrUrl').value = text;
      log('QR lido. URL preenchida.');
    },
    onError: (e)=> log('Erro na câmera: ' + (e?.message||e))
  });
  return scanner;
}

/* ---------------- Drive: upload helper ---------------- */
import { initDrive, uploadBlobToDrive, uploadArtifacts, saveManualDespesaToDrive } from './drive.js';
async function ensureDriveReady(){
  await initDrive(getGoogleAccessToken);
}

/* ---------------- App wiring ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  // voltar para home
  $('#btnVoltar')?.addEventListener('click', ()=> location.href = '/');
  $('#logoBtn')?.addEventListener('click', ()=> location.href = '/');

  hydrateCatsDatalist();

  // usuário logado (mostra nome)
  onAuthUser(async (user)=>{
    const who = $('#usuarioLogado');
    if (!user){ who.textContent = 'Usuário: —'; return; }
    const nome = user.displayName || (user.email ? user.email.split('@')[0] : user.uid);
    who.textContent = `Usuário: ${nome}`;
  });

  // adicionar linhas de produto
  document.body.addEventListener('click', (e)=>{
    if (e.target.classList.contains('btn-add-linha')){
      const box = $('#produtosBox');
      const row = document.createElement('div');
      row.className = 'produto-linha';
      row.innerHTML = `
        <input class="produto-nome" placeholder="Produto"/>
        <input class="produto-valor" type="number" step="0.01" placeholder="Valor (R$)"/>
        <button type="button" class="btn btn-add-linha" title="Adicionar">+</button>
      `;
      box.appendChild(row);
    }
  });

  /* ---- salvar despesa manual (PDF + Drive) ---- */
  $('#btnSalvarManual')?.addEventListener('click', async ()=>{
    try{
      log('Gerando PDF (despesa manual)…');
      const categoria = $('#categoriaManual').value.trim() || 'GERAL';
      const estabelecimento = $('#estabelecimento').value.trim();
      const produtos = $$('.produto-linha').map(l=>({
        nome: l.querySelector('.produto-nome').value.trim(),
        valor: parseFloat(l.querySelector('.produto-valor').value||'0') || 0
      }));

      const user = auth.currentUser;
      const userName = user?.displayName || (user?.email ? user.email.split('@')[0] : '');

      const pdfBlob = buildManualPDF({ categoria, estabelecimento, produtos, userName });

      await ensureDriveReady();
      const when = new Date();
      const yyyy = when.getFullYear(), mm = String(when.getMonth()+1).padStart(2,'0'), dd = String(when.getDate()).padStart(2,'0');
      const base = `MANUAL_${categoria.toUpperCase()}_${yyyy}-${mm}-${dd}`;
      const visualName = `${base}.pdf`;

      // Envia direto para /<mês>/Manuais/<CAT>/
      // reaproveitando a função existente (só visual)
      await uploadArtifacts({
        isoDate: when.toISOString(),
        visualBlob: pdfBlob,
        visualName,
        xmlBlob: null, xmlName: null,
        tipo: 'Manuais',
        categoria
      });

      ensureCatInStore(categoria);
      log('Despesa manual salva no Drive.');
      alert('Despesa manual salva no Drive!');
    }catch(e){
      console.error(e);
      alert('Erro ao salvar despesa manual.');
      log('Erro: ' + (e?.message||e));
    }
  });

  /* ---- NFC-e: câmera ---- */
  $('#btnStartCam')?.addEventListener('click', async ()=>{
    try{
      await setupScanner().start();
      log('Câmera ligada. Aponte para o QR.');
    }catch(e){ log('Erro na câmera: '+(e?.message||e)); }
  });
  $('#btnStopCam')?.addEventListener('click', ()=>{ try{ setupScanner().stop(); log('Câmera desligada.'); }catch{} });

  /* ---- NFC-e: processar URL (gera PDF mesmo se CORS barrar) ---- */
  $('#btnProcessarNfceUrl')?.addEventListener('click', async ()=>{
    try{
      const url = $('#qrUrl').value.trim();
      if (!url) { alert('Cole ou leia o QR primeiro.'); return; }
      const categoria = $('#categoriaNfce').value.trim() || 'GERAL';
      const parsed = parseNFCe(url);
      if (!parsed){ alert('URL de NFC-e inválida.'); return; }

      log('Gerando PDF da NFC-e…');
      const user = auth.currentUser;
      const userName = user?.displayName || (user?.email ? user.email.split('@')[0] : '');

      // sem fetch a sites externos — somente o rótulo
      const pdfBlob = buildNotaPDF({
        tipo: 'NFCe',
        categoria,
        empresa: null, cnpj: null, data: new Date().toISOString().slice(0,10),
        itens: [], total: 0, qrUrl: url, userName
      });

      await ensureDriveReady();
      const visualName = `NFCE_${parsed.accessKey}.pdf`;
      await uploadArtifacts({
        isoDate: new Date().toISOString(),
        visualBlob: pdfBlob,
        visualName,
        tipo: 'NFCe',
        categoria
      });

      ensureCatInStore(categoria);
      log('NFC-e salva no Drive (PDF com URL do QR).');
      alert('NFC-e salva no Drive!');
    }catch(e){
      console.error(e);
      alert('Erro ao processar NFC-e.');
      log('Erro: ' + (e?.message||e));
    }
  });

  /* ---- NFe-55: XML ---- */
  $('#btnProcessarNfe')?.addEventListener('click', async ()=>{
    try{
      const f = $('#xmlFile').files?.[0];
      if (!f){ alert('Escolha um arquivo XML.'); return; }
      const xml = await f.text();

      // tenta 55, se não der tenta NFC-e XML
      let nota = parseNFe55XML(xml);
      if (!nota || !nota.itens?.length) nota = parseNFCeXML(xml);

      if (!nota){ alert('XML inválido ou não reconhecido.'); return; }

      const categoria = 'GERAL';
      const user = auth.currentUser;
      const userName = user?.displayName || (user?.email ? user.email.split('@')[0] : '');

      log('Gerando PDF da NFe-55…');
      const pdfBlob = buildNotaPDF({
        tipo: nota.origem?.toUpperCase() || 'NFe55',
        categoria, empresa: nota.empresa, cnpj: nota.cnpj,
        data: nota.data, itens: nota.itens, total: nota.total,
        qrUrl: null, userName
      });

      await ensureDriveReady();
      const visualName = `NFE55_${nota.cnpj || 'SEM-CNPJ'}_${nota.data || ''}.pdf`;

      await uploadArtifacts({
        isoDate: new Date().toISOString(),
        visualBlob: pdfBlob,
        visualName,
        xmlBlob: new Blob([xml], { type: 'text/xml' }),
        xmlName: f.name,
        tipo: 'NFe55',
        categoria
      });

      log('NFe-55 salva no Drive (PDF + XML).');
      alert('NFe-55 salva no Drive!');
    }catch(e){
      console.error(e);
      alert('Erro ao processar XML.');
      log('Erro: ' + (e?.message||e));
    }
  });
});