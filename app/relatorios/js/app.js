// relatorios/js/app.js
import { onAuthUser } from "./js/firebase.js";
import { pedidos_list, pedidos_get, pedidos_update, pedidos_delete } from "./js/db.js";
import { $, moneyBR, toBR } from "./js/render.js";
import { carregarPedidoEmModal, closeModal, addItemRow, salvarEdicao } from "./js/modal.js";
import { exportarXLSX, exportarPDF } from "./js/export.js";

const state = { rows: [], currentId: null };
const nextFrame = () => new Promise(r=>setTimeout(r,0));

function renderRows(docs){
  const tbody = $("tbody");
  const seen = new Set();
  const out = [];
  let total = 0;

  for (const r of docs){
    if (seen.has(r.id)) continue; seen.add(r.id);
    const itens = Array.isArray(r.itens) ? r.itens : [];
    const tot = Number(r.totalPedido||0); total += tot;
    const tipo = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
    const cupom = (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-";

    out.push(`<tr data-rowid="${r.id}">
      <td>${toBR(r.dataEntregaISO)||""}</td>
      <td>${r.horaEntrega||""}</td>
      <td class="cell-client" data-id="${r.id}" title="Clique para editar">${r.cliente||""}</td>
      <td>${itens.length}</td>
      <td>R$ ${moneyBR(tot)}</td>
      <td>${tipo}</td>
      <td>${r.pagamento||""}</td>
      <td>${cupom}</td>
      <td><button class="btn danger icon btn-cancel" data-id="${r.id}" title="Cancelar / excluir pedido">×</button></td>
    </tr>`);
  }

  if (!out.length){
    tbody.innerHTML = `<tr><td colspan="9">Sem resultados.</td></tr>`;
    $("ftCount").textContent = "0 pedidos";
    $("ftTotal").textContent = "R$ 0,00";
    return;
  }

  tbody.innerHTML = out.join("");
  $("ftCount").textContent = `${seen.size} pedido(s)`;
  $("ftTotal").textContent = `R$ ${moneyBR(total)}`;
}

async function buscar(){
  const di = $("fDataIni").value || undefined;
  const df = $("fDataFim").value || undefined;
  const cliente = ($("fCliente").value||"").trim() || undefined;
  const tipo = $("fTipo").value || undefined;
  const hIni = $("fHoraIni").value || null;
  const hFim = $("fHoraFim").value || null;

  const list = await pedidos_list({ dataIniISO: di, dataFimISO: df, clienteLike: cliente, tipo, max:1000 });
  const filtered = list.filter(x=>{
    if (hIni && (x.horaEntrega||"") < hIni) return false;
    if (hFim && (x.horaEntrega||"") > hFim) return false;
    return true;
  });

  state.rows = filtered;
  renderRows(filtered);
}

function limpar(){
  ["fDataIni","fDataFim","fHoraIni","fHoraFim","fCliente"].forEach(id=>$(id).value="");
  $("fTipo").value = "";
  state.rows = [];
  renderRows([]);
}

async function excluirPedido(id){
  if (!id) return;
  if (!confirm("Gostaria de excluir o pedido?")) return;
  await pedidos_delete(id);
  state.rows = state.rows.filter(r=>r.id!==id);
  renderRows(state.rows);
  alert("Pedido excluído.");
}

function atualizarListaLocal(id, payload){
  const i = state.rows.findIndex(r=>r.id===id);
  if (i>=0) state.rows[i] = { ...state.rows[i], ...payload };
  renderRows(state.rows);
}

document.addEventListener('DOMContentLoaded', () => {
  // botões
  $("btnBuscar").onclick = buscar;
  $("btnLimpar").onclick = limpar;
  $("btnXLSX").onclick = ()=> exportarXLSX(state.rows);
  $("btnPDF").onclick  = ()=> exportarPDF(state.rows);

  $("tbody").addEventListener("click", (ev)=>{
    const td = ev.target.closest(".cell-client");
    if (td){ const id = td.getAttribute("data-id"); if (id) carregarPedidoEmModal(id); return; }
    const del = ev.target.closest(".btn-cancel");
    if (del){ excluirPedido(del.getAttribute("data-id")); }
  });

  $("btnFecharModal").addEventListener("click", closeModal);
  $("btnAddItem").addEventListener("click", ()=> addItemRow({}));
  $("btnSalvar").addEventListener("click", ()=> salvarEdicao((id,payload)=> atualizarListaLocal(id,payload)));

  // mostrar usuário no header (feito também inline no index, aqui é redundante ok)
  onAuthUser((u)=>{ const span = document.getElementById('usuarioLogado'); if (span) span.textContent = u?.email || '—'; });
});