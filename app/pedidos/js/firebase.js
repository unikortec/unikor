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
let pedidoAtualId = null;

// Funções para acessar dados do usuário logado
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

// ===== HELPERS PARA CAMINHOS CORRETOS =====

// Retorna a referência correta para a coleção dentro do tenant
function getTenantCollection(collectionName) {
  return collection(db, `tenants/${TENANT_ID}/${collectionName}`);
}

// Retorna a referência correta para um documento dentro do tenant
function getTenantDoc(collectionName, docId) {
  return doc(db, `tenants/${TENANT_ID}/${collectionName}`, docId);
}

// Gerar ID único normalizado
function gerarIdNormalizado(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9]/g, "_") // Substitui caracteres especiais por _
    .replace(/_+/g, "_") // Remove _ duplicados
    .replace(/^_|_$/g, ""); // Remove _ do início e fim
}

// ===== FUNÇÕES DE CLIENTES =====

// Salvar/atualizar cliente (dentro de /tenants/{tenantId}/clientes/)
export async function salvarCliente(dadosCliente) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    const clienteId = gerarIdNormalizado(dadosCliente.nome);
    const clienteRef = getTenantDoc("clientes", clienteId);
    
    // Verifica se cliente já existe
    const clienteExistente = await getDoc(clienteRef);
    
    const agora = serverTimestamp();
    const clienteComMetadata = {
      ...dadosCliente,
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

// Buscar clientes do tenant
export async function buscarClientes(forceReload = false) {
  try {
    if (clientesCache && !forceReload) {
      return clientesCache;
    }

    const clientesCollection = getTenantCollection("clientes");
    const q = query(clientesCollection, orderBy("atualizadoEm", "desc"));
    
    const querySnapshot = await getDocs(q);
    const clientes = [];
    
    querySnapshot.forEach((doc) => {
      clientes.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    clientesCache = clientes;
    console.log(`${clientes.length} clientes carregados do tenant ${TENANT_ID}`);
    return clientes;
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return clientesCache || [];
  }
}

// ===== FUNÇÕES DE PRODUTOS =====

// Salvar/atualizar produto com histórico de preços
export async function salvarProduto(dadosProduto) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    const produtoId = gerarIdNormalizado(dadosProduto.nome);
    const produtoRef = getTenantDoc("clientes", "produtos"); // Como está dentro de clientes nas regras
    
    // Para produtos, vamos usar a subcoleção produtos dentro de um cliente "geral"
    // Ou criar uma coleção separada se as regras permitem
    const produtoGeralRef = doc(db, `tenants/${TENANT_ID}/clientes/produtos/produtos`, produtoId);
    
    const produtoExistente = await getDoc(produtoGeralRef);
    const agora = serverTimestamp();
    
    let produtoComMetadata = {
      nome: dadosProduto.nome,
      ultimoPreco: dadosProduto.preco || 0,
      atualizadoEm: agora,
      atualizadoPor: user.uid
    };

    if (produtoExistente.exists()) {
      const dados = produtoExistente.data();
      produtoComMetadata = {
        ...dados,
        ...produtoComMetadata
      };
      
      // Salva histórico de preços
      if (dadosProduto.preco && dadosProduto.preco !== dados.ultimoPreco) {
        // Salva no histórico de preços (coleção separada conforme regras)
        await salvarHistoricoPreco(dadosProduto.nome, dadosProduto.preco, dados.ultimoPreco);
      }
      
      await setDoc(produtoGeralRef, produtoComMetadata, { merge: true });
      console.log("Produto atualizado:", produtoId);
    } else {
      produtoComMetadata.criadoEm = agora;
      produtoComMetadata.criadoPor = user.uid;
      await setDoc(produtoGeralRef, produtoComMetadata);
      console.log("Produto criado:", produtoId);
    }

    produtosCache = null;
    return produtoId;
  } catch (error) {
    console.error("Erro ao salvar produto:", error);
    // Se der erro com subcoleção, vamos usar uma abordagem mais simples
    return await salvarProdutoSimples(dadosProduto);
  }
}

// Versão simplificada que salva produtos no histórico de preços
async function salvarProdutoSimples(dadosProduto) {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado");

    // Salva no histórico de preços diretamente
    await salvarHistoricoPreco(dadosProduto.nome, dadosProduto.preco);
    
    return gerarIdNormalizado(dadosProduto.nome);
  } catch (error) {
    console.error("Erro ao salvar produto simples:", error);
    throw error;
  }
}

// Salvar no histórico de preços (conforme regras)
async function salvarHistoricoPreco(nomeProduto, precoNovo, precoAnterior = null) {
  try {
    const user = getCurrentUser();
    if (!user) return;

    const historicoRef = getTenantCollection("historico_precos");
    
    const dadosHistorico = {
      produto: nomeProduto,
      preco: precoNovo,
      precoAnterior: precoAnterior,
      criadoEm: serverTimestamp(),
      criadoPor: user.uid
    };

    await addDoc(historicoRef, dadosHistorico);
    console.log("Histórico de preço salvo para:", nomeProduto);
  } catch (error) {
    console.error("Erro ao salvar histórico de preço:", error);
  }
}

// Buscar produtos únicos do histórico de preços
export async function buscarProdutos(forceReload = false) {
  try {
    if (produtosCache && !forceReload) {
      return produtosCache;
    }

    const historicoCollection = getTenantCollection("historico_precos");
    const q = query(historicoCollection, orderBy("criadoEm", "desc"));
    
    const querySnapshot = await getDocs(q);
    const produtosMap = new Map();
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const produto = data.produto;
      
      // Mantém apenas o mais recente de cada produto
      if (!produtosMap.has(produto)) {
        produtosMap.set(produto, {
          id: gerarIdNormalizado(produto),
          nome: produto,
          ultimoPreco: data.preco || 0,
          ultimaAtualizacao: data.criadoEm
        });
      }
    });
    
    produtosCache = Array.from(produtosMap.values());
    console.log(`${produtosCache.length} produtos únicos carregados`);
    return produtosCache;
  } catch (error) {
    console.error("Erro ao buscar produtos:", error);
    return produtosCache || [];
  }
}

// ===== FUNÇÕES DE PEDIDOS =====

// Gerar hash único do pedido
function gerarHashPedido(dadosPedido) {
  const chave = JSON.stringify({
    cliente: dadosPedido.cliente?.nome,
    itens: dadosPedido.itens?.map(i => `${i.produto}_${i.quantidade}_${i.preco}`),
    total: dadosPedido.total,
    entrega: dadosPedido.entrega
  });
  
  let hash = 0;
  for (let i = 0; i < chave.length; i++) {
    const char = chave.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Salvar pedido na estrutura correta
export async function salvarPedido(dadosPedido) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    const hashPedido = gerarHashPedido(dadosPedido);
    
    if (pedidoAtualId === hashPedido) {
      console.log("Pedido já foi salvo nesta sessão:", hashPedido);
      return pedidoAtualId;
    }

    const pedidoComMetadata = {
      ...dadosPedido,
      hashPedido,
      criadoPor: user.uid,
      criadoEm: serverTimestamp(),
      status: "novo"
    };

    const pedidosCollection = getTenantCollection("pedidos");
    const docRef = await addDoc(pedidosCollection, pedidoComMetadata);
    console.log("Pedido salvo com ID:", docRef.id);
    
    pedidoAtualId = hashPedido;
    
    // Salva cliente e produtos automaticamente
    if (dadosPedido.cliente) {
      await salvarCliente(dadosPedido.cliente);
    }
    
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

// Resetar pedido atual
export function resetarPedidoAtual() {
  pedidoAtualId = null;
  console.log("Pedido atual resetado");
}

// Buscar pedidos do cliente
export async function buscarPedidosCliente(nomeCliente, limiteResultados = 5) {
  try {
    const pedidosCollection = getTenantCollection("pedidos");
    const q = query(
      pedidosCollection,
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

// Verificar conexão
export async function verificarConexao() {
  try {
    const clientesCollection = getTenantCollection("clientes");
    const q = query(clientesCollection, limit(1));
    await getDocs(q);
    return true;
  } catch (error) {
    console.error("Offline ou erro de conexão:", error);
    return false;
  }
}

// Limpar caches
export function limparCaches() {
  clientesCache = null;
  produtosCache = null;
  console.log("Caches limpos");
}
