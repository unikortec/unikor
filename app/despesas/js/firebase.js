// /app/despesas/js/firebase.js
// Proxy para usar a MESMA sessão Firebase do portal (+ helpers locais)

export { app, auth } from '/js/firebase.js';

import {
  getFirestore,
  collection, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

// Firestore compartilhado pelo app raiz
import { app as _rootApp } from '/js/firebase.js';
export const db = getFirestore(_rootApp);

// Bus simplificado de auth (para tela mostrar nome/email)
let _user = null;
const _subs = new Set();
onAuthStateChanged(auth, (u) => {
  _user = u || null;
  _subs.forEach(fn => { try{ fn(_user); }catch{} });
});
export function onAuthUser(cb){ if(typeof cb==='function'){ _subs.add(cb); cb(_user); return ()=>_subs.delete(cb); } return ()=>{}; }
export function getCurrentUser(){ return _user; }
export const TENANT_ID = 'serranobrecarnes.com.br';

// Salvar “Despesa Manual” no Firestore (respeita suas rules por tenant)
export async function saveManualToFirestore({ categoria, estabelecimento, itens, total }) {
  const user = getCurrentUser();
  if (!user) throw new Error('Sem login');
  const doc = {
    tenantId: TENANT_ID,
    tipo: 'manual',
    categoria: String(categoria||'GERAL').toUpperCase(),
    estabelecimento: estabelecimento||'',
    itens: itens||[],
    total: Number(total)||0,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid
  };
  return addDoc(collection(db, `tenants/${TENANT_ID}/despesas`), doc);
}