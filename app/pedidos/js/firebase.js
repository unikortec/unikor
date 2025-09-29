// /app/pedidos/js/firebase.js
// Reaproveita o MESMO app/auth da raiz, garantindo sessão única.
import { app as rootApp, auth as rootAuth } from '/js/firebase.js';
import {
  getFirestore,
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Usa o mesmo app/auth do portal/menu
export const auth = rootAuth;
export const db   = getFirestore(rootApp);

// Tenant fixo do Pedidos
export const TENANT_ID = "serranobrecarnes.com.br";

/* ===================== AUTH READY ===================== */
let currentUser = null;
const subs = new Set();
const pendingLoginWaiters = new Set();

let _authInitialized = false;
let _resolveAuthReady;
export const authReady = new Promise((resolve) => { _resolveAuthReady = resolve; });

// Observa mudanças da auth COMPARTILHADA
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
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
  if (typeof cb === 'function') { subs.add(cb); return ()=>subs.delete(cb); }
  return ()=>{};
}
export function getCurrentUser(){ return currentUser; }
export function isLoggedIn(){ return !!currentUser; }
export function waitForLogin(){
  if (currentUser) return Promise.resolve(currentUser);
  return new Promise((resolve) => { pendingLoginWaiters.add(resolve); });
}

// (Opcional) claims de tenant
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

// Re-export Firestore helpers (usados em outros módulos)
export {
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp,
  updateDoc
};
