// /app/pedidos/js/autocomplete-produtos.js
//
// Autocomplete de produtos do catálogo Firestore (tenant-aware):
// - Busca produtos em tenants/{tenantId}/produtos
// - Sugestões por substring (não apenas prefixo)
// - Preenche automaticamente unidade e preço padrão
// - Permite editar nome, preço e unidade livremente
// - Se o produto não existir, o usuário pode incluir manualmente

import { db, getTenantId, collection, getDocs } from './firebase.js';

const SUG_MAX = 20;
const DL_ID = 'listaProdutosPadrao';

let cacheProdutos = []; // cache local com todos os produtos do tenant
let cacheReady = false;

/* ---------------------------- Carregamento ---------------------------- */
export async function loadCatalogoProdutos() {
  try {
    const tenantId = await getTenantId();
    const colRef = collection(db, 'tenants', tenantId, 'produtos');
    const snap = await getDocs(colRef);

    cacheProdutos = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        nome: String(data.nomeUpper || data.nome || '').toUpperCase().trim(),
        preco: Number(data.preco || 0),
        unidade: (data.unidade || 'KG').toUpperCase(),
        ativo: data.ativo !== false,
      };
    }).filter((p) => p.ativo && p.nome);
    cacheReady = true;
    console.info(`[Produtos] catálogo carregado (${cacheProdutos.length})`);
  } catch (e) {
    console.warn('[Produtos] Falha ao carregar catálogo:', e);
    cacheProdutos = [];
    cacheReady = false;
  }
}

/* ---------------------------- Busca local ----------------------------- */
export function buscarProdutos(query, max = SUG_MAX) {
  if (!cacheReady || !query) return [];
  const q = String(query).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const results = cacheProdutos.filter((p) =>
    p.nome.includes(q) // “contém” (meio, início ou fim)
  );
  return results.slice(0, max);
}

/* ---------------------------- Datalist ---------------------------- */
function ensureDatalist() {
  let dl = document.getElementById(DL_ID);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = DL_ID;
    document.body.appendChild(dl);
  }
  return dl;
}

function fillDatalist(lista) {
  const dl = ensureDatalist();
  dl.innerHTML = '';
  lista.forEach((p) => {
    const opt = document.createElement('option');
    const precoTxt = isFinite(p.preco) && p.preco > 0 ? ` — R$ ${p.preco.toFixed(2)}/${p.unidade}` : '';
    opt.value = p.nome;
    opt.label = `${p.nome}${precoTxt}`;
    dl.appendChild(opt);
  });
}

/* ---------------------------- Helpers linha ---------------------------- */
function getRowElementsFrom(input) {
  const row = input.closest('.item') || input.parentElement;
  if (!row) return {};
  return {
    row,
    preco: row.querySelector('.preco'),
    tipo: row.querySelector('.tipo-select'),
    qtd: row.querySelector('.quantidade'),
  };
}

/* ---------------------------- Handlers ---------------------------- */
function onProdutoInput(ev) {
  const el = ev.target;
  if (!el || !el.matches('input.produto')) return;
  const termo = el.value || '';
  const sugestoes = buscarProdutos(termo, SUG_MAX);
  fillDatalist(sugestoes);
}

function aplicarProdutoNaLinha(nomeSelecionado, inputEl) {
  const { preco, tipo } = getRowElementsFrom(inputEl);
  if (!preco && !tipo) return;

  const nome = (nomeSelecionado || '').toUpperCase().trim();
  const sugestoes = buscarProdutos(nome, 1);
  const p = sugestoes[0];
  if (!p) return; // não achou, não altera nada

  // Unidade padrão do catálogo (mas o campo continua editável)
  if (tipo) tipo.value = (p.unidade || 'KG').toUpperCase();

  // Preço do catálogo — mas o usuário pode mudar depois
  if (preco) {
    preco.value = isFinite(p.preco) ? p.preco.toFixed(2) : '';
    preco.dataset.source = 'catalogo';
  }
}

function onProdutoCommit(ev) {
  const el = ev.target;
  if (!el || !el.matches('input.produto')) return;
  const nome = (el.value || '').trim();
  if (!nome) return;
  aplicarProdutoNaLinha(nome, el);
}

/* ---------------------------- Bind & Observer ---------------------------- */
function bindOneInput(input) {
  if (input._prodBound) return;
  input._prodBound = true;
  input.setAttribute('list', DL_ID);
  input.addEventListener('input', onProdutoInput);
  input.addEventListener('change', onProdutoCommit);
  input.addEventListener('blur', onProdutoCommit);

  // Permite edição livre
  input.removeAttribute('readonly');
}

function bindAll() {
  document.querySelectorAll('#itens input.produto').forEach(bindOneInput);

  // garante também que preço e unidade são editáveis
  document.querySelectorAll('#itens input.preco, #itens select.tipo-select')
    .forEach((el) => el.removeAttribute('readonly'));
}

function observeItensContainer() {
  const cont = document.getElementById('itens');
  if (!cont) return;
  const obs = new MutationObserver(() => bindAll());
  obs.observe(cont, { childList: true, subtree: true });
}

/* ---------------------------- Init ---------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadCatalogoProdutos(); // carrega catálogo do Firestore
  bindAll();                    // inputs atuais
  observeItensContainer();      // inputs futuros
});