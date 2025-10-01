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
    }catch{ /* tenta o próximo */ }
  }
  throw new Error("Falha ao carregar o gerador XLSX (conexão).");
}

function freteFromRow(r){
  // mesmo critério que usamos no app de Pedidos
  const f = r?.frete || {};
  const isento = !!f.isento;
  const v = Number(f.valorCobravel ?? f.valorBase ?? 0);
  return isento ? 0 : v;
}

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
        "Data": toBR(r.dataEntregaISO||""),
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
        const itensTxt = itens
          .map(i=>{
            const p = i.produto || i.descricao || "";
            const qtd = i.quantidade ?? i.qtd ?? 0;
            const un  = i.tipo ?? i.un ?? "UN";
            const pu  = i.precoUnit ?? i.preco ?? 0;
            const tot = (Number(qtd)||0) * (Number(pu)||0);
            return `${p} | ${qtd} ${un} | ${moneyBR(pu)} | ${moneyBR(tot)}`;
          })
          .join(" || ");
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
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    // ===== helpers
    const L = 12, R = 285, W = R - L; // margens
    let y = 16;
    const gray = (g)=>{ doc.setFillColor(g,g,g); };
    const line = (yy)=>{ doc.setLineWidth(.2); doc.line(L, yy, R, yy); };

    const drawHeaderCell = (txt, x, w, yy)=>{ 
      doc.setFont("helvetica","bold"); doc.setFontSize(9);
      doc.text(String(txt).toUpperCase(), x+2, yy+6);
    };
    const text = (t, x, yy)=>{ doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.text(t, x, yy); };
    const cellText = (t, x, w, yy)=>{ doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.text(String(t), x+2, yy+6); };

    // ===== totais
    const totPedidos = rows.length;
    const totItens = rows.reduce((s,r)=> s + (Array.isArray(r.itens)? r.itens.length : 0), 0);
    const totFrete = rows.reduce((s,r)=> s + freteFromRow(r), 0);
    const vendaItens = rows.reduce((s,r)=> s + Number(r.totalPedido||0), 0);

    // ===== título
    doc.setFont("helvetica","bold"); doc.setFontSize(18);
    doc.text("Relatórios — Serra Nobre", L, y); y += 7;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, L, y); y += 6;

    // ===== resumo (vertical)
    doc.setFontSize(11);
    const resumo = [
      [`QTD. PEDIDOS:`, totPedidos],
      [`QTD. ITENS:`, totItens],
      [`TOTAL FRETE:`, `R$ ${moneyBR(totFrete)}`],
      [`VENDA (ITENS):`, `R$ ${moneyBR(vendaItens)}`]
    ];
    const leftColW = 46;
    resumo.forEach(row=>{
      doc.setFont("helvetica","bold");  doc.text(row[0], L, y);
      doc.setFont("helvetica","normal");doc.text(String(row[1]), L+leftColW, y);
      y += 6;
    });
    y += 2;
    line(y); y += 3;

    // ===== cabeçalho do bloco cliente (cinza)
    const cols = [
      { k:"cliente",   label:"NOME CLIENTE", w: 80 },
      { k:"endereco",  label:"ENDEREÇO",     w: 90 },
      { k:"qtd",       label:"QDE ITENS",    w: 20, align:"center" },
      { k:"tipo",      label:"TIPO",         w: 24 },
      { k:"pag",       label:"PAGAMENTO",    w: 28 },
      { k:"cupom",     label:"CUPOM",        w: 24 },
      { k:"user",      label:"USUÁRIO",      w: 24 },
    ];
    const colsX = cols.reduce((acc,c,i)=>{
      acc[i] = (i===0? L : (acc[i-1] + cols[i-1].w));
      return acc;
    }, []);
    const fullWidth = cols.reduce((s,c)=>s+c.w,0);

    function headerCliente(yy){
      gray(238); doc.rect(L, yy, fullWidth, 9, "F");
      cols.forEach((c,i)=> drawHeaderCell(c.label, colsX[i], c.w, yy));
      line(yy+9);
      return yy+12;
    }

    // ===== cabeçalho dos itens
    const itemCols = [
      { k:"produto", label:"PRODUTO", w: 115 },
      { k:"qtd",     label:"QDE",     w: 23 },
      { k:"valor",   label:"VALOR",   w: 26 },
      { k:"frete",   label:"FRETE",   w: 26 },
      { k:"total",   label:"TOTAL",   w: 26 },
    ];
    const itemX = itemCols.reduce((acc,c,i)=>{
      acc[i] = (i===0? L : (acc[i-1] + itemCols[i-1].w));
      return acc;
    }, []);
    const itemFull = itemCols.reduce((s,c)=>s+c.w,0);

    function headerItens(yy){
      gray(238); doc.rect(L, yy, itemFull, 9, "F");
      itemCols.forEach((c,i)=> drawHeaderCell(c.label, itemX[i], c.w, yy));
      line(yy+9);
      return yy+12;
    }

    function ensure(h){ 
      if (y + h > 200){ doc.addPage(); y = 16; }
    }

    // ===== loop de pedidos
    rows.forEach((r, idx)=>{
      const itens = Array.isArray(r.itens)? r.itens : [];
      const frete = freteFromRow(r);
      const user = String(r.createdBy || r.updatedBy || "").split("@")[0].toUpperCase();

      ensure(22);
      // header cliente
      y = headerCliente(y);
      // linha única cliente
      doc.setFont("helvetica","bold"); doc.setFontSize(11);
      cellText((r.cliente||"").toString().toUpperCase(), colsX[0], cols[0].w, y-12);
      doc.setFont("helvetica","normal"); doc.setFontSize(10);
      cellText((r?.entrega?.endereco || r.endereco || "-").toString().toUpperCase(), colsX[1], cols[1].w, y-12);
      cellText(String(itens.length), colsX[2], cols[2].w, y-12);
      cellText(((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA"?"RETIRADA":"ENTREGA"), colsX[3], cols[3].w, y-12);
      cellText((r.pagamento||"-").toString().toUpperCase(), colsX[4], cols[4].w, y-12);
      cellText((r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-", colsX[5], cols[5].w, y-12);
      cellText(user || "-", colsX[6], cols[6].w, y-12);

      // cabeçalho itens
      ensure(12);
      y = headerItens(y);

      // itens (zebrado)
      let zebra = false;
      itens.forEach(it=>{
        ensure(8);
        zebra = !zebra;
        if (zebra){ gray(248); doc.rect(L, y-1, itemFull, 7.5, "F"); }

        const qtd = Number(it.quantidade ?? it.qtd ?? 0);
        const un  = (it.tipo ?? it.un ?? "UN").toString().toUpperCase();
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        const tot = Number((qtd*pu).toFixed(2));

        doc.setFont("helvetica","normal"); doc.setFontSize(10);
        cellText((it.produto||it.descricao||"").toString().toUpperCase(), itemX[0], itemCols[0].w, y-2);
        cellText(`${qtd} ${un}`, itemX[1], itemCols[1].w, y-2);
        cellText(`R$ ${moneyBR(pu)}`, itemX[2], itemCols[2].w, y-2);
        cellText(`-`, itemX[3], itemCols[3].w, y-2); // frete é por pedido, não por item
        cellText(`R$ ${moneyBR(tot)}`, itemX[4], itemCols[4].w, y-2);

        y += 7.5;
      });

      // resumo do pedido (cinza claro)
      ensure(12);
      gray(244); doc.rect(L, y, itemFull, 9, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(10);
      const subtotal = Number(r.totalPedido||0);
      const totalPed = subtotal + frete;
      const resumoTxt = `FRETE: R$ ${moneyBR(frete)}   •   SUBTOTAL ITENS: R$ ${moneyBR(subtotal)}   •   TOTAL PEDIDO: R$ ${moneyBR(totalPed)}`;
      doc.text(resumoTxt, L+2, y+6);
      y += 12;

      line(y); y += 4;
    });

    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally {
    setLoading(btn, false, "Gerar PDF");
  }
}