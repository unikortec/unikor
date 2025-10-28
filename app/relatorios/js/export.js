// relatorios/js/export.js
// Exporta LISTA => XLSX (preferencial) ou CSV (fallback).
// PDF paisagem permanece igual (jsPDF).

const { jsPDF } = window.jspdf || {};

// ===== Helpers comuns =====
const moneyBR = (n)=> (Number(n||0)).toFixed(2).replace(".", ",");
const toBRDate = (iso)=> (iso ? iso.split("-").reverse().join("/") : "");
const norm = (s="") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");

// Mesmo cálculo usado na listagem/modal
function kgPorUnFromDesc(desc=""){
  const s = String(desc).toLowerCase().replace(',', '.').replace(/\s+/g,' ');
  const re = /(\d{1,3}(?:[.\s]\d{3})*(?:\.\d+)?)\s*(kg|kgs?|quilo|quilos|g|gr|grama|gramas)\b\.?/g;
  let m,last=null; while((m=re.exec(s))!==null) last=m;
  if (!last) return 0;
  const raw = String(last[1]).replace(/\s/g,'').replace(/\.(?=\d{3}\b)/g,'');
  const val = parseFloat(raw); if (!isFinite(val)||val<=0) return 0;
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
function freteFromRow(r){
  const f = r?.frete || {};
  return Number(f.isento ? 0 : (f.valorCobravel ?? f.valorBase ?? r.freteValor ?? 0)) || 0;
}

// ===== Conversores =====
function rowsToAOA(rows=[]){
  const header = [
    "Data", "Hora", "Cliente", "Produto", "Qtd", "Un",
    "Preço Unit.", "Subtotal", "Tipo", "Pagamento", "Frete", "Nº Cupom", "PedidoID"
  ];
  const out = [header];

  rows.forEach(r=>{
    const itens = Array.isArray(r.itens)? r.itens : [];
    const tipo  = ((r?.entrega?.tipo||"").toUpperCase()==="RETIRADA" ? "RETIRADA" : "ENTREGA");
    const frete = freteFromRow(r);
    const cupom = (r.cupomFiscal && String(r.cupomFiscal).trim()) ? r.cupomFiscal : "-";

    if (!itens.length){
      out.push([
        toBRDate(r.dataEntregaISO||""), String(r.horaEntrega||""), String(r.cliente||""),
        "", 0, "", 0, 0, tipo, String(r.pagamento||""), frete, cupom, r.id
      ]);
      return;
    }
    itens.forEach(it=>{
      const qtd = Number(it.qtd ?? it.quantidade ?? 0);
      const un  = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
      const pu  = Number(it.precoUnit ?? it.preco ?? 0);
      const sub = (typeof it.subtotal === "number") ? Number(it.subtotal) : subtotalItem(it);
      out.push([
        toBRDate(r.dataEntregaISO||""),
        String(r.horaEntrega||""),
        String(r.cliente||""),
        String(it.descricao || it.produto || ""),
        qtd, un, pu, sub,
        tipo, String(r.pagamento||""), frete, cupom, r.id
      ]);
    });
  });

  return out;
}

function downloadBlob(filename, mime, data){
  const blob = new Blob([data], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 150);
}

function aoaToCSV(aoa){
  // CSV separado por ';' para abrir bonito no Excel BR
  return aoa.map(row =>
    row.map(v=>{
      if (v == null) return "";
      const s = String(v);
      const mustQuote = /[;"\n,]/.test(s);
      const esc = s.replace(/"/g,'""');
      return mustQuote ? `"${esc}"` : esc;
    }).join(";")
  ).join("\n");
}

function timestampName(prefix){
  const now = new Date();
  const dd = String(now.getDate()).padStart(2,'0');
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const aa = String(now.getFullYear()).slice(-2);
  const hh = String(now.getHours()).padStart(2,'0');
  const mi = String(now.getMinutes()).padStart(2,'0');
  return `${prefix}_${dd}_${mm}_${aa}_H${hh}-${mi}`;
}

// ========== EXPORTAÇÕES ==========
export async function exportarXLSX(rows=[]){
  try{
    // importa SheetJS em runtime (sem mexer no index.html)
    const XLSX = await import("https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js")
      .then(m => m.default || m);

    const aoa = rowsToAOA(rows);
    const ws  = XLSX.utils.aoa_to_sheet(aoa);

    // formata colunas numéricas (qtd, unit, sub, frete)
    const colNums = [4,6,7,10]; // 0-based
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; R++){
      colNums.forEach(C=>{
        const cell = ws[XLSX.utils.encode_cell({r:R,c:C})];
        if (!cell) return;
        const n = Number(cell.v || 0);
        cell.t = 'n';
        // duas casas decimais exceto quantidade
        cell.z = (C===4) ? "0.000" : "0.00";
        cell.v = n;
      });
    }

    ws['!cols'] = [
      { wch: 10 }, // data
      { wch: 6  }, // hora
      { wch: 28 }, // cliente
      { wch: 36 }, // produto
      { wch: 7  }, // qtd
      { wch: 5  }, // un
      { wch: 10 }, // unit
      { wch: 12 }, // subtotal
      { wch: 10 }, // tipo
      { wch: 14 }, // pagamento
      { wch: 12 }, // frete
      { wch: 10 }, // cupom
      { wch: 24 }, // id
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" });

    downloadBlob(`${timestampName("Relatorios")}.xlsx`,
                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                 ab);
  }catch(err){
    console.warn("Falhou XLSX; exportando CSV. Motivo:", err);
    const aoa = rowsToAOA(rows);
    const csv = aoaToCSV(aoa);
    downloadBlob(`${timestampName("Relatorios")}.csv`, "text/csv;charset=utf-8", csv);
    alert("XLSX indisponível no momento. Exportei em CSV como alternativa.");
  }
}

// ====== PDF (igual ao que você já estava usando) ======
export function exportarPDF(rows = []){
  if (!jsPDF){ alert("Biblioteca PDF não carregada."); return; }

  // A4 paisagem
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;

  // Paleta
  const DARK = 60;
  const ROW1 = 245;
  const ROW2 = 232;

  // Tipografia
  const setBold = (sz)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(sz); };
  const setReg  = (sz)=>{ doc.setFont("helvetica","normal"); doc.setFontSize(sz); };

  // Cabeçalho
  setBold(12);
  doc.text("RELATÓRIO DE PEDIDOS", margin, y); setReg(9);
  const totalGeral = rows.reduce((s,r)=> s + (Array.isArray(r.itens) ? r.itens.reduce((a,it)=>a+subtotalItem(it),0) : 0), 0);
  doc.text(`Total de pedidos: ${rows.length}  •  Soma dos produtos: R$ ${moneyBR(totalGeral)}`, margin, y+6);
  y += 12;

  // Agrupar por cliente
  const byCliente = new Map();
  rows.forEach(r=>{
    const key = (r.cliente||"—").toString().toUpperCase();
    if (!byCliente.has(key)) byCliente.set(key, []);
    byCliente.get(key).push(r);
  });

  const col = {
    data: 24, hora: 16,
    prod: Math.max(80, pageW - margin*2 - (24+16+20+28+22+22)),
    qtd:  20, un: 22, val: 22, sub: 22
  };

  function ensureSpace(h){
    if (y + h > pageH - margin){ doc.addPage(); y = margin; }
  }
  function linhaForteCinza(x1,y1,x2){
    doc.setDrawColor(DARK); doc.setLineWidth(1.2);
    doc.line(x1, y1, x2, y1);
    doc.setLineWidth(0.2);
  }
  function headerCliente(nome){
    ensureSpace(12);
    setBold(11);
    doc.text(nome, margin, y+6);
    linhaForteCinza(margin, y+8.5, pageW - margin);
    y += 10;
  }
  function headerTabela(){
    ensureSpace(10);
    doc.setFillColor(DARK,DARK,DARK);
    doc.rect(margin, y, pageW - margin*2, 8, "F");
    setBold(8); doc.setTextColor(255,255,255);
    let x = margin + 2;
    doc.text("DATA", x, y+5); x += col.data;
    doc.text("HORA", x, y+5); x += col.hora;
    doc.text("PRODUTO", x, y+5); x += col.prod;
    doc.text("QTD", x, y+5); x += col.qtd;
    doc.text("UN", x, y+5); x += col.un;
    doc.text("R$ UNIT.", x, y+5); x += col.val;
    doc.text("SUBTOTAL", x, y+5);
    doc.setTextColor(0,0,0);
    y += 9;
  }
  function rowItem(i, it, r){
    const zebra = (i % 2 === 0) ? ROW1 : ROW2;
    const h = 7; ensureSpace(h);
    doc.setFillColor(zebra,zebra,zebra);
    doc.rect(margin, y, pageW - margin*2, h, "F");

    setReg(8);
    const desc = String(it.descricao || it.produto || "").toUpperCase();
    const qtd  = Number(it.qtd ?? it.quantidade ?? 0);
    const un   = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
    const pu   = Number(it.precoUnit ?? it.preco ?? 0);
    const sub  = (typeof it.subtotal === "number") ? Number(it.subtotal) : subtotalItem(it);

    let x = margin + 2;
    doc.text(toBRDate(r.dataEntregaISO||""), x, y+4); x += col.data;
    doc.text(String(r.horaEntrega||""), x, y+4); x += col.hora;

    const maxW = col.prod - 2;
    const lines = doc.splitTextToSize(desc, maxW);
    doc.text(lines[0] || "", x, y+4);
    x += col.prod;

    doc.text(String(qtd), x, y+4); x += col.qtd;
    doc.text(un, x, y+4); x += col.un;
    doc.text(moneyBR(pu), x, y+4, { align:"right" }); x += col.val;
    doc.text(moneyBR(sub), x, y+4, { align:"right" });

    y += h;
  }
  function footerCliente(totalCliente){
    ensureSpace(10);
    setBold(9);
    doc.text("SOMA DOS PRODUTOS DO CLIENTE:", pageW - margin - 90, y+5);
    doc.text(`R$ ${moneyBR(totalCliente)}`, pageW - margin, y+5, { align:"right" });
    y += 8;
  }

  for (const [cliente, pedidos] of byCliente.entries()){
    headerCliente(cliente);
    headerTabela();
    let somaCliente = 0;
    pedidos.forEach((r)=>{
      const itens = Array.isArray(r.itens) ? r.itens : [];
      itens.forEach((it, idx)=>{ somaCliente += subtotalItem(it); rowItem(idx, it, r); });
    });
    footerCliente(somaCliente);
    y += 2;
  }

  doc.save(`${timestampName("Relatorio")}.pdf`);
}