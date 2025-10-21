// /app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';
import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF } from './frete.js';
import {
  waitForLogin, app, db, storage, getTenantId,
  doc, setDoc, serverTimestamp
} from './firebase.js';
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

console.log('[APP] Pedidos inicializado');

function formatarNome(input){ if (!input) return; const v = input.value.replace(/_/g,' ').replace(/\s{2,}/g,' '); input.value = up(v); }
function digitsOnly(v){ return String(v||'').replace(/\D/g,''); }
function num(n){ const v = Number(n); return isFinite(v) ? v : 0; }

function coletarDadosFormulario(){ return {
  cliente: document.getElementById('cliente')?.value || '',
  telefone: document.getElementById('contato')?.value || '',
  endereco: document.getElementById('endereco')?.value || '',
  observacoes: document.getElementById('obsGeral')?.value || '',
  itens: getItens()
};}

function validarAntesGerar(){
  const dados = coletarDadosFormulario();
  if (!dados.cliente.trim()) { alert('Informe o nome do cliente'); return false; }
  const itens = getItens();
  if (itens.length === 0 || !itens.some(item => (item.produto||'').trim())) {
    alert('Adicione pelo menos um item'); return false;
  }
  return true;
}

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
    return { produto: (i.produto||'').trim(), tipo: (i.tipo||'KG').toUpperCase(), quantidade: q, precoUnit: pu, total, obs: (i.obs||'').trim() };
  }).filter(i=> i.produto || i.quantidade>0 || i.total>0);

  const subtotal = +(itens.reduce((s,i)=>s + num(i.total), 0).toFixed(2));
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
    obs: (document.getElementById('obsGeral')?.value || '').trim(),
    clienteFiscal: {
      cnpj: digitsOnly(document.getElementById('cnpj')?.value || ''),
      ie: (document.getElementById('ie')?.value || '').trim(),
      cep: digitsOnly(document.getElementById('cep')?.value || ''),
      contato: digitsOnly(document.getElementById('contato')?.value || '')
    }
  };
}

async function persistirPedidoSeNecessario(){
  await waitForLogin();
  await ensureFreteBeforePDF();
  const payload = montarPayloadPedido();
  const idemKey = buildIdempotencyKey(payload);
  if (localStorage.getItem('unikor:lastIdemKey') === idemKey) return;
  try{
    const { id } = await savePedidoIdempotente(payload);
    console.info('[PEDIDOS] salvo:', id);
    localStorage.setItem('unikor:lastIdemKey', idemKey);
    if (id) localStorage.setItem('unikor:lastPedidoId', id);
  }catch(e){
    console.warn('[PEDIDOS] Falha ao salvar (seguindo com PDF):', e);
  }
}

async function persistirComTimeout(ms=4000){
  try{ await Promise.race([persistirPedidoSeNecessario(), new Promise(r=>setTimeout(r, ms))]); }catch(_){}
}

/* ======= Upload PDF ======= */
async function uploadPdfParaStorage(blob, filename){
  try{
    const tenantId = await getTenantId();
    const docId = localStorage.getItem('unikor:lastPedidoId');
    if (!tenantId || !docId) return;

    const lastUp = localStorage.getItem('unikor:lastUploadedId');
    if (lastUp === docId) return;

    const path = `tenants/${tenantId}/pedidos/${docId}.pdf`;
    await uploadBytes(ref(storage, path), blob, { contentType: 'application/pdf' });

    await setDoc(
      doc(db, "tenants", tenantId, "pedidos", docId),
      { pdfPath: path, pdfCreatedAt: serverTimestamp() },
      { merge: true }
    );

    localStorage.setItem('unikor:lastUploadedId', docId);
    console.info('[Storage] PDF enviado:', path);
  }catch(e){
    console.warn('[Storage] Falha no upload:', e?.message || e);
  }
}

/* ======= Botões ======= */
async function gerarPDF(){
  const botao = document.getElementById('btnGerarPdf');
  if (!botao) return;
  const { gerarPDFPreview } = await import('./pdf.js');
  if (!validarAntesGerar()) return;
  const t = botao.textContent; botao.disabled = true; botao.textContent = '⏳ Gerando PDF...';
  showOverlay();
  try { await persistirComTimeout(4000); await gerarPDFPreview(); toastOk('PDF gerado (preview)'); }
  catch(e){ console.error('[PDF] Erro ao gerar:', e); toastErro('Erro ao gerar PDF'); alert('Erro ao gerar PDF: ' + e.message); }
  finally { hideOverlay(); botao.disabled = false; botao.textContent = t; }
}

async function salvarPDF(){
  const botao = document.getElementById('btnSalvarPdf'); if (!botao) return;
  const { salvarPDFLocal, construirPDF } = await import('./pdf.js');
  if (!validarAntesGerar()) return;
  const t = botao.textContent; botao.disabled = true; botao.textContent = '⏳ Salvando PDF...';
  showOverlay();
  try {
    await persistirComTimeout(4000);
    const { nome } = await salvarPDFLocal();
    toastOk(`PDF salvo: ${nome}`);
    const { blob, nomeArq } = await construirPDF();
    await uploadPdfParaStorage(blob, nomeArq);
  } catch(e){ console.error('[PDF] Erro ao salvar:', e); toastErro('Erro ao salvar PDF'); alert('Erro ao salvar PDF: ' + e.message); }