import {
  db, getTenantId,
  collection, query, where, orderBy, limit, getDocs
} from './firebase.js';

/** @type {Map<string, number>} */
let ultimoPrecoPorProduto = new Map(); // Mapeia: produto -> preço
let datalistEl = null;

/** Garante que o elemento <datalist> exista no DOM e o retorna. */
function ensureDatalist(){
  if (!datalistEl){
    datalistEl = document.getElementById('sugestoesItensCliente');
    if (!datalistEl){
      datalistEl = document.createElement('datalist');
      datalistEl.id = 'sugestoesItensCliente';
      document.body.appendChild(datalistEl);
    }
  }
  return datalistEl;
}

/**
 * Carrega do Firestore os últimos itens e preços de um cliente para popular as sugestões.
 * @param {string} clienteUpper Nome do cliente em UPPERCASE.
 * @param {number} [maxPedidos=80] Quantidade de pedidos recentes a serem pesquisados.
 * @returns {Promise<{itens: Array<{produto: string, ultimoPreco: number}>, map: Map<string, number>}>}
 */
export async function carregarSugestoesParaCliente(clienteUpper, maxPedidos = 80){
  ultimoPrecoPorProduto = new Map();
  const list = ensureDatalist();
  list.innerHTML = '';

  const nome = String(clienteUpper||'').trim();
  if (!nome) return { itens: [], map: ultimoPrecoPorProduto };

  try{
    const tenantId = await getTenantId();
    const col = collection(db, 'tenants', tenantId, 'pedidos');
    
    const q = query(
      col,
      where('clienteUpper', '==', nome),
      orderBy('createdAt', 'desc'),
      limit(maxPedidos)
    );
    const snap = await getDocs(q);

    const vistos = new Set();
    const itensAgrupados = [];
    snap.forEach(docSnap => {
      const d = docSnap.data() || {};
      (Array.isArray(d.itens) ? d.itens : []).forEach(it => {
        const produto = String(it.produto||'').trim();
        if (!produto || vistos.has(produto)) return; // Ignora se vazio ou já processado
        
        vistos.add(produto);
        const preco = Number(it.precoUnit ?? it.preco ?? 0) || 0;
        ultimoPrecoPorProduto.set(produto, preco);
        itensAgrupados.push({ produto, ultimoPreco: preco });
      });
    });

    // Preenche o datalist com as sugestões
    itensAgrupados.forEach(({produto, ultimoPreco})=>{
      const opt = document.createElement('option');
      opt.value = produto;
      opt.label = ultimoPreco > 0 ? `${produto} — R$ ${ultimoPreco.toFixed(2)}` : produto;
      list.appendChild(opt);
    });

    return { itens: itensAgrupados, map: ultimoPrecoPorProduto };
  }catch(e){
    console.warn('[SUGESTOES] Erro ao carregar sugestões do cliente:', e?.message||e);
    return { itens: [], map: ultimoPrecoPorProduto };
  }
}

/** 
 * Retorna o último preço conhecido para um produto, conforme as sugestões carregadas.
 * @param {string} produto O nome do produto.
 * @returns {number} O último preço sugerido, ou 0 se não houver.
 */
export function getUltimoPrecoSugerido(produto){
  return Number(ultimoPrecoPorProduto.get(String(produto||'').trim()) || 0);
}

/** 
 * Vincula um input de produto ao datalist de sugestões e configura o preenchimento
 * automático do preço correspondente.
 * @param {HTMLInputElement} prodInput O elemento input do produto.
 */
export function bindAutoCompleteNoInputProduto(prodInput){
  if (!prodInput) return;
  ensureDatalist();
  prodInput.setAttribute('list', 'sugestoesItensCliente');

  const itemEl = prodInput.closest('.item');
  const precoInput = itemEl ? itemEl.querySelector('.preco') : null;

  const tentarPreencherPreco = () => {
    if (!precoInput) return;
    const nome = String(prodInput.value||'').trim();
    const precoSugerido = getUltimoPrecoSugerido(nome);
    
    const precoAtual = Number(precoInput.value || 0);
    if ((!precoAtual || precoAtual === 0) && precoSugerido > 0){
      precoInput.value = precoSugerido.toFixed(2);
      // Dispara eventos para que outros scripts (cálculo de total, etc.) sejam acionados
      precoInput.dispatchEvent(new Event('input', { bubbles: true }));
      precoInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  prodInput.addEventListener('change', tentarPreencherPreco);
  prodInput.addEventListener('blur', tentarPreencherPreco);
}

/** Retorna o mapa de produtos e seus últimos preços. */
export function getMapUltimoPreco(){ return ultimoPrecoPorProduto; }
