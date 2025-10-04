// app/pedidos/js/itens.js
// Lista de itens do pedido (render, cálculos e eventos) – robusto a ordem de import.

const state = { onEditCallbacks: new Set() };

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const num = (v) => {
  if (v == null) return 0;
  const s = String(v).replace('.', ','); // aceita ponto e vírgula na UI
  const n = parseFloat(s.replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const normProduto = (s) => String(s || '')
  .replace(/^\s+/, '')         // remove espaço inicial
  .replace(/\s{2,}/g, ' ');    // colapsa múltiplos espaços

function criarLinhaItem(values = {}) {
  const { produto = '', tipo = 'KG', quantidade = '', preco = '', obs = '' } = values;

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
    </div>

    <div class="row">
      <div class="col col-obs">
        <label>Observações do item (opcional)</label>
        <input class="obsItem" type="text" placeholder="Ex.: Cortar em bifes, sem gordura" />
        <div class="peso-info"></div>
      </div>
    </div>

    <p class="total">Total do Item: R$ <span class="total-item">0,00</span></p>

    <!-- 🔻 botão de remover AGORA fica logo abaixo do total -->
    <div class="row row-rem" style="margin-top:6px;">
      <div class="col">
        <button class="remove" type="button">Remover Item</button>
      </div>
    </div>
  `;

  const inpProd = $('.produto', wrap);
  const selTipo = $('.tipo-select', wrap);
  const inpQtd  = $('.quantidade', wrap);
  const inpPreco= $('.preco', wrap);
  const inpObs  = $('.obsItem', wrap);
  const btnRem  = $('.remove', wrap);
  const pesoInfo= $('.peso-info', wrap);
  const precoLbl= $('.label-preco', wrap);
  const totalEl = $('.total-item', wrap);

  // valores iniciais
  inpProd.value  = normProduto(produto);
  selTipo.value  = (String(tipo).toUpperCase() === 'UN') ? 'UN' : 'KG';
  inpQtd.value   = quantidade === '' ? '' : String(quantidade).replace('.', ',');
  inpPreco.value = preco === '' ? '' : String(preco).replace('.', ',');
  inpObs.value   = obs || '';

  const recalc = () => {
    const tipo = selTipo.value;
    const q    = num(inpQtd.value);
    const p    = num(inpPreco.value);
    const prod = (inpProd.value || '').toLowerCase();

    let total = q * p;
    let pesoTotKg = 0;

    if (tipo === 'UN') {
      const m = /(\d+(?:[.,]\d+)?)[\s]*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b/i.exec(prod);
      if (m) {
        const val = parseFloat((m[1] || '').replace(',', '.')) || 0;
        const kgUn = (m[2].toLowerCase().startsWith('kg') || m[2].toLowerCase().startsWith('quilo')) ? val : val / 1000;
        pesoTotKg = q * kgUn;
        total = pesoTotKg * p;               // preço por KG
        precoLbl.textContent = 'Preço (R$/KG)';
        pesoInfo.textContent = `Peso total estimado: ${pesoTotKg.toFixed(3)} kg`;
      } else {
        precoLbl.textContent = 'Preço Unitário (R$)';
        pesoInfo.textContent = 'Sem gramagem detectada no nome';
      }
    } else {
      precoLbl.textContent = 'Preço (R$/KG)';
      pesoInfo.textContent = '';
    }

    totalEl.textContent = total.toFixed(2).replace('.', ',');

    // avisa interessados (frete)
    state.onEditCallbacks.forEach(fn => { try { fn(); } catch {} });
  };

  // listeners
  inpProd.addEventListener('input', () => { 
    const cur = inpProd.selectionStart;
    const before = inpProd.value;
    inpProd.value = normProduto(before);
    const delta = before.length - inpProd.value.length;
    try { inpProd.setSelectionRange(Math.max(0, cur - delta), Math.max(0, cur - delta)); } catch {}
    recalc();
  });
  selTipo.addEventListener('change', recalc);
  inpQtd.addEventListener('input', recalc);
  inpPreco.addEventListener('input', recalc);
  inpObs.addEventListener('input', ()=>{}); // apenas guarda

  btnRem.addEventListener('click', () => {
    const cont = document.getElementById('itens');
    wrap.remove();
    // garante que sempre exista pelo menos 1 item
    if (cont && cont.querySelectorAll('.item').length === 0) {
      adicionarItem();
    }
    state.onEditCallbacks.forEach(fn => { try { fn(); } catch {} });
  });

  // cálculo inicial
  recalc();
  return wrap;
}

/* ================== API pública ================== */
export function initItens() {
  const cont = document.getElementById('itens');
  if (!cont) return;
  if (cont.children.length === 0) {
    cont.appendChild(criarLinhaItem({}));
  }
}

export function adicionarItem(values = {}) {
  const cont = document.getElementById('itens');
  if (!cont) return;
  cont.appendChild(criarLinhaItem(values));
}

export function getItens() {
  const cont = document.getElementById('itens');
  if (!cont) return [];
  return $$('.item', cont).map(row => {
    const produto = normProduto($('.produto', row)?.value || '');
    const tipo    = ($('.tipo-select', row)?.value || 'KG').toUpperCase();
    const quantidade = num($('.quantidade', row)?.value);
    const preco      = num($('.preco', row)?.value);
    const obs        = ($('.obsItem', row)?.value || '').trim();
    const totalTxt   = $('.total-item', row)?.textContent || '0';
    const total      = num(totalTxt.replace(',', '.'));
    return { produto, tipo, quantidade, preco, obs, total };
  }).filter(i => i.produto || i.quantidade || i.preco);
}

export function atualizarFreteAoEditarItem(cb){
  if (typeof cb === 'function') state.onEditCallbacks.add(cb);
}

/* ============== Auto-init de segurança ============== */
(function autoInit(){
  const start = () => {
    const cont = document.getElementById('itens');
    if (!cont) return;
    if (cont.children.length === 0) cont.appendChild(criarLinhaItem({}));
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }
})();