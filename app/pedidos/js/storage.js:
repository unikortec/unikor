console.log('Storage carregado');

// Chaves do localStorage
const KEYS = {
  CLIENTES: 'pedidos_clientes',
  PRODUTOS: 'pedidos_produtos',
  PEDIDOS: 'pedidos_salvos',
  CONFIG: 'pedidos_config'
};

// Funções de clientes
export function salvarCliente(cliente) {
  try {
    const clientes = carregarClientes();
    const index = clientes.findIndex(c => c.id === cliente.id);
    
    if (index >= 0) {
      clientes[index] = cliente;
    } else {
      cliente.id = Date.now().toString();
      clientes.push(cliente);
    }
    
    localStorage.setItem(KEYS.CLIENTES, JSON.stringify(clientes));
    return cliente;
  } catch (error) {
    console.error('Erro ao salvar cliente:', error);
    throw error;
  }
}

export function carregarClientes() {
  try {
    const data = localStorage.getItem(KEYS.CLIENTES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Erro ao carregar clientes:', error);
    return [];
  }
}

export function excluirCliente(id) {
  try {
    const clientes = carregarClientes();
    const novosClientes = clientes.filter(c => c.id !== id);
    localStorage.setItem(KEYS.CLIENTES, JSON.stringify(novosClientes));
    return true;
  } catch (error) {
    console.error('Erro ao excluir cliente:', error);
    return false;
  }
}

// Funções de produtos
export function salvarProduto(produto) {
  try {
    const produtos = carregarProdutos();
    const index = produtos.findIndex(p => p.id === produto.id);
    
    if (index >= 0) {
      produtos[index] = produto;
    } else {
      produto.id = Date.now().toString();
      produtos.push(produto);
    }
    
    localStorage.setItem(KEYS.PRODUTOS, JSON.stringify(produtos));
    return produto;
  } catch (error) {
    console.error('Erro ao salvar produto:', error);
    throw error;
  }
}

export function carregarProdutos() {
  try {
    const data = localStorage.getItem(KEYS.PRODUTOS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Erro ao carregar produtos:', error);
    return [];
  }
}

export function excluirProduto(id) {
  try {
    const produtos = carregarProdutos();
    const novosProdutos = produtos.filter(p => p.id !== id);
    localStorage.setItem(KEYS.PRODUTOS, JSON.stringify(novosProdutos));
    return true;
  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    return false;
  }
}

// Funções de pedidos
export function salvarPedido(pedido) {
  try {
    const pedidos = carregarPedidos();
    const index = pedidos.findIndex(p => p.id === pedido.id);
    
    if (index >= 0) {
      pedidos[index] = pedido;
    } else {
      pedido.id = Date.now().toString();
      pedido.dataCriacao = new Date().toISOString();
    }
    
    localStorage.setItem(KEYS.PEDIDOS, JSON.stringify(pedidos));
    return pedido;
  } catch (error) {
    console.error('Erro ao salvar pedido:', error);
    throw error;
  }
}

export function carregarPedidos() {
  try {
    const data = localStorage.getItem(KEYS.PEDIDOS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Erro ao carregar pedidos:', error);
    return [];
  }
}

export function excluirPedido(id) {
  try {
    const pedidos = carregarPedidos();
    const novosPedidos = pedidos.filter(p => p.id !== id);
    localStorage.setItem(KEYS.PEDIDOS, JSON.stringify(novosPedidos));
    return true;
  } catch (error) {
    console.error('Erro ao excluir pedido:', error);
    return false;
  }
}

console.log('Storage configurado');
