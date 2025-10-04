// app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens, atualizarFreteAoEditarItem } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';
import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF, atualizarFreteUI } from './frete.js';
import { waitForLogin } from './firebase.js';

// funções de PDF que já existiam
import {
  salvarPDFLocal,
  compartilharPDFNativo,
  gerarPDFPreviewDePedidoFirestore
} from './pdf.js';

// ===== NOVO: para cache local e fila de upload p/ Storage =====
import { getTenantId, db, app } from './firebase.js';
import { queueStorageUpload, drainStorageQueueWhenOnline } from './storageQueue.js';

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

    // 3) *** cache local + fila p/ Storage ***
    try {
      // 🔸 ESTE TRECHO "VEM DO PDF": usamos construirPDF() para obter o Blob/Nome
      const { construirPDF } = await import('./pdf.js');
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
    const res = await compartilharPDFNativo();
    if (res.compartilhado)      toastOk('PDF compartilhado');
    else if (res.cancelado)     toastOk('Compartilhamento cancelado');
    else                        toastOk('Abrimos o PDF para envio');

    // (opcional) também pode cachear igual ao salvarPDF()
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

/* ===================== Init ===================== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[APP] DOM carregado');

  initItens();
  atualizarFreteAoEditarItem(atualizarFreteUI);
  setTimeout(() => atualizarFreteUI(), 50);

  const btnAdicionar = document.getElementById('adicionarItemBtn');
  if (btnAdicionar) btnAdicionar.addEventListener('click', adicionarItem);

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

  // inicia o drenador da fila (idempotente)
  drainStorageQueueWhenOnline();
});

// Exposição opcional
window.reimprimirUltimoPedidoSalvo = reimprimirUltimoPedidoSalvo;