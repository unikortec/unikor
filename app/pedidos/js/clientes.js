// app/pedidos/js/clientes.js
// CRUD simplificado de clientes por TENANT, em coleção própria.
// Doc-id = clienteUpper (UPPERCASE), para busca direta e consistente com pedidos.
import {
  db, getTenantId,
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, serverTimestamp
} from './firebase.js';
import { up } from './utils.js';

// Retorna a referência para a subcoleção de clientes do tenant.
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

  // merge:true preserva o campo 'createdAt' se o documento já existir.
  await setDoc(ref, data, { merge: true });
  return { ok: true, id: nomeUpper };
}

/**
 * Busca informações do cliente por nome (case-insensitive – usamos UPPER como id)
 * Retorna { endereco, cnpj, ie, cep, contato, isentoFrete, frete } ou null.
 */
export async function buscarClienteInfo(nome) {
  console.log(`[clientes.js] Iniciando busca por: "${nome}"`);
  const tenantId = await getTenantId();
  const nomeUpper = up(nome || '').trim();

  if (!tenantId) {
    console.error('[clientes.js] ERRO: Tenant ID não encontrado. O usuário está logado?');
    return null;
  }
  if (!nomeUpper) {
    console.warn('[clientes.js] AVISO: Nome do cliente está vazio.');
    return null;
  }

  const docPath = `tenants/${tenantId}/clientes/${nomeUpper}`;
  console.log(`[clientes.js] Consultando Firestore em: "${docPath}"`);

  const ref = doc(db, docPath);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.warn(`[clientes.js] Cliente "${nomeUpper}" não encontrado no banco de dados.`);
    return null;
  }

  const d = snap.data() || {};
  console.log('[clientes.js] Cliente encontrado! Dados:', d);

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
 * Estratégia: varre últimos pedidos e coleta nomes únicos.
 */
export async function clientesMaisUsados(max = 80) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
        console.error('[clientes.js] ERRO em clientesMaisUsados: Tenant ID não encontrado.');
        return [];
    }

    // 1. Tenta buscar clientes a partir dos pedidos recentes
    const pedidosCol = collection(db, 'tenants', tenantId, 'pedidos');
    const qPedidos = query(pedidosCol, orderBy('createdAt', 'desc'), limit(Math.max(20, max)));
    const snapPedidos = await getDocs(qPedidos);

    const uniq = new Set();
    snapPedidos.forEach(docSnap => {
      const d = docSnap.data() || {};
      const nome = String(d.clienteUpper || d.cliente || '').trim().toUpperCase();
      if (nome) uniq.add(nome);
    });

    // 2. Se não houver pedidos, busca da própria coleção de clientes como fallback
    if (uniq.size === 0) {
      console.log('[clientes.js] Nenhum pedido recente encontrado, buscando na coleção de clientes.');
      const qClientes = query(colPath(tenantId), orderBy('createdAt', 'desc'), limit(max));
      const snapClientes = await getDocs(qClientes);
      snapClientes.forEach(ds => {
        const n = String((ds.data() || {}).clienteUpper || '').trim();
        if (n) uniq.add(n);
      });
    }

    const result = Array.from(uniq).slice(0, max);
    console.log(`[clientes.js] Lista de clientes para datalist carregada: ${result.length} nomes.`);
    return result;

  } catch (e) {
    console.error('[clientes.js] Falha crítica ao buscar clientesMaisUsados:', e);
    // Verifique no console do navegador se há um erro de "Missing index".
    // O Firestore pode exigir um índice para a consulta `orderBy('createdAt')`.
    return [];
  }
}
