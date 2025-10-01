// js/export.js
import { $, moneyBR, toBR } from './render.js';

export function setBtnLoading(btn, isLoading, labelWhenIdle){
  if (!btn) return;
  const lbl = btn.querySelector(".lbl");
  if (isLoading){
    btn.setAttribute("disabled","true");
    if (lbl) lbl.textContent = labelWhenIdle || lbl.textContent || "Processando…";
    const sp = document.createElement("span");
    sp.className = "spinner"; sp.setAttribute("data-spin","1"); btn.prepend(sp);
  }else{
    btn.removeAttribute("disabled");
    const sp = btn.querySelector(".spinner[data-spin]"); if (sp) sp.remove();
  }
}

const nextFrame = () => new Promise(r => setTimeout(r, 0));

async function ensureXLSXLoaded(){
  if (window.XLSX) return true;
  // tenta importar dinamicamente como fallback
  try{
    await import('https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js');
    return !!window.XLSX;
  }catch{
    try{
      await import('https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js');
      return !!window.XLSX;
    }catch{ return false; }
  }
}

export async function exportarXLSX(rows){
  if (!rows.length){ alert("Nada para exportar."); return; }
  const btn = $("btnXLSX");
  setBtnLoading(btn, true, "Exportar XLSX");

  try{
    const ok = await ensureXLSXLoaded();
    if (!ok){ alert("Não consegui carregar o gerador XLSX (conexão). Tente novamente."); return; }

    const modo = $("fModo").value || "reduzido";
    const data = rows.map(r=>{
      const itensQtd = Array.isArray(r.itens)? r.itens.length : 0;
      const total = Number(r.totalPedido||0) || (Array.isArray(r.itens)
        ? r.itens.reduce((s,it)=>{
            const qtd = Number(it.qtd ?? it.quantidade ?? 0);
            const pu  = Number(it.precoUnit ?? it.preco ?? 0);
            const sub = Number(it.subtotal ?? (qtd*pu));
            return s+(isFinite(sub)?sub:0);
          },0) : 0);

      const base = {
        "Data": toBR(r.dataEntregaISO||""),
        "Hora": r.horaEntrega||"",
        "Cliente": r.cliente||"",
        "Itens": itensQtd,
        "Total (R$)": Number(total.toFixed(2)),
        "Tipo": (r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA",
        "Pagamento": r.pagamento||"",
        "Cupom": (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-",
        "ID": r.id
      };

      if (modo==="detalhado"){
        const itensTxt = (Array.isArray(r.itens)? r.itens : [])
          .map(i => `${i.produto||i.descricao||""} • ${i.quantidade||i.qtd||0} ${i.tipo||i.un||"un"} x ${Number(i.precoUnit||i.preco||0).toFixed(2)}`)
          .join(" | ");
        return { ...base, "Itens (detalhe)": itensTxt };
      }
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");

    await nextFrame();
    const nome = `Relatorio_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, nome);
  } finally {
    setBtnLoading(btn, false, "Exportar XLSX");
  }
}

export async function exportarPDF(rows){
  if (!rows.length){ alert("Nada para gerar."); return; }
  const btn = $("btnPDF");
  setBtnLoading(btn, true, "Gerar PDF");
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    const modo = $("fModo").value || "reduzido";
    const left=10, top=12, lineH=6; // um pouco menor p/ não sobrepor
    let y = top;

    // título
    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text("Relatórios — Serra Nobre", left, y); y += 6;
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, left, y); y += 6;

    // cabeçalhos
    doc.setFont("helvetica","bold");
    const headers = ["Data","Hora","Cliente","Itens","Total (R$)","Tipo","Pagamento","Cupom"];
    const colsW   = [20,16,70,14,26,24,40,55];
    let x = left;
    headers.forEach((h,i)=>{ doc.text(h, x, y); x += colsW[i]; });
    y += 3;
    doc.setLineWidth(.2); doc.line(left, y, left+colsW.reduce((a,b)=>a+b,0), y); y += 4;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);

    const totalGeral = rows.reduce((s,r)=>{
      const tot = Number(r.totalPedido||0) || (Array.isArray(r.itens)
        ? r.itens.reduce((a,it)=> a + Number(it.subtotal || (Number(it.qtd||it.quantidade||0)*Number(it.precoUnit||it.preco||0))) ,0) : 0);
      return s + tot;
    },0);

    for (const r of rows){
      x = left;
      const totRow = Number(r.totalPedido||0) || (Array.isArray(r.itens)
        ? r.itens.reduce((a,it)=> a + Number(it.subtotal || (Number(it.qtd||it.quantidade||0)*Number(it.precoUnit||it.preco||0))),0) : 0);

      const row = [
        (r.dataEntregaISO? r.dataEntregaISO.split("-").reverse().join("/") : ""),
        r.horaEntrega||"", r.cliente||"",
        (Array.isArray(r.itens)? r.itens.length : 0).toString(),
        moneyBR(totRow),
        ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA"?"RETIRADA":"ENTREGA"),
        r.pagamento||"", (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-"
      ];

      const clienteLines = doc.splitTextToSize(row[2], colsW[2]-2);
      const cupomLines   = doc.splitTextToSize(row[7], colsW[7]-2);
      const lines = Math.max(1, clienteLines.length, cupomLines.length);
      const h = lines*lineH + 1;

      if (y + h > 190){ doc.addPage(); y = top; }

      const cells = [row[0], row[1], clienteLines, row[3], row[4], row[5], row[6], cupomLines];
      for (let i=0;i<cells.length;i++){
        const val = cells[i];
        if (Array.isArray(val)){
          val.forEach((ln,k)=> doc.text(ln, x, y + (k+1)*lineH - 1));
        } else {
          doc.text(String(val), x, y + lineH - 1);
        }
        x += colsW[i];
      }
      y += h;

      if (modo==="detalhado" && Array.isArray(r.itens) && r.itens.length){
        doc.setFontSize(8);
        const itemsTxt = r.itens.map(it=>{
          const qtd = Number(it.qtd||it.quantidade||0);
          const pu  = Number(it.precoUnit||it.preco||0);
          const sub = Number(it.subtotal || (qtd*pu));
          return `• ${(it.produto||it.descricao||"")} — ${qtd} ${(it.tipo||it.un||"")} x ${moneyBR(pu)} = ${moneyBR(sub)}`;
        }).join("\n");

        const maxW = 277;
        const itemsLines = doc.splitTextToSize(itemsTxt, maxW);
        for (const ln of itemsLines){
          if (y > 190){ doc.addPage(); y = top; }
          doc.text(ln, left+6, y); y += 5;
        }
        y += 1;
        doc.setFontSize(9);
      }
    }

    // total geral
    if (y>190){ doc.addPage(); y=top; }
    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text(`TOTAL: R$ ${moneyBR(totalGeral)}`, left, y+6);

    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally {
    setBtnLoading(btn, false, "Gerar PDF");
  }
}