// app/pedidos/js/app.js
import { up } from './utils.js';
import { initItens, adicionarItem, getItens, atualizarFreteAoEditarItem } from './itens.js';
import { showOverlay, hideOverlay, toastOk, toastErro } from './ui.js';

// >>> persistência idempotente + frete
import { savePedidoIdempotente, buildIdempotencyKey } from './db.js';
import { getFreteAtual, ensureFreteBeforePDF, atualizarFreteUI } from './frete.js';
import { waitForLogin } from './firebase.js';

// >>> Drive
import { getGoogleAccessToken } from '/app/despesas/js/google-auth.js'; // mesma função já usada nas despesas
import { queueDriveUpload } from './driveQueue.js'; // você disse que já colocou esse módulo
import {
  gerarPDFPreview,
  salvarPDFLocal,
  compartilharPDFNativo,
  uploadPDFAtualParaDrive,
  gerarPDFPreviewDePedidoFirestore
} from './pdf.js';

console.log('App inicializado');

/* ======== Qualidade de digitação ======== */
// mantém maiúsculas mas NÃO tira espaços
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
    localStorage.setItem('unikor:lastPedidoId', id); // usado para reimprimir depois
  }catch(e){
    // não bloqueia PDF; apenas informa
    console.warn('[PEDIDOS] Falha ao salvar (seguindo com PDF):', e);
  }
}

/* ======== Ações com overlay e feedback ======== */
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

  if (!validarAntesGerar()) return;

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

/* ======== NOVO: Enviar PDF para o Drive ======== */
async function enviarPDFParaDrive() {
  const btn = document.getElementById('btnEnviarDrive');
  if (!btn) return;

  if (!validarAntesGerar()) return;

  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Enviando...';
  showOverlay();
  try {
    await persistirPedidoSeNecessario();
    // envia o PDF gerado pela TELA (DOM) para o Drive
    const up = await uploadPDFAtualParaDrive(getGoogleAccessToken);
    console.log('[Drive] upload ok:', up);
    toastOk('PDF enviado ao Drive');
  } catch (e) {
    console.warn('[Drive] falha, colocando na fila:', e);
    // se der erro de rede/perm, salva na FILA para retry
    try{
      await queueDriveUpload({ source: 'PEDIDO_DOM' }); // sua fila pode ignorar/ler metadados conforme implementada
      toastOk('Sem rede/perm. Colocado na fila para enviar depois.');
    }catch(err){
      console.error('[Drive] fila também falhou:', err);
      toastErro('Falha ao enviar ao Drive');
      alert('Falha ao enviar ao Drive: ' + e.message);
    }
  } finally {
    hideOverlay();
    btn.disabled = false; btn.textContent = original;
  }
}

/* ======== NOVO: Reimprimir do Firestore (último pedido salvo) ======== */
async function reimprimirUltimoPedidoSalvo() {
  const btn = document.getElementById('btnReimprimirUltimo');
  if (!btn) return;

  const id = localStorage.getItem('unikor:lastPedidoId');
  if (!id) { alert('Ainda não há pedido salvo nesta sessão. Gere e salve um primeiro.'); return; }

  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Reimprimindo...';
  showOverlay();
  try {
    await waitForLogin();
    await gerarPDFPreviewDePedidoFirestore(id); // busca do Firestore e gera no MESMO layout
    toastOk('PDF reimpresso a partir do pedido salvo');
  } catch (e) {
    console.error('[Reimpressão] Erro:', e);
    toastErro('Erro ao reimprimir');
    alert('Erro ao reimprimir: ' + e.message);
  } finally {
    hideOverlay();
    btn.disabled = false; btn.textContent = original;
  }
}

/* ======== Inicialização ======== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado');

  initItens();

  // ligar itens -> recálculo do frete sempre que editar
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

  // NOVOS BOTÕES (opcionais no HTML):
  // <button id="btnEnviarDrive">Enviar ao Drive</button>
  // <button id="btnReimprimirUltimo">Reimprimir Último</button>
  const btnEnviarDrive = document.getElementById('btnEnviarDrive');
  if (btnEnviarDrive) btnEnviarDrive.addEventListener('click', enviarPDFParaDrive);

  const btnReimprimirUltimo = document.getElementById('btnReimprimirUltimo');
  if (btnReimprimirUltimo) btnReimprimirUltimo.addEventListener('click', reimprimirUltimoPedidoSalvo);

  // Sanitize: remove qualquer listener colado por scripts externos no #cliente
  let inputCliente = document.getElementById('cliente');
  if (inputCliente) {
    const val = inputCliente.value;
    const clone = inputCliente.cloneNode(true); // clona atributos e datalist, mas sem listeners
    inputCliente.replaceWith(clone);
    inputCliente = clone;
    inputCliente.value = val;

    // nosso listener continua funcionando normalmente
    inputCliente.addEventListener('input', () => formatarNome(inputCliente));
  }

});

// exposição (mantive)
window.gerarPDF = gerarPDF;
window.salvarPDF = salvarPDF;
window.compartilharPDF = compartilharPDF;

console.log('App configurado completamente');