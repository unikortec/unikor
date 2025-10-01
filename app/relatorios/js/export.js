// /relatorios/js/export.js
import { $, moneyBR, toBR } from './render.js';

/* =================== Utilitários UI =================== */
function setLoading(btn, isLoading, labelWhenIdle){
  if (!btn) return;
  const lbl = btn.querySelector(".lbl");
  if (isLoading){
    btn.setAttribute("disabled","true");
    if (lbl && labelWhenIdle) lbl.textContent = labelWhenIdle;
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

/* =================== Loader XLSX (SheetJS) =================== */
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

/* =================== Helpers de agregação =================== */
function getFreteDePedido(r){
  const f = r?.frete || {};
  const cobrado = Number(f.valorCobrado ?? f.valorBase ?? 0) || 0;
  return cobrado;
}
function getItensArray(r){
  return Array.isArray(r.itens) ? r.itens : [];
}
function sum(a,b){ return Number(a||0) + Number(b||0); }

/* =================== XLSX =================== */
export async function exportarXLSX(rows){
  const btn = $("btnXLSX");
  if (!rows?.length){ alert("Nada para exportar."); return; }
  setLoading(btn, true, "Exportar XLSX");
  try{
    const XLSX = await ensureXLSX();

    // Sheet 1 — Pedidos
    const pedidos = rows.map(r=>{
      const itens = getItensArray(r);
      const qtdItens = itens.length;
      const tipo = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
      const frete = getFreteDePedido(r);
      return {
        "Data": toBR(r.dataEntregaISO||""),
        "Hora": r.horaEntrega||"",
        "Cliente": r.cliente||"",
        "Endereço": (r?.entrega?.endereco||""),
        "CEP": (r?.clienteFiscal?.cep || r?.cep || ""),
        "Telefone": (r?.clienteFiscal?.contato || r?.telefone || ""),
        "Qtd Itens": qtdItens,
        "Tipo": tipo,
        "Pagamento": r.pagamento||"",
        "Frete (R$)": Number(frete || 0),
        "Cupom": (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-",
        "Total (R$)": Number(r.totalPedido||0),
        "ID": r.id
      };
    });

    // Sheet 2 — Itens detalhados
    const itensRows = [];
    rows.forEach(r=>{
      const itens = getItensArray(r);
      itens.forEach(it=>{
        const qtd = Number(it.qtd ?? it.quantidade ?? 0);
        const un  = (it.un ?? it.tipo ?? "UN");
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        const sub = Number((qtd * pu).toFixed(2));
        itensRows.push({
          "Pedido ID": r.id,
          "Cliente": r.cliente || "",
          "Data": toBR(r.dataEntregaISO||""),
          "Produto": (it.produto || it.descricao || ""),
          "QDE": qtd,
          "UN": un,
          "Preço Unit. (R$)": pu,
          "Subtotal (R$)": sub
        });
      });
    });

    const wb = XLSX.utils.book_new();
    const wsPedidos = XLSX.utils.json_to_sheet(pedidos);
    const wsItens   = XLSX.utils.json_to_sheet(itensRows);

    XLSX.utils.book_append_sheet(wb, wsPedidos, "Pedidos");
    XLSX.utils.book_append_sheet(wb, wsItens,   "Itens");

    await nextFrame();
    const nome = `Relatorios_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, nome);
  } catch (e){
    console.error(e);
    alert("Não consegui carregar o gerador XLSX (conexão). Tente novamente.");
  } finally {
    setLoading(btn, false, "Exportar XLSX");
  }
}

/* =================== PDF =================== */
export async function exportarPDF(rows){
  const btn = $("btnPDF");
  if (!rows?.length){ alert("Nada para gerar."); return; }
  setLoading(btn, true, "Gerar PDF");
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    // Margens e espaçamentos
    const left=12, top=14, lineH=6;
    let y = top;

    // ===== Cabeçalho =====
    doc.setFont("helvetica","bold"); doc.setFontSize(16);
    doc.text("Relatórios — Serra Nobre", left, y);
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, left, y+6);

    // Agregações do período
    const totais = rows.reduce((acc, r)=>{
      const itens = getItensArray(r);
      const qtdItens = itens.length;
      const frete = getFreteDePedido(r);
      const totalPedido = Number(r.totalPedido||0);

      // soma subtotais (sem frete) para relatório
      const somaItens = itens.reduce((s, it)=>{
        const qtd = Number(it.qtd ?? it.quantidade ?? 0);
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        return s + (qtd * pu || 0);
      }, 0);

      acc.qtdPedidos += 1;
      acc.qtdItens   += qtdItens;
      acc.totalFrete  = sum(acc.totalFrete, frete);
      acc.totalItens  = sum(acc.totalItens, somaItens);
      acc.totalPedidos= sum(acc.totalPedidos, totalPedido);
      return acc;
    }, { qtdPedidos:0, qtdItens:0, totalFrete:0, totalItens:0, totalPedidos:0 });

    y += 14;

    // ===== Resumo em linha (horizontal) =====
    doc.setFont("helvetica","bold");
    const labels = [
      `QTD. PEDIDOS: ${totais.qtdPedidos}`,
      `QTD. ITENS: ${totais.qtdItens}`,
      `TOTAL FRETE: R$ ${moneyBR(totais.totalFrete)}`,
      `VENDA (ITENS): R$ ${moneyBR(totais.totalItens)}`
    ];
    const gap = 8;
    let x = left;
    labels.forEach((t, i)=>{
      doc.text(t, x, y);
      x += doc.getTextWidth(t) + gap + 8; // gap extra entre blocos
    });
    y += 6;
    doc.setLineWidth(.2); doc.line(left, y, 285, y); y += 5;

    // ===== Tabela de clientes (linha por pedido) =====
    doc.setFont("helvetica","bold"); doc.setFontSize(10);
    const headers = ["NOME CLIENTE","ENDEREÇO","QDE ITENS","TIPO","PAGAMENTO","FRETE","CUPOM"];
    // larguras calibradas (paisagem A4)
    const colsW   = [62, 88, 24, 22, 32, 24, 32];
    x = left;
    headers.forEach((h,i)=>{ doc.text(h, x, y); x += colsW[i]; });
    y += 2.5; doc.setLineWidth(.2); doc.line(left, y, left+colsW.reduce(sum,0), y); y += 5;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);

    const safeBottom = 190;
    for (const r of rows){
      const itens = getItensArray(r);
      const qtdItens = itens.length;
      const tipo = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
      const pagamento = r.pagamento || "";
      const frete = getFreteDePedido(r);
      const cupom = (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-";

      const nome   = r.cliente || "";
      const end    = (r?.entrega?.endereco || "");
      const nomeLines = doc.splitTextToSize(nome, colsW[0]-2);
      const endLines  = doc.splitTextToSize(end,  colsW[1]-2);
      const lines = Math.max(nomeLines.length, endLines.length);
      const rowH = Math.max(lineH, lines*lineH);

      if (y + rowH + 18 > safeBottom){ doc.addPage(); y = top; } // 18 para o bloco de itens logo abaixo

      x = left;
      // Nome
      nomeLines.forEach((ln, k)=> doc.text(ln, x, y + (k+1)*lineH - 1.5));
      x += colsW[0];

      // Endereço
      endLines.forEach((ln, k)=> doc.text(ln, x, y + (k+1)*lineH - 1.5));
      x += colsW[1];

      doc.text(String(qtdItens), x, y + lineH - 1.5); x += colsW[2];
      doc.text(tipo,             x, y + lineH - 1.5); x += colsW[3];
      doc.text(pagamento || "-", x, y + lineH - 1.5); x += colsW[4];
      doc.text(`R$ ${moneyBR(frete)}`, x, y + lineH - 1.5); x += colsW[5];
      doc.text(cupom, x, y + lineH - 1.5);

      y += rowH + 3; // respiro extra entre cliente e itens

      // ===== Itens — cabeçalho
      doc.setFont("helvetica","bold");
      const ih = ["PRODUTO","QDE","VALOR","TOTAL"];
      const iw = [120, 24, 28, 28];
      x = left + 4; // indent leve sob o cliente
      ih.forEach((h,i)=>{ doc.text(h, x, y); x += iw[i]; });
      y += 2.2; doc.setLineWidth(.2); doc.line(left+4, y, left+4+iw.reduce(sum,0), y); y += 4;
      doc.setFont("helvetica","normal"); doc.setFontSize(9);

      // ===== Itens — linhas
      let somaItensPedido = 0;
      for (const it of itens){
        const qtd = Number(it.qtd ?? it.quantidade ?? 0);
        const un  = (it.un ?? it.tipo ?? "UN");
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        const sub = Number((qtd * pu).toFixed(2));
        somaItensPedido += sub;

        const prod = (it.produto || it.descricao || "");
        const prodLines = doc.splitTextToSize(prod, iw[0]-2);
        const ihRow = Math.max(lineH, prodLines.length*lineH);

        if (y + ihRow > safeBottom){ doc.addPage(); y = top; }

        x = left + 4;
        prodLines.forEach((ln, k)=> doc.text(ln, x, y + (k+1)*lineH - 1.5));
        x += iw[0];
        doc.text(`${qtd} ${un}`, x, y + lineH - 1.5); x += iw[1];
        doc.text(`R$ ${moneyBR(pu)}`, x, y + lineH - 1.5); x += iw[2];
        doc.text(`R$ ${moneyBR(sub)}`, x, y + lineH - 1.5);

        y += ihRow + 2;
      }

      // ===== Frete & Total do pedido (linha de resumo do pedido)
      const totalPedido = Number(r.totalPedido||0);
      if (y + 10 > safeBottom){ doc.addPage(); y = top; }
      doc.setFont("helvetica","bold");
      doc.text(`FRETE: R$ ${moneyBR(frete)}   |   SUBTOTAL ITENS: R$ ${moneyBR(somaItensPedido)}   |   TOTAL PEDIDO: R$ ${moneyBR(totalPedido)}`, left+4, y);
      doc.setFont("helvetica","normal");
      y += 8;

      // separador entre pedidos
      doc.setDrawColor(230); doc.line(left, y, 285, y); doc.setDrawColor(0);
      y += 6;
    }

    // ===== Rodapé com totais gerais =====
    if (y > 190){ doc.addPage(); y = top; }
    doc.setFont("helvetica","bold"); doc.setFontSize(11);
    doc.text(
      `RESUMO — ITENS: ${totais.qtdItens}  |  SOMA SUBTOTAIS: R$ ${moneyBR(totais.totalItens)}  |  TOTAL FRETE: R$ ${moneyBR(totais.totalFrete)}  |  TOTAL PEDIDOS: R$ ${moneyBR(totais.totalPedidos)}`,
      left, y
    );

    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally {
    setLoading(btn, false, "Gerar PDF");
  }
}