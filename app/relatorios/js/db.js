// relatorios/js/db.js
// Multi-tenant para obedecer às rules: /tenants/{tenantId}/pedidos

import {
  db, serverTimestamp,
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit,
  startAt, endAt,                 // <- vem do relatorios/js/firebase.js
  requireTenantContext
} from "./firebase.js";

/* ------------ helpers de paths ------------ */
function colPath(tenantId, coll) { return collection(db, "tenants", tenantId, coll); }
function docPath(tenantId, coll, id) { return doc(db, "tenants", tenantId, coll, id); }

/* ------------ auditoria/tenant ------------ */
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

/* ------------ utilidades ------------ */
const norm = (s="") =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();

function calcTotalFromItens(itens){
  if (!Array.isArray(itens)) return 0;
  return itens.reduce((s,it)=>{
    const qtd = Number(it.qtd ?? it.quantidade ?? 0);
    const pu  = Number(it.precoUnit ?? it.preco ?? 0);
    return s + (qtd * pu || 0);
  }, 0);
}

/* ===================== PEDIDOS ===================== */
/**
 * Lista pedidos com filtros opcionais:
 * - dataIniISO / dataFimISO (YYYY-MM-DD)
 * - clienteLike (contém, case-insensitive)
 * - tipo ("ENTREGA" | "RETIRADA")
 * - max (limite)
 *
 * Observação: usa orderBy(dataEntregaISO) + startAt/endAt para evitar índices compostos.
 * Se o ambiente exigir, cai para um fallback com where() e 1 orderBy.
 */
export async function pedidos_list({ dataIniISO, dataFimISO, clienteLike, tipo, max=1000 } = {}){
  const { tenantId } = await requireTenantContext();
  const base = colPath(tenantId, "pedidos");

  let qRef;
  try {
    if (dataIniISO || dataFimISO) {
      const parts = [ orderBy("dataEntregaISO","asc") ];
      if (dataIniISO) parts.push(startAt(dataIniISO));
      if (dataFimISO) parts.push(endAt(dataFimISO));
      parts.push(limit(max));
      qRef = query(base, ...parts);
    } else {
      // sem filtro de data: usa createdAt desc
      qRef = query(base, orderBy("createdAt","desc"), limit(max));
    }
  } catch (e) {
    // fallback (ambiente sem índice adequado)
    console.warn("[pedidos_list] fallback para where()", e);
    const conds = [];
    if (dataIniISO) conds.push(where("dataEntregaISO", ">=", dataIniISO));
    if (dataFimISO) conds.push(where("dataEntregaISO", "<=", dataFimISO));
    qRef = conds.length
      ? query(base, ...conds, orderBy("dataEntregaISO","asc"), limit(max))
      : query(base, orderBy("dataEntregaISO","desc"), limit(max));
  }

  const snap = await getDocs(qRef);
  let list = [];
  snap.forEach(d => {
    const data = d.data();
    const totalPedido = (typeof data.totalPedido === "number")
      ? data.totalPedido
      : calcTotalFromItens(data.itens);
    list.push({ id: d.id, ...data, totalPedido });
  });

  // filtros client-side complementares
  if (clienteLike && String(clienteLike).trim()){
    const needle = norm(clienteLike.trim());
    list = list.filter(x => norm(x.clientUpper || x.cliente || "").includes(needle));
  }
  if (tipo && String(tipo).trim()){
    const t = String(tipo).toUpperCase();
    list = list.filter(x => (x?.entrega?.tipo || "").toUpperCase() === t);
  }

  return list;
}

export async function pedidos_get(id){
  const { tenantId } = await requireTenantContext();
  const ref = docPath(tenantId, "pedidos", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  const totalPedido = (typeof data.totalPedido === "number")
    ? data.totalPedido
    : calcTotalFromItens(data.itens);

  return { id: snap.id, ...data, totalPedido };
}

export async function pedidos_update(id, data){
  const { user, tenantId } = await requireTenantContext();
  const ref = docPath(tenantId, "pedidos", id);

  const patch = { ...(data || {}) };
  if (patch.cliente) patch.clientUpper = norm(patch.cliente);
  if (typeof patch.totalPedido !== "number") patch.totalPedido = calcTotalFromItens(patch.itens);

  const payload = withAuthorAndTenant(patch, { uid: user.uid, tenantId }, { isCreate:false });
  await setDoc(ref, payload, { merge:true });
}

export async function pedidos_delete(id){
  const { tenantId } = await requireTenantContext();
  const ref = docPath(tenantId, "pedidos", id);
  const { deleteDoc } =
    await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js");
  await deleteDoc(ref);
}