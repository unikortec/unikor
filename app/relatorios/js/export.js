// relatorios/js/export.js
import { $, moneyBR } from './render.js';

/* ===== util ===== */
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

/* ===== loader resiliente do SheetJS (XLSX) ===== */
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
    }catch{ /* tenta próxima CDN */ }
  }
  throw new Error("Falha ao carregar o gerador XLSX (conexão).");
}

/* ===== helpers de domínio ===== */
function freteFromRow(r){
  const f = r?.frete || {};
  const isento = !!f.isento;
  const v = Number(f.valorCobravel ?? f.valorBase ?? r?.freteValor ?? 0);
  return isento ? 0 : v;
}
const money = n => `R$ ${moneyBR(n)}`;

/* =================================================================== */
/* ==========================  EXPORTAR XLSX  ========================= */
/* =================================================================== */
export async function exportarXLSX(rows){
  const btn = $("btnXLSX");
  if (!rows || !rows.length){ alert("Nada para exportar."); return; }
  setLoading(btn, true, "Exportar XLSX");
  try{
    const XLSX = await ensureXLSX();

    const data = rows.map(r=>{
      const itens = Array.isArray(r.itens) ? r.itens : [];
      const frete = freteFromRow(r);
      return {
        "Data": (r.dataEntregaISO||""),
        "Hora": (r.horaEntrega||""),
        "Cliente": (r.cliente||""),
        "Endereço": (r?.entrega?.endereco || r.endereco || ""),
        "Qtd Itens": itens.length,
        "Tipo": ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA"),
        "Pagamento": (r.pagamento||""),
        "Frete (R$)": Number(frete.toFixed(2)),
        "Cupom": (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-",
        "Usuário": String(r.createdBy || r.updatedBy || "").split("@")[0].toUpperCase(),
        "Total Itens (R$)": Number((r.totalPedido||0).toFixed(2)),
        "Total Pedido (R$)": Number(((r.totalPedido||0) + frete).toFixed(2)),
        "ID": r.id
      };
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

/* =================================================================== */
/* ===========================  EXPORTAR PDF  ========================= */
/* =================================================================== */
export async function exportarPDF(rows){
  const btn = $("btnPDF");
  if (!rows || !rows.length){ alert("Nada para gerar."); return; }
  setLoading(btn, true, "Gerar PDF");
  try{
    const { jsPDF } = window.jspdf;

    // A4 paisagem
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    // ===== layout base (margens e helpers)
    const L = 10;                 // margem esquerda
    const R = 287;                // margem direita
    const W = R - L;              // largura útil
    let y = 16;

    // tons
    const G_CLIENT  = 224;        // cinza mais forte (cliente)
    const G_ITEM    = 236;        // cinza mais claro (itens)
    const G_SUMMARY = 244;        // cinza do resumo
    const G_ZEBRA   = 246;        // zebra leve

    const fill = g => doc.setFillColor(g,g,g);
    const hline = yy => { doc.setLineWidth(.2); doc.line(L, yy, R, yy); };

    const cellText = (t,x,w,yy)=>{ doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.text(String(t), x+2, yy+6); };
    const headCell = (t,x,w,yy)=>{ doc.setFont("helvetica","bold");   doc.setFontSize(9);  doc.text(String(t).toUpperCase(), x+2, yy+6); };

    // ===== totais gerais
    const totPedidos = rows.length;
    const totItens   = rows.reduce((s,r)=> s + (Array.isArray(r.itens)? r.itens.length : 0), 0);
    const totFrete   = rows.reduce((s,r)=> s + freteFromRow(r), 0);
    const vendaItens = rows.reduce((s,r)=> s + Number(r.totalPedido||0), 0);

    // ===== título
    doc.setFont("helvetica","bold"); doc.setFontSize(18);
    doc.text("Relatórios — Serra Nobre", L, y); y += 7;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, L, y); y += 8;

    // ===== resumo vertical (à esquerda)
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
    y += 2;
    hline(y); y += 3;

    // ===== colunas do cabeçalho do cliente
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
      fill(G_CLIENT); doc.rect(L, yy, W, 9, "F");      // fundo de margem a margem
      cols.forEach((c,i)=> headCell(c.label, X[i], c.w, yy));
      hline(yy+9);
      return yy+12;
    };

    // ===== colunas do cabeçalho de itens
    const icol = [
      { label:"PRODUTO", w: 132 },
      { label:"QDE",     w: 26  },
      { label:"VALOR",   w: 28  },
      { label:"FRETE",   w: 28  },
      { label:"TOTAL",   w: 28  },
    ];
    const IX = icol.reduce((acc,c,i)=>{ acc[i] = i? acc[i-1] + icol[i-1].w : L; return acc; }, []);
    const headerItens = (yy)=>{
      fill(G_ITEM); doc.rect(L, yy, W, 9, "F");
      icol.forEach((c,i)=> headCell(c.label, IX[i], c.w, yy));
      hline(yy+9);
      return yy+12;
    };

    const ensure = (h)=>{ if (y + h > 200){ doc.addPage(); y = 16; } };

    // ===== loop dos pedidos
    rows.forEach(r=>{
      const itens = Array.isArray(r.itens)? r.itens : [];
      const frete = freteFromRow(r);
      const user  = String(r.createdBy || r.updatedBy || "").split("@")[0].toUpperCase();
      const tipo  = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
      const ender = (r?.entrega?.endereco || r.endereco || "-").toString().toUpperCase();

      ensure(22);
      y = headerCliente(y);

      // linha com dados do cliente
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

      // itens (zebra)
      let zebra = false;
      itens.forEach(it=>{
        ensure(8);
        zebra = !zebra;
        if (zebra){ fill(G_ZEBRA); doc.rect(L, y-1, W, 7.5, "F"); }

        const qtd = Number(it.quantidade ?? it.qtd ?? 0);
        const un  = (it.tipo ?? it.un ?? "UN").toString().toUpperCase();
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        const tot = Number((qtd*pu).toFixed(2));

        cellText((it.produto||it.descricao||"").toString().toUpperCase(), IX[0], icol[0].w, y-2);
        cellText(`${qtd} ${un}`, IX[1], icol[1].w, y-2);
        cellText(money(pu), IX[2], icol[2].w, y-2);
        cellText("-",       IX[3], icol[3].w, y-2);         // frete é por pedido
        cellText(money(tot),IX[4], icol[4].w, y-2);

        y += 7.5;
      });

      // resumo do pedido
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

    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally {
    setLoading(btn, false, "Gerar PDF");
  }
}