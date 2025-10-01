// app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';

// >>> novos imports p/ salvar idempotente e garantir frete
import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF } from './frete.js';
import { waitForLogin } from './firebase.js';

console.log('App inicializado');

/* ======== Qualidade de digitação ======== */
// mantém maiúsculas mas NÃO tira espaços
function formatarNome(input) {
  if (!input) return;
  // normaliza múltiplos espaços e mantém espaço
  const v = input.value.replace(/_/g, ' ').replace(/\s{2,}/g, ' ');
  input.value = up(v);
}

// garante que o campo #cliente aceite espaço mesmo se houver algum listener global bloqueando
function habilitarEspacoNoCliente() {
  const el = document.getElementById('cliente');
  if (!el) return;
  // roda em "capture" para impedir que outros handlers bloqueiem
  ['keydown','keypress','keyup','beforeinput'].forEach(type=>{
    el.addEventListener(type, (ev)=>{
      if ((ev.key === ' ') || (ev.data === ' ')) ev.stopImmediatePropagation();
    }, true);
  });
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
  if (!dados.cliente.trim()) {
    alert('Informe o nome do cliente');
    return false;
  }
  const itens = getItens();
  if (itens.length === 0 || !itens.some(item => (item.produto||'').trim())) {
    alert('Adicione pelo menos um item');
    return false;
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

/* ======== Persistência idempotente ======== */
async function persistirPedidoSeNecessario(){
  await waitForLogin();              // mesma sessão do portal
  await ensureFreteBeforePDF();      // evita divergência de frete

  const payload = montarPayloadPedido();
  const idemKey = buildIdempotencyKey(payload);

  // evita re-envio imediato em cliques repetidos
  if (localStorage.getItem('unikor:lastIdemKey') === idemKey) return;

  try{
    const { id } = await savePedidoIdempotente(payload);
    console.info('[PEDIDOS] salvo em Firestore:', id);
    localStorage.setItem('unikor:lastIdemKey', idemKey);
  }catch(e){
    // não bloqueia PDF; apenas informa
    console.warn('[PEDIDOS] Falha ao salvar (seguindo com PDF):', e);
  }
}

/* ======== Ações com overlay e feedback ======== */
async function gerarPDF() {
  const botao = document.getElementById('btnGerarPdf');
  if (!botao) return;
  const { gerarPDFPreview } = await import('./pdf.js');

  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Gerando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();   // <<< novo
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
  const { salvarPDFLocal } = await import('./pdf.js');

  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Salvando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();   // <<< novo
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
  const { compartilharPDFNativo } = await import('./pdf.js');

  if (!validarAntesGerar()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.textContent = '⏳ Compartilhando PDF...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();   // <<< novo
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

/* ======== Inicialização ======== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado');

  initItens();

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

  const inputCliente = document.getElementById('cliente');
  if (inputCliente) {
    inputCliente.addEventListener('input', () => formatarNome(inputCliente));
  }

  // <<< garante espaço no campo Cliente
  habilitarEspacoNoCliente();
});

// exposição (mantive)
window.gerarPDF = gerarPDF;
window.salvarPDF = salvarPDF;
window.compartilharPDF = compartilharPDF;

console.log('App configurado completamente');