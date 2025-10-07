// app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens, atualizarFreteAoEditarItem } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';
import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF, atualizarFreteUI } from './frete.js';
import { waitForLogin, db, app, getTenantId } from './firebase.js';

// PDF
import {
  salvarPDFLocal,
  compartilharPDFNativo,
  gerarPDFPreviewDePedidoFirestore
} from './pdf.js';

// Storage (cache/fila p/ reimpressão turbo)
import { queueStorageUpload, drainStorageQueueWhenOnline } from './storageQueue.js';

// SUGESTÕES (últimos itens e preços do cliente)
import {
  carregarSugestoesParaCliente,
  bindAutoCompleteNoInputProduto
} from './sugestoes.js';

console.log('[APP] Pedidos inicializado');

/* ===================== Helpers ===================== */
function formatarNome(input) {
  if (!input) return;
  const v = input.value.replace(/_/g, ' ').replace(/\s{2,}/g, ' ');
  input.value = up(v);
}
function digitsOnly(v){ return String(v||'').replace(/\D/g,''); }
function num(n){ const v = Number(n); return isFinite(v) ? v : 0; }

// blob -> dataURL (para cache de reimpressão)
async function blobToDataURL(blob){
  return await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
function cacheLastPdfDataUrl(docId, dataUrl, nomeArq){
  try {
    localStorage.setItem(`unikor:lastPdfDataUrl_${docId}`, dataUrl);
    localStorage.setItem(`unikor:lastPdfName_${docId}`, nomeArq || 'pedido.pdf');
  } catch {}
}

/* ===================== Pagamento ===================== */
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

/* ===================== Payload ===================== */
function montarPayloadPedido(){
  const itens = getItens().map(i=>{
    const q = num(i.quantidade);
    const pu = num(i.preco);
    const total = +(q*pu).toFixed(2);
    return {
      produto: (i.produto||'').trim(),
      tipo: (i.tipo||'KG').toUpperCase(),
      quantidade: q,
      precoUnit: pu,
      total,
      obs: (i.obs||'').trim()
    };
  }).filter(i=> i.produto || i.quantidade>0 || i.total>0);

  const subtotal = +(itens.reduce((s,i)=>s + num(i.total), 0).toFixed(2));
  const frete = getFreteAtual() || { valorBase:0, valorCobravel:0, isento:false };
  const isentoMan = !!document.getElementById('isentarFrete')?.checked;
  const freteCobrado = isentoMan ? 0 : num(frete.valorCobravel || frete.valorBase || 0);
  const tipoEnt = document.querySelector('input[name="tipoEntrega"]:checked')?.value || 'ENTREGA';

  return {
    cliente: up(document.getElementById('cliente')?.value || ''),
    clienteUpper: up(document.getElementById('cliente')?.value || ''),
    dataEntregaISO: document.getElementById('entrega')?.value || null,
    horaEntrega: document.getElementById('horaEntrega')?.value || '',
    entrega: {
      tipo: (tipoEnt||'ENTREGA').toUpperCase(),
      endereco: up(document.getElementById('endereco')?.value || '')
    },
    itens,
    subtotal,
    frete: {
      isento: !!(frete.isento || isentoMan),
      valorBase: num(frete.valorBase || 0),
      valorCobravel: freteCobrado
    },
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

/* ===================== Persistência ===================== */
async function persistirPedidoSeNecessario(){
  await waitForLogin();
  await ensureFreteBeforePDF();

  const payload = montarPayloadPedido();
  const idemKey = buildIdempotencyKey(payload);

  if (localStorage.getItem('unikor:lastIdemKey') === idemKey) return;

  try{
    const { id } = await savePedidoIdempotente(payload);
    console.info('[PEDIDOS] salvo em Firestore:', id);
    localStorage.setItem('unikor:lastIdemKey', idemKey);
    localStorage.setItem('unikor:lastPedidoId', id);

    // garante que a fila (Storage) rode quando houver rede
    drainStorageQueueWhenOnline();
  }catch(e){
    console.warn('[PEDIDOS] Falha ao salvar (seguindo com PDF):', e);
  }
}

/* ===================== Ações PDF ===================== */
async function salvarPDF() {
  const botao = document.getElementById('btnSalvarPdf');
  if (!botao) return;
  const t = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Salvando PDF...';
  showOverlay();
  try {
    // 1) salva pedido (gera/atualiza id)
    await persistirPedidoSeNecessario();

    // 2) salva local (download)
    const { nome } = await salvarPDFLocal();
    toastOk(`PDF salvo: ${nome}`);

    // 3) cache local + fila p/ Storage
    try {
      const { construirPDF } = await import('./pdf.js'); // <- geramos o blob de novo para cache/queue
      const { blob, nomeArq } = await construirPDF();

      // cache p/ reimpressão instantânea
      const docId = localStorage.getItem('unikor:lastPedidoId');
      const dataUrl = await blobToDataURL(blob);
      if (docId) cacheLastPdfDataUrl(docId, dataUrl, nomeArq);

      // fila: envia ao Firebase Storage e anota pdfPath no Firestore
      const tenantId = await getTenantId();
      if (tenantId && docId) {
        await queueStorageUpload({ tenantId, docId, blob, filename: nomeArq });
        drainStorageQueueWhenOnline();
      }
    } catch (err) {
      console.warn('[PDF] cache/queue falhou (segue ok):', err);
    }
  } catch (e) {
    console.error('[PDF] Erro ao salvar:', e);
    toastErro('Erro ao salvar PDF');
  } finally {
    hideOverlay();
    botao.disabled = false; botao.textContent = t;
  }
}

async function compartilharPDF() {
  const botao = document.getElementById('btnCompartilharPdf');
  if (!botao) return;
  const t = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Compartilhando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();

    // Gera o mesmo blob/nome (para já tentar subir ao Storage também)
    const { construirPDF } = await import('./pdf.js');
    const { blob, nomeArq } = await construirPDF();

    // Tenta upload imediato (ou enfileira)
    try{
      const tenantId = await getTenantId();
      const docId = localStorage.getItem('unikor:lastPedidoId');
      if (tenantId && docId){
        await queueStorageUpload({ tenantId, docId, blob, filename: nomeArq });
        drainStorageQueueWhenOnline();
      }
    }catch(e){
      console.warn('[PDF] queue/upload ao compartilhar falhou (segue):', e?.message||e);
    }

    const res = await compartilharPDFNativo();
    if (res.compartilhado)      toastOk('PDF compartilhado');
    else if (res.cancelado)     toastOk('Compartilhamento cancelado');
    else                        toastOk('Abrimos o PDF para envio');
  } catch (e) {
    console.error('[PDF] Erro ao compartilhar:', e);
    toastErro('Erro ao compartilhar PDF');
  } finally {
    hideOverlay();
    botao.disabled = false; botao.textContent = t;
  }
}

// ===== Reimpressão turbo: cache -> Storage -> fallback reconstrução =====
async function reimprimirUltimoPedidoSalvo() {
  const btn = document.getElementById('btnReimprimirUltimo');
  if (!btn) return;

  const id = localStorage.getItem('unikor:lastPedidoId');
  if (!id) { alert('Ainda não há pedido salvo nesta sessão.'); return; }

  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Reimprimindo...';
  showOverlay();
  try {
    // 1) cache local instantâneo
    const cached = localStorage.getItem(`unikor:lastPdfDataUrl_${id}`);
    if (cached) {
      window.open(cached, '_blank', 'noopener,noreferrer');
      toastOk('Reimpressão (cache local)');
      return;
    }

    // 2) baixar do Storage se já existe pdfPath
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js');
    const { getStorage, ref, getDownloadURL } =
      await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js');

    const tenantId = await getTenantId();
    const docRef = doc(db, "tenants", tenantId, "pedidos", id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const d = snap.data() || {};
      if (d.pdfPath) {
        const storage = getStorage(app);
        const url = await getDownloadURL(ref(storage, d.pdfPath));
        window.open(url, '_blank', 'noopener,noreferrer');
        toastOk('Reimpressão (arquivo do Storage)');
        return;
      }
    }

    // 3) fallback: reconstruir do Firestore
    await waitForLogin();
    await gerarPDFPreviewDePedidoFirestore(id);
    toastOk('Reimpressão (reconstruída)');
  } catch (e) {
    console.error('[Reimpressão] Erro:', e);
    toastErro('Erro ao reimprimir');
  } finally {
    hideOverlay();
    btn.disabled = false; btn.textContent = original;
  }
}

/* ====== Plano B: hidratar datalist de clientes mesmo sem abrir o modal ====== */
async function hydrateListaClientesFallback(){
  try{
    const { clientesMaisUsados } = await import('./clientes.js');
    const list = document.getElementById('listaClientes');
    if (!list) return;
    const nomes = await clientesMaisUsados(80);
    list.innerHTML = '';
    nomes.forEach(n=>{
      const o = document.createElement('option');
      o.value = n; list.appendChild(o);
    });
  }catch(e){
    console.warn('[APP] Falha ao hidratar datalist (fallback):', e?.message||e);
  }
}

/* ===================== Autosave/Restore dos ITENS (iOS-safe) ===================== */
const DRAFT_KEY = 'unikor:pedido:draftItens';

function salvarRascunhoItens(){
  try{
    const itens = getItens();
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(itens || []));
  }catch{}
}
function restaurarRascunhoItensSeVazio(){
  try{
    const atual = getItens();
    if (Array.isArray(atual) && atual.length) return; // já tem itens
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const lista = JSON.parse(raw);
    if (Array.isArray(lista) && lista.length){
      // adiciona respeitando a API existente
      lista.forEach(obj => {
        try { adicionarItem(obj); } catch { adicionarItem(); }
      });
      setTimeout(() => atualizarFreteUI(), 30);
    }
  }catch{}
}

/* ===================== Init ===================== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[APP] DOM carregado');

  initItens();
  atualizarFreteAoEditarItem(atualizarFreteUI);
  setTimeout(() => atualizarFreteUI(), 50);

  // Observa mudanças nos itens para autosave
  const itensContainer = document.getElementById('itens');
  if (itensContainer){
    itensContainer.addEventListener('input', salvarRascunhoItens, { passive:true });
    itensContainer.addEventListener('change', salvarRascunhoItens, { passive:true });
  }
  // Tenta restaurar caso a lista esteja vazia (iOS retomando aba)
  restaurarRascunhoItensSeVazio();

  const btnAdicionar = document.getElementById('adicionarItemBtn');
  if (btnAdicionar) btnAdicionar.addEventListener('click', e => { adicionarItem(); salvarRascunhoItens(); });

  document.getElementById('btnSalvarPdf')?.addEventListener('click', salvarPDF);
  document.getElementById('btnCompartilharPdf')?.addEventListener('click', compartilharPDF);
  document.getElementById('btnReimprimirUltimo')?.addEventListener('click', reimprimirUltimoPedidoSalvo);

  // Sanitiza cliente (mantém espaços)
  let inputCliente = document.getElementById('cliente');
  if (inputCliente) {
    const val = inputCliente.value;
    const clone = inputCliente.cloneNode(true);
    inputCliente.replaceWith(clone);
    inputCliente = clone;
    inputCliente.value = val;
    inputCliente.addEventListener('input', () => formatarNome(inputCliente));
  }

  // Hidrata datalist mesmo sem abrir o modal
  hydrateListaClientesFallback();

  // Sugestões por cliente (itens + último preço)
  const clienteInput = document.getElementById('cliente');
  async function carregarSugestoesDoClienteAtual(){
    const nomeUpper = String(clienteInput?.value || '').trim().toUpperCase();
    if (!nomeUpper) return;
    await carregarSugestoesParaCliente(nomeUpper);
    // liga o datalist nos inputs de produto já existentes
    document.querySelectorAll('#itens .item .produto').forEach(bindAutoCompleteNoInputProduto);
  }
  if (clienteInput){
    clienteInput.addEventListener('change', carregarSugestoesDoClienteAtual);
    clienteInput.addEventListener('blur', carregarSugestoesDoClienteAtual);
    carregarSugestoesDoClienteAtual(); // tentativa inicial
  }

  // Auto-bind para inputs de produto criados dinamicamente
  if (itensContainer){
    itensContainer.addEventListener('focusin', (ev) => {
      if (ev.target && ev.target.classList && ev.target.classList.contains('produto')){
        bindAutoCompleteNoInputProduto(ev.target);
      }
    });
  }

  // inicia o drenador da fila (idempotente)
  drainStorageQueueWhenOnline();
});

// Exposição opcional
window.reimprimirUltimoPedidoSalvo = reimprimirUltimoPedidoSalvo;