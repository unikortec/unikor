// app/pedidos/js/clientes.js
// CRUD de clientes por TENANT, doc-id = clienteUpper (UPPERCASE).

import {
  db, getTenantId, auth,
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from './firebase.js';
import { up } from './utils.js';

const colPath = (tenantId) => collection(db, 'tenants', tenantId, 'clientes');

/* ---------- helpers de normalização ---------- */
function onlyDigits(s){ return String(s || '').replace(/\D/g, ''); }
function toNumberBR(s){
  const txt = String(s ?? '').trim().replace(/\./g,'').replace(',','.');
  const n = Number(txt);
  return Number.isFinite(n) ? n : 0;
}

/* ---------- monta payload base (sem created/updated) ---------- */
function basePayload({ nomeUpper, endereco, isentoFrete, extra = {} }) {
  const freteNum = isentoFrete ? 0 : toNumberBR(extra.frete);
  return {
    clienteUpper : nomeUpper,                       // chave canônica
    nome         : nomeUpper,                       // redundante p/ listagens
    endereco     : String(endereco || '').trim().toUpperCase(),
    cnpj         : onlyDigits(extra.cnpj),
    ie           : String(extra.ie || '').trim().toUpperCase() || 'ISENTO',
    cep          : onlyDigits(extra.cep),
    contato      : onlyDigits(extra.contato),
    isentoFrete  : !!isentoFrete,
    frete        : freteNum
  };
}

/**
 * Salva/atualiza um cliente (idempotente por doc-id = UPPER(nome)).
 * - Na **criação**: define tenantId, createdAt, createdBy, updatedAt, updatedBy.
 * - No **update**: NÃO redefine createdAt/createdBy (evita conflito com validAuthorFields()).
 */
export async function salvarCliente(nome, endereco, isentoFrete, extra = {}) {
  const tenantId = await getTenantId();
  const user = auth.currentUser;
  if (!user) throw new Error('Não autenticado');

  const nomeUpper = up(nome || '').trim();
  if (!nomeUpper) throw new Error('Nome do cliente inválido');

  const ref = doc(colPath(tenantId), nomeUpper);
  const snap = await getDoc(ref);
  const now = serverTimestamp();

  const core = basePayload({ nomeUpper, endereco, isentoFrete, extra });

  let data;
  if (!snap.exists()) {
    // CREATE
    data = {
      ...core,
      tenantId   : tenantId,   // casa com matchesTenantField(tenantId)
      createdAt  : now,        // regras aceitam timestamp
      createdBy  : user.uid,   // regras: createdBy == auth.uid se enviado
      updatedAt  : now,
      updatedBy  : user.uid
    };
  } else {
    // UPDATE (não mexe em createdAt/createdBy)
    data = {
      ...core,
      tenantId   : tenantId,   // manter explícito
      updatedAt  : now,
      updatedBy  : user.uid
    };
  }

  await setDoc(ref, data, { merge: true });
  return { ok: true, id: nomeUpper };
}

/**
 * Busca informações do cliente por nome (case-insensitive – usamos UPPER como id)
 */
export async function buscarClienteInfo(nome) {
  const tenantId = await getTenantId();
  const nomeUpper = up(nome || '').trim();
  if (!nomeUpper) return null;
  const ref = doc(colPath(tenantId), nomeUpper);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() || {};
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
 * Busca TODOS os clientes (para datalist)
 */
export async function buscarTodosClientes() {
  const tenantId = await getTenantId();
  const clientesCol = colPath(tenantId);
  const snapshot = await getDocs(clientesCol);
  return snapshot.docs.map(doc => ({ id: doc.id }));
}

/**
 * Lista até N clientes “mais usados” a partir de pedidos recentes,
 * caindo para a coleção de clientes se necessário.
 */
export async function clientesMaisUsados(max = 80) {
  try {
    const tenantId = await getTenantId();
    const pedidos = collection(db, 'tenants', tenantId, 'pedidos');
    const q = query(pedidos, orderBy('createdAt', 'desc'), limit(Math.max(20, max)));
    const snap = await getDocs(q);
    const uniq = new Set();
    snap.forEach(docSnap => {
      const d = docSnap.data() || {};
      const nome = String(d.clienteUpper || d.cliente || '').trim().toUpperCase();
      if (nome) uniq.add(nome);
    });
    if (uniq.size === 0) {
      const clsnap = await getDocs(query(colPath(tenantId), orderBy('createdAt', 'desc'), limit(max)));
      clsnap.forEach(ds => {
        const n = String((ds.data() || {}).clienteUpper || '').trim();
        if (n) uniq.add(n);
      });
    }
    return Array.from(uniq).slice(0, max);
  } catch (e) {
    console.warn('[clientes.js] clientesMaisUsados falhou:', e?.message || e);
    return [];
  }
}