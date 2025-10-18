// app/pedidos/js/clientes.js
// CRUD de clientes por TENANT, tolerante a legado (auto-ID ou id=nomeUpper).

import {
  db, getTenantId, auth,
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from './firebase.js';
import { up } from './utils.js';

const colPath = (tenantId) => collection(db, 'tenants', tenantId, 'clientes');

/* ---------------------- Helpers ---------------------- */

// normaliza payload sempre no mesmo formato
function normalizeCliente(nomeUpper, endereco, isentoFrete, extra = {}) {
  const toDigits = (s) => String(s || '').replace(/\D/g, '');
  const freteStr = String(extra.frete ?? '').trim().replace(',', '.');
  const freteNum = freteStr ? Number(freteStr) : 0;

  return {
    tenantId     : null,                     // preenchido no salvar
    clienteUpper : nomeUpper,                // chave canônica
    nome         : nomeUpper,                // redundante p/ listagens
    endereco     : String(endereco || '').trim().toUpperCase(),
    cnpj         : toDigits(extra.cnpj || ''),
    ie           : String(extra.ie || '').trim().toUpperCase(),
    cep          : toDigits(extra.cep || ''),
    contato      : toDigits(extra.contato || ''),
    isentoFrete  : !!isentoFrete,
    frete        : (isentoFrete ? 0 : (isFinite(freteNum) ? freteNum : 0)),
    // carimbos controlados abaixo (created*/updated*)
  };
}

// Localiza um cliente existente independente do esquema:
// 1) tenta id direto = nomeUpper
// 2) tenta where('clienteUpper' == nomeUpper)
// 3) tenta where('nomeUpper'    == nomeUpper)  // legado
async function findClienteDocRef(tenantId, nomeUpper) {
  const col = colPath(tenantId);

  // 1) id direto
  const directRef = doc(col, nomeUpper);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) return { ref: directRef, snap: directSnap, existed: true };

  // 2) campo atual
  const q1 = query(col, where('clienteUpper', '==', nomeUpper), limit(1));
  const s1 = await getDocs(q1);
  if (!s1.empty) return { ref: s1.docs[0].ref, snap: s1.docs[0], existed: true };

  // 3) campo legado
  const q2 = query(col, where('nomeUpper', '==', nomeUpper), limit(1));
  const s2 = await getDocs(q2);
  if (!s2.empty) return { ref: s2.docs[0].ref, snap: s2.docs[0], existed: true };

  // não existe: sugerimos usar id=nomeUpper
  return { ref: directRef, snap: null, existed: false };
}

/* ---------------------- API ---------------------- */

/**
 * Salva/atualiza um cliente (idempotente e compatível com docs legados).
 * - Se já existir (id direto ou via where), atualiza esse doc.
 * - Se não existir, cria doc com id = nomeUpper.
 */
export async function salvarCliente(nome, endereco, isentoFrete, extra = {}) {
  const tenantId = await getTenantId();
  const nomeUpper = up(nome || '').trim();
  if (!nomeUpper) throw new Error('Nome do cliente inválido');

  const { ref, snap, existed } = await findClienteDocRef(tenantId, nomeUpper);

  const base = normalizeCliente(nomeUpper, endereco, isentoFrete, extra);
  base.tenantId  = tenantId;
  base.updatedAt = serverTimestamp();
  base.updatedBy = auth?.currentUser?.uid || null;

  // só define created* na criação
  if (!existed) {
    base.createdAt = serverTimestamp();
    base.createdBy = auth?.currentUser?.uid || null;
  }

  // merge:true preserva campos preexistentes (inclusive createdAt)
  await setDoc(ref, base, { merge: true });
  return { ok: true, id: ref.id, existed };
}

/**
 * Busca informações do cliente por nome (case-insensitive).
 * Tolera docs com auto-ID (legado).
 */
export async function buscarClienteInfo(nome) {
  const tenantId = await getTenantId();
  const nomeUpper = up(nome || '').trim();
  if (!nomeUpper) return null;

  const { ref, snap, existed } = await findClienteDocRef(tenantId, nomeUpper);
  const finalSnap = existed ? snap : await getDoc(ref);
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

/**
 * Retorna todos os clientes (apenas ids para o datalist).
 * Observação: quando o doc tem auto-ID, devolvemos o próprio id aleatório.
 * Para o seu datalist (que usa nomes), é melhor misturar ids com o campo nome.
 */
export async function buscarTodosClientes() {
  const tenantId = await getTenantId();
  const snap = await getDocs(colPath(tenantId));
  return snap.docs.map(ds => {
    const d = ds.data() || {};
    // preferir o nomeUpper/clienteUpper para compor a lista
    return { id: (d.clienteUpper || d.nomeUpper || ds.id || '').toString() };
  }).filter(x => x.id);
}

/**
 * Lista até N clientes “mais usados”.
 * Continua olhando pedidos recentes; se vazio, cai para coleção de clientes.
 */
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
      // cai para a coleção de clientes (pega pelo campo de nome, não o docId)
      const qCli = query(colPath(tenantId), orderBy('createdAt', 'desc'), limit(max));
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