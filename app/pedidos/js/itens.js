// app/pedidos/js/itens.js
// Desenha e gerencia a lista de itens do pedido.
// Integra com frete: expõe atualizarFreteAoEditarItem(cb) para app.js ligar o recálculo.

import { up } from './utils.js';

// =============== Estado ===============
const state = {
  onEditCallbacks: new Set(),   // para recalcular frete quando algo muda
};

// =============== Helpers ===============
const $ = (sel, root=document) => root.querySelector(sel);
function num(val){ const n = parseFloat(String(val).replace(',','.')); return isFinite(n) ? n : 0; }

// normaliza texto do produto: remove espaços no começo e colapsa múltiplos
function normalizeProdutoText(s){
  return String(s||'').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
}

// =============== Template da linha ===============
function criarLinhaItem(values={}){
  const { produto='', tipo='KG', quantidade='', preco='', obs='' } = values;

  const wrap = document.createElement('div');
  wrap.className = 'item';

  wrap.innerHTML = `
    <div class="row">
      <div class="col col-prod">
        <label>Produto</label>
        <input class="produto" type="text" placeholder="Ex.: Picanha 1,2kg" />
      </div>

      <div class="col col-tipo">
        <label>Un</label>
        <select class="tipo-select">
          <option value="KG">KG</option>
          <option value="UN">UN</option>
        </select>
      </div>

      <div class="col col-qtd">
        <label>Qtd</label>
        <input class="quantidade" inputmode="decimal" placeholder="0,000" />
      </div>

      <div class="col col-preco">
        <label class="label-preco">Preço (R$/KG)</label>
        <input class="preco" inputmode="decimal" placeholder="0,00" />
      </div>

      <div class="col col-rem">
        <label>&nbsp;</label>
        <button class="btn danger btn-remover" type="button">Remover</button>
      </div>
    </div>
    <div class="row">
      <div class="col col-obs">
        <label>Observações do item (opcional)</label>
        <input class="obsItem" type="text" placeholder="Ex.: Cortar em bifes, sem gordura" />
        <div class="peso-info" id="pesoInfo_tmp"></div>
      </div>
    </div>
  `;

  // refs
  const inpProd = $('.produto', wrap);
  const selTipo = $('.tipo-select', wrap);
  const inpQtd  = $('.quantidade', wrap);
  const inpPreco= $('.preco', wrap);
  const inpObs  = $('.obsItem', wrap);
  const btnRem  = $('.btn-remover', wrap);
  const pesoInfo= $('.peso-info', wrap);
  const precoLbl= $('.label-preco', wrap);

  // valores iniciais
  inpProd.value = normalizeProdutoText(produto);
  selTipo.value = (tipo||'KG').toUpperCase() === 'UN' ? 'UN' : 'KG';
  inpQtd.value  = quantidade === '' ? '' : String(quantidade).replace('.', ',');
  inpPreco.value= preco === '' ? '' : String(preco).replace('.', ',');
  inpObs.value  = (obs||'').toString();

  // cálculo/atualização do total do item (p/ #totalItem_N)
  const recalcTotalVis = ()=>{
    const container = document.getElementById('itens');
    const idx = Array.from(container.querySelectorAll('.item')).indexOf(wrap);
    const idSpan = `totalItem_${idx}`;
    let span = document.getElementById(idSpan);
    if (!span) {
      // cria o display de total se ainda não existir
      const p = document.createElement('p');
      p.className = 'total';
      p.innerHTML = `Total do Item: R$ <span id="${idSpan}">0,00</span>`;
      wrap.appendChild(p);
      span = document.getElementById(idSpan);
    }

    const tipo = selTipo.value;
    const q = num(inpQtd.value);
    const pr = num(inpPreco.value);
    const prod = inpProd.value.toLowerCase();

    // procura gramagem no nome quando UN (ex.: "1,2kg", "800 g")
    let pesoTotalKg = 0;
    if (tipo === 'UN') {
      const m = /(\d+(?:[.,]\d+)?)[\s]*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b/.exec(prod);
      if (m){
        const val = parseFloat((m[1]||"").replace(",", ".")) || 0;
        const kgUn = (m[2].startsWith("kg") || m[2].startsWith("quilo")) ? val : val/1000;
        pesoTotalKg = q * kgUn;
        span.textContent = (pesoTotalKg * pr).toFixed(2).replace('.', ',');
        precoLbl.textContent = 'Preço (R$/KG)';
        pesoInfo.textContent = `Peso total estimado: ${pesoTotalKg.toFixed(3)} kg`;
      } else {
        span.textContent = (q * pr).toFixed(2).replace('.', ',');
        precoLbl.textContent = 'Preço Unitário (R$)';
        pesoInfo.textContent = 'Sem gramagem detectada no nome';
      }
    } else {
      span.textContent = (q * pr).toFixed(2).replace('.', ',');
      precoLbl.textContent = 'Preço (R$/KG)';
      pesoInfo.textContent = '';
    }
  };

  // notifica assinantes (frete)
  const fireEdits = ()=> { recalcTotalVis(); state.onEditCallbacks.forEach(fn=>{ try{ fn(); }catch{} }); };

  // sanitização de produto (sem espaço inicial e sem repetidos)
  inpProd.addEventListener('input', ()=>{
    const cur = inpProd.selectionStart;
    const before = inpProd.value;
    inpProd.value = normalizeProdutoText(before);
    const delta = before.length - inpProd.value.length;
    try { inpProd.setSelectionRange(Math.max(0, cur - delta), Math.max(0, cur - delta)); } catch {}
    fireEdits();
  });

  ;[inpQtd, inpPreco].forEach(el=>{
    el.addEventListener('input', ()=>{
      el.value = String(el.value).replace(/[^\d,\.]/g,'').replace('.',',');
      fireEdits();
    });
  });
  selTipo.addEventListener('change', fireEdits);
  inpObs.addEventListener('input', fireEdits);
  btnRem.addEventListener('click', ()=>{
    wrap.remove();
    // garante sempre 1 linha
    const cont = document.getElementById('itens');
    if (cont && cont.querySelectorAll('.item').length === 0){
      adicionarItem();
    }
    fireEdits();
  });

  // primeiro cálculo
  recalcTotalVis();

  return wrap;
}

// =============== API pública ===============
export function initItens(){
  const container = document.getElementById('itens');
  if (!container){
    console.warn('[itens] container #itens não existe no DOM.');
    return;
  }
  if (container.children.length === 0){
    container.appendChild(criarLinhaItem({}));
  }
}

export function adicionarItem(values={}){
  const container = document.getElementById('itens');
  if (!container) return;
  container.appendChild(criarLinhaItem(values));
  try { container.lastElementChild?.scrollIntoView({ behavior:'smooth', block:'nearest' }); } catch {}
}

export function getItens(){
  const container = document.getElementById('itens');
  if (!container) return [];
  const rows = Array.from(container.querySelectorAll('.item'));
  return rows.map((row, i)=>{
    const produto = normalizeProdutoText($('.produto', row)?.value || '');
    const tipo = ($('.tipo-select', row)?.value || 'KG').toUpperCase();
    const quantidade = num($('.quantidade', row)?.value);
    const preco = num($('.preco', row)?.value);
    const obs = ($('.obsItem', row)?.value || '').trim();
    const totalSpan = document.getElementById(`totalItem_${i}`);
    const total = totalSpan ? num(totalSpan.textContent.replace(',', '.')) : (quantidade * preco);
    return { produto, tipo, quantidade, preco, obs, total };
  }).filter(i => i.produto || i.quantidade || i.preco);
}

// permite que outros módulos (frete.js/app.js) “assinem” mudanças
export function atualizarFreteAoEditarItem(cb){
  if (typeof cb === 'function') state.onEditCallbacks.add(cb);
}