// app/pedidos/js/app.js
import { atualizarFreteUI } from './frete.js';
import { wireClienteModal } from './clientes.js';

// Carrega itens.js com fallback
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

// PDF on-demand
async function callGerarPDF(mode, btn) {
  try {
    const m = await import('./pdf.js');
    let fn = m.gerarPDF || (typeof m.default === 'function' ? m.default : m.default?.gerarPDF);
    if (!fn) { alert('Módulo de PDF indisponível.'); return; }
    await fn(mode, btn);
  } catch (err) {
    console.error('[PDF] Falha ao carregar:', err);
    alert('Não consegui carregar o módulo de PDF.');
  }
}

// Offline banner (ping simples)
async function isReallyOnline(timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = "./manifest.json?ts=" + Date.now();
    const r = await fetch(url, { method: "HEAD", cache: "no-store", signal: ctrl.signal });
    return r.ok;
  } catch { return false; } finally { clearTimeout(t); }
}
async function updateOfflineBanner(){
  const el = document.getElementById('offlineBanner');
  if (!el) return;
  el.style.display = (await isReallyOnline()) ? 'none' : 'block';
}

document.addEventListener('DOMContentLoaded', async () => {
  // === NOVO: modal de cliente
  wireClienteModal();

  // itens
  const ok = await loadItensModule();
  if (!ok) return;
  initItens();

  // add item
  const addBtn = document.getElementById('adicionarItemBtn');
  if (addBtn){
    addBtn.addEventListener('click', () => {
      adicionarItem();
      atualizarFreteUI();
    });
  }

  // eventos de frete
  const end = document.getElementById('endereco');
  const chkIsentar = document.getElementById('isentarFrete');
  end && end.addEventListener('blur', atualizarFreteUI);
  chkIsentar && chkIsentar.addEventListener('change', atualizarFreteUI);
  atualizarFreteAoEditarItem(() => atualizarFreteUI());

  // Botões PDF
  const g = document.getElementById('btnGerarPdf');
  const s = document.getElementById('btnSalvarPdf');
  const c = document.getElementById('btnCompartilharPdf');
  g && g.addEventListener('click', (ev) => callGerarPDF(false, ev.target));
  s && s.addEventListener('click', (ev) => callGerarPDF(true,  ev.target));
  c && c.addEventListener('click', async () => callGerarPDF('share'));

  // offline banner
  updateOfflineBanner();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateOfflineBanner();
  });
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
});