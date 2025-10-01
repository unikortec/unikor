// relatorios/js/export.js
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
    }catch{}
  }
  throw new Error("Falha ao carregar o gerador XLSX (conexão).");
}

function freteFrom(r){
  if (typeof r?.freteValor === 'number') return r.freteValor;
  if (r?.frete?.isento) return 0;
  return Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? 0) || 0;
}

/* ================= XLSX ================= */
export async function exportarXLSX(rows){
  const btn = $("btnXLSX");
  if (!rows.length){ alert("Nada para exportar."); return; }
  setLoading(btn, true, "Exportar XLSX");
  try{
    const XLSX = await ensureXLSX();
    const modo = $("fModo").value || "reduzido";
    const data = rows.map(r=>{
      const itens = Array.isArray(r.itens)? r.itens : [];
      const frete = freteFrom(r);
      const base = {
        "Data": toBR(r.dataEntregaISO||""),
        "Hora": r.horaEntrega||"",
        "Cliente": r.cliente||"",
        "Endereço": r.endereco || "",
        "CEP": r.cep || "",
        "Contato": r.contato || "",
        "Itens": itens.length,
        "Tipo": (r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA",
        "Pagamento": r.pagamento||"",
        "Frete (R$)": Number(frete||0),
        "Cupom": (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-",
        "Total Itens (R$)": Number(r.totalPedido||0),
        "Total Pedido (R$)": Number((Number(r.totalPedido||0) + Number(frete||0)).toFixed(2)),
        "ID": r.id
      };
      if (modo==="detalhado"){
        const linhas = itens.map(i => ({
          "PRODUTO": i.produto||i.descricao||"",
          "QDE": Number(i.quantidade||i.qtd||0),
          "UN": i.tipo||i.un||"UN",
          "VALOR": Number(i.precoUnit||i.preco||0),
          "TOTAL": Number(i.subtotal || (Number(i.quantidade||i.qtd||0)*Number(i.precoUnit||i.preco||0)))
        }));
        // SheetJS não suporta múltiplas linhas por registro facilmente; então
        // adicionamos coluna texto com resumo.
        base["Itens (detalhe)"] = linhas.map(l => `${l.PRODUTO} | ${l.QDE} ${l.UN} | ${moneyBR(l.VALOR)} | ${moneyBR(l.TOTAL)}`).join("  ||  ");
      }
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");

    await nextFrame();
    const nome = `Relatorio_${new Date().toISOString().slice(0,10)}.xlsx`;
    try{
      // versões novas
      if (XLSX.writeFileXLSX) XLSX.writeFileXLSX(wb, nome);
      else XLSX.writeFile(wb, nome);
    }catch{
      // fallback manual
      const bin = XLSX.write(wb, { type:"array", bookType:"xlsx" });
      const blob = new Blob([bin], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = nome; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
    }
  } catch (e){
    console.error(e);
    alert("Não consegui carregar o gerador XLSX (conexão). Tente novamente.");
  } finally {
    setLoading(btn, false, "Exportar XLSX");
  }
}

/* ================= PDF ================= */
export async function exportarPDF(rows){
  const btn = $("btnPDF");
  if (!rows.length){ alert("Nada para gerar."); return; }
  setLoading(btn, true, "Gerar PDF");
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    const left=12, top=14;
    const lineH=7.5; // mais alto
    let y = top;

    // Título
    doc.setFont("helvetica","bold"); doc.setFontSize(16);
    doc.text("Relatórios — Serra Nobre", left, y); y += 8.5;
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, left, y); y += 7.5;

    // Cabeçalho principal (cliente)
    doc.setFont("helvetica","bold");
    const headers = ["NOME CLIENTE","ENDEREÇO","QDE ITENS","TIPO","PAGAMENTO","FRETE (R$)","CUPOM"];
    const colsW   = [56, 86, 22, 22, 36, 26, 52];
    let x = left;
    headers.forEach((h,i)=>{ doc.text(h, x, y); x += colsW[i]; });
    y += 3.2;
    doc.setLineWidth(.2); doc.line(left, y, left+colsW.reduce((a,b)=>a+b,0), y); y += 5.2;
    doc.setFont("helvetica","normal");

    const pageBottom = 200;

    // acumuladores p/ rodapé
    let totalPedidos = rows.length;
    let totalItens = 0;
    let totalFrete = 0;
    let totalGeral = 0;

    for (const r of rows){
      const itens = Array.isArray(r.itens) ? r.itens : [];
      const frete = freteFrom(r);
      const tipo  = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA")?"RETIRADA":"ENTREGA";
      const endereco = [r.endereco, r.cep, r.contato].filter(Boolean).join(" • ");

      // linha do cliente
      x = left;
      const clienteLines  = doc.splitTextToSize(r.cliente||"", colsW[0]-2);
      const enderecoLines = doc.splitTextToSize(endereco||"", colsW[1]-2);
      const lines = Math.max(1, clienteLines.length, enderecoLines.length);
      const rowH = Math.max(lineH + 2, lines*lineH + 1.5);

      if (y + rowH + 18 > pageBottom){ doc.addPage(); y = top; } // +18 pelo bloco de itens

      // células cliente
      const cells = [
        clienteLines, enderecoLines,
        String(itens.length), tipo, (r.pagamento||""), moneyBR(frete), (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-"
      ];
      x = left;
      for (let i=0;i<cells.length;i++){
        const val = cells[i];
        if (Array.isArray(val)){
          val.forEach((ln,k)=> doc.text(ln, x, y + (k+1)*lineH - 1.2));
        } else {
          doc.text(String(val), x, y + lineH - 1.2);
        }
        x += colsW[i];
      }
      y += rowH + 2; // respiro após linha de cliente

      // detalhamento dos itens (tabela)
      doc.setFont("helvetica","bold");
      doc.text("PRODUTO", left, y);
      doc.text("QDE", left+120, y);
      doc.text("VALOR", left+140, y);
      doc.text("TOTAL", left+165, y);
      y += 3;
      doc.setLineWidth(.2); doc.line(left, y, left+178, y); y += 5;
      doc.setFont("helvetica","normal");

      for (const it of itens){
        const prod = (it.produto||it.descricao||"");
        const un   = (it.tipo||it.un||"UN").toUpperCase();
        const qde  = Number(it.quantidade||it.qtd||0);
        const pu   = Number(it.precoUnit||it.preco||0);
        const sub  = Number(it.subtotal || (qde * pu));

        const prodLines = doc.splitTextToSize(prod, 110);
        const h = Math.max(lineH, prodLines.length*lineH);
        if (y + h > pageBottom){ doc.addPage(); y = top; }

        prodLines.forEach((ln,k)=> doc.text(ln, left, y + (k+1)*lineH - 1.2));
        doc.text(`${qde} ${un}`, left+120, y + lineH - 1.2);
        doc.text(moneyBR(pu), left+140, y + lineH - 1.2);
        doc.text(moneyBR(sub), left+165, y + lineH - 1.2);

        y += h + 2;
        totalItens += 1; // conta linhas de itens
      }

      // linha do frete no detalhamento
      if (y + lineH > pageBottom){ doc.addPage(); y = top; }
      doc.setFont("helvetica","bold");
      doc.text("FRETE", left, y);
      doc.setFont("helvetica","normal");
      doc.text(moneyBR(frete), left+165, y);
      y += lineH + 3;

      totalFrete += Number(frete||0);
      totalGeral += Number((Number(r.totalPedido||0) + Number(frete||0)) || 0);
    }

    // Rodapé com totais
    if (y + 16 > pageBottom){ doc.addPage(); y = top; }
    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text(`PEDIDOS: ${totalPedidos}`, left, y); y += 6.5;
    doc.text(`ITENS (linhas): ${totalItens}`, left, y); y += 6.5;
    doc.text(`TOTAL FRETES: R$ ${moneyBR(totalFrete)}`, left, y); y += 6.5;
    doc.text(`TOTAL GERAL: R$ ${moneyBR(totalGeral)}`, left, y);

    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally {
    setLoading(btn, false, "Gerar PDF");
  }
}