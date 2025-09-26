import { up } from './utils.js';
import { initItens, adicionarItem, getItens } from './itens.js';

console.log('App inicializado');

// Utilitários para formatação
function formatarNome(input) {
  if (!input) return;
  input.value = up(input.value);
}

// Funções de PDF com loading
async function gerarPDF() {
  const botao = document.getElementById('btnGerarPdf');
  if (!botao) return;
  
  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.innerHTML = '⏳ Gerando PDF...';
  
  try {
    console.log('Iniciando geração de PDF...');
    const { montarPDF } = await import('./pdf.js');
    const dados = coletarDadosFormulario();
    
    if (!dados.cliente.trim()) {
      alert('Informe o nome do cliente');
      return;
    }
    
    const itens = getItens();
    if (itens.length === 0 || !itens.some(item => item.produto.trim())) {
      alert('Adicione pelo menos um item');
      return;
    }
    
    await montarPDF();
    console.log('PDF gerado com sucesso');
  } catch (error) {
    console.error('[PDF] Erro ao gerar:', error);
    alert('Erro ao gerar PDF: ' + error.message);
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado');
  
  // Inicializa o sistema de itens
  initItens();
  
  // ADICIONA UM ITEM INICIAL automaticamente
  setTimeout(() => {
    adicionarItem();
    console.log('Item inicial adicionado');
  }, 100);
  
  // Botões principais
  const btnAdicionar = document.getElementById('adicionarItemBtn');
  if (btnAdicionar) {
    btnAdicionar.addEventListener('click', adicionarItem);
  }
  
  const btnGerarPDF = document.getElementById('btnGerarPdf');
  if (btnGerarPDF) {
    btnGerarPDF.addEventListener('click', gerarPDF);
  }
  
  // Formatação de inputs principais
  const inputCliente = document.getElementById('cliente');
  if (inputCliente) {
    inputCliente.addEventListener('input', () => formatarNome(inputCliente));
  }
});

// Funções globais
window.gerarPDF = gerarPDF;
console.log('App configurado completamente');
