// /app/pedidos/js/firebase.js
// Reaproveita o MESMO app/auth da raiz (sessão única no portal)
import { app as rootApp, auth as rootAuth } from '/js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// 🔹 NOVO: Storage (para upload de PDFs)
import { getStorage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

/* ========= Reexports úteis ========= */
export {
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc
};

/* ========= App/Auth/DB compartilhados ========= */
export const app  = rootApp;   // <- export explícito (evita o erro “app”)
export const auth = rootAuth;
export const db   = getFirestore(app);
export const storage = getStorage(app); // 🔹 NOVO

/* ========= Tenant ========= */
export const TENANT_FIXED = "serranobrecarnes.com.br";
/* >>> Compat com módulos antigos (ex.: clientes.js) */
export const TENANT_ID = TENANT_FIXED;

let cachedTenantId = TENANT_FIXED;
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

/* ========= AUTH BUS ========= */
let currentUser = null;
const subs = new Set();
const waiters = new Set();

let _init = false;
let _resolveReady;
export const authReady = new Promise(res => (_resolveReady = res));

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  console.log("[PEDIDOS] Auth:", currentUser ? `Logado (${currentUser.email || currentUser.uid})` : "Não logado");

  if (!_init) { _init = true; try { _resolveReady(currentUser); } catch {} }
  subs.forEach(fn => { try { fn(currentUser); } catch {} });
  if (currentUser) { waiters.forEach(r => { try { r(currentUser); } catch {} }); waiters.clear(); }
});

// API pública
export function onAuthUser(cb){ if (typeof cb === 'function'){ subs.add(cb); cb(currentUser); return ()=>subs.delete(cb); } return ()=>{}; }
export function getCurrentUser(){ return currentUser; }
export function isLoggedIn(){ return !!currentUser; }
export function waitForLogin(){ return currentUser ? Promise.resolve(currentUser) : new Promise(r => waiters.add(r)); }

/* ========= Helpers de path ========= */
export const colTenants = (name, tenantId) =>
  collection(db, "tenants", tenantId || cachedTenantId || TENANT_FIXED, name);
export const docTenants = (name, id, tenantId) =>
  doc(db, "tenants", tenantId || cachedTenantId || TENANT_FIXED, name, id);