// app/pedidos/js/app.js
import { atualizarFreteUI } from './frete.js';

// Carrega itens.js com fallback (evita crash se SW servir versão antiga)
let initItens, adicionarItem, atualizarFreteAoEditarItem;
async function loadItensModule(){
  const m = await import('./itens.js');
  initItens                  = m.initItens                  ?? m.default?.initItens;
  adicionarItem              = m.adicionarItem              ?? m.default?.adicionarItem;
  atualizarFreteAoEditarItem = m.atualizarFreteAoEditarItem ?? m.default?.atualizarFreteAoEditarItem;
  if (!initItens || !adicionarItem) {
    console.error('[itens.js] exports não encontrados', m);
    alert('Falha ao carregar módulo de itens. Atualize a página.');
    return false;
  }
  return true;
}

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

// Ping real ao host para confirmar conectividade
async function isReallyOnline(timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Usa caminho relativo ao <base href="./"> do index
    const r = await fetch("./manifest.json?ts=" + Date.now(), {
      method: "HEAD",
      cache: "no-store",
      signal: ctrl.signal
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function updateOfflineBanner(){
  const el = document.getElementById('offlineBanner');
  if (!el) return;
  el.style.display = (await isReallyOnline()) ? 'none' : 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
  // Carrega módulo de itens
  const ok = await loadItensModule();
  if (!ok) return;

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

  // offline banner (checagem inicial e ao voltar/ficar online/offline)
  updateOfflineBanner();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateOfflineBanner();
  });
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
});