// app/pedidos/js/db.js
// Salva pedido de forma idempotente (via API do tenant).
// Se a API não responder, tenta fallback direto no Firestore (id fixo por hash da idemKey).
import {
  db, TENANT_ID, auth,
  collection, doc, setDoc, serverTimestamp
} from './firebase.js';
import { up } from './utils.js';

/* ============== Helpers ============== */
function normalizeEnderecoForKey(str){ return up(str).replace(/\s+/g,' ').trim(); }

function itemsSig(items){
  if (!Array.isArray(items)) return '';
  return items.map(i=>[
    (i.produto||'').trim().replace(/\|/g,'/'),
    (i.tipo||''),
    Number(i.quantidade||0).toFixed(3),
    Number(i.preco||i.precoUnit||0).toFixed(2),
    Number(i.total||0).toFixed(2)
  ].join(':')).join(';');
}

export function buildIdempotencyKey(payload){
  return [
    payload.dataEntregaISO||"",
    payload.horaEntrega||"",
    up(payload.cliente||""),
    (payload.entrega?.tipo||""),
    normalizeEnderecoForKey(payload.entrega?.endereco||""),
    String(payload.subtotal?.toFixed ? payload.subtotal.toFixed(2) : Number(payload.subtotal||0).toFixed(2)),
    String(Array.isArray(payload.itens) ? payload.itens.length : 0),
    itemsSig(payload.itens),
    (payload.clienteFiscal?.cnpj||""),
    (payload.clienteFiscal?.ie||""),
    (payload.clienteFiscal?.cep||""),
    (payload.clienteFiscal?.contato||"")
  ].join("|");
}

// hash rápido (docId determinístico para fallback)
function hash32(s){
  let h = 2166136261 >>> 0;
  for (let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i); h = Math.imul(h, 16777619);
  }
  return (h>>>0).toString(16);
}

// fetch com timeout (evita spinner infinito)
async function fetchWithTimeout(url, opts={}, ms=4000){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), ms);
  try{
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(t);
    return r;
  }catch(e){
    clearTimeout(t);
    throw e;
  }
}

/* ============== Salvamento ============== */
export async function savePedidoIdempotente(payload){
  const idempotencyKey = buildIdempotencyKey(payload);

  // 1) Tenta pela API (rota: /api/tenant-pedidos/salvar)
  try{
    const r = await fetchWithTimeout("/api/tenant-pedidos/salvar", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        payload,
        idempotencyKey,
        // >>> NOVO: enviamos também o usuário autenticado
        user: {
          uid: auth.currentUser?.uid || null,
          email: auth.currentUser?.email || null,
          name: auth.currentUser?.displayName || null
        }
      })
    }, 4000);
    if (!r.ok) throw new Error(`API ${r.status}`);
    const j = await r.json();
    if (!j?.ok) throw new Error("API retornou erro lógico");
    return j; // { ok:true, reused?:bool, id }
  }catch(e){
    console.warn("[DB] API indisponível/lerda, usando fallback Firestore:", e?.message || e);
  }

  // 2) Fallback direto no Firestore
  try{
    const docId = "idem_" + hash32(idempotencyKey);
    const col = collection(db, "tenants", TENANT_ID, "pedidos");
    const toSave = {
      ...payload,
      idempotencyKey,
      tenantId: TENANT_ID,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid, // já existia
      dataEntregaDia: payload?.dataEntregaISO
        ? Number(String(payload.dataEntregaISO).replaceAll("-", ""))
        : null,
    };
    await setDoc(doc(col, docId), toSave, { merge: true });
    return { ok:true, reused:false, id: docId, local:true };
  }catch(e2){
    console.error("[DB] Fallback Firestore falhou:", e2);
    return { ok:false, localOnly:true, id:"local-"+Date.now() };
  }
}
