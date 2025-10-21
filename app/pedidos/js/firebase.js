// /app/pedidos/js/firebase.js
import { app as rootApp, auth as rootAuth, storage as rootStorage } from '/js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc,
  startAt, endAt
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

export {
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc,
  startAt, endAt
};

export const app  = rootApp;
export const auth = rootAuth;
export const db   = getFirestore(app);
// pode usar o da raiz (rootStorage) ou criar local — ambos apontam pro mesmo bucket
export const storage = rootStorage || getStorage(app);

// ============ Tenant ============
export const TENANT_FIXED = "serranobrecarnes.com.br";
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

// ============ Auth Bus ============
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

export function onAuthUser(cb){ if (typeof cb === 'function'){ subs.add(cb); try{cb(currentUser);}catch{} return ()=>subs.delete(cb);} return ()=>{}; }
export function getCurrentUser(){ return currentUser; }
export function isLoggedIn(){ return !!currentUser; }
export function waitForLogin(){ return currentUser ? Promise.resolve(currentUser) : new Promise(r => waiters.add(r)); }

export const colTenants = (name, tenantId) =>
  collection(db, "tenants", tenantId || cachedTenantId || TENANT_FIXED, name);
export const docTenants = (name, id, tenantId) =>
  doc(db, "tenants", tenantId || cachedTenantId || TENANT_FIXED, name, id);