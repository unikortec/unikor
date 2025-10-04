// relatorios/js/db.js
import {
  db, serverTimestamp,
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit,
  startAt, endAt,
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

const norm = (s="") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();

/* ======== inferência de KG para itens em UN (a partir da descrição) ======== */
function kgPorUnFromDesc(desc=""){
  const s = String(desc).toLowerCase().replace(',', '.').replace(/\s+/g,' ');
  // pega o ÚLTIMO número + unidade (ex.: “120 g”, “1.2kg”, “500 gramas”)
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
  let m, last=null; while((m=re.exec(s))!==null) last=m;
  if (!last) return 0;
  const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
  const val = parseFloat(raw);
  if (!isFinite(val) || val<=0) return 0;
  const unit = last[2].toLowerCase();
  return (unit.startsWith('kg') || unit.startsWith('quilo')) ? val : (val/1000);
}

/* ======== total do pedido considerando UN com peso na descrição ======== */
function calcTotalFromItens(itens){
  if (!Array.isArray(itens)) return 0;
  return itens.reduce((s,it)=>{
    const qtd = Number(it.qtd ?? it.quantidade ?? 0);
    const pu  = Number(it.precoUnit ?? it.preco ?? 0);
    const un  = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
    if (typeof it.subtotal === "number") return s + Number(it.subtotal||0);
    if (un === "UN"){
      const kgUn = kgPorUnFromDesc(it.descricao || it.produto || "");
      const tot = kgUn > 0 ? (qtd * kgUn) * pu : (qtd * pu);
      return s + Number(tot || 0);
    }
    return s + Number((qtd * pu) || 0);
  }, 0);
}

/* ===================== PEDIDOS ===================== */
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
      qRef = query(base, orderBy("createdAt","desc"), limit(max));
    }
  } catch (e) {
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