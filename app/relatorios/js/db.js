// relatorios/js/db.js — acesso multi-tenant às coleções
import {
  db, serverTimestamp,
  collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit,
  requireTenantContext
} from "./firebase.js";

const col = (tenantId, name) => collection(db, "tenants", tenantId, name);
const docRef = (tenantId, name, id) => doc(db, "tenants", tenantId, name, id);

function withMeta(data, { uid, tenantId }, isCreate=false){
  const now = serverTimestamp();
  const base = { ...data, tenantId, updatedBy: uid, updatedAt: now };
  return isCreate ? { ...base, createdBy: uid, createdAt: now } : base;
}

/* LISTAGEM */
export async function pedidos_list({ dataIniISO, dataFimISO, clienteLike, tipo, max=1000 } = {}) {
  const { tenantId } = await requireTenantContext();
  const base = col(tenantId, "pedidos");
  const conds = [];
  if (dataIniISO) conds.push(where("dataEntregaISO", ">=", dataIniISO));
  if (dataFimISO) conds.push(where("dataEntregaISO", "<=", dataFimISO));

  const q = conds.length
    ? query(base, ...conds, orderBy("dataEntregaISO","desc"), limit(max))
    : query(base, orderBy("createdAt","desc"), limit(max));

  const s = await getDocs(q);
  let list = [];
  s.forEach(d => list.push({ id:d.id, ...d.data() }));

  if (clienteLike) {
    const n = String(clienteLike).trim().toUpperCase();
    list = list.filter(x => (x.cliente||"").toUpperCase().includes(n));
  }
  if (tipo) {
    const t = String(tipo).toUpperCase();
    list = list.filter(x => (x?.entrega?.tipo||"").toUpperCase() === t);
  }
  return list;
}

/* GET/UPDATE/DELETE */
export async function pedidos_get(id) {
  const { tenantId } = await requireTenantContext();
  const r = await getDoc(docRef(tenantId, "pedidos", id));
  return r.exists() ? { id:r.id, ...r.data() } : null;
}

export async function pedidos_update(id, data) {
  const ctx = await requireTenantContext();
  await setDoc(docRef(ctx.tenantId, "pedidos", id), withMeta(data, { uid: ctx.user.uid, tenantId: ctx.tenantId }), { merge:true });
}

export async function pedidos_delete(id) {
  const { tenantId } = await requireTenantContext();
  const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
  await deleteDoc(docRef(tenantId, "pedidos", id));
}