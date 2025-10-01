// js/app.js
import { onAuthUser } from './firebase.js';
import { pedidos_list, pedidos_get, pedidos_update, pedidos_delete } from './js/db.js'; // OBS: caminho quando servir de /app/relatorios/
// Se o arquivo db.js estiver em ./js/db.js, importe assim:
import { pedidos_list as listFn, pedidos_get as getFn, pedidos_update as updFn, pedidos_delete as delFn } from './db.js';
import { $, toBR, moneyBR, rowTotal, renderRows } from './render.js';
import { carregarPedidoEmModal, closeModal, addItemRow, salvarEdicao } from './modal.js';
import { exportarXLSX, exportarPDF } from './export.js';

// Ajuste: use os apelidos padronizados (caso o import absoluto acima não exista)
const pedidos_list  = typeof listFn  === 'function' ? listFn  : pedidos_list;
const pedidos_get   = typeof getFn   === 'function' ? getFn   : pedidos_get;
const pedidos_update= typeof updFn   === 'function' ? updFn   : pedidos_update;
const pedidos_delete= typeof delFn   === 'function' ? delFn   : pedidos_delete;

window.__rows = [];
window.__currentDocId = null;

async function buscar(){
  const di = $("fDataIni").value || undefined;
  const df = $("fDataFim").value || undefined;
  const cliente = ($("fCliente").value||"").trim();
  const tipoSel = $("fTipo").value.trim() || undefined;

  const list = await pedidos_list({
    dataIniISO: di,
    dataFimISO: df,
    clienteLike: cliente || undefined,
    tipo: tipoSel,
    max: 1000
  });

  // filtros de hora — aplicados client-side
  const hi = $("fHoraIni").value || null;
  const hf = $("fHoraFim").value || null;

  const out = list.filter(x => {
    if (hi && (x.horaEntrega||"") < hi) return false;
    if (hf && (x.horaEntrega||"") > hf) return false;
    return true;
  });

  window.__rows = out;
  renderRows(out);
}

function limpar(){
  ["fDataIni","fDataFim","fHoraIni","fHoraFim","fCliente"].forEach(id=>$(id).value="");
  $("fTipo").value = "";
  $("tbody").innerHTML = "";
  $("ftCount").textContent = "0 pedidos";
  $("ftTotal").textContent = "R$ 0,00";
  window.__rows = [];
}

async function excluirPedido(id){
  if (!id) return;
  const ok = confirm("Gostaria de excluir o pedido?");
  if (!ok) return;
  await pedidos_delete(id);
  window.__rows = window.__rows.filter(x => x.id !== id);
  renderRows(window.__rows);
  alert("Pedido excluído.");
}

function atualizarListaLocal(id, payload){
  const idx = window.__rows.findIndex(x=>x.id===id);
  if (idx>=0){ window.__rows[idx] = { ...window.__rows[idx], ...payload }; }
  renderRows(window.__rows);
}

document.addEventListener('DOMContentLoaded', () => {
  // Botões
  $("btnBuscar").onclick = buscar;
  $("btnLimpar").onclick = limpar;
  $("btnXLSX").onclick = ()=> exportarXLSX(window.__rows);
  $("btnPDF").onclick  = ()=> exportarPDF(window.__rows);

  // Tabela
  $("tbody").addEventListener("click", (ev)=>{
    const tdEdit = ev.target.closest(".cell-client");
    if (tdEdit){ const id = tdEdit.getAttribute("data-id"); if (id) carregarPedidoEmModal(id); return; }
    const btnCancel = ev.target.closest(".btn-cancel");
    if (btnCancel){ const id = btnCancel.getAttribute("data-id"); excluirPedido(id); }
  });

  // Modal
  $("btnFecharModal").addEventListener("click", closeModal);
  $("btnAddItem").addEventListener("click", ()=> addItemRow({}));
  $("btnSalvar").addEventListener("click", ()=> salvarEdicao(atualizarListaLocal));
});

// Mostrar apenas o nome antes do @ no topo
onAuthUser((user) => {
  const el = document.getElementById('headerUser');
  if (!el) return;
  if (!user) { el.textContent = '—'; return; }
  const email = user.email || '';
  el.textContent = email.includes('@') ? email.split('@')[0] : (email || user.uid);
});