// relatorios/js/export.js
import { $, moneyBR } from './render.js';

/* UI */
function setLoading(btn, isLoading){
  if (!btn) return;
  const lbl = btn.querySelector(".lbl");
  if (isLoading){
    btn.setAttribute("disabled","true");
    const sp = document.createElement("span");
    sp.className = "spinner"; sp.dataset.spin="1";
    btn.prepend(sp);
    if (lbl) lbl.textContent = lbl.textContent || "Processando…";
  } else {
    btn.removeAttribute("disabled");
    btn.querySelector('.spinner[data-spin]')?.remove();
  }
}
const nextFrame = () => new Promise(r => setTimeout(r, 0));

/* ==== loader do SheetJS (mais robusto p/ iOS) ==== */
async function ensureXLSX(){
  if (window.XLSX) return window.XLSX;
  const sources = [
    "https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js",
    "https://cdn.sheetjs.com/xlsx-0.19.3/package/dist/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.19.3/xlsx.full.min.js"
  ];
  for (const src of sources){
    try{
      await new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = src; s.async = true; s.crossOrigin = "anonymous";
        const to = setTimeout(()=>reject(new Error('timeout')), 20000);
        s.onload = ()=>{ clearTimeout(to); resolve(); };
        s.onerror = ()=>{ clearTimeout(to); reject(new Error('load error')); };
        document.head.appendChild(s);
      });
      if (window.XLSX) return window.XLSX;
    }catch{}
  }
  throw new Error("Falha ao carregar o gerador XLSX (conexão).");
}

/* domínio */
function freteFromRow(r){
  const f = r?.frete || {};
  const isento = !!f.isento;
  const v = Number(f.valorCobravel ?? f.valorBase ?? r?.freteValor ?? 0);
  return isento ? 0 : v;
}
const money = n => `R$ ${moneyBR(n)}`;

/* ===== helpers p/ UN -> KG ===== */
function kgPorUnFromDesc(desc=""){
  const s = String(desc).toLowerCase().replace(',', '.').replace(/\s+/g,' ');
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
  let m,last=null; while((m=re.exec(s))!==null) last=m;
  if (!last) return 0;
  const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
  const val = parseFloat(raw);
  if (!isFinite(val) || val<=0) return 0;
  const unit = last[2].toLowerCase();
  return (unit.startsWith('kg') || unit.startsWith('quilo')) ? val : (val/1000);
}
function subtotalItem(it){
  const qtd = Number(it.qtd ?? it.quantidade ?? 0);
  const un  = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
  const pu  = Number(it.precoUnit ?? it.preco ?? 0);
  if (typeof it.subtotal === "number") return Number(it.subtotal||0);
  if (un === "UN"){
    const kgUn = kgPorUnFromDesc(it.descricao || it.produto || "");
    return kgUn > 0 ? (qtd * kgUn) * pu : (qtd * pu);
  }
  return qtd * pu;
}

/* ================== XLSX ================== */
export async function exportarXLSX(rows){
  const btn = $("btnXLSX");
  if (!rows || !rows.length){ alert("Nada para exportar."); return; }
  setLoading(btn, true);
  try{
    const XLSX = await ensureXLSX();
    const data = rows.map(r=>{
      const itens = Array.isArray(r.itens) ? r.itens : [];
      const frete = freteFromRow(r);
      const subtotal = itens.reduce((s,it)=> s + subtotalItem(it), 0);
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
        "Total Itens (R$)": Number(subtotal.toFixed(2)),
        "Total Pedido (R$)": Number((subtotal + frete).toFixed(2)),
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
    setLoading(btn, false);
  }
}

/* ================== PDF ================== */
export async function exportarPDF(rows){
  const btn = $("btnPDF");
  if (!rows || !rows.length){ alert("Nada para gerar."); return; }
  setLoading(btn, true);
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });

    const L = 10, R = 287, W = R - L; let y = 16;

    // tons (ajustados conforme solicitado)
    const G_DARK   = 224; // cinza escuro (títulos)
    const G_LIGHT  = 236; // cinza claro (linha com dados do cliente)
    const G_SUMMARY= 244;
    const G_ZEBRA  = 246;

    const fill = g => doc.setFillColor(g,g,g);
    const hline = yy => { doc.setLineWidth(.2); doc.line(L, yy, R, yy); };
    const drawHead = (t,x,yy)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.text(String(t).toUpperCase(), x, yy); };
    const setBody  = ()=>{ doc.setFont("helvetica","normal"); doc.setFontSize(10); };
    function drawInCell(t, x, w, yy, alignLeft=true){
      setBody();
      const pad=2, maxW=Math.max(2,w-pad*2); let txt=String(t||"");
      let lines=doc.splitTextToSize(txt,maxW); let first=(lines[0]||"");
      if (lines.length>1){ while(doc.getTextWidth(first+"…")>maxW && first.length){ first=first.slice(0,-1); } first+="…"; }
      const baseX=x+pad; if (alignLeft) doc.text(first, baseX, yy); else doc.text(first, x+w-pad, yy, {align:"right"});
    }
    const moneyCell = (n,x,w,yy,right=true)=> drawInCell(`R$ ${moneyBR(n)}`, x, w, yy, !right);

    /* totais gerais */
    const totPedidos = rows.length;
    const totItens   = rows.reduce((s,r)=> s + (Array.isArray(r.itens)? r.itens.length : 0), 0);
    const totFrete   = rows.reduce((s,r)=> s + (freteFromRow(r)), 0);
    const vendaItens = rows.reduce((s,r)=>{
      const itens = Array.isArray(r.itens)? r.itens : [];
      return s + itens.reduce((a,it)=> a + subtotalItem(it), 0);
    }, 0);

    /* título + resumo */
    doc.setFont("helvetica","bold"); doc.setFontSize(18);
    doc.text("Relatórios — Serra Nobre", L, y); y += 7;
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, L, y); y += 8;

    doc.setFontSize(11);
    const labelW = 46;
    const resumo = [
      ["QTD. PEDIDOS:", totPedidos],
      ["QTD. ITENS:",   totItens],
      ["TOTAL FRETE:",  money(totFrete)],
      ["VENDA (ITENS):", money(vendaItens)]
    ];
    resumo.forEach(([k,v])=>{
      doc.setFont("helvetica","bold");   doc.text(k, L, y);
      doc.setFont("helvetica","normal"); doc.text(String(v), L+labelW, y);
      y += 6;
    });
    y += 2; hline(y); y += 3;

    /* colunas */
    const C = [
      { t:"NOME CLIENTE", w: 80 },
      { t:"ENDEREÇO",     w: 92 },
      { t:"QDE ITENS",    w: 20 },
      { t:"TIPO",         w: 24 },
      { t:"PAGAMENTO",    w: 28 },
      { t:"CUPOM",        w: 20 },
      { t:"USUÁRIO",      w: 13 },
    ];
    const CX = C.reduce((acc,c,i)=>{ acc[i]=i?acc[i-1]+C[i-1].w:L; return acc; },[]);

    const I = [
      { t:"PRODUTO", w: 150 },
      { t:"QDE",     w: 26  },
      { t:"VALOR",   w: 26  },
      { t:"FRETE",   w: 25  },
      { t:"TOTAL",   w: 50  },
    ];
    const IX = I.reduce((acc,c,i)=>{ acc[i]=i?acc[i-1]+I[i-1].w:L; return acc; },[]);
    const ensure = h => { if (y+h>200){ doc.addPage(); y=16; } };

    rows.forEach(r=>{
      const itens = Array.isArray(r.itens)? r.itens : [];
      const frete = freteFromRow(r);
      const user  = String(r.createdBy || r.updatedBy || "").split("@")[0].toUpperCase();
      const tipo  = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
      const ender = (r?.entrega?.endereco || r.endereco || "-").toString().toUpperCase();

      ensure(22);

      /* linha 1 — TÍTULOS (cinza escuro) */
      fill(G_DARK); doc.rect(L, y, W, 9, "F");
      C.forEach((c,i)=> drawHead(c.t, CX[i]+2, y+6));
      y += 12;

      /* linha 2 — DADOS DO CLIENTE (cinza claro) */
      fill(G_LIGHT); doc.rect(L, y-9, W, 9, "F"); // fundo da linha de dados
      setBody();
      drawInCell(String(r.cliente||"").toUpperCase(), CX[0], C[0].w, y-3);
      drawInCell(ender,                                   CX[1], C[1].w, y-3);
      drawInCell(String(itens.length),                    CX[2], C[2].w, y-3);
      drawInCell(tipo,                                    CX[3], C[3].w, y-3);
      drawInCell(String(r.pagamento||"-").toUpperCase(),  CX[4], C[4].w, y-3);
      drawInCell((r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-", CX[5], C[5].w, y-3);
      drawInCell(user || "-",                             CX[6], C[6].w, y-3);

      ensure(12);

      /* cabeçalho dos ITENS (cinza escuro) */
      fill(G_DARK); doc.rect(L, y, W, 9, "F");
      I.forEach((c,i)=> drawHead(c.t, IX[i]+2, y+6));
      y += 12;

      /* itens */
      let zebra=false, subtotal=0;
      itens.forEach(it=>{
        ensure(8);
        zebra=!zebra; if (zebra){ fill(G_ZEBRA); doc.rect(L, y-1, W, 7.5, "F"); }

        const qtd = Number(it.quantidade ?? it.qtd ?? 0);
        const un  = (it.tipo ?? it.un ?? "UN").toString().toUpperCase();
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        const tot = Number((typeof it.subtotal==="number" ? it.subtotal : subtotalItem(it)).toFixed(2));
        subtotal += tot;

        drawInCell((it.produto||it.descricao||"").toString().toUpperCase(), IX[0], I[0].w, y+4);
        drawInCell(`${qtd} ${un}`,                                             IX[1], I[1].w, y+4);
        moneyCell(pu,                                                          IX[2], I[2].w, y+4, true);
        drawInCell("-",                                                        IX[3], I[3].w, y+4);
        moneyCell(tot,                                                         IX[4], I[4].w, y+4, true);

        y += 7.5;
      });

      /* resumo */
      ensure(12);
      fill(G_SUMMARY); doc.rect(L, y, W, 9, "F");
      const totalPed = subtotal + frete;
      const resumoTxt = `FRETE: ${money(frete)}   •   SUBTOTAL ITENS: ${money(subtotal)}   •   TOTAL PEDIDO: ${money(totalPed)}`;
      drawInCell(resumoTxt, L+1, W-2, y+6);
      y += 12;

      hline(y); y += 4;
    });

    await nextFrame();
    doc.save(`Relatorio_${new Date().toISOString().slice(0,10)}.pdf`);
  } finally {
    setLoading(btn, false);
  }
}