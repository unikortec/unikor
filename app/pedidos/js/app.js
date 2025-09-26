import './auth-guard.js';
import './modal-cliente.js';
import { initItens, adicionarItem, getItens } from './itens.js';
import { gerarPDF, compartilharPDF } from './pdf.js';
import { initUI } from './ui.js';
import { initState } from './state.js';

console.log('App carregado');

class PedidoApp {
  constructor() {
    this.init();
  }

  async init() {
    try {
      // Inicializa componentes na ordem correta
      await this.initializeComponents();
      this.setupEventListeners();
      console.log('App de pedidos inicializado com sucesso');
    } catch (error) {
      console.error('Erro ao inicializar app:', error);
    }
  }

  async initializeComponents() {
    // Inicializa estado
    if (typeof initState === 'function') {
      initState();
    }
    
    // Inicializa UI
    if (typeof initUI === 'function') {
      initUI();
    }
    
    // Inicializa os itens
    initItens();
    
    console.log('Componentes inicializados');
  }

  setupEventListeners() {
    // Event delegation para todos os botões
    document.addEventListener('click', (e) => {
      const target = e.target;
      
      // Botão adicionar item
      if (target.id === 'adicionar-item' || target.closest('#adicionar-item')) {
        e.preventDefault();
        adicionarItem();
        console.log('Item adicionado');
      }
      
      // Botão gerar PDF
      if (target.id === 'gerar-pdf' || target.closest('#gerar-pdf')) {
        e.preventDefault();
        this.gerarPDF();
      }
      
      // Botão compartilhar PDF
      if (target.id === 'compartilhar-pdf' || target.closest('#compartilhar-pdf')) {
        e.preventDefault();
        this.compartilharPDF();
      }
      
      // Botão limpar pedido
      if (target.id === 'limpar-pedido' || target.closest('#limpar-pedido')) {
        e.preventDefault();
        this.limparPedido();
      }
    });

    console.log('Event listeners configurados');
  }

  async gerarPDF() {
    try {
      const dados = this.coletarDados();
      if (!this.validarDados(dados)) return;
      
      console.log('Gerando PDF com dados:', dados);
      await gerarPDF(dados);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF: ' + error.message);
    }
  }

  async compartilharPDF() {
    try {
      const dados = this.coletarDados();
      if (!this.validarDados(dados)) return;
      
      console.log('Compartilhando PDF com dados:', dados);
      await compartilharPDF(dados);
    } catch (error) {
      console.error('Erro ao compartilhar PDF:', error);
      alert('Erro ao compartilhar PDF: ' + error.message);
    }
  }

  limparPedido() {
    if (confirm('Tem certeza que deseja limpar o pedido?')) {
      try {
        // Limpa cliente
        const clienteInput = document.getElementById('cliente');
        if (clienteInput) clienteInput.value = '';
        
        // Limpa observações
        const obsInput = document.getElementById('observacoes');
        if (obsInput) obsInput.value = '';
        
        // Reinicializa itens
        initItens();
        
        console.log('Pedido limpo');
      } catch (error) {
        console.error('Erro ao limpar pedido:', error);
      }
    }
  }

  coletarDados() {
    try {
      // Dados do cliente
      const cliente = document.getElementById('cliente')?.value || '';
      const observacoes = document.getElementById('observacoes')?.value || '';
      
      // Dados dos itens
      const itens = getItens();
      
      // Calcula total
      const total = itens.reduce((sum, item) => sum + (item.total || 0), 0);
      
      const dados = {
        cliente,
        observacoes,
        itens,
        total,
        telefone: '', // Será implementado quando tivermos dados do cliente
        endereco: ''  // Será implementado quando tivermos dados do cliente
      };
      
      console.log('Dados coletados:', dados);
      return dados;
      
    } catch (error) {
      console.error('Erro ao coletar dados:', error);
      return {
        cliente: '',
        observacoes: '',
        itens: [],
        total: 0,
        telefone: '',
        endereco: ''
      };
    }
  }

  validarDados(dados) {
    if (!dados.cliente.trim()) {
      alert('Por favor, informe o cliente');
      const clienteInput = document.getElementById('cliente');
      if (clienteInput) clienteInput.focus();
      return false;
    }
    
    if (!dados.itens || !dados.itens.length) {
      alert('Por favor, adicione pelo menos um item ao pedido');
      return false;
    }
    
    // Verifica se todos os itens têm produto
    const itensInvalidos = dados.itens.filter(item => !item.produto || !item.produto.trim());
    if (itensInvalidos.length > 0) {
      alert('Por favor, preencha o produto de todos os itens');
      return false;
    }
    
    // Verifica se todos os itens têm quantidade e preço válidos
    const itensIncompletos = dados.itens.filter(item => 
      !item.quantidade || item.quantidade <= 0 || 
      !item.preco || item.preco <= 0
    );
    if (itensIncompletos.length > 0) {
      alert('Por favor, preencha quantidade e preço de todos os itens');
      return false;
    }
    
    return true;
  }
}

// Inicializa o app
let app;

function initApp() {
  try {
    app = new PedidoApp();
    window.pedidoApp = app; // Disponibiliza globalmente se necessário
  } catch (error) {
    console.error('Erro fatal ao inicializar app:', error);
  }
}

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Exporta para uso em outros módulos se necessário
export { PedidoApp };
export default PedidoApp;
// Adicionar estas funções no final do app.js

let contadorItens = 0;

function adicionarItem() {
  contadorItens++;
  const container = document.getElementById('itens-container');
  
  const itemDiv = document.createElement('div');
  itemDiv.className = 'item';
  itemDiv.id = `item-${contadorItens}`;
  
  itemDiv.innerHTML = `
    <div class="item-header">
      <h4>Item ${contadorItens}</h4>
      <button type="button" class="remove" onclick="removerItem(${contadorItens})">Remover</button>
    </div>
    
    <div class="field-group">
      <label>Produto/Descrição:</label>
      <input type="text" id="produto-${contadorItens}" class="produto" placeholder="Digite o nome do produto" required />
    </div>
    
    <div class="field-group grid-3">
      <div>
        <label>Quantidade:</label>
        <input type="number" id="quantidade-${contadorItens}" class="quantidade" min="0" step="0.01" placeholder="0" />
      </div>
      <div>
        <label>Peso (Kg):</label>
        <input type="number" id="peso-${contadorItens}" class="peso" min="0" step="0.001" placeholder="0.000" />
      </div>
      <div>
        <label>Gramatura (g):</label>
        <input type="number" id="gramatura-${contadorItens}" class="gramatura" min="0" placeholder="0" />
        <small class="inline-help">Se informado, peso = qtd × gramatura</small>
      </div>
    </div>
    
    <div class="field-group grid-2">
      <div>
        <label>Valor por Kg:</label>
        <input type="text" id="valor-${contadorItens}" class="valor" placeholder="R$ 0,00" />
      </div>
      <div>
        <label>Subtotal:</label>
        <div id="subtotal-${contadorItens}" class="subtotal">R$ 0,00</div>
      </div>
    </div>
    
    <div class="field-group">
      <label>Observação do item:</label>
      <textarea id="obs-${contadorItens}" class="obs-item" placeholder="Observações deste item..."></textarea>
    </div>
  `;
  
  container.appendChild(itemDiv);
  configurarCalculosItem(contadorItens);
  document.getElementById(`produto-${contadorItens}`).focus();
}

function removerItem(id) {
  const item = document.getElementById(`item-${id}`);
  if (item) {
    item.remove();
    atualizarResumo();
  }
}

function configurarCalculosItem(id) {
  const quantidade = document.getElementById(`quantidade-${id}`);
  const peso = document.getElementById(`peso-${id}`);
  const gramatura = document.getElementById(`gramatura-${id}`);
  const valor = document.getElementById(`valor-${id}`);
  
  const calcular = () => {
    const qtd = parseFloat(quantidade.value) || 0;
    const pesoKg = parseFloat(peso.value) || 0;
    const gram = parseFloat(gramatura.value) || 0;
    const valorKg = parseFloat(valor.value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    
    let pesoFinal = pesoKg;
    if (gram > 0 && qtd > 0) {
      pesoFinal = (qtd * gram) / 1000;
      peso.value = pesoFinal.toFixed(3);
    }
    
    const subtotal = pesoFinal * valorKg;
    document.getElementById(`subtotal-${id}`).textContent = 
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subtotal);
    
    atualizarResumo();
  };
  
  valor.addEventListener('input', (e) => {
    let value = e.target.value.replace(/[^\d]/g, '');
    if (value) {
      value = (parseInt(value) / 100).toFixed(2);
      e.target.value = `R$ ${value.replace('.', ',')}`;
    }
    calcular();
  });
  
  [quantidade, peso, gramatura].forEach(input => {
    input.addEventListener('input', calcular);
  });
}

function atualizarResumo() {
  const resumoDiv = document.getElementById('resumo');
  const itens = document.querySelectorAll('.item');
  
  let totalItens = 0;
  let pesoTotal = 0;
  let valorTotal = 0;
  
  itens.forEach((item) => {
    const id = item.id.split('-')[1];
    const peso = parseFloat(document.getElementById(`peso-${id}`)?.value) || 0;
    const valor = parseFloat(document.getElementById(`valor-${id}`)?.value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    
    totalItens++;
    pesoTotal += peso;
    valorTotal += peso * valor;
  });
  
  const freteIsento = document.getElementById('isentarFrete')?.checked;
  const valorFrete = freteIsento ? 0 : 0; // implementar cálculo do frete depois
  const totalFinal = valorTotal + valorFrete;
  
  resumoDiv.innerHTML = `
    <h3>Resumo do Pedido</h3>
    <div class="resumo-item"><span>Total de itens:</span><span>${totalItens}</span></div>
    <div class="resumo-item"><span>Peso total:</span><span>${pesoTotal.toFixed(3).replace('.', ',')} kg</span></div>
    <div class="resumo-item"><span>Subtotal itens:</span><span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal)}</span></div>
    <div class="resumo-item resumo-total"><span>TOTAL GERAL:</span><span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFinal)}</span></div>
  `;
}

// Tornar função global para o HTML
window.removerItem = removerItem;

// Configurar botão adicionar item
document.addEventListener('DOMContentLoaded', () => {
  const btnAdicionar = document.getElementById('adicionarItemBtn');
  if (btnAdicionar) {
    btnAdicionar.addEventListener('click', adicionarItem);
    // Adicionar primeiro item automaticamente
    adicionarItem();
  }
});

