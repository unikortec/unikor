// app/pedidos/js/db.js
// Salva pedido de forma idempotente (via API do tenant).
// Se a API não responder, tenta fallback direto no Firestore (id fixo por hash da idemKey).

import {
  db, getTenantId,
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

/* ============== Salvamento ============== */
export async function savePedidoIdempotente(payload){
  const idempotencyKey = buildIdempotencyKey(payload);
  const tenantId = await getTenantId(); // usa claim do usuário; se não houver, cai no fallback do firebase.js

  // 1) Tenta pela API (rota: /api/tenant-pedidos/salvar)
  try{
    const r = await fetch("/api/tenant-pedidos/salvar", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ tenantId, payload, idempotencyKey })
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const j = await r.json();
    if (!j?.ok) throw new Error("API retornou erro lógico");
    return j; // { ok:true, reused?:bool, id }
  }catch(e){
    console.warn("[DB] API indisponível, tentando fallback direto no Firestore:", e?.message || e);
  }

  // 2) Fallback direto no Firestore (respeita rules: precisa tenantId no doc)
  try{
    const docId = "idem_" + hash32(idempotencyKey);
    const col = collection(db, "tenants", tenantId, "pedidos");

    const toSave = {
      ...payload,
      idempotencyKey,
      tenantId,
      createdAt: serverTimestamp(),
      dataEntregaDia: payload?.dataEntregaISO
        ? Number(String(payload.dataEntregaISO).replaceAll("-", ""))
        : null,
    };

    await setDoc(doc(col, docId), toSave, { merge: true });
    return { ok:true, reused:false, id: docId, local:true };
  }catch(e2){
    console.warn("[DB] Fallback Firestore falhou (sem bloquear PDF):", e2?.message || e2);
    // devolve um id simbólico para não interromper o fluxo do app
    return { ok:false, localOnly:true, id:"local-"+Date.now() };
  }
}