// app/despesas/js/app.js
import { onAuthUser, getUserShortName, waitForLogin, getGoogleAccessToken, salvarDespesaFirestore } from './firebase.js';
import { initDrive, uploadArtifacts, saveManualDespesaToDrive } from './drive.js';
import { QRScanner } from './scanner.js';
import { parseNFCe, fileToBase64 } from './nfce.js';
import { parseNFe55XML, parseNFCeXML } from './nfe.js';

// ========= SW: forçar pegar versão nova sempre =========
(function swAutoRefresh(){
  if ('serviceWorker' in navigator){
    window.addEventListener('load', async ()=>{
      try {
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
        const ping = ()=> reg.update();
        document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible') ping(); });
        setInterval(ping, 5*60*1000);
        reg.addEventListener('updatefound', ()=>{
          const nw = reg.installing;
          nw && nw.addEventListener('statechange', ()=>{
            if (nw.state === 'installed' && navigator.serviceWorker.controller){
              reg.waiting && reg.waiting.postMessage({type:'SKIP_WAITING'});
            }
          });
        });
        navigator.serviceWorker.addEventListener('controllerchange', ()=>{
          if (!window.__reloadedBySW){ window.__reloadedBySW = true; location.reload(); }
        });
      } catch {}
    });
  }
})();

// ========= UI helpers =========
const $ = (sel, root=document)=> root.querySelector(sel);
const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));
const statusBox = ()=> $('#statusBox');
function logStatus(text){ if (statusBox()) statusBox().textContent = String(text); }

// ========= Header (voltar) + usuário =========
document.addEventListener('DOMContentLoaded', ()=>{
  // Botões de voltar
  $('#btnVoltar')?.addEventListener('click', ()=> location.href = '/');
  $('.topbar .logo')?.addEventListener('click', ()=> location.href = '/');

  // Usuário logado (só o nome)
  onAuthUser(u=>{
    const el = $('#usuarioLogado');
    if (!el) return;
    el.textContent = u ? `Usuário: ${getUserShortName()}` : 'Usuário: —';
  });
});

// ========= Categorias (persistência local) =========
const LS_KEY_CATS = 'unikor_despesas:cats';
function getCats(){
  try{ const v = JSON.parse(localStorage.getItem(LS_KEY_CATS)||'null'); 
       return v && Array.isArray(v) ? v : ["Alimentação","Manutenção","Combustível","Limpeza","Embalagens"]; 
  }catch{ return ["Alimentação","Manutenção","Combustível","Limpeza","Embalagens"]; }
}
function setCats(list){
  try{ localStorage.setItem(LS_KEY_CATS, JSON.stringify(Array.from(new Set(list.filter(Boolean))))); }catch{}
}
function hydrateCats(){
  const dl = $('#listaCategorias'); if (!dl) return;
  dl.innerHTML = '';
  getCats().forEach(c=>{
    const o = document.createElement('option'); o.value = c; dl.appendChild(o);
  });
}
document.addEventListener('DOMContentLoaded', hydrateCats);

// ========= jsPDF (dinâmico) =========
let jsPDF = null;
async function ensureJsPDF(){
  if (jsPDF) return jsPDF;
  const mod = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  jsPDF = mod.jspdf || mod.jsPDF || mod.default || mod;
  return jsPDF;
}

// ========= GDrive init =========
async function ensureDrive(){
  await initDrive(getGoogleAccessToken);
}

// ========= PDF helpers =========
async function buildManualPDF({categoria, estabelecimento, produtos, total, usuario}){
  await ensureJsPDF();
  const doc = new jsPDF();

  let y = 14;
  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('DESPESA MANUAL', 14, y); y+=8;

  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  doc.text(`Categoria: ${categoria||'-'}`, 14, y); y+=6;
  doc.text(`Estabelecimento: ${estabelecimento||'-'}`, 14, y); y+=6;
  doc.text(`Usuário: ${usuario||'-'}`, 14, y); y+=8;

  doc.setFont('helvetica','bold');
  doc.text('Itens:', 14, y); y+=6;

  doc.setFont('helvetica','normal');
  (produtos||[]).forEach(p=>{
    const line = `• ${(p.nome||'-')}  —  R$ ${(Number(p.valor)||0).toFixed(2)}`;
    if (y > 280) { doc.addPage(); y = 14; }
    doc.text(line, 16, y);
    y+=6;
  });
  y+=4; doc.setFont('helvetica','bold');
  doc.text(`TOTAL: R$ ${(Number(total)||0).toFixed(2)}`, 14, y);

  return doc.output('blob');
}

async function buildNFePDF({titulo, headerLines=[], itens=[], total}){
  await ensureJsPDF();
  const doc = new jsPDF();
  let y = 14;

  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text(titulo, 14, y); y+=8;

  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  headerLines.forEach(h=>{ doc.text(h,14,y); y+=6; });

  y+=4; doc.setFont('helvetica','bold');
  doc.text('Itens:', 14, y); y+=6;

  doc.setFont('helvetica','normal');
  itens.forEach(it=>{
    const line = `• ${it.nome} — Qtd ${it.qtd||1} x R$ ${(Number(it.unit)||0).toFixed(2)} = R$ ${(Number(it.subtotal)||0).toFixed(2)}`;
    if (y > 280) { doc.addPage(); y = 14; }
    doc.text(line, 16, y); y+=6;
  });

  y+=4; doc.setFont('helvetica','bold');
  doc.text(`TOTAL: R$ ${(Number(total)||0).toFixed(2)}`, 14, y);

  return doc.output('blob');
}

// ========= UI: Despesa Manual =========
function recalcManualTotal(){
  const total = $$('.produto-linha').reduce((s,ln)=>{
    const v = parseFloat(ln.querySelector('.produto-valor')?.value || '0')||0;
    return s+v;
  },0);
  const el = $('#manualTotal');
  if (el) el.textContent = `Total: R$ ${total.toFixed(2)}`;
  return total;
}

document.addEventListener('input', (e)=>{
  if (e.target && e.target.classList.contains('produto-valor')) recalcManualTotal();
});

document.addEventListener('click', (e)=>{
  if (e.target && e.target.classList.contains('btn-add-linha')){
    const linha = e.target.closest('.produto-linha');
    const clone = linha.cloneNode(true);
    clone.querySelectorAll('input').forEach(i=> i.value = '');
    linha.parentNode.appendChild(clone);
  }
});

$('#btnSalvarManual')?.addEventListener('click', async ()=>{
  try{
    logStatus('Gerando PDF…');

    const categoria = $('#categoriaManual')?.value || 'GERAL';
    const estabelecimento = $('#estabelecimento')?.value || '';
    // persiste categoria digitada
    setCats([...(getCats()), categoria]);

    const produtos = $$('.produto-linha').map(l=>({
      nome: l.querySelector('.produto-nome')?.value || '',
      valor: parseFloat(l.querySelector('.produto-valor')?.value || '0')||0
    }));
    const total = produtos.reduce((s,p)=> s+(Number(p.valor)||0), 0);

    await waitForLogin();
    await ensureDrive();

    // PDF
    const usuario = getUserShortName();
    const pdfBlob = await buildManualPDF({ categoria, estabelecimento, produtos, total, usuario });
    const whenIso = new Date().toISOString();
    const pdfName = `MANUAL_${categoria.toUpperCase()}_${whenIso.slice(0,10)}.pdf`;

    // Drive
    await uploadArtifacts({
      isoDate: whenIso,
      visualBlob: pdfBlob,
      visualName: pdfName,
      tipo: 'Manuais',
      categoria
    });

    // Firestore
    await salvarDespesaFirestore({
      tipo: 'manual',
      categoria,
      estabelecimento,
      produtos,
      total,
      data: whenIso.slice(0,10),
      origem: { kind:'manual' }
    });

    logStatus('Despesa manual salva no Drive e no Firestore ✅');
    alert('Despesa manual salva com sucesso!');
  }catch(e){
    console.error(e);
    alert('Erro ao salvar despesa manual.');
    logStatus('Erro: '+ e.message);
  }
});

// ========= UI: NFC-e (URL ou QR) =========
let scanner = null;

$('#btnAbrirCamera')?.addEventListener('click', async ()=>{
  const video = $('#qrVideo');
  if (!video) return;
  logStatus('Abrindo câmera…');
  try{
    scanner = new QRScanner({
      video,
      onResult: (text)=> {
        $('#qrUrl').value = text;
        scanner?.stop();
        $('#qrVideo').style.display = 'none';
        logStatus('QR lido. Pronto para processar.');
      },
      onError: (e)=> { console.warn(e); logStatus(e.message||'Falha na câmera'); }
    });
    $('#qrVideo').style.display = 'block';
    await scanner.start();
  }catch(e){
    console.error(e);
    alert(e.message || 'Não foi possível abrir a câmera.');
  }
});

$('#btnProcessarNfce')?.addEventListener('click', async ()=>{
  const url = $('#qrUrl')?.value?.trim();
  if (!url){ alert('Cole a URL do QR da NFC-e ou leia o QR.'); return; }

  const parsed = parseNFCe(url);
  if (!parsed){ alert('URL de NFC-e inválida.'); return; }

  try{
    logStatus('Gerando PDF da NFC-e…');
    await waitForLogin();
    await ensureDrive();

    // Monta um PDF simples com a “chave” (se quiseres, depois puxamos XML de portais SEFAZ)
    const header = [
      `Acesso: ${parsed.accessKey}`,
      `Modelo: 65`
    ];
    const pdfBlob = await buildNFePDF({
      titulo: 'NFC-e (QR)',
      headerLines: header,
      itens: [],
      total: 0
    });

    const whenIso = new Date().toISOString();
    const categoria = ($('#categoriaNfce')?.value || 'GERAL');
    const pdfName = `NFCE_${parsed.accessKey.slice(0,8)}_${whenIso.slice(0,10)}.pdf`;

    await uploadArtifacts({
      isoDate: whenIso,
      visualBlob: pdfBlob,
      visualName: pdfName,
      tipo: 'NFCe',
      categoria
    });

    await salvarDespesaFirestore({
      tipo: 'nfce',
      categoria,
      estabelecimento: '',
      produtos: [],
      total: 0,
      data: whenIso.slice(0,10),
      origem: { kind:'nfce', accessKey: parsed.accessKey, url }
    });

    logStatus('NFC-e salva no Drive e no Firestore ✅');
    alert('NFC-e salva com sucesso!');
  }catch(e){
    console.error(e);
    alert('Erro ao processar NFC-e.');
    logStatus('Erro: '+ e.message);
  }
});

// ========= UI: NFe 55 (XML) =========
$('#btnProcessarNfe')?.addEventListener('click', async ()=>{
  const inp = $('#xmlFile');
  if (!inp?.files?.length){ alert('Selecione um arquivo XML.'); return; }
  const file = inp.files[0];

  try{
    const xmlStr = atob(await fileToBase64(file));
    // tenta 55, senão cai para NFCe-XML
    const info = parseNFe55XML(xmlStr) || parseNFCeXML(xmlStr);

    const header = [
      `Empresa: ${info.empresa||'-'}`,
      `CNPJ: ${info.cnpj||'-'}`,
      `Data: ${info.data||'-'}`
    ];
    const pdfBlob = await buildNFePDF({
      titulo: info.origem==='nfe55' ? 'NF-e (55)' : 'NFC-e (XML)',
      headerLines: header,
      itens: info.itens||[],
      total: info.total||0
    });

    await waitForLogin(); 
    await ensureDrive();

    const catInput = $('#categoriaNfe55') || $('#categoriaNfce'); // se existir campo próprio, usa
    const categoria = catInput ? (catInput.value||'GERAL') : 'GERAL';
    const whenIso = new Date().toISOString();

    const pdfName = `${info.origem==='nfe55'?'NFE55':'NFCE_XML'}_${(info.cnpj||'').slice(-6)}_${whenIso.slice(0,10)}.pdf`;

    await uploadArtifacts({
      isoDate: whenIso,
      visualBlob: pdfBlob,
      visualName: pdfName,
      xmlBlob: new Blob([xmlStr], { type:'text/xml' }),
      xmlName: file.name,
      tipo: info.origem==='nfe55'?'NFe55':'NFCe',
      categoria
    });

    await salvarDespesaFirestore({
      tipo: info.origem==='nfe55'?'nfe55':'nfce',
      categoria,
      estabelecimento: info.empresa || '',
      produtos: (info.itens||[]).map(i=>({ nome:i.nome, qtd:i.qtd, unit:i.unit, subtotal:i.subtotal })),
      total: info.total||0,
      data: info.data || whenIso.slice(0,10),
      origem: { kind: info.origem }
    });

    logStatus('XML processado e salvo no Drive/Firestore ✅');
    alert('XML processado com sucesso!');
  }catch(e){
    console.error(e);
    alert('Erro ao processar XML.');
    logStatus('Erro: '+ e.message);
  }
});