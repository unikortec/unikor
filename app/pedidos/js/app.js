import './auth-guard.js';
import './modal-cliente.js';
import { gerarPDF, compartilharPDF } from './pdf.js';
import { initUI } from './ui.js';
import { initState } from './state.js';

console.log('App carregado');

class PedidoApp {
  constructor() {
    this.contadorItens = 0;
    this.init();
  }

  async init() {
    try {
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
    
    console.log('Componentes inicializados');
  }

  setupEventListeners() {
    // Event delegation para todos os botões
    document.addEventListener('click', (e) => {
      const target = e.target;
      
      // Botão adicionar item
      if (target.id === 'adicionar-item' || target.closest('#adicionar-item')) {
        e.preventDefault();
        this.adicionarItem();
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

  // MÉTODOS PARA ITENS
  adicionarItem() {
    this.contadorItens++;
    const container = document.getElementById('itens-container');
    
    if (!container) {
      console.error('Container de itens não encontrado');
      return;
    }
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'item';
    itemDiv.id = `item-${this.contadorItens}`;
    
    itemDiv.innerHTML = `
      <div class="item-header">
        <h4>Item ${this.contadorItens}</h4>
        <button type="button" class="remove" onclick="app.removerItem(${this.contadorItens})">Remover</button>
      </div>
      
      <div class="field-group">
        <label>Produto/Descrição:</label>
        <input type="text" id="produto-${this.contadorItens}" class="produto" placeholder="Digite o nome do produto" required />
      </div>
      
      <div class="field-group grid-3">
        <div>
          <label>Quantidade:</label>
          <input type="number" id="quantidade-${this.contadorItens}" class="quantidade" min="0" step="0.01" placeholder="0" />
        </div>
        <div>
          <label>Peso (Kg):</label>
          <input type="number" id="peso-${this.contadorItens}" class="peso" min="0" step="0.001" placeholder="0.000" />
        </div>
        <div>
          <label>Gramatura (g):</label>
          <input type="number" id="gramatura-${this.contadorItens}" class="gramatura" min="0" placeholder="0" />
          <small class="inline-help">Se informado, peso = qtd × gramatura</small>
        </div>
      </div>
      
      <div class="field-group grid-2">
        <div>
          <label>Valor por Kg:</label>
          <input type="text" id="valor-${this.contadorItens}" class="valor" placeholder="R$ 0,00" />
        </div>
        <div>
          <label>Subtotal:</label>
          <div id="subtotal-${this.contadorItens}" class="subtotal">R$ 0,00</div>
        </div>
      </div>
      
      <div class="field-group">
        <label>Observação do item:</label>
        <textarea id="obs-${this.contadorItens}" class="obs-item" placeholder="Observações deste item..."></textarea>
      </div>
    `;
    
    container.appendChild(itemDiv);
    this.configurarCalculosItem(this.contadorItens);
    document.getElementById(`produto-${this.contadorItens}`).focus();
    this.atualizarResumo();
  }

  removerItem(id) {
    const item = document.getElementById(`item-${id}`);
    if (item) {
      item.remove();
      this.atualizarResumo();
    }
  }

  configurarCalculosItem(id) {
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
      
      this.atualizarResumo();
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

  atualizarResumo() {
    const resumoDiv = document.getElementById('resumo');
    if (!resumoDiv) return;
    
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
    const valorFrete = freteIsento ? 0 : 0;
    const totalFinal = valorTotal + valorFrete;
    
    resumoDiv.innerHTML = `
      <h3>Resumo do Pedido</h3>
      <div class="resumo-item"><span>Total de itens:</span><span>${totalItens}</span></div>
      <div class="resumo-item"><span>Peso total:</span><span>${pesoTotal.toFixed(3).replace('.', ',')} kg</span></div>
      <div class="resumo-item"><span>Subtotal itens:</span><span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal)}</span></div>
      <div class="resumo-item resumo-total"><span>TOTAL GERAL:</span><span>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFinal)}</span></div>
    `;
  }

  getItens() {
    const itens = [];
    const itemElements = document.querySelectorAll('.item');
    
    itemElements.forEach((item) => {
      const id = item.id.split('-')[1];
      const produto = document.getElementById(`produto-${id}`)?.value || '';
      const quantidade = parseFloat(document.getElementById(`quantidade-${id}`)?.value) || 0;
      const peso = parseFloat(document.getElementById(`peso-${id}`)?.value) || 0;
      const preco = parseFloat(document.getElementById(`valor-${id}`)?.value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      const obs = document.getElementById(`obs-${id}`)?.value || '';
      
      if (produto.trim()) {
        itens.push({
          produto: produto.trim(),
          quantidade,
          peso,
          preco,
          total: peso * preco,
          observacao: obs.trim()
        });
      }
    });
    
    return itens;
  }

  // MÉTODOS PARA PDF
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
        
        // Limpa itens
        const container = document.getElementById('itens-container');
        if (container) container.innerHTML = '';
        
        // Reinicia contador
        this.contadorItens = 0;
        
        // Adiciona primeiro item
        this.adicionarItem();
        
        console.log('Pedido limpo');
      } catch (error) {
        console.error('Erro ao limpar pedido:', error);
      }
    }
  }

  coletarDados() {
    try {
      const cliente = document.getElementById('cliente')?.value || '';
      const observacoes = document.getElementById('observacoes')?.value || '';
      const itens = this.getItens();
      const total = itens.reduce((sum, item) => sum + (item.total || 0), 0);
      
      const dados = {
        cliente,
        observacoes,
        itens,
        total,
        telefone: '',
        endereco: ''
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
    
    const itensInvalidos = dados.itens.filter(item => !item.produto || !item.produto.trim());
    if (itensInvalidos.length > 0) {
      alert('Por favor, preencha o produto de todos os itens');
      return false;
    }
    
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
    window.app = app; // Disponibiliza globalmente
    
    // Adiciona primeiro item automaticamente após inicialização
    setTimeout(() => {
      app.adicionarItem();
    }, 100);
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
