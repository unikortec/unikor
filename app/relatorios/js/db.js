// relatorios/js/db.js
import {
  db, serverTimestamp,
  collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit,
  requireTenantContext
} from "./firebase.js";

const col = (tenantId, name) => collection(db, "tenants", tenantId, name);
const docRef = (tenantId, name, id) => doc(db, "tenants", tenantId, name, id);

function withMeta(data, { uid, tenantId }, isCreate=false){
  const now = serverTimestamp();
  const out = { ...data, tenantId, updatedBy: uid, updatedAt: now };
  if (isCreate){ out.createdBy = uid; out.createdAt = now; }
  return out;
}

/* LISTAR */
export async function pedidos_list({ dataIniISO, dataFimISO, clienteLike, tipo, max=1000 } = {}){
  const { tenantId } = await requireTenantContext();
  const base = col(tenantId, "pedidos");

  const conds = [];
  if (dataIniISO) conds.push(where("dataEntregaISO", ">=", dataIniISO));
  if (dataFimISO) conds.push(where("dataEntregaISO", "<=", dataFimISO));

  let qy = conds.length
    ? query(base, ...conds, orderBy("dataEntregaISO","desc"), limit(max))
    : query(base, orderBy("createdAt","desc"), limit(max));

  const snap = await getDocs(qy);
  let list = [];
  snap.forEach(d=> list.push({ id:d.id, ...d.data() }));

  if (clienteLike){
    const needle = String(clienteLike).trim().toUpperCase();
    list = list.filter(x => (x.cliente||"").toUpperCase().includes(needle));
  }
  if (tipo){
    const t = String(tipo).toUpperCase();
    list = list.filter(x => (x?.entrega?.tipo||"").toUpperCase() === t);
  }
  return list;
}

/* GET */
export async function pedidos_get(id){
  const { tenantId } = await requireTenantContext();
  const s = await getDoc(docRef(tenantId, "pedidos", id));
  return s.exists() ? { id:s.id, ...s.data() } : null;
}

/* UPDATE (merge) */
export async function pedidos_update(id, data){
  const ctx = await requireTenantContext();
  await setDoc(docRef(ctx.tenantId, "pedidos", id), withMeta(data, { uid: ctx.user.uid, tenantId: ctx.tenantId }), { merge:true });
}

/* DELETE */
export async function pedidos_delete(id){
  const { tenantId } = await requireTenantContext();
  const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
  await deleteDoc(docRef(tenantId, "pedidos", id));
}