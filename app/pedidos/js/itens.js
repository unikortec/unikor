// app/pedidos/js/itens.js
// Controle de itens do pedido (render, cálculos e eventos)

import { parsePesoFromProduto } from './utils.js';

let itens = [
  { produto: "", tipo: "KG", quantidade: 0, preco: 0, total: 0, obs: "", _pesoTotalKg: 0 }
];

// callback externo para avisar mudanças (ex.: recalcular frete)
let onEditCb = null;
export function atualizarFreteAoEditarItem(cb){
  onEditCb = typeof cb === 'function' ? cb : null;
}
function dispararOnEdit(){ try{ onEditCb && onEditCb(); }catch(e){} }

function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function calcTotalComPesoSeAplicavel({produto, tipo, quantidade, preco}){
  const q = parseFloat(quantidade)||0;
  const p = parseFloat(preco)||0;

  if (tipo === 'UN'){
    const kgUn = parsePesoFromProduto(produto);
    if (kgUn){
      const pesoTotalKg = q * kgUn;         // q unidades * kg por unidade
      const total = pesoTotalKg * p;        // p = R$ por KG
      return { total, pesoTotalKg, kgUn };
    }
  }
  return { total: (q*p), pesoTotalKg: 0, kgUn: 0 };
}

function salvarCamposAntesRender(){
  $all(".item").forEach((el, idx) => {
    if (typeof itens[idx] === "undefined") return;
    const prod  = el.querySelector(".produto")?.value || "";
    const tipo  = el.querySelector(".tipo-select")?.value || "KG";
    const qtd   = el.querySelector(".quantidade")?.value || 0;
    const preco = el.querySelector(".preco")?.value || 0;
    const obs   = el.querySelector(".obsItem")?.value || "";
    const { total, pesoTotalKg } = calcTotalComPesoSeAplicavel({produto:prod, tipo, quantidade:qtd, preco});
    itens[idx] = {
      produto: prod, tipo,
      quantidade: parseFloat(qtd) || 0,
      preco: parseFloat(preco) || 0,
      obs,
      total: Number(total || 0),
      _pesoTotalKg: pesoTotalKg || 0
    };
  });
  // opcional p/ outros módulos (pdf.js pode ler)
  window.itens = itens;
}

function criarSelectProduto(i){
  return `<input list="listaProdutos" class="produto" data-index="${i}"
            placeholder="Digite ou selecione"
            value="${itens[i].produto || ''}"/>`;
}
function criarTipoSelect(i){
  return `<select class="tipo-select" data-index="${i}">
    <option value="KG" ${itens[i].tipo === 'KG' ? 'selected' : ''}>KG</option>
    <option value="UN" ${itens[i].tipo === 'UN' ? 'selected' : ''}>UN</option>
  </select>`;
}

function updatePrecoLabelAndHints(i, root){
  const tipoEl  = root.querySelector('.tipo-select');
  const prodEl  = root.querySelector('.produto');
  const precoLbl= root.querySelector('.label-preco');
  const pesoInfo= root.querySelector(`#pesoInfo_${i}`);

  const tipo = tipoEl?.value || 'KG';
  const prod = prodEl?.value || '';

  if (tipo === 'UN'){
    const kgUn = parsePesoFromProduto(prod) || 0;
    if (kgUn > 0){
      if (precoLbl) precoLbl.textContent = 'Preço (R$/KG):';
      if (pesoInfo) pesoInfo.textContent = 'Informe o preço por KG; total calcula pela gramagem do produto.';
    } else {
      if (precoLbl) precoLbl.textContent = 'Preço Unitário (R$):';
      if (pesoInfo) pesoInfo.textContent = 'Nenhuma gramagem detectada no nome; total = unidades × preço.';
    }
  } else {
    if (precoLbl) precoLbl.textContent = 'Preço (R$/KG):';
    if (pesoInfo) pesoInfo.textContent = '';
  }
}

function bindItemEvents(i, root){
  const prodEl  = root.querySelector('.produto');
  const tipoEl  = root.querySelector('.tipo-select');
  const qtdEl   = root.querySelector('.quantidade');
  const precoEl = root.querySelector('.preco');
  const obsEl   = root.querySelector('.obsItem');
  const btnRem  = root.querySelector('.remove');

  const recalc = () => { calcularItem(i); dispararOnEdit(); updatePrecoLabelAndHints(i, root); };

  prodEl && prodEl.addEventListener('input', recalc);
  prodEl && prodEl.addEventListener('blur', recalc);
  tipoEl && tipoEl.addEventListener('change', recalc);
  qtdEl  && qtdEl.addEventListener('input', recalc);
  precoEl&& precoEl.addEventListener('input', recalc);
  obsEl  && obsEl.addEventListener('input', salvarCamposAntesRender);
  btnRem && btnRem.addEventListener('click', () => { removerItem(i); dispararOnEdit(); });
}

function calcularItem(i){
  const prod = $all(".produto")[i]?.value || "";
  const tipo = $all(".tipo-select")[i]?.value || "KG";
  const q = $all(".quantidade")[i]?.value || 0;
  const p = $all(".preco")[i]?.value || 0;

  const { total, pesoTotalKg } = calcTotalComPesoSeAplicavel({produto:prod, tipo, quantidade:q, preco:p});
  itens[i].produto = prod;
  itens[i].quantidade = parseFloat(q)||0;
  itens[i].preco = parseFloat(p)||0;
  itens[i].tipo = tipo;
  itens[i].total = Number(total||0);
  itens[i]._pesoTotalKg = pesoTotalKg||0;

  const tgt = document.getElementById(`totalItem_${i}`);
  if(tgt) tgt.innerText = itens[i].total ? itens[i].total.toFixed(2) : "0.00";

  const pi = document.getElementById(`pesoInfo_${i}`);
  if (pi){
    if (tipo==='UN' && (pesoTotalKg||0)>0){
      pi.textContent = `Peso total estimado: ${pesoTotalKg.toFixed(3)} kg (preço por kg)`;
    } else if (tipo==='UN') {
      pi.textContent = `Sem gramagem no nome do produto; usando preço unitário`;
    } else {
      pi.textContent = "";
    }
  }
}

function renderItens(){
  salvarCamposAntesRender();
  const container = $("#itens");
  if (!container) return;
  container.innerHTML = "";

  itens.forEach((item, i) => {
    const html = `
      <div class="item" data-idx="${i}">
        <label>Produto:</label>
        ${criarSelectProduto(i)}
        <label>Tipo:</label>
        ${criarTipoSelect(i)}
        <label>Quantidade:</label>
        <input type="number" step="0.01" class="quantidade" data-index="${i}" value="${item.quantidade || ''}"/>
        <label class="label-preco">Preço ${item.tipo==='UN' ? '(R$/KG)' : '(R$/KG)'}:</label>
        <input type="number" step="0.01" class="preco" data-index="${i}" value="${item.preco || ''}"/>
        <div class="peso-info" id="pesoInfo_${i}"></div>
        <label>Observação do item:</label>
        <textarea class="obsItem" data-index="${i}">${item.obs || ''}</textarea>
        <p class="total">Total do Item: R$ <span id="totalItem_${i}">${Number(item.total || 0).toFixed(2)}</span></p>
        <button class="remove">Remover Item</button>
      </div>`;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const node = wrapper.firstElementChild;
    container.appendChild(node);
    bindItemEvents(i, node);
    updatePrecoLabelAndHints(i, node);
  });

  if (!document.getElementById("listaProdutos")) {
    const dl = document.createElement("datalist"); dl.id = "listaProdutos"; document.body.appendChild(dl);
  }
}

// ===== API PÚBLICA =====
export function initItens(){
  if (!Array.isArray(itens) || itens.length === 0){
    itens = [{ produto:"", tipo:"KG", quantidade:0, preco:0, total:0, obs:"", _pesoTotalKg:0 }];
  }
  renderItens();
}

export function adicionarItem(){
  salvarCamposAntesRender();
  itens.push({ produto:"", tipo:"KG", quantidade:0, preco:0, total:0, obs:"", _pesoTotalKg:0 });
  renderItens();
}

export function removerItem(i){
  salvarCamposAntesRender();
  itens.splice(i,1);
  if(!itens.length) itens.push({ produto:"", tipo:"KG", quantidade:0, preco:0, total:0, obs:"", _pesoTotalKg:0 });
  renderItens();
}

export function getItens(){ return itens.slice(); } // usado pelo pdf.js