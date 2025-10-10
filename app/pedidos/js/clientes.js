// app/pedidos/js/clientes.js
// CRUD simplificado de clientes por TENANT, em coleção própria.
// Doc-id = clienteUpper (UPPERCASE), para busca direta e consistente com pedidos.

import {
  db, getTenantId,
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from './firebase.js';
import { up } from './utils.js';

const colPath = (tenantId) => collection(db, 'tenants', tenantId, 'clientes');

/** Normaliza payload do cliente antes de salvar */
function normalizeCliente(nomeUpper, endereco, isentoFrete, extra = {}) {
  const toDigits = (s) => String(s || '').replace(/\D/g, '');
  const freteStr = String(extra.frete || '').trim().replace(',', '.');
  const freteNum = freteStr ? Number(freteStr) : 0;

  return {
    clienteUpper : nomeUpper,            // chave canônica
    nome         : nomeUpper,            // redundante p/ listagens
    endereco     : String(endereco || '').trim().toUpperCase(),
    cnpj         : toDigits(extra.cnpj || ''),
    ie           : String(extra.ie || '').trim().toUpperCase(),
    cep          : toDigits(extra.cep || ''),
    contato      : toDigits(extra.contato || ''),
    isentoFrete  : !!isentoFrete,
    frete        : (isentoFrete ? 0 : (isFinite(freteNum) ? freteNum : 0)),
    updatedAt    : serverTimestamp(),
    createdAt    : serverTimestamp(),    // primeira vez prevalece; rules aceitam ambos
  };
}

/**
 * Salva/atualiza um cliente (idempotente por doc-id = UPPER(nome)).
 * @param {string} nome Nome livre do cliente
 * @param {string} endereco Endereço (pode ter cidade)
 * @param {boolean} isentoFrete
 * @param {{cnpj?:string, ie?:string, cep?:string, contato?:string, frete?:string|number}} extra
 */
export async function salvarCliente(nome, endereco, isentoFrete, extra = {}) {
  const tenantId = await getTenantId();
  const nomeUpper = up(nome || '').trim();
  if (!nomeUpper) throw new Error('Nome do cliente inválido');

  const ref = doc(colPath(tenantId), nomeUpper);
  const data = normalizeCliente(nomeUpper, endereco, isentoFrete, extra);

  // merge:true preserva createdAt anterior; updatedAt recebe novo valor
  await setDoc(ref, data, { merge: true });
  return { ok: true, id: nomeUpper };
}

/**
 * Busca informações do cliente por nome (case-insensitive – usamos UPPER como id)
 * Retorna { endereco, cnpj, ie, cep, contato, isentoFrete, frete } ou null.
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
 * Lista até N clientes “mais usados”.
 * Estratégia simples: varre últimos pedidos e coleta nomes únicos.
 * (sem precisar manter uma coleção auxiliar)
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

    // Se não houver nenhum pedido ainda, opcionalmente podemos cair para a coleção clientes
    if (uniq.size === 0) {
      const clsnap = await getDocs(query(colPath(tenantId), orderBy('createdAt', 'desc'), limit(max)));
      clsnap.forEach(ds => { const n = String((ds.data() || {}).clienteUpper || '').trim(); if (n) uniq.add(n); });
    }

    return Array.from(uniq).slice(0, max);
  } catch (e) {
    console.warn('[clientes.js] clientesMaisUsados falhou:', e?.message || e);
    return [];
  }
}
