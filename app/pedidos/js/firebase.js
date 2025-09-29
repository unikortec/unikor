// /app/pedidos/js/firebase.js
// Usa o MESMO app/auth da raiz (sessão única no portal)
import { app as rootApp, auth as rootAuth } from '/js/firebase.js';

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Reexport helpers p/ outros módulos
export {
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc
};

// ===== App/Auth/DB compartilhados =====
export const auth = rootAuth;
export const db   = getFirestore(rootApp);

// ===== Tenant do app Pedidos =====
export const TENANT_ID = "serranobrecarnes.com.br";

/* ===================== AUTH BUS ===================== */
let currentUser = null;
const subs = new Set();
const pendingLoginWaiters = new Set();

let _authInitialized = false;
let _resolveAuthReady;
export const authReady = new Promise((resolve) => { _resolveAuthReady = resolve; });

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  console.log("Firebase Auth (Pedidos):", currentUser ? `Logado (${currentUser.email || currentUser.uid})` : "Não logado");

  if (!_authInitialized) {
    _authInitialized = true;
    try { _resolveAuthReady(currentUser); } catch {}
  }

  subs.forEach(fn => { try { fn(currentUser); } catch {} });

  if (currentUser) {
    pendingLoginWaiters.forEach(resolve => { try { resolve(currentUser); } catch {} });
    pendingLoginWaiters.clear();
  }
});

// API pública de auth
export function onAuthUser(cb){
  if (typeof cb === 'function') { subs.add(cb); cb(currentUser); return ()=>subs.delete(cb); }
  return ()=>{};
}
export function getCurrentUser(){ return currentUser; }
export function isLoggedIn(){ return !!currentUser; }
export function waitForLogin(){
  if (currentUser) return Promise.resolve(currentUser);
  return new Promise((resolve) => { pendingLoginWaiters.add(resolve); });
}

// Claims opcionais (tenant/role) — útil para checagens em UI
export async function hasAccessToTenant() {
  const user = getCurrentUser();
  if (!user) return false;
  try {
    const tokenResult = await user.getIdTokenResult(true);
    const userTenantId = tokenResult.claims.tenantId;
    const userRole = tokenResult.claims.role;
    return (userTenantId === TENANT_ID || userRole === "master");
  } catch (e) {
    console.error("Erro ao verificar acesso ao tenant:", e);
    return false;
  }
}

/* ===================== HELPERS DE PATH ===================== */
const colPath = (name) => collection(db, "tenants", TENANT_ID, name);
const getDocPath = (name, id) => doc(db, "tenants", TENANT_ID, name, id);

function gerarIdNormalizado(nome) {
  return String(nome || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
const up = (s)=> String(s||"").toUpperCase();
const onlyDigits = (s)=> String(s||"").replace(/\D+/g,'');

/* ============ METADATA p/ atender às rules ============ */
function baseMetaForWrite(extra={}) {
  const u = getCurrentUser();
  if (!u) throw new Error("Usuário não autenticado.");
  return {
    tenantId: TENANT_ID,
    updatedBy: u.uid,
    atualizadoEm: serverTimestamp(),
    ...extra, // você pode injetar createdBy/criadoEm no create
  };
}

/* ===================== CLIENTES ===================== */
export async function salvarCliente(dadosCliente) {
  await authReady;
  const u = getCurrentUser(); if (!u) throw new Error("Usuário não autenticado.");

  const id = gerarIdNormalizado(dadosCliente.nome || dadosCliente.nomeUpper || "");
  if (!id) throw new Error("Nome do cliente é obrigatório.");

  const ref = getDocPath("clientes", id);
  const snap = await getDoc(ref);
  const nowCreateMeta = { createdBy: u.uid, criadoEm: serverTimestamp() };

  const payload = {
    // dados principais
    nome: up(dadosCliente.nome || ""),
    nomeUpper: up(dadosCliente.nome || ""),
    nomeNormalizado: gerarIdNormalizado(dadosCliente.nome || ""),
    endereco: up(dadosCliente.endereco || ""),
    isentoFrete: !!dadosCliente.isentoFrete,
    cnpj: onlyDigits(dadosCliente.cnpj) || "",
    ie: up(dadosCliente.ie || ""),
    cep: onlyDigits(dadosCliente.cep) || "",
    contato: onlyDigits(dadosCliente.contato) || "",
    lastFrete: typeof dadosCliente.lastFrete === 'number' ? dadosCliente.lastFrete : null,

    // metadata exigida nas rules
    ...(snap.exists()
      ? baseMetaForWrite()
      : { ...baseMetaForWrite(nowCreateMeta), compras: 0 }
    ),
  };

  await setDoc(ref, payload, { merge: true });
  return id;
}

export async function buscarClientes(force=false){
  if (!isLoggedIn()) return [];
  const qy = query(colPath("clientes"), orderBy("atualizadoEm", "desc"), limit(200));
  const qs = await getDocs(qy);
  const out = [];
  qs.forEach(d=> out.push({ id: d.id, ...d.data() }));
  return out;
}

/* ============ HISTÓRICO DE PREÇOS (append-only) ============ */
export async function salvarHistoricoPreco(nomeProduto, precoNovo, precoAnterior=null, clienteNome=null){
  await authReady;
  const u = getCurrentUser(); if (!u) throw new Error("Usuário não autenticado.");

  const ref = colPath("historico_precos");
  const payload = {
    tenantId: TENANT_ID,
    produto: String(nomeProduto||"").trim(),
    preco: Number(precoNovo)||0,
    precoAnterior: (precoAnterior!=null)? Number(precoAnterior): null,
    cliente: clienteNome ? up(clienteNome) : null,
    createdBy: u.uid,
    updatedBy: u.uid,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };
  await addDoc(ref, payload);
}

export async function buscarProdutos(force=false){
  // monta a lista de produtos pelo histórico (último preço por produto)
  const qy = query(colPath("historico_precos"), orderBy("criadoEm", "desc"), limit(1000));
  const qs = await getDocs(qy);
  const map = new Map();
  qs.forEach(d=>{
    const x = d.data(); const p = x.produto;
    if (!map.has(p)) map.set(p, { id: gerarIdNormalizado(p), nome: p, ultimoPreco: x.preco||0, ultimaAtualizacao: x.criadoEm });
  });
  return Array.from(map.values());
}

/* ===================== PEDIDOS ===================== */
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

let pedidoAtualHash = null;

export async function salvarPedido(dadosPedido) {
  await authReady;
  const u = getCurrentUser(); if (!u) throw new Error("Usuário não autenticado.");

  const hashPedido = gerarHashPedido(dadosPedido);
  if (pedidoAtualHash === hashPedido) {
    console.log("Pedido já foi salvo nesta sessão:", hashPedido);
    return hashPedido;
  }

  const ref = colPath("pedidos");
  const payload = {
    tenantId: TENANT_ID,
    ...dadosPedido,
    status: dadosPedido.status || "novo",
    hashPedido,

    createdBy: u.uid,
    updatedBy: u.uid,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };

  const docRef = await addDoc(ref, payload);
  pedidoAtualHash = hashPedido;

  // “upsert” de cliente e histórico de preço dos itens
  if (dadosPedido.cliente && dadosPedido.cliente.nome) {
    await salvarCliente({
      ...dadosPedido.cliente,
      lastFrete: typeof dadosPedido.frete === 'number' ? dadosPedido.frete : null
    });
  }
  if (Array.isArray(dadosPedido.itens)) {
    for (const it of dadosPedido.itens) {
      if (it?.produto && (it?.preco || it?.preco === 0)) {
        await salvarHistoricoPreco(it.produto, Number(it.preco)||0, null, dadosPedido?.cliente?.nome || null);
      }
    }
  }

  return docRef.id;
}

export function resetarPedidoAtual() {
  pedidoAtualHash = null;
  console.log("Pedido atual resetado");
}

export async function buscarPedidosCliente(nomeCliente, limiteResultados = 5) {
  if (!nomeCliente) return [];
  const qy = query(
    colPath("pedidos"),
    where("cliente.nome", "==", up(nomeCliente)),
    orderBy("criadoEm", "desc"),
    limit(limiteResultados)
  );
  const qs = await getDocs(qy);
  const out = [];
  qs.forEach(d=> out.push({ id:d.id, ...d.data() }));
  return out;
}

/* ===================== CONEXÃO / CACHES ===================== */
export async function verificarConexao() {
  try {
    const qy = query(colPath("clientes"), limit(1));
    await getDocs(qy);
    return true;
  } catch (e) {
    console.error("Offline ou erro de conexão:", e);
    return false;
  }
}

let clientesCache = null;
let produtosCache = null;
export function limparCaches() {
  clientesCache = null;
  produtosCache = null;
  console.log("Caches limpos");
}

// limpa caches ao deslogar
onAuthUser((u)=>{ if (!u) limparCaches(); });