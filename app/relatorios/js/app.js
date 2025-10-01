import { onAuthUser } from './firebase.js';
import { pedidos_list, pedidos_delete } from './db.js';
import { renderRows, $, toBR } from './render.js';
import { carregarPedidoEmModal, closeModal, addItemRow, salvarEdicao, recalcTotal } from './modal.js';
import { exportarXLSX, exportarPDF } from './export.js';

window.__rows = [];
window.__currentDocId = null;

// BUSCA
async function buscar(){
  const di = $("fDataIni").value || undefined;
  const df = $("fDataFim").value || undefined;
  const cliente = ($("fCliente").value||"").trim();
  const tipoSel = $("fTipo").value.trim() || undefined;

  const list = await pedidos_list({ dataIniISO: di, dataFimISO: df, clienteLike: cliente, tipo: tipoSel, max: 1000 });

  // filtros de hora client-side
  const hIni = $("fHoraIni").value || null;
  const hFim = $("fHoraFim").value || null;

  const out = list.filter(x => {
    if (hIni && (x.horaEntrega||"") < hIni) return false;
    if (hFim && (x.horaEntrega||"") > hFim) return false;
    return true;
  });

  window.__rows = out;
  renderRows(out);
}

function limpar(){
  ["fDataIni","fDataFim","fHoraIni","fHoraFim","fCliente"].forEach(id=>$(id).value="");
  $("fTipo").value = ""; $("tbody").innerHTML = "";
  $("ftCount").textContent = "0 pedidos"; $("ftTotal").textContent = "R$ 0,00"; window.__rows = [];
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

// eventos UI
document.addEventListener('DOMContentLoaded', () => {
  $("btnBuscar").onclick = buscar;
  $("btnLimpar").onclick = limpar;
  $("btnXLSX").onclick = ()=> exportarXLSX(window.__rows);
  $("btnPDF").onclick  = ()=> exportarPDF(window.__rows);

  $("tbody").addEventListener("click", (ev)=>{
    const tdEdit = ev.target.closest(".cell-client");
    if (tdEdit){ const id = tdEdit.getAttribute("data-id"); if (id) carregarPedidoEmModal(id); return; }
    const btnCancel = ev.target.closest(".btn-cancel");
    if (btnCancel){ const id = btnCancel.getAttribute("data-id"); excluirPedido(id); }
  });

  $("btnFecharModal").addEventListener("click", closeModal);
  $("btnAddItem").addEventListener("click", ()=> addItemRow({}));
  $("itemsBody")?.addEventListener("input", (e)=>{
    if (e.target.matches(".it-qtd,.it-preco")) recalcTotal();
  });

  $("btnSalvar").addEventListener("click", ()=> salvarEdicao(atualizarListaLocal));
});

// mostra usuário logado no header
onAuthUser((user) => {
  const el = document.getElementById('headerUser');
  if (el) el.textContent = user ? (user.email || user.uid) : "—";
});