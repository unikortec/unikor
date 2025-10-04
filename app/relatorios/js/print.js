// relatorios/js/print.js
import { pedidos_get } from "./db.js";
import { moneyBR } from "./render.js";
import { app } from "./firebase.js";

const money = n => `R$ ${moneyBR(n)}`;

/**
 * Reimprime o pedido:
 * 1) se existir `pdfPath` no doc, abre o PDF do Firebase Storage (mais rápido);
 * 2) senão, reconstrói no layout 80mm e baixa.
 */
export async function printPedido80mm(pedidoId){
  const { jsPDF } = window.jspdf;
  if (!pedidoId){ alert("ID do pedido inválido."); return; }

  // tenta abrir do Storage
  try{
    const rMeta = await pedidos_get(pedidoId);
    const pdfPath = rMeta?.pdfPath;
    if (pdfPath){
      const { getStorage, ref, getDownloadURL } =
        await import("https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js");
      const url = await getDownloadURL(ref(getStorage(app), pdfPath));
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
  }catch(e){ /* se der erro, cai no fallback */ }

  // ===== Fallback: reconstrói cupom 80mm =====
  const r = await pedidos_get(pedidoId).catch(()=>null);
  if (!r){ alert("Pedido não encontrado."); return; }

  const cliente = (r.cliente || "").toString().toUpperCase();
  const ender   = (r?.entrega?.endereco || r.endereco || "").toString().toUpperCase();
  const dataBR  = String(r.dataEntregaISO||"").split("-").reverse().join("/");
  const hora    = r.horaEntrega || "";
  const itens   = Array.isArray(r.itens) ? r.itens : [];
  const frete   = r?.frete?.isento ? 0 : Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? r?.freteValor ?? 0);
  const pagamento = (r.pagamento||"").toString().toUpperCase();
  const cupom     = (r.cupomFiscal && String(r.cupomFiscal).trim()) ? String(r.cupomFiscal) : "-";
  const tipoEnt   = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");

  const width = 80, margin = 4;
  let y = margin + 2;
  const doc = new jsPDF({ unit:"mm", format:[width, 600], orientation:"portrait" });
  const line = () => { doc.setLineWidth(.2); doc.line(margin, y, width - margin, y); y += 2; };

  doc.setFont("helvetica","bold"); doc.setFontSize(14);
  doc.text("SERRA NOBRE", width/2, y, { align:"center" }); y += 6;
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(`ENTREGA: ${dataBR} ${hora}`, margin, y); y += 5;
  doc.text(`TIPO: ${tipoEnt}`, margin, y); y += 5;
  if (pagamento) { doc.text(`PAGAMENTO: ${pagamento}`, margin, y); y += 5; }
  if (cupom && cupom !== "-") { doc.text(`CUPOM: ${cupom}`, margin, y); y += 5; }
  line();

  doc.setFont("helvetica","bold"); doc.text("CLIENTE", margin, y); y += 4;
  doc.setFont("helvetica","normal");
  doc.text(cliente, margin, y); y += 5;
  if (ender){ doc.text(ender, margin, y); y += 5; }
  line();

  doc.setFont("helvetica","bold"); doc.text("ITENS", margin, y); y += 5;
  doc.setFont("helvetica","normal");
  let subtotal = 0;
  itens.forEach(it=>{
    const nome = (it.produto || it.descricao || "").toString().toUpperCase();
    const qtd  = Number(it.qtd ?? it.quantidade ?? 0);
    const un   = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
    const pu   = Number(it.precoUnit ?? it.preco ?? 0);

    // usa subtotal salvo ou calcula
    let tot = typeof it.subtotal === "number" ? Number(it.subtotal) : (qtd*pu);
    subtotal += tot;

    const lines = doc.splitTextToSize(nome, width - margin*2);
    lines.forEach((ln)=>{ doc.text(ln, margin, y); y += 4; });
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