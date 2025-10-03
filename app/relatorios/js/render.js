// relatorios/js/render.js
export const $ = (id)=>document.getElementById(id);
export const moneyBR = (n)=> (Number(n||0)).toFixed(2).replace(".", ",");
export const toBR = (iso)=> { if(!iso) return ""; const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; };
export const userPrefix = (emailOrUid="") => String(emailOrUid).split("@")[0] || "—";

function freteFromRow(r){
  const f = r?.frete || {};
  const isento = !!f.isento;
  const v = Number(f.valorCobravel ?? f.valorBase ?? 0);
  return isento ? 0 : v;
}

export function renderRows(docs){
  const tbody = $("tbody");
  const seen  = new Set();
  const rows  = [];
  let totalItensValor = 0;
  let totalFreteValor = 0;
  let totalQtdeItens  = 0;

  for (const r of docs){
    if (seen.has(r.id)) continue;
    seen.add(r.id);

    const itens = Array.isArray(r.itens) ? r.itens : [];
    const totItens = Number(r.totalPedido ?? 0);
    const frete = freteFromRow(r);

    totalItensValor += totItens;
    totalFreteValor += frete;
    totalQtdeItens  += itens.length;

    const tipoTxt = ((r?.entrega?.tipo || "").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
    const cupom = (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-";

    rows.push(`
      <tr data-rowid="${r.id}">
        <td>${toBR(r.dataEntregaISO||"")}</td>
        <td>${r.horaEntrega||""}</td>
        <td class="cell-client" data-id="${r.id}" title="Clique para editar">${(r.cliente||"")}</td>
        <td>${itens.length}</td>
        <td>R$ ${moneyBR(totItens)}</td>
        <td>${tipoTxt}</td>
        <td>${r.pagamento||""}</td>
        <td>R$ ${moneyBR(frete)}</td>
        <td class="center">${cupom}</td>
        <td><button class="btn icon btn-print"  data-id="${r.id}" title="Reimprimir cupom">🖨</button></td>
        <td><button class="btn icon btn-cancel" data-id="${r.id}" title="Cancelar / excluir pedido">×</button></td>
      </tr>
    `);
  }

  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="11">Sem resultados.</td></tr>`;
    $("ftCount").textContent = "0 pedidos";
    $("ftTotal").textContent = "R$ 0,00";
    const elItems = document.getElementById("ftItens");
    const elFrete = document.getElementById("ftFrete");
    if (elItems) elItems.textContent = "0 itens";
    if (elFrete) elFrete.textContent = "R$ 0,00";
    return;
  }

  tbody.innerHTML = rows.join("");

  $("ftCount").textContent = `${seen.size} pedido(s)`;
  $("ftTotal").textContent = `R$ ${moneyBR(totalItensValor)}`;

  // totais de itens e frete (rodapé)
  const elItens = document.getElementById("ftItens");
  const elFrete = document.getElementById("ftFrete");
  if (elItens) elItens.textContent = `${totalQtdeItens} item(ns)`;
  if (elFrete) elFrete.textContent = `R$ ${moneyBR(totalFreteValor)}`;
}