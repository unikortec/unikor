// js/export.js
import { $, moneyBR, toBR } from './render.js';

function setLoading(btn, isLoading, labelWhenIdle){
  if (!btn) return;
  const lbl = btn.querySelector(".lbl");
  if (isLoading){
    btn.setAttribute("disabled","true");
    if (lbl) lbl.textContent = labelWhenIdle || lbl.textContent || "Processando…";
    const sp = document.createElement("span");
    sp.className = "spinner"; sp.setAttribute("data-spin","1");
    btn.prepend(sp);
  } else {
    btn.removeAttribute("disabled");
    const sp = btn.querySelector(".spinner[data-spin]");
    if (sp) sp.remove();
  }
}
const nextFrame = () => new Promise(r => setTimeout(r, 0));

/** Carrega SheetJS tentando 3 CDNs, com timeout e feedback. */
async function ensureXLSX(){
  if (window.XLSX) return window.XLSX;
  const sources = [
    "https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.19.3/xlsx.full.min.js"
  ];
  for (const src of sources){
    try{
      await new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = src; s.async = true;
        const to = setTimeout(()=>reject(new Error('timeout')), 12000);
        s.onload = ()=>{ clearTimeout(to); resolve(); };
        s.onerror = ()=>{ clearTimeout(to); reject(new Error('load error')); };
        document.head.appendChild(s);
      });
      if (window.XLSX) return window.XLSX;
    }catch{ /* tenta o próximo */ }
  }
  throw new Error("Falha ao carregar o gerador XLSX (conexão).");
}

export async function exportarXLSX(rows){
  const btn = $("btnXLSX");
  if (!rows.length){ alert("Nada para exportar."); return; }
  setLoading(btn, true, "Exportar XLSX");
  try{
    const XLSX = await ensureXLSX();
    const modo = $("fModo").value || "reduzido";
    const data = rows.map(r=>{
      const base = {
        "Data": toBR(r.dataEntregaISO||""),
        "Hora": r.horaEntrega||"",
        "Cliente": r.cliente||"",
        "Itens": Array.isArray(r.itens)? r.itens.length : 0,
        "Total (R$)": Number(r.totalPedido||0),
        "Tipo": (r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA",
        "Pagamento": r.pagamento||"",
        "Cupom": (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-",
        "ID": r.id
      };
      if (modo==="detalhado"){
        const itensTxt = (Array.isArray(r.itens)? r.itens : [])
          .map(i => `${i.produto||i.descricao||""} • ${i.quantidade||i.qtd||0} ${i.tipo||i.un||"un"} x ${moneyBR(i.precoUnit||i.preco||0)}`)
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
  } catch (e){
    console.error(e);
    alert("Não consegui carregar o gerador XLSX (conexão). Tente novamente.");
  } finally {
    setLoading(btn, false, "Exportar XLSX");
  }
}

export async function exportarPDF(rows){
  const btn = $("btnPDF");
  if (!rows.length){ alert("Nada para gerar."); return; }
  setLoading(btn, true, "Gerar PDF");
  try{
    const { jsPDF } = window.jspdf;
    // A4 paisagem, margens e alturas ajustadas p/ evitar sobreposição
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    const left=12, top=14, lineH=6, maxW = 270;
    let y = top;

    doc.setFont("helvetica","bold"); doc.setFontSize(16);
    doc.text("Relatórios — Serra Nobre", left, y); y += 7;
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, left, y); y += 6;

    // Colunas com mais espaço para "Cliente"
    doc.setFont("helvetica","bold");
    const headers = ["Data","Hora","Cliente","Itens","Total (R$)","Tipo","Pagamento","Cupom"];
    const colsW   = [22,18,92,14,26,26,36,50];
    let x = left;
    headers.forEach((h,i)=>{ doc.text(h, x, y); x += colsW[i]; });
    y += 2.5;
    doc.setLineWidth(.2); doc.line(left, y, left+colsW.reduce((a,b)=>a+b,0), y); y += 4;
    doc.setFont("helvetica","normal");

    for (const r of rows){
      x = left;
      const row = [
        (r.dataEntregaISO? r.dataEntregaISO.split("-").reverse().join("/") : ""),
        r.horaEntrega||"",
        r.cliente||"",
        (Array.isArray(r.itens)? r.itens.length : 0).toString(),
        moneyBR(r.totalPedido||0),
        ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA"?"RETIRADA":"ENTREGA"),
        r.pagamento||"",
        (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-"
      ];

      // Quebras de linha controladas nas colunas "Cliente" e "Cupom"
      const clienteLines = doc.splitTextToSize(row[2], colsW[2]-2);
      const cupomLines   = doc.splitTextToSize(row[7], colsW[7]-2);
      const lines = Math.max(1, clienteLines.length, cupomLines.length);
      const h = Math.max(lineH, lines*lineH + 1); // +1 de respiro

      if (y + h > 192){ doc.addPage(); y = top; }

      const cells = [row[0], row[1], clienteLines, row[3], row[4], row[5], row[6], cupomLines];
      for (let i=0;i<cells.length;i++){
        const val = cells[i];
        if (Array.isArray(val)){
          val.forEach((ln,k)=> doc.text(ln, x, y + (k+1)*lineH - 1.5));
        } else {
          doc.text(String(val), x, y + lineH - 1.5);
        }
        x += colsW[i];
      }
      y += h;

      // Modo detalhado: lista os itens com espaçamento maior
      const modo = (document.getElementById("fModo")?.value || "reduzido");
      if (modo === "detalhado" && Array.isArray(r.itens) && r.itens.length){
        const itemsTxt = r.itens.map(it=>{
          const qtd = Number(it.quantidade ?? it.qtd ?? 0);
          const un  = (it.tipo ?? it.un ?? "un");
          const pu  = Number(it.precoUnit ?? it.preco ?? 0);
          const tot = Number((qtd*pu).toFixed(2));
          return `• ${(it.produto||it.descricao||"")} — ${qtd} ${un} x ${moneyBR(pu)} = ${moneyBR(tot)}`;
        }).join("\n");

        const itemsLines = doc.splitTextToSize(itemsTxt, maxW);
        for (const ln of itemsLines){
          if (y > 192){ doc.addPage(); y = top; }
          doc.text(ln, left+4, y); y += 4.5;
        }
        y += 2; // respiro extra
      }
    }

    const total = rows.reduce((s,r)=> s + Number(r.totalPedido||0), 0);
    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    if (y>190){ doc.addPage(); y=top; }
    doc.text(`TOTAL: R$ ${moneyBR(total)}`, left, y+6);

    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally {
    setLoading(btn, false, "Gerar PDF");
  }
}