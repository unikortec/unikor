import { itens, setItens, pushItem, removeItem } from './state.js';
import { atualizarFreteUI } from './frete.js';

/* ===================== Helpers ====================== */
function renderItem(it, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'item';
  wrap.dataset.index = idx;

  // Produto
  const prod = document.createElement('input');
  prod.type = 'text';
  prod.placeholder = 'Produto';
  prod.className = 'produto';
  prod.value = it.produto || '';
  prod.addEventListener('input', () => {
    itens[idx].produto = prod.value;
    atualizarLinha(idx);
    atualizarFreteUI();
  });

  // Tipo (KG / UN)
  const tipo = document.createElement('select');
  tipo.className = 'tipo-select';
  ['KG', 'UN'].forEach(op => {
    const o = document.createElement('option');
    o.value = op;
    o.textContent = op;
    if (it.tipo === op) o.selected = true;
    tipo.appendChild(o);
  });
  tipo.addEventListener('change', () => {
    itens[idx].tipo = tipo.value;
    atualizarLinha(idx);
    atualizarFreteUI();
  });

  // Quantidade
  const qtd = document.createElement('input');
  qtd.type = 'number';
  qtd.min = '0';
  qtd.step = 'any';
  qtd.className = 'quantidade';
  qtd.value = it.quantidade || 0;
  qtd.addEventListener('input', () => {
    itens[idx].quantidade = parseFloat(qtd.value) || 0;
    atualizarLinha(idx);
    atualizarFreteUI();
  });

  // Preço unitário
  const preco = document.createElement('input');
  preco.type = 'number';
  preco.min = '0';
  preco.step = 'any';
  preco.className = 'preco';
  preco.value = it.preco || 0;
  preco.addEventListener('input', () => {
    itens[idx].preco = parseFloat(preco.value) || 0;
    atualizarLinha(idx);
    atualizarFreteUI();
  });

  // Observação
  const obs = document.createElement('textarea');
  obs.placeholder = 'Observação do item';
  obs.className = 'obsItem';
  obs.value = it.obs || '';
  obs.addEventListener('input', () => {
    itens[idx].obs = obs.value;
  });

  // Total
  const total = document.createElement('div');
  total.className = 'total';
  total.id = `totalItem_${idx}`;
  total.textContent = `Total do Item: R$ ${Number(it.total || 0).toFixed(2)}`;

  // Botão remover
  const btnRem = document.createElement('button');
  btnRem.type = 'button';
  btnRem.textContent = 'Remover Item';
  btnRem.className = 'remove';
  btnRem.addEventListener('click', () => {
    removeItem(idx);
    renderItens();
    atualizarFreteUI();
  });

  // Monta bloco
  wrap.appendChild(prod);
  wrap.appendChild(tipo);
  wrap.appendChild(qtd);
  wrap.appendChild(preco);
  wrap.appendChild(obs);
  wrap.appendChild(total);
  wrap.appendChild(btnRem);

  return wrap;
}

/* ===================== Renderização ====================== */
export function renderItens() {
  const root = document.getElementById('itens');
  if (!root) return;
  root.innerHTML = '';
  itens.forEach((it, idx) => root.appendChild(renderItem(it, idx)));
}

export function atualizarLinha(idx) {
  const it = itens[idx];
  const el = document.querySelector(`#itens .item[data-index="${idx}"]`);
  if (!el) return;

  const qtd = parseFloat(it.quantidade) || 0;
  const preco = parseFloat(it.preco) || 0;

  let total = qtd * preco;
  let pesoTotalKg = 0;

  // Se for UN e o nome do produto tiver peso, multiplicar
  if (it.tipo === 'UN') {
    const re = /(\d+(?:[.,]\d+)?)[\s]*(kg|quilo|quilos|g|grama|gramas)\b/i;
    const m = re.exec(it.produto || '');
    if (m) {
      const val = parseFloat((m[1] || '').replace(',', '.')) || 0;
      pesoTotalKg = (m[2].toLowerCase().startsWith('kg') || m[2].toLowerCase().includes('quilo'))
        ? val * qtd
        : (val / 1000) * qtd;
      total = pesoTotalKg * preco;
      el.setAttribute('data-peso-total-kg', pesoTotalKg);
    } else {
      el.removeAttribute('data-peso-total-kg');
    }
  }

  it.total = total;

  const totalEl = el.querySelector('.total');
  if (totalEl) {
    totalEl.textContent = `Total do Item: R$ ${total.toFixed(2)}`;
    if (pesoTotalKg > 0) {
      totalEl.textContent += ` (Peso total estimado: ${pesoTotalKg.toFixed(3)} kg)`;
    }
  }
}

/* ===================== Inicialização ====================== */
export function initItens() {
  renderItens();

  const btnAdd = document.getElementById('adicionarItemBtn');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      pushItem();
      renderItens();
      atualizarFreteUI();
    });
  }
}

/* Exposição global opcional (debug/PDF) */
window.getItens = () => itens;
window.renderItens = renderItens;
window.atualizarLinha = atualizarLinha;