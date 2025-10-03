// relatorios/js/print.js
import { pedidos_get } from "./db.js";
import { moneyBR } from "./render.js";

const money = n => `R$ ${moneyBR(n)}`;

// Gera um nome de arquivo amigável, ex.: CLIENTE_03_10_25_H10-30.pdf
function nomeArquivoPedido(r){
  const cliente = String(r.cliente||"CLIENTE").trim().split(/\s+/).slice(0,2).join('_').toUpperCase();
  const iso = String(r.dataEntregaISO||"").split("-");
  const dd = iso[2]||"DD", mm = iso[1]||"MM", aa = (iso[0]||"AAAA").slice(-2);
  const hh = (r.horaEntrega||"").slice(0,2)||"HH";
  const mn = (r.horaEntrega||"").slice(3,5)||"MM";
  return `${cliente}_${dd}_${mm}_${aa}_H${hh}-${mn}.pdf`;
}

export async function printPedido80mm(pedidoId){
  const { jsPDF } = window.jspdf;
  const r = await pedidos_get(pedidoId);
  if (!r){ alert("Pedido não encontrado."); return; }

  // Largura 80mm (ajuste para 70 se necessário)
  const width = 80, margin = 4;
  let y = margin + 2;

  const doc = new jsPDF({ unit:"mm", format:[width, 600] }); // altura grande; ajustamos no final
  const line = ()=> { doc.setLineWidth(.2); doc.line(margin, y, width-margin, y); y += 2; };
  const center = (t)=> doc.text(String(t), width/2, y, { align:"center" });

  // Cabeçalho
  doc.setFont("helvetica","bold"); doc.setFontSize(14);
  center("SERRA NOBRE"); y += 7;

  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  const dt = (r.dataEntregaISO||"").split("-").reverse().join("/");
  doc.text(`ENTREGA: ${dt} ${r.horaEntrega||""}`, margin, y); y += 5;
  doc.text(`CLIENTE: ${(r.cliente||"").toUpperCase()}`, margin, y); y += 5;
  const ender = (r?.entrega?.endereco || r.endereco || "").toString().toUpperCase();
  if (ender){ doc.text(`END: ${ender}`, margin, y); y += 5; }
  line();

  // Itens
  doc.setFont("helvetica","bold"); doc.text("ITENS", margin, y); y += 5;
  doc.setFont("helvetica","normal");

  const itens = Array.isArray(r.itens) ? r.itens : [];
  let subtotal = 0;
  itens.forEach(it=>{
    const nome = (it.produto || it.descricao || "").toString().toUpperCase();
    const qtd  = Number(it.qtd ?? it.quantidade ?? 0);
    const un   = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
    const pu   = Number(it.precoUnit ?? it.preco ?? 0);
    const tot  = Number((qtd*pu).toFixed(2));
    subtotal += tot;

    doc.text(nome, margin, y); y += 4;
    doc.text(`${qtd} ${un} x ${money(pu)}`, margin, y);
    doc.text(money(tot), width - margin, y, { align: "right" }); y += 5;
  });

  line();

  // Resumo
  const frete = r?.frete?.isento ? 0 : Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? r?.freteValor ?? 0);
  const total = subtotal + frete;

  doc.text(`SUBTOTAL: ${money(subtotal)}`, margin, y); y += 5;
  doc.text(`FRETE: ${money(frete)}`, margin, y); y += 5;
  doc.setFont("helvetica","bold"); doc.text(`TOTAL: ${money(total)}`, margin, y); y += 7;
  doc.setFont("helvetica","normal");

  if (r.cupomFiscal){ doc.text(`CUPOM: ${String(r.cupomFiscal)}`, margin, y); y += 5; }
  if (r.pagamento){  doc.text(`PAGAMENTO: ${String(r.pagamento).toUpperCase()}`, margin, y); y += 5; }

  // Ajusta a altura ao conteúdo para salvar sem “cauda”
  const finalHeight = y + margin;
  doc.internal.pageSize.height = finalHeight;

  // Salvar arquivo (não imprime automaticamente)
  doc.save(nomeArquivoPedido(r));
}