import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, writeBatch, serverTimestamp,
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

/** Resolve tenantId das claims, localStorage, /users/{uid}, ou pergunta manualmente */
export async function resolveTenantId(){
  if (window.UNIKOR_TENANT_ID && String(window.UNIKOR_TENANT_ID).trim()){
    localStorage.setItem('unikor.tenantId', String(window.UNIKOR_TENANT_ID));
    return String(window.UNIKOR_TENANT_ID);
  }
  const cached = localStorage.getItem('unikor.tenantId');
  if (cached && cached.trim()) return cached.trim();

  const user = auth.currentUser;
  if (!user) return "";

  try{
    const token = await user.getIdTokenResult(true);
    const t = token?.claims?.tenantId;
    if (t){ localStorage.setItem('unikor.tenantId', t); return t; }
  }catch{}

  try{
    const uref = doc(db, 'users', user.uid);
    const usnap = await getDoc(uref);
    const t = usnap.exists() ? (usnap.data().tenantId || "") : "";
    if (t){ localStorage.setItem('unikor.tenantId', t); return t; }
  }catch{}

  const manual = prompt('Informe o TENANT_ID para continuar:');
  if (manual){ localStorage.setItem('unikor.tenantId', manual); return manual; }
  return "";
}

// ===== Sequência automática =====
async function nextInternalId(tenantId){
  const seqRef = doc(db, `tenants/${tenantId}/_meta/sequences`, 'produtos');
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);
    let next = 1;
    if (snap.exists()) next = Number(snap.data().next || 1);
    tx.set(seqRef, { next: next + 1, atualizadoEm: serverTimestamp() }, { merge: true });
    return String(next).padStart(3, '0');
  });
}

// ===== Produtos =====
export async function fetchProdutos(tenantId){
  const snap = await getDocs(collection(db, `tenants/${tenantId}/produtos`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function upsertProdutosParcial(tenantId, linhas, user){
  const batch = writeBatch(db);
  const colPath = `tenants/${tenantId}/produtos`;
  const uid = user?.uid || 'system';

  const existentes = await fetchProdutos(tenantId);
  const byId   = new Map(existentes.map(p => [String(p.internalId || p.id), p]));
  const byName = new Map(existentes.map(p => [norm(p.name).toLowerCase(), p]));

  for (const row of linhas){
    let { internalId, name, unit, price, active } = row;
    if (isBlank(name)) continue;

    let targetId = null;
    const rowId = !isBlank(internalId) ? String(internalId).trim() : "";
    if (rowId && byId.has(rowId)) {
      targetId = rowId;
    } else {
      const hit = byName.get(norm(String(name)).toLowerCase());
      targetId = hit ? String(hit.internalId || hit.id) : await nextInternalId(tenantId);
    }

    const ref = doc(collection(db, colPath), targetId);
    const exists = byId.has(targetId);
    const data = { internalId: targetId, updatedBy: uid, atualizadoEm: serverTimestamp() };

    if (!isBlank(name))  data.name  = String(name).trim();
    if (!isBlank(unit))  data.unit  = String(unit).trim();
    if (!isBlank(price)) data.price = Number(String(price).replace(',','.'));
    if (!isBlank(active)) {
      const v = String(active).toLowerCase();
      data.active = !(v==='falso'||v==='false'||v==='0'||v==='no'||v==='nao'||v==='não');
    }

    if (!exists){
      if (data.unit===undefined) data.unit='UN';
      if (data.price===undefined) data.price=0;
      if (data.active===undefined) data.active=true;
      data.createdBy = uid;
      data.criadoEm = serverTimestamp();
    }
    batch.set(ref, data, { merge:true });
  }
  await batch.commit();
}

// ===== Custos =====
export async function upsertCustos(tenantId, linhas, user){
  const batch = writeBatch(db);
  const colPath = `tenants/${tenantId}/custos`;
  const uid = user?.uid || 'system';
  const produtos = await fetchProdutos(tenantId);
  const byId = new Map(produtos.map(p=>[String(p.internalId||p.id),p]));
  const byName=new Map(produtos.map(p=>[norm(p.name).toLowerCase(),p]));
  for (const row of linhas){
    const id = row.internalId && byId.has(row.internalId)
      ? row.internalId
      : (byName.get(norm(row.name).toLowerCase())?.internalId||null);
    if (!id) continue;
    const ref = doc(collection(db,colPath),id);
    const data={internalId:id,updatedBy:uid,atualizadoEm:serverTimestamp()};
    if(!isBlank(row.custo))data.custo=Number(String(row.custo).replace(',','.'));
    if(!isBlank(row.posicao))data.posicao=Number(String(row.posicao).replace(',','.'));
    if(!isBlank(row.obs))data.obs=String(row.obs);
    batch.set(ref,data,{merge:true});
  }
  await batch.commit();
}

// ===== Estoque Mínimo =====
export async function upsertMinimo(tenantId, linhas, user){
  const batch=writeBatch(db);
  const colPath=`tenants/${tenantId}/estoqueMinimo`;
  const uid=user?.uid||'system';
  const produtos=await fetchProdutos(tenantId);
  const byId=new Map(produtos.map(p=>[String(p.internalId||p.id),p]));
  const byName=new Map(produtos.map(p=>[norm(p.name).toLowerCase(),p]));
  for(const row of linhas){
    const id=row.internalId&&byId.has(row.internalId)
      ? row.internalId
      : (byName.get(norm(row.name).toLowerCase())?.internalId||null);
    if(!id)continue;
    const ref=doc(collection(db,colPath),id);
    const data={internalId:id,updatedBy:uid,atualizadoEm:serverTimestamp()};
    if(!isBlank(row.minimo))data.minimo=Number(String(row.minimo).replace(',','.'));
    batch.set(ref,data,{merge:true});
  }
  await batch.commit();
}