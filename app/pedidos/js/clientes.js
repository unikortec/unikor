// app/pedidos/js/clientes.js
// CRUD de clientes por TENANT, compatível com legado (auto-ID) e com migração para id=nomeUpper.

import {
  db, getTenantId, auth,
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from './firebase.js';
import { up } from './utils.js';

const colPath = (tenantId) => collection(db, 'tenants', tenantId, 'clientes');

/* ---------------------- Helpers ---------------------- */

function normalizeCliente(nomeUpper, endereco, isentoFrete, extra = {}) {
  const toDigits = (s) => String(s || '').replace(/\D/g, '');
  const freteStr = String(extra.frete ?? '').trim().replace(',', '.');
  const freteNum = freteStr ? Number(freteStr) : 0;

  return {
    tenantId     : null, // preenchido no salvar
    clienteUpper : nomeUpper,                 // chave canônica
    nomeUpper    : nomeUpper,                 // compat legado
    nome         : nomeUpper,                 // redundante p/ listagens
    endereco     : String(extra.endereco ?? endereco ?? '').trim().toUpperCase(),
    cnpj         : toDigits(extra.cnpj || ''),
    ie           : String(extra.ie || '').trim().toUpperCase(),
    cep          : toDigits(extra.cep || ''),
    contato      : toDigits(extra.contato || ''),
    isentoFrete  : !!isentoFrete,
    frete        : (isentoFrete ? 0 : (isFinite(freteNum) ? freteNum : 0)),
    // createdAt/By e updatedAt/By controlados abaixo
  };
}

// Localiza cliente independentemente do esquema (ordem forte):
// 1) doc id = nomeUpper
// 2) where('clienteUpper' == nomeUpper)
// 3) where('nomeUpper'    == nomeUpper)  // legado
async function findClienteDocRef(tenantId, nomeUpper) {
  const col = colPath(tenantId);

  // 1) id direto
  const byIdRef = doc(col, nomeUpper);
  const byIdSnap = await getDoc(byIdRef);
  if (byIdSnap.exists()) return { ref: byIdRef, snap: byIdSnap, existed: true, via: 'id' };

  // 2) clienteUpper
  const q1 = query(col, where('clienteUpper', '==', nomeUpper), limit(1));
  const s1 = await getDocs(q1);
  if (!s1.empty) return { ref: s1.docs[0].ref, snap: s1.docs[0], existed: true, via: 'clienteUpper' };

  // 3) nomeUpper (legado)
  const q2 = query(col, where('nomeUpper', '==', nomeUpper), limit(1));
  const s2 = await getDocs(q2);
  if (!s2.empty) return { ref: s2.docs[0].ref, snap: s2.docs[0], existed: true, via: 'nomeUpper' };

  // não existe: sugerimos usar id=nomeUpper
  return { ref: byIdRef, snap: null, existed: false, via: 'new' };
}

/* ---------------------- API ---------------------- */

/**
 * Salva/atualiza um cliente (idempotente, compatível com docs legados) e
 * MIGRA para `id = nomeUpper` quando necessário.
 *
 * - Se já existir (id direto ou via where), atualiza esse doc.
 * - Se existir com ID aleatório, cria/mescla um doc com id=nomeUpper e marca o antigo com { mergedInto }.
 * - Se não existir, cria doc com id = nomeUpper.
 */
export async function salvarCliente(nome, endereco, isentoFrete, extra = {}) {
  const tenantId = await getTenantId();
  const nomeUpper = up(nome || '').trim();
  if (!nomeUpper) throw new Error('Nome do cliente inválido');

  const found = await findClienteDocRef(tenantId, nomeUpper);
  const col = colPath(tenantId);

  const base = normalizeCliente(nomeUpper, endereco, isentoFrete, { ...extra, endereco });
  base.tenantId  = tenantId;
  base.updatedAt = serverTimestamp();
  base.updatedBy = auth?.currentUser?.uid || null;

  // alvo definitivo SEMPRE é id = nomeUpper
  const targetRef = doc(col, nomeUpper);

  if (!found.existed) {
    // criação nova no id=nomeUpper
    base.createdAt = serverTimestamp();
    base.createdBy = auth?.currentUser?.uid || null;
    await setDoc(targetRef, base, { merge: true });
    return { ok: true, id: targetRef.id, existed: false, nomeUpper };
  }

  // já existe
  const existingId = found.ref.id;

  if (existingId === nomeUpper) {
    // já está no id correto — só atualiza
    await setDoc(found.ref, base, { merge: true });
    return { ok: true, id: found.ref.id, existed: true, nomeUpper };
  }

  // ⚠️ Existe com ID aleatório -> MIGRAR
  const existingData = found.snap?.data?.() || {};
  // 1) mescla tudo no destino (id=nomeUpper)
  const merged = {
    ...existingData,
    ...base,
    // quem vencer: os campos do base (dados atuais da tela)
    mergedFrom: existingId,
  };
  await setDoc(targetRef, merged, { merge: true });

  // 2) sinaliza no doc antigo para histórico
  try {
    await setDoc(found.ref, {
      mergedInto: nomeUpper,
      updatedAt: serverTimestamp(),
      updatedBy: auth?.currentUser?.uid || null,
    }, { merge: true });
  } catch {}

  return { ok: true, id: targetRef.id, existed: true, migrated: true, from: existingId, nomeUpper };
}

/**
 * Busca informações do cliente por nome (case-insensitive).
 * Tolerante a docs com auto-ID (legado) e pós-migração.
 */
export async function buscarClienteInfo(nome) {
  const tenantId = await getTenantId();
  const nomeUpper = up(nome || '').trim();
  if (!nomeUpper) return null;

  const found = await findClienteDocRef(tenantId, nomeUpper);
  const finalSnap = found.existed ? found.snap : await getDoc(found.ref);
  if (!finalSnap?.exists()) return null;

  const d = finalSnap.data() || {};
  return {
    endereco    : d.endereco || '',
    cnpj        : d.cnpj || '',
    ie          : d.ie || '',
    cep         : d.cep || '',
    contato     : d.contato || '',
    isentoFrete : !!d.isentoFrete,
    frete       : Number(d.frete || 0)
  };
}

/** Lista alfabeticamente (unindo clienteUpper e nomeUpper). */
export async function listarClientesAlfabetico(max = 500) {
  const tenantId = await getTenantId();
  const col = colPath(tenantId);

  // A) por clienteUpper
  const qA = query(col, orderBy('clienteUpper'), limit(max));
  const sA = await getDocs(qA);

  // B) por nomeUpper (legado)
  const qB = query(col, orderBy('nomeUpper'), limit(max));
  const sB = await getDocs(qB);

  const nomes = new Set();
  sA.forEach(ds => {
    const d = ds.data() || {};
    const n = String(d.clienteUpper || '').trim();
    if (n) nomes.add(n);
  });
  sB.forEach(ds => {
    const d = ds.data() || {};
    const n = String(d.nomeUpper || d.clienteUpper || '').trim();
    if (n) nomes.add(n);
  });

  return Array.from(nomes).sort().slice(0, max);
}

/** Antigo: todos os clientes (ids) — mantido por compat. */
export async function buscarTodosClientes() {
  const tenantId = await getTenantId();
  const snap = await getDocs(colPath(tenantId));
  return snap.docs.map(ds => {
    const d = ds.data() || {};
    return { id: (d.clienteUpper || d.nomeUpper || ds.id || '').toString() };
  }).filter(x => x.id);
}

/** Clientes mais usados (mantido) */
export async function clientesMaisUsados(max = 80) {
  try {
    const tenantId = await getTenantId();

    const pedidos = collection(db, 'tenants', tenantId, 'pedidos');
    const qPed = query(pedidos, orderBy('createdAt', 'desc'), limit(Math.max(20, max)));
    const sPed = await getDocs(qPed);

    const uniq = new Set();
    sPed.forEach(ds => {
      const d = ds.data() || {};
      const nome = String(d.clienteUpper || d.cliente || '').trim().toUpperCase();
      if (nome) uniq.add(nome);
    });

    if (uniq.size === 0) {
      const qCli = query(colPath(tenantId), orderBy('clienteUpper'), limit(max));
      const sCli = await getDocs(qCli);
      sCli.forEach(ds => {
        const d = ds.data() || {};
        const nome = String(d.clienteUpper || d.nomeUpper || d.nome || '').trim().toUpperCase();
        if (nome) uniq.add(nome);
      });
    }

    return Array.from(uniq).slice(0, max);
  } catch (e) {
    console.warn('[clientes.js] clientesMaisUsados falhou:', e?.message || e);
    return [];
  }
}