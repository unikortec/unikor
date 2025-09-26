// app/pedidos/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc,
  setDoc,
  getDoc,
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBuUQsB7AohqjzqJlTD3AvLwD5EbKjJVqU",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "484386062712",
  appId: "1:484386062712:web:c8e5b6b4e7e9a3a7c8a6e7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Tenant ID fixo para app pedidos
export const TENANT_ID = "serranobrecarnes.com.br";

// Cache para evitar consultas desnecessárias
let clientesCache = null;
let produtosCache = null;
let pedidoAtualId = null; // Para evitar salvar o mesmo pedido múltiplas vezes

// Funções para acessar dados do usuário logado (vêm do auth-guard)
export function getCurrentUser() {
  return auth.currentUser;
}

export function isLoggedIn() {
  return auth.currentUser !== null;
}

// Verificar se usuário tem acesso ao tenant
export async function hasAccessToTenant() {
  const user = getCurrentUser();
  if (!user) return false;
  
  try {
    const tokenResult = await user.getIdTokenResult(true);
    const userTenantId = tokenResult.claims.tenantId;
    const userRole = tokenResult.claims.role;
    
    return (userTenantId === TENANT_ID || userRole === "master");
  } catch (error) {
    console.error("Erro ao verificar acesso ao tenant:", error);
    return false;
  }
}

// ===== FUNÇÕES DE CLIENTES =====

// Gerar ID único para cliente baseado no nome (normalizado)
function gerarIdCliente(nomeCliente) {
  return nomeCliente
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9]/g, "_") // Substitui caracteres especiais por _
    .replace(/_+/g, "_") // Remove _ duplicados
    .replace(/^_|_$/g, ""); // Remove _ do início e fim
}

// Salvar/atualizar cliente (evita duplicatas)
export async function salvarCliente(dadosCliente) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    const clienteId = `${TENANT_ID}_${gerarIdCliente(dadosCliente.nome)}`;
    const clienteRef = doc(db, "clientes", clienteId);
    
    // Verifica se cliente já existe
    const clienteExistente = await getDoc(clienteRef);
    
    const agora = serverTimestamp();
    const clienteComMetadata = {
      ...dadosCliente,
      tenantId: TENANT_ID,
      atualizadoEm: agora,
      atualizadoPor: user.uid
    };

    if (clienteExistente.exists()) {
      // Cliente existe - apenas atualiza dados
      await setDoc(clienteRef, clienteComMetadata, { merge: true });
      console.log("Cliente atualizado:", clienteId);
    } else {
      // Cliente novo - adiciona metadata de criação
      clienteComMetadata.criadoEm = agora;
      clienteComMetadata.criadoPor = user.uid;
      await setDoc(clienteRef, clienteComMetadata);
      console.log("Cliente criado:", clienteId);
    }

    // Limpa cache para recarregar na próxima consulta
    clientesCache = null;
    
    return clienteId;
  } catch (error) {
    console.error("Erro ao salvar cliente:", error);
    throw error;
  }
}

// Buscar clientes do tenant (com cache)
export async function buscarClientes(forceReload = false) {
  try {
    if (clientesCache && !forceReload) {
      return clientesCache;
    }

    const q = query(
      collection(db, "clientes"),
      where("tenantId", "==", TENANT_ID),
      orderBy("atualizadoEm", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const clientes = [];
    
    querySnapshot.forEach((doc) => {
      clientes.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    clientesCache = clientes;
    return clientes;
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return clientesCache || [];
  }
}

// ===== FUNÇÕES DE PRODUTOS =====

// Salvar/atualizar produto com preço mais recente
export async function salvarProduto(dadosProduto) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    // ID único baseado no nome do produto
    const produtoId = `${TENANT_ID}_${gerarIdCliente(dadosProduto.nome)}`;
    const produtoRef = doc(db, "produtos", produtoId);
    
    const produtoExistente = await getDoc(produtoRef);
    const agora = serverTimestamp();
    
    let produtoComMetadata = {
      nome: dadosProduto.nome,
      ultimoPreco: dadosProduto.preco || 0,
      tenantId: TENANT_ID,
      atualizadoEm: agora,
      atualizadoPor: user.uid
    };

    if (produtoExistente.exists()) {
      // Produto existe - atualiza apenas o último preço se fornecido
      const dados = produtoExistente.data();
      produtoComMetadata = {
        ...dados,
        ...produtoComMetadata
      };
      
      // Mantém histórico de preços
      if (dadosProduto.preco && dadosProduto.preco !== dados.ultimoPreco) {
        produtoComMetadata.historicoPrecos = dados.historicoPrecos || [];
        produtoComMetadata.historicoPrecos.push({
          preco: dados.ultimoPreco,
          data: dados.atualizadoEm
        });
        // Mantém apenas os últimos 10 preços
        if (produtoComMetadata.historicoPrecos.length > 10) {
          produtoComMetadata.historicoPrecos = produtoComMetadata.historicoPrecos.slice(-10);
        }
      }
      
      await setDoc(produtoRef, produtoComMetadata, { merge: true });
      console.log("Produto atualizado:", produtoId);
    } else {
      // Produto novo
      produtoComMetadata.criadoEm = agora;
      produtoComMetadata.criadoPor = user.uid;
      produtoComMetadata.historicoPrecos = [];
      await setDoc(produtoRef, produtoComMetadata);
      console.log("Produto criado:", produtoId);
    }

    // Limpa cache
    produtosCache = null;
    
    return produtoId;
  } catch (error) {
    console.error("Erro ao salvar produto:", error);
    throw error;
  }
}

// Buscar produtos do tenant (com cache e últimos preços)
export async function buscarProdutos(forceReload = false) {
  try {
    if (produtosCache && !forceReload) {
      return produtosCache;
    }

    const q = query(
      collection(db, "produtos"),
      where("tenantId", "==", TENANT_ID),
      orderBy("atualizadoEm", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const produtos = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      produtos.push({
        id: doc.id,
        nome: data.nome,
        ultimoPreco: data.ultimoPreco || 0,
        historicoPrecos: data.historicoPrecos || [],
        ...data
      });
    });
    
    produtosCache = produtos;
    return produtos;
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return produtosCache || [];
  }
}

// ===== FUNÇÕES DE PEDIDOS =====

// Gerar hash único do pedido para evitar duplicatas
function gerarHashPedido(dadosPedido) {
  const chave = JSON.stringify({
    cliente: dadosPedido.cliente?.nome,
    itens: dadosPedido.itens?.map(i => `${i.produto}_${i.quantidade}_${i.preco}`),
    total: dadosPedido.total,
    entrega: dadosPedido.entrega
  });
  
  // Hash simples baseado no conteúdo
  let hash = 0;
  for (let i = 0; i < chave.length; i++) {
    const char = chave.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Converte para 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Salvar pedido (evita duplicatas)
export async function salvarPedido(dadosPedido) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    // Gera hash único do pedido
    const hashPedido = gerarHashPedido(dadosPedido);
    
    // Se já salvou este pedido na sessão atual, não salva novamente
    if (pedidoAtualId === hashPedido) {
      console.log("Pedido já foi salvo nesta sessão:", hashPedido);
      return pedidoAtualId;
    }

    const pedidoComMetadata = {
      ...dadosPedido,
      hashPedido,
      tenantId: TENANT_ID,
      criadoPor: user.uid,
      criadoEm: serverTimestamp(),
      status: "novo"
    };

    const docRef = await addDoc(collection(db, "pedidos"), pedidoComMetadata);
    console.log("Pedido salvo com ID:", docRef.id);
    
    // Armazena o hash para evitar duplicatas na sessão
    pedidoAtualId = hashPedido;
    
    // Salva/atualiza dados do cliente automaticamente
    if (dadosPedido.cliente) {
      await salvarCliente(dadosPedido.cliente);
    }
    
    // Salva/atualiza produtos automaticamente
    if (dadosPedido.itens) {
      for (const item of dadosPedido.itens) {
        if (item.produto && item.preco) {
          await salvarProduto({
            nome: item.produto,
            preco: parseFloat(item.preco) || 0
          });
        }
      }
    }
    
    return docRef.id;
  } catch (error) {
    console.error("Erro ao salvar pedido:", error);
    throw error;
  }
}

// Resetar pedido atual (chamar ao iniciar novo pedido)
export function resetarPedidoAtual() {
  pedidoAtualId = null;
  console.log("Pedido atual resetado - próximo será salvo normalmente");
}

// Buscar pedidos do cliente
export async function buscarPedidosCliente(nomeCliente, limiteResultados = 5) {
  try {
    const q = query(
      collection(db, "pedidos"),
      where("tenantId", "==", TENANT_ID),
      where("cliente.nome", "==", nomeCliente),
      orderBy("criadoEm", "desc"),
      limit(limiteResultados)
    );
    
    const querySnapshot = await getDocs(q);
    const pedidos = [];
    
    querySnapshot.forEach((doc) => {
      pedidos.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return pedidos;
  } catch (error) {
    console.error("Erro ao buscar pedidos do cliente:", error);
    return [];
  }
}

// Verificar se está online (para mostrar/ocultar banner offline)
export async function verificarConexao() {
  try {
    const q = query(collection(db, "clientes"), limit(1));
    await getDocs(q);
    return true;
  } catch (error) {
    console.error("Offline ou erro de conexão:", error);
    return false;
  }
}

// Limpar caches (útil para forçar reload)
export function limparCaches() {
  clientesCache = null;
  produtosCache = null;
  console.log("Caches limpos");
}
