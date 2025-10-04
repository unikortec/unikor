// app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens, atualizarFreteAoEditarItem } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';

import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF, atualizarFreteUI } from './frete.js';
import { waitForLogin } from './firebase.js';

import {
  gerarPDFPreview,          // gera da tela atual
  salvarPDFLocal,
  compartilharPDFNativo,
  gerarPDFPreviewDePedidoFirestore // <- reimpressão do Firestore
} from './pdf.js';

console.log('[APP] Pedidos inicializado');

/* ===================== Helpers ===================== */
function formatarNome(input) {
  if (!input) return;
  const v = input.value.replace(/_/g, ' ').replace(/\s{2,}/g, ' ');
  input.value = up(v);
}

function digitsOnly(v){ return String(v||'').replace(/\D/g,''); }
function num(n){ const v = Number(n); return isFinite(v) ? v : 0; }

/* ===================== Payload ===================== */
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
  }catch(e){
    console.warn('[PEDIDOS] Falha ao salvar (seguindo com PDF):', e);
  }
}

/* ===================== Ações PDF ===================== */
async function salvarPDF() {
  const botao = document.getElementById('btnSalvarPdf');
  if (!botao) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Salvando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();
    const { nome } = await salvarPDFLocal();
    toastOk(`PDF salvo: ${nome}`);
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

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Compartilhando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();
    const res = await compartilharPDFNativo();
    if (res.compartilhado)      toastOk('PDF compartilhado');
    else if (res.cancelado)     toastOk('Compartilhamento cancelado');
    else                        toastOk('Abrimos o PDF para envio');
  } catch (e) {
    console.error('[PDF] Erro ao compartilhar:', e);
    toastErro('Erro ao compartilhar PDF');
    alert('Erro ao compartilhar PDF: ' + e.message);
  } finally {
    hideOverlay();
    botao.disabled = false; botao.textContent = textoOriginal;
  }
}

async function reimprimirUltimoPedidoSalvo() {
  const btn = document.getElementById('btnReimprimirUltimo');
  if (!btn) return;

  const id = localStorage.getItem('unikor:lastPedidoId');
  if (!id) { alert('Ainda não há pedido salvo nesta sessão.'); return; }

  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Reimprimindo...';
  showOverlay();
  try {
    await waitForLogin();
    await gerarPDFPreviewDePedidoFirestore(id);
    toastOk('PDF reimprimido do Firestore');
  } catch (e) {
    console.error('[Reimpressão] Erro:', e);
    toastErro('Erro ao reimprimir');
    alert('Erro ao reimprimir: ' + e.message);
  } finally {
    hideOverlay();
    btn.disabled = false; btn.textContent = original;
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

  const btnSalvarPDF = document.getElementById('btnSalvarPdf');
  if (btnSalvarPDF) btnSalvarPDF.addEventListener('click', salvarPDF);

  const btnCompartilharPDF = document.getElementById('btnCompartilharPdf');
  if (btnCompartilharPDF) btnCompartilharPDF.addEventListener('click', compartilharPDF);

  const btnReimprimirUltimo = document.getElementById('btnReimprimirUltimo');
  if (btnReimprimirUltimo) btnReimprimirUltimo.addEventListener('click', reimprimirUltimoPedidoSalvo);

  // Sanitize campo cliente (mantendo espaços internos)
  let inputCliente = document.getElementById('cliente');
  if (inputCliente) {
    const val = inputCliente.value;
    const clone = inputCliente.cloneNode(true);
    inputCliente.replaceWith(clone);
    inputCliente = clone;
    inputCliente.value = val;
    inputCliente.addEventListener('input', () => formatarNome(inputCliente));
  }
});

// Exposição opcional para debug
window.salvarPDF = salvarPDF;
window.compartilharPDF = compartilharPDF;
window.reimprimirUltimoPedidoSalvo = reimprimirUltimoPedidoSalvo;