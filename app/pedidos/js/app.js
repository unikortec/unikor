// /app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';

// salvar idempotente + frete
import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF } from './frete.js';

// integrações Firebase (usa o mesmo app/auth/db/storage da raiz)
import {
  waitForLogin, app, db, storage, getTenantId,
  doc, setDoc, serverTimestamp
} from './firebase.js';

// Storage SDK (+ getStorage para forçar bucket)
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

console.log('[APP] Pedidos inicializado');

/* ===================== Helpers ===================== */
function digitsOnly(v){ return String(v||'').replace(/\D/g,''); }
function num(n){ const v = Number(n); return isFinite(v) ? v : 0; }
function formatarNome(input){ if(!input)return; input.value = up(input.value.replace(/_/g,' ').replace(/\s{2,}/g,' ')); }

function isIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent); }
function openWhatsAppWithText(text){
  const waUrl = isIOS()
    ? `whatsapp://send?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.location.href = waUrl;
}

function coletarDadosFormulario() {
  return {
    cliente: document.getElementById('cliente')?.value || '',
    telefone: document.getElementById('contato')?.value || '',
    endereco: document.getElementById('endereco')?.value || '',
    observacoes: document.getElementById('obsGeral')?.value || '',
    itens: getItens()
  };
}

function validarAntesGerar() {
  const dados = coletarDadosFormulario();
  if (!dados.cliente.trim()) { alert('Informe o nome do cliente'); return false; }
  const itens = getItens();
  if (itens.length === 0 || !itens.some(i => (i.produto||'').trim())) {
    alert('Adicione pelo menos um item'); return false;
  }
  return true;
}

/* ===================== Pagamento + Payload ===================== */
function lerPagamento(){
  const sel = document.getElementById('pagamento');
  const outro = document.getElementById('pagamentoOutro');
  let p = (sel?.value || '').trim();
  if (p.toUpperCase() === 'OUTRO') {
    const liv = (outro?.value || '').trim();
    if (liv) p = liv;
  }
  return p;
}

function montarPayloadPedido(){
  const itens = getItens().map(i=>{
    const q = num(i.quantidade);
    const pu = num(i.preco);
    const total = +(q*pu).toFixed(2);
    return {
      produto:(i.produto||'').trim(),
      tipo:(i.tipo||'KG').toUpperCase(),
      quantidade:q,
      precoUnit:pu,
      total,
      obs:(i.obs||'').trim()
    };
  }).filter(i=> i.produto || i.quantidade>0 || i.total>0);

  const subtotal = +(itens.reduce((s,i)=>s+num(i.total),0).toFixed(2));
  const frete = getFreteAtual() || { valorBase:0, valorCobravel:0, isento:false };
  const isentoMan = !!document.getElementById('isentarFrete')?.checked;
  const freteCobrado = isentoMan ? 0 : num(frete.valorCobravel || frete.valorBase || 0);
  const tipoEnt = document.querySelector('input[name="tipoEntrega"]:checked')?.value || 'ENTREGA';
  const clienteId = document.getElementById('clienteId')?.value || null;

  return {
    cliente: up(document.getElementById('cliente')?.value || ''),
    clienteUpper: up(document.getElementById('cliente')?.value || ''),
    clienteId,
    dataEntregaISO: document.getElementById('entrega')?.value || null,
    horaEntrega: document.getElementById('horaEntrega')?.value || '',
    entrega: { tipo: (tipoEnt||'ENTREGA').toUpperCase(), endereco: up(document.getElementById('endereco')?.value || '') },
    itens,
    subtotal,
    frete: { isento: !!(frete.isento || isentoMan), valorBase: num(frete.valorBase || 0), valorCobrado: freteCobrado },
    totalPedido: +(subtotal + freteCobrado).toFixed(2),
    pagamento: lerPagamento(),
    obs:(document.getElementById('obsGeral')?.value || '').trim(),
    clienteFiscal: {
      cnpj: digitsOnly(document.getElementById('cnpj')?.value || ''),
      ie: (document.getElementById('ie')?.value || '').trim(),
      cep: digitsOnly(document.getElementById('cep')?.value || ''),
      contato: digitsOnly(document.getElementById('contato')?.value || '')
    }
  };
}

/* ===================== Persistência idempotente ===================== */
async function persistirPedidoSeNecessario(){
  await waitForLogin(); await ensureFreteBeforePDF();
  const payload = montarPayloadPedido();
  const idemKey = buildIdempotencyKey(payload);
  if (localStorage.getItem('unikor:lastIdemKey') === idemKey) return;
  try{
    const { id } = await savePedidoIdempotente(payload);
    localStorage.setItem('unikor:lastIdemKey', idemKey);
    if (id) localStorage.setItem('unikor:lastPedidoId', id);
    console.info('[PEDIDOS] salvo:', id);
  }catch(e){ console.warn('[PEDIDOS] Falha ao salvar:', e); }
}
async function persistirComTimeout(ms=4000){
  try{ await Promise.race([ persistirPedidoSeNecessario(), new Promise(r=>setTimeout(r,ms)) ]); }catch(_){}
}

/* ===================== Upload PDF p/ Storage ===================== */
async function uploadPdfParaStorage(blob, filename){
  try{
    const tenantId = await getTenantId();
    const docId = localStorage.getItem('unikor:lastPedidoId');
    if (!tenantId || !docId) return null;

    const lastUp = localStorage.getItem('unikor:lastUploadedId');
    const storageForced = getStorage(app, "gs://unikorapp.firebasestorage.app");
    const path = `tenants/${tenantId}/pedidos/${docId}.pdf`;
    const storageRef = ref(storageForced, path);

    if (lastUp !== docId) {
      await uploadBytes(storageRef, blob, { contentType: 'application/pdf' });
      localStorage.setItem('unikor:lastUploadedId', docId);
      console.info('[Storage] PDF enviado:', path);
    } else {
      console.info('[Storage] já subido este id, só pegando URL:', docId);
    }

    const url = await getDownloadURL(storageRef).catch(()=>null);

    await setDoc(
      doc(db, "tenants", tenantId, "pedidos", docId),
      { pdfPath: path, ...(url ? { pdfUrl: url } : {}), pdfCreatedAt: serverTimestamp() },
      { merge: true }
    );

    return { path, url, id: docId };
  }catch(e){
    console.warn('[Storage] Falha no upload/getURL:', e?.message || e);
    return null;
  }
}

/* ===================== Ações ===================== */
async function gerarPDF(){
  const botao=document.getElementById('btnGerarPdf');
  if(!botao)return;
  const { gerarPDFPreview } = await import('./pdf.js');
  if(!validarAntesGerar())return;
  botao.disabled=true;const txt=botao.textContent;botao.textContent='⏳ Gerando...';showOverlay();
  try{await persistirComTimeout(4000);await gerarPDFPreview();toastOk('PDF gerado (preview)');}
  catch(e){toastErro('Erro ao gerar PDF');console.error(e);}
  finally{hideOverlay();botao.disabled=false;botao.textContent=txt;}
}

async function salvarPDF(){
  const botao=document.getElementById('btnSalvarPdf');if(!botao)return;
  const { salvarPDFLocal, construirPDF } = await import('./pdf.js');
  if(!validarAntesGerar())return;
  botao.disabled=true;const txt=botao.textContent;botao.textContent='⏳ Salvando...';showOverlay();
  try{
    await persistirComTimeout(4000);
    const { nome }=await salvarPDFLocal();toastOk(`PDF salvo: ${nome}`);
    const { blob, nomeArq }=await construirPDF();await uploadPdfParaStorage(blob,nomeArq);
  }catch(e){toastErro('Erro ao salvar PDF');console.error(e);}
  finally{hideOverlay();botao.disabled=false;botao.textContent=txt;}
}

async function compartilharPDF(){
  const botao=document.getElementById('btnCompartilharPdf');if(!botao)return;
  const { construirPDF, compartilharComBlob } = await import('./pdf.js');
  if(!validarAntesGerar())return;
  botao.disabled=true;const txt=botao.textContent;botao.textContent='⏳ Compartilhando...';showOverlay();

  try{
    // 1) Gera o PDF no gesto do clique
    const { blob, nomeArq } = await construirPDF();

    // 2) Tenta compartilhar como ARQUIVO (WhatsApp recebe anexo com o nome certo)
    const res = await compartilharComBlob(blob, nomeArq);
    if (res?.compartilhado) {
      (async()=>{ try{ await persistirComTimeout(4000); await uploadPdfParaStorage(blob, nomeArq); }catch{} })();
      toastOk('PDF compartilhado');
      return;
    }
    if (res?.cancelado) { toastOk('Compartilhamento cancelado'); return; }

    // 3) Sem Level 2: persiste + sobe e manda link via WhatsApp (fallback)
    await persistirComTimeout(4000);
    const up = await uploadPdfParaStorage(blob, nomeArq);
    if (up?.url) {
      const msg = `Pedido ${nomeArq}\n${up.url}`;
      openWhatsAppWithText(msg);
      toastOk('Abrindo WhatsApp…');
      return;
    }

    // 4) Último recurso: abrir o PDF
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(()=>URL.revokeObjectURL(url),15000);
    toastOk('Abrimos o PDF (fallback)');

  }catch(e){ toastErro('Erro ao compartilhar'); console.error(e); }
  finally{ hideOverlay(); botao.disabled=false; botao.textContent=txt; }
}

/* ===================== Reimpressão ===================== */
async function reimprimirUltimoPedidoSalvo(){
  const id=localStorage.getItem('unikor:lastPedidoId');
  if(!id){alert('Nenhum pedido salvo nesta sessão.');return;}
  const btn=document.getElementById('btnReimprimirUltimo');const txt=btn.textContent;
  btn.disabled=true;btn.textContent='⏳ Reimprimindo...';showOverlay();
  try{
    const { gerarPDFPreviewDePedidoFirestore }=await import('./pdf.js');
    await gerarPDFPreviewDePedidoFirestore(id);toastOk('Reimpressão gerada');
  }catch(e){toastErro('Erro ao reimprimir');console.error(e);}
  finally{hideOverlay();btn.disabled=false;btn.textContent=txt;}
}

/* ===================== Init ===================== */
document.addEventListener('DOMContentLoaded',()=>{
  initItens();
  setTimeout(()=>{const c=document.getElementById('itens');if(c&&!c.children.length)adicionarItem();},100);
  document.getElementById('adicionarItemBtn')?.addEventListener('click',adicionarItem);
  document.getElementById('btnGerarPdf')?.addEventListener('click',gerarPDF);
  document.getElementById('btnSalvarPdf')?.addEventListener('click',salvarPDF);
  document.getElementById('btnCompartilharPdf')?.addEventListener('click',compartilharPDF);
  document.getElementById('btnReimprimirUltimo')?.addEventListener('click',reimprimirUltimoPedidoSalvo);

  const inputCliente=document.getElementById('cliente');
  if(inputCliente){
    inputCliente.addEventListener('change',()=>formatarNome(inputCliente));
    inputCliente.addEventListener('blur',()=>formatarNome(inputCliente));
  }
});

window.gerarPDF=gerarPDF;
window.salvarPDF=salvarPDF;
window.compartilharPDF=compartilharPDF;
window.reimprimirUltimoPedidoSalvo=reimprimirUltimoPedidoSalvo;

console.log('[APP] Configurado (desktop + mobile ok)');