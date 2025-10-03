// relatorios/js/app.js
import { onAuthUser } from './firebase.js';
import { pedidos_list, pedidos_delete } from './db.js';
import { $, renderRows, userPrefix } from './render.js';
import { carregarPedidoEmModal, closeModal, addItemRow, salvarEdicao } from './modal.js';
import { exportarXLSX, exportarPDF } from './export.js';
import { printPedido80mm } from './print.js';       // ⬅️ reimpressão térmica

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

  // filtros de hora — client-side
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
  const elItems = document.getElementById("ftItens");
  const elFrete = document.getElementById("ftFrete");
  if (elItems) elItems.textContent = "0 itens";
  if (elFrete) elFrete.textContent = "R$ 0,00";
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
  $("btnBuscar").onclick = buscar;
  $("btnLimpar").onclick = limpar;
  $("btnXLSX").onclick = ()=> exportarXLSX(window.__rows);
  $("btnPDF").onclick  = ()=> exportarPDF(window.__rows);

  $("tbody").addEventListener("click", (ev)=>{
    const tdEdit = ev.target.closest(".cell-client");
    if (tdEdit){ const id = tdEdit.getAttribute("data-id"); if (id) carregarPedidoEmModal(id); return; }

    const btnPrint = ev.target.closest(".btn-print");  // reimprimir cupom
    if (btnPrint){ const id = btnPrint.getAttribute("data-id"); if (id) printPedido80mm(id); return; }

    const btnCancel = ev.target.closest(".btn-cancel");
    if (btnCancel){ const id = btnCancel.getAttribute("data-id"); excluirPedido(id); }
  });

  $("btnFecharModal").addEventListener("click", closeModal);
  $("btnAddItem").addEventListener("click", ()=> addItemRow({}));
  $("btnSalvar").addEventListener("click", ()=> salvarEdicao(atualizarListaLocal));
});

// Mostra apenas a parte antes do @ no header
onAuthUser((user) => {
  const tag = document.getElementById('userTag');
  tag.textContent = user ? userPrefix(user.email || user.uid) : "—";
});