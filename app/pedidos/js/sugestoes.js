// app/pedidos/js/sugestoes.js
import {
  db, getTenantId,
  collection, query, where, orderBy, limit, getDocs
} from './firebase.js';

let ultimoPrecoPorProduto = new Map(); // produto -> preço
let datalistEl = null;

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
 * Carrega do Firestore os últimos itens e preços do cliente informado.
 * @param {string} clienteUpper nome do cliente em UPPERCASE (o mesmo salvo no pedido)
 * @param {number} maxPedidos quantos pedidos recentes varrer (padrão 80)
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
    // pega pedidos mais recentes do cliente
    // OBS: assumindo que você salva createdAt/serverTimestamp ao gravar.
    const q = query(
      col,
      where('clienteUpper', '==', nome),
      orderBy('createdAt', 'desc'),
      limit(maxPedidos)
    );
    const snap = await getDocs(q);

    // percorre pedidos e coleta o último preço visto por produto
    const vistos = new Set();
    const itensAgrupados = [];
    snap.forEach(docSnap => {
      const d = docSnap.data() || {};
      (Array.isArray(d.itens) ? d.itens : []).forEach(it => {
        const produto = String(it.produto||'').trim();
        if (!produto) return;
        if (vistos.has(produto)) return; // queremos o mais recente
        vistos.add(produto);
        const preco = Number(it.precoUnit ?? it.preco ?? 0) || 0;
        ultimoPrecoPorProduto.set(produto, preco);
        itensAgrupados.push({ produto, ultimoPreco: preco });
      });
    });

    // Preenche datalist
    itensAgrupados.forEach(({produto, ultimoPreco})=>{
      const opt = document.createElement('option');
      // Mostramos “Produto — R$ 0,00” (valor informativo); o value é só o nome.
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

/** Retorna último preço conhecido para um produto (ou 0) */
export function getUltimoPrecoSugerido(produto){
  return Number(ultimoPrecoPorProduto.get(String(produto||'').trim()) || 0);
}

/** 
 * Garante que um input de produto use o datalist de sugestões,
 * e instala um auto-fill de preço quando existir sugestão.
 */
export function bindAutoCompleteNoInputProduto(prodInput){
  if (!prodInput) return;
  ensureDatalist();
  prodInput.setAttribute('list', 'sugestoesItensCliente');

  // encontra o input de preço que esteja dentro do mesmo .item
  const itemEl = prodInput.closest('.item');
  const precoInput = itemEl ? itemEl.querySelector('.preco') : null;

  const tentarPreencherPreco = () => {
    if (!precoInput) return;
    const nome = String(prodInput.value||'').trim();
    const preco = getUltimoPrecoSugerido(nome);
    // só preenche se o preço atual for 0/vazio
    const atual = Number(precoInput.value || 0);
    if ((!atual || atual === 0) && preco > 0){
      // formato com 2 casas (deixa vírgula/ponto pro seu mask se existir)
      precoInput.value = preco.toFixed(2);
      // dispara um evento para quem recalcula total/frete reagir
      precoInput.dispatchEvent(new Event('input', { bubbles: true }));
      precoInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  // Quando o usuário escolhe/termina de digitar um produto, tenta preencher o preço
  prodInput.addEventListener('change', tentarPreencherPreco);
  prodInput.addEventListener('blur', tentarPreencherPreco);
}

export function getMapUltimoPreco(){ return ultimoPrecoPorProduto; }