// Carrega catálogo de produtos (multi-tenant), com fallback para JSON local.
// Estrutura esperada de cada produto:
// { nome: "PICANHA", preco: 64.90, unidade: "KG", aliases: ["MAMINHA..."], ativo:true }
//
// Firestore (primeiro que existir):
//   tenants/{tenantId}/produtos            (coleção)
//   tenants/{tenantId}/config/produtos     (coleção)
// Fallback (opcional): /app/pedidos/config/produtos.json  (array)

import { db, getTenantId, collection, getDocs, query, orderBy } from './firebase.js';

let _catalogo = [];
let _idxReady = false;

const norm = (s) => String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\w\s]/g,' ')
  .replace(/\s+/g,' ')
  .trim()
  .toUpperCase();

function mkSearchKey(p) {
  const base = [p.nome, ...(Array.isArray(p.aliases)?p.aliases:[])].filter(Boolean).join(' ');
  return norm(base);
}

function normalizeProduto(raw){
  const nome = norm(raw.nome || raw.titulo || '');
  if (!nome) return null;
  const unidade = String(raw.unidade || raw.un || 'KG').trim().toUpperCase();
  const preco = Number(raw.preco ?? raw.valor ?? 0);
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.map(norm).filter(Boolean) : [];
  const ativo = raw.ativo !== false;
  const searchKey = mkSearchKey({ nome, aliases });
  return { nome, preco, unidade, aliases, ativo, searchKey };
}

async function loadFromFirestore(){
  const tenantId = await getTenantId();
  const colPaths = [
    collection(db, 'tenants', tenantId, 'produtos'),
    collection(db, 'tenants', tenantId, 'config', 'produtos'),
  ];

  for (const col of colPaths) {
    try {
      // tentar ordenar por nome quando possível
      let snap;
      try { snap = await getDocs(query(col, orderBy('nome'))); }
      catch { snap = await getDocs(col); }

      const arr = snap.docs.map(d => normalizeProduto(d.data() || {})).filter(Boolean);
      if (arr.length) return arr;
    } catch {}
  }
  return [];
}

async function loadFromJSON(){
  try{
    const resp = await fetch('/app/pedidos/config/produtos.json', { cache: 'no-store' });
    if (!resp.ok) return [];
    const arr = await resp.json();
    return (Array.isArray(arr) ? arr : []).map(normalizeProduto).filter(Boolean);
  }catch { return []; }
}

export async function loadCatalogoProdutos(force=false){
  if (_catalogo.length && !force) return _catalogo;
  const fs = await loadFromFirestore();
  _catalogo = fs.length ? fs : await loadFromJSON();
  _idxReady = true;
  return _catalogo;
}

export function getCatalogoSync(){ return _catalogo.slice(); }

/** Busca por substring (não só prefixo), acentos/caixa ignorados. */
export function buscarProdutos(term, max=20){
  if (!_idxReady) return [];
  const q = norm(term);
  if (!q) return _catalogo.slice(0, max);

  // inclui se o searchKey contiver TODOS os tokens pesquisados
  const tokens = q.split(' ').filter(Boolean);
  const res = [];
  for (const p of _catalogo) {
    if (p.ativo === false) continue;
    const key = p.searchKey;
    let ok = true;
    for (const t of tokens) { if (!key.includes(t)) { ok = false; break; } }
    if (ok) res.push(p);
    if (res.length >= max) break;
  }
  return res;
}