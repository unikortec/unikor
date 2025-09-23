// js/app.js
import { initItens, adicionarItem, atualizarFreteAoEditarItem } from './itens.js';
import { atualizarFreteUI } from './frete.js';

// Carrega o módulo do PDF só quando necessário e com fallback de diferentes tipos de export
async function callGerarPDF(mode, btn) {
  try {
    const m = await import('./pdf.js');

    // Tenta achar a função gerarPDF em diferentes formatos de export
    let fn = null;
    if (typeof m.gerarPDF === 'function') {
      fn = m.gerarPDF;
    } else if (typeof m.default === 'function') {
      fn = m.default;
    } else if (m.default && typeof m.default.gerarPDF === 'function') {
      fn = m.default.gerarPDF;
    }

    if (!fn) {
      console.error('[PDF] Módulo carregado, mas a função gerarPDF não foi encontrada.', m);
      alert('Módulo de PDF indisponível no momento. Verifique o arquivo js/pdf.js.');
      return;
    }

    await fn(mode, btn);
  } catch (err) {
    console.error('[PDF] Falha ao carregar módulo:', err);
    alert('Não consegui carregar o módulo de PDF. Tente recarregar a página.');
  }
}

// UI: mostra/oculta campo "pagamentoOutro"
function wirePagamentoOutro(){
  const sel = document.getElementById('pagamento');
  const outro = document.getElementById('pagamentoOutro');
  if (!sel || !outro) return;
  const sync = () => { outro.style.display = (sel.value === 'OUTRO') ? '' : 'none'; };
  sel.addEventListener('change', sync);
  sync();
}

// Banner offline
function updateOfflineBanner(){
  const el = document.getElementById('offlineBanner');
  if (!el) return;
  el.style.display = navigator.onLine ? 'none' : 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  // Render inicial dos itens e listeners internos
  initItens();

  // botão adicionar item
  const addBtn = document.getElementById('adicionarItemBtn');
  if (addBtn){
    addBtn.addEventListener('click', () => {
      adicionarItem();
      atualizarFreteUI();
    });
  }

  // eventos que impactam o frete
  const end = document.getElementById('endereco');
  const chkIsentar = document.getElementById('isentarFrete');
  end && end.addEventListener('blur', atualizarFreteUI);
  chkIsentar && chkIsentar.addEventListener('change', atualizarFreteUI);

  // Quando qualquer item muda (qtd/preço/produto), recalcular frete
  atualizarFreteAoEditarItem(() => atualizarFreteUI());

  // pagamento outro
  wirePagamentoOutro();

  // Botões PDF (usando o import dinâmico protegido)
  const g = document.getElementById('btnGerarPdf');
  const s = document.getElementById('btnSalvarPdf');
  const c = document.getElementById('btnCompartilharPdf');
  g && g.addEventListener('click', (ev) => callGerarPDF(false, ev.target));
  s && s.addEventListener('click', (ev) => callGerarPDF(true,  ev.target));
  c && c.addEventListener('click', async () => callGerarPDF('share'));

  // offline banner
  updateOfflineBanner();
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
});