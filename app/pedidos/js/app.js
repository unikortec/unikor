// app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens, atualizarFreteAoEditarItem } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';

// Persistência idempotente + frete
import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF, atualizarFreteUI } from './frete.js';
import { waitForLogin } from './firebase.js';

// PDF
import {
  gerarPDFPreview,
  salvarPDFLocal,
  compartilharPDFNativo,
  construirPDFBlob, // novo helper: gera {blob, nomeArq, entregaISO}
} from './pdf.js';

console.log('App inicializado');

/* ======== Qualidade de digitação ======== */
function formatarNome(input) {
  if (!input) return;
  const v = input.value.replace(/_/g, ' ').replace(/\s{2,}/g, ' ');
  input.value = up(v);
}

/* ======== Leitura da tela ======== */
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

/* ======== Montagem do payload p/ salvar ======== */
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

/* ======== Persistência idempotente ======== */
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

/* ======== Upload ao Drive ======== */
// Importamos **dinamicamente** para não quebrar o app quando o módulo não existir
async function uploadPdfToDrive({ blob, filename, isoDate }) {
  try{
    const { initDrivePedidos, uploadPedidoPDF } = await import('./drive-pedidos.js');
    const { getGoogleAccessToken } = await import('/app/despesas/js/google-auth.js');
    await initDrivePedidos(getGoogleAccessToken);
    return await uploadPedidoPDF({ blob, filename, isoDate });
  }catch(e){
    // Não quebra o fluxo do usuário
    console.warn('[Drive] Upload indisponível:', e?.message || e);
    throw e;
  }
}

/* ======== Ações ======== */
async function gerarPDF() {
  const botao = document.getElementById('btnGerarPdf');
  if (!botao) return;
  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Gerando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();
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
  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Salvando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();

    // Gera uma vez e reaproveita para Drive
    const { blob, nomeArq, entregaISO } = await construirPDFBlob();

    // Salvar local
    await salvarPDFLocal();

    // Copiar para Drive (best-effort)
    try {
      await uploadPdfToDrive({ blob, filename: nomeArq, isoDate: entregaISO });
      toastOk(`PDF salvo e enviado ao Drive`);
    } catch {
      toastOk('PDF salvo (Drive indisponível agora)');
    }

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
  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Compartilhando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();

    // Gera uma vez e reaproveita para Drive
    const { blob, nomeArq, entregaISO } = await construirPDFBlob();

    // Compartilhar
    const res = await compartilharPDFNativo();
    if (res.compartilhado)      toastOk('PDF compartilhado');
    else if (res.cancelado)     toastOk('Compartilhamento cancelado');
    else                        toastOk('Abrimos o PDF para envio');

    // Copiar para Drive (best-effort)
    try {
      await uploadPdfToDrive({ blob, filename: nomeArq, isoDate: entregaISO });
      console.info('[Drive] PDF copiado após compartilhar.');
    } catch {
      console.info('[Drive] indisponível no momento (após compartilhar).');
    }

  } catch (e) {
    console.error('[PDF] Erro ao compartilhar:', e);
    toastErro('Erro ao compartilhar PDF');
    alert('Erro ao compartilhar PDF: ' + e.message);
  } finally {
    hideOverlay();
    botao.disabled = false; botao.textContent = textoOriginal;
  }
}

/* ======== Inicialização ======== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado');

  initItens(); // <- com o import dinâmico do Drive fora do topo, isso volta a funcionar

  atualizarFreteAoEditarItem(atualizarFreteUI);
  setTimeout(() => atualizarFreteUI(), 50);

  setTimeout(() => {
    const containerItens = document.getElementById('itens');
    if (containerItens && containerItens.children.length === 0) {
      adicionarItem();
      console.log('Item inicial adicionado');
    }
  }, 100);

  const btnAdicionar = document.getElementById('adicionarItemBtn');
  if (btnAdicionar) btnAdicionar.addEventListener('click', adicionarItem);

  const btnGerarPDF = document.getElementById('btnGerarPdf');
  if (btnGerarPDF) btnGerarPDF.addEventListener('click', gerarPDF);

  const btnSalvarPDF = document.getElementById('btnSalvarPdf');
  if (btnSalvarPDF) btnSalvarPDF.addEventListener('click', salvarPDF);

  const btnCompartilharPDF = document.getElementById('btnCompartilharPdf');
  if (btnCompartilharPDF) btnCompartilharPDF.addEventListener('click', compartilharPDF);

  // Sanitize: limpa handlers estranhos do #cliente, mantendo espaço liberado
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

// exposição (se precisar no console)
window.gerarPDF = gerarPDF;
window.salvarPDF = salvarPDF;
window.compartilharPDF = compartilharPDF;

console.log('App configurado completamente');