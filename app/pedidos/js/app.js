import { up } from './utils.js';
import { initItens, adicionarItem, getItens, atualizarFreteAoEditarItem } from './itens.js';
import { atualizarFreteUI } from './frete.js';
import { showLoading, hideLoading, toastErro } from './ui.js';

console.log('App inicializado');

function formatarNome(input) {
  if (!input) return;
  input.value = up(input.value);
}

function validarAntesDeGerar() {
  const cliente = document.getElementById('cliente')?.value || '';
  if (!cliente.trim()) { alert('Informe o nome do cliente'); return false; }
  const itens = getItens();
  if (itens.length === 0 || !itens.some(item => (item.produto||'').trim())) {
    alert('Adicione pelo menos um item'); return false;
  }
  return true;
}

async function gerarPDF() {
  const botao = document.getElementById('btnGerarPdf');
  if (!botao) return;
  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.innerHTML = '⏳ Gerando PDF...'; showLoading();
  try {
    if (!validarAntesDeGerar()) return;
    const { montarPDF } = await import('./pdf.js');
    await montarPDF();
  } catch (error) {
    console.error('[PDF] Erro ao gerar:', error);
    toastErro('Erro ao gerar PDF');
  } finally {
    botao.disabled = false; botao.textContent = textoOriginal; hideLoading();
  }
}

async function salvarPDF() {
  const botao = document.getElementById('btnSalvarPdf');
  if (!botao) return;
  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.innerHTML = '⏳ Salvando PDF...'; showLoading();
  try {
    if (!validarAntesDeGerar()) return;
    const { salvarPDFLocal } = await import('./pdf.js');
    await salvarPDFLocal();
  } catch (error) {
    console.error('[PDF] Erro ao salvar:', error);
    toastErro('Erro ao salvar PDF');
  } finally {
    botao.disabled = false; botao.textContent = textoOriginal; hideLoading();
  }
}

async function compartilharPDF() {
  const botao = document.getElementById('btnCompartilharPdf');
  if (!botao) return;
  const textoOriginal = botao.textContent;
  botao.disabled = true; botao.innerHTML = '⏳ Compartilhando PDF...'; showLoading();
  try {
    if (!validarAntesDeGerar()) return;
    const { compartilharPDFNativo } = await import('./pdf.js');
    await compartilharPDFNativo();
  } catch (error) {
    console.error('[PDF] Erro ao compartilhar:', error);
    toastErro('Erro ao compartilhar PDF');
  } finally {
    botao.disabled = false; botao.textContent = textoOriginal; hideLoading();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado');

  initItens();
  // adiciona um item se vazio
  setTimeout(() => {
    const containerItens = document.getElementById('itens');
    if (containerItens && containerItens.children.length === 0) {
      adicionarItem();
      console.log('Item inicial adicionado');
    }
  }, 100);

  // Recalcular frete quando itens forem editados
  atualizarFreteAoEditarItem(() => atualizarFreteUI());

  // Botões principais
  const btnAdicionar = document.getElementById('adicionarItemBtn');
  if (btnAdicionar) btnAdicionar.addEventListener('click', adicionarItem);

  const btnGerarPDF = document.getElementById('btnGerarPdf');
  if (btnGerarPDF) btnGerarPDF.addEventListener('click', gerarPDF);

  const btnSalvarPDF = document.getElementById('btnSalvarPdf');
  if (btnSalvarPDF) btnSalvarPDF.addEventListener('click', salvarPDF);

  const btnCompartilharPDF = document.getElementById('btnCompartilharPdf');
  if (btnCompartilharPDF) btnCompartilharPDF.addEventListener('click', compartilharPDF);

  // Formatação de inputs principais
  const inputCliente = document.getElementById('cliente');
  if (inputCliente) inputCliente.addEventListener('input', () => formatarNome(inputCliente));
});

window.gerarPDF = gerarPDF;
window.salvarPDF = salvarPDF;
window.compartilharPDF = compartilharPDF;
console.log('App configurado completamente');
