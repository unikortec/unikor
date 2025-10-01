// js/render.js
export const $ = (id)=>document.getElementById(id);
export const moneyBR = (n)=> (Number(n||0)).toFixed(2).replace(".", ",");
export const toBR = (iso)=> { if(!iso) return ""; const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; };
export const userPrefix = (emailOrUid="") => String(emailOrUid).split("@")[0] || "—";

export function renderRows(docs){
  const tbody = $("tbody");
  const seen  = new Set();
  const rows  = [];
  let total   = 0;

  for (const r of docs){
    if (seen.has(r.id)) continue;
    seen.add(r.id);

    const itens = Array.isArray(r.itens) ? r.itens : [];
    const tot = Number(r.totalPedido ?? 0);
    total += tot;

    const tipoTxt = ((r?.entrega?.tipo || "").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
    const cupom = (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-";

    rows.push(`
      <tr data-rowid="${r.id}">
        <td>${toBR(r.dataEntregaISO||"")}</td>
        <td>${r.horaEntrega||""}</td>
        <td class="cell-client" data-id="${r.id}" title="Clique para editar">${(r.cliente||"")}</td>
        <td>${itens.length}</td>
        <td>R$ ${moneyBR(tot)}</td>
        <td>${tipoTxt}</td>
        <td>${r.pagamento||""}</td>
        <td>${cupom}</td>
        <td><button class="btn danger icon btn-cancel" data-id="${r.id}" title="Cancelar / excluir pedido">×</button></td>
      </tr>
    `);
  }

  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="9">Sem resultados.</td></tr>`;
    $("ftCount").textContent = "0 pedidos";
    $("ftTotal").textContent = "R$ 0,00";
    return;
  }

  tbody.innerHTML = rows.join("");
  $("ftCount").textContent = `${seen.size} pedido(s)`;
  $("ftTotal").textContent = `R$ ${moneyBR(total)}`;
}