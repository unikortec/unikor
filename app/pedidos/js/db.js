// app/pedidos/js/db.js
// Salva pedido de forma idempotente. Primeiro tenta a API /api/tenant-pedidos.
// Se falhar (sem backend, offline, etc.), salva DIRETO no Firestore com docId determinístico.

import {
  db, serverTimestamp, doc, setDoc, waitForLogin
} from './firebase.js';
import { TENANT_ID } from './firebase.js';
import { up } from './utils.js';

/* ===== Helpers para chave/assinatura ===== */
function normalizeEnderecoForKey(str){ return up(str).replace(/\s+/g,' ').trim(); }
function itemsSig(items){
  if (!Array.isArray(items)) return '';
  return items.map(i=>[
    (i.produto||'').trim().replace(/\|/g,'/'),
    (i.tipo||''),
    Number(i.quantidade||i.qtd||0).toFixed(3),
    Number(i.preco||i.precoUnit||0).toFixed(2),
    Number(i.total||i.subtotal||0).toFixed(2)
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
    (payload.clienteFiscal?.contato||""),
    (payload.pagamento||"")
  ].join("|");
}

/* Pequeno hash estável p/ virar docId determinístico */
function toHexHash(str){
  let h = 5381;
  for (let i=0;i<str.length;i++) h = ((h<<5)+h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16) + '-' + str.length.toString(16);
}

/* ===== Salvamento DIRETO no Firestore (fallback) ===== */
async function savePedidoDiretoNoFirestore(payload, idempotencyKey){
  const { user } = await waitForLogin();
  const docId = toHexHash(idempotencyKey);
  const ref   = doc(db, "tenants", TENANT_ID, "pedidos", docId);

  const base = {
    ...payload,
    idempotencyKey,
    tenantId: TENANT_ID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user?.uid || null,
    updatedBy: user?.uid || null
  };

  await setDoc(ref, base, { merge: true }); // idempotente
  return { id: docId, ok:true, reused:false };
}

/* ===== Salvamento via API + fallback ===== */
export async function savePedidoIdempotente(payload){
  const idempotencyKey = buildIdempotencyKey(payload);

  // antirrepique de clique
  if (localStorage.getItem('unikor:lastIdemKey') === idempotencyKey) {
    return { id: localStorage.getItem('unikor:lastDocId') || null, ok:true, reused:true };
  }

  // 1) tenta backend
  try{
    const r = await fetch("/api/tenant-pedidos", { // <<< sem /salvar
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ tenantId: TENANT_ID, payload, idempotencyKey })
    });
    if (r.ok){
      const json = await r.json();
      localStorage.setItem('unikor:lastIdemKey', idempotencyKey);
      if (json?.id) localStorage.setItem('unikor:lastDocId', json.id);
      return json;
    }
    console.warn("[savePedido] API retornou", r.status, "— usando fallback Firestore");
  } catch(e){
    console.warn("[savePedido] Falha rede/API — usando fallback Firestore", e?.message);
  }

  // 2) fallback direto no Firestore
  const out = await savePedidoDiretoNoFirestore(payload, idempotencyKey);
  localStorage.setItem('unikor:lastIdemKey', idempotencyKey);
  localStorage.setItem('unikor:lastDocId', out.id);
  return out;
}