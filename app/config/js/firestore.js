import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { firebaseConfig } from "/js/firebase.js";
import { norm, isBlank } from './utils.js';

if (!getApps().length) initializeApp(firebaseConfig);
const db   = getFirestore();
const auth = getAuth();

export function currentUser(){ return auth.currentUser; }
export function onReadyAuth(cb){ onAuthStateChanged(auth, cb); }

// ========== SEQUÊNCIA AUTOMÁTICA ==========
async function nextInternalId(tenantId){
  const seqRef = doc(db, `tenants/${tenantId}/_meta/sequences`, 'produtos');
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);
    let next = 1;
    if (snap.exists()){
      const data = snap.data();
      next = Number(data.next || 1);
    }
    tx.set(seqRef, { next: next + 1, atualizadoEm: serverTimestamp() }, { merge: true });
    return String(next).padStart(3, '0'); // "001", "002"...
  });
}

// ========== PRODUTOS ==========
export async function fetchProdutos(tenantId){
  const snap = await getDocs(collection(db, `tenants/${tenantId}/produtos`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Regras:
 * - internalId VAZIO => gera novo sequencial
 * - internalId EXISTENTE => atualiza o produto correspondente
 * - internalId informado mas INEXISTENTE => tenta casar por nome; se não achar => cria novo sequencial
 * - merge parcial: campos vazios não sobrescrevem
 * - unit padrão "UN" para novos
 * - active padrão true
 */
export async function upsertProdutosParcial(tenantId, linhas, user){
  const batch = writeBatch(db);
  const colPath = `tenants/${tenantId}/produtos`;
  const uid = user?.uid || 'system';

  // cache existentes por id e por nome normalizado
  const existentes = await fetchProdutos(tenantId);
  const byId   = new Map(existentes.map(p => [String(p.internalId || p.id), p]));
  const byName = new Map(existentes.map(p => [norm(p.name).toLowerCase(), p]));

  for (const row of linhas){
    let { internalId, name, unit, price, active } = row;

    if (isBlank(name)) continue; // exige nome

    // resolve destino
    let targetId = null;

    const rowId = !isBlank(internalId) ? String(internalId).trim() : "";
    if (rowId && byId.has(rowId)) {
      targetId = rowId; // atualização pelo id existente
    } else {
      // tentar pelo nome (caso usuário esteja atualizando mas não saiba o id)
      const hit = byName.get(norm(String(name)).toLowerCase());
      if (hit) {
        targetId = String(hit.internalId || hit.id);
      } else {
        // NOVO item => gera sequencial automático
        targetId = await nextInternalId(tenantId);
      }
    }

    const ref = doc(collection(db, colPath), targetId);
    const exists = byId.has(targetId);

    const data = {
      internalId: targetId,
      updatedBy: uid,
      atualizadoEm: serverTimestamp()
    };

    // merge parcial
    if (!isBlank(name))  data.name  = String(name).trim();
    if (!isBlank(unit))  data.unit  = String(unit).trim();
    if (!isBlank(price)) data.price = Number(String(price).replace(',','.'));

    if (!isBlank(active)) {
      const v = String(active).toLowerCase();
      data.active = !(v==='falso' || v==='false' || v==='0' || v==='no' || v==='nao' || v==='não');
    }

    // defaults se novo
    if (!exists){
      if (data.unit === undefined)  data.unit = 'UN';
      if (data.price === undefined) data.price = 0;
      if (data.active === undefined) data.active = true;
      data.createdBy = uid;
      data.criadoEm = serverTimestamp();
    }

    batch.set(ref, data, { merge:true });
  }

  await batch.commit();
}

// ========== CUSTOS ==========
export async function upsertCustos(tenantId, linhas, user){
  const batch = writeBatch(db);
  const colPath = `tenants/${tenantId}/custos`;
  const uid = user?.uid || 'system';

  // mapear produtos para resolver por name -> internalId
  const produtos = await fetchProdutos(tenantId);
  const byId   = new Map(produtos.map(p => [String(p.internalId || p.id), p]));
  const byName = new Map(produtos.map(p => [norm(p.name).toLowerCase(), p]));

  for (const row of linhas){
    const rowId = !isBlank(row.internalId) ? String(row.internalId).trim() : "";
    const rowName = !isBlank(row.name) ? String(row.name).trim() : "";

    let id = rowId;
    if (!id && rowName){
      const hit = byName.get(norm(rowName).toLowerCase());
      if (hit) id = String(hit.internalId || hit.id);
    }
    if (!id) continue; // não achou referência

    const ref = doc(collection(db, colPath), id);
    const data = { internalId: id, updatedBy: uid, atualizadoEm: serverTimestamp() };

    if (!isBlank(row.custo))   data.custo = Number(String(row.custo).replace(',','.'));
    if (!isBlank(row.posicao)) data.posicao = Number(String(row.posicao).replace(',','.'));
    if (!isBlank(row.obs))     data.obs = String(row.obs);

    batch.set(ref, data, { merge:true });
  }

  await batch.commit();
}

// ========== ESTOQUE MÍNIMO ==========
export async function upsertMinimo(tenantId, linhas, user){
  const batch = writeBatch(db);
  const colPath = `tenants/${tenantId}/estoqueMinimo`;
  const uid = user?.uid || 'system';

  const produtos = await fetchProdutos(tenantId);
  const byId   = new Map(produtos.map(p => [String(p.internalId || p.id), p]));
  const byName = new Map(produtos.map(p => [norm(p.name).toLowerCase(), p]));

  for (const row of linhas){
    const rowId = !isBlank(row.internalId) ? String(row.internalId).trim() : "";
    const rowName = !isBlank(row.name) ? String(row.name).trim() : "";

    let id = rowId;
    if (!id && rowName){
      const hit = byName.get(norm(rowName).toLowerCase());
      if (hit) id = String(hit.internalId || hit.id);
    }
    if (!id) continue;

    const ref = doc(collection(db, colPath), id);
    const data = { internalId: id, updatedBy: uid, atualizadoEm: serverTimestamp() };
    if (!isBlank(row.minimo)) data.minimo = Number(String(row.minimo).replace(',','.'));
    batch.set(ref, data, { merge:true });
  }

  await batch.commit();
}

// Helpers auth/tenant
export function tenantIdFromToken(user){
  return user?.tenantId || user?.stsTokenManager?.tenantId || "";
}