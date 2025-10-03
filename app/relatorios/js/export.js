// relatorios/js/export.js
import { $, moneyBR } from './render.js';

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

function freteFromRow(r){
  const f = r?.frete || {};
  const isento = !!f.isento;
  const v = Number(f.valorCobravel ?? f.valorBase ?? 0);
  return isento ? 0 : v;
}

/* ========= XLSX ========= */
export async function exportarXLSX(rows){
  const btn = $("btnXLSX");
  if (!rows.length){ alert("Nada para exportar."); return; }
  setLoading(btn, true, "Exportar XLSX");
  try{
    const XLSX = await ensureXLSX();
    const modo = $("fModo").value || "reduzido";

    const data = rows.map(r=>{
      const itens = Array.isArray(r.itens)? r.itens : [];
      const base = {
        "Data": (r.dataEntregaISO||"").split("-").reverse().join("/"),
        "Hora": r.horaEntrega||"",
        "Cliente": r.cliente||"",
        "Endereço": (r?.entrega?.endereco || r.endereco || "").toString(),
        "Qtd Itens": itens.length,
        "Tipo": ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA"),
        "Pagamento": r.pagamento||"",
        "Frete (R$)": Number(freteFromRow(r).toFixed(2)),
        "Cupom": (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-",
        "Usuário": String(r.createdBy || r.updatedBy || "").split("@")[0].toUpperCase() || "",
        "Total Itens (R$)": Number((r.totalPedido||0).toFixed(2)),
        "Total Pedido (R$)": Number(((r.totalPedido||0) + freteFromRow(r)).toFixed(2)),
        "ID": r.id
      };
      if (modo==="detalhado"){
        const itensTxt = itens.map(i=>{
          const p  = i.produto || i.descricao || "";
          const q  = i.quantidade ?? i.qtd ?? 0;
          const un = i.tipo ?? i.un ?? "UN";
          const pu = i.precoUnit ?? i.preco ?? 0;
          const tot = (Number(q)||0) * (Number(pu)||0);
          return `${p} | ${q} ${un} | R$ ${moneyBR(pu)} | R$ ${moneyBR(tot)}`;
        }).join(" || ");
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
  }catch(e){
    console.error(e);
    alert("Não consegui carregar o gerador XLSX (conexão). Tente novamente.");
  }finally{
    setLoading(btn, false, "Exportar XLSX");
  }
}

/* ========= PDF A4 (paisagem) ========= */
export async function exportarPDF(rows){
  const btn = $("btnPDF");
  if (!rows.length){ alert("Nada para gerar."); return; }
  setLoading(btn, true, "Gerar PDF");
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    // Margens e helpers
    const L = 10, R = 287, W = R - L; // A4 landscape ~ 297mm - 2x margens
    let y = 16;

    const G_CLIENT  = 224; // cinza mais forte (cliente)
    const G_ITEM    = 236; // cinza cabeçalho itens
    const G_SUMMARY = 244; // cinza resumo
    const G_ZEBRA   = 246; // zebra leve

    const fill  = g => doc.setFillColor(g,g,g);
    const hline = yy => { doc.setLineWidth(.2); doc.line(L, yy, R, yy); };
    const head  = (t,x,w,yy)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(9);  doc.text(String(t).toUpperCase(), x+2, yy+6); };
    const cell  = (t,x,w,yy)=>{ doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.text(String(t), x+2, yy+6); };
    const money = n => `R$ ${moneyBR(n)}`;

    // Totais
    const totPedidos = rows.length;
    const totItens   = rows.reduce((s,r)=> s + (Array.isArray(r.itens)? r.itens.length : 0), 0);
    const totFrete   = rows.reduce((s,r)=> s + (r?.frete?.isento ? 0 : Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? 0)), 0);
    const vendaItens = rows.reduce((s,r)=> s + Number(r.totalPedido||0), 0);

    // Título + resumo vertical
    doc.setFont("helvetica","bold"); doc.setFontSize(18);
    doc.text("Relatórios — Serra Nobre", L, y); y += 7;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, L, y); y += 8;

    doc.setFontSize(11);
    const res = [
      ["QTD. PEDIDOS:", totPedidos],
      ["QTD. ITENS:",   totItens],
      ["TOTAL FRETE:",  money(totFrete)],
      ["VENDA (ITENS):", money(vendaItens)]
    ];
    const labelW = 46;
    res.forEach(([k,v])=>{
      doc.setFont("helvetica","bold");   doc.text(k, L, y);
      doc.setFont("helvetica","normal"); doc.text(String(v), L+labelW, y);
      y += 6;
    });
    y += 2; hline(y); y += 3;

    // Colunas – Cliente
    const cols = [
      { l:"NOME CLIENTE", w: 95 },
      { l:"ENDEREÇO",     w: 110 },
      { l:"QDE ITENS",    w: 22 },
      { l:"TIPO",         w: 26 },
      { l:"PAGAMENTO",    w: 28 },
      { l:"CUPOM",        w: 26 },
      { l:"USUÁRIO",      w: 26 },
    ];
    const X = cols.reduce((a,c,i)=>{ a[i] = i? a[i-1] + cols[i-1].w : L; return a; }, []);
    const headerCliente = (yy)=>{ fill(G_CLIENT); doc.rect(L, yy, W, 9, "F"); cols.forEach((c,i)=> head(c.l, X[i], c.w, yy)); hline(yy+9); return yy+12; };

    // Colunas – Itens
    const icol = [
      { l:"PRODUTO", w: 132 },
      { l:"QDE",     w: 26  },
      { l:"VALOR",   w: 28  },
      { l:"FRETE",   w: 28  },
      { l:"TOTAL",   w: 28  },
    ];
    const IX = icol.reduce((a,c,i)=>{ a[i] = i? a[i-1] + icol[i-1].w : L; return a; }, []);
    const headerItens = (yy)=>{ fill(G_ITEM); doc.rect(L, yy, W, 9, "F"); icol.forEach((c,i)=> head(c.l, IX[i], c.w, yy)); hline(yy+9); return yy+12; };

    const ensure = (h)=>{ if (y + h > 200){ doc.addPage(); y = 16; } };

    // Loop
    rows.forEach(r=>{
      const itens = Array.isArray(r.itens)? r.itens : [];
      const frete = r?.frete?.isento ? 0 : Number(r?.frete?.valorCobravel ?? r?.frete?.valorBase ?? 0);
      const user  = String(r.createdBy || r.updatedBy || "").split("@")[0].toUpperCase();
      const tipo  = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
      const ender = (r?.entrega?.endereco || r.endereco || "-").toString().toUpperCase();

      ensure(22); y = headerCliente(y);
      doc.setFont("helvetica","bold"); doc.setFontSize(11);
      cell((r.cliente||"").toString().toUpperCase(), X[0], cols[0].w, y-12);
      doc.setFont("helvetica","normal"); doc.setFontSize(10);
      cell(ender, X[1], cols[1].w, y-12);
      cell(String(itens.length), X[2], cols[2].w, y-12);
      cell(tipo, X[3], cols[3].w, y-12);
      cell((r.pagamento||"-").toString().toUpperCase(), X[4], cols[4].w, y-12);
      cell((r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-", X[5], cols[5].w, y-12);
      cell(user || "-", X[6], cols[6].w, y-12);

      ensure(12); y = headerItens(y);

      // Itens (zebra)
      let zebra = false;
      itens.forEach(it=>{
        ensure(8);
        zebra = !zebra;
        if (zebra){ fill(G_ZEBRA); doc.rect(L, y-1, W, 7.5, "F"); }

        const qtd = Number(it.quantidade ?? it.qtd ?? 0);
        const un  = (it.tipo ?? it.un ?? "UN").toString().toUpperCase();
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        const tot = Number((qtd*pu).toFixed(2));

        cell((it.produto||it.descricao||"").toString().toUpperCase(), IX[0], icol[0].w, y-2);
        cell(`${qtd} ${un}`, IX[1], icol[1].w, y-2);
        cell(money(pu), IX[2], icol[2].w, y-2);
        cell("-",        IX[3], icol[3].w, y-2); // frete é do pedido
        cell(money(tot), IX[4], icol[4].w, y-2);

        y += 7.5;
      });

      // Resumo do pedido
      ensure(12);
      fill(G_SUMMARY); doc.rect(L, y, W, 9, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(10);
      const subtotal = Number(r.totalPedido||0);
      const totalPed = subtotal + frete;
      const resumoTxt = `FRETE: ${money(frete)}   •   SUBTOTAL ITENS: ${money(subtotal)}   •   TOTAL PEDIDO: ${money(totalPed)}`;
      doc.text(resumoTxt, L+2, y+6);
      y += 12;

      hline(y); y += 4;
    });

    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  }finally{
    setLoading(btn, false, "Gerar PDF");
  }
}