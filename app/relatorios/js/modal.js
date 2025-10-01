import { $, moneyBR } from './render.js';
import { pedidos_get, pedidos_update } from './db.js';

export function openModal(){ const m = $("modalBackdrop"); m.style.display="flex"; m.setAttribute("aria-hidden","false"); }
export function closeModal(){ const m = $("modalBackdrop"); m.style.display="none"; m.setAttribute("aria-hidden","true"); window.__currentDocId = null; $("itemsBody").innerHTML = ""; }

const parseMoney = (str)=> {
  if (typeof str === "number") return str;
  const s = (str||"").toString().trim().replace(/\./g,"").replace(",",".");
  const v = Number(s); return isNaN(v) ? 0 : v;
};

function recalcTotal(){
  let total = 0;
  $("itemsBody").querySelectorAll("tr").forEach(tr=>{
    const qtd = parseMoney(tr.querySelector(".it-qtd").value);
    const pu  = parseMoney(tr.querySelector(".it-preco").value);
    const sub = qtd * pu;
    tr.querySelector(".it-sub").textContent = moneyBR(sub);
    total += sub;
  });
  $("mTotal").value = moneyBR(total);
}
export { recalcTotal };

export function addItemRow(item={}){
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="it-desc" value="${(item.descricao||item.produto||"").toString().replace(/"/g,"&quot;")}" /></td>
    <td><input type="number" min="0" step="0.001" class="it-qtd" value="${Number(item.qtd||item.quantidade||0)}" /></td>
    <td><input type="text" class="it-un" value="${(item.un||item.unidade||"UN").toString().replace(/"/g,"&quot;")}" /></td>
    <td><input type="text" class="it-preco" value="${moneyBR(item.precoUnit||item.preco||0)}" /></td>
    <td class="it-sub right">R$ 0,00</td>
    <td class="right"><button class="btn danger btn-rem" type="button">X</button></td>
  `;
  $("itemsBody").appendChild(tr);
  tr.querySelectorAll(".it-qtd,.it-preco").forEach(i=> i.addEventListener("input", recalcTotal));
  tr.querySelector(".btn-rem").addEventListener("click", ()=>{ tr.remove(); recalcTotal(); });
  recalcTotal();
}

export async function carregarPedidoEmModal(id){
  window.__currentDocId = id;
  const r = await pedidos_get(id);
  if (!r){ alert("Pedido não encontrado."); return; }

  $("mId").value = r.id || "";
  $("mCliente").value = r.cliente || "";
  $("mDataEntregaISO").value = r.dataEntregaISO || "";
  $("mHoraEntrega").value = r.horaEntrega || "";
  $("mTipo").value = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
  $("mPagamento").value = r.pagamento || "";
  $("mCupomFiscal").value = r.cupomFiscal || "";
  $("mObs").value = r.obs || r.observacoes || "";

  $("itemsBody").innerHTML = "";
  const itens = Array.isArray(r.itens) ? r.itens : [];
  if (itens.length){ itens.forEach(it => addItemRow(it)); } else { addItemRow({}); }
  recalcTotal();
  openModal();
}

export async function salvarEdicao(atualizarLista){
  if (!window.__currentDocId){ closeModal(); return; }
  const itens = [];
  $("itemsBody").querySelectorAll("tr").forEach(tr=>{
    const desc = (tr.querySelector(".it-desc").value||"").trim();
    const qtd  = parseMoney(tr.querySelector(".it-qtd").value);
    const un   = (tr.querySelector(".it-un").value||"").trim() || "UN";
    const pu   = parseMoney(tr.querySelector(".it-preco").value);
    if (!desc && qtd<=0) return;
    itens.push({ descricao: desc, qtd, un, precoUnit: pu, subtotal: Number((qtd*pu).toFixed(2)) });
  });
  const totalPedido = itens.reduce((acc, it)=> acc + (it.subtotal||0), 0);

  const payload = {
    cliente: $("mCliente").value.trim(),
    dataEntregaISO: $("mDataEntregaISO").value || null,
    horaEntrega: $("mHoraEntrega").value || "",
    entrega: { tipo: $("mTipo").value || "ENTREGA" },
    pagamento: $("mPagamento").value.trim() || "",
    cupomFiscal: $("mCupomFiscal").value.trim() || "",
    obs: $("mObs").value.trim() || "",
    itens,
    totalPedido: Number(totalPedido.toFixed(2))
  };

  try{
    await pedidos_update(window.__currentDocId, payload);
    closeModal();
    atualizarLista(window.__currentDocId, payload);
    alert("Pedido atualizado com sucesso.");
  }catch(e){
    console.error(e);
    alert("Falha ao salvar. Verifique sua conexão e permissões e tente novamente.");
  }
}