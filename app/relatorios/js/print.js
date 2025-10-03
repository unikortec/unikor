// relatorios/js/print.js
import { pedidos_get } from "./db.js";
import { moneyBR } from "./render.js";

const money = n => `R$ ${moneyBR(n)}`;

function ensureJsPDF(){
  if (!window.jspdf || !window.jspdf.jsPDF){
    throw new Error("jsPDF não carregado. Verifique o <script> jspdf.umd.min.js no index.html.");
  }
  return window.jspdf.jsPDF;
}

export async function printPedido80mm(pedidoId){
  try{
    const jsPDF = ensureJsPDF();
    const r = await pedidos_get(pedidoId);
    if (!r){ alert("Pedido não encontrado."); return; }

    // Largura do rolo (80mm). Se sua impressora for 70mm, mude p/ 70:
    const width = 80, margin = 4;
    let y = margin + 2;

    // Altura grande; ajustamos ao final para não “cortar”
    const doc = new jsPDF({ unit:"mm", format:[width, 600], orientation:"portrait" });
    const line = ()=>{ doc.setLineWidth(.2); doc.line(margin, y, width - margin, y); y += 2; };

    // Cabeçalho
    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("SERRA NOBRE", width/2, y, { align:"center" }); y += 7;

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
      const tot  = Number((qtd * pu).toFixed(2));
      subtotal += tot;

      doc.text(nome, margin, y); y += 4;
      doc.text(`${qtd} ${un} x ${money(pu)}`, margin, y);
      doc.text(money(tot), width - margin, y, { align:"right" }); y += 5;
    });

    line();

    const frete = r?.frete?.isento ? 0 : Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? r?.freteValor ?? 0);
    const total = subtotal + frete;

    doc.text(`SUBTOTAL: ${money(subtotal)}`, margin, y); y += 5;
    doc.text(`FRETE: ${money(frete)}`, margin, y); y += 5;
    doc.setFont("helvetica","bold"); doc.text(`TOTAL: ${money(total)}`, margin, y); y += 7;
    doc.setFont("helvetica","normal");

    if (r.cupomFiscal){ doc.text(`CUPOM: ${String(r.cupomFiscal)}`, margin, y); y += 5; }
    if (r.pagamento){  doc.text(`PAGAMENTO: ${String(r.pagamento).toUpperCase()}`, margin, y); y += 5; }

    // Ajusta a altura da página ao conteúdo
    const finalH = y + margin;
    if (doc.internal?.pageSize?.setHeight) doc.internal.pageSize.setHeight(finalH);
    else doc.internal.pageSize.height = finalH;

    try { doc.autoPrint(); } catch {}
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  }catch(e){
    console.error(e);
    alert("Não foi possível gerar o cupom para impressão. Veja o console para detalhes.");
  }
}