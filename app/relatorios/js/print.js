import { pedidos_get } from "./db.js";
import { moneyBR } from "./render.js";

const money = n => `R$ ${moneyBR(n)}`;

/**
 * Gera uma cópia do pedido (térmica 70/80mm) a partir do DOC no Firestore
 * e abre o diálogo para SALVAR o PDF.
 */
export async function printPedido80mm(pedidoId){
  const { jsPDF } = window.jspdf;
  if (!pedidoId){ alert("ID do pedido inválido."); return; }

  const r = await pedidos_get(pedidoId).catch(()=>null);
  if (!r){ alert("Pedido não encontrado."); return; }

  // --- Normalizações
  const cliente = (r.cliente || "").toString().toUpperCase();
  const ender   = (r?.entrega?.endereco || r.endereco || "").toString().toUpperCase();
  const dataBR  = String(r.dataEntregaISO||"").split("-").reverse().join("/");
  const hora    = r.horaEntrega || "";
  const itens   = Array.isArray(r.itens) ? r.itens : [];
  const frete   = r?.frete?.isento ? 0 : Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? r?.freteValor ?? 0);
  const pagamento = (r.pagamento||"").toString().toUpperCase();
  const cupom     = (r.cupomFiscal && String(r.cupomFiscal).trim()) ? String(r.cupomFiscal) : "-";
  const tipoEnt   = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");

  // --- Documento 80mm (muda para 70 se precisar)
  const width = 80, margin = 4;
  let y = margin + 2;
  const doc = new jsPDF({ unit:"mm", format:[width, 600], orientation:"portrait" });

  const line = () => { doc.setLineWidth(.2); doc.line(margin, y, width - margin, y); y += 2; };

  // Cabeçalho
  doc.setFont("helvetica","bold"); doc.setFontSize(14);
  doc.text("SERRA NOBRE", width/2, y, { align:"center" }); y += 6;
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(`ENTREGA: ${dataBR} ${hora}`, margin, y); y += 5;
  doc.text(`TIPO: ${tipoEnt}`, margin, y); y += 5;
  if (pagamento) { doc.text(`PAGAMENTO: ${pagamento}`, margin, y); y += 5; }
  if (cupom && cupom !== "-") { doc.text(`CUPOM: ${cupom}`, margin, y); y += 5; }
  line();

  // Cliente
  doc.setFont("helvetica","bold");
  doc.text("CLIENTE", margin, y); y += 4;
  doc.setFont("helvetica","normal");
  doc.text(cliente, margin, y); y += 5;
  if (ender){ doc.text(ender, margin, y); y += 5; }
  line();

  // Itens
  doc.setFont("helvetica","bold"); doc.text("ITENS", margin, y); y += 5;
  doc.setFont("helvetica","normal");
  let subtotal = 0;
  itens.forEach(it=>{
    const nome = (it.produto || it.descricao || "").toString().toUpperCase();
    const qtd  = Number(it.qtd ?? it.quantidade ?? 0);
    const un   = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
    const pu   = Number(it.precoUnit ?? it.preco ?? 0);
    const tot  = Number((qtd*pu).toFixed(2));
    subtotal += tot;

    const lines = doc.splitTextToSize(nome, width - margin*2);
    lines.forEach((ln,i)=>{ doc.text(ln, margin, y); y += 4; });

    doc.text(`${qtd} ${un} x ${money(pu)}`, margin, y);
    doc.text(money(tot), width - margin, y, { align: "right" }); y += 6;
  });

  line();

  const total = subtotal + frete;
  doc.text(`SUBTOTAL: ${money(subtotal)}`, margin, y); y += 5;
  doc.text(`FRETE: ${money(frete)}`, margin, y); y += 5;
  doc.setFont("helvetica","bold");
  doc.text(`TOTAL: ${money(total)}`, margin, y); y += 7;
  doc.setFont("helvetica","normal");

  doc.internal.pageSize.height = y + margin;

  const nome = `Pedido_${(cliente||'').replace(/\s+/g,'_')}_${(r.dataEntregaISO||'').replaceAll('-','')}.pdf`;
  doc.save(nome);
}