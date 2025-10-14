// /app/despesas/js/firebase.js
// Reaproveita o MESMO app/auth da raiz (sessão única no portal)
import { app as rootApp, auth as rootAuth } from '/js/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore,
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ========= Reexports úteis ========= */
export {
  collection, addDoc, getDocs, doc, setDoc, getDoc,
  query, where, orderBy, limit, serverTimestamp, updateDoc
};

/* ========= App/Auth/DB compartilhados ========= */
export const app  = rootApp;         // <- export explícito para evitar erro de import
export const auth = rootAuth;
export const db   = getFirestore(app);

/* ========= Tenant =========
   Pegamos do token (custom claim tenantId). Se não existir,
   usamos um fallback (ajuste se quiser outro padrão). */
const TENANT_FALLBACK = "serranobrecarnes.com.br";
let cachedTenantId = null;
export async function getTenantId() {
  const u = getCurrentUser();
  if (!u) return TENANT_FALLBACK;
  try {
    const t = await u.getIdTokenResult(true);
    cachedTenantId = t.claims?.tenantId || TENANT_FALLBACK;
  } catch {
    cachedTenantId = TENANT_FALLBACK;
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
  console.log("[DESPESAS] Auth:", currentUser ? `Logado (${currentUser.email || currentUser.uid})` : "Não logado");

  if (!_init) {
    _init = true;
    try { _resolveReady(currentUser); } catch {}
  }

  // notifica listeners
  subs.forEach(fn => { try { fn(currentUser); } catch {} });

  // resolve esperas
  if (currentUser) {
    waiters.forEach(r => { try { r(currentUser); } catch {} });
    waiters.clear();
  }
});

// API pública
export function onAuthUser(cb){ if (typeof cb === 'function'){ subs.add(cb); cb(currentUser); return ()=>subs.delete(cb); } return ()=>{}; }
export function getCurrentUser(){ return currentUser; }
export function isLoggedIn(){ return !!currentUser; }
export function waitForLogin(){ return currentUser ? Promise.resolve(currentUser) : new Promise(r => waiters.add(r)); }

/* ========= Helpers convenientes de path (opcional) ========= */
export const colTenants = (name, tenantId) => collection(db, "tenants", tenantId || cachedTenantId || TENANT_FALLBACK, name);
export const docTenants = (name, id, tenantId) => doc(db, "tenants", tenantId || cachedTenantId || TENANT_FALLBACK, name, id);
// /app/despesas/js/firebase.js (append)

// Salvar no Firestore em tenants/{tenantId}/expenses
export async function saveManualToFirestore({ categoria, estabelecimento, itens, total, formaPagamento='OUTROS', source='MANUAL' }){
  const user = getCurrentUser();
  const tenantId = await getTenantId();
  const payload = {
    tenantId,
    categoria: (categoria||'GERAL').toUpperCase(),
    estabelecimento: estabelecimento||'',
    itens: (itens||[]).map(p=>({ nome:String(p.nome||'').slice(0,120), valor:Number(p.valor)||0 })),
    total: Number(total)|| (itens||[]).reduce((s,i)=>s+(Number(i.valor)||0),0),
    formaPagamento: (formaPagamento||'OUTROS').toUpperCase(),
    source, // MANUAL | NFCe | NFe55 | OCR
    createdBy: user?.uid || 'anon',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const col = colTenants('expenses', tenantId);
  return addDoc(col, payload);
}