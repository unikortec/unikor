// app/despesas/js/firebase.js
// Proxy + camada de utilidades específicas do app Despesas
export { app, auth, firebaseConfig } from '/js/firebase.js';

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ==== Firestore (mesma instância do app raiz) ====
export const db = getFirestore();

// ==== Tenant (podes trocar em runtime se precisar segregar) ====
export const TENANT_ID = "serranobrecarnes.com.br";

// ==== Bus de Auth ====
let _user = null;
const _subs = new Set();
const _waiters = new Set();

onAuthStateChanged(getAuth(), (u) => {
  _user = u || null;
  _subs.forEach(fn => { try{ fn(_user); }catch{} });
  if (_user) {
    _waiters.forEach(res => { try{ res(_user); }catch{} });
    _waiters.clear();
  }
});

export function onAuthUser(cb){
  if (typeof cb === 'function'){ _subs.add(cb); cb(_user); return ()=>_subs.delete(cb); }
  return ()=>{};
}
export function getCurrentUser(){ return _user; }
export function waitForLogin(){
  if (_user) return Promise.resolve(_user);
  return new Promise(res => _waiters.add(res));
}
export function getUserShortName(){
  const u = _user;
  if (!u) return '';
  if (u.displayName) return u.displayName.split(' ')[0];
  if (u.email) return (u.email.split('@')[0]||'').toUpperCase();
  return u.uid.slice(0,6);
}

// ==== GIS (Google Identity Services) para Drive ====
const GOOGLE_CLIENT_ID = "329806123621-p2ttq9g7th9fdul74u6t7gntla0q2gcm.apps.googleusercontent.com";
let _tokenClient = null;

// Escopo mínimo para salvar no Drive do usuário
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export async function ensureGisLoaded(){
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return;
  await new Promise((ok, err)=>{
    const s = document.createElement('script');
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = ok; s.onerror = err;
    document.head.appendChild(s);
  });
}

export async function getGoogleAccessToken(scope = DRIVE_SCOPE){
  await ensureGisLoaded();
  if (!_tokenClient){
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope,
      prompt: '', // tenta silencioso primeiro
      callback: () => {}
    });
  }
  const token = await new Promise((resolve, reject)=>{
    _tokenClient.callback = (resp)=>{
      if (resp && resp.access_token) resolve(resp.access_token);
      else reject(new Error('Falha ao obter token Google'));
    };
    try { _tokenClient.requestAccessToken({ prompt: '' }); } 
    catch { _tokenClient.requestAccessToken({ prompt: 'consent' }); }
  });
  return token;
}

// ===== Helpers de coleção/paths
export const colDespesas = () => collection(db, "tenants", TENANT_ID, "despesas");

// ===== Persistência de despesas no Firestore
/** Salva/append uma despesa (manual, nfce, nfe55). 
 * Exige login e obedece às rules: inclui tenantId, createdBy/updatedBy, timestamps.
 */
export async function salvarDespesaFirestore(payload){
  const u = getCurrentUser();
  if (!u) throw new Error("Usuário não autenticado.");
  const docData = {
    tenantId: TENANT_ID,
    tipo: payload.tipo,                         // 'manual' | 'nfce' | 'nfe55'
    categoria: String(payload.categoria||'GERAL').toUpperCase(),
    estabelecimento: payload.estabelecimento || '',
    produtos: payload.produtos || [],           // [{nome, qtd?, unit?, subtotal?, valor?}]
    total: Number(payload.total || 0),
    origem: payload.origem || null,             // {accessKey,..} quando houver
    data: payload.data || new Date().toISOString().slice(0,10),
    createdBy: u.uid,
    updatedBy: u.uid,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    usuarioNome: getUserShortName()
  };
  await addDoc(colDespesas(), docData);
}