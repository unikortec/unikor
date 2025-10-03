export async function exportarPDF(rows){
  const btn = $("btnPDF");
  if (!rows.length){ alert("Nada para gerar."); return; }
  setLoading(btn, true, "Gerar PDF");
  try{
    const { jsPDF } = window.jspdf;
    // A4 paisagem
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    /* ===== layout base ===== */
    const L = 10;           // margem esquerda
    const R = 287;          // margem direita (A4 landscape)
    const W = R - L;        // largura útil
    let y = 16;

    // tons de cinza — cliente um pouco mais forte que itens
    const G_CLIENT  = 224;
    const G_ITEM    = 236;
    const G_SUMMARY = 244;
    const G_ZEBRA   = 246;

    const fill = g => doc.setFillColor(g,g,g);
    const hline = yy => { doc.setLineWidth(.2); doc.line(L, yy, R, yy); };

    const money = n => `R$ ${moneyBR(n)}`;
    const headCell = (t,x,w,yy)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.text(String(t).toUpperCase(), x+2, yy+6); };
    const cellText = (t,x,w,yy)=>{ doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.text(String(t), x+2, yy+6); };
    const ensure = h => { if (y + h > 200){ doc.addPage(); y = 16; } };

    /* ===== totais gerais ===== */
    const totPedidos = rows.length;
    const totItens   = rows.reduce((s,r)=> s + (Array.isArray(r.itens)? r.itens.length : 0), 0);
    const totFrete   = rows.reduce((s,r)=> s + (r?.frete?.isento ? 0 : Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? 0)), 0);
    const vendaItens = rows.reduce((s,r)=> s + Number(r.totalPedido||0), 0);

    /* ===== título ===== */
    doc.setFont("helvetica","bold"); doc.setFontSize(18);
    doc.text("Relatórios — Serra Nobre", L, y); y += 7;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, L, y); y += 8;

    // Resumo vertical
    doc.setFontSize(11);
    const resumo = [
      ["QTD. PEDIDOS:", totPedidos],
      ["QTD. ITENS:",   totItens],
      ["TOTAL FRETE:",  money(totFrete)],
      ["VENDA (ITENS):", money(vendaItens)]
    ];
    const labelW = 46;
    resumo.forEach(([k,v])=>{
      doc.setFont("helvetica","bold");   doc.text(k, L, y);
      doc.setFont("helvetica","normal"); doc.text(String(v), L+labelW, y);
      y += 6;
    });
    y += 2; hline(y); y += 3;

    /* ===== cabeçalho do bloco Cliente (cinza mais forte, de margem a margem) ===== */
    const cols = [
      { key:"cliente",  label:"NOME CLIENTE", w: 95 },
      { key:"endereco", label:"ENDEREÇO",     w: 110 },
      { key:"qtd",      label:"QDE ITENS",    w: 22 },
      { key:"tipo",     label:"TIPO",         w: 26 },
      { key:"pag",      label:"PAGAMENTO",    w: 28 },
      { key:"cupom",    label:"CUPOM",        w: 26 },
      { key:"user",     label:"USUÁRIO",      w: 26 },
    ];
    const X = cols.reduce((acc,c,i)=>{ acc[i] = i? acc[i-1] + cols[i-1].w : L; return acc; }, []);
    const headerCliente = (yy)=>{
      fill(G_CLIENT); doc.rect(L, yy, W, 9, "F");
      cols.forEach((c,i)=> headCell(c.label, X[i], c.w, yy));
      hline(yy+9);
      return yy+12;
    };

    /* ===== cabeçalho dos Itens (cinza mais claro, de margem a margem) ===== */
    const itemCols = [
      { label:"PRODUTO", w: 132 },
      { label:"QDE",     w: 26  },
      { label:"VALOR",   w: 28  },
      { label:"FRETE",   w: 28  },
      { label:"TOTAL",   w: 28  },
    ];
    const IX = itemCols.reduce((acc,c,i)=>{ acc[i] = i? acc[i-1] + itemCols[i-1].w : L; return acc; }, []);
    const headerItens = (yy)=>{
      fill(G_ITEM); doc.rect(L, yy, W, 9, "F");
      itemCols.forEach((c,i)=> headCell(c.label, IX[i], c.w, yy)); // <-- Corrigido: só 1 linha por rótulo
      hline(yy+9);
      return yy+12;
    };

    /* ===== loop de pedidos ===== */
    rows.forEach(r=>{
      const itens = Array.isArray(r.itens)? r.itens : [];
      const frete = r?.frete?.isento ? 0 : Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? 0);
      const user  = String(r.createdBy || r.updatedBy || "").split("@")[0].toUpperCase();
      const tipo  = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
      const ender = (r?.entrega?.endereco || r.endereco || "-").toString().toUpperCase();

      ensure(22);
      y = headerCliente(y);

      // linha única do cliente
      doc.setFont("helvetica","bold"); doc.setFontSize(11);
      cellText((r.cliente||"").toString().toUpperCase(), X[0], cols[0].w, y-12);
      doc.setFont("helvetica","normal"); doc.setFontSize(10);
      cellText(ender, X[1], cols[1].w, y-12);
      cellText(String(itens.length), X[2], cols[2].w, y-12);
      cellText(tipo, X[3], cols[3].w, y-12);
      cellText((r.pagamento||"-").toString().toUpperCase(), X[4], cols[4].w, y-12);
      cellText((r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-", X[5], cols[5].w, y-12);
      cellText(user || "-", X[6], cols[6].w, y-12);

      ensure(12);
      y = headerItens(y);

      // itens (zebra leve)
      let zebra = false;
      itens.forEach(it=>{
        ensure(8);
        zebra = !zebra;
        if (zebra){ fill(G_ZEBRA); doc.rect(L, y-1, W, 7.5, "F"); }

        const qtd = Number(it.quantidade ?? it.qtd ?? 0);
        const un  = (it.tipo ?? it.un ?? "UN").toString().toUpperCase();
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        const tot = Number((qtd*pu).toFixed(2));

        cellText((it.produto||it.descricao||"").toString().toUpperCase(), IX[0], itemCols[0].w, y-2);
        cellText(`${qtd} ${un}`, IX[1], itemCols[1].w, y-2);
        cellText(money(pu), IX[2], itemCols[2].w, y-2);
        cellText("-",        IX[3], itemCols[3].w, y-2); // frete é por pedido
        cellText(money(tot), IX[4], itemCols[4].w, y-2);

        y += 7.5;
      });

      // resumo do pedido (faixa cinza de margem a margem)
      ensure(12);
      fill(G_SUMMARY); doc.rect(L, y, W, 9, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(10);
      const subtotal = Number(r.totalPedido||0);
      const totalPed = subtotal + frete;
      doc.text(
        `FRETE: ${money(frete)}   •   SUBTOTAL ITENS: ${money(subtotal)}   •   TOTAL PEDIDO: ${money(totalPed)}`,
        L+2, y+6
      );
      y += 12;

      hline(y); y += 4;
    });

    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally {
    setLoading(btn, false, "Gerar PDF");
  }
}