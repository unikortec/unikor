// relatorios/js/modal.js
import { $, moneyBR } from './render.js';
import { pedidos_get, pedidos_update } from './db.js';

export function openModal(){
  const m = $("modalBackdrop");
  m.style.display = "flex";
  m.setAttribute("aria-hidden","false");
}
export function closeModal(){
  const m = $("modalBackdrop");
  m.style.display = "none";
  m.setAttribute("aria-hidden","true");
  window.__currentDocId = null;
  $("itemsBody").innerHTML = "";
}

// ===== helpers numéricos BR (aceita vírgula)
const parseBRNumber = (val) => {
  if (typeof val === "number") return val;
  const s = String(val ?? "")
    .trim()
    .replace(/\s+/g,"")
    .replace(/\./g, "")     // remove milhares
    .replace(",", ".");     // vírgula -> ponto
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};
const toMoney = (n)=> moneyBR(Number(n||0));

/** extrai kg por unidade do texto (ex.: "Picanha 800g" => 0.8) */
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
  if (String(un||'').toUpperCase() === 'UN'){
    const kgUn = kgPorUnFromDesc(desc);
    if (kgUn > 0){           // preço é R$/kg e descrito "800g", etc.
      return (qtd * kgUn) * preco;
    }
    return qtd * preco;      // UN sem gramagem: unitário
  }
  // KG
  return qtd * preco;
}

function recalcRow(tr){
  const desc = (tr.querySelector(".it-desc").value||"").trim();
  const qtd  = parseBRNumber(tr.querySelector(".it-qtd").value);
  const un   = (tr.querySelector(".it-un").value||"UN").toUpperCase();
  const pu   = parseBRNumber(tr.querySelector(".it-preco").value);
  const subInput = tr.querySelector(".it-sub");
  const calc = calcSubtotal({ desc, qtd, un, preco: pu });
  if (!subInput.dataset.dirty){ // só atualiza se o usuário não editou manualmente
    subInput.value = toMoney(calc);
  }
}

function recalcTotal(){
  let total = 0;
  $("itemsBody").querySelectorAll("tr").forEach(tr=>{
    const sub = parseBRNumber(tr.querySelector(".it-sub").value);
    total += sub;
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

  // recalcula em qualquer mudança
  tr.querySelectorAll(".it-desc,.it-qtd,.it-un,.it-preco").forEach(i=>{
    i.addEventListener("input", ()=>{
      tr.querySelector(".it-sub").dataset.dirty = "";
      recalcRow(tr); recalcTotal();
    });
  });
  tr.querySelector(".it-sub").addEventListener("input", (e)=>{ e.currentTarget.dataset.dirty = "1"; recalcTotal(); });
  tr.querySelector(".btn-rem").addEventListener("click", ()=>{ tr.remove(); recalcTotal(); });

  // 1º cálculo
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

  // frete (aceita numero top-level ou objeto frete)
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
    const sub  = parseBRNumber(tr.querySelector(".it-sub").value);
    if (!desc && qtd<=0) return;
    itens.push({ descricao: desc, qtd, un, precoUnit: pu, subtotal: Number(sub.toFixed(2)) });
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

/* ===========================================================
   Gera a CÓPIA do pedido no MESMO layout do módulo de pedidos.
   Lê primeiro do MODAL; se não houver itens, busca do Firestore.
   =========================================================== */
export async function gerarPDFDoModal(){
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF){ alert("Biblioteca PDF não carregada."); return; }

  // === coleta dados do modal
  const cliente = ($("mCliente").value||"").trim().toUpperCase();
  const entregaISO = $("mDataEntregaISO").value || "";
  const hora = $("mHoraEntrega").value || "";
  const tipoEnt = $("mTipo").value || "ENTREGA";
  const pagamento = ($("mPagamento").value||"").trim().toUpperCase();
  const cupom = ($("mCupomFiscal").value||"").trim();
  const obsG = ($("mObs").value||"").trim().toUpperCase();
  const freteNum = parseBRNumber($("mFrete").value);

  // === itens da TELA
  const itens = [];
  document.querySelectorAll("#itemsBody tr").forEach(tr => {
    const produto = (tr.querySelector(".it-desc")?.value || "").trim();
    const qtd  = parseBRNumber(tr.querySelector(".it-qtd")?.value || "0");
    const un   = (tr.querySelector(".it-un")?.value || "UN").toUpperCase();
    const pu   = parseBRNumber(tr.querySelector(".it-preco")?.value || "0");
    const sub  = parseBRNumber(tr.querySelector(".it-sub")?.value || "0");
    if (produto || qtd > 0) {
      itens.push({ produto, quantidade:qtd, tipo:un, preco:pu, total:sub });
    }
  });

  // Fallback: se a tela não tiver itens por algum motivo, lê direto do Firestore
  if (itens.length === 0 && window.__currentDocId){
    const r = await pedidos_get(window.__currentDocId).catch(()=>null);
    if (r && Array.isArray(r.itens) && r.itens.length){
      r.itens.forEach(it=>{
        const produto = (it.produto || it.descricao || "").toString().trim();
        const qtd  = Number(it.qtd ?? it.quantidade ?? 0);
        const un   = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
        const pu   = Number(it.precoUnit ?? it.preco ?? 0);
        const sub  = Number(it.subtotal ?? (qtd*pu) || 0);
        itens.push({ produto, quantidade:qtd, tipo:un, preco:pu, total:sub });
      });
    }
  }

  // === helpers visuais iguais ao módulo pedidos/pdf.js
  const formatarData = (iso)=> iso ? iso.split("-").reverse().join("/") : "";
  const splitToWidth = (doc, t, w)=> doc.splitTextToSize(t||"", w);
  const money = (n)=> "R$ " + Number(n||0).toFixed(2).replace(".", ",");

  // layout: 72mm x 297mm (portrait)
  const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:[72,297] });
  const margemX=2, larguraCaixa=68, SAFE_BOTTOM=280;
  const W_PROD=23.5, W_QDE=13, W_UNIT=13, W_TOTAL=18.5;
  let y=12;

  const ensureSpace=(h)=>{ if (y+h>SAFE_BOTTOM){ doc.addPage([72,297],"portrait"); y=10; } };
  const line = ()=>{ doc.setLineWidth(0.3); doc.line(2,y,70,y); };

  // Cabeçalho
  doc.setFont("helvetica","bold"); doc.setFontSize(11);
  doc.text("PEDIDO SERRA NOBRE", 36, 7, { align:"center" }); line(); y+=5;

  // Cliente
  ensureSpace(14);
  doc.setDrawColor(0); doc.setLineWidth(0.2);
  doc.rect(margemX, y, larguraCaixa, 12, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8);
  doc.text("CLIENTE:", margemX+3, y+7);
  doc.setFont("helvetica","normal"); doc.setFontSize(8);
  doc.text((cliente || "-"), margemX+22, y+7);
  y+=13;

  // Data/Hora
  const halfW = (larguraCaixa-1)/2;
  ensureSpace(12);
  doc.rect(margemX, y, halfW, 10, "S");
  doc.rect(margemX+halfW+1, y, halfW, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(7);
  doc.text("DATA ENTREGA", margemX+halfW/2, y+4, {align:"center"});
  doc.text("HORÁRIO ENTREGA", margemX+halfW+1+halfW/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(formatarData(entregaISO), margemX+halfW/2, y+8, {align:"center"});
  doc.text(hora, margemX+halfW+1+halfW/2, y+8, {align:"center"});
  y+=12;

  // Pagamento
  ensureSpace(12);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8);
  doc.text("FORMA DE PAGAMENTO", margemX+3, y+6);
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text((pagamento||"-"), margemX+larguraCaixa-3, y+6, {align:"right"});
  y+=12;

  // Tabela itens - Cabeçalho
  ensureSpace(14);
  doc.setFont("helvetica","bold"); doc.setFontSize(7);
  doc.rect(margemX, y, W_PROD, 10, "S");
  doc.rect(margemX+W_PROD, y, W_QDE, 10, "S");
  doc.rect(margemX+W_PROD+W_QDE, y, W_UNIT, 10, "S");
  doc.rect(margemX+W_PROD+W_QDE+W_UNIT, y, W_TOTAL, 10, "S");
  doc.text("PRODUTO", margemX+W_PROD/2, y+6, {align:"center"});
  doc.text("QDE", margemX+W_PROD+W_QDE/2, y+6, {align:"center"});
  doc.text("R$ UNIT.", margemX+W_PROD+W_QDE+W_UNIT/2, y+6, {align:"center"});
  const valorX = margemX+W_PROD+W_QDE+W_UNIT+W_TOTAL/2;
  doc.text("VALOR", valorX, y+4, {align:"center"});
  doc.text("PRODUTO", valorX, y+8.5, {align:"center"});
  y += 12;

  // Linhas de itens
  let subtotal = 0;
  doc.setFont("helvetica","normal"); doc.setFontSize(9);

  itens.forEach((it, idx) => {
    const prod = (it.produto || "").toUpperCase();
    const qtdStr = String(it.quantidade || 0);
    const tipo = (it.tipo || "KG").toUpperCase();
    const precoNum = Number(it.preco || 0);
    const totalNum = Number(it.total || (Number(it.quantidade||0)*precoNum));

    const prodLines = splitToWidth(doc, prod, W_PROD-2).slice(0,3);
    const rowHi = Math.max(14, 6 + prodLines.length*5);
    ensureSpace(rowHi);

    doc.rect(margemX, y, W_PROD, rowHi, "S");
    doc.rect(margemX+W_PROD, y, W_QDE, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE, y, W_UNIT, rowHi, "S");
    doc.rect(margemX+W_PROD+W_QDE+W_UNIT, y, W_TOTAL, rowHi, "S");

    const center=(cx, lines)=>{
      const block=(lines.length-1)*5;
      const base=y+(rowHi-block)/2;
      lines.forEach((ln,k)=>doc.text(ln,cx,base+k*5,{align:"center"}));
    };

    center(margemX+W_PROD/2, prodLines);
    center(margemX+W_PROD+W_QDE/2, qtdStr ? [qtdStr, tipo] : [""]);
    center(margemX+W_PROD+W_QDE+W_UNIT/2, precoNum ? ["R$", money(precoNum).slice(3)] : ["—"]);
    center(margemX+W_PROD+W_QDE+W_UNIT+W_TOTAL/2, totalNum ? ["R$", money(totalNum).slice(3)] : ["—"]);

    y += rowHi;
    subtotal += totalNum;
    if (idx < itens.length-1) y += 2;
  });

  // Soma produtos
  const w2tercos = Math.round(larguraCaixa*(2/3));
  const somaX = margemX + larguraCaixa - w2tercos;
  ensureSpace(11);
  doc.rect(somaX, y, w2tercos, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(7);
  doc.text("SOMA PRODUTOS:", somaX+3, y+6);
  doc.setFont("helvetica","normal");
  doc.text(money(subtotal), somaX+w2tercos-3, y+6, {align:"right"});
  y += 12;

  // ENTREGA/RETIRADA + FRETE
  const gap2=2; const entregaW=Math.round(larguraCaixa*(2/3)); const freteW=larguraCaixa-entregaW-gap2;
  ensureSpace(12);
  doc.rect(margemX, y, entregaW, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text((tipoEnt||"ENTREGA").toUpperCase(), margemX+entregaW/2, y+6.5, {align:"center"});

  const freteX = margemX + entregaW + gap2;
  doc.rect(freteX, y, freteW, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(8);
  doc.text("FRETE", freteX+freteW/2, y+4, {align:"center"});
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(money(freteNum), freteX+freteW/2, y+8.2, {align:"center"});
  y += 12;

  // TOTAL
  const totalGeral = subtotal + (freteNum||0);
  ensureSpace(11);
  doc.rect(margemX, y, larguraCaixa, 10, "S");
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text("TOTAL DO PEDIDO:", margemX+3, y+5.5);
  doc.text(money(totalGeral), margemX+larguraCaixa-3, y+5.5, {align:"right"});
  y += 12;

  if (cupom){
    ensureSpace(10);
    doc.rect(margemX, y, larguraCaixa, 8, "S");
    doc.setFont("helvetica","bold"); doc.setFontSize(8);
    doc.text("CUPOM:", margemX+3, y+5.2);
    doc.setFont("helvetica","normal");
    doc.text(cupom, margemX+20, y+5.2);
    y += 9;
  }
  if (pagamento){
    ensureSpace(10);
    doc.rect(margemX, y, larguraCaixa, 8, "S");
    doc.setFont("helvetica","bold"); doc.setFontSize(8);
    doc.text("PAGAMENTO:", margemX+3, y+5.2);
    doc.setFont("helvetica","normal");
    doc.text(pagamento, margemX+26, y+5.2);
    y += 9;
  }
  if (obsG){
    const pad=3, innerW=larguraCaixa-pad*2;
    const linhas = splitToWidth(doc, obsG, innerW);
    const h = Math.max(12, 6 + linhas.length*5 + 4);
    ensureSpace(h);
    doc.rect(margemX,y,larguraCaixa,h,"S");
    doc.setFont("helvetica","bold"); doc.setFontSize(8);
    doc.text("OBSERVAÇÕES", margemX+pad, y+5);
    doc.setFont("helvetica","normal"); doc.setFontSize(8);
    const baseY = y+9; linhas.forEach((ln,i)=>doc.text(ln, margemX+pad, baseY+i*5));
    y += h;
  }

  // Altura final e salvar
  doc.internal.pageSize.height = y + 6;
  const nome = `${(cliente||'CLIENTE').replace(/\s+/g,'_')}_${(entregaISO||'').replace(/-/g,'')}_${(hora||'').replace(/:/g,'')}.pdf`;
  doc.save(nome);
}