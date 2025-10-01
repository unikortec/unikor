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

function norm(s=""){ return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(); }

// soma quando totalPedido não existir
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

  let qRef;

  // Se tiver pelo menos uma das bordas de data, usamos orderBy + startAt/endAt
  if (dataIniISO || dataFimISO) {
    qRef = query(base, orderBy("dataEntregaISO", "asc"), limit(max));
    if (dataIniISO) qRef = query(qRef, startAt(dataIniISO));
    if (dataFimISO) qRef = query(qRef, endAt(dataFimISO));
  } else {
    // Sem filtro de data: ordena por createdAt (mais recente primeiro)
    qRef = query(base, orderBy("createdAt", "desc"), limit(max));
  }

  const snap = await getDocs(qRef);
  let list = [];
  snap.forEach(d => {
    const data = d.data();
    const totalPedido = (typeof data.totalPedido === 'number')
      ? data.totalPedido
      : calcTotalFromItens(data.itens);
    list.push({ id: d.id, ...data, totalPedido });
  });

  // Filtros client-side complementares
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

  // normalizações úteis
  const patch = { ...(data || {}) };
  if (patch.cliente) patch.clientUpper = norm(patch.cliente);
  if (typeof patch.totalPedido !== 'number') patch.totalPedido = calcTotalFromItens(patch.itens);

  const payload = withAuthorAndTenant(patch, { uid: user.uid, tenantId }, { isCreate:false });
  await setDoc(ref, payload, { merge:true });
}

export async function pedidos_delete(id) {
  const { tenantId } = await requireTenantContext();
  const ref = docPath(tenantId, "pedidos", id);
  const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
  await deleteDoc(ref);
}