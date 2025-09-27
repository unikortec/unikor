// app/pedidos/js/firebase.js
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBuUQsB7AohqjzqJlTD3AvLwD5EbKjJVqU",
  authDomain: "unikorapp.firebaseapp.com",
  projectId: "unikorapp",
  storageBucket: "unikorapp.appspot.com",
  messagingSenderId: "484386062712",
  appId: "1:484386062712:web:c8e5b6b4e7e9a3a7c8a6e7"
};

// single app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Tenant fixo
export const TENANT_ID = "serranobrecarnes.com.br";

/* ===================== AUTH STATE BUS ===================== */
let currentUser = null;
const subs = new Set();
const pendingLoginWaiters = new Set();

let _authInitialized = false;
let _resolveAuthReady;
export const authReady = new Promise((resolve) => { _resolveAuthReady = resolve; });

onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  console.log("Firebase Auth:", currentUser ? `Logado (${currentUser.email || currentUser.uid})` : "Não logado");

  // marca primeira resolução
  if (!_authInitialized) {
    _authInitialized = true;
    try { _resolveAuthReady(currentUser); } catch {}
  }

  // notifica subscribers
  subs.forEach(fn => { try { fn(currentUser); } catch {} });

  // resolve esperas por login quando houver user
  if (currentUser) {
    pendingLoginWaiters.forEach(resolve => { try { resolve(currentUser); } catch {} });
    pendingLoginWaiters.clear();
  }
});

// API pública de auth
export function onAuthUser(cb){
  if (typeof cb === 'function') {
    subs.add(cb);
    // NÃO chamamos imediatamente para evitar decisão precoce com null.
    return () => subs.delete(cb);
  }
  return ()=>{};
}
export function getCurrentUser(){ return currentUser; }
export function isLoggedIn(){ return !!currentUser; }

/** Espera até existir um usuário logado. Nunca resolve com null. */
export function waitForLogin(){
  if (currentUser) return Promise.resolve(currentUser);
  return new Promise((resolve) => { pendingLoginWaiters.add(resolve); });
}

/** Checa acesso ao tenant via custom claims (opcional) */
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

/* ============== Caches opcionais ============== */
let clientesCache = null;
let produtosCache = null;
let pedidoAtualId = null;

export function limparCaches(){ clientesCache=null; produtosCache=null; console.log("Caches limpos"); }

// Side-effect leve quando desloga
onAuthUser((user)=>{ if (!user) limparCaches(); });

// Re-export Firestore helpers
export {
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp,
  updateDoc
};
