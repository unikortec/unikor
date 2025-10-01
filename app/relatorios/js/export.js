import { $, moneyBR, toBR } from './render.js';

function setLoading(btn, isLoading, label){
  if (!btn) return;
  const lbl = btn.querySelector(".lbl");
  if (isLoading){
    btn.setAttribute("disabled","true");
    if (lbl) lbl.textContent = label || lbl.textContent || "Processando…";
    const sp = document.createElement("span"); sp.className = "spinner"; sp.setAttribute("data-spin","1");
    btn.prepend(sp);
  } else {
    btn.removeAttribute("disabled");
    btn.querySelector(".spinner[data-spin]")?.remove();
  }
}
const nextFrame = () => new Promise(r => setTimeout(r, 0));

export async function exportarXLSX(rows){
  if (!rows.length){ alert("Nada para exportar."); return; }
  const btn = $("btnXLSX"); setLoading(btn, true, "Exportar XLSX");
  try{
    const modo = $("fModo").value || "reduzido";
    const data = rows.map(r=>{
      const base = {
        "Data": toBR(r.dataEntregaISO||""), "Hora": r.horaEntrega||"",
        "Cliente": r.cliente||"", "Itens": Array.isArray(r.itens)? r.itens.length : 0,
        "Total (R$)": Number(r.totalPedido||0),
        "Tipo": (r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA",
        "Pagamento": r.pagamento||"", "Cupom": (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-",
        "ID": r.id
      };
      if (modo==="detalhado"){
        const itensTxt = (Array.isArray(r.itens)? r.itens : [])
          .map(i => `${i.produto||i.descricao||""} • ${i.quantidade||i.qtd||0} ${i.tipo||i.un||"un"} x ${i.precoUnit||i.preco||0}`).join(" | ");
        return { ...base, "Itens (detalhe)": itensTxt };
      }
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");

    await nextFrame();
    XLSX.writeFile(wb, `Relatorio_${new Date().toISOString().slice(0,10)}.xlsx`);
  } finally { setLoading(btn, false); }
}

export async function exportarPDF(rows){
  if (!rows.length){ alert("Nada para gerar."); return; }
  const btn = $("btnPDF"); setLoading(btn, true, "Gerar PDF");
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    const modo = $("fModo").value || "reduzido";
    const left=10, top=12, lineH=7, maxW = 277;
    let y = top;

    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("Relatórios — Unikor", left, y); y += 6;
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, left, y); y += 6;

    doc.setFont("helvetica","bold");
    const headers = ["Data","Hora","Cliente","Itens","Total (R$)","Tipo","Pagamento","Cupom"];
    const colsW   = [20,16,70,14,26,24,40,55];
    let x = left;
    headers.forEach((h,i)=>{ doc.text(h, x, y); x += colsW[i]; });
    y += 3;
    doc.setLineWidth(.2); doc.line(left, y, left+colsW.reduce((a,b)=>a+b,0), y); y += 4;
    doc.setFont("helvetica","normal");

    for (const r of rows){
      x = left;
      const row = [
        toBR(r.dataEntregaISO||""), r.horaEntrega||"", r.cliente||"",
        (Array.isArray(r.itens)? r.itens.length : 0).toString(),
        moneyBR(r.totalPedido||0),
        ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA"?"RETIRADA":"ENTREGA"),
        r.pagamento||"", (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-"
      ];
      const clienteLines = doc.splitTextToSize(row[2], colsW[2]-2);
      const cupomLines   = doc.splitTextToSize(row[7], colsW[7]-2);
      const lines = Math.max(1, clienteLines.length, cupomLines.length);
      const h = lines*lineH;

      if (y + h > 200){ doc.addPage(); y = top; }

      const cells = [row[0], row[1], clienteLines, row[3], row[4], row[5], row[6], cupomLines];
      for (let i=0;i<cells.length;i++){
        const val = cells[i];
        if (Array.isArray(val)){ val.forEach((ln,k)=> doc.text(ln, x, y + (k+1)*lineH - 2)); }
        else { doc.text(String(val), x, y + lineH - 2); }
        x += colsW[i];
      }
      y += h;

      if (modo==="detalhado" && Array.isArray(r.itens) && r.itens.length){
        const itemsTxt = r.itens.map(it=>`• ${(it.produto||it.descricao||"")} — ${(it.quantidade||it.qtd||0)} ${(it.tipo||it.un||"")} x ${moneyBR(it.precoUnit||it.preco||0)} = ${moneyBR(it.total||it.subtotal||0)}`).join("\n");
        const itemsLines = doc.splitTextToSize(itemsTxt, maxW);
        itemsLines.forEach((ln)=>{ if (y>200){ doc.addPage(); y=top; } doc.text(ln, left+6, y); y += 5; });
        y += 2;
      }
    }

    const total = rows.reduce((s,r)=> s + Number(r.totalPedido||0), 0);
    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    if (y>190){ doc.addPage(); y=top; }
    doc.text(`TOTAL: R$ ${moneyBR(total)}`, left, y+6);
    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally { setLoading(btn, false); }
}