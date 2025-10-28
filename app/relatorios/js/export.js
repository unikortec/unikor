// relatorios/js/export.js
// Exporta LISTA => CSV em padrão BR (separador ';' e decimal com vírgula).
// PDF paisagem permanece igual (jsPDF).

const { jsPDF } = window.jspdf || {};

// ===== Helpers comuns =====
const toBRDate = (iso)=> (iso ? iso.split("-").reverse().join("/") : "");

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
        String(it.descricao || it.produto || "").replace(/\r?\n/g, " "),
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

// ====== Formatação BR para CSV ======
function fmtQtdBR(n){ // 0,000
  const v = Number(n||0);
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function fmtMoneyBR(n){ // 0.000,00
  const v = Number(n||0);
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function aoaToCSV_BR(aoa){
  // colunas: Data(0) Hora(1) Cliente(2) Produto(3) Qtd(4) Un(5) Unit(6) Sub(7) Tipo(8) Pag(9) Frete(10) Cupom(11) ID(12)
  const COL_QTD   = 4;
  const COL_UNIT  = 6;
  const COL_SUB   = 7;
  const COL_FRETE = 10;

  return aoa.map((row, rIdx) =>
    row.map((v, cIdx) => {
      let s = v;
      if (rIdx > 0) {
        if (cIdx === COL_QTD)   s = fmtQtdBR(v);
        else if (cIdx === COL_UNIT)  s = fmtMoneyBR(v);
        else if (cIdx === COL_SUB)   s = fmtMoneyBR(v);
        else if (cIdx === COL_FRETE) s = fmtMoneyBR(v);
        else s = String(v ?? "");
      } else {
        s = String(v ?? "");
      }
      // Escapa se tiver ; " ou quebra de linha
      const mustQuote = /[;"\n]/.test(s);
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
// Mantemos o nome exportarXLSX porque app.js chama essa função,
// mas aqui geramos CSV direto (XLSX indisponível no ambiente atual).
export async function exportarXLSX(rows=[]){
  const aoa = rowsToAOA(rows);
  const csv = aoaToCSV_BR(aoa);
  downloadBlob(`${timestampName("Relatorios")}.csv`, "text/csv;charset=utf-8", csv);
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
  const totalGeral = rows.reduce((s,r)=> s + (Array.isArray(r.itens) ? r.itens.reduce((a,it)=>a+(
    (typeof it.subtotal === "number") ? Number(it.subtotal||0)
    : (()=>{
        const qtd = Number(it.qtd ?? it.quantidade ?? 0);
        const un  = (it.un || it.unidade || it.tipo || "UN").toString().toUpperCase();
        const pu  = Number(it.precoUnit ?? it.preco ?? 0);
        if (un === "UN"){
          const kgUn = kgPorUnFromDesc(it.descricao || it.produto || "");
          return kgUn > 0 ? (qtd * kgUn) * pu : (qtd * pu);
        }
        return qtd * pu;
      })()
  ),0) : 0), 0);
  doc.text(`Total de pedidos: ${rows.length}  •  Soma dos produtos: R$ ${fmtMoneyBR(totalGeral)}`, margin, y+6);
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
    doc.text(fmtMoneyBR(pu), x, y+4, { align:"right" }); x += col.val;
    doc.text(fmtMoneyBR(sub), x, y+4, { align:"right" });

    y += h;
  }
  function footerCliente(totalCliente){
    ensureSpace(10);
    setBold(9);
    doc.text("SOMA DOS PRODUTOS DO CLIENTE:", pageW - margin - 90, y+5);
    doc.text(`R$ ${fmtMoneyBR(totalCliente)}`, pageW - margin, y+5, { align:"right" });
    y += 8;
  }

  for (const [cliente, pedidos] of byCliente.entries()){
    headerCliente(cliente);
    headerTabela();
    let somaCliente = 0;
    pedidos.forEach((r)=>{
      const itens = Array.isArray(r.itens) ? r.itens : [];
      itens.forEach((it, idx)=>{ somaCliente += (typeof it.subtotal === "number") ? Number(it.subtotal||0) : subtotalItem(it); rowItem(idx, it, r); });
    });
    footerCliente(somaCliente);
    y += 2;
  }

  doc.save(`${timestampName("Relatorio")}.pdf`);
}