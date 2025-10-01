// app/pedidos/js/db.js
// Versão "direto no Firestore", mantendo a mesma API pública:
//   - buildIdempotencyKey(payload)
//   - savePedidoIdempotente(payload)
// Nada mais no app precisa ser alterado.

import {
  db, TENANT_ID, waitForLogin, getCurrentUser,
  collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, serverTimestamp
} from './firebase.js';
import { up } from './utils.js';

/* ---------------- ID / Hash helpers ---------------- */
function normalizeEnderecoForKey(str){
  return up(str).replace(/\s+/g,' ').trim();
}
function itemsSig(items){
  if (!Array.isArray(items)) return '';
  return items.map(i=>[
    (i.produto||i.descricao||'').trim().replace(/\|/g,'/'),
    (i.tipo||i.un||''),
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
    (payload.clienteFiscal?.contato||"")
  ].join("|");
}
function hash36(str){
  // hash simples e determinístico → base36
  let h = 0;
  for (let i=0;i<str.length;i++){
    h = ((h<<5)-h) + str.charCodeAt(i);
    h |= 0;
  }
  const u = Math.abs(h) >>> 0;
  return u.toString(36);
}

/* ---------------- Cálculos de totais ---------------- */
function calcTotalFromItems(itens){
  if (!Array.isArray(itens)) return 0;
  let tot = 0;
  for (const it of itens){
    const qtd = Number(it.quantidade ?? it.qtd ?? 0);
    const pu  = Number(it.preco ?? it.precoUnit ?? 0);
    const sub = Number(it.total ?? it.subtotal ?? (qtd * pu));
    if (!Number.isNaN(sub)) tot += sub;
  }
  return Number(tot.toFixed(2));
}

/* ---------------- Caminhos Firestore ---------------- */
const colPedidos = () => collection(db, "tenants", TENANT_ID, "pedidos");

/* ---------------- API pública ---------------- */
/**
 * Salva idempotente no Firestore usando o id baseado no idempotencyKey.
 * Retorna { id, ok:true }.
 */
export async function savePedidoIdempotente(payload){
  await waitForLogin();
  const user = getCurrentUser();
  if (!user) throw new Error("Usuário não autenticado.");

  // 1) chave e id determinístico
  const idempotencyKey = buildIdempotencyKey(payload);
  const docId = `p_${hash36(idempotencyKey)}`;

  // 2) se já existe, não duplica — apenas retorna
  const ref = doc(colPedidos(), docId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { ok: true, id: snap.id, alreadyExisted: true };
  }

  // 3) totalPedido garantido
  const totalPedido = Number(
    (payload.totalPedido != null ? Number(payload.totalPedido) : calcTotalFromItems(payload.itens)).toFixed(2)
  );

  // 4) payload normalizado + metadados exigidos pelas rules
  const agora = serverTimestamp();
  const docData = {
    // compat: mantém tudo que seu app já manda
    ...payload,

    // campos consolidados para relatórios
    totalPedido,

    // metadados exigidos pelas suas rules
    tenantId: TENANT_ID,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: agora,
    updatedAt: agora,

    // utilitário
    idempotencyKey,
  };

  // 5) grava idempotente
  await setDoc(ref, docData, { merge: true });

  return { ok: true, id: docId };
}

/* ------------- (Opcional) consultas auxiliares ------------- */
// Você não precisa usar abaixo se já possui as suas, deixo como utilidades.

export async function listPedidosRecentes(max=50){
  const qs = await getDocs(query(colPedidos(), orderBy("createdAt","desc"), limit(max)));
  const out = [];
  qs.forEach(d=> out.push({ id:d.id, ...d.data() }));
  return out;
}

export async function findByClienteNome(nome, max=50){
  const alvo = up(nome);
  const qs = await getDocs(query(
    colPedidos(),
    where("cliente", "==", alvo),
    orderBy("createdAt","desc"),
    limit(max)
  ));
  const out = [];
  qs.forEach(d=> out.push({ id:d.id, ...d.data() }));
  return out;
}