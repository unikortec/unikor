// app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';

// >>> salvar idempotente + frete
import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF } from './frete.js';

// >>> precisamos do app/db/getTenantId + helpers do Firestore p/ registrar o PDF
import {
  waitForLogin, app, db, getTenantId,
  doc, setDoc, serverTimestamp
} from './firebase.js';

// >>> Storage SDK (upload do PDF para o bucket)
import {
  getStorage, ref, uploadBytes
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

console.log('[APP] Pedidos inicializado');

/* ===================== Qualidade de digitação ===================== */
function formatarNome(input) {
  if (!input) return;
  const v = input.value.replace(/_/g, ' ').replace(/\s{2,}/g, ' ');
  input.value = up(v);
}
function habilitarEspacoNoCliente() {
  const el = document.getElementById('cliente');
  if (!el) return;
  ['keydown','keypress','keyup','beforeinput'].forEach(type=>{
    el.addEventListener(type, (ev)=>{
      if ((ev.key === ' ') || (ev.data === ' ')) ev.stopImmediatePropagation();
    }, true);
  });
}

/* ===================== Helpers ===================== */
function digitsOnly(v){ return String(v||'').replace(/\D/g,''); }
function num(n){ const v = Number(n); return isFinite(v) ? v : 0; }

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
  if (itens.length === 0 || !itens.some(item => (item.produto||'').trim())) {
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
      valorCobrado: freteCobrado
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

/* ===================== Persistência idempotente ===================== */
async function persistirPedidoSeNecessario(){
  await waitForLogin();
  await ensureFreteBeforePDF();

  const payload = montarPayloadPedido();
  const idemKey = buildIdempotencyKey(payload);

  // evita reenvio imediato
  if (localStorage.getItem('unikor:lastIdemKey') === idemKey) return;

  try{
    const { id } = await savePedidoIdempotente(payload);
    console.info('[PEDIDOS] salvo:', id);
    localStorage.setItem('unikor:lastIdemKey', idemKey);
    // <- necessário para upload/reimpressão do último
    if (id) localStorage.setItem('unikor:lastPedidoId', id);
  }catch(e){
    console.warn('[PEDIDOS] Falha ao salvar (seguindo com PDF):', e);
  }
}

// versão com limite de tempo (não trava a UI em mobile/desktop)
async function persistirComTimeout(ms=4000){
  try{
    await Promise.race([
      persistirPedidoSeNecessario(),
      new Promise(resolve => setTimeout(resolve, ms))
    ]);
  }catch(_){} // segue adiante
}

/* ===================== Upload do PDF (Storage) ===================== */
// Garante 1 upload por pedido (evita duplicar ao salvar/compartilhar)
async function uploadPdfParaStorage(blob, filename){
  try{
    const tenantId = await getTenantId();
    const docId = localStorage.getItem('unikor:lastPedidoId');
    if (!tenantId || !docId) return;

    // guarda último id que já subiu (não duplica)
    const lastUp = localStorage.getItem('unikor:lastUploadedId');
    if (lastUp === docId) return;

    const storage = getStorage(app);
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
    // não bloqueia o fluxo no mobile/desktop
    console.warn('[Storage] Falha no upload:', e?.message || e);
  }
}

/* ===================== Ações ===================== */
async function gerarPDF() {
  const botao = document.getElementById('btnGerarPdf');
  if (!botao) return;
  const { gerarPDFPreview } = await import('./pdf.js');

  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Gerando PDF...';
  showOverlay();
  try {
    await persistirComTimeout(4000);
    await gerarPDFPreview();
    toastOk('PDF gerado (preview)');
  } catch (e) {
    console.error('[PDF] Erro ao gerar:', e);
    toastErro('Erro ao gerar PDF');
    alert('Erro ao gerar PDF: ' + e.message);
  } finally {
    hideOverlay();
    botao.disabled = false; botao.textContent = textoOriginal;
  }
}

async function salvarPDF() {
  const botao = document.getElementById('btnSalvarPdf');
  if (!botao) return;
  const { salvarPDFLocal, construirPDF } = await import('./pdf.js');

  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Salvando PDF...';
  showOverlay();
  try {
    await persistirComTimeout(4000);

    // salva local
    const { nome } = await salvarPDFLocal();
    toastOk(`PDF salvo: ${nome}`);

    // gera o mesmo PDF (blob) e sobe p/ Storage (1x por pedido)
    const { blob, nomeArq } = await construirPDF();
    await uploadPdfParaStorage(blob, nomeArq);

  } catch (e) {
    console.error('[PDF] Erro ao salvar:', e);
    toastErro('Erro ao salvar PDF');
    alert('Erro ao salvar PDF: ' + e.message);
  } finally {
    hideOverlay();
    botao.disabled = false; botao.textContent = textoOriginal;
  }
}

async function compartilharPDF() {
  const botao = document.getElementById('btnCompartilharPdf');
  if (!botao) return;

  // importações leves só quando necessário
  const { construirPDF } = await import('./pdf.js');

  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Compartilhando PDF...';
  showOverlay();
  try {
    // 1) CONSTRÓI JÁ (mantém user-activation)
    const { blob, nomeArq } = await construirPDF();

    // 2) COMPARTILHA IMEDIATO
    const { compartilharComBlob } = await import('./pdf.js');
    const res = await compartilharComBlob(blob, nomeArq);

    // 3) EM PARALELO: persiste e sobe pro Storage (não bloquear o share)
    (async () => {
      try {
        await persistirComTimeout(4000);
        await uploadPdfParaStorage(blob, nomeArq);
      } catch (_) {}
    })();

    if (res.compartilhado)      toastOk('PDF compartilhado');
    else if (res.cancelado)     toastOk('Compartilhamento cancelado');
    else                        toastOk('Abrimos o PDF (fallback)');
  } catch (e) {
    console.error('[PDF] Erro ao compartilhar:', e);
    toastErro('Erro ao compartilhar PDF');
    alert('Erro ao compartilhar PDF: ' + (e.message || e));
  } finally {
    hideOverlay();
    botao.disabled = false; botao.textContent = textoOriginal;
  }
}

/* ===================== Reimprimir último ===================== */
async function reimprimirUltimoPedidoSalvo() {
  const id = localStorage.getItem('unikor:lastPedidoId');
  if (!id) { alert('Nenhum pedido salvo nesta sessão.'); return; }

  const btn = document.getElementById('btnReimprimirUltimo');
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Reimprimindo...'; }
  showOverlay();
  try {
    const { gerarPDFPreviewDePedidoFirestore } = await import('./pdf.js');
    await gerarPDFPreviewDePedidoFirestore(id);
    toastOk('Reimpressão gerada');
  } catch (e) {
    console.error('[Reimpressão] Erro:', e);
    toastErro('Erro ao reimprimir');
    alert('Erro ao reimprimir: ' + (e.message || e));
  } finally {
    hideOverlay();
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

/* ===================== Inicialização ===================== */
document.addEventListener('DOMContentLoaded', () => {
  initItens();

  setTimeout(() => {
    const containerItens = document.getElementById('itens');
    if (containerItens && containerItens.children.length === 0) {
      adicionarItem();
    }
  }, 100);

  document.getElementById('adicionarItemBtn')?.addEventListener('click', adicionarItem);
  document.getElementById('btnGerarPdf')?.addEventListener('click', gerarPDF);
  document.getElementById('btnSalvarPdf')?.addEventListener('click', salvarPDF);
  document.getElementById('btnCompartilharPdf')?.addEventListener('click', compartilharPDF);
  document.getElementById('btnReimprimirUltimo')?.addEventListener('click', reimprimirUltimoPedidoSalvo);

  const inputCliente = document.getElementById('cliente');
  if (inputCliente) inputCliente.addEventListener('input', () => formatarNome(inputCliente));

  habilitarEspacoNoCliente();
});

// exposição p/ HTML
window.gerarPDF = gerarPDF;
window.salvarPDF = salvarPDF;
window.compartilharPDF = compartilharPDF;
window.reimprimirUltimoPedidoSalvo = reimprimirUltimoPedidoSalvo;

console.log('[APP] Configurado (desktop + mobile ok)');