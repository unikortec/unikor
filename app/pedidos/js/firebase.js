// /app/pedidos/js/firebase.js
// =============================================================
// 🔹 Reaproveita o MESMO app/auth da raiz (sessão única no portal)
// =============================================================
import { app as rootApp, auth as rootAuth } from '/js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// =============================================================
// 🔹 Firestore + utilitários necessários (agora com startAt e endAt)
// =============================================================
import {
  getFirestore,
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc,
  startAt, endAt
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// =============================================================
// 🔹 Storage (para upload de PDFs, relatórios, etc.)
// =============================================================
import { getStorage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

// =============================================================
// 🔹 Reexports úteis (para manter compatibilidade entre módulos)
// =============================================================
export {
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc,
  startAt, endAt
};

// =============================================================
// 🔹 App/Auth/DB compartilhados
// =============================================================
export const app  = rootApp;   // <- export explícito (evita erro de “app”)
export const auth = rootAuth;
export const db   = getFirestore(app);
export const storage = getStorage(app);

// =============================================================
// 🔹 Tenant padrão (multi-tenant UNIKOR / Serra Nobre)
// =============================================================
export const TENANT_FIXED = "serranobrecarnes.com.br";
/* >>> Compat com módulos antigos (ex.: clientes.js) */
export const TENANT_ID = TENANT_FIXED;

let cachedTenantId = TENANT_FIXED;

/**
 * Retorna o tenantId atual do usuário logado.
 * Caso o token não tenha claim `tenantId`, usa o fixo.
 */
export async function getTenantId() {
  const u = getCurrentUser();
  if (!u) return TENANT_FIXED;
  try {
    const t = await u.getIdTokenResult(true);
    cachedTenantId = t.claims?.tenantId || TENANT_FIXED;
  } catch {
    cachedTenantId = TENANT_FIXED;
  }
  return cachedTenantId;
}

// =============================================================
// 🔹 AUTH BUS (controle de login e listeners centralizados)
// =============================================================
let currentUser = null;
const subs = new Set();
const waiters = new Set();

let _init = false;
let _resolveReady;
export const authReady = new Promise(res => (_resolveReady = res));

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  console.log("[PEDIDOS] Auth:", currentUser ? `Logado (${currentUser.email || currentUser.uid})` : "Não logado");

  if (!_init) {
    _init = true;
    try { _resolveReady(currentUser); } catch {}
  }

  // Atualiza listeners ativos
  subs.forEach(fn => { try { fn(currentUser); } catch {} });

  // Libera promessas pendentes
  if (currentUser) {
    waiters.forEach(r => { try { r(currentUser); } catch {} });
    waiters.clear();
  }
});

// =============================================================
// 🔹 API pública de autenticação / estado
// =============================================================
export function onAuthUser(cb) {
  if (typeof cb === 'function') {
    subs.add(cb);
    cb(currentUser);
    return () => subs.delete(cb);
  }
  return () => {};
}

export function getCurrentUser() { return currentUser; }
export function isLoggedIn() { return !!currentUser; }

export function waitForLogin() {
  return currentUser ? Promise.resolve(currentUser) : new Promise(r => waiters.add(r));
}

// =============================================================
// 🔹 Helpers de path multi-tenant
// =============================================================
export const colTenants = (name, tenantId) =>
  collection(db, "tenants", tenantId || cachedTenantId || TENANT_FIXED, name);

export const docTenants = (name, id, tenantId) =>
  doc(db, "tenants", tenantId || cachedTenantId || TENANT_FIXED, name, id);