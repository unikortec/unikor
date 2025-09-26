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
