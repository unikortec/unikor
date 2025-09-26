// app/pedidos/js/firebase.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
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

// Evita duplicação do Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

// Tenant ID fixo para app pedidos
export const TENANT_ID = "serranobrecarnes.com.br";

// Cache e controles
let clientesCache = null;
let produtosCache = null;
let pedidoAtualId = null;
let authInitialized = false;

// Promise para aguardar autenticação
export const authReady = new Promise((resolve) => {
  if (authInitialized) {
    resolve(auth.currentUser);
    return;
  }

  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!authInitialized) {
      authInitialized = true;
      console.log("Firebase Auth inicializado:", user ? "Logado" : "Não logado");
      resolve(user);
      unsubscribe();
    }
  });
});

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

function getTenantCollection(collectionName) {
  return collection(db, `tenants/${TENANT_ID}/${collectionName}`);
}

function getTenantDoc(collectionName, docId) {
  return doc(db, `tenants/${TENANT_ID}/${collectionName}`, docId);
}

function gerarIdNormalizado(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ===== FUNÇÕES DE CLIENTES =====

export async function salvarCliente(dadosCliente) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    const clienteId = gerarIdNormalizado(dadosCliente.nome);
    const clienteRef = getTenantDoc("clientes", clienteId);
    
    const clienteExistente = await getDoc(clienteRef);
    const agora = serverTimestamp();
    
    const clienteComMetadata = {
      ...dadosCliente,
      atualizadoEm: agora,
      atualizadoPor: user.uid
    };

    if (clienteExistente.exists()) {
      await setDoc(clienteRef, clienteComMetadata, { merge: true });
      console.log("Cliente atualizado:", clienteId);
    } else {
      clienteComMetadata.criadoEm = agora;
      clienteComMetadata.criadoPor = user.uid;
      await setDoc(clienteRef, clienteComMetadata);
      console.log("Cliente criado:", clienteId);
    }

    clientesCache = null;
    return clienteId;
  } catch (error) {
    console.error("Erro ao salvar cliente:", error);
    throw error;
  }
}

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
    console.log(`${clientes.length} clientes carregados`);
    return clientes;
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return clientesCache || [];
  }
}

// ===== FUNÇÕES DE PRODUTOS =====

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
    console.log("Histórico de preço salvo:", nomeProduto, "R$", precoNovo);
  } catch (error) {
    console.error("Erro ao salvar histórico de preço:", error);
  }
}

export async function salvarProduto(dadosProduto) {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("Usuário não autenticado");
    }

    await salvarHistoricoPreco(dadosProduto.nome, dadosProduto.preco);
    produtosCache = null;
    
    return gerarIdNormalizado(dadosProduto.nome);
  } catch (error) {
    console.error("Erro ao salvar produto:", error);
    throw error;
  }
}

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

export function resetarPedidoAtual() {
  pedidoAtualId = null;
  console.log("Pedido atual resetado");
}

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

export function limparCaches() {
  clientesCache = null;
  produtosCache = null;
  console.log("Caches limpos");
}

// Detectar mudanças no estado de autenticação
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("Usuário logado:", user.email);
    // Remove banner offline se estiver online
    verificarConexao().then(online => {
      const banner = document.querySelector('.offline-banner');
      if (banner && online) {
        banner.style.display = 'none';
      }
    });
  } else {
    console.log("Usuário não logado");
    // Limpa caches quando deslogado
    limparCaches();
  }
});
