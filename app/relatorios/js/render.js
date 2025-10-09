// =========================
// UNIKOR RELATÓRIOS - render.js (com milhares e R$ inline)
// =========================

export const $ = (id)=>document.getElementById(id);

export const moneyBR = (n)=>{
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(v);
  } catch {
    // fallback
    const s = (Math.round(v * 100) / 100).toFixed(2);
    const [int, dec] = s.split(".");
    return int.replace(/\B(?=(\d{3})+(?!\d))/g,".") + "," + dec;
  }
};

export const toBR = (iso)=> { 
  if(!iso) return ""; 
  const [y,m,d] = iso.split("-"); 
  return `${d}/${m}/${y}`; 
};

export const userPrefix = (emailOrUid="") => String(emailOrUid).split("@")[0] || "—";

function freteFromRow(r){
  const f = r?.frete || {};
  const isento = !!f.isento;
  const v = Number(f.valorCobravel ?? f.valorBase ?? 0);
  return isento ? 0 : v;
}

/* mesmas regras de subtotal usadas no db/export */
function kgPorUnFromDesc(desc=""){
  const s = String(desc).toLowerCase().replace(',', '.').replace(/\s+/g,' ');
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
  let m,last=null; 
  while((m=re.exec(s))!==null) last=m;
  if (!last) return 0;
  const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
  const val = parseFloat(raw); 
  if (!isFinite(val)||val<=0) return 0;
  const unit = last[2].toLowerCase();
  return (unit.startsWith('kg') || unit.startsWith('quilo')) ? val : (val/1000);
}

function subtotalItem(it){
  const qtd = Number(it.qtd ?? it.quantidade ?? 0);
  const un  = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
  const pu  = Number(it.precoUnit ?? it.preco ?? 0);
  if (typeof it.subtotal === "number") return Number(it.subtotal||0);
  if (un === "UN"){
    const kgUn = kgPorUnFromDesc(it.descricao || it.produto || "");
    return kgUn > 0 ? (qtd * kgUn) * pu : (qtd * pu);
  }
  return qtd * pu;
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
    const totItens = itens.reduce((s,it)=> s + subtotalItem(it), 0);
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
    tbody.innerHTML = `<tr><td colspan="11" class="muted">Sem resultados.</td></tr>`;
    $("ftCount").textContent = "0";
    $("ftTotal").textContent = "R$ 0,00";
    $("ftItens").textContent = "0";
    $("ftFrete").textContent = "R$ 0,00";
    return;
  }

  tbody.innerHTML = rows.join("");
  $("ftCount").textContent = `${seen.size}`;
  $("ftItens").textContent = `${totalQtdeItens}`;
  $("ftTotal").textContent = `R$ ${moneyBR(totalItensValor)}`;
  $("ftFrete").textContent = `R$ ${moneyBR(totalFreteValor)}`;
}