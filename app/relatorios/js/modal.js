import { $, moneyBR } from './render.js';
import { pedidos_get, pedidos_update } from './db.js';

function lockBodyScroll(lock){
  try{ document.body.style.overflow = lock ? 'hidden' : ''; }catch{}
}

export function openModal(){
  const m = $("modalBackdrop");
  if (!m) return;
  m.classList.remove("hidden");
  m.style.display = "flex";
  m.setAttribute("aria-hidden","false");
  lockBodyScroll(true);
}
export function closeModal(){
  const m = $("modalBackdrop");
  if (!m) return;
  m.classList.add("hidden");
  m.style.display = "none";
  m.setAttribute("aria-hidden","true");
  window.__currentDocId = null;
  const body = $("itemsBody"); if (body) body.innerHTML = "";
  lockBodyScroll(false);
}

// ===== helpers numéricos BR (aceita vírgula)
const parseBRNumber = (val) => {
  if (typeof val === "number") return val;
  const s = String(val ?? "")
    .trim().replace(/\s+/g,"").replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};
const toMoney = (n)=> moneyBR(Number(n||0));

function kgPorUnFromDesc(desc=""){
  const s = String(desc).toLowerCase().replace(',', '.');
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b/;
  const m = s.match(re);
  if (!m) return 0;
  const raw = m[1].replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
  const val = parseFloat(raw);
  if (!isFinite(val) || val<=0) return 0;
  const unit = m[2];
  return (unit.startsWith('kg') || unit.startsWith('quilo')) ? val : (val/1000);
}

function calcSubtotal({ desc, qtd, un, preco }){
  const U = String(un||'').toUpperCase();
  if (U === 'UN'){
    const kgUn = kgPorUnFromDesc(desc);
    const tot = kgUn > 0 ? (qtd * kgUn) * preco : (qtd * preco);
    return Number(tot.toFixed(2));
  }
  return Number((qtd * preco).toFixed(2));
}

function recalcRow(tr){
  const desc = (tr.querySelector(".it-desc").value||"").trim();
  const qtd  = parseBRNumber(tr.querySelector(".it-qtd").value);
  const un   = (tr.querySelector(".it-un").value||"UN").toUpperCase();
  const pu   = parseBRNumber(tr.querySelector(".it-preco").value);
  const subInput = tr.querySelector(".it-sub");
  const calc = calcSubtotal({ desc, qtd, un, preco: pu });
  if (!subInput.dataset.dirty){ subInput.value = toMoney(calc); }
}

// Soma respeitando edição manual (dataset.dirty === "1")
function recalcTotal(){
  let total = 0;
  $("itemsBody").querySelectorAll("tr").forEach(tr=>{
    const subEl = tr.querySelector(".it-sub");
    const desc = (tr.querySelector(".it-desc").value||"").trim();
    const qtd  = parseBRNumber(tr.querySelector(".it-qtd").value);
    const un   = (tr.querySelector(".it-un").value||"UN").toUpperCase();
    const pu   = parseBRNumber(tr.querySelector(".it-preco").value);

    let val;
    if (subEl.dataset.dirty === "1") {
      val = parseBRNumber(subEl.value);
    } else {
      val = calcSubtotal({ desc, qtd, un, preco: pu });
      subEl.value = toMoney(val);
    }
    total += Number(val||0);
  });
  $("mTotal").value = toMoney(total);
}
export { recalcTotal };

export function addItemRow(item={}){
  const desc = (item.descricao||item.produto||"").toString();
  const qtd  = (item.qtd??item.quantidade??"") === "" ? "" : String(item.qtd??item.quantidade);
  const un   = (item.un||item.unidade||item.tipo||"UN").toString().toUpperCase();
  const pu   = Number(item.precoUnit||item.preco||0);
  const sub  = Number(item.subtotal ?? calcSubtotal({ desc, qtd: parseBRNumber(qtd||0), un, preco: pu }));

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="it-desc" value="${desc.replace(/"/g,"&quot;")}" /></td>
    <td><input type="text" inputmode="decimal" class="it-qtd" value="${qtd}" placeholder="0,000" /></td>
    <td>
      <select class="it-un">
        <option value="UN"${un==='UN'?' selected':''}>UN</option>
        <option value="KG"${un==='KG'?' selected':''}>KG</option>
      </select>
    </td>
    <td><input type="text" inputmode="decimal" class="it-preco" value="${toMoney(pu)}" placeholder="0,00" /></td>
    <td><input type="text" class="it-sub right" value="${toMoney(sub)}" title="Você pode editar manualmente" /></td>
    <td class="right"><button class="btn danger btn-rem" type="button">X</button></td>
  `;
  $("itemsBody").appendChild(tr);

  tr.querySelectorAll(".it-desc,.it-qtd,.it-un,.it-preco").forEach(i=>{
    i.addEventListener("input", ()=>{
      tr.querySelector(".it-sub").dataset.dirty = "";
      recalcRow(tr); recalcTotal();
    }, { passive:true });
  });
  tr.querySelector(".it-sub").addEventListener("input", (e)=>{ e.currentTarget.dataset.dirty = "1"; recalcTotal(); });
  tr.querySelector(".btn-rem").addEventListener("click", ()=>{ tr.remove(); recalcTotal(); });

  recalcRow(tr);
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

  const freteNum = Number(
    r.freteValor ??
    (r?.frete?.isento ? 0 : (r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? 0))
  ) || 0;
  $("mFrete").value = toMoney(freteNum);

  openModal();
}

export async function salvarEdicao(atualizarLista){
  if (!window.__currentDocId){ closeModal(); return; }

  const itens = [];
  $("itemsBody").querySelectorAll("tr").forEach(tr=>{
    const desc = (tr.querySelector(".it-desc").value||"").trim();
    const qtd  = parseBRNumber(tr.querySelector(".it-qtd").value);
    const un   = (tr.querySelector(".it-un").value||"UN").trim().toUpperCase();
    const pu   = parseBRNumber(tr.querySelector(".it-preco").value);
    const subEl= tr.querySelector(".it-sub");
    const subCalc = calcSubtotal({ desc, qtd, un, preco: pu });
    const sub = (subEl.dataset.dirty === "1") ? parseBRNumber(subEl.value) : subCalc;

    if (!desc && qtd<=0) return;
    itens.push({ descricao: desc, qtd, un, precoUnit: pu, subtotal: Number(Number(sub||0).toFixed(2)) });
  });

  const totalItens = itens.reduce((acc, it)=> acc + (it.subtotal||0), 0);
  const freteNum   = parseBRNumber($("mFrete").value);

  const payload = {
    cliente: $("mCliente").value.trim(),
    dataEntregaISO: $("mDataEntregaISO").value || null,
    horaEntrega: $("mHoraEntrega").value || "",
    entrega: { tipo: $("mTipo").value || "ENTREGA" },
    pagamento: $("mPagamento").value.trim() || "",
    cupomFiscal: $("mCupomFiscal").value.trim() || "",
    obs: $("mObs").value.trim() || "",
    itens,
    totalPedido: Number(totalItens.toFixed(2)),
    freteValor: Number(freteNum.toFixed(2)),
    frete: { valorCobravel: Number(freteNum.toFixed(2)), valorBase: Number(freteNum.toFixed(2)) }
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

/* ===== PDF do pedido (usa o mesmo layout do app Pedidos) ===== */
export async function gerarPDFDoModal(){
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF){ alert("Biblioteca PDF não carregada."); return; }
  if (!window.__currentDocId){ alert("Nenhum pedido carregado."); return; }
  // importa a função correta (evita erro 'printFromModal')
  const { printPedido80mm } = await import("./print.js");
  await printPedido80mm(window.__currentDocId);
}