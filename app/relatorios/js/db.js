// relatorios/js/db.js
// Multi-tenant para obedecer às rules: /tenants/{tenantId}/pedidos

import {
  db, serverTimestamp,
  collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit,
  requireTenantContext
} from "./firebase.js";

function colPath(tenantId, coll) { return collection(db, "tenants", tenantId, coll); }
function docPath(tenantId, coll, id) { return doc(db, "tenants", tenantId, coll, id); }

function withAuthorAndTenant(base, { uid, tenantId }, { isCreate=false } = {}) {
  const now = serverTimestamp();
  const payload = { ...base, tenantId };
  if (isCreate) {
    if (!("createdAt" in payload) && !("criadoEm" in payload)) payload.createdAt = now;
    if (!("createdBy" in payload)) payload.createdBy = uid;
  }
  if (!("updatedAt" in payload) && !("atualizadoEm" in payload)) payload.updatedAt = now;
  if (!("updatedBy" in payload)) payload.updatedBy = uid;
  return payload;
}

// helper p/ somar quando totalPedido não existir
function calcTotalFromItens(itens){
  if (!Array.isArray(itens)) return 0;
  return itens.reduce((s,it)=>{
    const qtd = Number(it.qtd ?? it.quantidade ?? 0);
    const pu  = Number(it.precoUnit ?? it.preco ?? 0);
    return s + (qtd * pu || 0);
  },0);
}

/* ===== PEDIDOS ===== */
export async function pedidos_list({ dataIniISO, dataFimISO, clienteLike, tipo, max=1000 } = {}) {
  const { tenantId } = await requireTenantContext();
  const base = colPath(tenantId, "pedidos");

  const conds = [];
  if (dataIniISO) conds.push(where("dataEntregaISO", ">=", dataIniISO));
  if (dataFimISO) conds.push(where("dataEntregaISO", "<=", dataFimISO));

  let qRef = conds.length
    ? query(base, ...conds, orderBy("dataEntregaISO","desc"), limit(max))
    : query(base, orderBy("createdAt","desc"), limit(max));

  const snap = await getDocs(qRef);
  let list = [];
  snap.forEach(d => {
    const data = d.data();
    const totalPedido = (typeof data.totalPedido === 'number')
      ? data.totalPedido
      : calcTotalFromItens(data.itens);
    list.push({ id: d.id, ...data, totalPedido });
  });

  if (clienteLike) {
    const needle = String(clienteLike).trim().toUpperCase();
    list = list.filter(x => (x.cliente || "").toUpperCase().includes(needle));
  }
  if (tipo) {
    const t = String(tipo).toUpperCase();
    list = list.filter(x => (x?.entrega?.tipo || "").toUpperCase() === t);
  }
  return list;
}

export async function pedidos_get(id) {
  const { tenantId } = await requireTenantContext();
  const ref = docPath(tenantId, "pedidos", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const totalPedido = (typeof data.totalPedido === 'number')
    ? data.totalPedido
    : calcTotalFromItens(data.itens);
  return { id: snap.id, ...data, totalPedido };
}

export async function pedidos_update(id, data) {
  const { user, tenantId } = await requireTenantContext();
  const ref = docPath(tenantId, "pedidos", id);
  const payload = withAuthorAndTenant({ ...(data || {}) }, { uid: user.uid, tenantId }, { isCreate:false });
  await setDoc(ref, payload, { merge:true });
}

export async function pedidos_delete(id) {
  const { tenantId } = await requireTenantContext();
  const ref = docPath(tenantId, "pedidos", id);
  const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
  await deleteDoc(ref);
}