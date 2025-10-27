// Liga autocomplete nos inputs .produto dentro de #itens.
// - Mostra sugestões (substring match)
// - Ao escolher: preenche .preco e .tipo-select (editável depois)
// - Funciona em PC e mobile (datalist nativo + preenchimento onChange/onBlur)

import { loadCatalogoProdutos, buscarProdutos } from './produtos.js';

const SUG_MAX = 20;
const DL_ID = 'listaProdutosPadrao';

function ensureDatalist(){
  let dl = document.getElementById(DL_ID);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = DL_ID;
    document.body.appendChild(dl);
  }
  return dl;
}

function fillDatalist(lista){
  const dl = ensureDatalist();
  dl.innerHTML = '';
  lista.forEach(p => {
    const opt = document.createElement('option');
    // Exibe com preço para ajudar a escolher
    const precoTxt = isFinite(p.preco) && p.preco > 0 ? ` — R$ ${p.preco.toFixed(2)}/${p.unidade}` : '';
    opt.value = p.nome;
    opt.label = `${p.nome}${precoTxt}`;
    dl.appendChild(opt);
  });
}

function getRowElementsFrom(input){
  const row = input.closest('.item') || input.parentElement;
  if (!row) return {};
  return {
    row,
    preco: row.querySelector('.preco'),
    tipo : row.querySelector('.tipo-select'),
    qtd  : row.querySelector('.quantidade'),
  };
}

function onProdutoInput(ev){
  const el = ev.target;
  if (!el || !el.matches('input.produto')) return;
  const q = el.value || '';
  const sugestoes = buscarProdutos(q, SUG_MAX);
  fillDatalist(sugestoes);
}

function aplicarProdutoNaLinha(nomeSelecionado, inputEl){
  const { preco, tipo } = getRowElementsFrom(inputEl);
  if (!preco && !tipo) return;

  const sugestoes = buscarProdutos(nomeSelecionado, 1);
  const p = sugestoes[0];
  if (!p) return;

  // Preenche unidade (sempre) e preço (mas o usuário pode editar)
  if (tipo)  tipo.value = (p.unidade || 'KG').toUpperCase();
  if (preco && (preco.value === '' || Number(preco.value) === 0)) {
    // só preenche se estava vazio/zero; se quiser sobrescrever sempre, troque a condição
    preco.value = (isFinite(p.preco) ? p.preco.toFixed(2) : '');
  }
}

function onProdutoCommit(ev){
  const el = ev.target;
  if (!el || !el.matches('input.produto')) return;
  const nome = (el.value || '').trim();
  if (!nome) return;
  aplicarProdutoNaLinha(nome, el);
}

function bindOneInput(input){
  if (input._prodBound) return;
  input._prodBound = true;
  input.setAttribute('list', DL_ID);
  input.addEventListener('input', onProdutoInput);
  input.addEventListener('change', onProdutoCommit);
  input.addEventListener('blur', onProdutoCommit);
}

function bindAll(){
  document.querySelectorAll('#itens input.produto').forEach(bindOneInput);
}

function observeItensContainer(){
  const cont = document.getElementById('itens');
  if (!cont) return;
  const obs = new MutationObserver(() => bindAll());
  obs.observe(cont, { childList:true, subtree:true });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadCatalogoProdutos();  // carrega catálogo (FS/JSON)
  bindAll();                     // liga nos inputs existentes
  observeItensContainer();       // liga nos itens adicionados depois
});