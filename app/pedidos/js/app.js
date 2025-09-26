import { up, formatMoney, parseMoney, formatKg, parseKg } from './js/utils.js';

console.log('App inicializado');

// Estado global do app
window.appState = {
  itens: []
};

// Utilitários para formatação
function formatarNome(input) {
  if (!input) return;
  input.value = up(input.value);
}

function calcularSubtotal(item) {
  const qtd = parseFloat(item.quantidade) || 0;
  const valor = parseMoney(item.valor) || 0;
  const peso = parseKg(item.peso) || 0;
  
  // Se tem peso, usa peso * valor/kg
  if (peso > 0) {
    return peso * valor;
  }
  // Senão, usa quantidade * valor unitário
  return qtd * valor;
}

function calcularPesoTotal(item) {
  const qtd = parseFloat(item.quantidade) || 0;
  const gramatura = parseFloat(item.gramatura) || 0;
  const pesoIndividual = parseKg(item.peso) || 0;
  
  // Se tem peso individual, usa ele
  if (pesoIndividual > 0) {
    return pesoIndividual;
  }
  // Se tem gramatura, calcula: (quantidade * gramatura) / 1000
  if (gramatura > 0) {
    return (qtd * gramatura) / 1000;
  }
  return 0;
}

function atualizarItem(index) {
  const item = window.appState.itens[index];
  if (!item) return;
  const container = document.querySelector(`[data-index="${index}"]`);
  if (!container) return;

  // Pega valores dos inputs
  item.descricao = container.querySelector('.item-descricao')?.value || '';
  item.quantidade = container.querySelector('.item-quantidade')?.value || '';
  item.gramatura = container.querySelector('.item-gramatura')?.value || '';
  item.peso = container.querySelector('.item-peso')?.value || '';
  item.valor = container.querySelector('.item-valor')?.value || '';

  // Calcula peso total se tem gramatura
  const pesoCalculado = calcularPesoTotal(item);
  if (pesoCalculado > 0) {
    item.peso = formatKg(pesoCalculado);
    const pesoInput = container.querySelector('.item-peso');
    if (pesoInput) pesoInput.value = item.peso;
  }

  // Calcula subtotal
  const subtotal = calcularSubtotal(item);
  item.subtotal = formatMoney(subtotal);

  // Atualiza display do subtotal
  const subtotalDisplay = container.querySelector('.subtotal');
  if (subtotalDisplay) {
    subtotalDisplay.textContent = `Subtotal: R$ ${item.subtotal}`;
  }

  atualizarTotal();
}

function atualizarTotal() {
  let total = 0;
  window.appState.itens.forEach(item => {
    const subtotal = parseMoney(item.subtotal) || 0;
    total += subtotal;
  });

  const totalElement = document.getElementById('total');
  if (totalElement) {
    totalElement.textContent = `Total: R$ ${formatMoney(total)}`;
  }
}

function adicionarItem() {
  const novoItem = {
    descricao: '',
    quantidade: '',
    gramatura: '',
    peso: '',
    valor: '',
    subtotal: 'R$ 0,00'
  };
  
  window.appState.itens.push(novoItem);
  renderizarItens();
}

function removerItem(index) {
  if (confirm('Remover este item?')) {
    window.appState.itens.splice(index, 1);
    renderizarItens();
  }
}

function renderizarItens() {
  const container = document.getElementById('itensContainer');
  if (!container) return;

  container.innerHTML = '';

  window.appState.itens.forEach((item, index) => {
    const itemHTML = `
      <div class="item" data-index="${index}">
        <div class="field-group">
          <label>Descrição do Item:</label>
          <input type="text" class="item-descricao" value="${item.descricao}" />
        </div>
        <div class="field-group grid-2">
          <div>
            <label>Quantidade:</label>
            <input type="number" class="item-quantidade" step="any" value="${item.quantidade}" />
          </div>
          <div>
            <label>Gramatura (g) - se aplicável:</label>
            <input type="number" class="item-gramatura" step="any" value="${item.gramatura}" />
          </div>
        </div>
        <div class="field-group grid-2">
          <div>
            <label>Peso Total (Kg):</label>
            <input type="text" class="item-peso" value="${item.peso}" />
          </div>
          <div>
            <label>Valor (R$/Kg ou unitário):</label>
            <input type="text" class="item-valor" value="${item.valor}" />
          </div>
        </div>
        <div class="subtotal">${item.subtotal ? `Subtotal: ${item.subtotal}` : 'Subtotal: R$ 0,00'}</div>
        <button type="button" class="remove" onclick="removerItem(${index})">Remover Item</button>
      </div>`;
    
    container.insertAdjacentHTML('beforeend', itemHTML);
  });

  // Adiciona listeners para os inputs
  container.querySelectorAll('.item').forEach((itemElement, index) => {
    const inputs = itemElement.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('input', () => atualizarItem(index));
      input.addEventListener('blur', () => atualizarItem(index));
    });
  });

  atualizarTotal();
}

// Função global para o PDF.js acessar os dados
window.getItens = function() {
  return window.appState.itens.map(item => {
    const pesoNumerico = parseKg(item.peso) || calcularPesoTotal(item);
    const valorNumerico = parseMoney(item.valor) || 0;
    const qtd = parseFloat(item.quantidade) || 0;
    
    return {
      produto: item.descricao || '',
      tipo: pesoNumerico > 0 ? 'UN' : 'KG',
      quantidade: qtd,
      preco: valorNumerico,
      obs: '',
      total: calcularSubtotal(item),
      _pesoTotalKg: pesoNumerico
    };
  });
};

// Funções de PDF com loading
async function gerarPDF() {
  const botao = document.getElementById('gerarPdfBtn');
  if (!botao) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.innerHTML = '⏳ Gerando PDF...';

  try {
    console.log('Iniciando geração de PDF...');
    const { montarPDF } = await import('./js/pdf.js');
    
    const dados = coletarDadosFormulario();
    if (!dados.cliente.trim()) {
      alert('Informe o nome do cliente');
      return;
    }
    if (dados.itens.length === 0) {
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
    telefone: document.getElementById('telefone')?.value || '',
    endereco: document.getElementById('endereco')?.value || '',
    observacoes: document.getElementById('observacoes')?.value || '',
    itens: window.appState.itens.map(item => ({
      descricao: item.descricao,
      quantidade: parseFloat(item.quantidade) || 0,
      gramatura: parseFloat(item.gramatura) || 0,
      peso: item.peso,
      pesoNumerico: parseKg(item.peso) || calcularPesoTotal(item),
      valor: item.valor,
      valorNumerico: parseMoney(item.valor) || 0,
      subtotal: item.subtotal
    }))
  };
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM carregado');
  
  // Inicializa com um item
  adicionarItem();

  // Botões principais
  const btnAdicionar = document.getElementById('adicionarItemBtn');
  if (btnAdicionar) {
    btnAdicionar.addEventListener('click', adicionarItem);
  }

  const btnGerarPDF = document.getElementById('gerarPdfBtn');
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
window.removerItem = removerItem;
window.gerarPDF = gerarPDF;

console.log('App configurado completamente');
