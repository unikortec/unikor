import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, query, where, writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

// IMPORTANTE: use o mesmo objeto de config do Portal
import { firebaseConfig } from "/js/firebase.js"; // mesmo arquivo do portal (já existente)

let app = getApps().length ? null : initializeApp(firebaseConfig);
const db  = getFirestore();
const auth = getAuth();

export function currentUser(){ return auth.currentUser; }
export function onReadyAuth(cb){ onAuthStateChanged(auth, cb); }

// ===== Helpers multi-tenant
export function tenantIdFromToken(user){
  return user?.stsTokenManager ? user?.tenantId || user?.stsTokenManager?.tenantId : (user?.tenantId||"");
}

// Produtos
export async function fetchProdutos(tenantId){
  const col = collection(db, `tenants/${tenantId}/produtos`);
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function upsertProdutosParcial(tenantId, linhas, user){
  const colPath = `tenants/${tenantId}/produtos`;
  const batch = writeBatch(db);
  const byCode = new Map();
  const existing = await fetchProdutos(tenantId);
  existing.forEach(p => byCode.set(String(p.code).trim(), p));

  const uid = user?.uid || 'system';

  for (const row of linhas){
    let { internalId, code, name, unit, price, active } = row;

    // resolver doc alvo:
    let docId = internalId && internalId.trim() ? internalId.trim() : null;
    if (!docId && code){
      const hit = byCode.get(String(code).trim());
      if (hit) docId = hit.internalId || hit.id;
    }
    if (!docId){
      // novo produto: exige ao menos code & name
      if (!code || !name) continue;
      docId = row.internalId || row.id || crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    }

    const ref = doc(collection(db, colPath), docId);

    // montagem parcial: só grava campos não vazios
    const data = { internalId: docId, updatedBy: uid, atualizadoEm: serverTimestamp() };
    if (!isBlank(code))  data.code = String(code).trim();
    if (!isBlank(name))  data.name = String(name).trim();
    if (!isBlank(unit))  data.unit = String(unit).trim();
    if (!isBlank(price)) data.price = Number(String(price).replace(',','.'));
    if (!isBlank(active)) data.active = (String(active).toLowerCase() !== 'false');

    // se documento novo, completar metadados
    if (!existing.find(p => (p.internalId||p.id) === docId)) {
      data.createdBy = uid;
      data.criadoEm = serverTimestamp();
      if (data.active===undefined) data.active = true;
      if (data.unit===undefined) data.unit = 'UN';
      if (data.price===undefined) data.price = 0;
    }
    batch.set(ref, data, { merge: true });
  }

  await batch.commit();
}

// Custos
export async function upsertCustos(tenantId, linhas, user){
  // aqui salvamos “linha a linha” por produto para facilitar leitura
  const colPath = `tenants/${tenantId}/custos`;
  const batch = writeBatch(db);
  const uid = user?.uid || 'system';
  for (const row of linhas){
    const id = row.internalId || row.code || Math.random().toString(36).slice(2);
    const ref = doc(collection(db, colPath), String(id));
    const data = { updatedBy: uid, atualizadoEm: serverTimestamp() };
    if (!isBlank(row.internalId)) data.internalId = String(row.internalId);
    if (!isBlank(row.code))      data.code = String(row.code);
    if (!isBlank(row.custo))     data.custo = Number(String(row.custo).replace(',','.'));
    if (!isBlank(row.posicao))   data.posicao = Number(String(row.posicao).replace(',','.'));
    if (!isBlank(row.obs))       data.obs = String(row.obs);
    batch.set(ref, data, { merge: true });
  }
  await batch.commit();
}

// Estoque mínimo
export async function upsertMinimo(tenantId, linhas, user){
  const colPath = `tenants/${tenantId}/estoqueMinimo`;
  const batch = writeBatch(db);
  const uid = user?.uid || 'system';
  for (const row of linhas){
    const id = row.internalId || row.code || Math.random().toString(36).slice(2);
    const ref = doc(collection(db, colPath), String(id));
    const data = { updatedBy: uid, atualizadoEm: serverTimestamp() };
    if (!isBlank(row.internalId)) data.internalId = String(row.internalId);
    if (!isBlank(row.code))      data.code = String(row.code);
    if (!isBlank(row.minimo))    data.minimo = Number(String(row.minimo).replace(',','.'));
    batch.set(ref, data, { merge: true });
  }
  await batch.commit();
}

function isBlank(v){ return v===undefined || v===null || (typeof v==='string' && v.trim()===''); }